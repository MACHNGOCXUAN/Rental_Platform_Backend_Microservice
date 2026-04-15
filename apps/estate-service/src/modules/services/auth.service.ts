import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HashService } from 'src/common/services/hash.service';
import { DatabaseService } from 'src/common/services/database.service';
import { AuthLoginDto } from '../dtos/auth.login.dto';
import { AuthResponseDto } from '../dtos/auth.response.dto';
import { AuthSignupDto, AuthSignupUpdateDto } from '../dtos/auth.signup.dto';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from 'src/modules/dtos/user.response.dto';
import { UserService } from './user.service';
import { IAuthPayload, ITokenResponse, TokenType } from '../interfaces/auth.interface';
import { OtpService } from './otp.service';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class AuthService {
    private readonly accessTokenSecret: string;
    private readonly refreshTokenSecret: string;
    private readonly accessTokenExp: number;
    private readonly refreshTokenExp: number;

    constructor(
        private readonly configService: ConfigService,
        private readonly jwtService: JwtService,
        private readonly hashService: HashService,
        private readonly userAuthService: UserService,
        private readonly otpService: OtpService,
        private readonly databaseService: DatabaseService,
        @Inject('CONTRACT_SERVICE')
        private readonly rabbitClient: ClientProxy,
        @Inject('RABBITMQ_SERVICE')
        private readonly notificationClient: ClientProxy,
    ) {
        this.accessTokenSecret = this.configService.get<string>('auth.accessToken.secret') ?? '';
        this.refreshTokenSecret = this.configService.get<string>('auth.refreshToken.secret') ?? '';
        this.accessTokenExp =
            Number(this.configService.get<string>('auth.accessToken.expirationTime'));
        this.refreshTokenExp =
            Number(this.configService.get<string>('auth.refreshToken.expirationTime'));
    }

    private async generateUniqueFullName(): Promise<string> {
        let fullName = '';
        let isExist = true;

        while (isExist) {
            const randomNumber = Math.floor(1000000 + Math.random() * 9000000); // 7 số
            fullName = `user${randomNumber}`;

            const existing = await this.databaseService.user.findFirst({
                where: { fullName },
                select: { id: true },
            });

            isExist = !!existing;
        }

        return fullName;
    }

    async verifyToken(accessToken: string): Promise<IAuthPayload> {
        return await this.jwtService.verifyAsync<IAuthPayload>(accessToken, {
            secret: this.accessTokenSecret,
        });
    }

    async generateTokens(user: IAuthPayload): Promise<ITokenResponse> {
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(
                { id: user.id, role: user.role, tokenType: TokenType.ACCESS_TOKEN },
                { secret: this.accessTokenSecret, expiresIn: this.accessTokenExp },
            ),
            this.jwtService.signAsync(
                { id: user.id, role: user.role, tokenType: TokenType.REFRESH_TOKEN },
                { secret: this.refreshTokenSecret, expiresIn: this.refreshTokenExp },
            ),
        ]);

        return { accessToken, refreshToken };
    }

    async loginAdmin(data: AuthLoginDto): Promise<AuthResponseDto> {
        const { phone, password } = data;
        const user = await this.userAuthService.getUserProfileByPhone(phone);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.role !== 'admin') {
            throw new NotFoundException('User is not admin');
        }

        if (!user.passwordHash) {
            throw new NotFoundException('Invalid password');
        }

        this.ensureAccountNotBanned(user);

        const isPasswordValid = this.hashService.match(user.passwordHash, password);
        if (!isPasswordValid) {
            throw new NotFoundException('Invalid password');
        }

        const tokens = await this.generateTokens({ id: user.id, role: user.role });

        return { ...tokens, user };
    }

    /**
     * Login for regular users with phone and password
     */
    async loginUser(data: AuthLoginDto): Promise<AuthResponseDto> {
        const { phone, password } = data;
        const user = await this.userAuthService.getUserProfileByPhone(phone);

        if (!user) {
            throw new NotFoundException('Số điện thoại không tồn tại');
        }

        if (!user.passwordHash) {
            throw new BadRequestException('Tài khoản này chưa đặt mật khẩu. Vui lòng đăng nhập bằng Google hoặc đặt lại mật khẩu.');
        }

        this.ensureAccountNotBanned(user);

        const isPasswordValid = this.hashService.match(user.passwordHash, password);
        if (!isPasswordValid) {
            throw new BadRequestException('Mật khẩu không đúng');
        }

        const tokens = await this.generateTokens({ id: user.id, role: user.role });

        return {
            ...tokens,
            user: plainToInstance(UserResponseDto, user),
        };
    }


    async signup(data: AuthSignupDto): Promise<AuthResponseDto> {
        const { email, password, fullName, phone, role } = data;

        // 1. Check existing user
        const existingUser = await this.userAuthService.getUserProfileByEmail(email);
        if (existingUser) {
            throw new ConflictException('User already exists with this email');
        }

        // 2. Hash password
        const hashedPassword = this.hashService.createHash(password);

        // 3. Create user
        const createdUser = await this.userAuthService.createUser({
            email,
            fullName,
            password: hashedPassword,
            phone,
            role
        });

        if (!createdUser) {
            throw new Error('Failed to create user');
        }

        // 4. Generate tokens
        const tokens = await this.generateTokens({
            id: createdUser.id,
            role: createdUser.role,
        });

        // 5. Return response
        return {
            ...tokens,
            user: plainToInstance(UserResponseDto, createdUser),
        };
    }

    getProfile(userId: string): Promise<UserResponseDto | null> {
        return this.userAuthService.getProfileById(userId);
    }

    updateProfile(userId: string, data: Partial<UserResponseDto>): Promise<UserResponseDto> {
        return this.userAuthService.updateUserProfile(userId, data);
    }


    async validateToken(token: string) {
        if (!token) {
            return { success: false, payload: null };
        }

        try {
            const payload = await this.verifyToken(token);
            const user = await this.userAuthService.getProfileById(payload.id);

            if (!user || this.isActiveBan(user)) {
                return { success: false, payload: null };
            }

            return {
                success: true,
                payload: {
                    id: payload.id,
                    role: payload.role,
                },
            };
        } catch {
            return { success: false, payload: null };
        }
    }
    async loginWithGoogle(googleUser: {
        email: string;
        fullName: string;
        avatarUrl?: string;
    }): Promise<AuthResponseDto> {

        // 1. Tìm user theo email
        let user = await this.userAuthService.getUserProfileByEmail(googleUser.email);
        let isNewUser = false;

        // 2. Nếu chưa có → tạo user mới
        if (!user) {
            user = await this.userAuthService.createUser({
                email: googleUser.email,
                fullName: googleUser.fullName,
                avatarUrl: googleUser.avatarUrl,
                password: null, // Google login không cần password
                role: 'user',
                isEmailVerified: true,
            });
            isNewUser = true;
        }

        // 3. Generate JWT
        this.ensureAccountNotBanned(user);

        const tokens = await this.generateTokens({
            id: user.id,
            role: user.role,
        });

        // Chỉ tạo wallet khi user mới được tạo
        if (isNewUser) {
            this.rabbitClient.emit('user.created', {
                userId: user.id
            });
        }

        // 4. Trả response
        return {
            ...tokens,
            user: plainToInstance(UserResponseDto, user),
        };
    }

    async loginWithFacebook(facebookUser: {
        facebookId: string;
        email: string | null;
        fullName: string;
        avatarUrl?: string;
    }): Promise<AuthResponseDto> {
        // 1. Ưu tiên tìm theo social account trước
        const social = await this.databaseService.socialAccount.findUnique({
            where: {
                provider_providerId: {
                    provider: 'facebook',
                    providerId: facebookUser.facebookId,
                },
            },
            include: { user: true },
        });

        let user = social?.user ?? null;
        let isNewUser = false;

        // 2. Nếu chưa có social account, thử map theo email (nếu Facebook trả email)
        if (!user && facebookUser.email) {
            user = await this.userAuthService.getUserProfileByEmail(facebookUser.email);
        }
        // Truncate avatarUrl nếu quá dài (giới hạn 500 ký tự)
        const avatarUrl = facebookUser.avatarUrl && facebookUser.avatarUrl.length <= 500
            ? facebookUser.avatarUrl
            : undefined;

        // 3. Nếu vẫn chưa có user thì tạo mới
        if (!user) {
            user = await this.userAuthService.createUser({
                fullName: facebookUser.fullName,
                avatarUrl: facebookUser.avatarUrl,
                email: facebookUser.email ?? null,
                password: null,
                role: 'user',
                isEmailVerified: !!facebookUser.email,
            });
            isNewUser = true;
        }

        // 4. Đồng bộ social account vào DB
        await this.databaseService.socialAccount.upsert({
            where: {
                provider_providerId: {
                    provider: 'facebook',
                    providerId: facebookUser.facebookId,
                },
            },
            create: {
                userId: user.id,
                provider: 'facebook',
                providerId: facebookUser.facebookId,
                email: facebookUser.email,
            },
            update: {
                userId: user.id,
                email: facebookUser.email,
            },
        });

        // 5. Đồng bộ email từ Facebook vào user hiện có nếu trước đó chưa có email
        if (facebookUser.email && !user.email) {
            user = await this.userAuthService.updateEmailAndMarkVerified(user.id, facebookUser.email);
        }

        // 6. Nếu có email từ Facebook và tài khoản chưa xác thực thì đánh dấu đã xác thực
        if (facebookUser.email && !user.isEmailVerified) {
            user = await this.userAuthService.markEmailVerified(user.id);
        }

        // 7. Check ban
        this.ensureAccountNotBanned(user);

        // 8. Generate token
        const tokens = await this.generateTokens({
            id: user.id,
            role: user.role,
        });

        // Chỉ tạo wallet khi user mới được tạo
        if (isNewUser) {
            this.rabbitClient.emit('user.created', {
                userId: user.id
            });
        }

        // 4. Trả response
        return {
            ...tokens,
            user: plainToInstance(UserResponseDto, user),
            requireEmailUpdate: !user.email
        };
    }

    async requestEmailVerificationOtp(userId: string, email?: string): Promise<{ message: string; devOtp?: string }> {
        const user = await this.userAuthService.getProfileById(userId);
        if (!user) {
            throw new NotFoundException('Người dùng không tồn tại');
        }

        const normalizedEmail = email?.trim().toLowerCase();
        const targetEmail = normalizedEmail || user.email;

        if (!targetEmail) {
            throw new BadRequestException('Tài khoản chưa có email để xác thực');
        }

        const existingUser = await this.userAuthService.getUserProfileByEmail(targetEmail);
        if (existingUser && existingUser.id !== userId) {
            throw new ConflictException('Email này đã được sử dụng');
        }

        const result = await this.otpService.requestEmailOtp(targetEmail);

        // Gửi email OTP thật qua notification-service
        this.notificationClient.emit('email.otp.send', {
            to: targetEmail,
            userName: user.fullName || '',
            otp: result._otp,
        });

        // Không trả _otp ra client
        const { _otp, ...clientResult } = result;
        return clientResult;
    }

    async verifyEmailVerificationOtp(userId: string, otp: string, email?: string): Promise<UserResponseDto> {
        const user = await this.userAuthService.getProfileById(userId);
        if (!user) {
            throw new NotFoundException('Người dùng không tồn tại');
        }

        const normalizedEmail = email?.trim().toLowerCase();
        const targetEmail = normalizedEmail || user.email;

        if (!targetEmail) {
            throw new BadRequestException('Tài khoản chưa có email để xác thực');
        }

        await this.otpService.verifyEmailOtp(targetEmail, otp);

        if (targetEmail !== user.email) {
            const existingUser = await this.userAuthService.getUserProfileByEmail(targetEmail);
            if (existingUser && existingUser.id !== userId) {
                throw new ConflictException('Email này đã được sử dụng');
            }

            return this.userAuthService.updateEmailAndMarkVerified(userId, targetEmail);
        }

        return this.userAuthService.markEmailVerified(userId);
    }

    async verifyPhoneUpdateOtp(userId: string | undefined, phone: string, otp: string) {
        await this.otpService.verifyOtp(phone, otp);

        // Nếu có userId (đang login) → cập nhật phone + phoneVerified trong DB
        if (userId) {
            await this.databaseService.user.update({
                where: { id: userId },
                data: {
                    phone,
                    phoneVerified: true,
                },
            });
        }

        return { verified: true };
    }

    /**
     * Step 1: Request OTP for phone signup
     * Gửi OTP đến số điện thoại để đăng ký
     */
    async requestPhoneSignupOtp(phone: string): Promise<{ message: string }> {
        // Kiểm tra số điện thoại đã tồn tại chưa
        const existingUser = await this.userAuthService.getUserProfileByPhone(phone);
        if (existingUser) {
            throw new ConflictException('Số điện thoại đã được đăng ký');
        }

        // Gửi OTP
        return this.otpService.requestOtp(phone);
    }

    /**
     * Step 2: Verify OTP and complete phone signup
     * Xác thực OTP và hoàn tất đăng ký
     */
    async signupWithPhone(data: {
        phone: string;
        otp: string;
        password: string;
    }): Promise<AuthResponseDto> {
        const { phone, otp, password } = data;

        // 1. Verify OTP
        await this.otpService.verifyOtp(phone, otp);

        // 2. Kiểm tra lại số điện thoại (phòng trường hợp race condition)
        const existingUser = await this.userAuthService.getUserProfileByPhone(phone);
        if (existingUser) {
            throw new ConflictException('Số điện thoại đã được đăng ký');
        }

        const defaultFullName = await this.generateUniqueFullName();

        // 4. Hash password
        const hashedPassword = this.hashService.createHash(password);

        // 5. Tạo user
        const createdUser = await this.userAuthService.createUser({
            phone,
            fullName: defaultFullName,
            password: hashedPassword,
            email: null,
            role: 'user',
            isEmailVerified: false,
            phoneVerified: true,
        });

        if (!createdUser) {
            throw new BadRequestException('Không thể tạo tài khoản');
        }

        // 6. Generate tokens
        const tokens = await this.generateTokens({
            id: createdUser.id,
            role: createdUser.role,
        });

        this.rabbitClient.emit('user.created', {
            userId: createdUser.id
        });

        // 7. Return response
        return {
            ...tokens,
            user: plainToInstance(UserResponseDto, createdUser),
        };
    }

    private authCodes = new Map<string, { data: AuthResponseDto; expiresAt: number }>();

    generateAuthCode(data: AuthResponseDto): string {
        const code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        this.authCodes.set(code, {
            data,
            expiresAt: Date.now() + 60 * 1000,
        });
        return code;
    }

    async exchangeAuthCode(code: string): Promise<AuthResponseDto> {
        const entry = this.authCodes.get(code);
        if (!entry) {
            throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
        }

        if (Date.now() > entry.expiresAt) {
            this.authCodes.delete(code);
            throw new BadRequestException('Mã xác thực đã hết hạn');
        }

        this.authCodes.delete(code);
        return entry.data;
    }

    async signupWithPhoneUpdate(data: AuthSignupUpdateDto): Promise<AuthResponseDto> {
        const { phone, password, fullName } = data;

        const existingUser = await this.userAuthService.getUserProfileByPhone(phone);
        if (existingUser) {
            throw new ConflictException('Số điện thoại đã được đăng ký');
        }

        const hashedPassword = this.hashService.createHash(password);

        const createdUser = await this.userAuthService.createUser({
            phone,
            fullName,
            password: hashedPassword,
            email: null,
            role: 'user',
            isEmailVerified: false,
            phoneVerified: true,
        });

        if (!createdUser) {
            throw new BadRequestException('Không thể tạo tài khoản');
        }

        const tokens = await this.generateTokens({
            id: createdUser.id,
            role: createdUser.role,
        });

        return {
            ...tokens,
            user: plainToInstance(UserResponseDto, createdUser),
        };
    }

    /**
     * Quên mật khẩu - Bước 1: Gửi OTP đến SĐT
     */
    async requestForgotPasswordOtp(phone: string): Promise<{ message: string }> {
        const user = await this.userAuthService.getUserProfileByPhone(phone);
        if (!user) {
            throw new NotFoundException('Số điện thoại chưa được đăng ký');
        }
        if (!user.passwordHash) {
            throw new BadRequestException('Tài khoản này đăng nhập qua mạng xã hội, không thể đặt lại mật khẩu.');
        }
        return this.otpService.requestOtp(phone);
    }

    /**
     * Quên mật khẩu - Bước 2: Xác thực OTP + đặt mật khẩu mới
     */
    async resetPasswordWithOtp(phone: string, otp: string, newPassword: string): Promise<{ message: string }> {
        await this.otpService.verifyOtp(phone, otp);

        const user = await this.userAuthService.getUserProfileByPhone(phone);
        if (!user) {
            throw new NotFoundException('Số điện thoại chưa được đăng ký');
        }

        const hashedNewPassword = this.hashService.createHash(newPassword);
        await this.userAuthService.updatePassword(user.id, hashedNewPassword);

        return { message: 'Đặt lại mật khẩu thành công' };
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
        const user = await this.userAuthService.getProfileById(userId);
        if (!user) {
            throw new NotFoundException('Người dùng không tồn tại');
        }

        if (!user.passwordHash) {
            throw new BadRequestException('Tài khoản này đăng nhập qua mạng xã hội, không thể đổi mật khẩu tại đây.');
        }

        const isPasswordValid = this.hashService.match(user.passwordHash, currentPassword);
        if (!isPasswordValid) {
            throw new BadRequestException('Mật khẩu hiện tại không đúng');
        }

        const hashedNewPassword = this.hashService.createHash(newPassword);
        await this.userAuthService.updatePassword(userId, hashedNewPassword);

        return { message: 'Đổi mật khẩu thành công' };
    }

    private ensureAccountNotBanned(user: {
        isBanned?: boolean;
        bannedUntil?: Date | null;
    }): void {
        if (!this.isActiveBan(user)) {
            return;
        }

        throw new BadRequestException('Tài khoản đã bị khóa và không thể đăng nhập');
    }

    private isActiveBan(user: {
        isBanned?: boolean;
        bannedUntil?: Date | null;
    }): boolean {
        if (!user?.isBanned) {
            return false;
        }

        if (!user.bannedUntil) {
            return true;
        }

        return new Date(user.bannedUntil).getTime() > Date.now();
    }

}

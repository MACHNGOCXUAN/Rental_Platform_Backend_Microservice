import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HashService } from 'src/common/services/hash.service';
import { AuthLoginDto } from '../dtos/auth.login.dto';
import { AuthResponseDto } from '../dtos/auth.response.dto';
import { AuthSignupDto } from '../dtos/auth.signup.dto';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from 'src/modules/dtos/user.response.dto';
import { UserService } from './user.service';
import { IAuthPayload, ITokenResponse, TokenType } from '../interfaces/auth.interface';

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
    ) {
        this.accessTokenSecret = this.configService.get<string>('auth.accessToken.secret') ?? '';
        this.refreshTokenSecret = this.configService.get<string>('auth.refreshToken.secret') ?? '';
        this.accessTokenExp =
            Number(this.configService.get<string>('auth.accessToken.expirationTime'));
        this.refreshTokenExp =
            Number(this.configService.get<string>('auth.refreshToken.expirationTime'));
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

        const isPasswordValid = this.hashService.match(user.passwordHash, password);
        if (!isPasswordValid) {
            throw new NotFoundException('Invalid password');
        }

        const tokens = await this.generateTokens({ id: user.id, role: user.role });

        return { ...tokens, user };
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


    async validateToken(token: string) {
        if (!token) {
            return { success: false, payload: null };
        }

        try {
            const user = await this.verifyToken(token);
            return {
                success: true,
                payload: {
                    id: user.id,
                    role: user.role,
                },
            };
        } catch {
            return { success: false, payload: null };
        }
    }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import * as express from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthLoginDto } from '../dtos/auth.login.dto';
import {
  AuthRefreshResponseDto,
  AuthResponseDto,
} from '../dtos/auth.response.dto';
import {
  AuthSignupDto,
  AuthSignupUpdateDto,
  VerifyOtpDto,
} from '../dtos/auth.signup.dto';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import { AuthJwtRefreshGuard } from 'src/common/guards/jwt.refresh.guard';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthPayload } from '../interfaces/auth.interface';
import { AuthService } from '../services/auth.service';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';
import { OtpService } from '../services/otp.service';
import { FacebookAuthGuard } from 'src/common/guards/facebook-auth.guard';
import { CloudinaryService } from '../services/cloudinary.service';
import { UserService } from '../services/user.service';
import { UserResponseDto } from '../dtos/user.response.dto';

type GoogleOAuthUser = {
  email: string;
  fullName: string;
  avatarUrl?: string;
};

type FacebookOAuthUser = {
  facebookId: string;
  email: string | null;
  fullName: string;
  avatarUrl?: string;
};

type OAuthRequest<TUser> = express.Request & { user: TUser };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly userService: UserService,
  ) {}

  @PublicRoute()
  @Post('admin/login')
  @MessageKey('Đăng nhập thành công!', AuthResponseDto)
  login(@Body() payload: AuthLoginDto): Promise<AuthResponseDto> {
    return this.authService.loginAdmin(payload);
  }

  @PublicRoute()
  @Post('user/login')
  @MessageKey('Đăng nhập thành công!', AuthResponseDto)
  loginUser(@Body() payload: AuthLoginDto): Promise<AuthResponseDto> {
    return this.authService.loginUser(payload);
  }

  @PublicRoute()
  @Post('signup')
  @MessageKey('Đăng ký thành công!', AuthResponseDto)
  signup(@Body() payload: AuthSignupDto): Promise<AuthResponseDto> {
    return this.authService.signup(payload);
  }

  @UseGuards(AuthJwtRefreshGuard)
  @PublicRoute()
  @Get('refresh')
  @MessageKey('Làm mới token thành công!', AuthRefreshResponseDto)
  refreshTokens(
    @AuthUser() user: IAuthPayload,
  ): Promise<AuthRefreshResponseDto> {
    return this.authService.generateTokens(user);
  }

  @Get('profile')
  getProfile(@AuthUser() user: IAuthPayload) {
    return this.authService.getProfile(user.id);
  }

  @Put('profile')
  @MessageKey('Cập nhật thông tin thành công!')
  updateProfile(
    @AuthUser() user: IAuthPayload,
    @Body() data: Partial<UserResponseDto>,
  ) {
    return this.authService.updateProfile(user.id, data);
  }

  @Put('avatar')
  @MessageKey('Cập nhật ảnh đại diện thành công!')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async updateAvatar(
    @AuthUser() user: IAuthPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ định dạng JPEG, PNG, WEBP');
    }

    try {
      const result = await this.cloudinaryService.uploadImage(file);
      const updated = await this.userService.updateAvatar(
        user.id,
        result.secureUrl,
      );
      return { avatarUrl: updated.avatarUrl };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể tải ảnh đại diện';
      throw new BadRequestException(
        `Không thể cập nhật ảnh đại diện: ${message}`,
      );
    }
  }

  @PublicRoute()
  @Post('validate-token')
  async validateToken(@Body('token') token: string) {
    return this.authService.validateToken(token);
  }

  @Get('google')
  @PublicRoute()
  @UseGuards(GoogleAuthGuard)
  async googleLogin() {
    // Redirect sang Google
  }

  @PublicRoute()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: OAuthRequest<GoogleOAuthUser>,
    @Res() res: express.Response,
  ) {
    const result = await this.authService.loginWithGoogle(req.user);

    // Generate short-lived code
    const code = this.authService.generateAuthCode(result);

    // Redirect to frontend with code only
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = new URL('/home', frontendUrl);
    redirectUrl.searchParams.set('code', code);

    return res.redirect(redirectUrl.toString());
  }

  @PublicRoute()
  @Post('google/exchange')
  @MessageKey('Trao đổi mã xác thực thành công!', AuthResponseDto)
  async googleExchange(@Body('code') code: string): Promise<AuthResponseDto> {
    return this.authService.exchangeAuthCode(code);
  }

  // ==================== FACEBOOK OAUTH ====================
  @Get('facebook')
  @PublicRoute()
  @UseGuards(FacebookAuthGuard)
  async facebookLogin() {
    // Redirect sang Facebook
  }

  @PublicRoute()
  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  async facebookCallback(
    @Req() req: OAuthRequest<FacebookOAuthUser>,
    @Res() res: express.Response,
  ) {
    const result = await this.authService.loginWithFacebook(req.user);

    // Generate short-lived code
    const code = this.authService.generateAuthCode(result);

    // Redirect to frontend with code only
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = new URL('/home', frontendUrl);
    redirectUrl.searchParams.set('code', code);

    return res.redirect(redirectUrl.toString());
  }

  @PublicRoute()
  @Post('facebook/exchange')
  @MessageKey('Trao đổi mã xác thực thành công!', AuthResponseDto)
  async facebookExchange(@Body('code') code: string): Promise<AuthResponseDto> {
    return this.authService.exchangeAuthCode(code);
  }

  @PublicRoute()
  @Post('otp/request')
  requestOtp(@Body('phone') phone: string) {
    return this.otpService.requestOtp(phone);
  }

  @PublicRoute()
  @Post('otp/verify')
  verifyOtp(@Body('phone') phone: string, @Body('otp') otp: string) {
    return this.otpService.verifyOtp(phone, otp);
  }

  // ==================== PHONE SIGNUP FLOW ====================

  /**
   * Step 1: Request OTP for phone signup
   * POST /auth/phone/request-otp
   * Body: { phone: string }
   */
  @PublicRoute()
  @Post('phone/request-otp')
  @MessageKey('OTP đã được gửi đến số điện thoại của bạn')
  requestPhoneSignupOtp(@Body('phone') phone: string) {
    return this.authService.requestPhoneSignupOtp(phone);
  }

  /**
   * Step 2: Verify OTP and complete signup with password
   * POST /auth/phone/signup
   * Body: { phone: string, otp: string, password: string }
   */
  @PublicRoute()
  @Post('phone/signup')
  @MessageKey('Đăng ký thành công!', AuthResponseDto)
  signupWithPhone(
    @Body('phone') phone: string,
    @Body('otp') otp: string,
    @Body('password') password: string,
  ): Promise<AuthResponseDto> {
    return this.authService.signupWithPhone({ phone, otp, password });
  }

  @PublicRoute()
  @Post('phone-update/signup')
  @MessageKey('Đăng ký thành công!', AuthResponseDto)
  signupWithPhoneUpdate(
    @Body() dto: AuthSignupUpdateDto,
  ): Promise<AuthResponseDto> {
    return this.authService.signupWithPhoneUpdate(dto);
  }

  @Post('otp/verify-phone')
  @MessageKey('Xác thực OTP thành công!')
  verifyUpdateOtp(
    @AuthUser() user: IAuthPayload,
    @Body() dto: VerifyOtpDto,
  ) {
    return this.authService.verifyPhoneUpdateOtp(user?.id, dto.phone, dto.otp);
  }

  @Post('email/request-otp')
  @MessageKey('Đã gửi OTP xác thực email')
  requestEmailVerificationOtp(
    @AuthUser() user: IAuthPayload,
    @Body('email') email?: string,
  ) {
    return this.authService.requestEmailVerificationOtp(user.id, email);
  }

  @Post('email/verify')
  @MessageKey('Xác thực email thành công')
  verifyEmailVerificationOtp(
    @AuthUser() user: IAuthPayload,
    @Body('otp') otp?: string,
    @Body('email') email?: string,
  ) {
    if (!otp) {
      throw new BadRequestException('OTP là bắt buộc');
    }

    return this.authService.verifyEmailVerificationOtp(user.id, otp, email);
  }

  @Put('change-password')
  @MessageKey('Đổi mật khẩu thành công!')
  changePassword(
    @AuthUser() user: IAuthPayload,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.changePassword(
      user.id,
      currentPassword,
      newPassword,
    );
  }
}

import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { AuthLoginDto } from '../dtos/auth.login.dto';
import { AuthRefreshResponseDto, AuthResponseDto } from '../dtos/auth.response.dto';
import { AuthSignupDto } from '../dtos/auth.signup.dto';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import { AuthJwtRefreshGuard } from 'src/common/guards/jwt.refresh.guard';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthPayload } from '../interfaces/auth.interface';
import { AuthService } from '../services/auth.service';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import { OtpService } from '../services/otp.service';

@Controller('auth')
export class AuthController {

    constructor(
        private readonly authService: AuthService,
        private readonly otpService: OtpService,
    ) {}

    @PublicRoute()
    @Post('admin/login')
    @MessageKey("Đăng nhập thành công!", AuthResponseDto)
    login(@Body() payload: AuthLoginDto): Promise<AuthResponseDto> {
        return this.authService.loginAdmin(payload);
    }

    @PublicRoute()
    @Post('user/login')
    @MessageKey("Đăng nhập thành công!", AuthResponseDto)
    loginUser(@Body() payload: AuthLoginDto): Promise<AuthResponseDto> {
        return this.authService.loginUser(payload);
    }

    @PublicRoute()
    @Post('signup')
    @MessageKey("Đăng ký thành công!", AuthResponseDto)
    signup(@Body() payload: AuthSignupDto): Promise<AuthResponseDto> {
        return this.authService.signup(payload);
    }

    @UseGuards(AuthJwtRefreshGuard)
    @PublicRoute()
    @Get('refresh')
    @MessageKey('Làm mới token thành công!', AuthRefreshResponseDto)
    refreshTokens(@AuthUser() user: IAuthPayload): Promise<AuthRefreshResponseDto> {
        return this.authService.generateTokens(user);
    }

    @Get('profile')
    getProfile(@AuthUser() user: IAuthPayload) {
        return this.authService.getProfile(user.id);
    }

    @PublicRoute()
    @Post('validate-token')
    async validateToken(@Body('token') token: string) {
        return this.authService.validateToken(token)
    }
    @Get('google')
    @UseGuards(GoogleAuthGuard)
    async googleLogin() {
        // Redirect sang Google
    }

    @PublicRoute()
    @Get('google/callback')
    @UseGuards(GoogleAuthGuard)
    async googleCallback(@Req() req, @Res() res: express.Response) {
        const result = await this.authService.loginWithGoogle(req.user);
        
        // Redirect to frontend with tokens
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = new URL('/google/callback', frontendUrl);
        redirectUrl.searchParams.set('accessToken', result.accessToken);
        redirectUrl.searchParams.set('refreshToken', result.refreshToken);
        
        return res.redirect(redirectUrl.toString());
    }
    @PublicRoute()
    @Post('otp/request')
    requestOtp(@Body('phone') phone: string) {
        return this.otpService.requestOtp(phone);
    }

    @PublicRoute()
    @Post('otp/verify')
    verifyOtp(
    @Body('phone') phone: string,
    @Body('otp') otp: string,
    ) {
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

}
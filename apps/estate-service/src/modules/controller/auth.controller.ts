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

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) {}

    @PublicRoute()
    @Post('admin/login')
    @MessageKey("Đăng nhập thành công!", AuthResponseDto)
    login(@Body() payload: AuthLoginDto): Promise<AuthResponseDto> {
        return this.authService.loginAdmin(payload);
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
}
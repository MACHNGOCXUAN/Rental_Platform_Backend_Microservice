import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthLoginDto } from '../dtos/auth.login.dto';
import { AuthRefreshResponseDto, AuthResponseDto } from '../dtos/auth.response.dto';
import { AuthService } from '../services/auth.service';
import { AuthSignupDto } from '../dtos/auth.signup.dto';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import { AuthJwtRefreshGuard } from 'src/common/guards/jwt.refresh.guard';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthPayload } from '../interfaces/auth.interface';

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
}
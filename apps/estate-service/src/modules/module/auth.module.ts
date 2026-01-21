import { Module } from '@nestjs/common';
import { AuthController } from '../controller/auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from 'src/common/common.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from '../services/auth.service';
import { UserModule } from './user.module';
import { GoogleStrategy } from '../strategies/google.strategy';
import { OtpService } from '../services/otp.service';
import { EsmsService } from '../services/esms.service';
// import { SmsService } from '../services/esms.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('auth.accessToken.secret');
        const expiresIn = configService.get<number>('auth.accessToken.expirationTime');
        
        if (!secret) {
          throw new Error('JWT secret is not configured');
        }
        
        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
    PassportModule.register({ session: false }),
    UserModule,
    CommonModule
  ],
  providers: [AuthService, GoogleStrategy, OtpService, EsmsService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule]
})
export class AuthModule { }
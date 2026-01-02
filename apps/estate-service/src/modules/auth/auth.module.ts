import { Module } from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { AuthController } from './controller/auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';
import { PassportModule } from '@nestjs/passport';
import { CommonModule } from 'src/common/common.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule]
})
export class AuthModule { }
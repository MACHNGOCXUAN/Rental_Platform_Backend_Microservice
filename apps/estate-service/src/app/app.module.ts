import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from 'src/modules/auth/controller/auth.controller';
import { UserController } from 'src/modules/user/controller/user.controller';
import { AuthService } from 'src/modules/auth/services/auth.service';
import { UserService } from 'src/modules/user/services/user.service';
import { GrpcModule } from 'nestjs-grpc';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AuthModule } from 'src/modules/auth/auth.module';
import { UserModule } from 'src/modules/user/user.module';
import { CommonModule } from 'src/common/common.module';
import { AuthGrpcController } from './app.grpc.controller';

@Module({
  imports: [
    AuthModule,
    UserModule,
    CommonModule,
    GrpcModule.forProviderAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        protoPath: join(__dirname, '../protos/auth.proto'),
        package: configService.get<string>('grpc.package', 'auth'),
        url: configService.get<string>('grpc.url', '0.0.0.0:50051'),
        logging: {
          enabled: true,
          level: configService.get<string>('app.env') === 'development' ? 'debug' : 'log',
          context: 'AuthService',
          logErrors: true,
          logPerformance: configService.get<string>('app.env') === 'development',
          logDetails: configService.get<string>('app.env') === 'development',
        },
      }),
    }),
  ],
  controllers: [AppController, AuthController, UserController, AuthGrpcController],
  providers: [AppService, AuthService, UserService],
})
export class AppModule { }

import { Module } from '@nestjs/common';
import { GrpcAuthService } from './grpc.auth.service';
import { GrpcModule } from 'nestjs-grpc';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';

const protoPath = (() => {
  const distPath = join(process.cwd(), 'dist/src/protos/auth.proto');
  const srcPath = join(process.cwd(), 'src/protos/auth.proto');

  return existsSync(distPath) ? distPath : srcPath;
})();

@Module({
  imports: [
    ConfigModule,
    GrpcModule.forConsumerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        package: configService.get<string>('grpc.authPackage', 'auth'),
        protoPath,
        url: configService.get<string>('grpc.authUrl', '0.0.0.0:50051'),
        serviceName: 'AuthService',
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [GrpcAuthService],
  exports: [GrpcAuthService],
})
export class GrpcAuthModule {}

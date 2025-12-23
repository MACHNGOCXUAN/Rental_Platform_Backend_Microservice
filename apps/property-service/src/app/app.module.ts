import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CommonModule } from '../common/common.module';
import { AppService } from './app.service';
import { GrpcModule } from 'nestjs-grpc';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { PropertyController } from 'src/modules/controllers/property.controller';
import { PropertyService } from 'src/modules/services/property.service';

@Module({
  imports: [
    CommonModule,
    // GrpcModule.forProviderAsync({
    //   inject: [ConfigService],
    //   useFactory: (configService: ConfigService) => ({
    //     protoPath: join(__dirname, '../protos/auth.proto'),
    //     package: configService.get<string>('grpc.package', 'auth'),
    //     url: configService.get<string>('grpc.url', '0.0.0.0:50051'),
    //   }),
    // }),
  ],
  controllers: [AppController, PropertyController],
  providers: [AppService, PropertyService],
})
export class AppModule { }

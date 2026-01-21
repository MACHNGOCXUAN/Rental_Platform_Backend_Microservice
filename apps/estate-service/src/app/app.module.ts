import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from 'src/modules/controller/auth.controller';
import { UserController } from 'src/modules/controller/user.controller';
import { GrpcModule, GrpcOptions, GrpcLogLevel } from 'nestjs-grpc';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AuthModule } from 'src/modules/module/auth.module';
import { CommonModule } from 'src/common/common.module';
import { AuthGrpcController } from './app.grpc.controller';
import { PropertyService } from 'src/modules/services/property.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { UserModule } from 'src/modules/module/user.module';
import { AuthService } from 'src/modules/services/auth.service';
import { UserService } from 'src/modules/services/user.service';
import { PropertyController } from 'src/modules/controller/property.controller';
import Controller from 'src/modules/controller';
import Service from 'src/modules/services';

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
          level: (configService.get<string>('app.env') === 'development' ? 'debug' : 'log') as GrpcLogLevel,
          context: 'AuthService',
          logErrors: true,
          logPerformance: configService.get<string>('app.env') === 'development',
          logDetails: configService.get<string>('app.env') === 'development',
        },
      }),
    }),
    ClientsModule.registerAsync([{
        name: 'RABBITMQ_SERVICE',
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
            transport: Transport.RMQ,
            options: {
                urls: [config.get<string>('rabbitmq.url', 'amqp://localhost:5672')],
                queue: "notification_queue",
                prefetchCount: config.get<number>('rabbitmq.prefetch', 1),
                queueOptions: {
                    durable: true,
                },
            },
        }),
    }])
  ],
  controllers: [AppController, ...Controller],
  providers: [AppService, ...Service],
})
export class AppModule { }

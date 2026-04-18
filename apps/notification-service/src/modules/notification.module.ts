import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Service from './services';
import Controller from './controllers';
import { CommonModule } from 'src/common/common.module';
import { NotificationGateway } from './notification.gateway';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GrpcAuthModule } from 'src/services/grpc.auth.module';

@Module({
  imports: [
    CommonModule,
    ConfigModule,
    EventEmitterModule.forRoot(),
    GrpcAuthModule,
  ],
  controllers: [...Controller],
  providers: [...Service, NotificationGateway],
})
export class NotificationModule { }

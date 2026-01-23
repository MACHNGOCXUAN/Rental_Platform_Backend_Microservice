import { Module } from '@nestjs/common';
import Service from './services';
import Controller from './controllers';
import { CommonModule } from 'src/common/common.module';
import { NotificationGateway } from './notification.gateway';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    CommonModule,
    EventEmitterModule.forRoot()
  ],
  controllers: [...Controller],
  providers: [...Service, NotificationGateway],
})
export class NotificationModule { }

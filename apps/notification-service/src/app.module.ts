import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { NotificationModule } from './modules/notification.module';
import Controller from './modules/controllers';
import Service from './modules/services';

@Module({
  imports: [
    CommonModule,
    NotificationModule,
    // ClientsModule.registerAsync([{
    //   name: 'RABBITMQ_SERVICE',
    //   inject: [ConfigService],
    //   useFactory: (config: ConfigService) => ({
    //     transport: Transport.RMQ,
    //     options: {
    //       urls: [config.get<string>('rabbitmq.url', 'amqp://localhost:5672')],
    //       queue: config.get<string>('rabbitmq.queue', 'default_queue'),
    //       prefetchCount: config.get<number>('rabbitmq.prefetch', 1),
    //       queueOptions: {
    //         durable: true,
    //       },
    //     },
    //   }),
    // }])
  ],
  controllers: [AppController, ...Controller],
  providers: [AppService, ...Service],
})
export class AppModule { }

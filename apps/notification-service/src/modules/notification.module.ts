import { Module } from '@nestjs/common';
import Service from './services';
import Controller from './controllers';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [
    CommonModule,
  ],
  controllers: [...Controller],
  providers: [...Service],
})
export class NotificationModule { }

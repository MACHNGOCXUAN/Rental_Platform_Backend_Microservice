import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { ChatModule } from './modules/module';
import { ChatGateway } from './modules/chat.gateway';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [CommonModule, ChatModule, EventEmitterModule.forRoot()],
  controllers: [AppController],
  providers: [AppService, ChatGateway],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CommonModule } from '../common/common.module';
import { AppService } from './app.service';
import { PropertyController } from 'src/modules/controllers/property.controller';
import { PropertyService } from 'src/modules/services/property.service';

@Module({
  imports: [
    CommonModule
  ],
  controllers: [AppController, PropertyController],
  providers: [AppService, PropertyService],
})
export class AppModule { }

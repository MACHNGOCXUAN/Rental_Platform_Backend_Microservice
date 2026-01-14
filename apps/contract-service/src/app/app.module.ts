import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CommonModule } from '../common/common.module';
import { AppService } from './app.service';
import { ContractController } from 'src/modules/controllers/contract.controller';
import { ContractService } from 'src/modules/services/contract.service';

@Module({
  imports: [
    CommonModule
  ],
  controllers: [AppController, ContractController],
  providers: [AppService, ContractService],
})
export class AppModule { }

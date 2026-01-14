import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { ContractService } from '../services/contract.service';
import { ContractController } from '../controllers/contract.controller';

@Module({
  imports: [CommonModule],
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService]
})
export class ContractModule {}

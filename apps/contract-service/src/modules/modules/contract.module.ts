import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { ContractService } from '../services/contract.service';
import { ContractController } from '../controllers/contract.controller';
import { EstateClientService } from '../services/estate-client.service';

@Module({
  imports: [CommonModule],
  controllers: [ContractController],
  providers: [ContractService, EstateClientService],
  exports: [ContractService]
})
export class ContractModule {}

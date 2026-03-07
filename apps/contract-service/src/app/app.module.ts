import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CommonModule } from '../common/common.module';
import { AppService } from './app.service';
import { ContractController } from 'src/modules/controllers/contract.controller';
import { ContractService } from 'src/modules/services/contract.service';
import { RentalRequestController } from 'src/modules/controllers/rental-request.controller';
import { RentalRequestService } from 'src/modules/services/rental-request.service';
import { PaymentController } from 'src/modules/controllers/payment.controller';
import { PaymentService } from 'src/modules/services/payment.service';
import { TerminationController } from 'src/modules/controllers/termination.controller';
import { TerminationService } from 'src/modules/services/termination.service';

@Module({
  imports: [
    CommonModule
  ],
  controllers: [
    AppController,
    ContractController,
    RentalRequestController,
    PaymentController,
    TerminationController,
  ],
  providers: [
    AppService,
    ContractService,
    RentalRequestService,
    PaymentService,
    TerminationService,
  ],
})
export class AppModule { }

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
import { TemplateContractController } from 'src/modules/controllers/template-contract.controller';
import { TemplateContractService } from 'src/modules/services/template-contract.service';
import { EstateClientService } from 'src/modules/services/estate-client.service';
import { SmartCAController } from 'src/modules/controllers/smartca.controller';
import { SmartCAService } from 'src/modules/services/smartca.service';
import { WalletController } from 'src/modules/controllers/wallet.controller';
import { WalletService } from 'src/modules/services/wallet.service';
import { CronjobService } from 'src/modules/services/cronjob.service';
import { ReportController } from 'src/modules/controllers/report.controller';
import { ReportService } from 'src/modules/services/report.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    CommonModule,
    ClientsModule.registerAsync([{
      name: 'RABBITMQ_SERVICE',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: Transport.RMQ,
        options: {
          urls: [config.get<string>('rabbitmq.url', 'amqp://localhost:5672')],
          queue: 'notification_queue',
          prefetchCount: config.get<number>('rabbitmq.prefetch', 1),
          queueOptions: { durable: true },
        },
      }),
    }]),
  ],
  controllers: [
    AppController,
    ContractController,
    RentalRequestController,
    PaymentController,
    WalletController,
    TerminationController,
    ReportController,
    TemplateContractController,
    SmartCAController,
  ],
  providers: [
    AppService,
    ContractService,
    RentalRequestService,
    PaymentService,
    WalletService,
    TerminationService,
    ReportService,
    TemplateContractService,
    EstateClientService,
    SmartCAService,
    CronjobService,
  ],
})
export class AppModule { }

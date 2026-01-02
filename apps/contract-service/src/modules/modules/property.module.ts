import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PropertyController } from '../controllers/property.controller';
import { PropertyService } from '../services/property.service';

@Module({
  imports: [CommonModule],
  controllers: [PropertyController],
  providers: [PropertyService],
  exports: [PropertyService]
})
export class UserModule {}

import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { CONTROLLERS } from '../controllers';
import { SERVICES } from '../services';

@Module({
  imports: [CommonModule],
  controllers: [...CONTROLLERS],
  providers: [...SERVICES],
  exports: [...SERVICES]
})
export class ChatModule {}

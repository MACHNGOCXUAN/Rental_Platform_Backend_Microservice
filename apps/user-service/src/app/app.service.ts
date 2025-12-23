import { Injectable } from '@nestjs/common';
import { MessageKey } from 'src/common/decorators/message.decorator';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Mach Ngoc Xuan test';
  }
}

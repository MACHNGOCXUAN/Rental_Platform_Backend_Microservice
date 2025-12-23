import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PublicRoute } from 'src/common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @PublicRoute()
  getHello() {
    return this.appService.getHello();
  }
}

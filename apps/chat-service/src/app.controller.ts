import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PublicRoute } from './common/decorators/public.decorator';
import { AuthUser } from './common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from './common/interfaces/request.interface';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
   async getHello() {
    return await this.appService.getHello();
  }
}

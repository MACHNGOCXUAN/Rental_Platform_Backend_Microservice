import { Controller, Get, Inject } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { ClientProxy, EventPattern } from '@nestjs/microservices';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';

@Controller("/notification")
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService
) {}

  @Get()
  getNotification(@AuthUser() user: IAuthUserPayload) {
    console.log("jlkmlmlmlmlknkj: ", user);
    
    this.notificationService.getNotification(user.id)
  }

  
  @EventPattern('property.created')
  notificationCreateProperty(data: any) {
    console.log("ohojjlkl: ", data);
    
    return this.notificationService.createNotification(data)
  }
}

import { Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { ClientProxy, EventPattern } from '@nestjs/microservices';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';

@Controller("/notification")
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService
  ) { }

  @Get()
  getNotification(@AuthUser() user: IAuthUserPayload) {
    return this.notificationService.getNotification(user.id)
  }


  @EventPattern('property.created')
  notificationCreateProperty(data: any) {
    console.log("ohojjlkl: ", data);

    return this.notificationService.createNotification(data)
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id') id: string,
    @AuthUser() user: IAuthUserPayload,
  ) {
    return this.notificationService.markAsRead(
      user.id,
      id,
    );
  }

}

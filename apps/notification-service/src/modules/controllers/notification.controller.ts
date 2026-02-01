import { Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { ClientProxy, EventPattern } from '@nestjs/microservices';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { title } from 'process';

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

  @EventPattern("property.approved")
  notificationApprovedProperty(data: any) {

    const dataNew = {
      type: "ADMIN_ACTION",
      title: "Bất động sản đã được duyệt",
      body: "Bất động sản của bạn đã được admin phê duyệt.",
      receiverType: "USER",
      receiverId: data.landlordId,
      metadata: {
        event: 'ESTATE_APPROVED',
        propertyId: data.propertyId,
        status: data.status,
      }
    }

    return this.notificationService.addNotificationReceiver(dataNew);
  }

  @EventPattern("property.rejected")
  notificationRejectedProperty(data: any) {
    console.log("property.rejected: ", data);
    const dataNew = {
      type: "ADMIN_ACTION",
      title: "Bất động sản bị từ chối",
      body: `Bất động sản của bạn đã bị từ chối. Lý do: ${data.rejectionReason}`,
      receiverType: "USER",
      receiverId: data.landlordId,
      metadata: {
        event: 'ESTATE_REJECTED',
        propertyId: data.propertyId,
        status: data.status,
      }
    }
    return this.notificationService.addNotificationReceiver(dataNew);
  }
}
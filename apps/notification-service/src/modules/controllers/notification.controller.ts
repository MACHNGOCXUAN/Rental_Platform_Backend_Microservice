import { Controller, Delete, Get, Inject, Param, Patch } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { ClientProxy, EventPattern } from '@nestjs/microservices';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';

@Controller("/notification")
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
  ) { }

  @Get()
  getNotification(@AuthUser() user: IAuthUserPayload) {
    return this.notificationService.getNotification(user.id)
  }


  @EventPattern('property.created')
  async notificationCreateProperty(data: any) {
    console.log("property.created: ", data);

    await this.notificationService.createNotification(data);

    // Gửi email thông báo cho người đăng tin
    if (data.landlordEmail) {
      await this.emailService.sendPropertyPendingEmail(
        data.landlordEmail,
        data.landlordName || '',
        data.propertyId || data.property,
      );
    }
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

  @Delete('read')
  deleteReadNotifications(@AuthUser() user: IAuthUserPayload) {
    return this.notificationService.deleteReadNotifications(user.id);
  }

  @EventPattern("property.approved")
  async notificationApprovedProperty(data: any) {

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

    await this.notificationService.addNotificationReceiver(dataNew);

    // Gửi email thông báo cho người đăng tin
    if (data.landlordEmail) {
      await this.emailService.sendPropertyApprovedEmail(
        data.landlordEmail,
        data.landlordName || '',
        data.propertyId,
      );
    }
  }

  @EventPattern("property.rejected")
  async notificationRejectedProperty(data: any) {
    console.log("property.rejected: ", data);
    const dataNew = {
      type: "ADMIN_ACTION",
      title: "Bất động sản bị từ chối",
      body: `Bất động sản của bạn đã bị từ chối. Lý do: ${data.rejectionReason || data.reason}`,
      receiverType: "USER",
      receiverId: data.landlordId,
      metadata: {
        event: 'ESTATE_REJECTED',
        propertyId: data.propertyId,
        status: data.status,
      }
    }
    await this.notificationService.addNotificationReceiver(dataNew);

    // Gửi email thông báo cho người đăng tin
    if (data.landlordEmail) {
      await this.emailService.sendPropertyRejectedEmail(
        data.landlordEmail,
        data.landlordName || '',
        data.propertyId,
        data.rejectionReason || data.reason,
      );
    }
  }

  @EventPattern('email.otp.send')
  async handleEmailOtpSend(data: { to: string; userName: string; otp: string }) {
    console.log('email.otp.send: ', data.to);
    await this.emailService.sendOtpEmail(data.to, data.userName, data.otp);
  }
}
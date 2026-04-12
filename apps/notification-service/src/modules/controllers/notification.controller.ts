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

  @EventPattern('rental.request.created')
  async handleRentalRequestCreated(data: any) {
    console.log('rental.request.created: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST',
      title: 'Yêu cầu thuê mới',
      body: `Bạn có yêu cầu thuê mới cho bất động sản của mình.${data.message ? ' Lời nhắn: ' + data.message : ''}`,
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'RENTAL_REQUEST_CREATED',
        requestId: data.requestId,
        propertyId: data.propertyId,
        tenantId: data.tenantId,
      },
      actionUrl: `/rental-requests`,
    });
  }

  @EventPattern('contract.created')
  async handleContractCreated(data: any) {
    console.log('contract.created: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_CREATED',
      title: 'Hợp đồng mới được tạo',
      body: `Chủ nhà đã tạo hợp đồng thuê cho bạn. Mã hợp đồng: ${data.contractCode || ''}`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'CONTRACT_CREATED',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        ownerId: data.ownerId,
      },
      actionUrl: `/contracts/${data.contractId}`,
    });
  }
}
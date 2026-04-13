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
      actionUrl: `/dashboard/rental-requests`,
    });
  }

  @EventPattern('rental.request.reviewed')
  async handleRentalRequestReviewed(data: any) {
    console.log('rental.request.reviewed: ', data);
    const isApproved = data.status === 'approved';
    const statusText = isApproved ? 'chấp nhận' : data.status === 'rejected' ? 'từ chối' : 'đang xem xét';
    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST_UPDATE',
      title: `Yêu cầu thuê đã được ${statusText}`,
      body: isApproved
        ? 'Chủ nhà đã chấp nhận yêu cầu thuê của bạn. Vui lòng kiểm tra hợp đồng.'
        : data.status === 'rejected'
          ? `Yêu cầu thuê của bạn đã bị từ chối.${data.rejectionReason ? ' Lý do: ' + data.rejectionReason : ''}`
          : 'Chủ nhà đang xem xét yêu cầu thuê của bạn.',
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'RENTAL_REQUEST_REVIEWED',
        requestId: data.requestId,
        propertyId: data.propertyId,
        status: data.status,
      },
      actionUrl: `/dashboard/rental-requests`,
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
    });
  }

  @EventPattern('contract.sent_to_tenant')
  async handleContractSentToTenant(data: any) {
    console.log('contract.sent_to_tenant: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_SIGNED',
      title: 'Hợp đồng đã được gửi cho bạn',
      body: `Chủ nhà đã gửi hợp đồng cho bạn ký. Mã hợp đồng: ${data.contractCode || ''}. Vui lòng xem và ký hợp đồng.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'CONTRACT_SENT_TO_TENANT',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
    });
  }

  @EventPattern('contract.tenant_signed')
  async handleContractTenantSigned(data: any) {
    console.log('contract.tenant_signed: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_SIGNED',
      title: 'Người thuê đã ký hợp đồng',
      body: `Người thuê đã ký hợp đồng ${data.contractCode || ''}. Vui lòng xem và ký để hoàn tất.`,
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'CONTRACT_TENANT_SIGNED',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
    });
  }

  @EventPattern('contract.owner_signed')
  async handleContractOwnerSigned(data: any) {
    console.log('contract.owner_signed: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'DEPOSIT_PAYMENT',
      title: 'Hợp đồng đã ký đủ - Cần đóng tiền cọc',
      body: `Hợp đồng ${data.contractCode || ''} đã được ký đủ. Vui lòng thanh toán tiền cọc ${data.depositAmount ? Number(data.depositAmount).toLocaleString('vi-VN') + ' VNĐ' : ''} để kích hoạt hợp đồng.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'CONTRACT_OWNER_SIGNED',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        depositAmount: data.depositAmount,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
      priority: 'HIGH',
    });
  }

  @EventPattern('deposit.paid')
  async handleDepositPaid(data: any) {
    console.log('deposit.paid: ', data);
    // Thông báo cho chủ nhà: người thuê đã đóng tiền cọc
    await this.notificationService.addNotificationReceiver({
      type: 'DEPOSIT_PAYMENT',
      title: 'Tiền cọc đã được thanh toán',
      body: `Người thuê đã thanh toán tiền cọc ${data.amount ? Number(data.amount).toLocaleString('vi-VN') + ' VNĐ' : ''} cho hợp đồng ${data.contractCode || ''}. Hợp đồng đã được kích hoạt.`,
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'DEPOSIT_PAID',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        amount: data.amount,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
    });

    // Thông báo cho người thuê: đã đóng tiền cọc thành công
    await this.notificationService.addNotificationReceiver({
      type: 'DEPOSIT_PAYMENT',
      title: 'Đóng tiền cọc thành công',
      body: `Bạn đã thanh toán tiền cọc ${data.amount ? Number(data.amount).toLocaleString('vi-VN') + ' VNĐ' : ''} thành công. Hợp đồng ${data.contractCode || ''} đã được kích hoạt.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'DEPOSIT_PAID',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        amount: data.amount,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
    });
  }

  @EventPattern('payment.reminder')
  async handlePaymentReminder(data: any) {
    console.log('payment.reminder: ', data);
    const dueDate = new Date(data.dueDate);
    const dueDateStr = dueDate.toLocaleDateString('vi-VN');
    await this.notificationService.addNotificationReceiver({
      type: 'PAYMENT_REMINDER',
      title: 'Sắp tới hạn thanh toán tiền thuê',
      body: `Tiền thuê hợp đồng ${data.contractCode || ''} sẽ đến hạn vào ngày ${dueDateStr}. Số tiền: ${data.amount ? Number(data.amount).toLocaleString('vi-VN') + ' VNĐ' : ''}. Bạn có thể thanh toán trước.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'PAYMENT_REMINDER',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        paymentId: data.paymentId,
        dueDate: data.dueDate,
        amount: data.amount,
      },
      actionUrl: `/dashboard/payments`,
    });
  }

  @EventPattern('payment.due')
  async handlePaymentDue(data: any) {
    console.log('payment.due: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'PAYMENT_DUE',
      title: 'Đã đến hạn thanh toán tiền thuê',
      body: `Tiền thuê hợp đồng ${data.contractCode || ''} đã đến hạn thanh toán. Số tiền: ${data.amount ? Number(data.amount).toLocaleString('vi-VN') + ' VNĐ' : ''}. Vui lòng thanh toán ngay.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'PAYMENT_DUE',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        paymentId: data.paymentId,
        dueDate: data.dueDate,
        amount: data.amount,
      },
      actionUrl: `/dashboard/payments`,
      priority: 'HIGH',
    });
  }

  @EventPattern('payment.warning')
  async handlePaymentWarning(data: any) {
    console.log('payment.warning: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'PAYMENT_WARNING',
      title: '⚠️ Cảnh báo: Sắp quá hạn thanh toán',
      body: `Tiền thuê hợp đồng ${data.contractCode || ''} đã quá hạn ${data.overdueDays} ngày. Số tiền: ${data.amount ? Number(data.amount).toLocaleString('vi-VN') + ' VNĐ' : ''}. Yêu cầu thanh toán gấp để tránh bị hủy hợp đồng!`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'PAYMENT_WARNING',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        paymentId: data.paymentId,
        dueDate: data.dueDate,
        amount: data.amount,
        overdueDays: data.overdueDays,
      },
      actionUrl: `/dashboard/payments`,
      priority: 'URGENT',
    });
  }

  @EventPattern('payment.overdue')
  async handlePaymentOverdue(data: any) {
    console.log('payment.overdue: ', data);
    // Thông báo cho người thuê
    await this.notificationService.addNotificationReceiver({
      type: 'PAYMENT_OVERDUE',
      title: '🚨 Trễ hạn thanh toán - Hợp đồng sẽ bị hủy',
      body: `Tiền thuê hợp đồng ${data.contractCode || ''} đã trễ hạn ${data.overdueDays} ngày. Hợp đồng sẽ tự động bị hủy do không thanh toán.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'PAYMENT_OVERDUE',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        paymentId: data.paymentId,
        dueDate: data.dueDate,
        amount: data.amount,
        overdueDays: data.overdueDays,
        severity: 'critical',
      },
      actionUrl: `/dashboard/payments`,
      priority: 'URGENT',
    });

    // Thông báo cho chủ nhà
    await this.notificationService.addNotificationReceiver({
      type: 'PAYMENT_OVERDUE',
      title: '🚨 Người thuê trễ hạn thanh toán',
      body: `Người thuê hợp đồng ${data.contractCode || ''} đã trễ hạn thanh toán ${data.overdueDays} ngày. Hợp đồng sẽ tự động bị hủy.`,
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'PAYMENT_OVERDUE',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
        paymentId: data.paymentId,
        dueDate: data.dueDate,
        amount: data.amount,
        overdueDays: data.overdueDays,
        severity: 'critical',
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
      priority: 'URGENT',
    });
  }
}
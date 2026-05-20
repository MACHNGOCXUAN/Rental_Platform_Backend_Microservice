import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { EmailService } from '../services/email.service';
import { GrpcAuthService } from 'src/services/grpc.auth.service';
import { EventPattern } from '@nestjs/microservices';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { UserRole, type IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { SubscribePushTokenDto, UnsubscribePushTokenDto } from '../dtos/push-token.dto';
import { ReceiverType } from '@prisma/client';

@Controller("/notification")
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly grpcAuthService: GrpcAuthService,
  ) { }

  @Post('test-push')
  testPush(@AuthUser() user) {
    return this.notificationService.addNotificationReceiver({
      title: 'Test Notification 🔥',
      body: 'Hello từ NestJS',
      type: 'SYSTEM',
      receiverType: 'USER',
      receiverId: user.id,
    });
  }

  @Get()
  getNotification(@AuthUser() user: IAuthUserPayload) {
    return this.notificationService.getNotification(user.id)
  }

  @Post('push/subscribe')
  subscribePushToken(
    @AuthUser() user: IAuthUserPayload,
    @Body() body: SubscribePushTokenDto,
  ) {
    const receiverType =
      user.role === UserRole.ADMIN ? ReceiverType.ADMIN : ReceiverType.USER;

    return this.notificationService.registerPushToken({
      receiverId: user.id,
      receiverType,
      token: body.token,
      platform: body.platform,
      deviceId: body.deviceId,
    });
  }

  @Delete('push/unsubscribe')
  unsubscribePushToken(
    @AuthUser() user: IAuthUserPayload,
    @Body() body: UnsubscribePushTokenDto,
  ) {
    const receiverType =
      user.role === UserRole.ADMIN ? ReceiverType.ADMIN : ReceiverType.USER;

    return this.notificationService.unregisterPushToken({
      receiverId: user.id,
      receiverType,
      token: body.token,
    });
  }


  @EventPattern('property.created')
  async notificationCreateProperty(data: any) {
    console.log('property.created: ', data);
    await this.notificationService.createNotification(data);

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
    return this.notificationService.markAsRead(user.id, id);
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

  @EventPattern('rental.request.holding_deposit_opened')
  async handleHoldingDepositOpened(data: any) {
    console.log('rental.request.holding_deposit_opened: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST_UPDATE',
      title: 'Yêu cầu thuê được chấp nhận',
      body: `Yêu cầu của bạn đã được chấp nhận. Vui lòng đặt cọc giữ chỗ trong 30 phút.${data.amount ? ' Số tiền: ' + Number(data.amount).toLocaleString('vi-VN') + ' VNĐ.' : ''}`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'HOLDING_DEPOSIT_OPENED',
        requestId: data.requestId,
        propertyId: data.propertyId,
        expiresAt: data.expiresAt,
      },
      actionUrl: `/dashboard/rental-requests`,
      priority: 'HIGH',
    });
  }

  @EventPattern('rental.request.holding_deposit_paid')
  async handleHoldingDepositPaid(data: any) {
    console.log('rental.request.holding_deposit_paid: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST_UPDATE',
      title: 'Đã đặt cọc giữ chỗ thành công',
      body: `Bạn đã đặt cọc giữ chỗ thành công.${data.amount ? ' Số tiền: ' + Number(data.amount).toLocaleString('vi-VN') + ' VNĐ.' : ''} Chủ nhà sẽ tạo hợp đồng cho bạn.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'HOLDING_DEPOSIT_PAID',
        requestId: data.requestId,
        propertyId: data.propertyId,
      },
      actionUrl: `/dashboard/rental-requests`,
    });

    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST_UPDATE',
      title: 'Có người đã đặt cọc giữ chỗ',
      body: `Một ứng viên đã thanh toán giữ chỗ thành công. Vui lòng tạo hợp đồng.`,
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'HOLDING_DEPOSIT_PAID_OWNER',
        requestId: data.requestId,
        propertyId: data.propertyId,
      },
      actionUrl: `/dashboard/rental-requests`,
    });
  }

  @EventPattern('rental.request.holding_deposit_locked')
  async handleHoldingDepositLocked(data: any) {
    console.log('rental.request.holding_deposit_locked: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST_UPDATE',
      title: 'Bất động sản đã có người giữ chỗ',
      body: 'Một ứng viên khác đã thanh toán giữ chỗ trước. Yêu cầu của bạn đã bị khóa.',
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'HOLDING_DEPOSIT_LOCKED',
        requestId: data.requestId,
        propertyId: data.propertyId,
      },
      actionUrl: `/dashboard/rental-requests`,
    });
  }

  @EventPattern('rental.request.holding_deposit_expired')
  async handleHoldingDepositExpired(data: any) {
    console.log('rental.request.holding_deposit_expired: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'RENTAL_REQUEST_UPDATE',
      title: 'Hết hạn đặt cọc giữ chỗ',
      body: 'Đã hết thời gian đặt cọc giữ chỗ và không có ứng viên thanh toán.',
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'HOLDING_DEPOSIT_EXPIRED',
        propertyId: data.propertyId,
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
      title: 'Hợp đồng đã được ký và kích hoạt',
      body: `Hợp đồng ${data.contractCode || ''} đã được chủ nhà ký. Hợp đồng đang có hiệu lực và hệ thống đã tạo thanh toán tháng đầu tiên.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'CONTRACT_OWNER_SIGNED',
        contractId: data.contractId,
        contractCode: data.contractCode,
        propertyId: data.propertyId,
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

  // ── Termination & Dispute Notification Events ──────────────────────

  @EventPattern('termination.created')
  async handleTerminationCreated(data: any) {
    console.log('termination.created: ', data);
    const requesterLabel = data.requesterRole === 'OWNER' ? 'Chủ nhà' : 'Người thuê';
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_TERMINATION',
      title: 'Yêu cầu chấm dứt hợp đồng mới',
      body: `${requesterLabel} đã gửi yêu cầu chấm dứt hợp đồng ${data.contractCode || ''}. Vui lòng xem xét và phản hồi.`,
      receiverType: 'USER',
      receiverId: data.otherPartyId,
      metadata: {
        event: 'TERMINATION_CREATED',
        terminationRequestId: data.terminationRequestId,
        contractId: data.rentalId,
        contractCode: data.contractCode,
        requestedBy: data.requestedBy,
        reason: data.reason,
      },
      actionUrl: `/dashboard/contracts/${data.rentalId}`,
      priority: 'HIGH',
    });
  }

  @EventPattern('termination.reviewed')
  async handleTerminationReviewed(data: any) {
    console.log('termination.reviewed: ', data);
    const isApproved = data.status === 'approved';
    const statusText = isApproved ? 'chấp thuận' : 'từ chối';

    // Notify requester
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_TERMINATION',
      title: `Yêu cầu chấm dứt đã được ${statusText}`,
      body: isApproved
        ? `Yêu cầu chấm dứt hợp đồng ${data.contractCode || ''} đã được chấp thuận. Hợp đồng sẽ được kết thúc.`
        : `Yêu cầu chấm dứt hợp đồng ${data.contractCode || ''} đã bị từ chối.${data.reviewNote ? ' Lý do: ' + data.reviewNote : ''} Bạn có thể thương lượng hoặc gửi tranh chấp lên admin.`,
      receiverType: 'USER',
      receiverId: data.requesterId,
      metadata: {
        event: 'TERMINATION_REVIEWED',
        terminationRequestId: data.terminationRequestId,
        contractId: data.rentalId,
        contractCode: data.contractCode,
        status: data.status,
      },
      actionUrl: `/dashboard/contracts/${data.rentalId}`,
      priority: 'HIGH',
    });
  }

  @EventPattern('termination.escalated')
  async handleTerminationEscalated(data: any) {
    console.log('termination.escalated: ', data);
    // Notify all admins
    const { users: admins } = await this.grpcAuthService.getUsersByRole('ADMIN');
    const adminIds = (admins ?? []).map((u: any) => u.id!).filter(Boolean);

    for (const adminId of adminIds) {
      await this.notificationService.addNotificationReceiver({
        type: 'CONTRACT_TERMINATION',
        title: '🔔 Tranh chấp chấm dứt hợp đồng cần xử lý',
        body: `Tranh chấp chấm dứt hợp đồng ${data.contractCode || ''} đã được gửi lên admin. Vui lòng xem xét và ra quyết định.`,
        receiverType: 'ADMIN',
        receiverId: adminId,
        metadata: {
          event: 'TERMINATION_ESCALATED',
          terminationRequestId: data.terminationRequestId,
          contractId: data.rentalId,
          contractCode: data.contractCode,
          reason: data.reason,
        },
        actionUrl: `/complaints`,
        priority: 'URGENT',
      });
    }

    // Notify the other party that dispute has been escalated
    const otherPartyId = data.escalatedBy === data.ownerId ? data.tenantId : data.ownerId;
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_TERMINATION',
      title: 'Tranh chấp đã được gửi lên admin',
      body: `Tranh chấp chấm dứt hợp đồng ${data.contractCode || ''} đã được gửi lên admin để xem xét. Bạn sẽ nhận được thông báo khi có kết quả.`,
      receiverType: 'USER',
      receiverId: otherPartyId,
      metadata: {
        event: 'TERMINATION_ESCALATED',
        terminationRequestId: data.terminationRequestId,
        contractId: data.rentalId,
        contractCode: data.contractCode,
      },
      actionUrl: `/dashboard/contracts/${data.rentalId}`,
    });
  }

  @EventPattern('termination.resolved')
  async handleTerminationResolved(data: any) {
    console.log('termination.resolved: ', data);
    const resolutionText = data.resolution === 'terminate_contract' ? 'chấm dứt hợp đồng' : 'tiếp tục hợp đồng';

    // Notify both owner and tenant
    for (const userId of [data.ownerId, data.tenantId].filter(Boolean)) {
      await this.notificationService.addNotificationReceiver({
        type: 'CONTRACT_TERMINATION',
        title: 'Tranh chấp chấm dứt đã được giải quyết',
        body: `Admin đã giải quyết tranh chấp hợp đồng ${data.contractCode || ''}: ${resolutionText}.${data.note ? ' Ghi chú: ' + data.note : ''}`,
        receiverType: 'USER',
        receiverId: userId,
        metadata: {
          event: 'TERMINATION_RESOLVED',
          terminationRequestId: data.terminationRequestId,
          contractId: data.rentalId,
          contractCode: data.contractCode,
          resolution: data.resolution,
        },
        actionUrl: `/dashboard/contracts/${data.rentalId}`,
        priority: 'HIGH',
      });
    }
  }

  @EventPattern('termination.negotiating')
  async handleTerminationNegotiating(data: any) {
    console.log('termination.negotiating: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_TERMINATION',
      title: 'Bắt đầu thương lượng chấm dứt hợp đồng',
      body: `Yêu cầu chấm dứt hợp đồng ${data.contractCode || ''} đang trong giai đoạn thương lượng. Vui lòng liên hệ bên kia để thỏa thuận.`,
      receiverType: 'USER',
      receiverId: data.otherPartyId,
      metadata: {
        event: 'TERMINATION_NEGOTIATING',
        terminationRequestId: data.terminationRequestId,
        contractId: data.rentalId,
        contractCode: data.contractCode,
      },
      actionUrl: `/dashboard/contracts/${data.rentalId}`,
    });
  }

  @EventPattern('report.created')
  async handleReportCreated(data: any) {
    console.log('report.created: ', data);
    // Notify all admins
    const { users: admins } = await this.grpcAuthService.getUsersByRole('ADMIN');
    const adminIds = (admins ?? []).map((u: any) => u.id!).filter(Boolean);

    for (const adminId of adminIds) {
      await this.notificationService.addNotificationReceiver({
        type: 'REPORT_CREATED',
        title: 'Khiếu nại mới cần xử lý',
        body: `Khiếu nại mới: "${data.title || ''}" cho hợp đồng ${data.contractCode || ''}. Vui lòng xem xét và xử lý.`,
        receiverType: 'ADMIN',
        receiverId: adminId,
        metadata: {
          event: 'REPORT_CREATED',
          reportId: data.reportId,
          contractId: data.rentalId,
          contractCode: data.contractCode,
          type: data.type,
        },
        actionUrl: `/complaints`,
        priority: 'HIGH',
      });
    }

    // Notify the party being reported
    await this.notificationService.addNotificationReceiver({
      type: 'REPORT_CREATED',
      title: 'Có khiếu nại liên quan đến bạn',
      body: `Một khiếu nại đã được gửi liên quan đến hợp đồng ${data.contractCode || ''}. Admin sẽ xem xét và xử lý.`,
      receiverType: 'USER',
      receiverId: data.againstId,
      metadata: {
        event: 'REPORT_CREATED',
        reportId: data.reportId,
        contractId: data.rentalId,
        contractCode: data.contractCode,
      },
      actionUrl: `/dashboard/contracts/${data.rentalId}`,
    });
  }

  @EventPattern('report.resolved')
  async handleReportResolved(data: any) {
    console.log('report.resolved: ', data);
    // Notify both parties
    for (const userId of [data.ownerId, data.tenantId].filter(Boolean)) {
      await this.notificationService.addNotificationReceiver({
        type: 'REPORT_RESOLVED',
        title: 'Khiếu nại đã được giải quyết',
        body: `Admin đã giải quyết khiếu nại cho hợp đồng ${data.contractCode || ''}.${data.adminNote ? ' Ghi chú: ' + data.adminNote : ''}`,
        receiverType: 'USER',
        receiverId: userId,
        metadata: {
          event: 'REPORT_RESOLVED',
          reportId: data.reportId,
          contractId: data.rentalId,
          contractCode: data.contractCode,
          terminationResolution: data.terminationResolution,
        },
        actionUrl: `/dashboard/contracts/${data.rentalId}`,
        priority: 'HIGH',
      });
    }
  }

  @EventPattern('report.cancelled')
  async handleReportCancelled(data: any) {
    console.log('report.cancelled: ', data);
    // Notify the other party that the report was cancelled
    const otherPartyId = data.cancelledBy === data.ownerId ? data.tenantId : data.ownerId;
    if (otherPartyId) {
      await this.notificationService.addNotificationReceiver({
        type: 'REPORT_CANCELLED',
        title: 'Khiếu nại đã bị hủy',
        body: `Khiếu nại liên quan đến hợp đồng ${data.contractCode || ''} đã bị hủy bởi người tạo.`,
        receiverType: 'USER',
        receiverId: otherPartyId,
        metadata: {
          event: 'REPORT_CANCELLED',
          reportId: data.reportId,
          contractId: data.rentalId,
          contractCode: data.contractCode,
        },
        actionUrl: `/dashboard/contracts/${data.rentalId}`,
      });
    }
  }

  @EventPattern('contract.renewal_request')
  async handleContractRenewalRequest(data: any) {
    console.log('contract.renewal_request: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_RENEWAL',
      title: 'Yêu cầu gia hạn hợp đồng mới',
      body: `Bạn nhận được yêu cầu gia hạn cho hợp đồng ${data.contractCode || ''}. Vui lòng xem xét.`,
      receiverType: 'USER',
      receiverId: data.ownerId,
      metadata: {
        event: 'CONTRACT_RENEWAL_REQUESTED',
        contractId: data.contractId,
        contractCode: data.contractCode,
        renewalRequestId: data.renewalRequestId,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
      priority: 'HIGH',
    });
  }

  @EventPattern('contract.renewal_approved')
  async handleContractRenewalApproved(data: any) {
    console.log('contract.renewal_approved: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_RENEWAL',
      title: 'Hợp đồng đã được gia hạn thành công',
      body: `Yêu cầu gia hạn hợp đồng ${data.oldContractCode || ''} đã được chấp thuận. Hợp đồng mới: ${data.newContractCode || ''}.`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'CONTRACT_RENEWAL_APPROVED',
        oldContractId: data.oldContractId,
        newContractId: data.newContractId,
        oldContractCode: data.oldContractCode,
        newContractCode: data.newContractCode,
      },
      actionUrl: `/dashboard/contracts/${data.newContractId}`,
      priority: 'HIGH',
    });
  }

  @EventPattern('contract.renewal_rejected')
  async handleContractRenewalRejected(data: any) {
    console.log('contract.renewal_rejected: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'CONTRACT_RENEWAL',
      title: 'Yêu cầu gia hạn bị từ chối',
      body: `Yêu cầu gia hạn hợp đồng ${data.contractCode || ''} đã bị từ chối.${data.reason ? ' Lý do: ' + data.reason : ''}`,
      receiverType: 'USER',
      receiverId: data.tenantId,
      metadata: {
        event: 'CONTRACT_RENEWAL_REJECTED',
        contractId: data.contractId,
        contractCode: data.contractCode,
        reason: data.reason,
      },
      actionUrl: `/dashboard/contracts/${data.contractId}`,
    });
  }

  // ── KYC Notification Events ──────────────────────────────────────────

  @EventPattern('kyc.submitted_for_review')
  async handleKycSubmittedForReview(data: any) {
    console.log('kyc.submitted_for_review: ', data);
    // Notify all admins
    const { users: admins } = await this.grpcAuthService.getUsersByRole('ADMIN');
    const adminIds = (admins ?? []).map((u: any) => u.id!).filter(Boolean);

    for (const adminId of adminIds) {
      await this.notificationService.addNotificationReceiver({
        type: 'KYC_REVIEW',
        title: 'Hồ sơ KYC mới cần thẩm định',
        body: `Người dùng ${data.userName || ''} đã gửi hồ sơ KYC cần xác thực thủ công. Vui lòng xem xét và phê duyệt.`,
        receiverType: 'ADMIN',
        receiverId: adminId,
        metadata: {
          event: 'KYC_SUBMITTED_FOR_REVIEW',
          userId: data.userId,
          kycDocumentId: data.kycDocumentId,
        },
        actionUrl: `/dashboard/users/${data.userId}`,
        priority: 'HIGH',
      });
    }
  }

  @EventPattern('kyc.approved')
  async handleKycApproved(data: any) {
    console.log('kyc.approved: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'KYC_REVIEW',
      title: 'Hồ sơ KYC đã được duyệt ✅',
      body: 'Hồ sơ xác thực danh tính của bạn đã được quản trị viên phê duyệt. Tài khoản đã được xác thực thành công.',
      receiverType: 'USER',
      receiverId: data.userId,
      metadata: {
        event: 'KYC_APPROVED',
        kycDocumentId: data.kycDocumentId,
      },
      actionUrl: '/kyc',
      priority: 'HIGH',
    });
  }

  @EventPattern('kyc.rejected')
  async handleKycRejected(data: any) {
    console.log('kyc.rejected: ', data);
    await this.notificationService.addNotificationReceiver({
      type: 'KYC_REVIEW',
      title: 'Hồ sơ KYC bị từ chối ❌',
      body: `Hồ sơ xác thực danh tính của bạn đã bị từ chối.${data.rejectionReason ? ' Lý do: ' + data.rejectionReason : ''} Vui lòng gửi lại hồ sơ.`,
      receiverType: 'USER',
      receiverId: data.userId,
      metadata: {
        event: 'KYC_REJECTED',
        kycDocumentId: data.kycDocumentId,
        rejectionReason: data.rejectionReason,
      },
      actionUrl: '/kyc',
      priority: 'HIGH',
    });
  }
}
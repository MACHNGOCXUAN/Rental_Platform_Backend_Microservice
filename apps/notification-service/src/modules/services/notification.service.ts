import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { NotificationGateway } from '../notification.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class NotificationService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  private mapToClient(recipient: any, notification: any) {
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      metadata: notification.metadata,
      isRead: recipient.isRead,
      createdAt: notification.createdAt,
    };
  }

  private async createNotificationForReceiver(data: {
    title: string;
    body: string;
    type: string;
    receiverType: string;
    receiverId: string;
    metadata?: Record<string, unknown>;
    actionUrl?: string;
    actionLabel?: string;
    imageUrl?: string;
    priority?: string;
  }) {
    const notification = await this.databaseService.notification.create({
      data: {
        title: data.title,
        body: data.body,
        type: data.type,
        metadata: data.metadata,
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
        imageUrl: data.imageUrl,
        priority: data.priority ?? "NORMAL",
        recipients: {
          create: {
            receiverType: data.receiverType,
            receiverId: data.receiverId,
            channel: "IN_APP",
            status: "SENT",
            deliveredAt: new Date(),
          },
        },
      },
      include: {
        recipients: true,
      },
    });

    const recipient = notification.recipients?.[0];
    const payload = this.mapToClient(recipient, notification);

    this.eventEmitter.emit('notification.created', {
      userId: data.receiverId,
      notification: payload,
    });

    return payload;
  }

  async createNotification(data: any) {
    await this.createNotificationForReceiver({
      title: 'Bất động sản mới chờ duyệt',
      body: 'Có một bất động sản mới vừa được tạo và đang chờ phê duyệt.',
      type: 'PROPERTY_UPDATE',
      receiverType: 'ADMIN',
      receiverId: "96e6ad94-83fe-48b2-b210-18ab41616561",
      metadata: {
        event: 'ESTATE_CREATED',
        propertyId: data.propertyId,
        landlordId: data.landlordId,
        status: data.status,
      },
    });

    await this.createNotificationForReceiver({
      title: 'Bất động sản đang chờ duyệt',
      body: 'Bất động sản của bạn đã được gửi và đang chờ admin phê duyệt.',
      type: 'PROPERTY_UPDATE',
      receiverType: 'USER',
      receiverId: data.landlordId,
      metadata: {
        event: 'ESTATE_CREATED',
        propertyId: data.propertyId,
        status: data.status,
      },
    });
  }

  async getNotification(userId: string) {
    const recipients = await this.databaseService.notificationRecipient.findMany({
      where: {
        receiverId: userId,
      },
      include: {
        notification: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return recipients.map((item) => this.mapToClient(item, item.notification));
  }

  async markAsRead(userId: string, notificationId: string) {
    const recipient = await this.databaseService.notificationRecipient.findFirst({
      where: {
        receiverId: userId,
        notificationId,
      },
      include: {
        notification: true,
      },
    });

    if (!recipient) {
      throw new Error('Notification not found or access denied');
    }

    if (recipient.isRead) {
      return this.mapToClient(recipient, recipient.notification);
    }

    const updatedRecipient = await this.databaseService.notificationRecipient.update({
      where: {
        id: recipient.id,
      },
      data: {
        isRead: true,
        readAt: new Date(),
        status: "READ",
      },
      include: {
        notification: true,
      },
    });

    const payload = this.mapToClient(updatedRecipient, updatedRecipient.notification);

    this.eventEmitter.emit('notification.read', {
      userId,
      notificationId,
      notification: payload,
    });

    return payload;
  }

   async addNotificationReceiver(dataNew: any) {
    return this.createNotificationForReceiver({
      title: dataNew.title,
      body: dataNew.body,
      type: dataNew.type,
      receiverType: dataNew.receiverType,
      receiverId: dataNew.receiverId,
      metadata: dataNew.metadata,
      actionUrl: dataNew.actionUrl,
      actionLabel: dataNew.actionLabel,
      imageUrl: dataNew.imageUrl,
      priority: dataNew.priority,
    });
  }
}

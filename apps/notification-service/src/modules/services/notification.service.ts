import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from 'src/common/services/database.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, NotificationType, ReceiverType } from '@prisma/client';

type CreateNotificationForReceiverInput = {
  title: string;
  body: string;
  type: NotificationType;
  receiverType: ReceiverType;
  receiverId: string;
  metadata?: Prisma.InputJsonValue | null;
  actionUrl?: string;
  actionLabel?: string;
  imageUrl?: string;
  priority?: string;
};

@Injectable()
export class NotificationService {
  private readonly adminIds: string[];

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('NOTIFICATION_ADMIN_IDS', '');
    this.adminIds = raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  private mapToClient(recipient: any, notification: any) {
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      metadata: notification.metadata,
      isRead: recipient?.isRead ?? notification.isRead ?? false,
      createdAt: notification.createdAt,
    };
  }

  private async createNotificationForReceiver(data: CreateNotificationForReceiverInput) {
    const db = this.databaseService as any;
    const hasRecipientModel = !!db.notificationRecipient;
    let payload: any;

    if (hasRecipientModel) {
      const notification = await db.notification.create({
        data: {
          title: data.title,
          body: data.body,
          type: data.type,
          metadata: data.metadata,
          actionUrl: data.actionUrl,
          actionLabel: data.actionLabel,
          imageUrl: data.imageUrl,
          priority: data.priority ?? 'NORMAL',
          recipients: {
            create: {
              receiverType: data.receiverType,
              receiverId: data.receiverId,
              channel: 'IN_APP',
              status: 'SENT',
              deliveredAt: new Date(),
            },
          },
        },
        include: {
          recipients: true,
        },
      });

      const recipient = notification.recipients?.[0];
      payload = this.mapToClient(recipient, notification);
    } else {
      const notification = await db.notification.create({
        data: {
          title: data.title,
          body: data.body,
          type: data.type,
          metadata: data.metadata,
          receiverType: data.receiverType,
          receiverId: data.receiverId,
          isRead: false,
        },
      });

      payload = this.mapToClient(notification, notification);
    }

    this.eventEmitter.emit('notification.created', {
      userId: data.receiverId,
      notification: payload,
    });

    return payload;
  }

  async createNotification(data: any) {
    // Gửi thông báo tới tất cả admin được cấu hình
    await Promise.all(
      this.adminIds.map((adminId) =>
        this.createNotificationForReceiver({
          title: 'Bất động sản mới chờ duyệt',
          body: 'Có một bất động sản mới vừa được tạo và đang chờ phê duyệt.',
          type: NotificationType.PROPERTY_UPDATE,
          receiverType: ReceiverType.ADMIN,
          receiverId: adminId,
          metadata: {
            event: 'ESTATE_CREATED',
            propertyId: data.propertyId,
            landlordId: data.landlordId,
            status: data.status,
          },
        }),
      ),
    );

    await this.createNotificationForReceiver({
      title: 'Bất động sản đang chờ duyệt',
      body: 'Bất động sản của bạn đã được gửi và đang chờ admin phê duyệt.',
      type: NotificationType.PROPERTY_UPDATE,
      receiverType: ReceiverType.USER,
      receiverId: data.landlordId,
      metadata: {
        event: 'ESTATE_CREATED',
        propertyId: data.propertyId,
        status: data.status,
      },
    });
  }

  async getNotification(userId: string) {
    const db = this.databaseService as any;

    if (db.notificationRecipient) {
      const recipients = await db.notificationRecipient.findMany({
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

      return recipients.map((item: any) => this.mapToClient(item, item.notification));
    }

    const notifications = await db.notification.findMany({
      where: {
        receiverId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return notifications.map((item: any) => this.mapToClient(item, item));
  }

  async markAsRead(userId: string, notificationId: string) {
    const db = this.databaseService as any;
    let payload: any;

    if (db.notificationRecipient) {
      const recipient = await db.notificationRecipient.findFirst({
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

      const updatedRecipient = await db.notificationRecipient.update({
        where: {
          id: recipient.id,
        },
        data: {
          isRead: true,
          readAt: new Date(),
          status: 'READ',
        },
        include: {
          notification: true,
        },
      });

      payload = this.mapToClient(updatedRecipient, updatedRecipient.notification);
    } else {
      const notification = await db.notification.findFirst({
        where: {
          id: notificationId,
          receiverId: userId,
        },
      });

      if (!notification) {
        throw new Error('Notification not found or access denied');
      }

      if (notification.isRead) {
        return this.mapToClient(notification, notification);
      }

      const updatedNotification = await db.notification.update({
        where: {
          id: notificationId,
        },
        data: {
          isRead: true,
        },
      });

      payload = this.mapToClient(updatedNotification, updatedNotification);
    }

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
      type: dataNew.type as NotificationType,
      receiverType: dataNew.receiverType as ReceiverType,
      receiverId: dataNew.receiverId,
      metadata: dataNew.metadata as Prisma.InputJsonValue,
      actionUrl: dataNew.actionUrl,
      actionLabel: dataNew.actionLabel,
      imageUrl: dataNew.imageUrl,
      priority: dataNew.priority,
    });
  }

  async deleteReadNotifications(userId: string) {
    const db = this.databaseService as any;

    if (db.notificationRecipient) {
      const readRecipients = await db.notificationRecipient.findMany({
        where: { receiverId: userId, isRead: true },
        select: { id: true, notificationId: true },
      });

      if (readRecipients.length === 0) return { deletedCount: 0 };

      await db.notificationRecipient.deleteMany({
        where: { id: { in: readRecipients.map((r: any) => r.id) } },
      });

      // Xóa notification không còn recipient nào
      for (const r of readRecipients) {
        const remaining = await db.notificationRecipient.count({
          where: { notificationId: r.notificationId },
        });
        if (remaining === 0) {
          await db.notification.delete({ where: { id: r.notificationId } });
        }
      }

      return { deletedCount: readRecipients.length };
    }

    const result = await db.notification.deleteMany({
      where: { receiverId: userId, isRead: true },
    });

    return { deletedCount: result.count };
  }
}

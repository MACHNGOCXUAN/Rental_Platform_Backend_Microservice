import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from 'src/common/services/database.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, NotificationType, ReceiverType } from '@prisma/client';
import { GrpcAuthService } from 'src/services/grpc.auth.service';
import { FirebaseService } from './firebase.service';

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
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly grpcAuthService: GrpcAuthService,
    private readonly firebaseService: FirebaseService,
  ) {}

  private mapToClient(recipient: any, notification: any) {
    return {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      metadata: notification.metadata,
      actionUrl: notification.actionUrl,
      priority: notification.priority,
      isRead: recipient?.isRead ?? notification.isRead ?? false,
      createdAt: notification.createdAt,
    };
  }

  private async createNotificationForReceiver(data: CreateNotificationForReceiverInput) {
    const db = this.databaseService as any;
    const hasRecipientModel = !!db.notificationRecipient;
    let payload: any;
    let notification: any;

    if (hasRecipientModel) {
      notification = await db.notification.create({
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
      notification = await db.notification.create({
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

    await this.sendPushToReceiver(data.receiverId, data.receiverType, notification);

    return payload;
  }

  async createNotification(data: any) {
    // Lấy tất cả admin từ estate-service qua gRPC
    const { users: admins } = await this.grpcAuthService.getUsersByRole('ADMIN');
    const adminIds = (admins ?? []).map((u) => u.id!).filter(Boolean);

    if (adminIds.length === 0) {
      this.logger.warn('No admin users found to send notification');
    }

    const db = this.databaseService as any;

    if (adminIds.length > 0) {
      if (db.notificationRecipient) {
        // Tạo MỘT notification với nhiều admin recipients (thông báo dùng chung)
        // Khi 1 admin đọc, tất cả admin khác cũng xem như đã đọc
        const notification = await db.notification.create({
          data: {
            title: 'Bất động sản mới chờ duyệt',
            body: 'Có một bất động sản mới vừa được tạo và đang chờ phê duyệt.',
            type: NotificationType.PROPERTY_UPDATE,
            metadata: {
              event: 'ESTATE_CREATED',
              propertyId: data.propertyId,
              landlordId: data.landlordId,
              status: data.status,
            },
            recipients: {
              create: adminIds.map((adminId: string) => ({
                receiverType: ReceiverType.ADMIN,
                receiverId: adminId,
                channel: 'IN_APP',
                status: 'SENT',
                deliveredAt: new Date(),
              })),
            },
          },
          include: { recipients: true },
        });

        // Gửi real-time tới từng admin
        for (const recipient of notification.recipients) {
          const payload = this.mapToClient(recipient, notification);
          this.eventEmitter.emit('notification.created', {
            userId: recipient.receiverId,
            notification: payload,
          });

          await this.sendPushToReceiver(
            recipient.receiverId,
            recipient.receiverType,
            notification,
          );
        }
      } else {
        // Fallback: không có notificationRecipient model
        await Promise.all(
          adminIds.map((adminId: string) =>
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
      }
    }

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
      // Lấy tất cả notifications (cả đã đọc và chưa đọc) của user hiện tại
      // Giới hạn 50 bản ghi gần nhất
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
        take: 50,
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
      take: 50,
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

      // Lấy danh sách recipients KHÁC (không phải người đọc) để emit và xóa
      const otherRecipients = await db.notificationRecipient.findMany({
        where: {
          notificationId: recipient.notificationId,
          receiverId: { not: userId },
        },
        select: { id: true, receiverId: true },
      });

      // Đánh dấu recipient của người đọc là isRead=true
      await db.notificationRecipient.update({
        where: { id: recipient.id },
        data: {
          isRead: true,
          readAt: new Date(),
          status: 'READ',
        },
      });

      // Xóa recipients của các admin khác
      if (otherRecipients.length > 0) {
        await db.notificationRecipient.deleteMany({
          where: {
            id: { in: otherRecipients.map((r: any) => r.id) },
          },
        });
      }

      const updatedRecipient = await db.notificationRecipient.findFirst({
        where: { id: recipient.id },
        include: { notification: true },
      });

      payload = this.mapToClient(updatedRecipient, updatedRecipient.notification);

      // Emit real-time đến các admin khác để họ xóa notification khỏi list
      for (const r of otherRecipients) {
        this.eventEmitter.emit('notification.read', {
          userId: r.receiverId,
          notificationId,
          notification: payload,
        });
      }
      return payload;
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

      this.eventEmitter.emit('notification.read', {
        userId,
        notificationId,
        notification: payload,
      });
    }

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

  async registerPushToken(input: {
    receiverId: string;
    receiverType: ReceiverType;
    token: string;
    platform?: string;
    deviceId?: string;
  }) {
    const db = this.databaseService as any;
    if (!db.notificationDevice) {
      return { registered: false };
    }

    if (input.deviceId) {
      await db.notificationDevice.deleteMany({
        where: {
          receiverId: input.receiverId,
          receiverType: input.receiverType,
          platform: input.platform ?? 'WEB',
          deviceId: input.deviceId,
          token: { not: input.token },
        },
      });
    }

    const device = await db.notificationDevice.upsert({
      where: { token: input.token },
      update: {
        receiverId: input.receiverId,
        receiverType: input.receiverType,
        platform: input.platform ?? 'WEB',
        deviceId: input.deviceId,
        lastSeenAt: new Date(),
      },
      create: {
        receiverId: input.receiverId,
        receiverType: input.receiverType,
        token: input.token,
        platform: input.platform ?? 'WEB',
        deviceId: input.deviceId,
        lastSeenAt: new Date(),
      },
    });

    return { registered: true, deviceId: device.id };
  }

  async unregisterPushToken(input: {
    receiverId: string;
    receiverType: ReceiverType;
    token: string;
  }) {
    const db = this.databaseService as any;
    if (!db.notificationDevice) {
      return { removed: false };
    }

    const result = await db.notificationDevice.deleteMany({
      where: {
        token: input.token,
        receiverId: input.receiverId,
        receiverType: input.receiverType,
      },
    });

    return { removed: result.count > 0 };
  }

  private async isPushEnabled(receiverId: string, receiverType: ReceiverType) {
    const db = this.databaseService as any;
    if (!db.notificationPreference) {
      return true;
    }

    const pref = await db.notificationPreference.findUnique({
      where: {
        receiverId_receiverType: {
          receiverId,
          receiverType,
        },
      },
    });

    return pref?.pushEnabled ?? true;
  }

  private async sendPushToReceiver(
    receiverId: string,
    receiverType: ReceiverType,
    notification: any,
  ) {
    if (!notification) {
      return;
    }

    const pushEnabled = await this.isPushEnabled(receiverId, receiverType);
    if (!pushEnabled) {
      return;
    }

    const db = this.databaseService as any;
    if (!db.notificationDevice) {
      return;
    }

    const devices = await db.notificationDevice.findMany({
      where: { receiverId, receiverType },
      select: { token: true },
    });

    const tokens = devices.map((d: any) => d.token).filter(Boolean);
    if (tokens.length === 0) {
      return;
    }

    try {
      const title = (notification.title || '').trim() || 'Thông báo mới';
      const body = (notification.body || '').trim() || 'Bạn có thông báo mới.';
      const response = await this.firebaseService.sendToTokens({
        tokens,
        notification: {
          title,
          body,
          // imageUrl: this.resolveIconUrl(notification.imageUrl || '/logo.png'),
        },
        data: {
          notificationId: notification.id?.toString() || '',
          title,
          body,
          type: notification.type?.toString() || '',
          actionUrl: notification.actionUrl || '',
          actionLabel: notification.actionLabel || '',
          metadata: notification.metadata
            ? JSON.stringify(notification.metadata)
            : '',
          createdAt: notification.createdAt
            ? new Date(notification.createdAt).toISOString()
            : '',
          icon: this.resolveIconUrl(notification.imageUrl || '/logo.png'),
          forceShow: '0',
        },
        webpush: {
          notification: {
            icon: this.resolveIconUrl(notification.imageUrl || '/logo.png'),
            badge: this.resolveIconUrl('/logo.png'),
          },
          fcmOptions: {
            link: notification.actionUrl || undefined,
          },
        },
      });

      const invalidTokens: string[] = [];
      response?.responses?.forEach((res: any, index: number) => {
        if (res?.success) return;
        const code = res?.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokens[index]);
        }
      });

      if (invalidTokens.length > 0) {
        await db.notificationDevice.deleteMany({
          where: { token: { in: invalidTokens } },
        });
      }
    } catch (error) {
      this.logger.warn(`Push send failed: ${(error as Error).message}`);
    }
  }

  private resolveIconUrl(iconPath: string) {
    if (!iconPath) return '';
    if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
      return iconPath;
    }

    const baseUrl = this.configService.get<string>(
      'WEB_CLIENT_URL',
      'http://localhost:3000',
    );

    try {
      return new URL(iconPath, baseUrl).toString();
    } catch {
      return iconPath;
    }
  }
}

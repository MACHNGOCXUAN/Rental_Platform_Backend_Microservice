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

  async createNotification(data: any) {

    const adminNotification =
      await this.databaseService.notification.create({
        data: {
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
        },
      });

    this.eventEmitter.emit('notification.created', {
      userId: '96e6ad94-83fe-48b2-b210-18ab41616561',
      notification: adminNotification,
    });

    const landlordNotification =
      await this.databaseService.notification.create({
        data: {
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
        },
      });

    this.eventEmitter.emit('notification.created', {
      userId: data.landlordId,
      notification: landlordNotification,
    });
  }

  async getNotification(userId: string) {
    return await this.databaseService.notification.findMany({
      where: {
        receiverId: userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification =
      await this.databaseService.notification.findFirst({
        where: {
          id: notificationId,
          receiverId: userId,
        },
      });

    if (!notification) {
      throw new Error('Notification not found or access denied');
    }

    if (notification.isRead) {
      return notification;
    }

    const updatedNotification =
      await this.databaseService.notification.update({
        where: {
          id: notificationId,
        },
        data: {
          isRead: true,
        },
      });

    this.eventEmitter.emit('notification.read', {
      userId,
      notificationId,
      notification: updatedNotification,
    });

    return updatedNotification;
  }

}

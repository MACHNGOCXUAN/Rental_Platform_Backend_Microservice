import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly databaseService: DatabaseService
  ) { }
  getHello(): string {
    return 'Hello World!';
  }


  async createNotification(data: any) {
    await this.databaseService.notification.create({
      data: {
        title: 'Bất động sản mới chờ duyệt',
        body: 'Có một bất động sản mới vừa được tạo và đang chờ phê duyệt.',
        type: 'PROPERTY_UPDATE',
        receiverType: 'ADMIN',
        receiverId: null,
        metadata: {
          event: 'ESTATE_CREATED',
          propertyId: data.property,
          landlordId: data.landlordId,
          status: data.status
        }
      }
    });

  }
}

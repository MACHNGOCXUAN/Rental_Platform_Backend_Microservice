import { Controller, Get, Inject } from '@nestjs/common';
import { NotificationService } from '../services/notification.service';
import { ClientProxy, EventPattern } from '@nestjs/microservices';

@Controller("/notification")
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService
) {}

  @Get()
  getHello(): string {
    return this.notificationService.getHello();
  }

  
  @EventPattern('property.created')
  notificationCreateProperty(data: any) {
    console.log('Estate created:', data);
  }
}

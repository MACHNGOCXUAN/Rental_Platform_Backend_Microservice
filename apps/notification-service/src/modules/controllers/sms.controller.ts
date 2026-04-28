import { Controller, Get } from "@nestjs/common";
import { NotificationService } from "../services/notification.service";
import { SmsService } from "../services/sms.service";
import { EventPattern } from "@nestjs/microservices";

@Controller("/sms")
export class SmsController {
    constructor(
        private readonly notificationService: NotificationService,
        private readonly smsService: SmsService,
    ) { }

    @EventPattern('send_sms')
    async sendSms(data: any) {
        console.log("Data send sms: ", data);
        
        await this.smsService.sendSms(data);
    }
}
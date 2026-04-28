import { Injectable } from "@nestjs/common";
import { sendSMS } from "src/utils/sms.util";

@Injectable()
export class SmsService {
    async sendSms(data: any) {
        const { phoneNumber, message } = data;

        const formattedPhone = phoneNumber.startsWith('0') 
            ? '84' + phoneNumber.substring(1) 
            : phoneNumber;
        await sendSMS({
            phoneNumber: formattedPhone,
            message,
        });
        console.log(`Sending SMS to ${formattedPhone}: ${message}`);
    }
}
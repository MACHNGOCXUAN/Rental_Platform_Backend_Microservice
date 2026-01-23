import axios from 'axios';
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EsmsService {
    async sendOtp(phone: string, otp: string) {
        const message = `Ma OTP cua ban la ${otp}. Hieu luc trong 2 phut.`;

        const apiKey = process.env.ESMS_API_KEY!;
        const secretKey = process.env.ESMS_SECRET_KEY!;

        const checksum = crypto
            .createHash('md5')
            .update(apiKey + secretKey + phone + message)
            .digest('hex');

        const url = `https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_get`;

        const { data } = await axios.get(url, {
            params: {
                Phone: phone,
                Content: message,
                ApiKey: apiKey,
                SecretKey: secretKey,
                SmsType: 8, // SMS OTP không cần brandname
                CheckSum: checksum,
            },
        });


        if (data.CodeResult !== '100') {
            throw new Error(`eSMS error: ${data.ErrorMessage}`);
        }
    }
}

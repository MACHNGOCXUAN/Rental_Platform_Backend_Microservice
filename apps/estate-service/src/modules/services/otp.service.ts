import { Injectable, BadRequestException } from '@nestjs/common';
import { EsmsService } from './esms.service';

@Injectable()
export class OtpService {
    constructor(private readonly smsService: EsmsService) {}

    private otpStore = new Map<string, { otp: string; expiredAt: number }>();

    async requestOtp(phone: string) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiredAt = Date.now() + 120 * 1000;

        this.otpStore.set(phone, { otp, expiredAt });

        await this.smsService.sendOtp(phone, otp);

        console.log('[OTP DEV]', phone, otp); // dev only

        return { message: 'OTP sent via SMS' };
    }

    async verifyOtp(phone: string, otp: string) {
        console.log('[VERIFY OTP] phone:', phone, 'otp:', otp);
        console.log('[VERIFY OTP] stored keys:', Array.from(this.otpStore.keys()));
        
        const data = this.otpStore.get(phone);

        if (!data) {
            throw new BadRequestException('OTP không tồn tại');
        }

        if (Date.now() > data.expiredAt) {
            throw new BadRequestException('OTP đã hết hạn');
        }

        if (data.otp !== otp) {
            throw new BadRequestException('OTP không đúng');
        }

        this.otpStore.delete(phone);
        return { verified: true };
    }
}

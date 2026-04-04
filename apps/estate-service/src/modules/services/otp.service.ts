import { Injectable, BadRequestException } from '@nestjs/common';
import { EsmsService } from './esms.service';

@Injectable()
export class OtpService {
    constructor(private readonly smsService: EsmsService) {}

    private otpStore = new Map<string, { otp: string; expiredAt: number }>();
    private emailOtpStore = new Map<string, { otp: string; expiredAt: number }>();

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

    async requestEmailOtp(email: string): Promise<{ message: string; devOtp?: string }> {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiredAt = Date.now() + 5 * 60 * 1000;

        this.emailOtpStore.set(email, { otp, expiredAt });

        // TODO: Integrate real email provider.
        console.log('[EMAIL OTP DEV]', email, otp);

        if (process.env.NODE_ENV !== 'production') {
            return { message: 'OTP đã được gửi qua email', devOtp: otp };
        }

        return { message: 'OTP đã được gửi qua email' };
    }

    async verifyEmailOtp(email: string, otp: string) {
        const data = this.emailOtpStore.get(email);

        if (!data) {
            throw new BadRequestException('OTP email không tồn tại');
        }

        if (Date.now() > data.expiredAt) {
            this.emailOtpStore.delete(email);
            throw new BadRequestException('OTP email đã hết hạn');
        }

        if (data.otp !== otp) {
            throw new BadRequestException('OTP email không đúng');
        }

        this.emailOtpStore.delete(email);
        return { verified: true };
    }
}

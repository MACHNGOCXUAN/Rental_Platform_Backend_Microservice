import { Injectable, BadRequestException } from '@nestjs/common';
import * as qs from 'qs';
import { buildSecureHash, sortAndEncodeVnpParams } from './vnpay.util';
import { formatVnpDate } from '../payment.util';

@Injectable()
export class VnpayService {
    createPaymentUrl(payment: any, ipAddr: string) {
        const tmnCode = process.env.VNPAY_TMN_CODE;
        const secretKey = process.env.VNPAY_HASH_SECRET;
        const vnpUrl = process.env.VNPAY_URL;
        const returnUrl = process.env.VNPAY_RETURN_URL;

        if (!tmnCode || !secretKey || !vnpUrl || !returnUrl) {
            throw new BadRequestException('Missing VNPAY config');
        }

        const amount = Number(payment.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestException('Invalid amount');
        }

        const createDate = formatVnpDate(new Date());

        const orderId = Date.now().toString();

        const rawParams: Record<string, any> = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: tmnCode,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: orderId,
            vnp_OrderInfo: `Thanh toan ma ${orderId}`,
            vnp_OrderType: 'other',
            vnp_Amount: amount * 100,
            vnp_ReturnUrl: returnUrl,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: createDate,
        };

        // hash
        const secureHash = buildSecureHash(rawParams, secretKey);

        // build URL
        const sorted = sortAndEncodeVnpParams(rawParams);
        sorted['vnp_SecureHash'] = secureHash;

        const query = qs.stringify(sorted, { encode: false });

        return `${vnpUrl}?${query}`;
    }
}
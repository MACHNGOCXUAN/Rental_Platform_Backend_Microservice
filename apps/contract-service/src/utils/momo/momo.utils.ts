import * as crypto from 'crypto';

// Kiểm tra tính hợp lệ của chữ ký MoMo trong webhook nạp tiền
export function verifyMomoTopupSignature(
    body: any,
    accessKey: string,
    secretKey: string
): boolean {
    const {
        amount,
        extraData,
        message,
        orderId,
        orderInfo,
        orderType,
        partnerCode,
        payType,
        requestId,
        responseTime,
        resultCode,
        transId,
        signature: momoSignature,
    } = body;

    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${amount}` +
        `&extraData=${extraData || ''}` +
        `&message=${message}` +
        `&orderId=${orderId}` +
        `&orderInfo=${orderInfo}` +
        `&orderType=${orderType}` +
        `&partnerCode=${partnerCode}` +
        `&payType=${payType}` +
        `&requestId=${requestId}` +
        `&responseTime=${responseTime}` +
        `&resultCode=${resultCode}` +
        `&transId=${transId}`;

    const mySignature = crypto
        .createHmac('sha256', secretKey)
        .update(rawSignature)
        .digest('hex');

    return mySignature === momoSignature;
}
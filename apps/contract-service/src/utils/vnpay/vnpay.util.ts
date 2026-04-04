import * as crypto from 'crypto';
import * as qs from 'qs';

/**
 * Encode value theo chuẩn VNPAY (space => +)
 */
export function encodeValue(value: string): string {
    return encodeURIComponent(value).replace(/%20/g, '+');
}

/**
 * Sort + encode params (GIỐNG Express code của bạn)
 */
export function sortAndEncodeVnpParams(params: Record<string, any>) {
    const sortedKeys = Object.keys(params).sort();
    const result: Record<string, string> = {};

    for (const key of sortedKeys) {
        const value = params[key] ?? '';
        result[key] = encodeValue(String(value));
    }

    return result;
}

/**
 * Build secure hash
 */
export function buildSecureHash(
    params: Record<string, any>,
    secretKey: string
): string {
    const sortedKeys = Object.keys(params).sort();

    const sortedObj: Record<string, any> = {};
    for (const key of sortedKeys) {
        sortedObj[key] = params[key];
    }

    const signData = qs.stringify(sortedObj, { encode: true });

    console.log("SIGN DATA:", signData);

    const secureHash = crypto
        .createHmac('sha512', secretKey)
        .update(signData, 'utf-8')
        .digest('hex');

    console.log("HASH:", secureHash);

    return secureHash;
}

/**
 * Verify signature
 */
export function verifyVnpSignature(
    query: Record<string, any>,
    secretKey: string
): boolean {
    const vnpParams = { ...query };

    const secureHash = vnpParams['vnp_SecureHash'];

    delete vnpParams['vnp_SecureHash'];
    delete vnpParams['vnp_SecureHashType'];

    const sorted = sortAndEncodeVnpParams(vnpParams);
    const signData = qs.stringify(sorted, { encode: false });

    const signed = crypto
        .createHmac('sha512', secretKey)
        .update(Buffer.from(signData, 'utf-8'))
        .digest('hex');

    return (
        secureHash.length === signed.length &&
        crypto.timingSafeEqual(
            Buffer.from(secureHash),
            Buffer.from(signed)
        )
    );
}
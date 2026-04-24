import { Injectable, BadRequestException } from '@nestjs/common';
import QueryString, * as qs from 'qs';
import { buildSecureHash, sortAndEncodeVnpParams } from './vnpay.util';
import { formatVnpDate } from '../payment.util';
import { getRequiredEnv } from '../env.config';
import { formatDateYYYYMMDDHHmmss } from '../date.util';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class VnpayService {
    createPaymentUrl(payment: any, ipAddr: string) {
        let date = new Date();
        let createDate = formatDateYYYYMMDDHHmmss(date);

        const vnp_IpAddr = process.env.VNPAY_IP_ADDR || "127.0.0.1";

        const tmnCode = getRequiredEnv('VNPAY_TMN_CODE');
        const secretKey = getRequiredEnv('VNPAY_HASH_SECRET');
        let vnpUrl = getRequiredEnv('VNPAY_URL');
        const returnUrl = getRequiredEnv('VNPAY_RETURN_URL');
        const orderId = payment.paymentCode;
        const amount = Number(payment.amount);
        const bankCode = payment.bankCode;

        let locale = process.env.VNPAY_LOCALE || 'vn';
        let currCode = process.env.VNPAY_CURRENCY_CODE || 'VND';

        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = tmnCode;
        vnp_Params['vnp_Locale'] = locale;
        vnp_Params['vnp_CurrCode'] = currCode;
        vnp_Params['vnp_TxnRef'] = orderId;
        vnp_Params['vnp_OrderInfo'] = 'Thanh toan cho ma GD:' + orderId;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_Amount'] = amount * 100;
        vnp_Params['vnp_ReturnUrl'] = returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddr;
        vnp_Params['vnp_CreateDate'] = createDate;
        if (bankCode !== null && bankCode !== '') {
            vnp_Params['vnp_BankCode'] = bankCode;
        }

        vnp_Params = sortObject(vnp_Params);

        let signData = QueryString.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");

        vnp_Params['vnp_SecureHash'] = signed;
        vnpUrl += '?' + QueryString.stringify(vnp_Params, { encode: false });

        return vnpUrl;
    }

    // Sau khi khách hàng thanh toán xong sẽ được VNPAY gửi kết quả về đây
    async handlePaymentResult(query: any) {
        let vnp_Params = query;

        let secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);

        let tmnCode = getRequiredEnv('vnp_TmnCode');
        let secretKey = getRequiredEnv('vnp_HashSecret');

        let signData = QueryString.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");

        if (secureHash === signed) {
            // Kết quả trả về từ VNPAY
            let vnp_ResponseCode = vnp_Params['vnp_ResponseCode'];
            return vnp_ResponseCode;
        } else {
            throw new BadRequestException('Invalid signature');
        }
    }

    // VNPAY sẽ gửi kết quả thanh toán về đây, bạn cần cài đặt địa chỉ này cho VNPAY để nhận kết quả thanh toán
    vnpayIpn(query: any) {
        let vnp_Params = query;
        let secureHash = vnp_Params['vnp_SecureHash'];

        let orderId = vnp_Params['vnp_TxnRef'];
        let rspCode = vnp_Params['vnp_ResponseCode'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        let secretKey = getRequiredEnv('vnp_HashSecret');
        let signData = QueryString.stringify(vnp_Params, { encode: false });
        let crypto = require("crypto");
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");

        let paymentStatus = '0'; // Giả sử '0' là trạng thái khởi tạo giao dịch, chưa có IPN. Trạng thái này được lưu khi yêu cầu thanh toán chuyển hướng sang Cổng thanh toán VNPAY tại đầu khởi tạo đơn hàng.
        //let paymentStatus = '1'; // Giả sử '1' là trạng thái thành công bạn cập nhật sau IPN được gọi và trả kết quả về nó
        //let paymentStatus = '2'; // Giả sử '2' là trạng thái thất bại bạn cập nhật sau IPN được gọi và trả kết quả về nó

        let checkOrderId = true; // Mã đơn hàng "giá trị của vnp_TxnRef" VNPAY phản hồi tồn tại trong CSDL của bạn
        let checkAmount = true; // Kiểm tra số tiền "giá trị của vnp_Amout/100" trùng khớp với số tiền của đơn hàng trong CSDL của bạn
        if (secureHash === signed) { //kiểm tra checksum
            if (checkOrderId) {
                if (checkAmount) {
                    if (paymentStatus == "0") {
                        if (rspCode == "00") {
                            // Thành công cập nhat trạng thái giao dịch thành công vào CSDL của bạn
                            //  paymentStatus = '1'
                            return "Success";
                        }
                        else {
                            // Thất bại cập nhat trạng thái giao dịch thất bại vào CSDL của bạn
                            // paymentStatus = '2'
                            return "Failed";
                        }
                    }
                    else {
                        return "Order already updated";
                    }
                }
                else {
                    return "Invalid amount";
                }
            }
            else {
                return "Order not found";
            }
        }
        else {
            return "Checksum failed";
        }
    }

    // Truy vấn kết quả thanh toán, bạn có thể cài đặt địa chỉ này để VNPAY gửi kết quả thanh toán về đây hoặc bạn có thể chủ động gọi đến địa chỉ này để lấy kết quả thanh toán
    async queryPaymentResult(orderId: string) {
        let date = new Date();

        let vnp_TmnCode = getRequiredEnv('vnp_TmnCode');
        let secretKey = getRequiredEnv('vnp_HashSecret');
        let vnp_Api = getRequiredEnv('vnp_Api');

        let vnp_TxnRef = orderId
        let vnp_TransactionDate = formatDateYYYYMMDDHHmmss(date);

        let vnp_RequestId = vnp_TmnCode + formatDateYYYYMMDDHHmmss(date) + Math.floor(Math.random() * 1000);
        let vnp_Version = '2.1.0';
        let vnp_Command = 'querydr';
        let vnp_OrderInfo = 'Truy van GD ma:' + vnp_TxnRef;

        const vnp_IpAddr = process.env.VNPAY_IP_ADDR || "127.0.0.1";

        let currCode = 'VND';
        let vnp_CreateDate = formatDateYYYYMMDDHHmmss(date);

        let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TxnRef + "|" + vnp_TransactionDate + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;

        let hmac = crypto.createHmac("sha512", secretKey);
        let vnp_SecureHash = hmac.update(new Buffer(data, 'utf-8')).digest("hex");

        let dataObj = {
            'vnp_RequestId': vnp_RequestId,
            'vnp_Version': vnp_Version,
            'vnp_Command': vnp_Command,
            'vnp_TmnCode': vnp_TmnCode,
            'vnp_TxnRef': vnp_TxnRef,
            'vnp_OrderInfo': vnp_OrderInfo,
            'vnp_TransactionDate': vnp_TransactionDate,
            'vnp_CreateDate': vnp_CreateDate,
            'vnp_IpAddr': vnp_IpAddr,
            'vnp_SecureHash': vnp_SecureHash
        };

        let response = await axios.post(vnp_Api, qs.stringify(dataObj), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data;
    }

    // Truy vấn kết quả thanh toán, bạn có thể cài đặt địa chỉ này để VNPAY gửi kết quả thanh toán về đây hoặc bạn có thể chủ động gọi đến địa chỉ này để lấy kết quả thanh toán
    async refundPaymentVnpay(payment: any, description: string) {
        const vnp_TmnCode = getRequiredEnv('VNPAY_TMN_CODE');
        const secretKey = getRequiredEnv('VNPAY_HASH_SECRET');
        const vnp_Api = getRequiredEnv('VNPAY_QUERY_URL_REFUND');

        const vnp_TxnRef = payment.paymentCode;
        const vnp_TransactionDate = formatVnpDate(new Date());
        const vnp_Amount = String(Number(payment.amount) * 100);
        const vnp_TransactionType = '02'; // Loại giao dịch hoàn tiền
        const vnp_CreateBy = 'RentalPlatform'; // Tên người tạo giao dịch hoàn tiền

        let currCode = 'VND';

        const vnp_RequestId = `refund-${vnp_TxnRef}-${Date.now()}`;
        const vnp_Version = '2.1.0';
        const vnp_Command = 'refund';
        const vnp_OrderInfo = `Refund for payment ${vnp_TxnRef} - Reason: ${description}`;

        const vnp_IpAddr = process.env.VNPAY_IP_ADDR || "127.0.0.1";

        const vnp_CreateDate = formatVnpDate(new Date());
        const vnp_TransactionNo = '0';

        let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TransactionType + "|" + vnp_TxnRef + "|" + vnp_Amount + "|" + vnp_TransactionNo + "|" + vnp_TransactionDate + "|" + vnp_CreateBy + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;
        let hmac = crypto.createHmac("sha512", secretKey);
        let vnp_SecureHash = hmac.update(new Buffer(data, 'utf-8')).digest("hex");

        let dataObj = {
            'vnp_RequestId': vnp_RequestId,
            'vnp_Version': vnp_Version,
            'vnp_Command': vnp_Command,
            'vnp_TmnCode': vnp_TmnCode,
            'vnp_TransactionType': vnp_TransactionType,
            'vnp_TxnRef': vnp_TxnRef,
            'vnp_Amount': vnp_Amount,
            'vnp_TransactionNo': vnp_TransactionNo,
            'vnp_CreateBy': vnp_CreateBy,
            'vnp_OrderInfo': vnp_OrderInfo,
            'vnp_TransactionDate': vnp_TransactionDate,
            'vnp_CreateDate': vnp_CreateDate,
            'vnp_IpAddr': vnp_IpAddr,
            'vnp_SecureHash': vnp_SecureHash
        };

        try {
            const response = await axios.post(vnp_Api, dataObj, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            console.log("Hoàn tiền: ", response);

            return response.data;
        } catch (error: any) {
            console.error('Error processing VNPAY refund:', error.response?.data || error.message);
            throw new Error('VNPAY refund failed');
        }

    }
}

function sortObject(obj: Record<string, any>) {
    const sorted: Record<string, string> = {};
    const str: string[] = [];
    let key: string;

    for (key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            str.push(encodeURIComponent(key));
        }
    }

    str.sort();

    for (let i = 0; i < str.length; i++) {
        sorted[str[i]] = encodeURIComponent(obj[str[i]]).replace(/%20/g, "+");
    }

    return sorted;
}
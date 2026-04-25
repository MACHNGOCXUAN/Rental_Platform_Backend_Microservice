import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { getRequiredEnv } from "../env.config";
import * as crypto from 'crypto';
import axios from "axios";

@Injectable()
export class MomoService {
    async handleRefund(params: { amount: string, transId: string, description: string }) {
        const accessKey = getRequiredEnv("MOMO_ACCESS_KEY");
        const secretKey = getRequiredEnv("MOMO_SECRET_KEY");
        const partnerCode = "MOMO";
        const urlRefund = getRequiredEnv("MOMO_REFUND_ENDPOINT");

        const orderId = Date.now().toString(); // Nên dùng UUID hoặc logic tạo mã duy nhất
        const requestId = Date.now().toString();
        const { amount, transId, description } = params;
        const lang = "vi";

        const rawSignature = `accessKey=${accessKey}&amount=${amount}&description=${description}&orderId=${orderId}&partnerCode=${partnerCode}&requestId=${requestId}&transId=${transId}`;

        const signature = crypto
            .createHmac('sha256', secretKey)
            .update(rawSignature)
            .digest('hex');

        const requestBody = {
            partnerCode,
            orderId,
            requestId,
            amount: Number(amount),
            transId: Number(transId),
            lang,
            description,
            signature,
        };

        try {
            const response = await axios.post(
                urlRefund,
                requestBody
            );

            // Momo trả về kết quả như sau:
            // {
            //     "partnerCode": "MOMO",
            //     "orderId": "1527297954700",
            //     "requestId": "1527314064527",
            //     "amount": 55000,
            //     "transId": 144518121,
            //     "resultCode": 0,
            //     "message": "Thành công",
            //     "responseTime": 12454547875
            // }

            return response.data;
        } catch (error: any) {
            console.error("Momo Refund Error:", error.response?.data || error.message);
            throw new InternalServerErrorException("Lỗi khi gọi API hoàn tiền MoMo");
        }
    }
}
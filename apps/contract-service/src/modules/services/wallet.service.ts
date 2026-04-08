import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { Prisma } from 'generated/prisma/client';
import { WithdrawalStatus } from 'generated/prisma/enums';
import axios from 'axios';
import { createHmac } from 'crypto';
import * as crypto from 'crypto';
import {
    ConfirmWalletTopupDto,
    WalletTopupDto,
    WalletTransactionQueryDto,
    WithdrawalQueryDto,
    WithdrawalRequestDto,
} from '../dtos/wallet.dto';

@Injectable()
export class WalletService {

    constructor(
        private readonly db: DatabaseService,
    ) { }

    // Tạo ví mới cho người dùng
    async createWallet(userId: string) {
        const existingWallet = await this.db.wallet.findUnique({
            where: { userId: userId },
        });
        if (existingWallet) {
            throw new BadRequestException('Ví đã tồn tại cho người dùng này!');
        }
        await this.db.wallet.create({
            data: {
                userId: userId,
                balance: 0,
            },
        });
    }

    // Lấy số dư ví của người dùng
    async getWalletBalance(userId: string) {
        const wallet = await this.db.wallet.findUnique({
            where: { userId: userId },
        });
        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }
        return {
            walletId: wallet.walletId,
            userId: wallet.userId,
            currency: wallet.currency,
            availableBalance: wallet.balance,
            pendingBalance: wallet.pendingBalance,
            totalBalance: wallet.balance.add(wallet.pendingBalance),
            updatedAt: wallet.updatedAt,
        };
    }

    private getRequiredEnv(key: string) {
        const value = process.env[key];
        if (!value) {
            throw new BadRequestException(`Thiếu cấu hình thanh toán: ${key}`);
        }
        return value;
    }

    private async createMomoTopupPayment(transactionId: string, amount: number) {
        const partnerCode = this.getRequiredEnv('MOMO_PARTNER_CODE');
        const accessKey = this.getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = this.getRequiredEnv('MOMO_SECRET_KEY');
        const endpoint = this.getRequiredEnv('MOMO_ENDPOINT');
        const redirectUrl = this.getRequiredEnv('MOMO_REDIRECT_URL_WALLET');
        const ipnUrl = this.getRequiredEnv('MOMO_IPN_URL_WALLET');

        console.log("ipnUrl: ", ipnUrl);

        console.log("env: ", redirectUrl);
        

        const requestType = process.env.MOMO_REQUEST_TYPE || 'captureWallet';
        const orderId = transactionId;
        const requestId = `${transactionId}-${Date.now()}`;
        const extraData = '';
        const orderInfo = `Nạp tiền vào ví qua MoMo_${transactionId}`;

        const rawSignature =
            `accessKey=${accessKey}` +
            `&amount=${amount}` +
            `&extraData=${extraData}` +
            `&ipnUrl=${ipnUrl}` +
            `&orderId=${orderId}` +
            `&orderInfo=${orderInfo}` +
            `&partnerCode=${partnerCode}` +
            `&redirectUrl=${redirectUrl}` +
            `&requestId=${requestId}` +
            `&requestType=${requestType}`;

        const signature = createHmac('sha256', secretKey)
            .update(rawSignature)
            .digest('hex');

        const payload = {
            partnerCode,
            accessKey,
            requestId,
            amount: String(amount),
            orderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            requestType,
            extraData,
            signature,
            lang: 'vi',
        };

        const response = await axios.post(endpoint, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        const data = response.data || {};
        return {
            paymentUrl: data.payUrl || data.shortLink || data.deeplink,
            qrCodeUrl: data.qrCodeUrl || data.qrCode || null,
            deeplink: data.deeplink || null,
            requestId,
            orderId,
            response: data,
        };
    }

    private createVnpayTopupPayment(transactionId: string, amount: number) {
        const tmnCode = this.getRequiredEnv('VNPAY_TMN_CODE');
        const hashSecret = this.getRequiredEnv('VNPAY_HASH_SECRET');
        const paymentUrl = this.getRequiredEnv('VNPAY_URL');
        const returnUrl = this.getRequiredEnv('VNPAY_RETURN_URL');
        const ipAddr = process.env.VNPAY_IP_ADDR || '127.0.0.1';
        const locale = process.env.VNPAY_LOCALE || 'vn';
        const orderType = process.env.VNPAY_ORDER_TYPE || 'billpayment';
        const createDate = this.formatVnpDate(new Date());
        const expireDate = this.formatVnpDate(new Date(Date.now() + 15 * 60 * 1000));

        const params: Record<string, string> = {
            vnp_Version: process.env.VNPAY_VERSION || '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: tmnCode,
            vnp_Amount: String(amount * 100),
            vnp_CreateDate: createDate,
            vnp_CurrCode: 'VND',
            vnp_IpAddr: ipAddr,
            vnp_Locale: locale,
            vnp_OrderInfo: `Nạp tiền vào ví qua VNPAY_${transactionId}`,
            vnp_OrderType: orderType,
            vnp_ReturnUrl: returnUrl,
            vnp_TxnRef: transactionId,
            vnp_ExpireDate: expireDate,
        };

        const sortedParams = Object.keys(params)
            .sort()
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');

        const secureHash = createHmac('sha512', hashSecret)
            .update(sortedParams)
            .digest('hex');

        return {
            paymentUrl: `${paymentUrl}?${sortedParams}&vnp_SecureHash=${secureHash}`,
        };
    }

    private createZaloPayTopupPayment(transactionId: string, amount: number) {
        const baseUrl = process.env.WALLET_ZALOPAY_PAYMENT_URL;
        if (!baseUrl) {
            throw new BadRequestException('Chưa cấu hình WALLET_ZALOPAY_PAYMENT_URL');
        }

        return {
            paymentUrl: `${baseUrl}?appTransId=${transactionId}&amount=${amount}`,
        };
    }

    private formatVnpDate(date: Date) {
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const vnTime = new Date(utc + (7 * 60 * 60000));

        const year = vnTime.getFullYear();
        const month = String(vnTime.getMonth() + 1).padStart(2, '0');
        const day = String(vnTime.getDate()).padStart(2, '0');
        const hours = String(vnTime.getHours()).padStart(2, '0');
        const minutes = String(vnTime.getMinutes()).padStart(2, '0');
        const seconds = String(vnTime.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }

    async initiateTopup(userId: string, dto: WalletTopupDto) {
        const wallet = await this.db.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }

        const amount = new Prisma.Decimal(dto.amount);

        const transaction = await this.db.walletTransaction.create({
            data: {
                walletId: wallet.walletId,
                amount,
                type: 'deposit',
                status: 'pending',
                description: `Nạp tiền vào ví qua ${dto.method}`,
            },
        });

        if (dto.method === 'bank_transfer') {
            return {
                transactionId: transaction.id,
                method: dto.method,
                status: transaction.status,
                amount: dto.amount,
                bankInfo: {
                    bankName: process.env.WALLET_BANK_NAME || 'Vietcombank',
                    accountNumber: process.env.WALLET_BANK_ACCOUNT || '123456789',
                    accountName: process.env.WALLET_BANK_ACCOUNT_NAME || 'RENTAL PLATFORM JSC',
                    transferContent: `TOPUP ${transaction.id.slice(0, 10).toUpperCase()}`,
                },
            };
        }

        if (dto.method === 'momo') {
            const momoResult = await this.createMomoTopupPayment(transaction.id, dto.amount);
            return {
                transactionId: transaction.id,
                method: dto.method,
                status: transaction.status,
                amount: dto.amount,
                paymentUrl: momoResult.paymentUrl,
                qrCodeUrl: momoResult.qrCodeUrl,
                deeplink: momoResult.deeplink,
                gateway: 'momo',
            };
        }

        if (dto.method === 'vnpay') {
            const vnpayResult = this.createVnpayTopupPayment(transaction.id, dto.amount);
            return {
                transactionId: transaction.id,
                method: dto.method,
                status: transaction.status,
                amount: dto.amount,
                paymentUrl: vnpayResult.paymentUrl,
                gateway: 'vnpay',
            };
        }

        if (dto.method === 'zalopay') {
            const zaloResult = this.createZaloPayTopupPayment(transaction.id, dto.amount);
            return {
                transactionId: transaction.id,
                method: dto.method,
                status: transaction.status,
                amount: dto.amount,
                paymentUrl: zaloResult.paymentUrl,
                gateway: 'zalopay',
            };
        }

        return {
            transactionId: transaction.id,
            method: dto.method,
            status: transaction.status,
            amount: dto.amount,
        };
    }

    async getTopupStatus(userId: string, transactionId: string) {
        const transaction = await this.db.walletTransaction.findUnique({
            where: { id: transactionId },
            include: {
                wallet: true,
            },
        });

        if (!transaction) {
            throw new NotFoundException('Không tìm thấy giao dịch nạp ví');
        }

        if (transaction.wallet.userId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem giao dịch này');
        }

        return {
            transactionId: transaction.id,
            status: transaction.status,
            amount: transaction.amount,
            description: transaction.description,
            createdAt: transaction.createdAt,
        };
    }

    async confirmTopup(userId: string, transactionId: string, dto: ConfirmWalletTopupDto) {
        return this.db.$transaction(async (tx) => {
            const transaction = await tx.walletTransaction.findUnique({
                where: { id: transactionId },
            });

            if (!transaction) {
                throw new NotFoundException('Không tìm thấy giao dịch nạp ví');
            }

            const wallet = await tx.wallet.findUnique({
                where: { walletId: transaction.walletId },
            });

            if (!wallet) {
                throw new NotFoundException('Không tìm thấy ví');
            }

            if (wallet.userId !== userId) {
                throw new ForbiddenException('Bạn không có quyền xác nhận giao dịch này');
            }

            if (transaction.type !== 'deposit') {
                throw new BadRequestException('Giao dịch không phải nạp tiền');
            }

            if (transaction.status === 'success') {
                return {
                    transactionId: transaction.id,
                    status: transaction.status,
                    balance: wallet.balance,
                };
            }

            const paidAmount = dto.paidAmount != null
                ? new Prisma.Decimal(dto.paidAmount)
                : transaction.amount;

            if (paidAmount.lte(0)) {
                throw new BadRequestException('Số tiền nạp không hợp lệ');
            }

            const updatedWallet = await tx.wallet.update({
                where: { walletId: wallet.walletId },
                data: {
                    balance: wallet.balance.add(paidAmount),
                },
            });

            const updatedTransaction = await tx.walletTransaction.update({
                where: { id: transaction.id },
                data: {
                    amount: paidAmount,
                    status: 'success',
                    description: dto.transactionRef
                        ? `${transaction.description || 'TOPUP'} | REF:${dto.transactionRef}`
                        : transaction.description,
                },
            });

            return {
                transactionId: updatedTransaction.id,
                status: updatedTransaction.status,
                paidAmount,
                balance: updatedWallet.balance,
            };
        });
    }

    async handleMomoTopupWebhook(body: any) {
        const accessKey = this.getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = this.getRequiredEnv('MOMO_SECRET_KEY');

        // MoMo sẽ gửi resultCode = 0 khi giao dịch thành công, các giá trị khác đều là thất bại
        if (body.resultCode !== 0) {
            return { success: false, message: 'Thanh toán thất bại', resultCode: body.resultCode };
        }
        
        // Xác thực chữ ký của MoMo để đảm bảo tính hợp lệ của dữ liệu
        const isValid = verifyMomoTopupSignature(body, accessKey, secretKey);
        if (!isValid) {
            throw new BadRequestException('Chữ ký không hợp lệ, có thể là dữ liệu giả mạo');
        }

        // Lấy transactionId từ orderId đã gửi khi tạo giao dịch nạp tiền.
        const transactionId = String(body.orderId || '');
        if (!transactionId) {
            throw new BadRequestException('Thiếu transactionId trong dữ liệu webhook');
        }

        // Cập nhật giao dịch nạp tiền và số dư ví trong một transaction để đảm bảo tính nhất quán
        return this.db.$transaction(async (tx) => {
            // Tìm giao dịch nạp tiền dựa vào transactionId
            const transaction = await tx.walletTransaction.findUnique({
                where: { id: transactionId },
            });

            if (!transaction) {
                throw new NotFoundException('Không tìm thấy giao dịch nạp ví');
            }

            if (transaction.status === 'success') {
                return { success: true, status: 'already_success' };
            }

            if (transaction.type !== 'deposit') {
                throw new BadRequestException('Giao dịch không phải nạp ví');
            }

            // Tìm ví liên quan đến giao dịch nạp tiền
            const wallet = await tx.wallet.findUnique({
                where: { walletId: transaction.walletId },
            });

            if (!wallet) {
                throw new NotFoundException('Không tìm thấy ví');
            }

            // Cập nhật số dư ví
            const paidAmount = new Prisma.Decimal(Number(body.amount || transaction.amount));
            await tx.wallet.update({
                where: { walletId: wallet.walletId },
                data: {
                    balance: wallet.balance.add(paidAmount),
                },
            });

            // Cập nhật trạng thái giao dịch nạp tiền
            await tx.walletTransaction.update({
                where: { id: transaction.id },
                data: {
                    amount: paidAmount,
                    status: 'success',
                    description: `${transaction.description || 'Nạp tiền momo'} | MOMO-${body.transId || ''}`,
                },
            });

            return {
                success: true,
                transactionId: transaction.id,
                paidAmount,
            };
        });
    }

    async createWithdrawalRequest(userId: string, dto: WithdrawalRequestDto) {
        return this.db.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({
                where: { userId },
            });

            if (!wallet) {
                throw new NotFoundException('Ví không tồn tại cho người dùng này.');
            }

            const amount = new Prisma.Decimal(dto.amount);

            if (wallet.balance.lt(amount)) {
                throw new BadRequestException('Số dư khả dụng không đủ để rút');
            }

            const withdrawal = await tx.withdrawalRequest.create({
                data: {
                    walletId: wallet.walletId,
                    amount,
                    bankCode: dto.bankCode.trim().toUpperCase(),
                    accountNumber: dto.accountNumber.trim(),
                    accountName: dto.accountName.trim(),
                    status: 'pending',
                },
            });

            await tx.wallet.update({
                where: { walletId: wallet.walletId },
                data: {
                    balance: wallet.balance.sub(amount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: wallet.walletId,
                    amount: amount.neg(),
                    type: 'withdraw',
                    status: 'pending',
                    referenceId: withdrawal.id,
                    description: `Yêu cầu rút tiền ${withdrawal.id.slice(0, 10).toUpperCase()}`,
                },
            });

            return withdrawal;
        });
    }

    async getMyWithdrawalRequests(userId: string, query: WithdrawalQueryDto) {
        const wallet = await this.db.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }

        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: { walletId: string; status?: WithdrawalStatus } = {
            walletId: wallet.walletId,
        };

        if (query.status) {
            where.status = query.status;
        }

        const [items, total] = await Promise.all([
            this.db.withdrawalRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.db.withdrawalRequest.count({ where }),
        ]);

        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getWalletTransactions(userId: string, query: WalletTransactionQueryDto) {
        const wallet = await this.db.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }

        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = { walletId: wallet.walletId };
        if (query.type) {
            where.type = query.type;
        }
        if (query.status) {
            where.status = query.status;
        }

        const [items, total] = await Promise.all([
            this.db.walletTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.db.walletTransaction.count({ where }),
        ]);

        console.log("klm: ", items[0]);
        

        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // Nạp tiền vào ví
    async addFunds(userId: string, amount: number) {
        const wallet = await this.db.wallet.findUnique({
            where: { userId: userId },
        });
        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }
        await this.db.wallet.update({
            where: { userId: userId },
            data: { balance: wallet.balance.toNumber() + amount },
        });
    }


    // Rút tiền từ ví
    async deductFunds(userId: string, amount: number): Promise<void> {
        const wallet = await this.db.wallet.findUnique({
            where: { userId: userId },
        });
        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }
        if (wallet.balance.toNumber() < amount) {
            throw new ForbiddenException('Số dư trong ví không đủ.');
        }
        await this.db.wallet.update({
            where: { userId: userId },
            data: { balance: wallet.balance.toNumber() - amount },
        });
    }


}

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

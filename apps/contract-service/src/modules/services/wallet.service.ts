import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { Prisma } from 'generated/prisma/client';
import { PaymentMethod, WalletTransactionStatus, WalletTransactionType, WithdrawalStatus } from 'generated/prisma/enums';
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
import { formatVnpDate } from 'src/utils/payment.util';
import { getRequiredEnv } from 'src/utils/env.config';
import { verifyVnpSignature } from 'src/utils/vnpay/vnpay.util';
import { verifyMomoTopupSignature } from 'src/utils/momo/momo.utils';
import { PaymentService } from './payment.service';
import { WalletTransaction } from 'generated/prisma/browser';

@Injectable()
export class WalletService {

    constructor(
        private readonly db: DatabaseService,
        private readonly paymentService: PaymentService,
    ) { }

    // Tạo ví mới cho người dùng (idempotent - bỏ qua nếu đã tồn tại)
    async createWallet(userId: string) {
        const existingWallet = await this.db.wallet.findUnique({
            where: { userId: userId },
        });
        if (existingWallet) {
            return existingWallet;
        }
        return await this.db.wallet.create({
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

    // Nạp tiền vào ví bằng Momo
    private async createMomoTopupPayment(transactionId: string, amount: number, platform?: string) {
        const partnerCode = getRequiredEnv('MOMO_PARTNER_CODE');
        const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = getRequiredEnv('MOMO_SECRET_KEY');
        const endpoint = getRequiredEnv('MOMO_ENDPOINT');
        const redirectUrl = platform === 'mobile'
            ? (process.env.MOMO_REDIRECT_URL_MOBILE || 'mobileclient://payment-result')
            : getRequiredEnv('MOMO_REDIRECT_URL_WALLET');
        const ipnUrl = getRequiredEnv('MOMO_IPN_URL_WALLET');

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

        console.log("helooL: ", rawSignature);


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

    // Nạp tiền vào ví bằng VNPAY
    async createVnpayTopupPayment(transactionId: string, amount: number, platform?: string) {
        const tmnCode = getRequiredEnv('VNPAY_TMN_CODE');
        const hashSecret = getRequiredEnv('VNPAY_HASH_SECRET');
        const paymentUrl = getRequiredEnv('VNPAY_URL');
        const returnUrl = platform === 'mobile'
            ? (process.env.MOMO_REDIRECT_URL_MOBILE || 'mobileclient://payment-result')
            : getRequiredEnv('VNPAY_RETURN_URL_WALLET');
        const ipAddr = process.env.VNPAY_IP_ADDR || '127.0.0.1';
        const locale = process.env.VNPAY_LOCALE || 'vn';
        const currCode = process.env.VNPAY_CURRENCY_CODE || 'VND';
        const orderType = process.env.VNPAY_ORDER_TYPE || 'other';
        const txnRef = transactionId;
        const createDate = formatVnpDate(new Date());
        const expireDate = formatVnpDate(new Date(Date.now() + 15 * 60 * 1000));

        // Kiểm tra tính hợp lệ của số tiền
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestException('Số tiền thanh toán không hợp lệ');
        }

        // Tạo đối tượng tham số cho VNPAY
        const vnpParams = {
            vnp_Amount: String(amount * 100),
            vnp_Command: 'pay',
            vnp_CreateDate: createDate,
            vnp_CurrCode: currCode,
            vnp_ExpireDate: expireDate,
            vnp_IpAddr: ipAddr,
            vnp_Locale: locale,
            vnp_OrderInfo: `Nạp tiền vào ví qua VNPAY_${txnRef}`,
            vnp_OrderType: orderType,
            vnp_ReturnUrl: returnUrl,
            vnp_TmnCode: tmnCode,
            vnp_TxnRef: txnRef,
            vnp_Version: '2.1.0',
        };


        // Sắp xếp tham số theo alphabet
        const sortedParams = {};
        Object.keys(vnpParams).sort().forEach(key => {
            sortedParams[key] = vnpParams[key];
        });

        // Tạo chuỗi dữ liệu để băm (Sử dụng URLSearchParams để chuẩn hóa)
        const signData = Object.keys(sortedParams)
            .map(key => `${key}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, "+")}`)
            .join('&');

        // Tạo SecureHash
        const secureHash = crypto
            .createHmac("sha512", hashSecret)
            .update(Buffer.from(signData, 'utf-8'))
            .digest("hex");

        // Build URL thanh toán cuối cùng
        const finalQuery = Object.keys(sortedParams)
            .map(key => `${key}=${encodeURIComponent(sortedParams[key]).replace(/%20/g, "+")}`)
            .join('&');

        const checkoutUrl = `${paymentUrl}?${finalQuery}&vnp_SecureHash=${secureHash}`;


        return {
            paymentUrl: checkoutUrl,
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

    // Tạo yêu cầu nạp tiền vào ví với các phương thức khác nhau
    async initiateTopup(userId: string, dto: WalletTopupDto) {
        const wallet = await this.db.wallet.findUnique({
            where: { userId },
        });

        if (!wallet) {
            throw new NotFoundException('Ví không tồn tại cho người dùng này.');
        }

        // Chuyển đổi số tiền sang Decimal để lưu vào database và xử lý chính xác hơn
        const amount = new Prisma.Decimal(dto.amount);

        // Tạo giao dịch nạp tiền với trạng thái pending để chờ xác nhận sau này
        const transaction = await this.db.walletTransaction.create({
            data: {
                walletId: wallet.walletId,
                amount,
                type: 'deposit',
                status: 'pending',
                description: `Nạp tiền vào ví qua ${dto.method}`,
            },
        });

        // Nạp tiền bằng phương thức chuyển khoản ngân hàng
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

        // Nạp tiền bằng ví điện tử MoMo
        if (dto.method === 'momo') {
            const momoResult = await this.createMomoTopupPayment(transaction.id, dto.amount, dto.platform);
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

        // Nạp tiền bằng cổng thanh toán VNPAY
        if (dto.method === 'vnpay') {
            const vnpayResult = this.createVnpayTopupPayment(transaction.id, dto.amount, dto.platform);
            console.log("vnpayUrl: ", (await vnpayResult).paymentUrl);

            return {
                transactionId: transaction.id,
                method: dto.method,
                status: transaction.status,
                amount: dto.amount,
                paymentUrl: (await vnpayResult).paymentUrl,
                gateway: 'vnpay',
            };
        }

        // Nạp tiền bằng ví điện tử ZaloPay
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

    // Lấy trạng thái giao dịch nạp tiền
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

    // Xác nhận giao dịch nạp tiền (dành cho admin hoặc để xử lý webhook từ cổng thanh toán)
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

    // Xử lý webhook từ MoMo sau khi người dùng hoàn tất thanh toán trên ứng dụng MoMo
    async handleMomoTopupWebhook(body: any) {
        const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = getRequiredEnv('MOMO_SECRET_KEY');

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

    // Xử lý webhook từ VNPAY sau khi người dùng hoàn tất thanh toán trên cổng VNPAY
    async handleVnpayTopupWebhook(body: any) {
        console.log("ịn: ", body);

        const hashSecret = getRequiredEnv('VNPAY_HASH_SECRET');

        // VNPAY sẽ gửi vnp_ResponseCode = 00 khi giao dịch thành công, các giá trị khác đều là thất bại
        if (body.vnp_ResponseCode !== '00') {
            return { success: false, message: 'Thanh toán thất bại', vnp_ResponseCode: body.vnp_ResponseCode };
        }

        // Xác thực chữ ký của VNPAY để đảm bảo tính hợp lệ của dữ liệu
        const isValid = verifyVnpSignature(body, hashSecret);

        if (!isValid) {
            throw new BadRequestException('Chữ ký không hợp lệ, có thể là dữ liệu giả mạo');
        }

        // Lấy transactionId từ vnp_TxnRef đã gửi khi tạo giao dịch nạp tiền.
        const transactionId = String(body.vnp_TxnRef || '');
        if (!transactionId) {
            throw new BadRequestException('Thiếu transactionId trong dữ liệu webhook');
        }

        // Kiểm tra xem giao dịch là nạp tiền hay thanh toán hoa đơn
        if (body.vnp_OrderInfo.startsWith("Thanh toan ma ")) {
            const txnRefFromOrderInfo = body.vnp_OrderInfo.replace("Thanh toan ma ", "").trim();
            if (txnRefFromOrderInfo !== transactionId) {
                throw new BadRequestException('transactionId không khớp với thông tin trong orderInfo');
            }

            const paymentCode = transactionId;

            const payment = await this.db.payment.findUnique({
                where: { paymentCode: paymentCode },
                include: {
                    contract: true,
                    rentalRequest: true,
                }
            });

            if (!payment) {
                throw new NotFoundException('Không tìm thấy giao dịch thanh toán');
            }

            // Cập nhật trạng thái thanh toán thành success
            return this.db.$transaction(async (tx) => {
                const updatedPayment = await tx.payment.update({
                    where: { paymentId: payment.paymentId },
                    data: {
                        status: 'paid',
                        paymentMethod: payment.paymentMethod ?? PaymentMethod.vnpay,
                        transactionId,
                        transactionRef: `VNPAY-${body.vnp_TransactionNo || ''}`,
                        paidAmount: payment.amount,
                        paymentCode: transactionId,
                        remainingAmount: 0,
                        paidAt: new Date(),
                        confirmedAt: new Date()
                    }
                });

                await this.paymentService.writeBlockchainProofForPayment(updatedPayment.paymentId);

                // Sau khi cập nhật thanh toán thành công, tiến hành xử lý chuyển tiền cho chủ nhà nếu có
                await this.paymentService.settleIncomeForOwner(tx, {
                    payment: updatedPayment,
                    contract: payment.contract,
                    rentalRequest: payment.rentalRequest,
                    descriptionSuffix: `| VNPAY-${body.vnp_TransactionNo || ''}`,
                })
            })
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
            if (transaction.status === WalletTransactionStatus.success) {
                return { success: true, status: 'already_success' };
            }
            if (transaction.type !== WalletTransactionType.deposit) {
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
            const paidAmount = new Prisma.Decimal(Number(body.vnp_Amount || transaction.amount) / 100);
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
                    status: WalletTransactionStatus.success,
                    description: `${transaction.description || 'Nạp tiền VNPAY'} | VNPAY-${body.vnp_TransactionNo || ''}`,
                },
            });
            return {
                success: true,
                transactionId: transaction.id,
                paidAmount,
            };
        });
    }

    // Tạo yêu cầu rút tiền từ ví
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
                    status: WithdrawalStatus.pending,
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
                    withdrawalRequestId: withdrawal.id,
                    description: `Yêu cầu rút tiền ${withdrawal.id.slice(0, 10).toUpperCase()}`,
                },
            });

            setTimeout(() => {
                this.processWithdrawal(withdrawal.id);
            }, 5000);

            return withdrawal;
        });
    }

    // Lấy lịch sử yêu cầu rút tiền của người dùng
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

    // Lấy lịch sử giao dịch của ví
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

    async getWithdrawalRequestById(userId: string, withdrawalId: string) {
        const withdrawal = await this.db.withdrawalRequest.findUnique({
            where: { id: withdrawalId },
            include: {
                wallet: true,
            }
        });

        if (!withdrawal) {
            throw new NotFoundException('Không tìm thấy yêu cầu rút tiền');
        }
        if (withdrawal.wallet.userId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem yêu cầu rút tiền này');
        }
        return withdrawal;
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

    // Xử lý yêu cầu rút tiền (giả lập xử lý thủ công, thực tế sẽ có quy trình phê duyệt và xử lý riêng)
    async processWithdrawal(id: string) {
        return this.db.$transaction(async (tx) => {
            const withdrawal = await tx.withdrawalRequest.findUnique({
                where: { id },
            });

            if (!withdrawal || withdrawal.status !== 'pending') return;

            const success = Math.random() > 0.2;

            const transaction = await tx.walletTransaction.findFirst({
                where: {
                    withdrawalRequestId: id,
                    type: 'withdraw',
                },
            });

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            await tx.withdrawalRequest.update({
                where: { id },
                data: { status: WithdrawalStatus.processing },
            });

            if (success) {
                // ✅ SUCCESS
                await tx.withdrawalRequest.update({
                    where: { id },
                    data: { status: 'success', processedAt: new Date() },
                });

                await tx.walletTransaction.update({
                    where: { id: transaction.id },
                    data: { status: 'success' },
                });

            } else {
                // Cập nhật trạng thái yêu cầu rút tiền thành rejected
                await tx.withdrawalRequest.update({
                    where: { id },
                    data: { status: WithdrawalStatus.rejected, processedAt: new Date() },
                });

                // Hoàn tiền lại cho người dùng bằng cách cộng lại số tiền đã trừ khi tạo yêu cầu rút tiền
                await tx.wallet.update({
                    where: { walletId: withdrawal.walletId },
                    data: {
                        balance: {
                            increment: withdrawal.amount,
                        },
                    },
                });

                // Cập nhật trạng thái giao dịch rút tiền thành failed
                await tx.walletTransaction.update({
                    where: { id: transaction.id },
                    data: { status: 'failed' },
                });

                // Tạo giao dịch hoàn tiền (refund) để ghi nhận việc hoàn tiền do yêu cầu rút tiền bị từ chối
                await tx.walletTransaction.create({
                    data: {
                        walletId: withdrawal.walletId,
                        amount: withdrawal.amount,
                        type: 'refund',
                        status: 'success',
                        withdrawalRequestId: id,
                        description: `Refund withdrawal ${id}`,
                    },
                });
            }
        });
    }

    async queryVnpayPaymentStatus(
        transaction: WalletTransaction
    ) {

        const tmnCode = getRequiredEnv('VNPAY_TMN_CODE');
        const hashSecret = getRequiredEnv('VNPAY_HASH_SECRET');
        const endpoint = getRequiredEnv('VNPAY_QUERY_URL');
        const ipAddr =
            process.env.VNPAY_IP_ADDR || '127.0.0.1';

        const txnRef = transaction.id;

        const createDate = formatVnpDate(
            transaction.createdAt ?? new Date()
        );

        const transactionDate = createDate;

        const requestId = crypto.randomUUID();

        const orderInfo = `Thanh toan ma ${txnRef}`;

        const vnpParams: Record<string, any> = {
            vnp_RequestId: requestId,
            vnp_Version: '2.1.0',
            vnp_Command: 'querydr',
            vnp_TmnCode: tmnCode,
            vnp_TxnRef: txnRef,
            vnp_OrderInfo: orderInfo,
            vnp_TransactionDate: formatVnpDate(transaction.createdAt),
            vnp_CreateDate: formatVnpDate(new Date()),
            vnp_IpAddr: ipAddr
        };

        const secureHash = this.paymentService.buildVnpayQueryDrHash(vnpParams, hashSecret);
        const requestData = {
            ...vnpParams,
            vnp_SecureHash: secureHash,
        };

        const response = await axios.post(
            endpoint,
            requestData,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            },
        );

        const data = response.data || {};

        if (data.vnp_SecureHash && !this.paymentService.verifyVnpayQueryDrResponse(data, hashSecret)) {
            throw new BadRequestException('VNPAY signature mismatch');
        }

        const responseCode = data.vnp_ResponseCode;
        const transactionStatus = data.vnp_TransactionStatus;
        const paidAmount = data.vnp_Amount
            ? Number(data.vnp_Amount) / 100
            : Number(transaction.amount);

        return {
            isPaid: responseCode === '00' && transactionStatus === '00',
            status: `${responseCode ?? 'unknown'}:${transactionStatus ?? 'unknown'}`,
            transactionId: data.vnp_TransactionNo ? String(data.vnp_TransactionNo) : undefined,
            transactionRef: data.vnp_TransactionNo ? `VNPAY-${data.vnp_TransactionNo}` : undefined,
            amount: paidAmount,
            raw: data,
        };
    }

    // Hàm để kiểm tra và đối chiếu các giao dịch nạp tiền đang ở trạng thái pending, cập nhật trạng thái và số dư ví tương ứng
    async reconcilePendingTransactions({
        limit,
    }: {
        limit?: number;
    }) {

        const limitTrans = limit ?? 50;

        const pendingTransactions = await this.db.walletTransaction.findMany({
            where: {
                status: 'pending',

                // chỉ poll transaction dưới 5 lần
                pollingCount: {
                    lt: 5,
                },
            },
            orderBy: {
                createdAt: 'asc',
            },
            take: limitTrans,
        });

        const results: Array<Record<string, any>> = [];
        let updatedCount = 0;

        for (const transaction of pendingTransactions) {

            try {

                // ================= INCREMENT POLLING =================
                const updatedTransaction =
                    await this.db.walletTransaction.update({
                        where: {
                            id: transaction.id,
                        },
                        data: {
                            pollingCount: {
                                increment: 1,
                            }
                        },
                    });

                const currentPolling = updatedTransaction.pollingCount;

                // ================= CHECK TYPE =================
                if (transaction.type !== 'deposit') {

                    results.push({
                        transactionId: transaction.id,
                        type: transaction.type,
                        previousStatus: transaction.status,
                        newStatus: 'skipped',
                        pollingCount: currentPolling,
                        reason: 'Transaction type not supported',
                    });

                    continue;
                }

                // ================= DETECT PAYMENT METHOD =================
                const description =
                    transaction.description?.toLowerCase() ?? '';

                const isMomo = description.includes('momo');
                const isVnpay = description.includes('vnpay');

                // =========================================================
                // ======================= VNPAY ===========================
                // =========================================================
                if (isVnpay) {

                    const vnpayResult =
                        await this.queryVnpayPaymentStatus(transaction);

                    console.log("Kiem tra naptien: ", vnpayResult);


                    // ===== SUCCESS =====
                    if (vnpayResult.isPaid) {

                        await this.db.$transaction(async (tx) => {

                            const wallet = await tx.wallet.findUnique({
                                where: {
                                    walletId: transaction.walletId,
                                },
                            });

                            if (!wallet) {
                                throw new NotFoundException(
                                    'Không tìm thấy ví'
                                );
                            }

                            // cộng tiền ví
                            await tx.wallet.update({
                                where: {
                                    walletId: wallet.walletId,
                                },
                                data: {
                                    balance: wallet.balance.add(
                                        vnpayResult.amount
                                    ),
                                },
                            });

                            // update transaction
                            await tx.walletTransaction.update({
                                where: {
                                    id: transaction.id,
                                },
                                data: {
                                    amount: vnpayResult.amount,
                                    status: 'success',
                                    description:
                                        `${transaction.description ?? ''} | ` +
                                        `VNPay status: ${vnpayResult.status}`,
                                },
                            });
                        });

                        updatedCount++;

                        results.push({
                            transactionId: transaction.id,
                            gateway: 'vnpay',
                            previousStatus: transaction.status,
                            newStatus: 'success',
                            pollingCount: currentPolling,
                            details: vnpayResult,
                        });

                        continue;
                    }

                    // ===== FAILED =====
                    if (currentPolling >= 5) {

                        await this.db.walletTransaction.update({
                            where: {
                                id: transaction.id,
                            },
                            data: {
                                status: 'failed',
                                description:
                                    `${transaction.description ?? ''} | ` +
                                    `VNPay polling exceeded limit`,
                            },
                        });

                        results.push({
                            transactionId: transaction.id,
                            gateway: 'vnpay',
                            previousStatus: transaction.status,
                            newStatus: 'failed',
                            pollingCount: currentPolling,
                            reason: 'Polling exceeded limit',
                        });

                        continue;
                    }

                    // ===== PENDING =====
                    results.push({
                        transactionId: transaction.id,
                        gateway: 'vnpay',
                        previousStatus: transaction.status,
                        newStatus: 'pending',
                        pollingCount: currentPolling,
                        details: vnpayResult,
                    });

                    continue;
                }

                // =========================================================
                // ======================== MOMO ===========================
                // =========================================================
                if (isMomo) {

                    const momoResult =
                        await this.queryMomoPaymentStatus(transaction);

                    // ===== SUCCESS =====
                    if (momoResult.isPaid) {

                        await this.db.$transaction(async (tx) => {

                            const wallet = await tx.wallet.findUnique({
                                where: {
                                    walletId: transaction.walletId,
                                },
                            });

                            if (!wallet) {
                                throw new NotFoundException(
                                    'Không tìm thấy ví'
                                );
                            }

                            // cộng tiền vào ví
                            await tx.wallet.update({
                                where: {
                                    walletId: wallet.walletId,
                                },
                                data: {
                                    balance: wallet.balance.add(
                                        momoResult.amount
                                    ),
                                },
                            });

                            // update transaction success
                            await tx.walletTransaction.update({
                                where: {
                                    id: transaction.id,
                                },
                                data: {
                                    amount: momoResult.amount,
                                    status: 'success',
                                    description:
                                        `${transaction.description ?? ''} | ` +
                                        `MoMo status: ${momoResult.status}`,
                                },
                            });
                        });

                        updatedCount++;

                        results.push({
                            transactionId: transaction.id,
                            gateway: 'momo',
                            previousStatus: transaction.status,
                            newStatus: 'success',
                            pollingCount: currentPolling,
                            details: momoResult,
                        });

                        continue;
                    }

                    // ===== FAILED =====
                    if (currentPolling >= 5) {

                        await this.db.walletTransaction.update({
                            where: {
                                id: transaction.id,
                            },
                            data: {
                                status: 'failed',
                                description:
                                    `${transaction.description ?? ''} | ` +
                                    `MoMo polling exceeded limit`,
                            },
                        });

                        results.push({
                            transactionId: transaction.id,
                            gateway: 'momo',
                            previousStatus: transaction.status,
                            newStatus: 'failed',
                            pollingCount: currentPolling,
                            reason: 'Polling exceeded limit',
                        });

                        continue;
                    }

                    // ===== PENDING =====
                    results.push({
                        transactionId: transaction.id,
                        gateway: 'momo',
                        previousStatus: transaction.status,
                        newStatus: 'pending',
                        pollingCount: currentPolling,
                        details: momoResult,
                    });

                    continue;
                }

                // ================= UNKNOWN METHOD =================
                results.push({
                    transactionId: transaction.id,
                    previousStatus: transaction.status,
                    newStatus: 'skipped',
                    pollingCount: currentPolling,
                    reason: 'Unknown payment method',
                });

            } catch (error) {

                console.error(
                    `Reconcile transaction failed: ${transaction.id}`,
                    error,
                );

                results.push({
                    transactionId: transaction.id,
                    previousStatus: transaction.status,
                    newStatus: 'error',
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                });
            }
        }

        return {
            total: pendingTransactions.length,
            updated: updatedCount,
            items: results,
        };
    }

    private async queryMomoPaymentStatus(walletTransaction: WalletTransaction) {
        const partnerCode = getRequiredEnv('MOMO_PARTNER_CODE');
        const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = getRequiredEnv('MOMO_SECRET_KEY');
        const endpoint = getRequiredEnv('MOMO_QUERY_ENDPOINT');

        const orderId = walletTransaction.id;
        const requestId = `query-${orderId}-${Date.now()}`;

        const rawSignature =
            `accessKey=${accessKey}` +
            `&orderId=${orderId}` +
            `&partnerCode=${partnerCode}` +
            `&requestId=${requestId}`;

        const signature = createHmac('sha256', secretKey)
            .update(rawSignature)
            .digest('hex');

        const payload = {
            partnerCode,
            requestId,
            orderId,
            signature,
            lang: 'vi',
        };

        const response = await axios.post(endpoint, payload, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = response.data || {};
        const paidAmount = Number(data.amount ?? walletTransaction.amount);

        return {
            isPaid: data.resultCode === 0,
            status: String(data.resultCode ?? 'unknown'),
            transactionId: data.transId ? String(data.transId) : undefined,
            transactionRef: data.transId ? `MOMO-${data.transId}` : undefined,
            amount: paidAmount,
            raw: data,
        };
    }

    // Khấu trừ tiền từ ví cho các dịch vụ khác (ví dụ: Phí đăng tin)
    async deductWallet(userId: string, amount: number, description: string) {
        return this.db.$transaction(async (tx) => {
            const wallet = await tx.wallet.findUnique({
                where: { userId },
            });

            if (!wallet) {
                // Tạo ví mới với số dư bằng 0 nếu chưa có ví
                await tx.wallet.create({
                    data: { userId, balance: 0 }
                });
                throw new BadRequestException('Số dư khả dụng trong ví không đủ (0đ)');
            }

            const decimalAmount = new Prisma.Decimal(amount);

            if (wallet.balance.lt(decimalAmount)) {
                throw new BadRequestException(`Số dư khả dụng trong ví không đủ (Hiện tại: ${wallet.balance.toString()}đ, cần: ${amount}đ)`);
            }

            const updatedWallet = await tx.wallet.update({
                where: { walletId: wallet.walletId },
                data: {
                    balance: wallet.balance.sub(decimalAmount),
                },
            });

            const transaction = await tx.walletTransaction.create({
                data: {
                    walletId: wallet.walletId,
                    amount: decimalAmount.neg(),
                    type: WalletTransactionType.fee,
                    status: WalletTransactionStatus.success,
                    description,
                },
            });

            return {
                success: true,
                walletId: wallet.walletId,
                previousBalance: wallet.balance.toNumber(),
                newBalance: updatedWallet.balance.toNumber(),
                transactionId: transaction.id,
            };
        });
    }
}


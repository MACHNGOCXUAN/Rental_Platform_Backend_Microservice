import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { ConfirmPaymentDto, PaymentQueryDto, PaymentReconcileQueryDto } from '../dtos/payment.dto';
import { PaymentMethod, PaymentType } from 'generated/prisma/enums';
import { Payment } from 'generated/prisma/browser';
import { createHmac } from 'crypto';
import axios from 'axios';
import { Prisma } from 'generated/prisma/client';
import * as crypto from 'crypto';
import { formatVnpDate, generatePaymentCode, sortAndEncodeParams } from 'src/utils/payment.util';
import { getRequiredEnv } from 'src/utils/env.config';
import { buildSecureHash, sortAndEncodeVnpParams, verifyVnpSignature } from 'src/utils/vnpay/vnpay.util';
import * as qs from 'qs';
import { EstateClientService } from './estate-client.service';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentService {

    constructor(
        private readonly db: DatabaseService,
        private readonly estateClient: EstateClientService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
    ) { }

    private async syncPropertyStatusAfterDeposit(rentalId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId },
            select: {
                rentalId: true,
                propertyId: true,
                status: true,
            },
        });

        if (!contract || contract.status !== 'active') {
            return;
        }

        await this.estateClient.updatePropertyContractStatus(
            contract.propertyId,
            'contract_active',
            contract.rentalId,
        );
    }

    // Tạo phiếu thanh toán đặt cọc khi hợp đồng được ký kết
    async createDepositPayment(rentalId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.status !== 'fully_signed') throw new BadRequestException('Hợp đồng chưa hoàn tất ký kết');

        const existingDeposit = await this.db.payment.findFirst({
            where: { rentalId, paymentType: 'deposit' },
        });
        if (existingDeposit) throw new BadRequestException('Đã tồn tại phiếu thanh toán đặt cọc');

        const depositAmount = contract.depositAmount || contract.monthlyRent;
        if (!depositAmount || Number(depositAmount) <= 0) throw new BadRequestException('Số tiền đặt cọc không hợp lệ');

        // Tạo mã thanh toán duy nhất
        const paymentCode = `DEP-${Date.now()}-${crypto.randomUUID()}`;

        const payment = await this.db.payment.create({
            data: {
                paymentCode: paymentCode,
                rentalId,
                amount: depositAmount,
                paymentType: PaymentType.deposit,
                status: 'pending',
                dueDate: contract.startDate,
                paidAmount: 0,
                remainingAmount: depositAmount,
                currency: 'VND',
            },
        });

        return payment;
    }

    async createRentPayment(rentalId: string, dueDate: Date) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.status !== 'active') throw new BadRequestException('Hợp đồng chưa ở trạng thái active');
        const rentAmount = contract.monthlyRent;
        if (!rentAmount || Number(rentAmount) <= 0) throw new BadRequestException('Số tiền thuê không hợp lệ');

        const normalizedDueInput = this.normalizeDate(dueDate);
        const expectedDueDate = this.buildMonthlyRentDueDate(contract.startDate, contract.paymentDueDay, normalizedDueInput);
        const startDate = this.normalizeDate(contract.startDate);
        const endDate = this.normalizeDate(contract.endDate);

        if (expectedDueDate < startDate || expectedDueDate > endDate) {
            throw new BadRequestException('Ngày đến hạn nằm ngoài thời hạn hợp đồng');
        }

        const existing = await this.findMonthlyRentPayment(rentalId, expectedDueDate);
        if (existing) {
            return existing;
        }

        return this.db.payment.create({
            data: {
                paymentCode: generatePaymentCode('RENT'),
                rentalId,
                paymentType: PaymentType.rent,
                amount: rentAmount,
                remainingAmount: rentAmount,
                dueDate: expectedDueDate,
                status: 'pending',
                currency: 'VND',
            },
        });
    }

    // Lấy danh sách thanh toán của người dùng (chủ nhà và thuê nhà)
    async getMyPayments(userId: string, query: PaymentQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: any = {
            contract: {
                OR: [
                    { ownerId: userId },
                    { tenantId: userId },
                ],
            },
        };

        if (query.rentalId) where.rentalId = query.rentalId;
        if (query.status) where.status = query.status;

        // Lấy danh sách thanh toán với thông tin hợp đồng liên quan
        const [items, total] = await Promise.all([
            this.db.payment.findMany({
                where,
                include: {
                    contract: {
                        select: {
                            rentalId: true,
                            contractCode: true,
                            propertyId: true,
                            ownerId: true,
                            tenantId: true,
                        },
                    },
                },
                orderBy: [
                    { dueDate: 'asc' },
                    { createdAt: 'desc' },
                ],
                skip,
                take: limit,
            }),
            this.db.payment.count({ where }),
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

    private buildFirstRentDueDate(startDate: Date, paymentDueDay: number) {
        const start = new Date(startDate);
        const dueByDay = this.createClampedDate(start.getFullYear(), start.getMonth(), paymentDueDay);
        return dueByDay < start ? start : dueByDay;
    }

    private normalizeDate(date: Date) {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
    }

    private createClampedDate(year: number, month: number, day: number) {
        const maxDay = new Date(year, month + 1, 0).getDate();
        const normalizedDay = Math.min(Math.max(day, 1), maxDay);
        return this.normalizeDate(new Date(year, month, normalizedDay));
    }

    private buildMonthlyRentDueDate(startDate: Date, paymentDueDay: number, baseDate: Date) {
        const base = this.normalizeDate(baseDate);
        const dueByDay = this.createClampedDate(base.getFullYear(), base.getMonth(), paymentDueDay);
        const start = this.normalizeDate(startDate);

        const isFirstBillingMonth =
            start.getFullYear() === base.getFullYear()
            && start.getMonth() === base.getMonth();

        if (isFirstBillingMonth && dueByDay < start) {
            return start;
        }

        return dueByDay;
    }

    private getMonthRange(referenceDate: Date) {
        const date = this.normalizeDate(referenceDate);
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    private async findMonthlyRentPayment(rentalId: string, referenceDate: Date) {
        const { start, end } = this.getMonthRange(referenceDate);

        return this.db.payment.findFirst({
            where: {
                rentalId,
                paymentType: PaymentType.rent,
                dueDate: {
                    gte: start,
                    lte: end,
                },
            },
        });
    }

    // Cập nhật trạng thái thanh toán, chuyển tiền cho chủ nhà
    async settleIncomeForOwner(
        tx: Prisma.TransactionClient,
        params: {
            payment: Payment;
            contract: { rentalId: string; ownerId: string; tenantId: string; startDate: Date; paymentDueDay: number; monthlyRent: Prisma.Decimal; status: string };
            descriptionSuffix: string;
        },
    ) {
        const { payment, contract, descriptionSuffix } = params;

        const ownerWallet = await tx.wallet.findUnique({
            where: { userId: contract.ownerId },
        });
        if (!ownerWallet) throw new NotFoundException('Owner chưa có ví');

        const tenantWallet = await tx.wallet.findUnique({
            where: { userId: contract.tenantId },
        });
        if (!tenantWallet) throw new NotFoundException('Tenant chưa có ví');

        if (payment.paymentType === PaymentType.deposit) {
            const existingDeposit = await tx.depositTransaction.findFirst({
                where: { rentalId: payment.rentalId },
            });

            if (existingDeposit) {
                await tx.depositTransaction.update({
                    where: { id: existingDeposit.id },
                    data: {
                        amount: payment.amount,
                        status: 'held',
                    },
                });
            } else {
                await tx.depositTransaction.create({
                    data: {
                        rentalId: payment.rentalId,
                        amount: payment.amount,
                        status: 'held',
                    },
                });
            }

            if (contract.status !== 'active') {
                await tx.rentalContract.update({
                    where: { rentalId: payment.rentalId },
                    data: { status: 'active' },
                });
            }

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.add(payment.amount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: payment.amount,
                    type: 'hold_deposit',
                    status: 'success',
                    referenceId: payment.paymentId,
                    description: `Nhận tiền đặt cọc (${descriptionSuffix})`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: payment.amount.neg(),
                    type: 'deposit',
                    status: 'success',
                    referenceId: payment.paymentId,
                    description: `Thanh toán tiền đặt cọc cho mã ${payment.paymentCode}`,
                },
            });

            const firstRentDueDate = this.buildFirstRentDueDate(contract.startDate, contract.paymentDueDay);
            const firstRentExists = await tx.payment.findFirst({
                where: {
                    rentalId: contract.rentalId,
                    paymentType: PaymentType.rent,
                    dueDate: firstRentDueDate,
                },
            });

            if (!firstRentExists) {
                await tx.payment.create({
                    data: {
                        paymentCode: generatePaymentCode('RENT'),
                        rentalId: contract.rentalId,
                        paymentType: PaymentType.rent,
                        dueDate: firstRentDueDate,
                        amount: contract.monthlyRent,
                        remainingAmount: contract.monthlyRent,
                        status: 'pending',
                        currency: payment.currency ?? 'VND',
                    },
                });
            }

            return;
        }

        if (payment.paymentType === PaymentType.rent) {
            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    balance: ownerWallet.balance.add(payment.amount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: payment.amount,
                    type: 'receive_rent',
                    status: 'success',
                    referenceId: payment.paymentId,
                    description: `Nhận tiền thuê (${descriptionSuffix})`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: payment.amount.neg(),
                    type: 'pay_rent',
                    status: 'success',
                    referenceId: payment.paymentId,
                    description: `Thanh toán tiền thuê cho mã ${payment.paymentCode}`,
                },
            });
        }
    }

    // Nhận kết quả thanh toán từ cổng (VNPay, Momo)
    async handlePaymentWebhook(
        paymentCode: string,
        transactionId: string,
        transactionRef: string,
        paidAmount: number
    ) {
        const updatedPayment = await this.db.$transaction(async (tx) => {

            const payment = await tx.payment.findUnique({
                where: { paymentCode },
                include: {
                    contract: true,
                },
            });

            //Kiểm tra payment tồn tại và đang ở trạng thái có thể thanh toán
            if (!payment) throw new NotFoundException('Không tìm thấy phiếu thanh toán');
            if (payment.status !== 'pending') return payment;

            // Chuyển đổi paidAmount sang Decimal để so sánh chính xác với payment.amount
            const paid = new Prisma.Decimal(paidAmount);

            // Kiểm tra số tiền thanh toán hợp lệ (có thể bằng hoặc lớn hơn số tiền còn lại)
            if (paid.lt(payment.amount)) {
                throw new BadRequestException('Số tiền không hợp lệ');
            }

            // Cập nhật trạng thái thanh toán, ghi nhận thông tin giao dịch
            const updatedPayment = await tx.payment.update({
                where: { paymentId: payment.paymentId },
                data: {
                    status: 'paid',
                    paymentMethod: payment.paymentMethod ?? PaymentMethod.momo,
                    transactionId,
                    transactionRef,
                    paidAmount: payment.amount,
                    remainingAmount: 0,
                    paidAt: new Date(),
                    confirmedAt: new Date(),
                },
            });

            // Chuyển tiền cho chủ nhà và ghi nhận giao dịch ví
            await this.settleIncomeForOwner(tx, {
                payment: updatedPayment,
                contract: payment.contract,
                descriptionSuffix: 'gateway',
            });

            return updatedPayment;
        });

        if (updatedPayment.paymentType === PaymentType.deposit) {
            await this.syncPropertyStatusAfterDeposit(updatedPayment.rentalId);

            // Thông báo cho chủ nhà: người thuê đã đóng tiền cọc
            const contract = await this.db.rentalContract.findUnique({
                where: { rentalId: updatedPayment.rentalId },
            });
            if (contract) {
                this.rabbitClient.emit('deposit.paid', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                    amount: Number(updatedPayment.amount),
                });
            }
        }

        return updatedPayment;
    }

    async reconcilePendingPayments(query: PaymentReconcileQueryDto) {
        const limit = query.limit ?? 50;
        const methodFilter = query.method
            ? query.method
            : { in: [PaymentMethod.momo, PaymentMethod.vnpay] };

        const pendingPayments = await this.db.payment.findMany({
            where: {
                status: 'pending',
                paymentMethod: methodFilter,
            },
            orderBy: {
                createdAt: 'asc',
            },
            take: limit,
        });

        const results: Array<Record<string, any>> = [];
        let updatedCount = 0;

        for (const payment of pendingPayments) {
            try {
                if (payment.paymentMethod === PaymentMethod.momo) {
                    const momoStatus = await this.queryMomoPaymentStatus(payment);

                    if (momoStatus.isPaid) {
                        await this.handlePaymentWebhook(
                            payment.paymentCode,
                            momoStatus.transactionId || '',
                            momoStatus.transactionRef || '',
                            momoStatus.amount ?? Number(payment.amount)
                        );
                        updatedCount += 1;
                    }

                    results.push({
                        paymentId: payment.paymentId,
                        paymentCode: payment.paymentCode,
                        gateway: 'momo',
                        status: momoStatus.status,
                        isPaid: momoStatus.isPaid,
                    });
                    continue;
                }

                if (payment.paymentMethod === PaymentMethod.vnpay) {
                    const vnpayStatus = await this.queryVnpayPaymentStatus(payment);

                    if (vnpayStatus.isPaid) {
                        await this.handlePaymentWebhook(
                            payment.paymentCode,
                            vnpayStatus.transactionId || '',
                            vnpayStatus.transactionRef || '',
                            vnpayStatus.amount ?? Number(payment.amount)
                        );
                        updatedCount += 1;
                    }

                    results.push({
                        paymentId: payment.paymentId,
                        paymentCode: payment.paymentCode,
                        gateway: 'vnpay',
                        status: vnpayStatus.status,
                        isPaid: vnpayStatus.isPaid,
                    });
                    continue;
                }

                results.push({
                    paymentId: payment.paymentId,
                    paymentCode: payment.paymentCode,
                    gateway: payment.paymentMethod,
                    status: 'skipped',
                    isPaid: false,
                });
            } catch (error: any) {
                results.push({
                    paymentId: payment.paymentId,
                    paymentCode: payment.paymentCode,
                    gateway: payment.paymentMethod,
                    status: 'error',
                    isPaid: false,
                    error: error?.message || 'Unknown error',
                });
            }
        }

        return {
            total: pendingPayments.length,
            updated: updatedCount,
            items: results,
        };
    }


    // Tự động đánh dấu quá hạn
    async checkOverduePayments() {
        const todayStart = this.normalizeDate(new Date());

        await this.db.payment.updateMany({
            where: {
                status: 'pending',
                paymentType: PaymentType.rent,
                dueDate: { lt: todayStart },
            },
            data: {
                status: 'overdue',
            },
        });
    }

    // Tự tạo tiền thuê mỗi tháng
    async createMonthlyRentPayments() {
        const contracts = await this.db.rentalContract.findMany({
            where: {
                status: 'active',
                isActive: true,
            },
            select: {
                rentalId: true,
                startDate: true,
                endDate: true,
                paymentDueDay: true,
                monthlyRent: true,
            },
        });

        const today = this.normalizeDate(new Date());

        for (const contract of contracts) {
            if (today < this.normalizeDate(contract.startDate) || today > this.normalizeDate(contract.endDate)) {
                continue;
            }

            const dueDate = this.buildMonthlyRentDueDate(contract.startDate, contract.paymentDueDay, today);

            const existing = await this.findMonthlyRentPayment(contract.rentalId, dueDate);

            if (!existing) {
                await this.db.payment.create({
                    data: {
                        paymentCode: generatePaymentCode('RENT'),
                        rentalId: contract.rentalId,
                        paymentType: PaymentType.rent,
                        amount: contract.monthlyRent,
                        remainingAmount: contract.monthlyRent,
                        dueDate,
                        status: 'pending',
                        currency: 'VND',
                    },
                });
            }
        }
    }

    // Xác nhận thanh toán
    async confirmPayment(
        paymentId: string,
        dto: ConfirmPaymentDto,
        userId: string
    ) {
        const payment = await this.db.payment.findUnique({
            where: { paymentId },
            include: {
                contract: true,
            },
        });

        if (!payment) throw new NotFoundException('Không tìm thấy payment');
        if (!payment.contract) throw new NotFoundException('Không tìm thấy hợp đồng liên kết');
        if (!['pending', 'overdue', 'partial'].includes(payment.status)) {
            throw new BadRequestException('Khoản thanh toán không ở trạng thái có thể thanh toán');
        }

        if (dto.paymentType && payment.paymentType !== dto.paymentType) {
            throw new BadRequestException('Sai loại payment');
        }

        const isOwner = payment.contract.ownerId === userId;
        const isTenant = payment.contract.tenantId === userId;
        if (!isOwner && !isTenant) {
            throw new ForbiddenException('Bạn không có quyền với khoản thanh toán này');
        }

        const method = dto.paymentMethod;

        await this.db.payment.update({
            where: { paymentId },
            data: { paymentMethod: method },
        });

        if (method === PaymentMethod.cash && !isOwner) {
            throw new ForbiddenException('Thanh toán tiền mặt chỉ chủ nhà xác nhận');
        }

        if (
            (method === PaymentMethod.vnpay ||
                method === PaymentMethod.momo ||
                method === PaymentMethod.zalopay) &&
            !isTenant
        ) {
            throw new ForbiddenException('Chỉ người thuê được khởi tạo thanh toán qua cổng');
        }

        if (method === PaymentMethod.vnpay) {
            return this.vnpayPayment(payment);
        }

        if (method === PaymentMethod.momo || method === PaymentMethod.zalopay) {
            return this.momoPayment(payment);
        }

        // Cần bổ sung
        if (method === PaymentMethod.bank_transfer) {
            return null;
        }

        // PAYMENT METHOD "other" được dùng như ví nội bộ.
        if (method === PaymentMethod.other) {
            const isDeposit = payment.paymentType === PaymentType.deposit;
            const rentalId = payment.rentalId;
            if (!isTenant) {
                throw new ForbiddenException('Chỉ người thuê được thanh toán bằng ví nội bộ');
            }

            const result = await this.db.$transaction(async (tx) => {
                const currentPayment = await tx.payment.findUnique({
                    where: { paymentId },
                });

                if (!currentPayment) {
                    throw new NotFoundException('Không tìm thấy payment');
                }

                if (!['pending', 'overdue', 'partial'].includes(currentPayment.status)) {
                    throw new BadRequestException('Payment không hợp lệ');
                }

                const tenantWallet = await tx.wallet.findUnique({
                    where: { userId },
                });

                if (!tenantWallet) {
                    throw new NotFoundException('Không tìm thấy ví người dùng');
                }

                if (tenantWallet.balance.lt(currentPayment.amount)) {
                    throw new BadRequestException('Không đủ tiền');
                }

                await tx.wallet.update({
                    where: { walletId: tenantWallet.walletId },
                    data: {
                        balance: tenantWallet.balance.sub(currentPayment.amount),
                    },
                });

                await tx.walletTransaction.create({
                    data: {
                        walletId: tenantWallet.walletId,
                        amount: currentPayment.amount.neg(),
                        type: 'pay_rent',
                        status: 'success',
                        referenceId: currentPayment.paymentId,
                        description: `Thanh toán ${currentPayment.paymentType === PaymentType.deposit ? 'đặt cọc' : 'tiền thuê'} cho mã ${currentPayment.paymentCode}`,
                    },
                });

                const updatedPayment = await tx.payment.update({
                    where: { paymentId },
                    data: {
                        status: 'paid',
                        paymentMethod: method,
                        paidAmount: currentPayment.amount,
                        remainingAmount: 0,
                        transactionId: dto.transactionId,
                        transactionRef: dto.transactionRef,
                        paidAt: new Date(),
                        confirmedAt: new Date(),
                    },
                });

                await this.settleIncomeForOwner(tx, {
                    payment: updatedPayment,
                    contract: payment.contract,
                    descriptionSuffix: 'wallet',
                });

                return {
                    type: 'wallet',
                    amount: currentPayment.amount,
                    paymentCode: currentPayment.paymentCode,
                };
            });

            if (isDeposit) {
                await this.syncPropertyStatusAfterDeposit(rentalId);

                // Thông báo cho chủ nhà: người thuê đã đóng tiền cọc (thanh toán ví)
                if (payment.contract) {
                    this.rabbitClient.emit('deposit.paid', {
                        contractId: payment.contract.rentalId,
                        contractCode: payment.contract.contractCode,
                        propertyId: payment.contract.propertyId,
                        ownerId: payment.contract.ownerId,
                        tenantId: payment.contract.tenantId,
                        amount: Number(payment.amount),
                    });
                }
            }

            return result;
        }

        throw new BadRequestException('Phương thức thanh toán chưa được hỗ trợ');
    }

    // Xử lý thanh toán qua VNPay
    async vnpayPayment(payment: Payment) {
        const amount = this.getPaymentAmount(payment);
        const tmnCode = getRequiredEnv('VNPAY_TMN_CODE');
        const hashSecret = getRequiredEnv('VNPAY_HASH_SECRET');
        const paymentUrl = getRequiredEnv('VNPAY_URL');
        const returnUrl = getRequiredEnv('VNPAY_RETURN_URL');
        const ipAddr = process.env.VNPAY_IP_ADDR || '127.0.0.1';
        const locale = process.env.VNPAY_LOCALE || 'vn';
        const currCode = process.env.VNPAY_CURRENCY_CODE || (payment.currency ?? 'VND');
        const orderType = process.env.VNPAY_ORDER_TYPE || 'billpayment';
        const txnRef = payment.paymentCode;
        const createDate = formatVnpDate(new Date());
        const expireDate = formatVnpDate(new Date(Date.now() + 15 * 60 * 1000));

        const vnpParams = {
            vnp_Amount: String(amount * 100),
            vnp_Command: 'pay',
            vnp_CreateDate: createDate,
            vnp_CurrCode: currCode,
            vnp_ExpireDate: expireDate,
            vnp_IpAddr: ipAddr,
            vnp_Locale: locale,
            vnp_OrderInfo: `Thanh toan ma ${txnRef}`,
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
            type: 'vnpay',
            gateway: 'vnpay',
            paymentCode: payment.paymentCode,
            paymentId: payment.paymentId,
            amount,
            currency: payment.currency ?? 'VND',
            paymentUrl: checkoutUrl,
            redirectUrl: checkoutUrl,
            transactionRef: txnRef,
        };
    }

    // Xử lý thanh toán qua momo
    async momoPayment(payment: Payment) {
        const amount = this.getPaymentAmount(payment);

        const partnerCode = getRequiredEnv('MOMO_PARTNER_CODE');
        const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = getRequiredEnv('MOMO_SECRET_KEY');
        const endpoint = getRequiredEnv('MOMO_ENDPOINT');
        const redirectUrl = getRequiredEnv('MOMO_REDIRECT_URL');
        const ipnUrl = getRequiredEnv('MOMO_IPN_URL');

        const requestType = process.env.MOMO_REQUEST_TYPE || 'captureWallet';

        const orderInfo = `Thanh_toan_${payment.paymentType}_${payment.paymentCode}`;

        const extraData = '';

        const requestId = `${payment.paymentCode}-${Date.now()}`;
        const orderId = payment.paymentCode;

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

        const requestPayload = {
            partnerCode,
            accessKey,
            requestId,
            amount: String(amount),
            orderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            extraData,
            requestType,
            signature,
            lang: 'vi',
        };

        try {
            const response = await axios.post(endpoint, requestPayload, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = response.data || {};

            return {
                type: 'momo',
                gateway: 'momo',
                paymentCode: payment.paymentCode,
                paymentId: payment.paymentId,
                amount,
                currency: payment.currency ?? 'VND',
                payUrl: data.payUrl || data.shortLink || data.deeplink,
                paymentUrl: data.payUrl || data.shortLink || data.deeplink,
                requestId,
                orderId,
                redirectUrl: data.deeplink || redirectUrl,
                ipnUrl,
                response: data,
            };

        } catch (error: any) {
            throw new Error(
                error.response?.data?.message || 'MoMo payment failed'
            );
        }
    }

    private getPaymentAmount(payment: Payment) {
        const amount = Number(payment.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new BadRequestException('Số tiền thanh toán không hợp lệ');
        }

        return Math.round(amount);
    }

    private async queryMomoPaymentStatus(payment: Payment) {
        const partnerCode = getRequiredEnv('MOMO_PARTNER_CODE');
        const accessKey = getRequiredEnv('MOMO_ACCESS_KEY');
        const secretKey = getRequiredEnv('MOMO_SECRET_KEY');
        const endpoint = getRequiredEnv('MOMO_QUERY_ENDPOINT');

        const orderId = payment.paymentCode;
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
        const paidAmount = Number(data.amount ?? payment.amount);

        return {
            isPaid: data.resultCode === 0,
            status: String(data.resultCode ?? 'unknown'),
            transactionId: data.transId ? String(data.transId) : undefined,
            transactionRef: data.transId ? `MOMO-${data.transId}` : undefined,
            amount: paidAmount,
            raw: data,
        };
    }

    private async queryVnpayPaymentStatus(payment: Payment) {
        const tmnCode = getRequiredEnv('VNPAY_TMN_CODE');
        const hashSecret = getRequiredEnv('VNPAY_HASH_SECRET');
        const endpoint = getRequiredEnv('VNPAY_QUERY_URL');
        const ipAddr = process.env.VNPAY_IP_ADDR || '127.0.0.1';

        const txnRef = payment.paymentCode;
        const createDate = formatVnpDate(new Date());
        const transactionDate = formatVnpDate(payment.createdAt ?? new Date());
        const requestId = `query-${txnRef}-${Date.now()}`;

        const vnpParams: Record<string, any> = {
            vnp_RequestId: requestId,
            vnp_Version: '2.1.0',
            vnp_Command: 'querydr',
            vnp_TmnCode: tmnCode,
            vnp_TxnRef: txnRef,
            vnp_OrderInfo: `Thanh toan ma ${txnRef}`,
            vnp_TransactionDate: transactionDate,
            vnp_CreateDate: createDate,
            vnp_IpAddr: ipAddr,
        };

        const secureHash = this.buildVnpayQueryDrHash(vnpParams, hashSecret);
        const requestData = {
            ...vnpParams,
            vnp_SecureHash: secureHash,
        };

        const response = await axios.post(endpoint, requestData, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = response.data || {};

        if (data.vnp_SecureHash && !this.verifyVnpayQueryDrResponse(data, hashSecret)) {
            throw new BadRequestException('VNPAY signature mismatch');
        }

        const responseCode = data.vnp_ResponseCode;
        const transactionStatus = data.vnp_TransactionStatus;
        const paidAmount = data.vnp_Amount
            ? Number(data.vnp_Amount) / 100
            : Number(payment.amount);

        return {
            isPaid: responseCode === '00' && transactionStatus === '00',
            status: `${responseCode ?? 'unknown'}:${transactionStatus ?? 'unknown'}`,
            transactionId: data.vnp_TransactionNo ? String(data.vnp_TransactionNo) : undefined,
            transactionRef: data.vnp_TransactionNo ? `VNPAY-${data.vnp_TransactionNo}` : undefined,
            amount: paidAmount,
            raw: data,
        };
    }

    private buildVnpayQueryDrHash(params: Record<string, any>, secretKey: string) {
        const rawData = [
            params.vnp_RequestId,
            params.vnp_Version,
            params.vnp_Command,
            params.vnp_TmnCode,
            params.vnp_TxnRef,
            params.vnp_TransactionDate,
            params.vnp_CreateDate,
            params.vnp_IpAddr,
            params.vnp_OrderInfo,
        ].join('|');

        return crypto
            .createHmac('sha512', secretKey)
            .update(rawData, 'utf-8')
            .digest('hex');
    }

    private verifyVnpayQueryDrResponse(data: Record<string, any>, secretKey: string) {
        const rawData = [
            data.vnp_ResponseId,
            data.vnp_Command,
            data.vnp_ResponseCode,
            data.vnp_Message,
            data.vnp_TmnCode,
            data.vnp_TxnRef,
            data.vnp_Amount,
            data.vnp_BankCode,
            data.vnp_PayDate,
            data.vnp_TransactionNo,
            data.vnp_TransactionType,
            data.vnp_TransactionStatus,
            data.vnp_OrderInfo,
            data.vnp_PromotionCode,
            data.vnp_PromotionAmount,
        ].map(value => value ?? '').join('|');

        const signed = crypto
            .createHmac('sha512', secretKey)
            .update(rawData, 'utf-8')
            .digest('hex');

        const secureHash = String(data.vnp_SecureHash || '');

        return (
            secureHash.length === signed.length &&
            crypto.timingSafeEqual(Buffer.from(secureHash), Buffer.from(signed))
        );
    }
}

export function verifyMomoSignature(
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
        payType, // Lấy thêm payType từ body
        requestId,
        responseTime,
        resultCode,
        transId,
        signature: momoSignature
    } = body;

    // PHẢI nối theo đúng thứ tự này (theo tài liệu MoMo IPN)
    const rawSignature =
        `accessKey=${accessKey}` +
        `&amount=${amount}` +
        `&extraData=${extraData || ''}` +
        `&message=${message}` +
        `&orderId=${orderId}` +
        `&orderInfo=${orderInfo}` +
        `&orderType=${orderType}` +
        `&partnerCode=${partnerCode}` +
        `&payType=${payType}` + // Thêm payType vào đây
        `&requestId=${requestId}` +
        `&responseTime=${responseTime}` +
        `&resultCode=${resultCode}` +
        `&transId=${transId}`;

    const mySignature = crypto
        .createHmac('sha256', secretKey)
        .update(rawSignature)
        .digest('hex');

    console.log("Raw String build: ", rawSignature);
    console.log("My Signature: ", mySignature);
    console.log("MoMo Signature: ", momoSignature);

    return mySignature === momoSignature;
}
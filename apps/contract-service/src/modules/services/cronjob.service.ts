import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/common/services/database.service';
import { randomUUID } from 'crypto';
import { PaymentService } from './payment.service';
import { TerminationService } from './termination.service';
import { PaymentType } from 'generated/prisma/enums';
import { ClientProxy } from '@nestjs/microservices';
import { WalletService } from './wallet.service';

type ActiveContract = {
    rentalId: string;
    ownerId: string;
    tenantId: string;
    contractCode: string;
    propertyId: string;
    paymentDueDay: number;
    monthlyRent: any;
    startDate: Date;
    endDate: Date;
    electricityCostPerKwh: any;
    waterCostPerM3: any;
    managementFee: any;
    parkingFee: any;
    internetFee: any;
};

@Injectable()
export class CronjobService {
    private readonly logger = new Logger(CronjobService.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly paymentService: PaymentService,
        private readonly terminationService: TerminationService,
        private readonly walletService: WalletService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
    ) { }

    // Cron job kiểm tra hàng ngày để tạo hóa đơn tiền thuê mới nếu chưa tồn tại, gửi thông báo trước hạn thanh toán 5 ngày, thông báo đến hạn và quá hạn
    @Cron(process.env.CONTRACT_LIFECYCLE_CRON || '0 0 7 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handleMonthlyPayment() {
        this.logger.log('========Cron job kiểm tra hợp đồng =======');

        try {
            const contracts = await this.db.rentalContract.findMany({
                where: {
                    status: 'active'
                },
                select: {
                    rentalId: true,
                    ownerId: true,
                    tenantId: true,
                    contractCode: true,
                    propertyId: true,
                    paymentDueDay: true,
                    monthlyRent: true,
                    startDate: true,
                    endDate: true,
                    electricityCostPerKwh: true,
                    waterCostPerM3: true,
                    managementFee: true,
                    parkingFee: true,
                    internetFee: true,
                }
            });

            const today = this.normalizeDate(
                process.env.FAKE_TODAY
                    ? new Date(process.env.FAKE_TODAY)
                    : new Date()
            );

            for (const contract of contracts) {
                try {
                    // Chỉ xử lý những hợp đồng đang trong khoảng thời gian thuê
                    if (!this.isDateWithinContractRange(today, contract.startDate, contract.endDate)) {
                        continue;
                    }

                    // Ngày đến hạn gần nhất (co the la thang hien tai hoac thang sau)
                    const dueDate = this.calculateMonthlyDueDate(contract, today);
                    // Ngày đến hạn hiệu lực trong tháng hiện tại (dung de xac dinh qua han)
                    const effectiveDueThisMonth = this.calculateEffectiveDueThisMonth(contract, today);

                    // Tính ngày thông báo trước hạn thanh toán
                    const notifyDate = this.calculateNotifyDate(dueDate);

                    console.log("today: ", today, dueDate, notifyDate);

                    if (this.isSameDate(today, notifyDate)) {
                        await this.handleBeforeDue(contract, dueDate);
                    } else if (this.isSameDate(today, dueDate)) {
                        await this.handleDueDate(contract, dueDate);
                    } else if (today > effectiveDueThisMonth) {
                        await this.handleOverdue(contract, effectiveDueThisMonth);
                    }

                } catch (error: any) {
                    this.logger.error(
                        `Error processing contract ${contract.rentalId}`,
                        error.stack
                    );
                }
            }
        } catch (error: any) {
            this.logger.error('Cron job failed', error.stack);
        }
    }

    // Cron job kiểm tra các payment pending
    @Cron(process.env.PAYMENT_RECONCILE_CRON || '0 */3 * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handlePaymentReconcile() {
        const limit = Number(process.env.PAYMENT_RECONCILE_LIMIT || 50);

        this.logger.log('========Cron job đối soát thanh toán pending =======');

        try {
            const [result, resultWallet] = await Promise.all([
                // Kiểm tra trạng thái các payment pending, cập nhật nếu đã thanh toán qua cổng thanh toán, đồng thời gửi thông báo nếu có thay đổi trạng thái
                this.paymentService.reconcilePendingPayments({
                    limit,
                }),
                this.walletService.reconcilePendingTransactions({
                    limit,
                }),
            ]);
            console.log("Kết quả kiểm tra và update payment: ", result);
            console.log("Kết quả kiểm tra và update wallet: ", resultWallet);
        } catch (error: any) {
            this.logger.error('Cron job reconcile failed', error.stack);
        }
    }

    // Cron job kiểm tra tự động gia hạn hợp đồng và tự động chấm dứt hợp đồng khi hết hạn, cũng như chấm dứt hợp đồng do không thanh toán
    @Cron(process.env.CONTRACT_LIFECYCLE_CRON || '20 * * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handleContractLifecycle() {
        const today = this.normalizeDate(
            process.env.FAKE_TODAY
                ? new Date(process.env.FAKE_TODAY)
                : new Date()
        );

        console.log("Kiểm tra hợp đồng quá hạn khong");

        try {
            // Xử lý chuyển hợp đồng sang near_expiration khi sắp hết hạn
            await this.handleNearExpiration(today);

            // Xử lý tự động gia hạn hợp đồng và tự động chấm dứt hợp đồng khi hết hạn
            await this.handleAutoExpireAndRenew(today);

            // Xử lý tự động chấm dứt hợp đồng do không thanh toán
            await this.handleAutoTerminateNonPayment(today);
        } catch (error: any) {
            this.logger.error('Cron job lifecycle failed', error.stack);
        }
    }

    @Cron(process.env.HOLDING_DEPOSIT_EXPIRE_CRON || '*/30 * * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handleHoldingDepositExpiration() {
        const now = new Date(
            process.env.FAKE_TODAY
                ? new Date(process.env.FAKE_TODAY)
                : new Date()
        );

        console.log('Hom nay: ', now);


        try {
            const expiredRequests = await this.db.rentalRequest.findMany({
                where: {
                    status: 'holding_deposit_open',
                    holdingDepositExpiresAt: { lt: now },
                },
                select: {
                    requestId: true,
                    propertyId: true,
                    ownerId: true,
                },
            });

            if (expiredRequests.length === 0) return;

            await this.db.rentalRequest.updateMany({
                where: { requestId: { in: expiredRequests.map((item) => item.requestId) } },
                data: {
                    status: 'holding_deposit_expired',
                    holdingDepositStatus: 'expired',
                },
            });

            const notified = new Set<string>();
            for (const item of expiredRequests) {
                const key = `${item.ownerId}-${item.propertyId}`;
                if (notified.has(key)) continue;
                notified.add(key);
                this.rabbitClient.emit('rental.request.holding_deposit_expired', {
                    ownerId: item.ownerId,
                    propertyId: item.propertyId,
                });
            }
        } catch (error: any) {
            this.logger.error('Cron job holding deposit expiration failed', error.stack);
        }
    }

    @Cron(process.env.CONTRACT_UPDATE_EXPIRE_CRON || '*/30 * * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handleContractUpdateExpiration() {
        const now = new Date(
            process.env.FAKE_TODAY
                ? new Date(process.env.FAKE_TODAY)
                : new Date()
        );

        try {
            const expiredUpdates = await this.db.rentalContract.findMany({
                where: {
                    status: { in: ['pending_tenant', 'pending_landlord', 'tenant_signed', 'owner_signed'] },
                    parentContractId: { not: null },
                    updateExpirationTime: { lt: now },
                },
                select: {
                    rentalId: true,
                    parentContractId: true,
                },
            });

            if (expiredUpdates.length === 0) return;

            for (const item of expiredUpdates) {
                await this.db.rentalContract.update({
                    where: { rentalId: item.rentalId },
                    data: { status: 'expired' },
                });
                
                this.rabbitClient.emit('contract.update_expired', {
                    contractId: item.rentalId,
                    parentContractId: item.parentContractId,
                });
                
                this.logger.log(`📢 Contract update ${item.rentalId} expired`);
            }
        } catch (error: any) {
            this.logger.error('Cron job contract update expiration failed', error.stack);
        }
    }

    // Tạo hóa đơn mới nếu chưa tồn tại, sau đó gửi thông báo trước hạn thanh toán 5 ngày
    async handleBeforeDue(contract: ActiveContract, dueDate: Date) {
        this.logger.log('Bắt đầu cron job thông báo trước hạn thanh toán');

        let payment = await this.findMonthlyPayment(contract.rentalId, dueDate, PaymentType.rent);

        if (!payment) {
            payment = await this.createPayment(contract, dueDate, PaymentType.rent, Number(contract.monthlyRent || 0));

            this.logger.log(`💰 Created payment ${contract.rentalId}`);
        }

        await this.ensureMonthlyChargePayments(contract, dueDate);

        // Thông báo nhắc nhở trước hạn thanh toán 5 ngày
        this.rabbitClient.emit('payment.reminder', {
            contractId: contract.rentalId,
            contractCode: contract.contractCode,
            propertyId: contract.propertyId,
            ownerId: contract.ownerId,
            tenantId: contract.tenantId,
            dueDate: dueDate.toISOString(),
            amount: Number(contract.monthlyRent || 0),
            paymentId: payment?.paymentId,
        });
        this.logger.log(`📢 Sent reminder notification for contract ${contract.rentalId}`);
    }

    // Gửi thông báo nhắc thanh toán khi đã đến hạn nhưng chưa thanh toán
    async handleDueDate(contract: ActiveContract, dueDate: Date) {
        this.logger.log('Bắt đầu cron job thông báo đến hạn thanh toán');

        let payment = await this.findMonthlyPayment(contract.rentalId, dueDate, PaymentType.rent);

        if (!payment) {
            payment = await this.createPayment(contract, dueDate, PaymentType.rent, Number(contract.monthlyRent || 0));
            this.logger.log(`💰 Created payment ${contract.rentalId} on due date`);
        }

        await this.ensureMonthlyChargePayments(contract, dueDate);

        if (payment && payment.status === 'pending') {
            // Thông báo đã đến hạn thanh toán
            this.rabbitClient.emit('payment.due', {
                contractId: contract.rentalId,
                contractCode: contract.contractCode,
                propertyId: contract.propertyId,
                ownerId: contract.ownerId,
                tenantId: contract.tenantId,
                dueDate: dueDate.toISOString(),
                amount: Number(contract.monthlyRent || 0),
                paymentId: payment.paymentId,
            });
            this.logger.log(`📢 Sent due date notification for contract ${contract.rentalId}`)
        }

        if (payment && payment.status === "paid") {
            this.logger.log(`✅ Payment already made for contract ${contract.rentalId}, no notification sent`);
        }
    }


    // Gửi thông báo quá hạn nếu đã đến hạn nhưng chưa thanh toán
    async handleOverdue(contract: ActiveContract, dueDate: Date) {
        this.logger.log('Bắt đầu cron job thông báo quá hạn thanh toán');

        let payment = await this.findMonthlyPayment(contract.rentalId, dueDate, PaymentType.rent);

        if (!payment) {
            payment = await this.createPayment(contract, dueDate, PaymentType.rent, Number(contract.monthlyRent || 0));
            this.logger.log(`💰 Created missing overdue payment ${contract.rentalId}`);
        }

        await this.ensureMonthlyChargePayments(contract, dueDate);

        if (payment && (payment.status === 'pending' || payment.status === 'overdue')) {
            if (payment.status === 'pending') {
                await this.db.payment.update({
                    where: { paymentId: payment.paymentId },
                    data: { status: 'overdue' }
                });
            }

            const today = this.normalizeDate(
                process.env.FAKE_TODAY ? new Date(process.env.FAKE_TODAY) : new Date()
            );
            const overdueDays = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

            if (overdueDays >= 10) {
                // Quá hạn >= 10 ngày: thông báo trễ hạn nghiêm trọng, hợp đồng sẽ tự hủy
                this.rabbitClient.emit('payment.overdue', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                    dueDate: dueDate.toISOString(),
                    amount: Number(contract.monthlyRent || 0),
                    paymentId: payment.paymentId,
                    overdueDays,
                    severity: 'critical',
                });
            } else if (overdueDays >= 5) {
                // Quá hạn >= 5 ngày: cảnh báo sắp quá hạn nghiêm trọng
                this.rabbitClient.emit('payment.warning', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                    dueDate: dueDate.toISOString(),
                    amount: Number(contract.monthlyRent || 0),
                    paymentId: payment.paymentId,
                    overdueDays,
                });
            } else {
                // Quá hạn < 5 ngày: nhắc nhở thanh toán
                this.rabbitClient.emit('payment.due', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                    dueDate: dueDate.toISOString(),
                    amount: Number(contract.monthlyRent || 0),
                    paymentId: payment.paymentId,
                });
            }

            this.logger.log(`📢 Sent overdue notification (${overdueDays} days) for contract ${contract.rentalId}`);
        }
    }

    /**
     * Tính ngày đến hạn thanh toán
     */
    private calculateDueDateForMonth(dueDay: number, year: number, month: number): Date {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const normalizedDueDay = Math.min(Math.max(dueDay, 1), daysInMonth);

        return this.normalizeDate(new Date(year, month, normalizedDueDay));
    }

    private calculateMonthlyDueDate(contract: ActiveContract, baseDate: Date): Date {
        const normalizedBase = this.normalizeDate(baseDate);
        const year = normalizedBase.getFullYear();
        const month = normalizedBase.getMonth();
        const startDate = this.normalizeDate(contract.startDate);

        const dueThisMonth = this.calculateDueDateForMonth(contract.paymentDueDay, year, month);

        const isFirstBillingMonth =
            startDate.getFullYear() === year
            && startDate.getMonth() === month;

        if (isFirstBillingMonth && dueThisMonth < startDate) {
            if (normalizedBase <= startDate) {
                return startDate;
            }
        }

        // If the due date of the current month already passed, roll to next month
        if (normalizedBase > dueThisMonth) {
            const nextMonth = new Date(year, month + 1, 1);
            return this.calculateDueDateForMonth(
                contract.paymentDueDay,
                nextMonth.getFullYear(),
                nextMonth.getMonth()
            );
        }

        return dueThisMonth;
    }

    private calculateEffectiveDueThisMonth(contract: ActiveContract, baseDate: Date): Date {
        const normalizedBase = this.normalizeDate(baseDate);
        const year = normalizedBase.getFullYear();
        const month = normalizedBase.getMonth();
        const startDate = this.normalizeDate(contract.startDate);

        const dueThisMonth = this.calculateDueDateForMonth(contract.paymentDueDay, year, month);

        const isFirstBillingMonth =
            startDate.getFullYear() === year
            && startDate.getMonth() === month;

        if (isFirstBillingMonth && dueThisMonth < startDate) {
            return startDate;
        }

        return dueThisMonth;
    }

    private calculateNotifyDate(dueDate: Date): Date {
        const notifyDate = new Date(dueDate);
        notifyDate.setDate(dueDate.getDate() - 5);

        return this.normalizeDate(notifyDate);
    }

    // Chuẩn hóa ngày về 00:00:00 để so sánh dễ dàng hơn
    private normalizeDate(date: Date): Date {
        const newDate = new Date(date);
        newDate.setHours(0, 0, 0, 0);
        return newDate;
    }

    // So sánh 2 ngày đã được chuẩn hóa
    private isSameDate(d1: Date, d2: Date): boolean {
        return d1.getTime() === d2.getTime();
    }

    private getMonthRange(date: Date) {
        const year = date.getFullYear();
        const month = date.getMonth();

        const start = new Date(year, month, 1);
        start.setHours(0, 0, 0, 0);

        const end = new Date(year, month + 1, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    private isDateWithinContractRange(target: Date, startDate: Date, endDate: Date): boolean {
        const normalizedTarget = this.normalizeDate(target);
        const normalizedStart = this.normalizeDate(startDate);
        const normalizedEnd = this.normalizeDate(endDate);

        return normalizedTarget >= normalizedStart && normalizedTarget <= normalizedEnd;
    }

    private addDays(base: Date, days: number) {
        const next = new Date(base);
        next.setDate(next.getDate() + days);
        return this.normalizeDate(next);
    }

    private getDurationDays(startDate: Date, endDate: Date) {
        const start = this.normalizeDate(startDate).getTime();
        const end = this.normalizeDate(endDate).getTime();
        const diffMs = end - start;
        return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    private async handleNearExpiration(today: Date) {
        const nearDays = 5;
        const nearDate = this.addDays(today, nearDays);

        const contracts = await this.db.rentalContract.findMany({
            where: {
                status: 'active',
                isActive: true,
                endDate: {
                    gt: today,
                    lte: nearDate,
                },
            },
            select: {
                rentalId: true,
                contractCode: true,
                propertyId: true,
                ownerId: true,
                tenantId: true,
                endDate: true,
                autoRenewal: true,
            },
        });

        for (const contract of contracts) {
            try {
                await this.db.rentalContract.update({
                    where: { rentalId: contract.rentalId },
                    data: { status: 'near_expiration' },
                });

                // Gửi notification nhắc nhở sắp hết hạn
                this.rabbitClient.emit('contract.near_expiration', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                    endDate: contract.endDate.toISOString(),
                    autoRenewal: contract.autoRenewal,
                });

                this.logger.log(`📢 Contract ${contract.rentalId} near expiration`);
            } catch (error: any) {
                this.logger.error(`Near expiration failed for ${contract.rentalId}`, error.stack);
            }
        }
    }

    private async handleAutoExpireAndRenew(today: Date) {
        const contracts = await this.db.rentalContract.findMany({
            where: {
                status: { in: ['active', 'near_expiration'] },
                isActive: true,
                endDate: { lte: today },
            },
            select: {
                rentalId: true,
                startDate: true,
                endDate: true,
                autoRenewal: true,
                renewalStatus: true,
                renewalNoticeDays: true,
                maxAutoRenewCount: true,
                autoRenewCount: true,
            },
        });

        for (const contract of contracts) {
            try {
                if (contract.autoRenewal && contract.autoRenewCount < contract.maxAutoRenewCount) {
                    const durationDays = this.getDurationDays(contract.startDate, contract.endDate);
                    if (durationDays <= 0) {
                        continue;
                    }

                    // Xác định hợp đồng dài hạn nếu thời gian thuê >= 730 ngày (2 năm)
                    const longTermThreshold = Number(process.env.RENEWAL_LONG_TERM_DAYS || 730);

                    // Nếu là hợp đồng dài hạn, sẽ tạo hợp đồng mới hoàn chỉnh, còn không sẽ chỉ tạo phụ lục gia hạn
                    const isLongTerm = durationDays >= longTermThreshold;

                    const newStart = this.addDays(contract.endDate, 1);
                    const newEnd = this.addDays(newStart, durationDays);

                    if (isLongTerm) {
                        const baseContract = await this.db.rentalContract.findUnique({
                            where: { rentalId: contract.rentalId },
                        });

                        if (!baseContract) {
                            continue;
                        }

                        const newContract = await this.db.rentalContract.create({
                            data: {
                                propertyId: baseContract.propertyId,
                                ownerId: baseContract.ownerId,
                                tenantId: baseContract.tenantId,
                                contractCode: `RENEW-${Date.now()}-${baseContract.contractCode}`,
                                contractType: baseContract.contractType,
                                templateId: baseContract.templateId,
                                startDate: newStart,
                                endDate: newEnd,
                                signedDate: new Date(),
                                monthlyRent: baseContract.monthlyRent,
                                depositAmount: baseContract.depositAmount,
                                electricityCostPerKwh: baseContract.electricityCostPerKwh,
                                waterCostPerM3: baseContract.waterCostPerM3,
                                managementFee: baseContract.managementFee,
                                parkingFee: baseContract.parkingFee,
                                internetFee: baseContract.internetFee,
                                paymentDueDay: baseContract.paymentDueDay,
                                lateFeePerDay: baseContract.lateFeePerDay,
                                gracePeriodDays: baseContract.gracePeriodDays,
                                earlyTerminationFee: baseContract.earlyTerminationFee,
                                autoRenewal: baseContract.autoRenewal,
                                renewalNoticeDays: baseContract.renewalNoticeDays,
                                notes: baseContract.notes,
                                contractData: baseContract.contractData ?? undefined,
                                contractHtml: baseContract.contractHtml ?? undefined,
                                contractPdfUrl: baseContract.contractPdfUrl,
                                status: 'active',
                                isActive: true,
                                renewalStatus: 'auto_renewed',
                                renewedFromContractId: baseContract.rentalId,
                            },
                        });

                        await this.db.rentalContract.update({
                            where: { rentalId: baseContract.rentalId },
                            data: {
                                status: 'renewed',
                                isActive: false,
                                renewalStatus: 'auto_renewed',
                                renewedToContractId: newContract.rentalId,
                                autoRenewCount: { increment: 1 },
                            },
                        });

                        const deposit = await this.db.depositTransaction.findFirst({
                            where: { rentalId: baseContract.rentalId },
                            orderBy: { createdAt: 'desc' },
                        });

                        if (deposit) {
                            await this.db.depositTransaction.update({
                                where: { id: deposit.id },
                                data: { rentalId: newContract.rentalId },
                            });
                        }

                        await this.db.contractSignatureLog.create({
                            data: {
                                rentalId: newContract.rentalId,
                                action: 'AUTO_RENEWED',
                                actor: baseContract.ownerId,
                                actorRole: 'OWNER',
                            },
                        });

                        continue;
                    }

                    // Tạo phụ lục gia hạn
                    const appendixCount = await this.db.contractAppendix.count({
                        where: { contractId: contract.rentalId },
                    });

                    await this.db.contractAppendix.create({
                        data: {
                            contractId: contract.rentalId,
                            type: 'renewal',
                            appendixNumber: appendixCount + 1,
                            startDate: contract.endDate,
                            endDate: newEnd,
                            content: `Phụ lục gia hạn tự động #${appendixCount + 1}: đến ${newEnd.toISOString().slice(0, 10)}`,
                            createdById: contract.rentalId, // system-generated
                            signedAt: new Date(),
                        },
                    });

                    await this.db.contractAmendment.create({
                        data: {
                            rentalId: contract.rentalId,
                            content: `Phụ lục gia hạn hợp đồng đến ${newEnd.toISOString().slice(0, 10)}`,
                        },
                    });

                    await this.db.rentalContract.update({
                        where: { rentalId: contract.rentalId },
                        data: {
                            endDate: newEnd,
                            renewalStatus: 'auto_renewed',
                            status: 'active',
                            autoRenewCount: { increment: 1 },
                        },
                    });
                    continue;
                }

                await this.terminationService.autoTerminateContract({
                    rentalId: contract.rentalId,
                    reason: 'lease_end',
                    note: 'Auto termination on lease end',
                });
            } catch (error: any) {
                this.logger.error(`Auto lifecycle failed for contract ${contract.rentalId}`, error.stack);
            }
        }
    }

    private async handleAutoTerminateNonPayment(today: Date) {
        const thresholdDays = Number(process.env.PAYMENT_OVERDUE_TERMINATE_DAYS || 10);
        if (!Number.isFinite(thresholdDays) || thresholdDays <= 0) {
            return;
        }

        const cutoff = this.addDays(today, -thresholdDays);

        const overduePayments = await this.db.payment.findMany({
            where: {
                status: 'overdue',
                paymentType: PaymentType.rent,
                dueDate: { lte: cutoff },
                rentalId: { not: null },
                contract: {
                    status: 'active',
                },
            },
            select: {
                rentalId: true,
            },
        });

        const uniqueRentalIds = Array.from(
            new Set(overduePayments.map((item) => item.rentalId).filter((id): id is string => !!id))
        );

        for (const rentalId of uniqueRentalIds) {
            try {
                await this.terminationService.autoTerminateContract({
                    rentalId,
                    reason: 'non_payment',
                    note: `Auto termination for overdue > ${thresholdDays} days`,
                });
            } catch (error: any) {
                this.logger.error(`Auto termination failed for contract ${rentalId}`, error.stack);
            }
        }
    }

    // Tìm hóa đơn tiền thuê theo kỳ tháng để tránh tạo trùng trong cùng một tháng
    private async findMonthlyPayment(rentalId: string, referenceDate: Date, paymentType: PaymentType) {
        const { start, end } = this.getMonthRange(referenceDate);

        return this.db.payment.findFirst({
            where: {
                rentalId,
                paymentType,
                dueDate: {
                    gte: start,
                    lte: end,
                }
            }
        });
    }

    // Tạo payment mới
    private async createPayment(
        contract: ActiveContract,
        dueDate: Date,
        paymentType: PaymentType,
        amount: number
    ) {
        return this.db.payment.create({
            data: {
                paymentCode: `${paymentType.toUpperCase()}-${randomUUID()}`,
                rentalId: contract.rentalId,
                paymentType,
                amount,
                remainingAmount: amount,
                dueDate: dueDate,
                status: 'pending',
            }
        });
    }

    private async ensureMonthlyChargePayments(contract: ActiveContract, dueDate: Date) {
        const items = await this.buildMonthlyChargeItems(contract, dueDate);

        for (const item of items) {
            const existing = await this.findMonthlyPayment(
                contract.rentalId,
                dueDate,
                item.paymentType
            );

            if (!existing) {
                await this.createPayment(contract, dueDate, item.paymentType, item.amount);
            }
        }
    }

    private async buildMonthlyChargeItems(contract: ActiveContract, dueDate: Date) {
        const items: Array<{ paymentType: PaymentType; amount: number }> = [];

        const managementFee = Number(contract.managementFee || 0);
        if (managementFee > 0) {
            items.push({ paymentType: PaymentType.management_fee, amount: managementFee });
        }

        const parkingFee = Number(contract.parkingFee || 0);
        if (parkingFee > 0) {
            items.push({ paymentType: PaymentType.parking, amount: parkingFee });
        }

        const internetFee = Number(contract.internetFee || 0);
        if (internetFee > 0) {
            items.push({ paymentType: PaymentType.internet, amount: internetFee });
        }

        return items;
    }
}
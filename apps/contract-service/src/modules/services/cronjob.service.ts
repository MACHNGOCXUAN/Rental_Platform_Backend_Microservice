import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/common/services/database.service';
import { randomUUID } from 'crypto';
import { PaymentService } from './payment.service';
import { PaymentType } from 'generated/prisma/enums';

type ActiveContract = {
    rentalId: string;
    tenantId: string;
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
    ) { }

    @Cron('15 * * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handleMonthlyPayment() {
        this.logger.log('Bắt đầu cron job kiểm tra hợp đồng và tạo hóa đơn nếu cần thiết');

        try {
            const contracts = await this.db.rentalContract.findMany({
                where: {
                    status: 'active',
                    isActive: true,
                },
                select: {
                    rentalId: true,
                    tenantId: true,
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

            const today = this.normalizeDate(new Date());

            for (const contract of contracts) {
                try {
                    if (!this.isDateWithinContractRange(today, contract.startDate, contract.endDate)) {
                        continue;
                    }

                    // Lấy ngày đến hạn thanh toán của tháng hiện tại
                    const dueDate = this.calculateMonthlyDueDate(contract, today);

                    // Tính ngày thông báo trước hạn thanh toán
                    const notifyDate = this.calculateNotifyDate(dueDate);

                    if (this.isSameDate(today, notifyDate)) {
                        await this.handleBeforeDue(contract, dueDate);
                    } else if (this.isSameDate(today, dueDate)) {
                        await this.handleDueDate(contract, dueDate);
                    } else if (today > dueDate) {
                        await this.handleOverdue(contract, dueDate);
                    }

                } catch (error: any) {
                    this.logger.error(
                        `Error processing contract ${contract.rentalId}`,
                        error.stack
                    );
                }
            }

            this.logger.log('Kết thúc cron job kiểm tra hợp đồng');

        } catch (error: any) {
            this.logger.error('Cron job failed', error.stack);
        }
    }

    @Cron(process.env.PAYMENT_RECONCILE_CRON || '20 * * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
    async handlePaymentReconcile() {
        const limit = Number(process.env.PAYMENT_RECONCILE_LIMIT || 50);

        this.logger.log(`Bắt đầu cron job đối soát thanh toán pending (limit=${limit})`);

        try {
            const result = await this.paymentService.reconcilePendingPayments({
                limit,
            });
            console.log("ket qua: ", result);
            

            this.logger.log(
                `Kết thúc đối soát: total=${result.total}, updated=${result.updated}`
            );
        } catch (error: any) {
            this.logger.error('Cron job reconcile failed', error.stack);
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

        await this.sendNotification(contract, dueDate);
        this.logger.log(`📢 Sent notification for contract ${contract.rentalId}`);
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
            await this.sendNotification(contract, dueDate);
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

        if (payment && payment.status === 'pending') {
            await this.db.payment.update({
                where: { paymentId: payment.paymentId },
                data: { status: 'overdue' }
            });
            await this.sendNotification(contract, dueDate);
            this.logger.log(`📢 Sent overdue notification for contract ${contract.rentalId}`);
        }
    }

    /**
     * Tính ngày đến hạn thanh toán
     */
    private calculateCurrentMonthDueDate(dueDay: number, baseDate: Date): Date {
        const year = baseDate.getFullYear();
        const month = baseDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const normalizedDueDay = Math.min(Math.max(dueDay, 1), daysInMonth);

        return this.normalizeDate(new Date(year, month, normalizedDueDay));
    }

    private calculateMonthlyDueDate(contract: ActiveContract, baseDate: Date): Date {
        const dueByDay = this.calculateCurrentMonthDueDate(contract.paymentDueDay, baseDate);
        const startDate = this.normalizeDate(contract.startDate);

        const isFirstBillingMonth =
            startDate.getFullYear() === baseDate.getFullYear()
            && startDate.getMonth() === baseDate.getMonth();

        if (isFirstBillingMonth && dueByDay < startDate) {
            return startDate;
        }

        return dueByDay;
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

    // Gửi thông báo đến người dùng (placeholder)
    private async sendNotification(contract: ActiveContract, dueDate: Date) {
        this.logger.log(
            `📢 Notify tenant ${contract.tenantId}: Payment due on ${dueDate.toDateString()}`
        );
    }
}
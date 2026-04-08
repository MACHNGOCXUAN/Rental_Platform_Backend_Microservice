import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from 'src/common/services/database.service';
import { randomUUID } from 'crypto';

type ActiveContract = {
    rentalId: string;
    tenantId: string;
    paymentDueDay: number;
    monthlyRent: any;
    startDate: Date;
    endDate: Date;
};

@Injectable()
export class CronjobService {
    private readonly logger = new Logger(CronjobService.name);

    constructor(
        private readonly db: DatabaseService,
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

    // Tạo hóa đơn mới nếu chưa tồn tại, sau đó gửi thông báo trước hạn thanh toán 5 ngày
    async handleBeforeDue(contract: ActiveContract, dueDate: Date) {
        this.logger.log('Bắt đầu cron job thông báo trước hạn thanh toán');

        let payment = await this.findMonthlyRentPayment(contract.rentalId, dueDate);

        if (!payment) {
            payment = await this.createPayment(contract, dueDate);

            this.logger.log(`💰 Created payment ${contract.rentalId}`);
        }

        await this.sendNotification(contract, dueDate);
        this.logger.log(`📢 Sent notification for contract ${contract.rentalId}`);
    }

    // Gửi thông báo nhắc thanh toán khi đã đến hạn nhưng chưa thanh toán
    async handleDueDate(contract: ActiveContract, dueDate: Date) {
        this.logger.log('Bắt đầu cron job thông báo đến hạn thanh toán');

        let payment = await this.findMonthlyRentPayment(contract.rentalId, dueDate);

        if (!payment) {
            payment = await this.createPayment(contract, dueDate);
            this.logger.log(`💰 Created payment ${contract.rentalId} on due date`);
        }

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

        let payment = await this.findMonthlyRentPayment(contract.rentalId, dueDate);

        if (!payment) {
            payment = await this.createPayment(contract, dueDate);
            this.logger.log(`💰 Created missing overdue payment ${contract.rentalId}`);
        }

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
    private async findMonthlyRentPayment(rentalId: string, referenceDate: Date) {
        const { start, end } = this.getMonthRange(referenceDate);

        return this.db.payment.findFirst({
            where: {
                rentalId,
                paymentType: 'rent',
                dueDate: {
                    gte: start,
                    lte: end,
                }
            }
        });
    }

    // Tạo payment mới
    private async createPayment(contract: ActiveContract, dueDate: Date) {
        return this.db.payment.create({
            data: {
                paymentCode: `RENT-${randomUUID()}`,
                rentalId: contract.rentalId,
                paymentType: 'rent',
                amount: contract.monthlyRent,
                remainingAmount: contract.monthlyRent,
                dueDate: dueDate,
                status: 'pending',
            }
        });
    }

    // Gửi thông báo đến người dùng (placeholder)
    private async sendNotification(contract: ActiveContract, dueDate: Date) {
        this.logger.log(
            `📢 Notify tenant ${contract.tenantId}: Payment due on ${dueDate.toDateString()}`
        );
    }
}
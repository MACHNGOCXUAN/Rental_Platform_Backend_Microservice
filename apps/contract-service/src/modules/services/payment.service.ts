import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { ConfirmPaymentDto, PaymentQueryDto } from '../dtos/payment.dto';
import { ContractService } from './contract.service';

@Injectable()
export class PaymentService {

    constructor(
        private readonly db: DatabaseService,
        private readonly contractService: ContractService,
    ) { }

    // Get payments for a user (across all contracts)
    async getMyPayments(userId: string, query: PaymentQueryDto) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = {
            contract: {
                OR: [{ ownerId: userId }, { tenantId: userId }],
            },
        };

        if (query.rentalId) {
            where.rentalId = query.rentalId;
        }
        if (query.status) {
            where.status = query.status;
        }

        const [items, total] = await Promise.all([
            this.db.payment.findMany({
                where,
                orderBy: { dueDate: 'asc' },
                skip,
                take: limit,
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
            }),
            this.db.payment.count({ where }),
        ]);

        return {
            items,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // Get payment detail
    async getPaymentDetail(paymentId: string, userId: string) {
        const payment = await this.db.payment.findUnique({
            where: { paymentId },
            include: {
                contract: {
                    select: {
                        rentalId: true,
                        contractCode: true,
                        propertyId: true,
                        ownerId: true,
                        tenantId: true,
                        monthlyRent: true,
                    },
                },
            },
        });

        if (!payment) throw new NotFoundException('Không tìm thấy phiếu thanh toán');

        if (payment.contract.ownerId !== userId && payment.contract.tenantId !== userId) {
            throw new ForbiddenException('Không có quyền xem phiếu thanh toán này');
        }

        return payment;
    }

    // Confirm a payment (owner confirms tenant's payment)
    async confirmPayment(paymentId: string, dto: ConfirmPaymentDto, userId: string) {
        const payment = await this.db.payment.findUnique({
            where: { paymentId },
            include: {
                contract: {
                    select: { ownerId: true, tenantId: true, rentalId: true, status: true },
                },
            },
        });

        if (!payment) throw new NotFoundException('Không tìm thấy phiếu thanh toán');

        // Only owner can confirm payments
        if (payment.contract.ownerId !== userId) {
            throw new ForbiddenException('Chỉ chủ nhà mới có thể xác nhận thanh toán');
        }

        if (payment.status === 'paid') {
            throw new BadRequestException('Phiếu thanh toán đã được xác nhận');
        }

        const paidAmount = dto.paidAmount ?? Number(payment.amount);
        const remaining = Number(payment.amount) - paidAmount;
        const status = remaining <= 0 ? 'paid' : 'partial';

        const updated = await this.db.payment.update({
            where: { paymentId },
            data: {
                status,
                paymentMethod: dto.paymentMethod,
                paidAmount,
                remainingAmount: Math.max(0, remaining),
                paidAt: new Date(),
                confirmedAt: new Date(),
                transactionId: dto.transactionId,
                transactionRef: dto.transactionRef,
            },
        });

        // If this is a deposit payment and it's now paid, auto-activate contract
        if (payment.paymentType === 'deposit' && status === 'paid' && payment.contract.status === 'fully_signed') {
            await this.contractService.activateContract(payment.contract.rentalId);
        }

        return updated;
    }

    // Get payments summary for a contract
    async getContractPaymentSummary(rentalId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Không có quyền');
        }

        const payments = await this.db.payment.findMany({
            where: { rentalId },
            orderBy: { dueDate: 'asc' },
        });

        const summary = {
            totalAmount: payments.reduce((sum, p) => sum + Number(p.amount), 0),
            totalPaid: payments.reduce((sum, p) => sum + Number(p.paidAmount), 0),
            totalPending: payments.filter(p => p.status === 'pending').length,
            totalOverdue: payments.filter(p => p.status === 'overdue').length,
            payments,
        };

        return summary;
    }
}

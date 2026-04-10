import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateTerminationRequestDto, ReviewTerminationRequestDto } from '../dtos/termination.dto';
import { UserRole } from 'src/common/interfaces/request.interface';
import { Prisma } from 'generated/prisma/client';
import { TerminationReason } from 'generated/prisma/enums';

@Injectable()
export class TerminationService {

    constructor(private readonly db: DatabaseService) { }

    async createTerminationRequest(dto: CreateTerminationRequestDto, userId: string, userRole: UserRole) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: dto.rentalId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.status !== 'active') {
            throw new BadRequestException('Chỉ có thể yêu cầu chấm dứt hợp đồng đang hiệu lực');
        }
        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Không có quyền');
        }

        // Check existing pending termination request
        const existing = await this.db.contractTerminationRequest.findFirst({
            where: { rentalId: dto.rentalId, status: 'pending' },
        });
        if (existing) {
            throw new BadRequestException('Đã có yêu cầu chấm dứt đang chờ xử lý');
        }

        const requesterRole = contract.ownerId === userId ? 'OWNER' : 'TENANT';

        return this.db.contractTerminationRequest.create({
            data: {
                rentalId: dto.rentalId,
                requestedBy: userId,
                requesterRole,
                reason: dto.reason,
                note: dto.note,
                requestedTerminationDate: new Date(dto.requestedTerminationDate),
                earlyTerminationFee: dto.earlyTerminationFee,
                status: 'pending',
            },
        });
    }

    async reviewTerminationRequest(terminationId: string, dto: ReviewTerminationRequestDto, userId: string) {
        const termination = await this.db.contractTerminationRequest.findUnique({
            where: { terminationRequestId: terminationId },
            include: { rental: true },
        });

        if (!termination) throw new NotFoundException('Không tìm thấy yêu cầu chấm dứt');
        if (termination.status !== 'pending') {
            throw new BadRequestException('Yêu cầu đã được xử lý');
        }

        // The other party reviews (not the requester)
        const contract = termination.rental;
        const isOwner = contract.ownerId === userId;
        const isTenant = contract.tenantId === userId;

        if (!isOwner && !isTenant) {
            throw new ForbiddenException('Không có quyền');
        }

        if (termination.requestedBy === userId) {
            throw new BadRequestException('Bạn không thể tự duyệt yêu cầu của mình');
        }

        return this.db.$transaction(async (tx) => {
            const updated = await tx.contractTerminationRequest.update({
                where: { terminationRequestId: terminationId },
                data: {
                    status: dto.status,
                    reviewedBy: userId,
                    reviewedAt: new Date(),
                    reviewNote: dto.reviewNote,
                },
            });

            // If approved, terminate the contract
            if (dto.status === 'approved') {
                await this.settleTermination(tx, termination);
                await tx.rentalContract.update({
                    where: { rentalId: termination.rentalId },
                    data: { status: 'terminated', isActive: false },
                });
            }

            return updated;
        });
    }

    async getTerminationRequests(rentalId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Không có quyền');
        }

        return this.db.contractTerminationRequest.findMany({
            where: { rentalId },
            orderBy: { createdAt: 'desc' },
        });
    }

    private isDepositForfeited(reason: TerminationReason) {
        return reason === 'breach_of_contract' || reason === 'non_payment';
    }

    private getPaymentRemainingAmount(payment: any) {
        if (payment.remainingAmount && payment.remainingAmount.gt(0)) {
            return payment.remainingAmount;
        }

        const paidAmount = payment.paidAmount ?? new Prisma.Decimal(0);
        return payment.amount.sub(paidAmount);
    }

    private async ensureEarlyTerminationPayment(tx: Prisma.TransactionClient, termination: any) {
        const fee = Number(termination.earlyTerminationFee || 0);
        if (!Number.isFinite(fee) || fee <= 0) {
            return null;
        }

        const existing = await tx.payment.findFirst({
            where: {
                rentalId: termination.rentalId,
                paymentType: 'early_termination',
                dueDate: termination.requestedTerminationDate,
            },
        });

        if (existing) {
            return existing;
        }

        return tx.payment.create({
            data: {
                paymentCode: `EARLY-${Date.now()}-${termination.rentalId.slice(0, 6)}`,
                rentalId: termination.rentalId,
                paymentType: 'early_termination',
                amount: fee,
                remainingAmount: fee,
                dueDate: termination.requestedTerminationDate,
                status: 'pending',
            },
        });
    }

    private async settleTermination(tx: Prisma.TransactionClient, termination: any) {
        const contract = termination.rental;
        const terminationDate = termination.requestedTerminationDate;

        const earlyTerminationPayment = await this.ensureEarlyTerminationPayment(tx, termination);

        const unpaidPayments = await tx.payment.findMany({
            where: {
                rentalId: contract.rentalId,
                paymentType: { not: 'deposit' },
                status: { in: ['pending', 'overdue', 'partial'] },
                dueDate: { lte: terminationDate },
            },
            orderBy: { dueDate: 'asc' },
        });

        if (earlyTerminationPayment && ['pending', 'overdue', 'partial'].includes(earlyTerminationPayment.status)) {
            unpaidPayments.push(earlyTerminationPayment);
        }

        const depositTransaction = await tx.depositTransaction.findFirst({
            where: { rentalId: contract.rentalId },
            orderBy: { createdAt: 'desc' },
        });

        if (!depositTransaction) {
            return;
        }

        const ownerWallet = await tx.wallet.findUnique({
            where: { userId: contract.ownerId },
        });

        const tenantWallet = await tx.wallet.findUnique({
            where: { userId: contract.tenantId },
        });

        if (!ownerWallet || !tenantWallet) {
            throw new NotFoundException('Không tìm thấy ví người dùng');
        }

        let unpaidTotal = new Prisma.Decimal(0);
        for (const payment of unpaidPayments) {
            const remaining = this.getPaymentRemainingAmount(payment);
            if (remaining.gt(0)) {
                unpaidTotal = unpaidTotal.add(remaining);
            }
        }

        const depositAmount = depositTransaction.amount ?? new Prisma.Decimal(0);
        if (depositAmount.lte(0)) {
            return;
        }

        if (this.isDepositForfeited(termination.reason)) {
            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(depositAmount),
                    balance: ownerWallet.balance.add(depositAmount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: depositAmount,
                    type: 'fee',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Tịch thu tiền cọc hợp đồng ${contract.contractCode}`,
                },
            });

            await tx.depositTransaction.update({
                where: { id: depositTransaction.id },
                data: { status: 'forfeited' },
            });

            return;
        }

        const usedForOwner = depositAmount.lt(unpaidTotal) ? depositAmount : unpaidTotal;
        const refundAmount = depositAmount.sub(usedForOwner);

        await tx.wallet.update({
            where: { walletId: ownerWallet.walletId },
            data: {
                pendingBalance: ownerWallet.pendingBalance.sub(depositAmount),
                balance: ownerWallet.balance.add(usedForOwner),
            },
        });

        if (usedForOwner.gt(0)) {
            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: usedForOwner,
                    type: 'receive_rent',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Thanh toán công nợ từ tiền cọc hợp đồng ${contract.contractCode}`,
                },
            });
        }

        if (refundAmount.gt(0)) {
            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: {
                    balance: tenantWallet.balance.add(refundAmount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: refundAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Hoàn tiền cọc hợp đồng ${contract.contractCode}`,
                },
            });
        }

        const depositStatus = refundAmount.eq(depositAmount)
            ? 'fully_returned'
            : refundAmount.gt(0)
                ? 'partially_returned'
                : 'partially_returned';

        await tx.depositTransaction.update({
            where: { id: depositTransaction.id },
            data: { status: depositStatus },
        });

        let remainingToCover = usedForOwner;
        for (const payment of unpaidPayments) {
            if (remainingToCover.lte(0)) {
                break;
            }

            const remaining = this.getPaymentRemainingAmount(payment);
            if (remaining.lte(0)) {
                continue;
            }

            if (remainingToCover.gte(remaining)) {
                await tx.payment.update({
                    where: { paymentId: payment.paymentId },
                    data: {
                        status: 'paid',
                        paidAmount: payment.amount,
                        remainingAmount: 0,
                        paymentMethod: 'other',
                        paidAt: new Date(),
                        confirmedAt: new Date(),
                    },
                });
                remainingToCover = remainingToCover.sub(remaining);
            } else {
                const paidAmount = (payment.paidAmount ?? new Prisma.Decimal(0)).add(remainingToCover);
                await tx.payment.update({
                    where: { paymentId: payment.paymentId },
                    data: {
                        status: 'partial',
                        paidAmount,
                        remainingAmount: remaining.sub(remainingToCover),
                        paymentMethod: 'other',
                    },
                });
                remainingToCover = new Prisma.Decimal(0);
            }
        }
    }
}

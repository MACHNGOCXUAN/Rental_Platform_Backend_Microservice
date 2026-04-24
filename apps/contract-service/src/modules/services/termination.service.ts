import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateTerminationRequestDto, ReviewTerminationRequestDto, UpdateTerminationStatusDto } from '../dtos/termination.dto';
import { UserRole } from 'src/common/interfaces/request.interface';
import { Prisma } from 'generated/prisma/client';
import { TerminationReason, TerminationRequestStatus, TerminationResolution, ReportStatus, ReportPriority, ReportType, ReportAction } from 'generated/prisma/enums';
import { EstateClientService } from './estate-client.service';

type TerminationPolicy = {
    depositForfeited: boolean;
    depositForfeitedTo: 'OWNER' | 'TENANT' | null;
    penaltyPayer: 'OWNER' | 'TENANT' | null;
    penaltyAmount: Prisma.Decimal;
};

@Injectable()
export class TerminationService {

    constructor(
        private readonly db: DatabaseService,
        private readonly estateClient: EstateClientService,
    ) { }

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

        const activeStatuses: TerminationRequestStatus[] = [
            'pending',
            'rejected',
            'negotiating',
            'admin_review',
            'admin_processing',
        ];

        const latest = await this.db.contractTerminationRequest.findFirst({
            where: { rentalId: dto.rentalId },
            orderBy: { createdAt: 'desc' },
        });

        if (latest && activeStatuses.includes(latest.status as TerminationRequestStatus)) {
            throw new BadRequestException('Đã có yêu cầu chấm dứt đang xử lý');
        }

        const activeAdminReport = await this.db.report.findFirst({
            where: {
                rentalId: dto.rentalId,
                status: { in: [ReportStatus.admin, ReportStatus.cancel_requested] },
            },
        });

        if (activeAdminReport) {
            throw new BadRequestException('Đang có khiếu nại do admin xử lý');
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

    // Chủ nhà hoặc khách thuê duyệt yêu cầu chấm dứt của bên còn lại, chỉ được duyệt nếu đang ở trạng thái pending
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

        const propertyId = termination.rental?.propertyId;

        const updated = await this.db.$transaction(async (tx) => {
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
                    data: {
                        status: termination.reason === 'lease_end' ? 'expired' : 'terminated',
                        isActive: false,
                    },
                });

                await tx.rentalRequest.update({
                    where: { contractId: termination.rentalId },
                    data: { status: 'expired' },
                });
            }

            return updated;
        });

        if (dto.status === 'approved' && propertyId) {
            await this.estateClient.updatePropertyContractStatus(
                propertyId,
                'contract_ended',
                termination.rentalId,
            );
        }

        return updated;
    }

    async updateTerminationStatus(
        terminationId: string,
        dto: UpdateTerminationStatusDto,
        userId: string,
        role: UserRole,
    ) {
        const termination = await this.db.contractTerminationRequest.findUnique({
            where: { terminationRequestId: terminationId },
            include: { rental: true },
        });

        if (!termination) throw new NotFoundException('Không tìm thấy yêu cầu chấm dứt');

        const contract = termination.rental;
        const isOwner = contract.ownerId === userId;
        const isTenant = contract.tenantId === userId;
        const isAdmin = role === UserRole.ADMIN;

        if (!isAdmin && !isOwner && !isTenant) {
            throw new ForbiddenException('Không có quyền');
        }

        const terminalStatuses: TerminationRequestStatus[] = ['approved', 'resolved', 'cancelled'];
        if (terminalStatuses.includes(termination.status as TerminationRequestStatus)) {
            throw new BadRequestException('Yêu cầu đã kết thúc');
        }

        const nextStatus = dto.status as TerminationRequestStatus;

        if (nextStatus === 'resolved' && !dto.resolution) {
            throw new BadRequestException('Vui lòng chọn kết quả giải quyết');
        }

        if (!isAdmin) {
            const allowed: Record<TerminationRequestStatus, TerminationRequestStatus[]> = {
                rejected: ['negotiating', 'admin_review'],
                negotiating: ['resolved', 'admin_review'],
                pending: [],
                approved: [],
                admin_review: [],
                admin_processing: [],
                resolved: [],
                cancelled: [],
            };

            if (!allowed[termination.status as TerminationRequestStatus]?.includes(nextStatus)) {
                throw new BadRequestException('Chuyển trạng thái không hợp lệ');
            }
        } else {
            const allowedAdmin: Record<TerminationRequestStatus, TerminationRequestStatus[]> = {
                admin_review: ['admin_processing', 'resolved'],
                admin_processing: ['resolved'],
                pending: [],
                rejected: [],
                negotiating: [],
                approved: [],
                resolved: [],
                cancelled: [],
            };

            if (!allowedAdmin[termination.status as TerminationRequestStatus]?.includes(nextStatus)) {
                throw new BadRequestException('Chuyển trạng thái không hợp lệ');
            }
        }

        const propertyId = termination.rental?.propertyId;

        const updated = await this.db.$transaction(async (tx) => {
            const updateData: Prisma.ContractTerminationRequestUpdateInput = {
                status: nextStatus,
                reviewNote: dto.note ?? termination.reviewNote,
            };

            if (nextStatus === 'resolved') {
                updateData.resolution = dto.resolution as TerminationResolution;
                updateData.resolvedBy = userId;
                updateData.resolvedAt = new Date();
            }

            if (nextStatus === 'admin_processing' && isAdmin) {
                updateData.reviewedBy = userId;
                updateData.reviewedAt = new Date();
            }

            const updated = await tx.contractTerminationRequest.update({
                where: { terminationRequestId: terminationId },
                data: updateData,
            });

            if (nextStatus === 'admin_review') {
                const existingReport = await tx.report.findFirst({
                    where: { terminationRequestId: terminationId },
                });

                if (!existingReport) {
                    const againstId = termination.requestedBy === contract.ownerId
                        ? contract.tenantId
                        : contract.ownerId;

                    const report = await tx.report.create({
                        data: {
                            rentalId: termination.rentalId,
                            terminationRequestId: terminationId,
                            createdBy: termination.requestedBy,
                            againstId,
                            type: ReportType.contract,
                            priority: ReportPriority.medium,
                            status: ReportStatus.admin,
                            title: `Tranh chấp chấm dứt hợp đồng ${contract.contractCode}`,
                            description: termination.note
                                ? `Yêu cầu chấm dứt được gửi lên admin. Ghi chú: ${termination.note}`
                                : 'Yêu cầu chấm dứt được gửi lên admin để xem xét.',
                        },
                    });

                    await tx.reportHistory.create({
                        data: {
                            reportId: report.id,
                            action: ReportAction.SENT_TO_ADMIN,
                            oldStatus: ReportStatus.open,
                            newStatus: ReportStatus.admin,
                            performedBy: userId,
                            note: 'Gửi admin xử lý tranh chấp chấm dứt',
                        },
                    });
                } else if (existingReport.status !== ReportStatus.admin) {
                    await tx.report.update({
                        where: { id: existingReport.id },
                        data: { status: ReportStatus.admin },
                    });
                }
            }

            if (nextStatus === 'resolved' && dto.resolution === 'terminate_contract') {
                await this.settleTermination(tx, termination);
                await tx.rentalContract.update({
                    where: { rentalId: termination.rentalId },
                    data: {
                        status: termination.reason === 'lease_end' ? 'expired' : 'terminated',
                        isActive: false,
                    },
                });
            }

            if (isAdmin && nextStatus === 'resolved') {
                const existingReport = await tx.report.findFirst({
                    where: { terminationRequestId: terminationId },
                });

                if (existingReport && existingReport.status !== ReportStatus.resolved) {
                    await tx.report.update({
                        where: { id: existingReport.id },
                        data: {
                            status: ReportStatus.resolved,
                            adminNote: dto.note ?? existingReport.adminNote,
                            resolvedAt: new Date(),
                        },
                    });

                    await tx.reportHistory.create({
                        data: {
                            reportId: existingReport.id,
                            action: ReportAction.RESOLVED,
                            oldStatus: existingReport.status,
                            newStatus: ReportStatus.resolved,
                            performedBy: userId,
                            note: dto.note ?? 'Admin đã giải quyết tranh chấp chấm dứt',
                        },
                    });
                }
            }

            return updated;
        });

        if (nextStatus === 'resolved' && dto.resolution === 'terminate_contract' && propertyId) {
            await this.estateClient.updatePropertyContractStatus(
                propertyId,
                'contract_ended',
                termination.rentalId,
            );
        }

        return updated;
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

    private getTerminationPolicy(termination: any): TerminationPolicy {
        const reason = termination.reason as TerminationReason;
        const fee = new Prisma.Decimal(termination.earlyTerminationFee || 0);
        const requesterRole = termination.requesterRole as 'OWNER' | 'TENANT';

        // TH1: Unilateral termination
        // - Owner requests: refund deposit to tenant
        // - Tenant requests: deposit forfeited to owner
        if (reason === 'unilateral_termination') {
            const depositForfeited = requesterRole === 'TENANT';
            return {
                depositForfeited,
                depositForfeitedTo: depositForfeited ? 'OWNER' : null,
                penaltyPayer: fee.gt(0) ? requesterRole : null,
                penaltyAmount: fee,
            };
        }

        // TH2: Violation -> violating party pays fee to the other side.
        if (reason === 'breach_of_contract') {
            const violator = requesterRole === 'OWNER' ? 'TENANT' : 'OWNER';
            return {
                depositForfeited: true,
                depositForfeitedTo: violator === 'OWNER' ? 'TENANT' : 'OWNER',
                penaltyPayer: fee.gt(0) ? violator : null,
                penaltyAmount: fee,
            };
        }

        if (reason === 'non_payment') {
            return {
                depositForfeited: true,
                depositForfeitedTo: 'OWNER',
                penaltyPayer: fee.gt(0) ? 'TENANT' : null,
                penaltyAmount: fee,
            };
        }

        // TH3 + TH4: force majeure / mutual agreement -> refund deposit.
        if (reason === 'force_majeure' || reason === 'mutual_agreement' || reason === 'lease_end') {
            return {
                depositForfeited: false,
                depositForfeitedTo: null,
                penaltyPayer: null,
                penaltyAmount: new Prisma.Decimal(0),
            };
        }

        return {
            depositForfeited: false,
            depositForfeitedTo: null,
            penaltyPayer: null,
            penaltyAmount: new Prisma.Decimal(0),
        };
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

    // Dùng transaction để đảm bảo tính toàn vẹn khi thanh toán chấm dứt hợp đồng
    private async settleTermination(tx: Prisma.TransactionClient, termination: any) {
        const contract = termination.rental;
        const terminationDate = termination.requestedTerminationDate;
        const policy = this.getTerminationPolicy(termination);

        const earlyTerminationPayment = policy.penaltyPayer === 'TENANT'
            ? await this.ensureEarlyTerminationPayment(tx, termination)
            : null;

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

        let depositTransaction = await tx.depositTransaction.findFirst({
            where: { rentalId: contract.rentalId },
            orderBy: { createdAt: 'desc' },
        });

        if (!depositTransaction) {
            const paidDepositPayment = await tx.payment.findFirst({
                where: {
                    rentalId: contract.rentalId,
                    paymentType: 'deposit',
                    status: 'paid',
                },
                orderBy: { paidAt: 'desc' },
            });

            if (!paidDepositPayment) {
                return;
            }

            depositTransaction = await tx.depositTransaction.create({
                data: {
                    rentalId: contract.rentalId,
                    amount: paidDepositPayment.amount,
                    status: 'held',
                },
            });
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

        if (policy.penaltyPayer === 'OWNER' && policy.penaltyAmount.gt(0)) {
            if (ownerWallet.balance.lt(policy.penaltyAmount)) {
                throw new BadRequestException('Số dư ví chủ nhà không đủ để thanh toán phí chấm dứt');
            }

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    balance: ownerWallet.balance.sub(policy.penaltyAmount),
                },
            });

            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: {
                    balance: tenantWallet.balance.add(policy.penaltyAmount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: policy.penaltyAmount.mul(-1),
                    type: 'fee',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Phí chấm dứt hợp đồng ${contract.contractCode}`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: policy.penaltyAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Nhận phí chấm dứt hợp đồng ${contract.contractCode}`,
                },
            });
        }

        if (policy.penaltyPayer === 'TENANT' && policy.penaltyAmount.gt(0)) {
            if (tenantWallet.balance.lt(policy.penaltyAmount)) {
                throw new BadRequestException('Số dư ví khách thuê không đủ để thanh toán phí chấm dứt');
            }

            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: {
                    balance: tenantWallet.balance.sub(policy.penaltyAmount),
                },
            });

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    balance: ownerWallet.balance.add(policy.penaltyAmount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: policy.penaltyAmount.mul(-1),
                    type: 'fee',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Phí chấm dứt hợp đồng ${contract.contractCode}`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: policy.penaltyAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Nhận phí chấm dứt hợp đồng ${contract.contractCode}`,
                },
            });
        }

        if (termination.reason === 'unilateral_termination' && termination.requesterRole === 'OWNER') {
            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(depositAmount),
                },
            });

            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: {
                    balance: tenantWallet.balance.add(depositAmount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: depositAmount.mul(-1),
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Hoàn tiền cọc do đơn phương chấm dứt ${contract.contractCode}`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: depositAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Hoàn tiền cọc do đơn phương chấm dứt ${contract.contractCode}`,
                },
            });

            await tx.depositTransaction.update({
                where: { id: depositTransaction.id },
                data: { status: 'fully_returned' },
            });

            return;
        }

        if (policy.depositForfeited && policy.depositForfeitedTo === 'OWNER') {
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

        if (policy.depositForfeited && policy.depositForfeitedTo === 'TENANT') {
            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(depositAmount),
                },
            });

            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: {
                    balance: tenantWallet.balance.add(depositAmount),
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: depositAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Hoàn tiền cọc do chủ nhà đơn phương chấm dứt ${contract.contractCode}`,
                },
            });

            await tx.depositTransaction.update({
                where: { id: depositTransaction.id },
                data: { status: 'fully_returned' },
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

    async autoTerminateContract(params: { rentalId: string; reason: TerminationReason; note?: string }) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: params.rentalId },
        });

        if (!contract || contract.status !== 'active') {
            return null;
        }

        const existing = await this.db.contractTerminationRequest.findFirst({
            where: { rentalId: params.rentalId, status: 'pending' },
        });

        if (existing) {
            return existing;
        }

        const propertyId = contract.propertyId;

        const termination = await this.db.$transaction(async (tx) => {
            const termination = await tx.contractTerminationRequest.create({
                data: {
                    rentalId: params.rentalId,
                    requestedBy: contract.ownerId,
                    requesterRole: 'OWNER',
                    reason: params.reason,
                    note: params.note,
                    requestedTerminationDate: new Date(),
                    status: 'approved',
                    reviewedBy: contract.ownerId,
                    reviewedAt: new Date(),
                    reviewNote: 'Auto-approved by system',
                },
                include: { rental: true },
            });

            await this.settleTermination(tx, termination);

            await tx.rentalContract.update({
                where: { rentalId: params.rentalId },
                data: {
                    status: params.reason === 'lease_end' ? 'expired' : 'terminated',
                    isActive: false,
                },
            });

            await tx.rentalRequest.update({
                where: { contractId: termination.rentalId },
                data: { status: 'expired' },
            });

            return termination;
        });

        if (propertyId) {
            await this.estateClient.updatePropertyContractStatus(
                propertyId,
                'contract_ended',
                params.rentalId,
            );
        }

        return termination;
    }
}

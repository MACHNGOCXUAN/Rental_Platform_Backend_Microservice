import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateTerminationRequestDto, ReviewTerminationRequestDto, UpdateTerminationStatusDto } from '../dtos/termination.dto';
import { UserRole } from 'src/common/interfaces/request.interface';
import { Prisma } from 'generated/prisma/client';
import { TerminationReason, TerminationRequestStatus, TerminationResolution, ReportStatus, ReportPriority, ReportType, ReportAction } from 'generated/prisma/enums';
import { EstateClientService } from './estate-client.service';
import { ClientProxy } from '@nestjs/microservices';
import contractBlockchain from 'src/utils/config/blockchain';

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
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
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

        // Validate: ngày chấm dứt không được trong quá khứ
        const requestedDate = new Date(dto.requestedTerminationDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        requestedDate.setHours(0, 0, 0, 0);
        if (requestedDate < today) {
            throw new BadRequestException('Ngày chấm dứt yêu cầu không được là ngày trong quá khứ');
        }

        const activeStatuses: TerminationRequestStatus[] = [
            'pending',
            'rejected',
            'negotiating',
            'admin_review',
            'admin_processing',
        ];

        const requesterRole = contract.ownerId === userId ? 'OWNER' : 'TENANT';

        // Dùng transaction để tránh race condition khi 2 request tạo cùng lúc
        const created = await this.db.$transaction(async (tx) => {
            // Re-check bên trong transaction để đảm bảo atomicity
            // LOCK THE RENTAL CONTRACT TO PREVENT RACE CONDITION
            await tx.rentalContract.update({
                where: { rentalId: dto.rentalId },
                data: { updatedAt: new Date() },
            });

            const latest = await tx.contractTerminationRequest.findFirst({
                where: { rentalId: dto.rentalId },
                orderBy: { createdAt: 'desc' },
            });

            if (latest && activeStatuses.includes(latest.status as TerminationRequestStatus)) {
                throw new BadRequestException('Đã có yêu cầu chấm dứt đang xử lý');
            }

            const activeAdminReport = await tx.report.findFirst({
                where: {
                    rentalId: dto.rentalId,
                    status: { in: [ReportStatus.admin, ReportStatus.cancel_requested] },
                },
            });

            if (activeAdminReport) {
                throw new BadRequestException('Đang có khiếu nại do admin xử lý');
            }

            return tx.contractTerminationRequest.create({
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
        });

        // Notify the other party about the termination request
        const otherPartyId = contract.ownerId === userId ? contract.tenantId : contract.ownerId;
        this.rabbitClient.emit('termination.created', {
            terminationRequestId: created.terminationRequestId,
            rentalId: dto.rentalId,
            contractCode: contract.contractCode,
            requestedBy: userId,
            requesterRole,
            reason: dto.reason,
            otherPartyId,
            ownerId: contract.ownerId,
            tenantId: contract.tenantId,
        });

        return created;
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

                // Tìm hợp đồng gốc (v1) để cập nhật RentalRequest
                // Vì RentalRequest.contractId luôn trỏ đến hợp đồng gốc, không phải phiên bản chỉnh sửa
                let rootContractId = termination.rentalId;
                const terminatedContract = await tx.rentalContract.findUnique({
                    where: { rentalId: termination.rentalId },
                    select: { parentContractId: true },
                });
                if (terminatedContract?.parentContractId) {
                    // Leo ngược lên tìm root (v1 không có parentContractId)
                    let current = terminatedContract.parentContractId;
                    while (current) {
                        const parent = await tx.rentalContract.findUnique({
                            where: { rentalId: current },
                            select: { parentContractId: true, rentalId: true },
                        });
                        if (!parent?.parentContractId) {
                            rootContractId = parent?.rentalId ?? current;
                            break;
                        }
                        current = parent.parentContractId;
                    }
                }

                await tx.rentalRequest.updateMany({
                    where: { contractId: rootContractId },
                    data: { status: 'expired' },
                });
            }

            return updated;
        });

        // Call blockchain termination outside transaction
        if (dto.status === 'approved') {
            try {
                const chainContractId = contract.parentContractId ? contract.parentContractId : contract.rentalId;
                const terminateTx = await contractBlockchain.terminateContract(chainContractId);
                await terminateTx.wait();
                console.log(`[Blockchain] Terminated contract ${chainContractId}`);
            } catch (error) {
                console.error(`[Blockchain] Failed to terminate contract ${termination.rentalId}:`, error);
            }
        }

        if (dto.status === 'approved' && propertyId) {
            await this.estateClient.updatePropertyContractStatus(
                propertyId,
                'contract_ended',
                termination.rentalId,
            );
        }

        // Notify the requester about the review result
        this.rabbitClient.emit('termination.reviewed', {
            terminationRequestId: terminationId,
            rentalId: termination.rentalId,
            contractCode: contract.contractCode,
            reviewedBy: userId,
            status: dto.status,
            reviewNote: dto.reviewNote,
            requesterId: termination.requestedBy,
            ownerId: contract.ownerId,
            tenantId: contract.tenantId,
        });

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
                await this.settleTermination(tx, termination, {
                    depositReturnAmount: dto.depositReturnAmount,
                    penaltyAmount: dto.penaltyAmount,
                    compensationAmount: dto.compensationAmount,
                });
                await tx.rentalContract.update({
                    where: { rentalId: termination.rentalId },
                    data: {
                        status: termination.reason === 'lease_end' ? 'expired' : 'terminated',
                        isActive: false,
                    },
                });

                const rootContractId2 = await this.findRootContractId(tx, termination.rentalId);
                await tx.rentalRequest.updateMany({
                    where: { contractId: rootContractId2 },
                    data: { status: 'expired' },
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

        // Call blockchain termination outside transaction
        if (nextStatus === 'resolved' && dto.resolution === 'terminate_contract') {
            try {
                const chainContractId = contract.parentContractId ? contract.parentContractId : contract.rentalId;
                const terminateTx = await contractBlockchain.terminateContract(chainContractId);
                await terminateTx.wait();
                console.log(`[Blockchain] Terminated contract ${chainContractId} via admin resolution`);
            } catch (error) {
                console.error(`[Blockchain] Failed to terminate contract ${termination.rentalId}:`, error);
            }
        }

        // Emit notification events based on status change
        if (nextStatus === 'admin_review') {
            this.rabbitClient.emit('termination.escalated', {
                terminationRequestId: terminationId,
                rentalId: termination.rentalId,
                contractCode: contract.contractCode,
                escalatedBy: userId,
                reason: termination.reason,
                note: dto.note,
                ownerId: contract.ownerId,
                tenantId: contract.tenantId,
            });
        } else if (nextStatus === 'resolved' && isAdmin) {
            this.rabbitClient.emit('termination.resolved', {
                terminationRequestId: terminationId,
                rentalId: termination.rentalId,
                contractCode: contract.contractCode,
                resolvedBy: userId,
                resolution: dto.resolution,
                note: dto.note,
                ownerId: contract.ownerId,
                tenantId: contract.tenantId,
            });
        } else if (nextStatus === 'negotiating') {
            const otherPartyId = termination.requestedBy === contract.ownerId ? contract.tenantId : contract.ownerId;
            this.rabbitClient.emit('termination.negotiating', {
                terminationRequestId: terminationId,
                rentalId: termination.rentalId,
                contractCode: contract.contractCode,
                initiatedBy: userId,
                otherPartyId,
                ownerId: contract.ownerId,
                tenantId: contract.tenantId,
            });
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

    // Helper: Leo ngược cây hợp đồng để tìm hợp đồng gốc (v1)
    // RentalRequest.contractId luôn trỏ đến hợp đồng gốc, không phải phiên bản chỉnh sửa
    private async findRootContractId(tx: Prisma.TransactionClient, contractId: string): Promise<string> {
        let rootId = contractId;
        let current: string | null = contractId;
        while (current) {
            const row = await tx.rentalContract.findUnique({
                where: { rentalId: current },
                select: { rentalId: true, parentContractId: true },
            });
            if (!row?.parentContractId) {
                rootId = row?.rentalId ?? current;
                break;
            }
            current = row.parentContractId;
        }
        return rootId;
    }

    // Dùng transaction để đảm bảo tính toàn vẹn khi thanh toán chấm dứt hợp đồng
    private async settleTermination(tx: Prisma.TransactionClient, termination: any, adminOverrides?: { depositReturnAmount?: number, penaltyAmount?: number, compensationAmount?: number }) {
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

        if (adminOverrides && (adminOverrides.depositReturnAmount !== undefined || adminOverrides.compensationAmount !== undefined || adminOverrides.penaltyAmount !== undefined)) {
            const depositReturnAmt = new Prisma.Decimal(adminOverrides.depositReturnAmount || 0);
            const retainedAmt = new Prisma.Decimal(adminOverrides.compensationAmount || 0);
            const penaltyAmt = new Prisma.Decimal(adminOverrides.penaltyAmount || 0);

            // Deduct pendingBalance from owner to release deposit hold
            const actualDeduct = ownerWallet.pendingBalance.gte(depositAmount)
                ? depositAmount
                : ownerWallet.pendingBalance;

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: { pendingBalance: ownerWallet.pendingBalance.sub(actualDeduct) },
            });

            // 1. Hoàn cọc cho người thuê
            if (depositReturnAmt.gt(0)) {
                await tx.wallet.update({
                    where: { walletId: tenantWallet.walletId },
                    data: { balance: tenantWallet.balance.add(depositReturnAmt) },
                });
                await tx.walletTransaction.create({
                    data: {
                        walletId: tenantWallet.walletId,
                        amount: depositReturnAmt,
                        type: 'refund',
                        status: 'success',
                        referenceId: termination.terminationRequestId,
                        description: `Hoàn tiền cọc theo quyết định giải quyết khiếu nại (Admin)`,
                    },
                });
            }

            // 2. Tiền cọc giữ lại cho chủ nhà (Bồi thường)
            if (retainedAmt.gt(0)) {
                await tx.wallet.update({
                    where: { walletId: ownerWallet.walletId },
                    data: { balance: ownerWallet.balance.add(retainedAmt) },
                });
                await tx.walletTransaction.create({
                    data: {
                        walletId: ownerWallet.walletId,
                        amount: retainedAmt,
                        type: 'fee',
                        status: 'success',
                        referenceId: termination.terminationRequestId,
                        description: `Tiền cọc giữ lại theo quyết định giải quyết khiếu nại (Admin)`,
                    },
                });
            }

            // 3. Phí phạt (Tuỳ chỉnh, ở đây giả định trừ chủ nhà theo design hoặc logic)
            // Nếu có penaltyAmount > 0, chúng ta sẽ trừ vào owner theo design hiện tại của FE
            if (penaltyAmt.gt(0)) {
                // Đảm bảo chủ nhà có đủ tiền để trừ phạt nền tảng
                if (ownerWallet.balance.add(retainedAmt).gte(penaltyAmt)) {
                    await tx.wallet.update({
                        where: { walletId: ownerWallet.walletId },
                        data: { balance: ownerWallet.balance.add(retainedAmt).sub(penaltyAmt) }, // sub from the updated balance
                    });
                    await tx.walletTransaction.create({
                        data: {
                            walletId: ownerWallet.walletId,
                            amount: penaltyAmt.mul(-1),
                            type: 'fee',
                            status: 'success',
                            referenceId: termination.terminationRequestId,
                            description: `Phí phạt vi phạm theo quyết định giải quyết khiếu nại (Admin)`,
                        },
                    });
                }
            }

            await tx.depositTransaction.update({
                where: { id: depositTransaction.id },
                data: { status: 'resolved' as any }, // Assuming resolved is a valid status or similar
            });

            return; // Thoát ra, KHÔNG chạy các logic tự động bên dưới nữa
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
            // Bảo vệ pendingBalance không bị âm
            const actualDeduct = ownerWallet.pendingBalance.gte(depositAmount)
                ? depositAmount
                : ownerWallet.pendingBalance;

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(actualDeduct),
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
            const actualDeductOwner = ownerWallet.pendingBalance.gte(depositAmount)
                ? depositAmount
                : ownerWallet.pendingBalance;

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(actualDeductOwner),
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
            const actualDeductTenant = ownerWallet.pendingBalance.gte(depositAmount)
                ? depositAmount
                : ownerWallet.pendingBalance;

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(actualDeductTenant),
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

        const actualDeductDefault = ownerWallet.pendingBalance.gte(depositAmount)
            ? depositAmount
            : ownerWallet.pendingBalance;

        await tx.wallet.update({
            where: { walletId: ownerWallet.walletId },
            data: {
                pendingBalance: ownerWallet.pendingBalance.sub(actualDeductDefault),
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

    // Admin settlement: áp dụng số tiền admin chỉ định trực tiếp
    private async settleTerminationByAdmin(
        tx: Prisma.TransactionClient,
        termination: any,
        params: { depositReturnAmount: number; penaltyAmount: number; compensationAmount: number; adminNote: string },
    ) {
        const contract = termination.rental;

        const ownerWallet = await tx.wallet.findUnique({
            where: { userId: contract.ownerId },
        });

        const tenantWallet = await tx.wallet.findUnique({
            where: { userId: contract.tenantId },
        });

        if (!ownerWallet || !tenantWallet) {
            throw new NotFoundException('Không tìm thấy ví người dùng');
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

            if (paidDepositPayment) {
                depositTransaction = await tx.depositTransaction.create({
                    data: {
                        rentalId: contract.rentalId,
                        amount: paidDepositPayment.amount,
                        status: 'held',
                    },
                });
            }
        }

        const depositReturnAmount = new Prisma.Decimal(params.depositReturnAmount);
        const penaltyAmount = new Prisma.Decimal(params.penaltyAmount);
        const compensationAmount = new Prisma.Decimal(params.compensationAmount);

        // Xử lý phí phạt (trừ từ bên vi phạm, cộng cho bên kia)
        if (penaltyAmount.gt(0)) {
            // Xác định ai phải trả phí phạt dựa vào requester: bên yêu cầu chấm dứt thường là bên phải trả
            const penaltyPayer = termination.requesterRole as 'OWNER' | 'TENANT';
            const payerWallet = penaltyPayer === 'OWNER' ? ownerWallet : tenantWallet;
            const receiverWallet = penaltyPayer === 'OWNER' ? tenantWallet : ownerWallet;

            if (payerWallet.balance.lt(penaltyAmount)) {
                throw new BadRequestException(`Số dư ví ${penaltyPayer === 'OWNER' ? 'chủ nhà' : 'khách thuê'} không đủ để thanh toán phí phạt`);
            }

            await tx.wallet.update({
                where: { walletId: payerWallet.walletId },
                data: { balance: payerWallet.balance.sub(penaltyAmount) },
            });

            await tx.wallet.update({
                where: { walletId: receiverWallet.walletId },
                data: { balance: receiverWallet.balance.add(penaltyAmount) },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: payerWallet.walletId,
                    amount: penaltyAmount.mul(-1),
                    type: 'fee',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Phí phạt (admin quyết định) - HĐ ${contract.contractCode}`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: receiverWallet.walletId,
                    amount: penaltyAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Nhận phí phạt (admin quyết định) - HĐ ${contract.contractCode}`,
                },
            });
        }

        // Xử lý hoàn cọc cho tenant
        if (depositTransaction && depositReturnAmount.gt(0)) {
            const depositAmount = depositTransaction.amount ?? new Prisma.Decimal(0);
            const actualDeduct = ownerWallet.pendingBalance.gte(depositAmount)
                ? depositAmount
                : ownerWallet.pendingBalance;

            // Trừ pendingBalance owner
            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(actualDeduct),
                    // Phần còn lại (depositAmount - depositReturnAmount) chuyển vào balance owner
                    balance: ownerWallet.balance.add(depositAmount.sub(depositReturnAmount).gt(0) ? depositAmount.sub(depositReturnAmount) : new Prisma.Decimal(0)),
                },
            });

            // Hoàn cho tenant
            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: { balance: tenantWallet.balance.add(depositReturnAmount) },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: depositReturnAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Hoàn cọc (admin quyết định) - HĐ ${contract.contractCode}`,
                },
            });

            if (depositAmount.sub(depositReturnAmount).gt(0)) {
                await tx.walletTransaction.create({
                    data: {
                        walletId: ownerWallet.walletId,
                        amount: depositAmount.sub(depositReturnAmount),
                        type: 'fee',
                        status: 'success',
                        referenceId: termination.terminationRequestId,
                        description: `Giữ lại tiền cọc (admin quyết định) - HĐ ${contract.contractCode}`,
                    },
                });
            }

            const depositStatus = depositReturnAmount.eq(depositAmount)
                ? 'fully_returned'
                : depositReturnAmount.gt(0)
                    ? 'partially_returned'
                    : 'forfeited';

            await tx.depositTransaction.update({
                where: { id: depositTransaction.id },
                data: { status: depositStatus },
            });
        } else if (depositTransaction) {
            // Không hoàn cọc → tịch thu
            const depositAmount = depositTransaction.amount ?? new Prisma.Decimal(0);
            const actualDeduct = ownerWallet.pendingBalance.gte(depositAmount)
                ? depositAmount
                : ownerWallet.pendingBalance;

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: {
                    pendingBalance: ownerWallet.pendingBalance.sub(actualDeduct),
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
                    description: `Tịch thu tiền cọc (admin quyết định) - HĐ ${contract.contractCode}`,
                },
            });

            await tx.depositTransaction.update({
                where: { id: depositTransaction.id },
                data: { status: 'forfeited' },
            });
        }

        // Xử lý bồi thường (nếu có)
        if (compensationAmount.gt(0)) {
            // Bồi thường cho tenant từ owner (thường khi owner vi phạm)
            if (ownerWallet.balance.lt(compensationAmount)) {
                throw new BadRequestException('Số dư ví chủ nhà không đủ để bồi thường');
            }

            await tx.wallet.update({
                where: { walletId: ownerWallet.walletId },
                data: { balance: ownerWallet.balance.sub(compensationAmount) },
            });

            await tx.wallet.update({
                where: { walletId: tenantWallet.walletId },
                data: { balance: tenantWallet.balance.add(compensationAmount) },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: ownerWallet.walletId,
                    amount: compensationAmount.mul(-1),
                    type: 'fee',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Bồi thường (admin quyết định) - HĐ ${contract.contractCode}`,
                },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: tenantWallet.walletId,
                    amount: compensationAmount,
                    type: 'refund',
                    status: 'success',
                    referenceId: termination.terminationRequestId,
                    description: `Nhận bồi thường (admin quyết định) - HĐ ${contract.contractCode}`,
                },
            });
        }
    }

    async autoTerminateContract(params: { rentalId: string; reason: TerminationReason; note?: string }) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: params.rentalId },
        });

        if (!contract || contract.status !== 'active') {
            return null;
        }

        // Kiểm tra TẤT CẢ trạng thái active, không chỉ pending
        const activeStatuses: TerminationRequestStatus[] = [
            'pending', 'rejected', 'negotiating', 'admin_review', 'admin_processing',
        ];

        const existing = await this.db.contractTerminationRequest.findFirst({
            where: {
                rentalId: params.rentalId,
                status: { in: activeStatuses },
            },
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

            const rootContractIdAuto = await this.findRootContractId(tx, params.rentalId);
            await tx.rentalRequest.updateMany({
                where: { contractId: rootContractIdAuto },
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

    // ── Admin methods ──────────────────────────────────────

    async getAdminTerminationRequests(status?: string) {
        const where: any = {};
        if (status) where.status = status;

        return this.db.contractTerminationRequest.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                rental: {
                    select: {
                        rentalId: true,
                        contractCode: true,
                        propertyId: true,
                        ownerId: true,
                        tenantId: true,
                        monthlyRent: true,
                        depositAmount: true,
                        status: true,
                    },
                },
                reports: {
                    select: { id: true, status: true, type: true, title: true },
                },
            },
        });
    }

    async getAdminTerminationDetail(terminationId: string) {
        const termination = await this.db.contractTerminationRequest.findUnique({
            where: { terminationRequestId: terminationId },
            include: {
                rental: {
                    include: {
                        payments: { orderBy: { dueDate: 'desc' } },
                        deposits: { orderBy: { createdAt: 'desc' } },
                    },
                },
                reports: {
                    include: {
                        histories: { orderBy: { createdAt: 'desc' } },
                        attachments: true,
                    },
                },
                decisions: { orderBy: { createdAt: 'desc' } },
            },
        });

        if (!termination) {
            throw new NotFoundException('Không tìm thấy yêu cầu chấm dứt');
        }

        return termination;
    }

    async adminResolveWithFinancials(
        terminationId: string,
        dto: { adminNote: string; resolution: string; depositReturnAmount?: number; penaltyAmount?: number; compensationAmount?: number },
        adminId: string,
    ) {
        const termination = await this.db.contractTerminationRequest.findUnique({
            where: { terminationRequestId: terminationId },
            include: { rental: true },
        });

        if (!termination) throw new NotFoundException('Không tìm thấy yêu cầu chấm dứt');

        const allowedStatuses: TerminationRequestStatus[] = ['admin_review', 'admin_processing'];
        if (!allowedStatuses.includes(termination.status as TerminationRequestStatus)) {
            throw new BadRequestException('Trạng thái không hợp lệ để admin xử lý');
        }

        const propertyId = termination.rental?.propertyId;

        const updated = await this.db.$transaction(async (tx) => {
            // 1. Record the decision for audit
            await tx.terminationDecision.create({
                data: {
                    terminationRequestId: terminationId,
                    decisionType: dto.resolution,
                    depositReturnAmount: dto.depositReturnAmount,
                    penaltyAmount: dto.penaltyAmount,
                    compensationAmount: dto.compensationAmount,
                    finalNote: dto.adminNote,
                    createdBy: adminId,
                },
            });

            // 2. Update termination request
            const updated = await tx.contractTerminationRequest.update({
                where: { terminationRequestId: terminationId },
                data: {
                    status: 'resolved',
                    resolution: dto.resolution as TerminationResolution,
                    resolvedBy: adminId,
                    resolvedAt: new Date(),
                    reviewNote: dto.adminNote,
                },
            });

            // 3. If terminate → settle finances & update contract
            if (dto.resolution === 'terminate_contract') {
                // Nếu admin chỉ định số tiền cụ thể → dùng admin settlement
                if (dto.depositReturnAmount != null || dto.penaltyAmount != null || dto.compensationAmount != null) {
                    await this.settleTerminationByAdmin(tx, termination, {
                        depositReturnAmount: dto.depositReturnAmount ?? 0,
                        penaltyAmount: dto.penaltyAmount ?? 0,
                        compensationAmount: dto.compensationAmount ?? 0,
                        adminNote: dto.adminNote,
                    });
                } else {
                    // Fallback: dùng policy-based settlement
                    await this.settleTermination(tx, { ...termination, rental: termination.rental });
                }

                await tx.rentalContract.update({
                    where: { rentalId: termination.rentalId },
                    data: {
                        status: termination.reason === 'lease_end' ? 'expired' : 'terminated',
                        isActive: false,
                    },
                });

                try {
                    const rootContractIdAdmin = await this.findRootContractId(tx, termination.rentalId);
                    await tx.rentalRequest.updateMany({
                        where: { contractId: rootContractIdAdmin },
                        data: { status: 'expired' },
                    });
                } catch { /* may not have a linked request */ }
            }

            // 4. Resolve linked reports
            const linkedReports = await tx.report.findMany({
                where: { terminationRequestId: terminationId },
            });

            for (const report of linkedReports) {
                if (report.status !== 'resolved') {
                    await tx.report.update({
                        where: { id: report.id },
                        data: {
                            status: 'resolved',
                            adminNote: dto.adminNote,
                            resolvedAt: new Date(),
                        },
                    });
                    await tx.reportHistory.create({
                        data: {
                            reportId: report.id,
                            action: 'RESOLVED',
                            oldStatus: report.status,
                            newStatus: 'resolved',
                            performedBy: adminId,
                            note: `Admin resolved: ${dto.resolution}`,
                        },
                    });
                }
            }

            return updated;
        });

        if (dto.resolution === 'terminate_contract' && propertyId) {
            await this.estateClient.updatePropertyContractStatus(
                propertyId,
                'contract_ended',
                termination.rentalId,
            );
        }

        // Notify both parties about admin resolution
        this.rabbitClient.emit('termination.resolved', {
            terminationRequestId: terminationId,
            rentalId: termination.rentalId,
            contractCode: termination.rental?.contractCode,
            resolvedBy: adminId,
            resolution: dto.resolution,
            note: dto.adminNote,
            ownerId: termination.rental?.ownerId,
            tenantId: termination.rental?.tenantId,
        });

        return updated;
    }
}

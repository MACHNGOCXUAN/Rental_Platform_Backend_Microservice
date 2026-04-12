import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { RentalContractStatus } from 'generated/prisma/enums';
import { UpdateContractDto, SignContractDto, ContractQueryDto, CreateContractDto } from '../dtos/contract.dto';
import uploadFileUrl from 'src/utils/uploadFile';
import { htmlStringToPdfBuffer } from 'src/utils/format';
import { EstateClientService } from './estate-client.service';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class ContractService {

    constructor(
        private readonly db: DatabaseService,
        private readonly estateClient: EstateClientService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
        private readonly estateClient: EstateClientService,
    ) { }

    private generateContractCode(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `CON-${timestamp}-${random}`;
    }

    private generatePaymentCode(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `PAY-${timestamp}-${random}`;
    }

    // Valid status transitions map
    private readonly validTransitions: Record<string, string[]> = {
        draft: ['pending_tenant', 'cancelled'],
        pending_tenant: ['tenant_signed', 'cancelled'],
        tenant_signed: ['pending_landlord'],
        pending_landlord: ['fully_signed', 'cancelled'],
        fully_signed: ['active'],
        active: ['expired', 'terminated', 'renewed'],
    };

    private validateTransition(currentStatus: string, newStatus: string) {
        const allowed = this.validTransitions[currentStatus];
        if (!allowed || !allowed.includes(newStatus)) {
            throw new BadRequestException(
                `Không thể chuyển trạng thái từ "${currentStatus}" sang "${newStatus}"`
            );
        }
    }

    // Get all contracts for a user (as owner or tenant)
    async getMyContracts(userId: string, query: ContractQueryDto) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = {
            OR: [
                { ownerId: userId },
                {
                    tenantId: userId,
                    status: {
                        not: "draft"
                    }
                }
            ],
        };

        if (query.status) {
            where.status = query.status as RentalContractStatus;
        }

        const [items, total] = await Promise.all([
            this.db.rentalContract.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    signatureLog: { orderBy: { createdAt: 'desc' }, take: 5 },
                    _count: { select: { payments: true } },
                },
            }),
            this.db.rentalContract.count({ where }),
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

    // Get single contract detail
    async getContractDetail(contractId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
            include: {
                signatureLog: { orderBy: { createdAt: 'desc' } },
                payments: { orderBy: { dueDate: 'asc' } },
                terms: true,
                documents: true,
                terminationRequests: { orderBy: { createdAt: 'desc' } },
                rentalRequest: true,
            },
        });

        if (!contract) {
            throw new NotFoundException('Không tìm thấy hợp đồng');
        }

        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem hợp đồng này');
        }

        return contract;
    }

    // Owner sends contract to tenant (draft → pending_tenant)
    async sendToTenant(contractId: string, ownerId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.ownerId !== ownerId) throw new ForbiddenException('Không có quyền');

        this.validateTransition(contract.status, 'pending_tenant');

        return this.db.$transaction(async (tx) => {
            await tx.contractSignatureLog.create({
                data: {
                    rentalId: contractId,
                    action: 'SENT_TO_TENANT',
                    actor: ownerId,
                    actorRole: 'OWNER',
                },
            });

            return tx.rentalContract.update({
                where: { rentalId: contractId },
                data: { status: 'pending_tenant' },
            });
        });
    }

    // Owner updates a draft contract
    async updateContract(contractId: string, dto: UpdateContractDto, ownerId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.ownerId !== ownerId) throw new ForbiddenException('Không có quyền');
        if (contract.status !== 'draft') {
            throw new BadRequestException('Chỉ có thể chỉnh sửa hợp đồng ở trạng thái nháp');
        }

        return this.db.$transaction(async (tx) => {
            const updated = await tx.rentalContract.update({
                where: { rentalId: contractId },
                data: {
                    monthlyRent: dto.monthlyRent,
                    depositAmount: dto.depositAmount,
                    electricityCostPerKwh: dto.electricityCostPerKwh,
                    waterCostPerM3: dto.waterCostPerM3,
                    managementFee: dto.managementFee,
                    parkingFee: dto.parkingFee,
                    internetFee: dto.internetFee,
                    paymentDueDay: dto.paymentDueDay,
                    lateFeePerDay: dto.lateFeePerDay,
                    gracePeriodDays: dto.gracePeriodDays,
                    earlyTerminationFee: dto.earlyTerminationFee,
                    autoRenewal: dto.autoRenewal,
                    renewalNoticeDays: dto.renewalNoticeDays,
                    notes: dto.notes,
                },
            });

            if (dto.terms !== undefined) {
                await tx.contractTerm.deleteMany({ where: { rentalId: contractId } });
                if (dto.terms.length > 0) {
                    await tx.contractTerm.createMany({
                        data: dto.terms
                            .filter(content => content?.trim())
                            .map(content => ({ rentalId: contractId, content: content.trim() })),
                    });
                }
            }

            return updated;
        });
    }

    // Tenant signs the contract
    async tenantSign(contractId: string, tenantId: string, dto: SignContractDto) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.tenantId !== tenantId) throw new ForbiddenException('Không có quyền');

        this.validateTransition(contract.status, 'tenant_signed');

        return this.db.$transaction(async (tx) => {
            await tx.contractSignatureLog.create({
                data: {
                    rentalId: contractId,
                    action: 'TENANT_SIGNED',
                    actor: tenantId,
                    actorRole: 'TENANT',
                    ipAddress: dto.ipAddress,
                    userAgent: dto.userAgent,
                },
            });

            return tx.rentalContract.update({
                where: { rentalId: contractId },
                data: { status: 'pending_landlord' },
            });
        });
    }

    // Owner signs the contract
    async ownerSign(contractId: string, ownerId: string, dto: SignContractDto) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.ownerId !== ownerId) throw new ForbiddenException('Không có quyền');

        this.validateTransition(contract.status, 'fully_signed');

        return this.db.$transaction(async (tx) => {
            await tx.contractSignatureLog.create({
                data: {
                    rentalId: contractId,
                    action: 'LANDLORD_SIGNED',
                    actor: ownerId,
                    actorRole: 'OWNER',
                    ipAddress: dto.ipAddress,
                    userAgent: dto.userAgent,
                },
            });

            // Generate deposit payment
            await tx.payment.create({
                data: {
                    rentalId: contractId,
                    paymentCode: this.generatePaymentCode(),
                    paymentType: 'deposit',
                    dueDate: contract.startDate,
                    amount: contract.depositAmount,
                    remainingAmount: contract.depositAmount,
                    status: 'pending',
                },
            });

            return tx.rentalContract.update({
                where: { rentalId: contractId },
                data: {
                    status: 'fully_signed',
                    signedDate: new Date(),
                },
            });
        });
    }

    // Activate contract after deposit payment (fully_signed → active)
    async activateContract(contractId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
            include: { payments: { where: { paymentType: 'deposit' } } },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');

        this.validateTransition(contract.status, 'active');

        // Verify deposit is paid
        const depositPaid = contract.payments.some(p => p.paymentType === 'deposit' && p.status === 'paid');
        if (!depositPaid) {
            throw new BadRequestException('Tiền đặt cọc chưa được thanh toán');
        }

        const updated = await this.db.$transaction(async (tx) => {
            // Generate monthly rent payments
            const monthlyPayments = this.generateMonthlyPayments(contract);
            if (monthlyPayments.length > 0) {
                await tx.payment.createMany({ data: monthlyPayments });
            }

            // Create deposit transaction record
            await tx.depositTransaction.create({
                data: {
                    rentalId: contractId,
                    amount: contract.depositAmount,
                    status: 'held',
                },
            });

            return tx.rentalContract.update({
                where: { rentalId: contractId },
                data: { status: 'active' },
            });
        });

        await this.estateClient.updatePropertyContractStatus(
            contract.propertyId,
            'contract_active',
            contractId,
        );

        return updated;
    }

    // Generate monthly rent payment records
    private generateMonthlyPayments(contract: any) {
        const payments: any[] = [];
        const start = new Date(contract.startDate);
        const end = new Date(contract.endDate);
        let current = new Date(start);

        let month = 1;
        while (current < end) {
            const dueDate = new Date(current.getFullYear(), current.getMonth(), contract.paymentDueDay);
            // If due date is before start date for first month, use start date
            const effectiveDue = month === 1 && dueDate < start ? start : dueDate;

            payments.push({
                rentalId: contract.rentalId,
                paymentCode: this.generatePaymentCode() + `-M${month}`,
                paymentType: 'rent',
                dueDate: effectiveDue,
                amount: contract.monthlyRent,
                remainingAmount: contract.monthlyRent,
                status: 'pending',
            });

            current.setMonth(current.getMonth() + 1);
            month++;
        }

        return payments;
    }

    // Cancel contract (only draft or pending states)
    async cancelContract(contractId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Không có quyền');
        }

        this.validateTransition(contract.status, 'cancelled');

        return this.db.rentalContract.update({
            where: { rentalId: contractId },
            data: { status: 'cancelled' },
        });
    }

    // Get contracts summary counts by status for dashboard
    async getContractStatusCounts(userId: string) {
        const statuses: RentalContractStatus[] = [
            'draft', 'pending_tenant', 'pending_landlord', 'fully_signed',
            'active', 'expired', 'terminated', 'cancelled',
        ];

        const statusLabels: Record<string, string> = {
            draft: 'Bản nháp',
            pending_tenant: 'Chờ khách ký',
            pending_landlord: 'Chờ chủ ký',
            fully_signed: 'Đã ký đủ',
            active: 'Đang hiệu lực',
            expired: 'Hết hạn',
            terminated: 'Đã chấm dứt',
            cancelled: 'Đã hủy',
        };

        const result = await this.db.rentalContract.groupBy({
            by: ['status'],
            where: {
                OR: [
                    { ownerId: userId },
                    {
                        tenantId: userId,
                        status: {
                            not: 'draft',
                        },
                    },
                ],
            },
            _count: { status: true },
        });

        return statuses.map(status => ({
            id: status,
            label: statusLabels[status],
            count: result.find(r => r.status === status)?._count.status ?? 0,
        }));
    }

    async createContract(dto: CreateContractDto, userId: string) {
        if (dto.ownerId !== userId) {
            throw new ForbiddenException('Không có quyền tạo hợp đồng');
        }

        const pdfBuffer = await htmlStringToPdfBuffer(dto.contractHtml || '');
        const contractPdfUrl = await uploadFileUrl(pdfBuffer, `contracts/${dto.propertyId}-${Date.now()}.pdf`);

        return this.db.$transaction(async (tx) => {
            let contract;

            if (dto.fromRequestId) {
                contract = await tx.rentalContract.upsert({
                    where: { fromRequestId: dto.fromRequestId },
                    update: {
                        templateId: dto.templateId,
                        startDate: dto.startDate,
                        endDate: dto.endDate,
                        monthlyRent: dto.monthlyRent,
                        depositAmount: dto.depositAmount,
                        electricityCostPerKwh: dto.electricityCostPerKwh,
                        waterCostPerM3: dto.waterCostPerM3,
                        managementFee: dto.managementFee,
                        parkingFee: dto.parkingFee,
                        internetFee: dto.internetFee,
                        paymentDueDay: dto.paymentDueDay,
                        lateFeePerDay: dto.lateFeePerDay,
                        gracePeriodDays: dto.gracePeriodDays,
                        earlyTerminationFee: dto.earlyTerminationFee,
                        autoRenewal: dto.autoRenewal,
                        renewalNoticeDays: dto.renewalNoticeDays,
                        notes: dto.notes,
                        contractData: dto.contractData,
                        contractHtml: dto.contractHtml,
                        contractPdfUrl,
                    },
                    create: {
                        templateId: dto.templateId,
                        propertyId: dto.propertyId,
                        ownerId: dto.ownerId,
                        tenantId: dto.tenantId,
                        fromRequestId: dto.fromRequestId,
                        contractCode: this.generateContractCode(),
                        startDate: dto.startDate,
                        endDate: dto.endDate,
                        monthlyRent: dto.monthlyRent,
                        depositAmount: dto.depositAmount,
                        electricityCostPerKwh: dto.electricityCostPerKwh,
                        waterCostPerM3: dto.waterCostPerM3,
                        managementFee: dto.managementFee,
                        parkingFee: dto.parkingFee,
                        internetFee: dto.internetFee,
                        paymentDueDay: dto.paymentDueDay,
                        lateFeePerDay: dto.lateFeePerDay,
                        gracePeriodDays: dto.gracePeriodDays,
                        earlyTerminationFee: dto.earlyTerminationFee,
                        autoRenewal: dto.autoRenewal,
                        renewalNoticeDays: dto.renewalNoticeDays,
                        notes: dto.notes,
                        contractData: dto.contractData,
                        contractHtml: dto.contractHtml,
                        status: 'draft',
                        contractPdfUrl,
                    },
                });

                await tx.rentalRequest.update({
                    where: { requestId: dto.fromRequestId },
                    data: {
                        status: 'approved',
                        contractId: contract.rentalId,
                        reviewedAt: new Date(),
                    },
                });
            } else {
                contract = await tx.rentalContract.create({
                    data: {
                        templateId: dto.templateId,
                        propertyId: dto.propertyId,
                        ownerId: dto.ownerId,
                        tenantId: dto.tenantId,
                        contractCode: this.generateContractCode(),
                        startDate: dto.startDate,
                        endDate: dto.endDate,
                        monthlyRent: dto.monthlyRent,
                        depositAmount: dto.depositAmount,
                        electricityCostPerKwh: dto.electricityCostPerKwh,
                        waterCostPerM3: dto.waterCostPerM3,
                        managementFee: dto.managementFee,
                        parkingFee: dto.parkingFee,
                        internetFee: dto.internetFee,
                        paymentDueDay: dto.paymentDueDay,
                        lateFeePerDay: dto.lateFeePerDay,
                        gracePeriodDays: dto.gracePeriodDays,
                        earlyTerminationFee: dto.earlyTerminationFee,
                        autoRenewal: dto.autoRenewal,
                        renewalNoticeDays: dto.renewalNoticeDays,
                        notes: dto.notes,
                        contractData: dto.contractData,
                        contractHtml: dto.contractHtml,
                        contractPdfUrl,
                        status: 'draft',
                    },
                });
            }

            await tx.contractSignatureLog.create({
                data: {
                    rentalId: contract.rentalId,
                    action: 'CREATED',
                    actor: userId,
                    actorRole: 'OWNER',
                },
            });

            // Gửi thông báo cho người thuê khi hợp đồng được tạo
            this.rabbitClient.emit('contract.created', {
                contractId: contract.rentalId,
                contractCode: contract.contractCode,
                propertyId: dto.propertyId,
                ownerId: dto.ownerId,
                tenantId: dto.tenantId,
            });

            return contract;
        }, {
            timeout: 20000,
            maxWait: 5000,
        });
    }
}

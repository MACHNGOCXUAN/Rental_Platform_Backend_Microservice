import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateRenewalRequestDto, ReviewRenewalRequestDto, RenewalQueryDto } from '../dtos/renewal.dto';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class RenewalService {
    constructor(
        private readonly db: DatabaseService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
    ) { }

    // Tenant tạo yêu cầu gia hạn
    async createRenewalRequest(dto: CreateRenewalRequestDto, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: dto.contractId },
        });

        if (!contract) {
            throw new NotFoundException('Không tìm thấy hợp đồng');
        }

        // Chỉ tenant mới được gửi yêu cầu gia hạn
        if (contract.tenantId !== userId) {
            throw new ForbiddenException('Chỉ người thuê mới có quyền gửi yêu cầu gia hạn');
        }

        // Chỉ hợp đồng active hoặc near_expiration mới được gia hạn
        if (!['active', 'near_expiration'].includes(contract.status)) {
            throw new BadRequestException('Hợp đồng phải đang hiệu lực mới có thể gia hạn');
        }

        // Kiểm tra không có pending renewal request
        const existingPending = await this.db.renewalRequest.findFirst({
            where: {
                contractId: dto.contractId,
                status: 'pending',
            },
        });

        if (existingPending) {
            throw new BadRequestException('Đã có yêu cầu gia hạn đang chờ duyệt');
        }

        // Tính ngày bắt đầu và kết thúc gia hạn
        const proposedStartDate = new Date(contract.endDate);
        proposedStartDate.setDate(proposedStartDate.getDate() + 1);

        const proposedEndDate = new Date(proposedStartDate);
        proposedEndDate.setMonth(proposedEndDate.getMonth() + dto.durationMonths);

        const renewalRequest = await this.db.renewalRequest.create({
            data: {
                contractId: dto.contractId,
                requestedById: userId,
                durationMonths: dto.durationMonths,
                proposedStartDate,
                proposedEndDate,
                note: dto.note,
                status: 'pending',
            },
        });

        // Gửi notification cho owner
        this.rabbitClient.emit('contract.renewal_request', {
            renewalRequestId: renewalRequest.id,
            contractId: contract.rentalId,
            contractCode: contract.contractCode,
            propertyId: contract.propertyId,
            ownerId: contract.ownerId,
            tenantId: contract.tenantId,
            durationMonths: dto.durationMonths,
            proposedStartDate: proposedStartDate.toISOString(),
            proposedEndDate: proposedEndDate.toISOString(),
        });

        return renewalRequest;
    }

    // Lấy danh sách yêu cầu gia hạn của tôi (tenant + owner)
    async getMyRenewalRequests(userId: string, query: RenewalQueryDto) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = {
            contract: {
                OR: [
                    { ownerId: userId },
                    { tenantId: userId },
                ],
            },
        };

        if (query.contractId) {
            where.contractId = query.contractId;
        }

        if (query.status) {
            where.status = query.status;
        }

        const [items, total] = await Promise.all([
            this.db.renewalRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
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
                            monthlyRent: true,
                            startDate: true,
                            endDate: true,
                        },
                    },
                    appendix: true,
                },
            }),
            this.db.renewalRequest.count({ where }),
        ]);

        return {
            items,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // Lấy yêu cầu gia hạn theo hợp đồng
    async getRenewalRequestsByContract(contractId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) {
            throw new NotFoundException('Không tìm thấy hợp đồng');
        }

        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem');
        }

        return this.db.renewalRequest.findMany({
            where: { contractId },
            orderBy: { createdAt: 'desc' },
            include: { appendix: true },
        });
    }

    // Owner duyệt yêu cầu gia hạn
    async approveRenewalRequest(renewalId: string, userId: string, dto: ReviewRenewalRequestDto) {
        const renewalRequest = await this.db.renewalRequest.findUnique({
            where: { id: renewalId },
            include: {
                contract: true,
            },
        });

        if (!renewalRequest) {
            throw new NotFoundException('Không tìm thấy yêu cầu gia hạn');
        }

        // Chỉ owner mới được duyệt
        if (renewalRequest.contract.ownerId !== userId) {
            throw new ForbiddenException('Chỉ chủ nhà mới có quyền duyệt gia hạn');
        }

        if (renewalRequest.status !== 'pending') {
            throw new BadRequestException('Yêu cầu gia hạn không ở trạng thái chờ duyệt');
        }

        return this.db.$transaction(async (tx) => {
            // Đếm số phụ lục hiện tại
            const appendixCount = await tx.contractAppendix.count({
                where: { contractId: renewalRequest.contractId },
            });

            // Tạo phụ lục gia hạn
            const appendix = await tx.contractAppendix.create({
                data: {
                    contractId: renewalRequest.contractId,
                    type: 'renewal',
                    appendixNumber: appendixCount + 1,
                    startDate: renewalRequest.proposedStartDate,
                    endDate: renewalRequest.proposedEndDate,
                    content: `Phụ lục gia hạn hợp đồng #${appendixCount + 1}: Gia hạn thêm ${renewalRequest.durationMonths} tháng, từ ${renewalRequest.proposedStartDate.toISOString().slice(0, 10)} đến ${renewalRequest.proposedEndDate.toISOString().slice(0, 10)}`,
                    createdById: userId,
                    signedAt: new Date(),
                },
            });

            // Cập nhật renewal request
            await tx.renewalRequest.update({
                where: { id: renewalId },
                data: {
                    status: 'approved',
                    reviewNote: dto.reviewNote,
                    approvedAt: new Date(),
                    appendixId: appendix.id,
                },
            });

            // Cập nhật contract endDate + giữ active
            await tx.rentalContract.update({
                where: { rentalId: renewalRequest.contractId },
                data: {
                    endDate: renewalRequest.proposedEndDate,
                    renewalStatus: 'approved',
                    status: 'active', // Reset nếu near_expiration
                },
            });

            // Tạo log
            await tx.contractSignatureLog.create({
                data: {
                    rentalId: renewalRequest.contractId,
                    action: 'RENEWAL_APPROVED',
                    actor: userId,
                    actorRole: 'OWNER',
                },
            });

            // Cũng tạo amendment để tương thích ngược
            await tx.contractAmendment.create({
                data: {
                    rentalId: renewalRequest.contractId,
                    content: `Phụ lục gia hạn #${appendixCount + 1}: Gia hạn thêm ${renewalRequest.durationMonths} tháng đến ${renewalRequest.proposedEndDate.toISOString().slice(0, 10)}`,
                },
            });

            // Gửi notification
            this.rabbitClient.emit('contract.renewal_approved', {
                contractId: renewalRequest.contractId,
                oldContractId: renewalRequest.contractId,
                newContractId: renewalRequest.contractId,
                oldContractCode: renewalRequest.contract.contractCode,
                newContractCode: renewalRequest.contract.contractCode,
                propertyId: renewalRequest.contract.propertyId,
                ownerId: renewalRequest.contract.ownerId,
                tenantId: renewalRequest.contract.tenantId,
                durationMonths: renewalRequest.durationMonths,
                newEndDate: renewalRequest.proposedEndDate.toISOString(),
            });

            return { renewalRequest: { ...renewalRequest, status: 'approved' }, appendix };
        });
    }

    // Owner từ chối yêu cầu gia hạn
    async rejectRenewalRequest(renewalId: string, userId: string, dto: ReviewRenewalRequestDto) {
        const renewalRequest = await this.db.renewalRequest.findUnique({
            where: { id: renewalId },
            include: { contract: true },
        });

        if (!renewalRequest) {
            throw new NotFoundException('Không tìm thấy yêu cầu gia hạn');
        }

        if (renewalRequest.contract.ownerId !== userId) {
            throw new ForbiddenException('Chỉ chủ nhà mới có quyền từ chối gia hạn');
        }

        if (renewalRequest.status !== 'pending') {
            throw new BadRequestException('Yêu cầu gia hạn không ở trạng thái chờ duyệt');
        }

        const updated = await this.db.renewalRequest.update({
            where: { id: renewalId },
            data: {
                status: 'rejected',
                reviewNote: dto.reviewNote,
            },
        });

        // Tạo log
        await this.db.contractSignatureLog.create({
            data: {
                rentalId: renewalRequest.contractId,
                action: 'RENEWAL_REJECTED',
                actor: userId,
                actorRole: 'OWNER',
            },
        });

        // Gửi notification
        this.rabbitClient.emit('contract.renewal_rejected', {
            contractId: renewalRequest.contractId,
            contractCode: renewalRequest.contract.contractCode,
            propertyId: renewalRequest.contract.propertyId,
            ownerId: renewalRequest.contract.ownerId,
            tenantId: renewalRequest.contract.tenantId,
            reason: dto.reviewNote,
        });

        return updated;
    }

    // Lấy lịch sử phụ lục hợp đồng
    async getContractAppendices(contractId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId },
        });

        if (!contract) {
            throw new NotFoundException('Không tìm thấy hợp đồng');
        }

        if (contract.ownerId !== userId && contract.tenantId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem');
        }

        return this.db.contractAppendix.findMany({
            where: { contractId },
            orderBy: { appendixNumber: 'asc' },
            include: {
                renewalRequest: {
                    select: {
                        id: true,
                        requestedById: true,
                        durationMonths: true,
                        note: true,
                        status: true,
                        createdAt: true,
                    },
                },
            },
        });
    }

    // Tenant hủy yêu cầu gia hạn đang pending
    async cancelRenewalRequest(renewalId: string, userId: string) {
        const renewalRequest = await this.db.renewalRequest.findUnique({
            where: { id: renewalId },
            include: { contract: true },
        });

        if (!renewalRequest) {
            throw new NotFoundException('Không tìm thấy yêu cầu gia hạn');
        }

        if (renewalRequest.requestedById !== userId) {
            throw new ForbiddenException('Chỉ người gửi yêu cầu mới có thể hủy');
        }

        if (renewalRequest.status !== 'pending') {
            throw new BadRequestException('Chỉ có thể hủy yêu cầu đang chờ duyệt');
        }

        return this.db.renewalRequest.update({
            where: { id: renewalId },
            data: { status: 'cancelled' },
        });
    }

    // ─── ADJUSTMENT APPENDIX ────────────────────────────────

    // Owner tạo phụ lục chỉnh sửa → chờ tenant duyệt
    async createAdjustmentAppendix(userId: string, dto: { contractId: string; title: string; content: string; effectiveDate: string }) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: dto.contractId },
        });

        if (!contract) {
            throw new NotFoundException('Không tìm thấy hợp đồng');
        }

        // Chỉ owner mới được tạo phụ lục chỉnh sửa
        if (contract.ownerId !== userId) {
            throw new ForbiddenException('Chỉ chủ nhà mới có quyền tạo phụ lục chỉnh sửa');
        }

        // Hợp đồng phải active
        if (!['active', 'near_expiration', 'renewed'].includes(contract.status)) {
            throw new BadRequestException('Hợp đồng phải đang hiệu lực');
        }

        // Kiểm tra không có phụ lục adjustment đang pending
        const existingPending = await this.db.contractAppendix.findFirst({
            where: {
                contractId: dto.contractId,
                type: 'adjustment',
                status: 'pending_approval',
            },
        });

        if (existingPending) {
            throw new BadRequestException('Đã có phụ lục chỉnh sửa đang chờ duyệt');
        }

        // Đếm số phụ lục hiện tại
        const appendixCount = await this.db.contractAppendix.count({
            where: { contractId: dto.contractId },
        });

        // Hash nội dung phụ lục (đơn giản dùng base64 cho MVP, production nên dùng SHA-256)
        const contentToHash = `${dto.title}|${dto.content}|${dto.effectiveDate}|${appendixCount + 1}`;
        const appendixHash = Buffer.from(contentToHash).toString('base64');

        const appendix = await this.db.contractAppendix.create({
            data: {
                contractId: dto.contractId,
                type: 'adjustment',
                appendixNumber: appendixCount + 1,
                title: dto.title,
                content: dto.content,
                effectiveDate: new Date(dto.effectiveDate),
                createdById: userId,
                status: 'pending_approval',
                version: 1,
                appendixHash,
            },
        });

        // Gửi notification cho tenant
        this.rabbitClient.emit('contract.appendix_created', {
            appendixId: appendix.id,
            contractId: contract.rentalId,
            contractCode: contract.contractCode,
            propertyId: contract.propertyId,
            ownerId: contract.ownerId,
            tenantId: contract.tenantId,
            title: dto.title,
            type: 'adjustment',
        });

        return appendix;
    }

    // Tenant duyệt phụ lục chỉnh sửa
    async approveAppendix(userId: string, appendixId: string, note?: string) {
        const appendix = await this.db.contractAppendix.findUnique({
            where: { id: appendixId },
            include: { contract: true },
        });

        if (!appendix) {
            throw new NotFoundException('Không tìm thấy phụ lục');
        }

        // Chỉ tenant mới được duyệt
        if (appendix.contract.tenantId !== userId) {
            throw new ForbiddenException('Chỉ người thuê mới có quyền duyệt phụ lục');
        }

        if (appendix.status !== 'pending_approval') {
            throw new BadRequestException('Phụ lục không ở trạng thái chờ duyệt');
        }

        const now = new Date();

        const updated = await this.db.contractAppendix.update({
            where: { id: appendixId },
            data: {
                status: 'active',
                approvedAt: now,
                signedAt: now,
            },
        });

        // Tạo log
        await this.db.contractSignatureLog.create({
            data: {
                rentalId: appendix.contractId,
                action: 'APPENDIX_APPROVED',
                actor: userId,
                actorRole: 'TENANT',
                details: JSON.stringify({ appendixId, title: appendix.title, note }),
            },
        });

        // Gửi notification cho owner
        this.rabbitClient.emit('contract.appendix_approved', {
            appendixId: appendix.id,
            contractId: appendix.contractId,
            contractCode: appendix.contract.contractCode,
            propertyId: appendix.contract.propertyId,
            ownerId: appendix.contract.ownerId,
            tenantId: appendix.contract.tenantId,
            title: appendix.title,
        });

        return updated;
    }

    // Tenant từ chối phụ lục chỉnh sửa
    async rejectAppendix(userId: string, appendixId: string, reason: string) {
        const appendix = await this.db.contractAppendix.findUnique({
            where: { id: appendixId },
            include: { contract: true },
        });

        if (!appendix) {
            throw new NotFoundException('Không tìm thấy phụ lục');
        }

        if (appendix.contract.tenantId !== userId) {
            throw new ForbiddenException('Chỉ người thuê mới có quyền từ chối phụ lục');
        }

        if (appendix.status !== 'pending_approval') {
            throw new BadRequestException('Phụ lục không ở trạng thái chờ duyệt');
        }

        const updated = await this.db.contractAppendix.update({
            where: { id: appendixId },
            data: {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedReason: reason,
            },
        });

        // Tạo log
        await this.db.contractSignatureLog.create({
            data: {
                rentalId: appendix.contractId,
                action: 'APPENDIX_REJECTED',
                actor: userId,
                actorRole: 'TENANT',
                details: JSON.stringify({ appendixId, title: appendix.title, reason }),
            },
        });

        // Gửi notification cho owner
        this.rabbitClient.emit('contract.appendix_rejected', {
            appendixId: appendix.id,
            contractId: appendix.contractId,
            contractCode: appendix.contract.contractCode,
            propertyId: appendix.contract.propertyId,
            ownerId: appendix.contract.ownerId,
            tenantId: appendix.contract.tenantId,
            title: appendix.title,
            reason,
        });

        return updated;
    }

    // Lấy chi tiết phụ lục
    async getAppendixById(appendixId: string, userId: string) {
        const appendix = await this.db.contractAppendix.findUnique({
            where: { id: appendixId },
            include: {
                contract: {
                    select: {
                        rentalId: true,
                        contractCode: true,
                        ownerId: true,
                        tenantId: true,
                    },
                },
            },
        });

        if (!appendix) {
            throw new NotFoundException('Không tìm thấy phụ lục');
        }

        if (appendix.contract.ownerId !== userId && appendix.contract.tenantId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem phụ lục này');
        }

        return appendix;
    }
}


import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateRentalRequestDto, ReviewRentalRequestDto } from '../dtos/rental-request.dto';
import { RentalRequestStatus } from 'generated/prisma/enums';

@Injectable()
export class RentalRequestService {

    constructor(private readonly db: DatabaseService) { }

    private generateRequestCode(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `REQ-${timestamp}-${random}`;
    }

    private generateContractCode(): string {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `HD-${timestamp}-${random}`;
    }

    // Tenant creates a rental request
    async createRequest(dto: CreateRentalRequestDto, tenantId: string) {
        // Prevent tenant from requesting their own property
        if (dto.ownerId === tenantId) {
            throw new BadRequestException('Bạn không thể gửi yêu cầu thuê cho bất động sản của chính mình');
        }

        // Check for existing pending request
        const existing = await this.db.rentalRequest.findFirst({
            where: {
                propertyId: dto.propertyId,
                tenantId,
                status: { in: ['pending', 'under_review', 'approved'] },
            },
        });

        if (existing) {
            throw new BadRequestException('Bạn đã có yêu cầu thuê đang chờ xử lý cho bất động sản này');
        }

        return this.db.rentalRequest.create({
            data: {
                requestCode: this.generateRequestCode(),
                propertyId: dto.propertyId,
                tenantId,
                ownerId: dto.ownerId,
                startDate: new Date(dto.startDate),
                endDate: new Date(dto.endDate),
                proposedRent: dto.proposedRent ?? 0,
                message: dto.message,
                status: 'pending',
            },
        });
    }

    // Owner reviews a request (approve / reject / under_review)
    async reviewRequest(requestId: string, dto: ReviewRentalRequestDto, ownerId: string) {
        const request = await this.db.rentalRequest.findUnique({
            where: { requestId },
        });

        if (!request) {
            throw new NotFoundException('Không tìm thấy yêu cầu thuê');
        }

        if (request.ownerId !== ownerId) {
            throw new ForbiddenException('Bạn không có quyền xử lý yêu cầu này');
        }

        // Validate state transitions
        const validTransitions: Record<string, string[]> = {
            pending: ['under_review', 'rejected'],
            under_review: ['approved', 'rejected'],
        };

        const allowed = validTransitions[request.status];
        if (!allowed || !allowed.includes(dto.status)) {
            throw new BadRequestException(
                `Không thể chuyển trạng thái từ "${request.status}" sang "${dto.status}"`
            );
        }

        // If approving, create contract
        if (dto.status === 'approved') {
            return this.approveAndCreateContract(request, dto, ownerId);
        }

        // Otherwise just update status
        return this.db.rentalRequest.update({
            where: { requestId },
            data: {
                status: dto.status as RentalRequestStatus,
                rejectionReason: dto.rejectionReason,
                landlordNotes: dto.landlordNotes,
                reviewedAt: new Date(),
            },
        });
    }

    private async approveAndCreateContract(request: any, dto: ReviewRentalRequestDto, ownerId: string) {
        return this.db.$transaction(async (tx) => {
            // Create contract
            const contract = await tx.rentalContract.create({
                data: {
                    propertyId: request.propertyId,
                    ownerId: request.ownerId,
                    tenantId: request.tenantId,
                    fromRequestId: request.requestId,
                    contractCode: this.generateContractCode(),
                    startDate: request.startDate,
                    endDate: request.endDate,
                    monthlyRent: request.proposedRent ?? 0,
                    depositAmount: Number(request.proposedRent ?? 0) * 2,
                    status: 'draft',
                },
            });

            // Update request → contract_created
            await tx.rentalRequest.update({
                where: { requestId: request.requestId },
                data: {
                    status: 'contract_created',
                    contractId: contract.rentalId,
                    reviewedAt: new Date(),
                    landlordNotes: dto.landlordNotes,
                },
            });

            return contract;
        });
    }

    // Tenant cancels their own request
    async cancelRequest(requestId: string, tenantId: string) {
        const request = await this.db.rentalRequest.findUnique({
            where: { requestId },
        });

        if (!request) {
            throw new NotFoundException('Không tìm thấy yêu cầu thuê');
        }

        if (request.tenantId !== tenantId) {
            throw new ForbiddenException('Bạn không có quyền hủy yêu cầu này');
        }

        if (!['pending', 'under_review'].includes(request.status)) {
            throw new BadRequestException('Không thể hủy yêu cầu ở trạng thái hiện tại');
        }

        return this.db.rentalRequest.update({
            where: { requestId },
            data: { status: 'cancelled' },
        });
    }

    // Get requests for tenant
    async getMyRequests(tenantId: string) {
        return this.db.rentalRequest.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            include: { contract: { select: { rentalId: true, contractCode: true, status: true } } },
        });
    }

    // Get requests for owner
    async getOwnerRequests(ownerId: string, status?: string) {
        return this.db.rentalRequest.findMany({
            where: {
                ownerId,
                ...(status ? { status: status as RentalRequestStatus } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { contract: { select: { rentalId: true, contractCode: true, status: true } } },
        });
    }

    // Get single request detail
    async getRequestDetail(requestId: string, userId: string) {
        const request = await this.db.rentalRequest.findUnique({
            where: { requestId },
            include: { contract: true },
        });

        if (!request) {
            throw new NotFoundException('Không tìm thấy yêu cầu thuê');
        }

        if (request.tenantId !== userId && request.ownerId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem yêu cầu này');
        }

        return request;
    }
}

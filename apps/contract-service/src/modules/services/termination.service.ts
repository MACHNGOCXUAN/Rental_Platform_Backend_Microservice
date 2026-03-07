import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateTerminationRequestDto, ReviewTerminationRequestDto } from '../dtos/termination.dto';
import { UserRole } from 'src/common/interfaces/request.interface';

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
                await tx.rentalContract.update({
                    where: { rentalId: termination.rentalId },
                    data: { status: 'terminated' },
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
}

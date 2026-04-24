import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateRentalRequestDto, OpenHoldingDepositDto, PayHoldingDepositDto, ReviewRentalRequestDto } from '../dtos/rental-request.dto';
import { PaymentMethod, RentalRequestStatus } from 'generated/prisma/enums';
import { ClientProxy } from '@nestjs/microservices';
import { EstateClientService } from './estate-client.service';
import { PaymentService } from './payment.service';

@Injectable()
export class RentalRequestService {

    constructor(
        private readonly db: DatabaseService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
        private readonly estateClient: EstateClientService,
        private readonly paymentService: PaymentService,
    ) { }

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

    private resolveHoldingDepositAmount(request: { proposedRent: any }, property: any): number {
        const candidates = [
            property?.holdingDepositAmount,
            property?.depositAmount,
            property?.pricePerMonth,
            request?.proposedRent,
        ];

        for (const value of candidates) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric;
            }
        }

        throw new BadRequestException('Không xác định được số tiền giữ chỗ');
    }

    private resolveHoldingDepositExpireMinutes(property: any): number {
        const propertyType = String(property?.propertyType || '').toLowerCase();

        console.log("heloo: ", propertyType);
        
        switch (propertyType) {
            case 'room':
                return 30;
            case 'house':
                return 24 * 60;
            case 'apartment':
                return 180;
            case 'office':
                return 360;
            case 'land':
                return 24 * 60;
            default:
                return 30;
        }
    }

    private mapPropertySummary(property: any) {
        if (!property) return null;
        const imageUrl =
            property?.images?.[0]?.uri ||
            property?.images?.[0]?.url ||
            property?.images?.[0]?.secureUrl ||
            null;
        const address = [
            property.address,
            property.ward,
            property.district,
            property.city,
        ].filter(Boolean).join(', ');

        return {
            id: property.id,
            title: property.title,
            address: address || property.address || null,
            imageUrl,
        };
    }

    private async attachPropertySummary(request: any) {
        try {
            const propertyDetail = await this.estateClient.getPropertyDetail(request.propertyId);
            return {
                ...request,
                property: this.mapPropertySummary(propertyDetail),
            };
        } catch (error) {
            return {
                ...request,
                property: null,
            };
        }
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
                status: { in: ['pending', 'under_review', 'approved', 'holding_deposit_open', 'holding_deposit_paid'] },
            },
        });

        if (existing) {
            throw new BadRequestException('Bạn đã có yêu cầu thuê đang chờ xử lý cho bất động sản này');
        }

        const lockedProperty = await this.db.rentalRequest.findFirst({
            where: {
                propertyId: dto.propertyId,
                status: {
                    in: ['holding_deposit_paid', 'holding_deposit_locked', 'contract_created'],
                },
            },
        });

        if (lockedProperty) {
            throw new BadRequestException('Bất động sản đã có người giữ chỗ, không thể gửi yêu cầu mới');
        }

        const request = await this.db.rentalRequest.create({
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

        // Gửi thông báo cho chủ nhà
        this.rabbitClient.emit('rental.request.created', {
            requestId: request.requestId,
            propertyId: dto.propertyId,
            ownerId: dto.ownerId,
            tenantId,
            message: dto.message,
        });

        return request;
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
            under_review: ['rejected'],
        };

        const allowed = validTransitions[request.status];
        if (!allowed || !allowed.includes(dto.status)) {
            throw new BadRequestException(
                `Không thể chuyển trạng thái từ "${request.status}" sang "${dto.status}"`
            );
        }

        const updated = await this.db.rentalRequest.update({
            where: { requestId },
            data: {
                status: dto.status as RentalRequestStatus,
                rejectionReason: dto.rejectionReason,
                landlordNotes: dto.landlordNotes,
                reviewedAt: new Date(),
            },
        });

        // Thông báo cho người thuê khi yêu cầu thuê được xử lý
        this.rabbitClient.emit('rental.request.reviewed', {
            requestId,
            propertyId: request.propertyId,
            ownerId: request.ownerId,
            tenantId: request.tenantId,
            status: dto.status,
            rejectionReason: dto.rejectionReason,
        });

        return updated;
    }

    async openHoldingDepositWindow(ownerId: string, dto: OpenHoldingDepositDto) {
        if (!dto.requestIds || dto.requestIds.length === 0) {
            throw new BadRequestException('Danh sách yêu cầu không hợp lệ');
        }

        const requests = await this.db.rentalRequest.findMany({
            where: {
                requestId: { in: dto.requestIds },
            },
        });

        if (requests.length !== dto.requestIds.length) {
            throw new NotFoundException('Không tìm thấy đầy đủ yêu cầu thuê');
        }

        const invalidOwner = requests.find((item) => item.ownerId !== ownerId);
        if (invalidOwner) {
            throw new ForbiddenException('Bạn không có quyền xử lý các yêu cầu này');
        }

        const propertyId = requests[0]?.propertyId;
        if (!propertyId || requests.some((item) => item.propertyId !== propertyId)) {
            throw new BadRequestException('Chỉ được mở đặt cọc cho cùng một bất động sản');
        }

        const invalidStatus = requests.find((item) => !['pending', 'under_review'].includes(item.status));
        if (invalidStatus) {
            throw new BadRequestException('Có yêu cầu không hợp lệ để mở đặt cọc');
        }

        const alreadyHolding = await this.db.rentalRequest.findFirst({
            where: {
                propertyId,
                status: {
                    in: ['holding_deposit_paid', 'holding_deposit_locked', 'contract_created'],
                },
                NOT: {
                    requestId: { in: dto.requestIds },
                },
            },
        });

        if (alreadyHolding) {
            throw new BadRequestException('Bất động sản đã có người giữ chỗ, không thể mở đặt cọc mới');
        }

        const propertyDetail = await this.estateClient.getPropertyDetail(propertyId);
        const expireMinutes = this.resolveHoldingDepositExpireMinutes(propertyDetail);
        const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000);
        const holdingDepositAmount = this.resolveHoldingDepositAmount(requests[0], propertyDetail);

        await this.db.rentalRequest.updateMany({
            where: { requestId: { in: dto.requestIds } },
            data: {
                status: 'holding_deposit_open' as RentalRequestStatus,
                holdingDepositStatus: 'open',
                holdingDepositAmount,
                holdingDepositExpiresAt: expiresAt,
                reviewedAt: new Date(),
            },
        });

        for (const request of requests) {
            this.rabbitClient.emit('rental.request.holding_deposit_opened', {
                requestId: request.requestId,
                propertyId: request.propertyId,
                ownerId: request.ownerId,
                tenantId: request.tenantId,
                amount: holdingDepositAmount,
                expiresAt: expiresAt.toISOString(),
            });
        }

        return { requestIds: dto.requestIds, expiresAt, holdingDepositAmount };
    }

    async payHoldingDeposit(tenantId: string, dto: PayHoldingDepositDto) {
        const request = await this.db.rentalRequest.findUnique({
            where: { requestId: dto.requestId },
        });

        if (!request) {
            throw new NotFoundException('Không tìm thấy yêu cầu thuê');
        }

        if (request.tenantId !== tenantId) {
            throw new ForbiddenException('Bạn không có quyền thanh toán giữ chỗ');
        }

        if (request.status !== 'holding_deposit_open') {
            throw new BadRequestException('Yêu cầu thuê không ở trạng thái đặt cọc');
        }

        if (request.holdingDepositExpiresAt && request.holdingDepositExpiresAt < new Date()) {
            await this.db.rentalRequest.update({
                where: { requestId: request.requestId },
                data: {
                    status: 'holding_deposit_expired' as RentalRequestStatus,
                    holdingDepositStatus: 'expired',
                },
            });
            throw new BadRequestException('Đã hết thời gian đặt cọc');
        }

        const propertyDetail = await this.estateClient.getPropertyDetail(request.propertyId);
        const depositAmount = this.resolveHoldingDepositAmount(request, propertyDetail);
        const payment = await this.paymentService.createHoldingDepositPayment(
            request.requestId,
            depositAmount
        );

        await this.db.rentalRequest.update({
            where: { requestId: request.requestId },
            data: {
                holdingDepositPaymentId: payment.paymentId,
            },
        });

        const method = dto.method === 'wallet' ? PaymentMethod.other : (dto.method as PaymentMethod);

        return this.paymentService.confirmPayment(
            payment.paymentId,
            {
                paymentMethod: method,
                paymentType: 'deposit',
            },
            tenantId,
        );
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

        if (!['pending', 'under_review', 'holding_deposit_open'].includes(request.status)) {
            throw new BadRequestException('Không thể hủy yêu cầu ở trạng thái hiện tại');
        }

        return this.db.rentalRequest.update({
            where: { requestId },
            data: { status: 'cancelled' },
        });
    }

    // Get requests for tenant
    async getMyRequests(tenantId: string) {
        const items = await this.db.rentalRequest.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            include: { contract: { select: { rentalId: true, contractCode: true, status: true } } },
        });
        return Promise.all(items.map((item) => this.attachPropertySummary(item)));
    }

    // Get requests for owner
    async getOwnerRequests(ownerId: string, status?: string) {
        const items = await this.db.rentalRequest.findMany({
            where: {
                ownerId,
                ...(status ? { status: status as RentalRequestStatus } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { contract: { select: { rentalId: true, contractCode: true, status: true, templateId: true } } },
        });
        return Promise.all(items.map((item) => this.attachPropertySummary(item)));
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

        return this.attachPropertySummary(request);
    }
}

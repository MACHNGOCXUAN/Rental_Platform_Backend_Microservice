import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { ConfigService } from '@nestjs/config';
import { PropertyType, PropertyStatus } from 'generated/prisma/enums';
import { ClientProxy } from '@nestjs/microservices';
import axios from 'axios';

@Injectable()
export class ListingFeeService implements OnModuleInit {
    constructor(
        private readonly db: DatabaseService,
        private readonly config: ConfigService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
    ) { }

    onModuleInit() {
        // Chạy kiểm tra tin đăng hết hạn mỗi giờ
        setInterval(() => {
            this.checkAndExpireListings().catch(err => {
                console.error('Error running checkAndExpireListings cron:', err);
            });
        }, 60 * 60 * 1000); // 1 hour

        // Chạy ngay 10 giây sau khi start app
        setTimeout(() => {
            this.checkAndExpireListings().catch(err => {
                console.error('Error running initial checkAndExpireListings:', err);
            });
        }, 10000);
    }

    // ─── Public: Lấy tất cả cấu hình phí ───────────────────────────────────
    async getAllConfigs() {
        return this.db.listingFeeConfig.findMany({
            orderBy: { propertyType: 'asc' },
        });
    }

    // ─── Public: Lấy cấu hình phí theo loại BĐS ─────────────────────────────
    async getConfigByPropertyType(propertyTypeStr: string) {
        const propertyType = propertyTypeStr.toLowerCase() as PropertyType;
        const config = await this.db.listingFeeConfig.findUnique({
            where: { propertyType },
        });
        if (!config) {
            throw new NotFoundException(`Không tìm thấy cấu hình phí cho loại BĐS: ${propertyTypeStr}`);
        }
        return config;
    }

    // ─── User: Gia hạn tin đăng ────────────────────────────────────────────
    async renewListing(propertyId: string, userId: string, paymentMethod = 'wallet') {
        const property = await this.db.property.findUnique({
            where: { propertyId },
            include: { landlord: true },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản.');
        }

        if (property.landlordId !== userId) {
            throw new ForbiddenException('Bạn không có quyền gia hạn tin đăng này.');
        }

        // Lấy cấu hình phí theo loại BĐS
        let feeConfig = await this.db.listingFeeConfig.findUnique({
            where: { propertyType: property.propertyType },
        });

        // Nếu chưa có config thì seed trước
        if (!feeConfig) {
            await this.seedDefaultConfigs();
            feeConfig = await this.db.listingFeeConfig.findUnique({
                where: { propertyType: property.propertyType },
            });
        }

        if (!feeConfig || !feeConfig.isActive) {
            throw new BadRequestException('Tính năng gia hạn tin đăng cho loại BĐS này hiện đang tạm khóa.');
        }

        const feeAmountNum = Number(feeConfig.feeAmount);

        // Thanh toán qua ví (Wallet)
        if (paymentMethod === 'wallet') {
            if (feeAmountNum > 0) {
                // Call sang contract-service để khấu trừ tiền trong ví
                const kongUrl = this.config.get<string>('USER_SERVICE_URL') || 'http://kong:8000';
                // Thay url nội bộ sang contract-service nếu gọi trực tiếp hoặc qua gateway
                // Gateway kong sẽ có route /api/contract/wallet/internal/deduct
                const deductUrl = `${kongUrl}/api/contract/wallet/internal/deduct`;
                const expectedToken = this.config.get<string>('ESTATE_INTERNAL_TOKEN');

                try {
                    const headers: Record<string, string> = {};
                    if (expectedToken) {
                        headers['x-internal-token'] = expectedToken;
                    }

                    const response = await axios.post(
                        deductUrl,
                        {
                            userId,
                            amount: feeAmountNum,
                            description: `Phí gia hạn tin đăng: ${property.title.slice(0, 40)}...`,
                        },
                        {
                            headers,
                            timeout: 5000,
                        }
                    );

                    if (!response.data || response.status >= 400) {
                        throw new BadRequestException('Khấu trừ tiền từ ví thất bại.');
                    }
                } catch (error: any) {
                    console.error('Error calling deductWallet API:', error.message);
                    const errorMsg = error.response?.data?.message || 'Không thể kết nối dịch vụ ví để thanh toán.';
                    throw new BadRequestException(errorMsg);
                }
            }
        } else {
            throw new BadRequestException(`Phương thức thanh toán '${paymentMethod}' chưa được hỗ trợ.`);
        }

        // Tính toán hạn hiển thị mới
        const now = new Date();
        let newExpiry = new Date(now);

        if (property.listingExpiresAt && property.listingExpiresAt > now) {
            // Cộng dồn nếu chưa hết hạn
            newExpiry = new Date(property.listingExpiresAt);
            newExpiry.setDate(newExpiry.getDate() + feeConfig.durationDays);
        } else {
            // Hết hạn rồi thì tính từ hôm nay
            newExpiry.setDate(newExpiry.getDate() + feeConfig.durationDays);
        }

        // Lưu lịch sử gia hạn và cập nhật Property
        return this.db.$transaction(async (tx) => {
            const history = await tx.listingRenewalHistory.create({
                data: {
                    propertyId,
                    paidById: userId,
                    feeAmount: feeConfig.feeAmount,
                    durationDays: feeConfig.durationDays,
                    paymentMethod,
                    previousExpiry: property.listingExpiresAt,
                    newExpiry,
                    status: 'completed',
                },
            });

            const updatedProperty = await tx.property.update({
                where: { propertyId },
                data: {
                    isListingExpired: false,
                    listingExpiresAt: newExpiry,
                    // Nếu tin đăng đang bị ẩn vì hết hạn, kích hoạt lại nó
                    status: property.status === PropertyStatus.inactive && property.isListingExpired
                        ? PropertyStatus.active
                        : property.status,
                },
            });

            // Gửi thông báo gia hạn thành công qua RabbitMQ
            this.rabbitClient.emit('listing.renewed', {
                propertyId,
                title: property.title,
                landlordId: userId,
                landlordEmail: property.landlord?.email,
                newExpiry: newExpiry.toISOString(),
                feeAmount: feeAmountNum,
            });

            return {
                message: 'Gia hạn tin đăng thành công.',
                listingExpiresAt: newExpiry,
                history,
            };
        });
    }

    // ─── User: Lấy lịch sử gia hạn ─────────────────────────────────────────
    async getRenewalHistory(propertyId: string, userId: string) {
        const property = await this.db.property.findUnique({
            where: { propertyId },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản.');
        }

        if (property.landlordId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem lịch sử tin đăng này.');
        }

        return this.db.listingRenewalHistory.findMany({
            where: { propertyId },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ─── User: Lấy trạng thái tin đăng ─────────────────────────────────────
    async getListingStatus(propertyId: string, userId: string) {
        const property = await this.db.property.findUnique({
            where: { propertyId },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản.');
        }

        if (property.landlordId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xem trạng thái tin đăng này.');
        }

        const now = new Date();
        let daysRemaining = 0;

        if (property.listingExpiresAt && property.listingExpiresAt > now) {
            const diffMs = property.listingExpiresAt.getTime() - now.getTime();
            daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }

        return {
            propertyId: property.propertyId,
            isListingExpired: property.isListingExpired,
            listingExpiresAt: property.listingExpiresAt,
            freeListingEndDate: property.freeListingEndDate,
            daysRemaining,
        };
    }

    // ─── Admin: Cập nhật cấu hình phí ─────────────────────────────────────
    async updateConfig(
        configId: string,
        data: {
            feeAmount?: number;
            durationDays?: number;
            freeTrialDays?: number;
            isActive?: boolean;
            description?: string;
        },
    ) {
        const config = await this.db.listingFeeConfig.findUnique({
            where: { id: configId },
        });

        if (!config) {
            throw new NotFoundException('Không tìm thấy cấu hình phí.');
        }

        return this.db.listingFeeConfig.update({
            where: { id: configId },
            data: {
                feeAmount: data.feeAmount !== undefined ? data.feeAmount : undefined,
                durationDays: data.durationDays !== undefined ? data.durationDays : undefined,
                freeTrialDays: data.freeTrialDays !== undefined ? data.freeTrialDays : undefined,
                isActive: data.isActive !== undefined ? data.isActive : undefined,
                description: data.description !== undefined ? data.description : undefined,
            },
        });
    }

    // ─── Admin: Seed cấu hình mặc định cho 5 loại BĐS ───────────────────────
    async seedDefaultConfigs() {
        const defaultConfigs = [
            { propertyType: PropertyType.room, feeAmount: 50000, durationDays: 30, freeTrialDays: 30, description: 'Phí đăng tin Phòng trọ' },
            { propertyType: PropertyType.house, feeAmount: 100000, durationDays: 30, freeTrialDays: 30, description: 'Phí đăng tin Nhà nguyên căn' },
            { propertyType: PropertyType.apartment, feeAmount: 120000, durationDays: 30, freeTrialDays: 30, description: 'Phí đăng tin Căn hộ' },
            { propertyType: PropertyType.office, feeAmount: 150000, durationDays: 30, freeTrialDays: 30, description: 'Phí đăng tin Văn phòng' },
            { propertyType: PropertyType.land, feeAmount: 80000, durationDays: 30, freeTrialDays: 30, description: 'Phí đăng tin Đất nền' },
        ];

        let seededCount = 0;
        for (const item of defaultConfigs) {
            const existing = await this.db.listingFeeConfig.findUnique({
                where: { propertyType: item.propertyType },
            });
            if (!existing) {
                await this.db.listingFeeConfig.create({
                    data: item,
                });
                seededCount++;
            }
        }

        return {
            message: `Seed cấu hình phí thành công. Đã thêm ${seededCount} cấu hình mới.`,
        };
    }

    // ─── Cron/Interval: Quét và cập nhật tin đăng hết hạn ───────────────────
    async checkAndExpireListings() {
        const now = new Date();

        // 1. Quét tìm các tin đăng chưa set `listingExpiresAt` và đã qua freeTrialDays (tính từ createdAt)
        // Chúng ta cập nhật freeListingEndDate và listingExpiresAt cho các tin đăng mới
        const unconfiguredProperties = await this.db.property.findMany({
            where: {
                listingExpiresAt: null,
                status: PropertyStatus.active,
            },
        });

        for (const p of unconfiguredProperties) {
            let feeConfig = await this.db.listingFeeConfig.findUnique({
                where: { propertyType: p.propertyType },
            });
            if (!feeConfig) {
                await this.seedDefaultConfigs();
                feeConfig = await this.db.listingFeeConfig.findUnique({
                    where: { propertyType: p.propertyType },
                });
            }

            const freeTrialDays = feeConfig?.freeTrialDays ?? 30;
            const freeListingEndDate = new Date(p.createdAt);
            freeListingEndDate.setDate(freeListingEndDate.getDate() + freeTrialDays);

            await this.db.property.update({
                where: { propertyId: p.propertyId },
                data: {
                    freeListingEndDate,
                    listingExpiresAt: freeListingEndDate,
                },
            });
        }

        // 2. Quét tìm các tin đăng đã hết hạn (listingExpiresAt < now) và chưa đánh dấu là expired
        const expiredProperties = await this.db.property.findMany({
            where: {
                listingExpiresAt: { lt: now },
                isListingExpired: false,
                status: PropertyStatus.active,
            },
            include: { landlord: true },
        });

        let expiredCount = 0;
        for (const p of expiredProperties) {
            await this.db.property.update({
                where: { propertyId: p.propertyId },
                data: {
                    isListingExpired: true,
                    status: PropertyStatus.inactive, // Ẩn tin đăng khi hết hạn
                },
            });

            expiredCount++;

            // Gửi event tin đăng hết hạn qua RabbitMQ để notification-service gửi email/notify cho chủ nhà
            this.rabbitClient.emit('listing.expired', {
                propertyId: p.propertyId,
                title: p.title,
                landlordId: p.landlordId,
                landlordEmail: p.landlord?.email,
                expiredAt: p.listingExpiresAt?.toISOString(),
            });
        }

        if (expiredCount > 0) {
            console.log(`[ListingFeeCron] Đã quét và cập nhật ${expiredCount} tin đăng hết hạn hiển thị.`);
        }
    }
}

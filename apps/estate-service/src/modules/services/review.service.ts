import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';

@Injectable()
export class ReviewService {
    constructor(private readonly db: DatabaseService) {}

    /**
     * Lấy danh sách review của 1 property (public, có pagination)
     */
    async getPropertyReviews(
        propertyId: string,
        page: number = 1,
        limit: number = 10,
        sortBy: string = 'newest',
    ) {
        const property = await this.db.property.findUnique({
            where: { propertyId },
            select: { propertyId: true },
        });
        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }

        const orderBy = this.getReviewSortOrder(sortBy);

        const [items, total] = await Promise.all([
            this.db.review.findMany({
                where: { propertyId, isPublic: true },
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    reviewer: {
                        select: { id: true, fullName: true, avatarUrl: true },
                    },
                },
            }),
            this.db.review.count({ where: { propertyId, isPublic: true } }),
        ]);

        // Tính rating trung bình
        const avgResult = await this.db.review.aggregate({
            where: { propertyId, isPublic: true },
            _avg: { rating: true },
            _count: { rating: true },
        });

        return {
            items: items.map((r) => ({
                id: r.reviewId,
                rating: r.rating,
                comment: r.comment,
                imageUrls: r.imageUrls,
                reply: r.reply,
                repliedAt: r.repliedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                reviewer: {
                    id: r.reviewer.id,
                    fullName: r.reviewer.fullName ?? '',
                    avatarUrl: r.reviewer.avatarUrl ?? '',
                },
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            averageRating: avgResult._avg.rating ?? 0,
            totalReviews: avgResult._count.rating,
        };
    }

    /**
     * Tạo review mới (chỉ user đã đăng nhập)
     */
    async createReview(
        userId: string,
        data: { rentalId: string; propertyId: string; rating: number; comment: string; imageUrls?: string[] },
    ) {
        // Check property tồn tại
        const property = await this.db.property.findUnique({
            where: { propertyId: data.propertyId },
            select: { propertyId: true, landlordId: true },
        });
        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }

        // Không cho chủ nhà tự review
        if (property.landlordId === userId) {
            throw new BadRequestException('Bạn không thể đánh giá bất động sản của chính mình');
        }

        // Check đã review chưa (1 user chỉ review 1 lần cho 1 rental)
        const existing = await this.db.review.findFirst({
            where: { rentalId: data.rentalId, reviewerId: userId },
        });
        if (existing) {
            throw new BadRequestException('Bạn đã đánh giá cho hợp đồng thuê này rồi');
        }

        const review = await this.db.review.create({
            data: {
                rentalId: data.rentalId,
                propertyId: data.propertyId,
                reviewerId: userId,
                rating: data.rating,
                comment: data.comment,
                imageUrls: data.imageUrls ?? [],
            },
            include: {
                reviewer: {
                    select: { id: true, fullName: true, avatarUrl: true },
                },
            },
        });

        return {
            id: review.reviewId,
            rating: review.rating,
            comment: review.comment,
            imageUrls: review.imageUrls,
            reply: null,
            repliedAt: null,
            createdAt: review.createdAt.toISOString(),
            reviewer: {
                id: review.reviewer.id,
                fullName: review.reviewer.fullName ?? '',
                avatarUrl: review.reviewer.avatarUrl ?? '',
            },
        };
    }

    /**
     * Chủ nhà trả lời review
     */
    async replyReview(reviewId: string, landlordId: string, reply: string) {
        const review = await this.db.review.findUnique({
            where: { reviewId },
            include: {
                property: { select: { landlordId: true } },
            },
        });
        if (!review) {
            throw new NotFoundException('Không tìm thấy đánh giá');
        }

        if (review.property.landlordId !== landlordId) {
            throw new ForbiddenException('Chỉ chủ nhà mới có thể trả lời đánh giá');
        }

        const updated = await this.db.review.update({
            where: { reviewId },
            data: { reply, repliedAt: new Date() },
            include: {
                reviewer: {
                    select: { id: true, fullName: true, avatarUrl: true },
                },
            },
        });

        return {
            id: updated.reviewId,
            rating: updated.rating,
            comment: updated.comment,
            imageUrls: updated.imageUrls,
            reply: updated.reply,
            repliedAt: updated.repliedAt?.toISOString() ?? null,
            createdAt: updated.createdAt.toISOString(),
            reviewer: {
                id: updated.reviewer.id,
                fullName: updated.reviewer.fullName ?? '',
                avatarUrl: updated.reviewer.avatarUrl ?? '',
            },
        };
    }

    /**
     * Xóa review (chỉ user tạo review hoặc admin)
     */
    async deleteReview(reviewId: string, userId: string, isAdmin: boolean) {
        const review = await this.db.review.findUnique({
            where: { reviewId },
        });
        if (!review) {
            throw new NotFoundException('Không tìm thấy đánh giá');
        }

        if (!isAdmin && review.reviewerId !== userId) {
            throw new ForbiddenException('Bạn không có quyền xóa đánh giá này');
        }

        await this.db.review.delete({ where: { reviewId } });
        return { message: 'Đã xóa đánh giá' };
    }

    private getReviewSortOrder(sortBy: string) {
        switch (sortBy) {
            case 'oldest': return { createdAt: 'asc' as const };
            case 'highest': return { rating: 'desc' as const };
            case 'lowest': return { rating: 'asc' as const };
            default: return { createdAt: 'desc' as const };
        }
    }
}

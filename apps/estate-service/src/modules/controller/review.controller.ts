import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { UserRole } from 'src/common/interfaces/request.interface';
import { ReviewService } from '../services/review.service';
import { CreateReviewDto, ReplyReviewDto, ReviewQueryDto } from '../dtos/review.dto';

@Controller('reviews')
export class ReviewController {
    constructor(private readonly reviewService: ReviewService) {}

    @PublicRoute('Lấy danh sách đánh giá của bất động sản')
    @Get('/property/:propertyId')
    getPropertyReviews(
        @Param('propertyId') propertyId: string,
        @Query() query: ReviewQueryDto,
    ) {
        return this.reviewService.getPropertyReviews(
            propertyId,
            query.page,
            query.limit,
            query.sortBy,
        );
    }

    @Post()
    createReview(
        @AuthUser() user: IAuthUserPayload,
        @Body() body: CreateReviewDto,
    ) {
        return this.reviewService.createReview(user.id, body);
    }

    @Patch('/:id/reply')
    replyReview(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') reviewId: string,
        @Body() body: ReplyReviewDto,
    ) {
        return this.reviewService.replyReview(reviewId, user.id, body.reply);
    }

    @Delete('/:id')
    deleteReview(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') reviewId: string,
    ) {
        return this.reviewService.deleteReview(reviewId, user.id, user.role === UserRole.ADMIN);
    }
}

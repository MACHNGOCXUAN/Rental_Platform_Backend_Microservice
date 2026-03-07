import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { RentalRequestService } from '../services/rental-request.service';
import { CreateRentalRequestDto, ReviewRentalRequestDto } from '../dtos/rental-request.dto';

@Controller('rental-requests')
export class RentalRequestController {

    constructor(private readonly rentalRequestService: RentalRequestService) { }

    @Post()
    @MessageKey('Gửi yêu cầu thuê thành công')
    createRequest(
        @AuthUser() user: IAuthUserPayload,
        @Body() dto: CreateRentalRequestDto,
    ) {
        return this.rentalRequestService.createRequest(dto, user.id);
    }

    @Get('my')
    getMyRequests(@AuthUser() user: IAuthUserPayload) {
        return this.rentalRequestService.getMyRequests(user.id);
    }

    @Get('owner')
    getOwnerRequests(
        @AuthUser() user: IAuthUserPayload,
        @Query('status') status?: string,
    ) {
        return this.rentalRequestService.getOwnerRequests(user.id, status);
    }

    @Get(':id')
    getRequestDetail(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') requestId: string,
    ) {
        return this.rentalRequestService.getRequestDetail(requestId, user.id);
    }

    @Put(':id/review')
    @MessageKey('Cập nhật yêu cầu thuê thành công')
    reviewRequest(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') requestId: string,
        @Body() dto: ReviewRentalRequestDto,
    ) {
        return this.rentalRequestService.reviewRequest(requestId, dto, user.id);
    }

    @Put(':id/cancel')
    @MessageKey('Hủy yêu cầu thuê thành công')
    cancelRequest(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') requestId: string,
    ) {
        return this.rentalRequestService.cancelRequest(requestId, user.id);
    }
}

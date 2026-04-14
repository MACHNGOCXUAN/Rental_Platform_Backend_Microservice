import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { TerminationService } from '../services/termination.service';
import { CreateTerminationRequestDto, ReviewTerminationRequestDto, UpdateTerminationStatusDto } from '../dtos/termination.dto';

@Controller('terminations')
export class TerminationController {

    constructor(private readonly terminationService: TerminationService) { }

    @Post()
    @MessageKey('Gửi yêu cầu chấm dứt hợp đồng thành công')
    createTerminationRequest(
        @AuthUser() user: IAuthUserPayload,
        @Body() dto: CreateTerminationRequestDto,
    ) {
        return this.terminationService.createTerminationRequest(dto, user.id, user.role);
    }

    @Get('contract/:rentalId')
    getTerminationRequests(
        @AuthUser() user: IAuthUserPayload,
        @Param('rentalId') rentalId: string,
    ) {
        return this.terminationService.getTerminationRequests(rentalId, user.id);
    }

    @Put(':id/review')
    @MessageKey('Xử lý yêu cầu chấm dứt thành công')
    reviewTerminationRequest(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') terminationId: string,
        @Body() dto: ReviewTerminationRequestDto,
    ) {
        return this.terminationService.reviewTerminationRequest(terminationId, dto, user.id);
    }

    @Put(':id/status')
    @MessageKey('Cập nhật trạng thái chấm dứt thành công')
    updateTerminationStatus(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') terminationId: string,
        @Body() dto: UpdateTerminationStatusDto,
    ) {
        return this.terminationService.updateTerminationStatus(terminationId, dto, user.id, user.role);
    }
}

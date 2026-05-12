import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";
import { RenewalService } from "../services/renewal.service";
import { CreateRenewalRequestDto, ReviewRenewalRequestDto, RenewalQueryDto } from "../dtos/renewal.dto";

@Controller("/renewals")
export class RenewalController {
    constructor(
        private readonly renewalService: RenewalService,
    ) { }

    @Post()
    @MessageKey('Gửi yêu cầu gia hạn thành công')
    createRenewalRequest(
        @AuthUser() user: IAuthUserPayload,
        @Body() dto: CreateRenewalRequestDto,
    ) {
        return this.renewalService.createRenewalRequest(dto, user.id);
    }

    @Get('my')
    getMyRenewalRequests(
        @AuthUser() user: IAuthUserPayload,
        @Query() query: RenewalQueryDto,
    ) {
        return this.renewalService.getMyRenewalRequests(user.id, query);
    }

    @Get('contract/:contractId')
    getRenewalRequestsByContract(
        @AuthUser() user: IAuthUserPayload,
        @Param('contractId') contractId: string,
    ) {
        return this.renewalService.getRenewalRequestsByContract(contractId, user.id);
    }

    @Put(':id/approve')
    @MessageKey('Duyệt gia hạn thành công')
    approveRenewalRequest(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') renewalId: string,
        @Body() dto: ReviewRenewalRequestDto,
    ) {
        return this.renewalService.approveRenewalRequest(renewalId, user.id, dto);
    }

    @Put(':id/reject')
    @MessageKey('Từ chối gia hạn thành công')
    rejectRenewalRequest(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') renewalId: string,
        @Body() dto: ReviewRenewalRequestDto,
    ) {
        return this.renewalService.rejectRenewalRequest(renewalId, user.id, dto);
    }

    @Put(':id/cancel')
    @MessageKey('Hủy yêu cầu gia hạn thành công')
    cancelRenewalRequest(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') renewalId: string,
    ) {
        return this.renewalService.cancelRenewalRequest(renewalId, user.id);
    }

    @Get('appendices/:contractId')
    getContractAppendices(
        @AuthUser() user: IAuthUserPayload,
        @Param('contractId') contractId: string,
    ) {
        return this.renewalService.getContractAppendices(contractId, user.id);
    }
}

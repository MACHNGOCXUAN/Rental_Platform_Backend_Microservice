import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { PublicRoute } from "src/common/decorators/public.decorator";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";
import { ContractService } from "../services/contract.service";
import { UpdateContractDto, SignContractDto, ContractQueryDto, CreateContractDto } from "../dtos/contract.dto";
import type { Request } from "express";

@Controller("/rental-contracts")
export class ContractController {
    constructor(
        private readonly contractService: ContractService
    ) { }

    @Get('my')
    getMyContracts(
        @AuthUser() user: IAuthUserPayload,
        @Query() query: ContractQueryDto,
    ) {
        return this.contractService.getMyContracts(user.id, query);
    }

    @Get('status-count')
    getContractStatusCounts(@AuthUser() user: IAuthUserPayload) {
        return this.contractService.getContractStatusCounts(user.id);
    }

    @Get(':id')
    getContractDetail(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
    ) {
        return this.contractService.getContractDetail(contractId, user.id);
    }

    @Put(':id')
    @MessageKey('Cập nhật hợp đồng thành công')
    updateContract(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
        @Body() dto: UpdateContractDto,
    ) {
        return this.contractService.updateContract(contractId, dto, user.id);
    }

    @Put(':id/send')
    @MessageKey('Gửi hợp đồng cho khách hàng thành công')
    sendToTenant(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
    ) {
        return this.contractService.sendToTenant(contractId, user.id);
    }

    @Put(':id/tenant-sign')
    @MessageKey('Ký hợp đồng thành công')
    tenantSign(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
        @Req() req: Request,
    ) {
        const dto: SignContractDto = {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        };
        return this.contractService.tenantSign(contractId, user.id, dto);
    }

    @Put(':id/owner-sign')
    @MessageKey('Ký hợp đồng thành công')
    ownerSign(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
        @Req() req: Request,
    ) {
        const dto: SignContractDto = {
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        };
        return this.contractService.ownerSign(contractId, user.id, dto);
    }

    @Put(':id/activate')
    @MessageKey('Kích hoạt hợp đồng thành công')
    activateContract(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
    ) {
        return this.contractService.activateContract(contractId);
    }

    @Put(':id/cancel')
    @MessageKey('Hủy hợp đồng thành công')
    cancelContract(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') contractId: string,
    ) {
        return this.contractService.cancelContract(contractId, user.id);
    }

    @Post("createContract")
    createContract(
        @AuthUser() user: IAuthUserPayload,
        @Body() dto: CreateContractDto,
    ) {
        return this.contractService.createContract(dto, user.id)
    }
}
import { Controller, Get, Post } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { PublicRoute } from "src/common/decorators/public.decorator";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";
import { ContractService } from "../services/contract.service";

@Controller("/rental-contracts")
export class ContractController {
    constructor(
        private readonly contractService: ContractService
    ) { }

    @Get()
    @PublicRoute()
    async getAllUser() {
        return this.contractService.getAllContract()
    }

    @Post()
    @MessageKey("Tạo tài sản thành công")
    async createProperty(
        // @AuthUser() user: IAuthUserPayload
    ) {
        // console.log("xuan: ", user.id);
        
        return this.contractService.createRentalContract({
            propertyId: '11111111-1111-1111-1111-111111111111',
            tenantId: '22222222-2222-2222-2222-222222222222',

            ownerId: "12323232-3232-4321-4321-123456789012",

            contractCode: 'HD-TEST-0013',

            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),

            monthlyRent: 5000000,
            depositAmount: 10000000,
        });
    }

}
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { AdminOnly } from 'src/common/decorators/auth-roles.decorator';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { ListingFeeService } from '../services/listing-fee.service';

@Controller('listing-fee')
export class ListingFeeController {
    constructor(
        private readonly listingFeeService: ListingFeeService,
    ) { }

    // ─── Public: lấy config phí theo property type ────────
    @PublicRoute('Lấy cấu hình phí đăng tin')
    @Get('configs')
    getAllConfigs() {
        return this.listingFeeService.getAllConfigs();
    }

    @PublicRoute('Lấy cấu hình phí theo loại BĐS')
    @Get('config/:propertyType')
    getConfigByType(@Param('propertyType') propertyType: string) {
        return this.listingFeeService.getConfigByPropertyType(propertyType);
    }

    // ─── User: gia hạn listing ────────────────────────────
    @Post('renew/:propertyId')
    renewListing(
        @AuthUser() user: IAuthUserPayload,
        @Param('propertyId') propertyId: string,
        @Body() body: { paymentMethod?: string },
    ) {
        return this.listingFeeService.renewListing(propertyId, user.id, body.paymentMethod);
    }

    // ─── User: lấy lịch sử gia hạn ───────────────────────
    @Get('history/:propertyId')
    getRenewalHistory(
        @AuthUser() user: IAuthUserPayload,
        @Param('propertyId') propertyId: string,
    ) {
        return this.listingFeeService.getRenewalHistory(propertyId, user.id);
    }

    // ─── User: lấy trạng thái listing ────────────────────
    @Get('status/:propertyId')
    getListingStatus(
        @AuthUser() user: IAuthUserPayload,
        @Param('propertyId') propertyId: string,
    ) {
        return this.listingFeeService.getListingStatus(propertyId, user.id);
    }

    // ─── Admin: cập nhật cấu hình phí ────────────────────
    @AdminOnly()
    @Put('admin/config/:id')
    updateConfig(
        @Param('id') configId: string,
        @Body() body: {
            feeAmount?: number;
            durationDays?: number;
            freeTrialDays?: number;
            isActive?: boolean;
            description?: string;
        },
    ) {
        return this.listingFeeService.updateConfig(configId, body);
    }

    // ─── Admin: seed default configs ─────────────────────
    @AdminOnly()
    @Post('admin/seed')
    seedDefaultConfigs() {
        return this.listingFeeService.seedDefaultConfigs();
    }
}

import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { AdminOnly } from 'src/common/decorators/auth-roles.decorator';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { PropertyStatus } from 'generated/prisma/enums';
import { PropertyService } from '../services/property.service';
import { CreatePropertyDto, CreatePropertySaveDraftDto, SearchPropertyDto } from '../dtos/property.dto';

@Controller('properties')
export class PropertyController {
    constructor(private readonly propertyService: PropertyService) { }

    // ======================== Public router ===============================

    @PublicRoute('Tìm kiếm bất động sản (cursor-based pagination)')
    @Get('/search')
    searchProperties(@Query() query: SearchPropertyDto) {
        return this.propertyService.searchProperties(query);
    }

    @PublicRoute('Lấy bất động sản nổi bật cho trang chủ')
    @Get('/featured')
    getFeaturedProperties(@Query('limit') limit?: string) {
        return this.propertyService.getFeaturedProperties(limit ? parseInt(limit) : 12);
    }

    @PublicRoute('Xem chi tiết bất động sản theo ID')
    @Get('/public/:id')
    getPublicProperty(@Param('id') propertyId: string) {
        return this.propertyService.getPublicProperty(propertyId);
    }

    @PublicRoute()
    @Get("/number-property")
    getNumberPropertyByCity(@Query("type") type?: string) {
        return this.propertyService.getNumberPropertyByCity(type)
    }

    // ========================== Auth router

    @Post()
    createProperty(@AuthUser() user: IAuthUserPayload, @Body() body: CreatePropertyDto) {
        return this.propertyService.createProperty(body, user.id)
    }

    @Post("/draft")
    createPropertySaveDraft(@AuthUser() user: IAuthUserPayload, @Body() body: CreatePropertySaveDraftDto) {
        return this.propertyService.createProperty(body, user.id)
    }

    @Get("/status-count")
    getPostStatusCounts(@AuthUser() user: IAuthUserPayload) {
        return this.propertyService.getPostStatusCounts(user.id)
    }

    @Get('status')
    getProperty(
        @AuthUser() user: IAuthUserPayload,
        @Query('status') status: PropertyStatus,
    ) {
        return this.propertyService.getPropertiesByStatus(status, user.id);
    }

    @Get('/favorites')
    getFavoriteProperties(
        @AuthUser() user: IAuthUserPayload,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.propertyService.getFavoriteProperties(
            user.id,
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
        );
    }

    @Get('/:id/favorite-status')
    getFavoriteStatus(@AuthUser() user: IAuthUserPayload, @Param('id') propertyId: string) {
        return this.propertyService.getFavoriteStatus(user.id, propertyId);
    }

    @Post('/:id/favorite')
    addFavorite(@AuthUser() user: IAuthUserPayload, @Param('id') propertyId: string) {
        return this.propertyService.addFavorite(user.id, propertyId);
    }

    @Put('/:id/visibility')
    updateOwnPropertyVisibility(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') propertyId: string,
        @Body() data: { visible: boolean },
    ) {
        return this.propertyService.updatePropertyVisibility(propertyId, data.visible, user.id);
    }

    @AdminOnly()
    @Put('/admin/visibility/:id')
    updateAdminPropertyVisibility(
        @Param('id') propertyId: string,
        @Body() data: { visible: boolean },
    ) {
        return this.propertyService.updatePropertyVisibility(propertyId, data.visible);
    }

    @Put('/:id/unfavorite')
    removeFavorite(@AuthUser() user: IAuthUserPayload, @Param('id') propertyId: string) {
        return this.propertyService.removeFavorite(user.id, propertyId);
    }

    @Get("/:id")
    getPropertyId(@AuthUser() user: IAuthUserPayload, @Param('id') propertyId: string) {
        return this.propertyService.getPropertyId(propertyId, user.id)
    }

    @Put("/update/:id")
    updateProperty(@AuthUser() user: IAuthUserPayload, @Param('id') propertyId: string, @Body() body: CreatePropertyDto) {
        return this.propertyService.updateProperty(propertyId, body, user.id)
    }

    @Get()
    getListProperty(@AuthUser() user: IAuthUserPayload) {

        return this.propertyService.getListProperty(user.id)
    }

    @Get("/auth/search")
    getFilterProperty(@AuthUser() user: IAuthUserPayload, @Query() query: SearchPropertyDto) {
        return this.propertyService.searchAuthProperties(query, user.id);
    }

    // ==================== Admin ==========================

    @Post('/admin')
    getPropertiesForAdmin(
        @Body() data: any,
    ) {
        return this.propertyService.getPropertiesForAdmin(data.page, data.limit, data.approvalStatus, data.search);
    }

    @Put('/admin/approve/:id')
    approveProperty(
        @Param('id') propertyId: string,
        @Body() data: { approve: boolean; reason?: string },
    ) {
        return this.propertyService.approveProperty(propertyId, data.approve, data.reason);
    }
}

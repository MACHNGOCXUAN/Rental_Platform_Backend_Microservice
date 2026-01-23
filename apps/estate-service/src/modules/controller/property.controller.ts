import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { PropertyStatus } from 'generated/prisma/enums';
import { PropertyService } from '../services/property.service';
import { CreatePropertyDto, CreatePropertySaveDraftDto } from '../dtos/property.dto';

@Controller('properties')
export class PropertyController {
    constructor(private readonly propertyService: PropertyService) { }

    @Post()
    createProperty(@AuthUser() user: IAuthUserPayload, @Body() body: CreatePropertyDto) {
        return this.propertyService.createProperty(body, user.id)
    }

    @Post("/draft")
    createPropertySaveDraft(@AuthUser() user: IAuthUserPayload, @Body() body: CreatePropertySaveDraftDto) {
        console.log("nlmlkml: ");
        
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

    @Get("/:id")
    getPropertyId(@AuthUser() user: IAuthUserPayload, @Param('id') propertyId: string) {
        return this.propertyService.getPropertyId(propertyId, user.id)
    }
}

import { AdminOnly } from "src/common/decorators/auth-roles.decorator";
import { PropertyService } from "../services/property.service";
import { Controller, Get, Post } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { PublicRoute } from "src/common/decorators/public.decorator";
import { AuthUser } from "src/common/decorators/auth-user.decorator";
import type { IAuthUserPayload } from "src/common/interfaces/request.interface";

@Controller("/property")
export class PropertyController {
    constructor(
        private readonly propertyService: PropertyService
    ) { }

    @Get()
    @PublicRoute()
    async getAllUser() {
        return this.propertyService.getAllProperty()
    }

    @Post()
    @MessageKey("Taon tai san thanh cong")
    async createProperty(
        @AuthUser() user: IAuthUserPayload) {
        return this.propertyService.createProperty({
            name: "Property  1",
            address: "123 Main St",
            ownerId: user.id
        });
    }
}
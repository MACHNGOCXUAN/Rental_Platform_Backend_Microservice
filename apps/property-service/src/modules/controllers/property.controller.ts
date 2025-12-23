import { AdminOnly } from "src/common/decorators/auth-roles.decorator";
import { PropertyService } from "../services/property.service";
import { Controller, Get } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { PublicRoute } from "src/common/decorators/public.decorator";

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
}
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { TemplateContractService } from '../services/template-contract.service';

@Controller('contract-templates')
export class TemplateContractController {

    constructor(
        private readonly templateContractService: TemplateContractService
    ) {}

    // Create template
    @Post()
    @MessageKey('template.created')
    async createTemplate(
        @AuthUser() user: IAuthUserPayload,
        @Body() body: any
    ) {
        return this.templateContractService.createTemplate({
            ...body,
            createdBy: user.id
        });
    }

    // Get all templates
    @Get("/property-type/:type")
    @MessageKey('template.list')
    async getTemplates(@Param('type') type: string) {
        return this.templateContractService.getTemplates(type);
    }

    // Get template detail
    @Get(':templateId')
    @MessageKey('template.detail')
    async getTemplateDetail(
        @Param('templateId') templateId: string
    ) {
        return this.templateContractService.getTemplateById(templateId);
    }

    // Update template
    @Patch(':templateId')
    @MessageKey('template.updated')
    async updateTemplate(
        @Param('templateId') templateId: string,
        @Body() body: any
    ) {
        return this.templateContractService.updateTemplate(
            templateId,
            body
        );
    }

    // Delete (deactivate) template
    @Delete(':templateId')
    @MessageKey('template.deleted')
    async deleteTemplate(
        @Param('templateId') templateId: string
    ) {
        return this.templateContractService.deactivateTemplate(
            templateId
        );
    }

    // Set default template
    @Patch(':templateId/default')
    @MessageKey('template.setDefault')
    async setDefaultTemplate(
        @Param('templateId') templateId: string
    ) {
        return this.templateContractService.setDefaultTemplate(
            templateId
        );
    }

    // Get default template
    @Get('default/template')
    @MessageKey('template.default')
    async getDefaultTemplate() {
        return this.templateContractService.getDefaultTemplate();
    }

    @Get("request/:id")
    getInformationDefaultTemplate(@Param('id') id: string) {
        return this.templateContractService.getInfomationTemplate(id);
    }
}
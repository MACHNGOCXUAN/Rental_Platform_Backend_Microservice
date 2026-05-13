import {
    Controller, Get, Post, Param, Res, UploadedFile, UseInterceptors,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthPayload } from '../interfaces/auth.interface';
import { BulkImportService } from '../services/bulk-import.service';
import type { Response } from 'express';

@Controller('properties/bulk-import')
export class BulkImportController {
    constructor(private readonly bulkImportService: BulkImportService) {}

    @Get('eligibility')
    @MessageKey('Kiểm tra điều kiện thành công')
    checkEligibility(@AuthUser() user: IAuthPayload) {
        return this.bulkImportService.checkEligibility(user.id);
    }

    @Get('template')
    async downloadTemplate(@Res() res: Response) {
        const buffer = await this.bulkImportService.generateTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=template_bulk_import.xlsx');
        res.send(Buffer.from(buffer));
    }

    @Post('upload')
    @MessageKey('Upload thành công')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
    async uploadExcel(
        @AuthUser() user: IAuthPayload,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Vui lòng chọn file Excel');

        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
            throw new BadRequestException('Chỉ hỗ trợ file Excel (.xlsx)');
        }

        return this.bulkImportService.processUpload(user.id, file);
    }

    @Get('sessions')
    @MessageKey('Lấy lịch sử import thành công')
    getSessions(@AuthUser() user: IAuthPayload) {
        return this.bulkImportService.getSessions(user.id);
    }

    @Get('sessions/:id')
    @MessageKey('Lấy chi tiết phiên import thành công')
    getSessionDetail(@AuthUser() user: IAuthPayload, @Param('id') id: string) {
        return this.bulkImportService.getSessionDetail(user.id, id);
    }

    @Get('sessions/:id/errors')
    @MessageKey('Lấy danh sách lỗi thành công')
    getSessionErrors(@AuthUser() user: IAuthPayload, @Param('id') id: string) {
        return this.bulkImportService.getSessionErrors(user.id, id);
    }

    @Get('sessions/:id/export-errors')
    async exportErrors(
        @AuthUser() user: IAuthPayload,
        @Param('id') id: string,
        @Res() res: Response,
    ) {
        const buffer = await this.bulkImportService.exportErrorsExcel(user.id, id);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=errors_${id}.xlsx`);
        res.send(Buffer.from(buffer));
    }
}

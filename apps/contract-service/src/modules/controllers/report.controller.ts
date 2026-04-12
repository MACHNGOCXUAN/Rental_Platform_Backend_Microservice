import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { AdminOnly, UserAccountAndAdmin } from 'src/common/decorators/auth-roles.decorator';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import {
  AdminReportQueryDto,
  AdminResolveReportDto,
  CreateReportDto,
  UpdateReportStatusDto,
} from '../dtos/report.dto';
import { ReportService } from '../services/report.service';

@Controller()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post('reports')
  @MessageKey('Tạo khiếu nại thành công')
  createReport(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportService.createReport(dto, user.id, user.role);
  }

  @Get('reports/contract/:rentalId')
  @UserAccountAndAdmin()
  getReportsByContract(
    @AuthUser() user: IAuthUserPayload,
    @Param('rentalId') rentalId: string,
  ) {
    return this.reportService.getReportsByContract(rentalId, user.id, user.role);
  }

  @Put('reports/:id/status')
  @MessageKey('Cập nhật khiếu nại thành công')
  @UserAccountAndAdmin()
  updateReportStatus(
    @AuthUser() user: IAuthUserPayload,
    @Param('id') reportId: string,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.reportService.updateReportStatus(reportId, dto, user.id, user.role);
  }

  @AdminOnly()
  @Get('admin/reports')
  getReports(@Query() query: AdminReportQueryDto) {
    return this.reportService.getAdminReports(query);
  }

  @AdminOnly()
  @Get('admin/reports/:id')
  getReportById(@Param('id') id: string) {
    return this.reportService.getReportById(id);
  }

  @AdminOnly()
  @Patch('admin/reports/:id/resolve')
  resolveReport(
    @Param('id') id: string,
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: AdminResolveReportDto,
  ) {
    return this.reportService.resolveReport(id, user.id, dto.adminNote);
  }
}

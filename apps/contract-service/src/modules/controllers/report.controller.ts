import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminOnly } from 'src/common/decorators/auth-roles.decorator';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { ReportService } from '../services/report.service';
import { AdminReportQueryDto, AdminResolveReportDto } from '../dtos/report.dto';

@Controller('/admin/reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @AdminOnly()
  @Get()
  getReports(@Query() query: AdminReportQueryDto) {
    return this.reportService.getAdminReports(query);
  }

  @AdminOnly()
  @Get(':id')
  getReportById(@Param('id') id: string) {
    return this.reportService.getReportById(id);
  }

  @AdminOnly()
  @Patch(':id/resolve')
  resolveReport(
    @Param('id') id: string,
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: AdminResolveReportDto,
  ) {
    return this.reportService.resolveReport(id, user.id, dto.adminNote);
  }
}

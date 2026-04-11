import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import { UserAccountAndAdmin } from 'src/common/decorators/auth-roles.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { CreateReportDto, UpdateReportStatusDto } from '../dtos/report.dto';
import { ReportService } from '../services/report.service';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @MessageKey('Tạo khiếu nại thành công')
  createReport(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportService.createReport(dto, user.id, user.role);
  }

  @Get('contract/:rentalId')
  @UserAccountAndAdmin()
  getReportsByContract(
    @AuthUser() user: IAuthUserPayload,
    @Param('rentalId') rentalId: string,
  ) {
    return this.reportService.getReportsByContract(rentalId, user.id, user.role);
  }

  @Put(':id/status')
  @MessageKey('Cập nhật khiếu nại thành công')
  @UserAccountAndAdmin()
  updateReportStatus(
    @AuthUser() user: IAuthUserPayload,
    @Param('id') reportId: string,
    @Body() dto: UpdateReportStatusDto,
  ) {
    return this.reportService.updateReportStatus(reportId, dto, user.id, user.role);
  }
}

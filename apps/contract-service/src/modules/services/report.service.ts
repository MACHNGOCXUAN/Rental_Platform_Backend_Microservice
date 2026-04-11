import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateReportDto, UpdateReportStatusDto } from '../dtos/report.dto';
import { ReportAction, ReportPriority, ReportStatus } from 'generated/prisma/enums';
import { UserRole } from 'src/common/interfaces/request.interface';

@Injectable()
export class ReportService {
  constructor(private readonly db: DatabaseService) {}

  private async getContractForUser(rentalId: string, userId: string, role: UserRole) {
    const contract = await this.db.rentalContract.findUnique({
      where: { rentalId },
    });

    if (!contract) {
      throw new NotFoundException('Không tìm thấy hợp đồng');
    }

    if (role !== UserRole.ADMIN && contract.ownerId !== userId && contract.tenantId !== userId) {
      throw new ForbiddenException('Không có quyền');
    }

    return contract;
  }

  async createReport(dto: CreateReportDto, userId: string, role: UserRole) {
    const contract = await this.getContractForUser(dto.rentalId, userId, role);

    if (role === UserRole.ADMIN) {
      throw new BadRequestException('Admin không thể tạo khiếu nại');
    }

    const againstId = dto.againstId;
    const validAgainst =
      (contract.ownerId === userId && contract.tenantId === againstId) ||
      (contract.tenantId === userId && contract.ownerId === againstId);

    if (!validAgainst) {
      throw new BadRequestException('Đối tượng khiếu nại không hợp lệ');
    }

    const report = await this.db.report.create({
      data: {
        rentalId: dto.rentalId,
        createdBy: userId,
        againstId,
        type: dto.type,
        priority: dto.priority ?? ReportPriority.medium,
        status: ReportStatus.open,
        title: dto.title,
        description: dto.description,
      },
    });

    await this.db.reportHistory.create({
      data: {
        reportId: report.id,
        action: ReportAction.CREATED,
        newStatus: ReportStatus.open,
        performedBy: userId,
        note: 'Tạo khiếu nại',
      },
    });

    return this.db.report.findUnique({
      where: { id: report.id },
      include: { histories: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async getReportsByContract(rentalId: string, userId: string, role: UserRole) {
    await this.getContractForUser(rentalId, userId, role);

    return this.db.report.findMany({
      where: { rentalId },
      include: { histories: { orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReportStatus(reportId: string, dto: UpdateReportStatusDto, userId: string, role: UserRole) {
    const report = await this.db.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Không tìm thấy khiếu nại');
    }

    await this.getContractForUser(report.rentalId, userId, role);

    if (report.status === ReportStatus.resolved) {
      throw new BadRequestException('Khiếu nại đã kết thúc');
    }

    const nextStatus = dto.status;

    if (nextStatus === ReportStatus.resolved && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ admin được đóng khiếu nại');
    }

    if (nextStatus === ReportStatus.admin && role === UserRole.ADMIN) {
      throw new BadRequestException('Admin không thể chuyển trạng thái sang admin');
    }

    const validTransitions: Record<ReportStatus, ReportStatus[]> = {
      open: [ReportStatus.negotiating],
      negotiating: [ReportStatus.admin],
      admin: [ReportStatus.resolved],
      resolved: [],
    };

    const allowed = validTransitions[report.status];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException('Chuyển trạng thái khiếu nại không hợp lệ');
    }

    const updated = await this.db.report.update({
      where: { id: reportId },
      data: {
        status: nextStatus,
        adminNote: role === UserRole.ADMIN ? dto.adminNote ?? report.adminNote : report.adminNote,
        resolvedAt: nextStatus === ReportStatus.resolved ? new Date() : report.resolvedAt,
      },
    });

    const actionMap: Record<ReportStatus, ReportAction> = {
      open: ReportAction.CREATED,
      negotiating: ReportAction.NEGOTIATING,
      admin: ReportAction.SENT_TO_ADMIN,
      resolved: ReportAction.RESOLVED,
    };

    await this.db.reportHistory.create({
      data: {
        reportId,
        action: actionMap[nextStatus],
        oldStatus: report.status,
        newStatus: nextStatus,
        performedBy: userId,
        note: dto.note,
      },
    });

    return this.db.report.findUnique({
      where: { id: updated.id },
      include: { histories: { orderBy: { createdAt: 'desc' } } },
    });
  }
}

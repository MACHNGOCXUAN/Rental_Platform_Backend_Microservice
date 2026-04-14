import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReportAction, ReportPriority, ReportStatus, TerminationRequestStatus, TerminationResolution } from 'generated/prisma/enums';
import { UserRole } from 'src/common/interfaces/request.interface';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateReportDto, UpdateReportStatusDto } from '../dtos/report.dto';

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

  async getAdminReports(query: { status?: string; priority?: string; type?: string; search?: string }) {
    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const reports = await this.db.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        histories: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        rental: {
          select: {
            rentalId: true,
            contractCode: true,
            propertyId: true,
            ownerId: true,
            tenantId: true,
          },
        },
      },
    });

    const stats = {
      total: reports.length,
      open: reports.filter((report) => report.status === 'open').length,
      admin: reports.filter((report) => report.status === 'admin').length,
      resolved: reports.filter((report) => report.status === 'resolved').length,
      cancelRequested: reports.filter((report) => report.status === 'cancel_requested').length,
      cancelled: reports.filter((report) => report.status === 'cancelled').length,
    };

    return { reports, stats };
  }

  async getReportById(id: string) {
    const report = await this.db.report.findUnique({
      where: { id },
      include: {
        histories: {
          orderBy: { createdAt: 'desc' },
        },
        rental: {
          select: {
            rentalId: true,
            contractCode: true,
            propertyId: true,
            ownerId: true,
            tenantId: true,
            monthlyRent: true,
            depositAmount: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Không tìm thấy khiếu nại');
    }

    return report;
  }

  async createReport(dto: CreateReportDto, userId: string, role: UserRole) {
    const contract = await this.getContractForUser(dto.rentalId, userId, role);

    if (role === UserRole.ADMIN) {
      throw new BadRequestException('Admin không thể tạo khiếu nại');
    }

    const validAgainst =
      (contract.ownerId === userId && contract.tenantId === dto.againstId) ||
      (contract.tenantId === userId && contract.ownerId === dto.againstId);

    if (!validAgainst) {
      throw new BadRequestException('Đối tượng khiếu nại không hợp lệ');
    }

    const terminationAdminHandling = await this.db.contractTerminationRequest.findFirst({
      where: {
        rentalId: dto.rentalId,
        status: { in: [TerminationRequestStatus.admin_review, TerminationRequestStatus.admin_processing] },
      },
    });

    if (terminationAdminHandling) {
      throw new BadRequestException('Đang có yêu cầu chấm dứt do admin xử lý');
    }

    const adminHandling = await this.db.report.findFirst({
      where: {
        rentalId: dto.rentalId,
        status: { in: [ReportStatus.admin, ReportStatus.cancel_requested] },
      },
    });

    if (adminHandling) {
      throw new BadRequestException('Đang có khiếu nại do admin xử lý');
    }

    const report = await this.db.report.create({
      data: {
        rentalId: dto.rentalId,
        createdBy: userId,
        againstId: dto.againstId,
        type: dto.type,
        priority: dto.priority ?? ReportPriority.medium,
        status: ReportStatus.admin,
        title: dto.title,
        description: dto.description,
      },
    });

    await this.db.reportHistory.create({
      data: {
        reportId: report.id,
        action: ReportAction.SENT_TO_ADMIN,
        oldStatus: ReportStatus.open,
        newStatus: ReportStatus.admin,
        performedBy: userId,
        note: 'Tạo khiếu nại và gửi admin xử lý',
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

    if (report.status === ReportStatus.resolved || report.status === ReportStatus.cancelled) {
      throw new BadRequestException('Khiếu nại đã kết thúc');
    }

    const nextStatus = dto.status;

    if (nextStatus === ReportStatus.resolved && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Chỉ admin được đóng khiếu nại');
    }

    if (nextStatus === ReportStatus.cancelled && role === UserRole.ADMIN) {
      throw new BadRequestException('Admin không thể tự hủy khiếu nại');
    }

    if (nextStatus === ReportStatus.cancelled && report.createdBy !== userId) {
      throw new ForbiddenException('Chỉ người tạo mới được hủy khiếu nại');
    }

    if (nextStatus === ReportStatus.admin && role === UserRole.ADMIN) {
      throw new BadRequestException('Admin không thể chuyển trạng thái sang admin');
    }

    const validTransitions: Record<ReportStatus, ReportStatus[]> = {
      open: [ReportStatus.cancelled],
      admin: [ReportStatus.resolved],
      cancel_requested: [],
      resolved: [],
      cancelled: [],
      negotiating: [],
    };

    if (!validTransitions[report.status].includes(nextStatus)) {
      throw new BadRequestException('Chuyển trạng thái khiếu nại không hợp lệ');
    }

    const updated = await this.db.$transaction(async (tx) => {
      const updated = await tx.report.update({
        where: { id: reportId },
        data: {
          status: nextStatus,
          adminNote: role === UserRole.ADMIN ? dto.adminNote ?? report.adminNote : report.adminNote,
          resolvedAt: nextStatus === ReportStatus.resolved ? new Date() : report.resolvedAt,
          cancelRequested: nextStatus === ReportStatus.cancel_requested ? true : report.cancelRequested,
          cancelRequestedBy: nextStatus === ReportStatus.cancel_requested ? userId : report.cancelRequestedBy,
          cancelRequestedAt: nextStatus === ReportStatus.cancel_requested ? new Date() : report.cancelRequestedAt,
          cancelledAt: nextStatus === ReportStatus.cancelled ? new Date() : report.cancelledAt,
        },
      });

      if (updated.terminationRequestId && (nextStatus === ReportStatus.resolved || nextStatus === ReportStatus.cancelled)) {
        await tx.contractTerminationRequest.update({
          where: { terminationRequestId: updated.terminationRequestId },
          data: {
            status: TerminationRequestStatus.resolved,
            resolution: dto.terminationResolution ?? TerminationResolution.continue_contract,
            resolvedBy: userId,
            resolvedAt: new Date(),
            reviewNote: dto.adminNote ?? report.adminNote,
          },
        });
      }

      return updated;
    });

    const actionMap: Record<ReportStatus, ReportAction> = {
      open: ReportAction.CREATED,
      negotiating: ReportAction.NEGOTIATING,
      admin: ReportAction.SENT_TO_ADMIN,
      resolved: ReportAction.RESOLVED,
      cancel_requested: ReportAction.CANCEL_REQUESTED,
      cancelled: ReportAction.CANCELLED,
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

  async resolveReport(id: string, adminId: string, adminNote: string) {
    const report = await this.db.report.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundException('Không tìm thấy khiếu nại');
    }

    const [updatedReport] = await this.db.$transaction([
      this.db.report.update({
        where: { id },
        data: {
          status: ReportStatus.resolved,
          adminNote,
          resolvedAt: new Date(),
        },
      }),
      this.db.reportHistory.create({
        data: {
          reportId: id,
          action: ReportAction.RESOLVED,
          oldStatus: report.status,
          newStatus: ReportStatus.resolved,
          performedBy: adminId,
          note: adminNote,
        },
      }),
      ...(report.terminationRequestId
        ? [
            this.db.contractTerminationRequest.update({
              where: { terminationRequestId: report.terminationRequestId },
              data: {
                status: TerminationRequestStatus.resolved,
                resolution: TerminationResolution.continue_contract,
                resolvedBy: adminId,
                resolvedAt: new Date(),
                reviewNote: adminNote,
              },
            }),
          ]
        : []),
    ]);

    return updatedReport;
  }
}

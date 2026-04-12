import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';

@Injectable()
export class ReportService {
  constructor(private readonly db: DatabaseService) {}

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
      open: reports.filter((r) => r.status === 'open').length,
      negotiating: reports.filter((r) => r.status === 'negotiating').length,
      admin: reports.filter((r) => r.status === 'admin').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
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

  async resolveReport(id: string, adminId: string, adminNote: string) {
    const report = await this.db.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Không tìm thấy khiếu nại');
    }

    const oldStatus = report.status;

    const [updatedReport] = await this.db.$transaction([
      this.db.report.update({
        where: { id },
        data: {
          status: 'resolved',
          adminNote,
          resolvedAt: new Date(),
        },
      }),
      this.db.reportHistory.create({
        data: {
          reportId: id,
          action: 'RESOLVED',
          oldStatus: oldStatus,
          newStatus: 'resolved',
          performedBy: adminId,
          note: adminNote,
        },
      }),
    ]);

    return updatedReport;
  }
}

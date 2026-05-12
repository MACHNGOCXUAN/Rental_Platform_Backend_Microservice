import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { EstateClientService } from './estate-client.service';
import { ContractTemplateType } from 'generated/prisma/enums';

@Injectable()
export class TemplateContractService {

  constructor(
    private readonly db: DatabaseService,
    private readonly estateService: EstateClientService
  ) { }

  async createTemplate(data: {
    templateName: string;
    templateType: ContractTemplateType;
    templateCategory?: string;
    templateContent: string;
    templateVariables?: any;
    defaultTerms?: any;
    description?: string;
    createdBy?: string;
    isDefault?: boolean;
    isActive?: boolean;
    version?: number;
  }) {

    if (data.isDefault) {
      await this.db.contractTemplate.updateMany({ data: { isDefault: false } });
    }

    const template = await this.db.contractTemplate.create({
      data: {
        templateName: data.templateName,
        templateType: data.templateType,
        templateCategory: data.templateCategory,
        templateContent: data.templateContent,
        templateVariables: data.templateVariables,
        defaultTerms: data.defaultTerms,
        description: data.description,
        createdBy: data.createdBy,
        isDefault: Boolean(data.isDefault),
        isActive: data.isActive ?? true,
        version: data.version ?? 1
      }
    });

    return template;
  }

  async getAdminTemplates(filters?: {
    type?: string;
    status?: 'active' | 'inactive';
    search?: string;
  }) {
    return this.db.contractTemplate.findMany({
      where: {
        ...(filters?.type && filters.type !== 'all'
          ? { templateType: filters.type as ContractTemplateType }
          : {}),
        ...(filters?.status
          ? { isActive: filters.status === 'active' }
          : {}),
        ...(filters?.search
          ? {
            OR: [
              { templateName: { contains: filters.search, mode: 'insensitive' } },
              { templateCategory: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
          : {}),
      },
      orderBy: [
        { isDefault: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async getTemplates(propertyType: string) {
    const normalized = String(propertyType || '').trim().toLowerCase();
    const shouldFilter = normalized.length > 0 && normalized !== 'all';

    const baseSelect = {
      templateId: true,
      templateName: true,
      templateType: true,
      description: true,
      isDefault: true,
      version: true,
    };

    const filtered = await this.db.contractTemplate.findMany({
      where: {
        isActive: true,
        ...(shouldFilter
          ? {
            OR: [
              { templateCategory: { equals: normalized, mode: 'insensitive' } },
              { templateCategory: null },
              { templateCategory: '' },
            ],
          }
          : {}),
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" }
      ],
      select: baseSelect,
    });

    if (filtered.length > 0 || !shouldFilter) {
      return filtered;
    }

    return this.db.contractTemplate.findMany({
      where: {
        isActive: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" }
      ],
      select: baseSelect,
    });
  }

  async getTemplateById(templateId: string) {

    const template = await this.db.contractTemplate.findUnique({
      where: {
        templateId
      }
    });

    if (!template) {
      throw new NotFoundException("Template not found");
    }

    return template;
  }

  async updateTemplate(
    templateId: string,
    data: {
      templateName?: string;
      templateContent?: string;
      templateVariables?: any;
      description?: string;
    }
  ) {

    const template = await this.db.contractTemplate.findUnique({
      where: { templateId }
    });

    if (!template) {
      throw new NotFoundException("Template not found");
    }

    return this.db.contractTemplate.update({
      where: { templateId },
      data: {
        ...data,
        version: template.version + 1
      }
    });
  }

  async deactivateTemplate(templateId: string) {

    const template = await this.db.contractTemplate.findUnique({
      where: { templateId }
    });

    if (!template) {
      throw new NotFoundException("Template not found");
    }

    return this.db.contractTemplate.update({
      where: { templateId },
      data: {
        isActive: false
      }
    });
  }

  async setDefaultTemplate(templateId: string) {

    const template = await this.db.contractTemplate.findUnique({
      where: { templateId }
    });

    if (!template) {
      throw new NotFoundException("Template not found");
    }

    await this.db.contractTemplate.updateMany({
      data: {
        isDefault: false
      }
    });

    return this.db.contractTemplate.update({
      where: { templateId },
      data: {
        isDefault: true,
        isActive: true,
      }
    });
  }

  async updateTemplateStatus(templateId: string, isActive: boolean) {
    const template = await this.db.contractTemplate.findUnique({ where: { templateId } });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return this.db.contractTemplate.update({
      where: { templateId },
      data: { isActive },
    });
  }

  async getDefaultTemplate() {

    const template = await this.db.contractTemplate.findFirst({
      where: {
        isDefault: true,
        isActive: true
      }
    });

    if (!template) {
      throw new NotFoundException("Default template not found");
    }

    return template;
  }

  async getInfomationTemplate(requestId: string) {
    // 1️⃣ Lấy thông tin yêu cầu thuê nhà
    const rentalRequest = await this.db.rentalRequest.findUnique({
      where: { requestId },
    });

    if (!rentalRequest) {
      throw new NotFoundException('Không tồn tại yêu cầu thuê nhà');
    }

    // 2️⃣ Lấy thông tin tenant, owner, property song song
    const [tenant, owner, property] = await Promise.all([
      this.estateService.getUsersById(rentalRequest.tenantId),
      this.estateService.getUsersById(rentalRequest.ownerId),
      this.estateService.getPropertyDetail(rentalRequest.propertyId),
    ]);

    if (!tenant) {
      throw new NotFoundException('Không tìm thấy thông tin khách thuê');
    }
    if (!owner) {
      throw new NotFoundException('Không tìm thấy thông tin chủ nhà');
    }
    if (!property) {
      throw new NotFoundException('Không tìm thấy thông tin bất động sản');
    }

    // 3️⃣ Tính thời hạn thuê (tháng)
    const buildAddress = (profile: any) => {
      if (!profile) return '';
      const parts = [
        profile.currentAddress,
        profile.currentWard,
        profile.currentDistrict,
        profile.currentCity,
      ].filter(Boolean);
      return parts.join(', ');
    };

    let durationMonths: number | null = null;
    if (rentalRequest.startDate && rentalRequest.endDate) {
      const start = new Date(rentalRequest.startDate);
      const end = new Date(rentalRequest.endDate);
      durationMonths =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());
      if (durationMonths < 1) durationMonths = 1;
    }

    // 4️⃣ Trả về object chuẩn
    return {
      tenant: {
        id: tenant.id,
        name: tenant.fullName,
        email: tenant.email,
        phone: tenant.phone,
        idNumber: tenant.profile?.idCardNumber ?? null,
        address: buildAddress(tenant.profile),
      },
      owner: {
        id: owner.id,
        name: owner.fullName,
        email: owner.email,
        phone: owner.phone,
        idNumber: owner.profile?.idCardNumber ?? null,
        address: buildAddress(owner.profile),
      },
      property: {
        id: (property as any).id || (property as any).propertyId,
        name: property.title,
        title: property.title,
        address: property.address,
        price: property.price,
        description: property.description,
        type: property.propertyType,
        area: property.areaSqm,
        monthlyRent: property.pricePerMonth,
        depositAmount: property.depositAmount,
        electricityCostPerKwh: property.electricityCostPerKwh,
        waterCostPerM3: property.waterCostPerM3,
        internetFee: property.internetFee,
        parkingFee: property.parkingFee,
        managementFee: property.managementFee
      },
      contract: {
        id: rentalRequest.requestId,
        startDate: rentalRequest.startDate ? new Date(rentalRequest.startDate).toISOString() : null,
        endDate: rentalRequest.endDate ? new Date(rentalRequest.endDate).toISOString() : null,
        durationMonths,
        autoRenewal: rentalRequest.autoRenew ?? false,
        renewalNoticeDays: 30, // Default notice period
        holdingDepositAmount: rentalRequest.holdingDepositAmount ?? 0,
        status: rentalRequest.status,
      },
    };
  }
}

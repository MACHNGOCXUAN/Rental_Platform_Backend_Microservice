import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { CreateTerminationRequestDto, ReviewTerminationRequestDto } from '../dtos/termination.dto';
import { UserRole } from 'src/common/interfaces/request.interface';
import { EstateClientService } from './estate-client.service';

@Injectable()
export class TemplateContractService {

  constructor(
    private readonly db: DatabaseService,
    private readonly estateService: EstateClientService
  ) { }

  async createTemplate(data: {
    templateName: string;
    templateType: any;
    templateContent: string;
    templateVariables?: any;
    description?: string;
    createdBy?: string;
  }) {

    const template = await this.db.contractTemplate.create({
      data: {
        templateName: data.templateName,
        templateType: data.templateType,
        templateContent: data.templateContent,
        templateVariables: data.templateVariables,
        description: data.description,
        createdBy: data.createdBy,
        isActive: true,
        version: 1
      }
    });

    return template;
  }

  async getTemplates(propertyType: string) {
    return this.db.contractTemplate.findMany({
      where: {
        isActive: true,
        templateCategory: propertyType
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" }
      ],
      select: {
        templateId: true,
        templateName: true,
        templateType: true,
        description: true,
        isDefault: true,
        version: true
      }
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
        isDefault: true
      }
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

    // 3️⃣ Trả về object chuẩn
    return {
      tenant: {
        id: tenant.id,
        name: tenant.fullName,
        email: tenant.email,
        phone: tenant.phone,
        idNumber: tenant.profile?.idCardNumber ?? null,
      },
      owner: {
        id: owner.id,
        name: owner.fullName,
        email: owner.email,
        phone: owner.phone,
        idNumber: owner.profile?.idCardNumber ?? null,
      },
      property: {
        id: property.id,
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
        startDate: rentalRequest.startDate,
        endDate: rentalRequest.endDate,
        status: rentalRequest.status,
      },
    };
  }
}

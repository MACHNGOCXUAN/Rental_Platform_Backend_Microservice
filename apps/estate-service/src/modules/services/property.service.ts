import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import {
    ApprovalStatus,
    PropertyStatus,
    ImageType,
    AmenityCategory,
    PropertyType,
} from 'generated/prisma/enums';
import { CreatePropertyDto } from '../dtos/property.dto';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PropertyService {
    constructor(
        private readonly db: DatabaseService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy
    ) { }

    async createProperty(dto: CreatePropertyDto, landlordId: string) {
        const result = await this.db.$transaction(async (prisma) => {
            const property = await prisma.property.create({
                data: {
                    landlordId,
                    title: dto.title,
                    description: dto.description,
                    propertyType: dto.propertyType,
                    pricePerMonth: dto.pricePerMonth,
                    depositAmount: dto.depositAmount,
                    depositMonths: dto.depositMonths,

                    address: dto.address,
                    ward: dto.ward,
                    district: dto.district,
                    city: dto.city,
                    latitude: dto.latitude,
                    longitude: dto.longitude,

                    areaSqm: dto.areaSqm,
                    bedrooms: dto.bedrooms ?? 0,
                    bathrooms: dto.bathrooms ?? 0,
                    floorNumber: dto.floorNumber,
                    totalFloors: dto.totalFloors,

                    furnitureStatus: dto.furnitureStatus,

                    parkingFee: dto.parkingFee,
                    managementFee: dto.managementFee,
                    electricityCostPerKwh: dto.electricityCostPerKwh,
                    waterCostPerM3: dto.waterCostPerM3,

                    minimumLeaseMonths: dto.minimumLeaseMonths ?? 6,
                    maximumLeaseMonths: dto.maximumLeaseMonths,
                    availableFrom: dto.availableFrom
                        ? new Date(dto.availableFrom)
                        : null,

                    hasFireCertificate: dto.hasFireCertificate,

                    status: dto.status,
                    approvalStatus: ApprovalStatus.pending,
                },
            });

            if (dto.images?.length) {
                console.log("xjhjhj: ", dto.images.length);

                await prisma.propertyImage.createMany({
                    data: dto.images.map((img, index) => ({
                        propertyId: property.propertyId,
                        uri: img.uri,
                        isPrimary: img.isPrimary,
                    })),
                });
            }

            if (dto.videos?.length) {
                await prisma.propertyVideo.createMany({
                    data: dto.videos.map((video) => ({
                        propertyId: property.propertyId,
                        uri: video.uri,
                    })),
                });
            }

            if (dto.amenities?.length) {
                await prisma.propertyAmenity.createMany({
                    data: dto.amenities.map((name) => ({
                        propertyId: property.propertyId,
                        name: name
                    })),
                    skipDuplicates: true,
                });
            }

            if (dto.rules?.length) {
                await prisma.propertyRule.createMany({
                    data: dto.rules.map((rule) => ({
                        propertyId: property.propertyId,
                        text: rule.text,
                        order: rule.order
                    })),
                });
            }

            return property

        });

        if (result.status === PropertyStatus.pending_approval) {
            this.rabbitClient.emit('property.created', {
                property: result.propertyId,
                landlordId: result.landlordId,
                status: result.status,
            });
        }

        return {
            message: 'Property created successfully',
            propertyId: result.propertyId,
        };
    }

    async getPostStatusCounts(userId: string) {
        const PROPERTY_STATUS_ORDER: PropertyStatus[] = [
            'active',
            'rented',
            'pending_approval',
            'draft',
            'maintenance',
            'inactive',
            'rejected',
        ];


        const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
            active: 'Đang hiển thị',
            rented: 'Đã cho thuê',
            pending_approval: 'Chờ duyệt',
            draft: 'Bản nháp',
            maintenance: 'Đang bảo trì',
            inactive: 'Đã ẩn',
            rejected: 'Bị từ chối',
        };

        const result = await this.db.property.groupBy({
            by: ['status'],
            where: {
                landlordId: userId,
            },
            _count: {
                status: true,
            },
        });

        return PROPERTY_STATUS_ORDER.map((status) => {
            const found = result.find(r => r.status === status);

            return {
                id: status,
                label: PROPERTY_STATUS_LABEL[status],
                count: found?._count.status ?? 0,
            };
        });
    }


    async getPropertiesByStatus(
        status: PropertyStatus,
        userId: string
    ) {
        const properties = await this.db.property.findMany({
            where: {
                landlordId: userId,
                status: status,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                propertyId: true,
                title: true,
                description: true,
                propertyType: true,
                pricePerMonth: true,
                address: true,
                ward: true,
                district: true,
                city: true,
                areaSqm: true,
                bedrooms: true,
                bathrooms: true,
                status: true,
                createdAt: true,
                viewCount: true,
                images: {
                    select: {
                        id: true,
                        uri: true,
                        isPrimary: true,
                    },
                    orderBy: {
                        isPrimary: 'desc',
                    },
                },
            },
        });

        return properties.map((item) => ({
            propertyId: item.propertyId,
            title: item.title,
            description: item.description,
            propertyType: item.propertyType,
            pricePerMonth: item.pricePerMonth?.toString(),
            address: item.address,
            ward: item.ward,
            district: item.district,
            city: item.city,
            areaSqm: item.areaSqm?.toString(),
            bedrooms: item.bedrooms?.toString(),
            bathrooms: item.bathrooms?.toString(),
            status: item.status,
            createdAt: item.createdAt.toISOString().split('T')[0],
            viewCount: item.viewCount ?? 0,
            images: item.images.map((img) => ({
                id: img.id,
                uri: img.uri,
                isPrimary: img.isPrimary,
            })),
        }));
    }


    async getPropertyId(propertyId: string, landlordId: string) {
        const property = await this.db.property.findFirst({
            where: {
                propertyId,
                landlordId,
            },
            include: {
                images: true,
                videos: true,
                amenities: true,
                rules: {
                    orderBy: { order: 'asc' },
                },
            },
        });

        if (!property) {
            throw new NotFoundException('Property not found');
        }

        return this.mapToPropertyFormData(property);
    }

    private mapToPropertyFormData(property: any) {
        return {
            propertyId: property.propertyId,

            // Thông tin cơ bản
            title: property.title ?? '',
            description: property.description ?? '',
            propertyType: property.propertyType,
            listingType: property.listingType,
            pricePerMonth: property.pricePerMonth ? Number(property.pricePerMonth) : 0,
            depositAmount: property.depositAmount ? Number(property.depositAmount) : 0,
            depositMonths: property.depositMonths ?? 0,

            // Vị trí
            address: property.address ?? '',
            ward: property.ward ?? '',
            district: property.district ?? '',
            city: property.city ?? '',
            country: 'Việt Nam',

            latitude: property.latitude ? Number(property.latitude) : 0,
            longitude: property.longitude ? Number(property.longitude) : 0,

            availableFrom: property.availableFrom
                ? property.availableFrom.toISOString()
                : '',

            // Chi tiết BĐS
            maximumLeaseMonths: property.maximumLeaseMonths?.toString() ?? '',
            minimumLeaseMonths: property.minimumLeaseMonths?.toString() ?? '',

            areaSqm: property.areaSqm ? Number(property.areaSqm) : 0,

            bedrooms: property.bedrooms?.toString() ?? '',
            bathrooms: property.bathrooms?.toString() ?? '',
            livingRooms: property.livingRooms?.toString() ?? '',
            kitchens: property.kitchens?.toString() ?? '',
            balconies: property.balconies?.toString() ?? '',

            floorNumber: property.floorNumber?.toString() ?? '',
            totalFloors: property.totalFloors?.toString() ?? '',

            furnitureStatus: property.furnitureStatus,
            ownershipType: property.ownershipType,

            parkingFee: property.parkingFee?.toString() ?? '',
            managementFee: property.managementFee?.toString() ?? '',
            electricityCostPerKwh: property.electricityCostPerKwh?.toString() ?? '',
            waterCostPerM3: property.waterCostPerM3?.toString() ?? '',

            hasFireCertificate: property.hasFireCertificate ?? false,

            // Media
            images: property.images.map(img => ({
                id: img.id,
                uri: img.uri,
                isPrimary: img.isPrimary,
            })),

            videos: property.videos.map(video => ({
                id: video.id,
                uri: video.uri,
                thumbnail: video.thumbnail,
                duration: video.duration,
            })),

            // Tiện ích & quy định
            amenities: property.amenities.map(a => a.name),
            rules: property.rules.map(r => ({
                text: r.text,
                order: r.order,
            })),

            status: property.status,
            approvalStatus: property.approvalStatus,
        };
    }

    async updateProperty(
        propertyId: string,
        dto: CreatePropertyDto,
        landlordId: string,
    ) {
        const result = await this.db.$transaction(async (prisma) => {
            const existingProperty = await prisma.property.findFirst({
                where: {
                    propertyId,
                    landlordId,
                },
            });

            if (!existingProperty) {
                throw new NotFoundException('Property not found or access denied');
            }

            const property = await prisma.property.update({
                where: { propertyId },
                data: {
                    title: dto.title,
                    description: dto.description,
                    propertyType: dto.propertyType,
                    pricePerMonth: dto.pricePerMonth,
                    depositAmount: dto.depositAmount,
                    depositMonths: dto.depositMonths,

                    address: dto.address,
                    ward: dto.ward,
                    district: dto.district,
                    city: dto.city,
                    latitude: dto.latitude,
                    longitude: dto.longitude,

                    areaSqm: dto.areaSqm,
                    bedrooms: dto.bedrooms,
                    bathrooms: dto.bathrooms,
                    floorNumber: dto.floorNumber,
                    totalFloors: dto.totalFloors,

                    furnitureStatus: dto.furnitureStatus,

                    parkingFee: dto.parkingFee,
                    managementFee: dto.managementFee,
                    electricityCostPerKwh: dto.electricityCostPerKwh,
                    waterCostPerM3: dto.waterCostPerM3,

                    minimumLeaseMonths: dto.minimumLeaseMonths,
                    maximumLeaseMonths: dto.maximumLeaseMonths,
                    availableFrom: dto.availableFrom
                        ? new Date(dto.availableFrom)
                        : undefined,

                    hasFireCertificate: dto.hasFireCertificate,
                    status: PropertyStatus.pending_approval,
                    approvalStatus: ApprovalStatus.pending,
                },
            });

            if (dto.images) {
                await prisma.propertyImage.deleteMany({
                    where: { propertyId },
                });

                if (dto.images.length) {
                    await prisma.propertyImage.createMany({
                        data: dto.images.map((img) => ({
                            propertyId,
                            uri: img.uri,
                            isPrimary: img.isPrimary,
                        })),
                    });
                }
            }

            if (dto.videos) {
                await prisma.propertyVideo.deleteMany({
                    where: { propertyId },
                });

                if (dto.videos.length) {
                    await prisma.propertyVideo.createMany({
                        data: dto.videos.map((video) => ({
                            propertyId,
                            uri: video.uri,
                        })),
                    });
                }
            }

            if (dto.amenities) {
                await prisma.propertyAmenity.deleteMany({
                    where: { propertyId },
                });

                if (dto.amenities.length) {
                    await prisma.propertyAmenity.createMany({
                        data: dto.amenities.map((name) => ({
                            propertyId,
                            name,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            if (dto.rules) {
                await prisma.propertyRule.deleteMany({
                    where: { propertyId },
                });

                if (dto.rules.length) {
                    await prisma.propertyRule.createMany({
                        data: dto.rules.map((rule) => ({
                            propertyId,
                            text: rule.text,
                            order: rule.order,
                        })),
                    });
                }
            }

            return property;
        });

        if (result.approvalStatus === ApprovalStatus.pending) {
            this.rabbitClient.emit('property.created', {
                propertyId: result.propertyId,
                landlordId: result.landlordId,
                status: result.approvalStatus,
            });
        }

        return {
            message: 'Property updated successfully',
            propertyId: result.propertyId,
        };
    }

    async getPropertiesForAdmin(
        page = 1,
        limit = 10,
        approvalStatus?: ApprovalStatus,
        search?: string,
    ) {
        page = Number(page) > 0 ? Number(page) : 1;
        limit = Number(limit) > 0 ? Number(limit) : 10;

        const where: any = {
            deletedAt: null,
        };

        if (approvalStatus) {
            where.approvalStatus = approvalStatus;
        }

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [totalCount, properties] = await Promise.all([
            this.db.property.count({ where }),
            this.db.property.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    propertyId: true,
                    title: true,
                    description: true,
                    propertyType: true,
                    pricePerMonth: true,
                    address: true,
                    ward: true,
                    district: true,
                    city: true,
                    status: true,
                    approvalStatus: true,
                    createdAt: true,

                    areaSqm: true,
                    bedrooms: true,
                    bathrooms: true,
                    kitchens: true,
                    livingRooms: true,
                    balconies: true,
                    floorNumber: true,
                    totalFloors: true,
                    managementFee: true,
                    hasFireCertificate: true,
                    furnitureStatus: true,

                    landlord: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            phone: true,
                        },
                    },
                    images: {
                        select: {
                            id: true,
                            uri: true,
                            isPrimary: true,
                        },
                        orderBy: { isPrimary: 'desc' },
                    },
                },
            }),
        ]);

        return {
            totalCount,
            page,
            limit,
            properties: properties.map((item) => {
                const base = {
                    propertyId: item.propertyId,
                    title: item.title,
                    description: item.description,
                    propertyType: item.propertyType,
                    pricePerMonth: item.pricePerMonth?.toString(),
                    address: item.address,
                    ward: item.ward,
                    district: item.district,
                    city: item.city,
                    status: item.status,
                    approvalStatus: item.approvalStatus,
                    createdAt: item.createdAt.toISOString().split('T')[0],
                    landlord: item.landlord,
                    images: item.images,
                };

                let detail: any = {};

                switch (item.propertyType) {
                    case PropertyType.room:
                        detail = {
                            areaSqm: item.areaSqm?.toString(),
                            bathrooms: item.bathrooms,
                            kitchens: item.kitchens,
                            furnitureStatus: item.furnitureStatus,
                        };
                        break;

                    case PropertyType.apartment:
                        detail = {
                            areaSqm: item.areaSqm?.toString(),
                            bedrooms: item.bedrooms,
                            bathrooms: item.bathrooms,
                            livingRooms: item.livingRooms,
                            balconies: item.balconies,
                            floorNumber: item.floorNumber,
                            totalFloors: item.totalFloors,
                        };
                        break;

                    case PropertyType.house:
                        detail = {
                            areaSqm: item.areaSqm?.toString(),
                            bedrooms: item.bedrooms,
                            bathrooms: item.bathrooms,
                            totalFloors: item.totalFloors,
                        };
                        break;

                    case PropertyType.office:
                        detail = {
                            areaSqm: item.areaSqm?.toString(),
                            floorNumber: item.floorNumber,
                            managementFee: item.managementFee?.toString(),
                            hasFireCertificate: item.hasFireCertificate,
                        };
                        break;

                    case PropertyType.land:
                        detail = {
                            areaSqm: item.areaSqm?.toString(),
                        };
                        break;
                }

                return {
                    ...base,
                    ...detail,
                };
            }),
        };
    }

    async approveProperty(propertyId: string, approve: boolean, rejectionReason?: string) {
        const property = await this.db.property.findUnique({
            where: { propertyId },
        });
        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }
        await this.db.property.update({
            where: { propertyId },
            data: {
                approvalStatus: approve ? ApprovalStatus.approved : ApprovalStatus.rejected,
                status: approve ? PropertyStatus.active : PropertyStatus.rejected,
                rejectionReason: approve ? null : rejectionReason,
            },
        });

        if (approve) {
            this.rabbitClient.emit('property.approved', {
                propertyId: property.propertyId,
                landlordId: property.landlordId,
            });
        } else {
            this.rabbitClient.emit('property.rejected', {
                propertyId: property.propertyId,
                landlordId: property.landlordId,
                reason: rejectionReason,
            });
        }

        
        return {
            message: `Bất động sản đã được ${approve ? 'duyệt' : 'từ chối'} thành công`,
            propertyId,
        };
    }
}
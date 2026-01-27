import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import {
    ApprovalStatus,
    PropertyStatus,
    ImageType,
    AmenityCategory,
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


}



import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import {
    ApprovalStatus,
    PropertyStatus,
    ImageType,
    AmenityCategory,
    PropertyType,
} from 'generated/prisma/enums';
import { CreatePropertyDto, PropertyContractAction, SearchPropertyDto } from '../dtos/property.dto';
import { InstantSearchDto } from '../dtos/instant-search.dto';
import { ClientProxy } from '@nestjs/microservices';
import { getSearchTerms, buildSearchWhere } from 'src/common/utils/search.util';

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
            // Lấy email chủ nhà để gửi thông báo email
            const landlord = await this.db.user.findUnique({
                where: { id: result.landlordId },
                select: { email: true, fullName: true },
            });
            this.rabbitClient.emit('property.created', {
                propertyId: result.propertyId,
                landlordId: result.landlordId,
                landlordEmail: landlord?.email,
                landlordName: landlord?.fullName,
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
            const landlord = await this.db.user.findUnique({
                where: { id: result.landlordId },
                select: { email: true, fullName: true },
            });
            this.rabbitClient.emit('property.created', {
                propertyId: result.propertyId,
                landlordId: result.landlordId,
                landlordEmail: landlord?.email,
                landlordName: landlord?.fullName,
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
            include: { landlord: { select: { email: true, fullName: true } } },
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
                landlordEmail: property.landlord?.email,
                landlordName: property.landlord?.fullName,
            });
        } else {
            this.rabbitClient.emit('property.rejected', {
                propertyId: property.propertyId,
                landlordId: property.landlordId,
                landlordEmail: property.landlord?.email,
                landlordName: property.landlord?.fullName,
                reason: rejectionReason,
            });
        }


        return {
            message: `Bất động sản đã được ${approve ? 'duyệt' : 'từ chối'} thành công`,
            propertyId,
        };
    }

    async batchApproveProperties(propertyIds: string[], approve: boolean, rejectionReason?: string) {
        if (!propertyIds || propertyIds.length === 0) {
            return { message: 'Không có bất động sản nào để cập nhật', count: 0 };
        }

        const properties = await this.db.property.findMany({
            where: { propertyId: { in: propertyIds } },
            include: { landlord: { select: { email: true, fullName: true } } },
        });

        if (properties.length === 0) {
            return { message: 'Không tìm thấy bất động sản nào', count: 0 };
        }

        await this.db.property.updateMany({
            where: { propertyId: { in: propertyIds } },
            data: {
                approvalStatus: approve ? ApprovalStatus.approved : ApprovalStatus.rejected,
                status: approve ? PropertyStatus.active : PropertyStatus.rejected,
                rejectionReason: approve ? null : rejectionReason,
            },
        });

        properties.forEach(property => {
            if (approve) {
                this.rabbitClient.emit('property.approved', {
                    propertyId: property.propertyId,
                    landlordId: property.landlordId,
                    landlordEmail: property.landlord?.email,
                    landlordName: property.landlord?.fullName,
                });
            } else {
                this.rabbitClient.emit('property.rejected', {
                    propertyId: property.propertyId,
                    landlordId: property.landlordId,
                    landlordEmail: property.landlord?.email,
                    landlordName: property.landlord?.fullName,
                    reason: rejectionReason,
                });
            }
        });

        return {
            message: `Đã ${approve ? 'duyệt' : 'từ chối'} ${properties.length} bất động sản thành công`,
            count: properties.length,
        };
    }

    async updatePropertyVisibility(propertyId: string, visible: boolean, actorId?: string) {
        const property = await this.db.property.findUnique({
            where: { propertyId },
            select: {
                propertyId: true,
                landlordId: true,
                approvalStatus: true,
                status: true,
            },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }

        if (actorId && property.landlordId !== actorId) {
            throw new ForbiddenException('Bạn không có quyền cập nhật tin đăng này');
        }

        if (property.approvalStatus !== ApprovalStatus.approved) {
            throw new BadRequestException('Chỉ có thể ẩn/hiện tin đã được duyệt');
        }

        if (property.status !== PropertyStatus.active && property.status !== PropertyStatus.inactive) {
            throw new BadRequestException('Tin hiện tại không ở trạng thái có thể ẩn/hiện');
        }

        const nextStatus = visible ? PropertyStatus.active : PropertyStatus.inactive;

        if (property.status === nextStatus) {
            return {
                message: visible ? 'Tin đã ở trạng thái hiển thị' : 'Tin đã ở trạng thái ẩn',
                propertyId,
                status: property.status,
            };
        }

        const updated = await this.db.property.update({
            where: { propertyId },
            data: { status: nextStatus },
            select: {
                propertyId: true,
                status: true,
            },
        });

        return {
            message: visible ? 'Hiện tin thành công' : 'Ẩn tin thành công',
            propertyId: updated.propertyId,
            status: updated.status,
        };
    }

    async updatePropertyStatusByContract(
        propertyId: string,
        action: PropertyContractAction,
        contractId?: string,
    ) {
        const property = await this.db.property.findUnique({
            where: { propertyId },
            select: {
                propertyId: true,
                status: true,
                approvalStatus: true,
            },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }

        if (property.approvalStatus !== ApprovalStatus.approved) {
            throw new BadRequestException('Bất động sản chưa được duyệt');
        }

        let nextStatus: PropertyStatus;
        if (action === 'contract_active') {
            if (
                property.status !== PropertyStatus.active &&
                property.status !== PropertyStatus.rented &&
                property.status !== PropertyStatus.inactive
            ) {
                throw new BadRequestException('Tin không ở trạng thái có thể chuyển sang đã thuê');
            }
            nextStatus = PropertyStatus.rented;
        } else {
            if (
                property.status !== PropertyStatus.rented &&
                property.status !== PropertyStatus.active &&
                property.status !== PropertyStatus.inactive
            ) {
                throw new BadRequestException('Tin không ở trạng thái có thể trả về đang hoạt động');
            }
            nextStatus = PropertyStatus.active;
        }

        if (property.status === nextStatus) {
            return {
                message: 'Trạng thái bất động sản đã được cập nhật trước đó',
                propertyId: property.propertyId,
                status: property.status,
                contractId,
            };
        }

        const updated = await this.db.property.update({
            where: { propertyId },
            data: { status: nextStatus },
            select: { propertyId: true, status: true },
        });

        return {
            message: 'Cập nhật trạng thái bất động sản thành công',
            propertyId: updated.propertyId,
            status: updated.status,
            contractId,
        };
    }

    async getFavoriteStatus(userId: string, propertyId: string) {
        const found = await this.db.favorite.findUnique({
            where: {
                userId_propertyId: {
                    userId,
                    propertyId,
                },
            },
            select: { favoriteId: true },
        });

        return {
            propertyId,
            isFavorited: !!found,
        };
    }

    async addFavorite(userId: string, propertyId: string) {
        const property = await this.db.property.findFirst({
            where: {
                propertyId,
                deletedAt: null,
                approvalStatus: ApprovalStatus.approved,
                status: PropertyStatus.active,
            },
            select: { propertyId: true },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản để lưu');
        }

        const existing = await this.db.favorite.findUnique({
            where: {
                userId_propertyId: {
                    userId,
                    propertyId,
                },
            },
            select: { favoriteId: true },
        });

        if (!existing) {
            await this.db.$transaction([
                this.db.favorite.create({
                    data: {
                        userId,
                        propertyId,
                    },
                }),
                this.db.property.update({
                    where: { propertyId },
                    data: {
                        favoriteCount: { increment: 1 },
                    },
                }),
            ]);
        }

        return {
            message: 'Đã lưu tin yêu thích',
            propertyId,
            isFavorited: true,
        };
    }

    async removeFavorite(userId: string, propertyId: string) {
        const deleted = await this.db.favorite.deleteMany({
            where: {
                userId,
                propertyId,
            },
        });

        if (deleted.count > 0) {
            await this.db.property.update({
                where: { propertyId },
                data: {
                    favoriteCount: { decrement: 1 },
                },
            });
        }

        return {
            message: 'Đã bỏ lưu tin yêu thích',
            propertyId,
            isFavorited: false,
        };
    }

    async getFavoriteProperties(userId: string, page = 1, limit = 20) {
        const safePage = Number.isFinite(page) && page > 0 ? page : 1;
        const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20;
        const skip = (safePage - 1) * safeLimit;

        const where = {
            userId,
            property: {
                deletedAt: null,
                approvalStatus: ApprovalStatus.approved,
                status: PropertyStatus.active,
            },
        };

        const [total, favorites] = await Promise.all([
            this.db.favorite.count({ where }),
            this.db.favorite.findMany({
                where,
                skip,
                take: safeLimit,
                orderBy: { createdAt: 'desc' },
                include: {
                    property: {
                        select: {
                            propertyId: true,
                            title: true,
                            description: true,
                            propertyType: true,
                            pricePerMonth: true,
                            address: true,
                            district: true,
                            city: true,
                            areaSqm: true,
                            bedrooms: true,
                            bathrooms: true,
                            furnitureStatus: true,
                            createdAt: true,
                            favoriteCount: true,
                            landlord: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    avatarUrl: true,
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
                                take: 3,
                            },
                        },
                    },
                },
            }),
        ]);

        return {
            items: favorites.map((item) => ({
                id: item.property.propertyId,
                title: item.property.title,
                description: item.property.description ?? '',
                propertyType: item.property.propertyType,
                pricePerMonth: Number(item.property.pricePerMonth ?? 0),
                address: item.property.address,
                district: item.property.district,
                city: item.property.city,
                areaSqm: Number(item.property.areaSqm ?? 0),
                bedrooms: item.property.bedrooms ?? 0,
                bathrooms: item.property.bathrooms ?? 0,
                furnitureStatus: item.property.furnitureStatus,
                createdAt: item.property.createdAt.toISOString(),
                favoriteCount: item.property.favoriteCount ?? 0,
                isFavorited: true,
                user: {
                    id: item.property.landlord.id,
                    fullName: item.property.landlord.fullName ?? '',
                    avatarUrl: item.property.landlord.avatarUrl ?? '',
                    phone: item.property.landlord.phone
                        ? item.property.landlord.phone.slice(0, -3) + '***'
                        : '',
                },
                images: item.property.images,
            })),
            meta: {
                page: safePage,
                limit: safeLimit,
                total,
                totalPages: Math.ceil(total / safeLimit),
            },
        };
    }

    // ─────────────────────────────────────────────────────
    // PUBLIC: Cursor-based search (Keyset Pagination)
    // Index: CREATE INDEX idx_properties_cursor ON properties(created_at DESC, property_id DESC);
    // ─────────────────────────────────────────────────────
    async searchProperties(dto: SearchPropertyDto) {
        const limit = dto.limit ?? 20;
        const sortBy = dto.sortBy ?? 'newest';

        // Build WHERE clause
        const where: any = {
            deletedAt: null,
            status: PropertyStatus.active,
            approvalStatus: ApprovalStatus.approved,
        };

        if (dto.keyword) {
            const searchClause = buildSearchWhere(dto.keyword);
            if (searchClause) {
                where.AND = [...(where.AND || []), searchClause];
            }
        }

        if (dto.propertyType) where.propertyType = dto.propertyType;
        if (dto.city) where.city = { contains: dto.city, mode: 'insensitive' };
        if (dto.district) where.district = { contains: dto.district, mode: 'insensitive' };
        if (dto.bedrooms !== undefined) where.bedrooms = dto.bedrooms;

        if (dto.priceMin !== undefined || dto.priceMax !== undefined) {
            where.pricePerMonth = {};
            if (dto.priceMin !== undefined) where.pricePerMonth.gte = dto.priceMin;
            if (dto.priceMax !== undefined && dto.priceMax > 0) where.pricePerMonth.lte = dto.priceMax;
        }

        if (dto.areaMin !== undefined || dto.areaMax !== undefined) {
            where.areaSqm = {};
            if (dto.areaMin !== undefined) where.areaSqm.gte = dto.areaMin;
            if (dto.areaMax !== undefined) where.areaSqm.lte = dto.areaMax;
        }

        // Determine ORDER BY based on sortBy
        let orderBy: any[] = [{ createdAt: 'desc' }, { propertyId: 'desc' }];
        if (sortBy === 'oldest') orderBy = [{ createdAt: 'asc' }, { propertyId: 'asc' }];
        else if (sortBy === 'price_asc') orderBy = [{ pricePerMonth: 'asc' }, { propertyId: 'asc' }];
        else if (sortBy === 'price_desc') orderBy = [{ pricePerMonth: 'desc' }, { propertyId: 'desc' }];
        else if (sortBy === 'area_asc') orderBy = [{ areaSqm: 'asc' }, { propertyId: 'asc' }];
        else if (sortBy === 'area_desc') orderBy = [{ areaSqm: 'desc' }, { propertyId: 'desc' }];

        // Determine pagination mode: offset-based (page) vs cursor-based
        const useOffsetPagination = dto.page != null && dto.page >= 1;
        const skip = useOffsetPagination ? (dto.page! - 1) * limit : undefined;

        // Decode cursor (only when NOT using offset pagination)
        if (!useOffsetPagination && dto.cursor) {
            try {
                const decoded = JSON.parse(Buffer.from(dto.cursor, 'base64').toString('utf-8'));

                if (sortBy === 'newest') {
                    where.AND = [
                        {
                            OR: [
                                { createdAt: { lt: new Date(decoded.createdAt) } },
                                {
                                    createdAt: { equals: new Date(decoded.createdAt) },
                                    propertyId: { lt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'oldest') {
                    where.AND = [
                        {
                            OR: [
                                { createdAt: { gt: new Date(decoded.createdAt) } },
                                {
                                    createdAt: { equals: new Date(decoded.createdAt) },
                                    propertyId: { gt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'price_asc') {
                    where.AND = [
                        {
                            OR: [
                                { pricePerMonth: { gt: decoded.price } },
                                {
                                    pricePerMonth: { equals: decoded.price },
                                    propertyId: { gt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'price_desc') {
                    where.AND = [
                        {
                            OR: [
                                { pricePerMonth: { lt: decoded.price } },
                                {
                                    pricePerMonth: { equals: decoded.price },
                                    propertyId: { lt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'area_asc') {
                    where.AND = [
                        {
                            OR: [
                                { areaSqm: { gt: decoded.area } },
                                {
                                    areaSqm: { equals: decoded.area },
                                    propertyId: { gt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'area_desc') {
                    where.AND = [
                        {
                            OR: [
                                { areaSqm: { lt: decoded.area } },
                                {
                                    areaSqm: { equals: decoded.area },
                                    propertyId: { lt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                }
            } catch {
                // Invalid cursor → ignore, start from beginning
            }
        }

        // Fetch limit+1 to detect hasMore
        const countWhere = { ...where, AND: undefined };
        const [totalCount, items] = await Promise.all([
            this.db.property.count({ where: countWhere }),
            this.db.property.findMany({
                where,
                orderBy,
                take: limit + 1,
                ...(skip != null ? { skip } : {}),
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
                    furnitureStatus: true,
                    createdAt: true,
                    viewCount: true,
                    landlord: {
                        select: {
                            id: true,
                            fullName: true,
                            avatarUrl: true,
                            phone: true,
                        },
                    },
                    images: {
                        select: { id: true, uri: true, isPrimary: true },
                        orderBy: { isPrimary: 'desc' },
                        take: 4,
                    },
                },
            }),
        ]);

        const hasMore = items.length > limit;
        const data = hasMore ? items.slice(0, limit) : items;

        // Build next cursor from last item
        let nextCursor: string | null = null;
        if (hasMore && data.length > 0) {
            const last = data[data.length - 1];
            const cursorPayload: any = {
                createdAt: last.createdAt.toISOString(),
                propertyId: last.propertyId,
            };
            if (sortBy === 'price_asc' || sortBy === 'price_desc') {
                cursorPayload.price = last.pricePerMonth ? Number(last.pricePerMonth) : 0;
            }
            if (sortBy === 'area_asc' || sortBy === 'area_desc') {
                cursorPayload.area = last.areaSqm ? Number(last.areaSqm) : 0;
            }
            nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64');
        }

        return {
            data: data.map((item) => ({
                id: item.propertyId,
                title: item.title,
                description: item.description ?? '',
                propertyType: item.propertyType,
                pricePerMonth: Number(item.pricePerMonth ?? 0),
                address: item.address,
                ward: item.ward,
                district: item.district,
                city: item.city,
                areaSqm: Number(item.areaSqm ?? 0),
                bedrooms: item.bedrooms ?? 0,
                bathrooms: item.bathrooms ?? 0,
                furnitureStatus: item.furnitureStatus,
                createdAt: item.createdAt.toISOString(),
                viewCount: item.viewCount ?? 0,
                user: {
                    id: item.landlord.id,
                    fullName: item.landlord.fullName ?? '',
                    avatarUrl: item.landlord.avatarUrl ?? '',
                    phone: item.landlord.phone
                        ? item.landlord.phone.slice(0, -3) + '***'
                        : '',
                },
                images: item.images,
            })),
            nextCursor,
            hasMore,
            total: totalCount,
        };
    }

    // ─────────────────────────────────────────────────────
    // PUBLIC: Instant search for AI search agent (fast, limit 5)
    // ─────────────────────────────────────────────────────
    async instantSearch(dto: InstantSearchDto) {
        const where: any = {
            deletedAt: null,
            status: PropertyStatus.active,
            approvalStatus: ApprovalStatus.approved,
        };

        const filters = dto.filters || {};

        // Apply keyword search (from AI-extracted keyword or raw query)
        const searchText = (filters as any).keyword || dto.q;
        if (searchText) {
            const searchClause = buildSearchWhere(searchText);
            if (searchClause) {
                where.AND = [...(where.AND || []), searchClause];
            }
        }

        // Apply structured filters from AI
        if ((filters as any).propertyType) where.propertyType = (filters as any).propertyType;
        if ((filters as any).city) where.city = { contains: (filters as any).city, mode: 'insensitive' };
        if ((filters as any).district) where.district = { contains: (filters as any).district, mode: 'insensitive' };
        if ((filters as any).bedrooms !== undefined && (filters as any).bedrooms !== null) {
            where.bedrooms = (filters as any).bedrooms;
        }

        if ((filters as any).priceMin !== undefined || (filters as any).priceMax !== undefined) {
            where.pricePerMonth = {};
            if ((filters as any).priceMin !== undefined && (filters as any).priceMin !== null) {
                where.pricePerMonth.gte = (filters as any).priceMin;
            }
            if ((filters as any).priceMax !== undefined && (filters as any).priceMax !== null && (filters as any).priceMax > 0) {
                where.pricePerMonth.lte = (filters as any).priceMax;
            }
        }

        const items = await this.db.property.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }],
            take: 5,
            select: {
                propertyId: true,
                title: true,
                propertyType: true,
                pricePerMonth: true,
                address: true,
                district: true,
                city: true,
                areaSqm: true,
                bedrooms: true,
                bathrooms: true,
                images: {
                    select: { id: true, uri: true, isPrimary: true },
                    orderBy: { isPrimary: 'desc' },
                    take: 1,
                },
            },
        });

        return {
            data: items.map((item) => ({
                id: item.propertyId,
                title: item.title,
                propertyType: item.propertyType,
                pricePerMonth: Number(item.pricePerMonth ?? 0),
                address: item.address,
                district: item.district,
                city: item.city,
                areaSqm: Number(item.areaSqm ?? 0),
                bedrooms: item.bedrooms ?? 0,
                bathrooms: item.bathrooms ?? 0,
                images: item.images,
            })),
        };
    }

    // ─────────────────────────────────────────────────────
    // PUBLIC: Property detail by ID (increments viewCount)
    // ─────────────────────────────────────────────────────
    async getPublicProperty(propertyId: string) {
        // Guard: extract UUID if a full slug was accidentally passed
        const uuidMatch = propertyId.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
        const resolvedId = uuidMatch ? uuidMatch[1] : propertyId;

        const property = await this.db.property.findFirst({
            where: {
                propertyId: resolvedId,
                deletedAt: null,
                status: {
                    in: [PropertyStatus.active, PropertyStatus.rented, PropertyStatus.inactive, PropertyStatus.pending_approval, PropertyStatus.rejected],
                },
                approvalStatus: {
                    in: [ApprovalStatus.approved, ApprovalStatus.pending, ApprovalStatus.rejected]
                }
            },
            include: {
                images: { orderBy: { isPrimary: 'desc' } },
                videos: true,
                amenities: true,
                rules: { orderBy: { order: 'asc' } },
                reviews: {
                    where: { isPublic: true },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    include: {
                        reviewer: {
                            select: {
                                id: true,
                                fullName: true,
                                avatarUrl: true,
                            },
                        },
                    },
                },
                landlord: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true,
                        phone: true,
                        createdAt: true,
                        _count: {
                            select: { propertiesAsLandlord: { where: { status: PropertyStatus.active } } },
                        },
                    },
                },
            },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }

        // Increment view count (fire-and-forget)
        this.db.property.update({
            where: { propertyId: propertyId },
            data: { viewCount: { increment: 1 } },
        }).catch(() => { });

        const joinedYears = Math.max(
            0,
            new Date().getFullYear() - new Date(property.landlord.createdAt).getFullYear(),
        );

        return {
            id: property.propertyId,
            title: property.title,
            description: property.description ?? '',
            propertyType: property.propertyType,
            pricePerMonth: Number(property.pricePerMonth ?? 0),
            depositAmount: Number(property.depositAmount ?? 0),
            depositMonths: property.depositMonths ?? 1,
            address: property.address,
            ward: property.ward,
            district: property.district,
            city: property.city,
            country: property.country,
            latitude: Number(property.latitude ?? 0),
            longitude: Number(property.longitude ?? 0),
            areaSqm: Number(property.areaSqm ?? 0),
            bedrooms: property.bedrooms ?? 0,
            bathrooms: property.bathrooms ?? 0,
            livingRooms: property.livingRooms ?? 0,
            kitchens: property.kitchens ?? 0,
            balconies: property.balconies ?? 0,
            floorNumber: property.floorNumber ?? 0,
            totalFloors: property.totalFloors ?? 0,
            furnitureStatus: property.furnitureStatus,
            parkingFee: Number(property.parkingFee ?? 0),
            managementFee: Number(property.managementFee ?? 0),
            electricityCostPerKwh: Number(property.electricityCostPerKwh ?? 0),
            waterCostPerM3: Number(property.waterCostPerM3 ?? 0),
            minimumLeaseMonths: property.minimumLeaseMonths ?? 6,
            maximumLeaseMonths: property.maximumLeaseMonths ?? null,
            availableFrom: property.availableFrom?.toISOString() ?? null,
            hasFireCertificate: property.hasFireCertificate,
            status: property.status,
            approvalStatus: property.approvalStatus,
            createdAt: property.createdAt.toISOString(),
            updatedAt: property.updatedAt.toISOString(),
            viewCount: property.viewCount + 1,
            images: property.images.map((img) => ({
                id: img.id,
                uri: img.uri,
                isPrimary: img.isPrimary,
            })),
            videos: property.videos.map((v) => ({
                id: v.id,
                uri: v.uri,
            })),
            amenities: property.amenities.map((a) => a.name),
            rules: property.rules.map((r) => ({ text: r.text, order: r.order })),
            reviews: property.reviews.map((r) => ({
                id: r.reviewId,
                rating: r.rating,
                comment: r.comment,
                createdAt: r.createdAt.toISOString(),
                reviewer: {
                    id: r.reviewer.id,
                    fullName: r.reviewer.fullName ?? '',
                    avatarUrl: r.reviewer.avatarUrl ?? '',
                },
            })),
            user: {
                id: property.landlord.id,
                fullName: property.landlord.fullName ?? '',
                avatarUrl: property.landlord.avatarUrl ?? '',
                phone: property.landlord.phone
                    ? property.landlord.phone.slice(0, -3) + '***'
                    : '',
                phoneRaw: property.landlord.phone ?? '',
                totalListings: property.landlord._count.propertiesAsLandlord,
                joinedYears,
                userType: 'personal' as const,
            },
        };
    }

    async getInternalPropertyDetail(propertyId: string) {
        const property = await this.db.property.findFirst({
            where: {
                propertyId,
                deletedAt: null,
            },
            select: {
                propertyId: true,
                title: true,
                address: true,
                ward: true,
                district: true,
                city: true,
                pricePerMonth: true,
                depositAmount: true,
                propertyType: true,
                images: {
                    select: { id: true, uri: true, isPrimary: true },
                    orderBy: { isPrimary: 'desc' },
                },
            },
        });

        if (!property) {
            throw new NotFoundException('Không tìm thấy bất động sản');
        }

        return property;
    }

    async getListProperty(userId?: string, limit = 10, cursor?: string) {
        // Lấy danh sách property
        const items = await this.db.property.findMany({
            where: {
                deletedAt: null,
                status: PropertyStatus.active,
                approvalStatus: ApprovalStatus.approved,
                ...(userId && { landlordId: { not: userId } }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit + 1, // +1 để check hasMore
            cursor: cursor ? { propertyId: cursor } : undefined,
            skip: cursor ? 1 : 0,
            select: {
                propertyId: true,
                title: true,
                description: true,
                propertyType: true,
                pricePerMonth: true,
                address: true,
                district: true,
                city: true,
                areaSqm: true,
                bedrooms: true,
                bathrooms: true,
                furnitureStatus: true,
                createdAt: true,
                landlord: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true,
                        phone: true,
                    },
                },
                images: {
                    select: { id: true, uri: true, isPrimary: true },
                    orderBy: { isPrimary: 'desc' },
                    take: 1,
                },
            },
        });

        const hasMore = items.length > limit;
        if (hasMore) items.pop();

        const data = items.map((item) => ({
            id: item.propertyId,
            title: item.title,
            description: item.description ?? '',
            propertyType: item.propertyType,
            pricePerMonth: Number(item.pricePerMonth ?? 0),
            address: item.address,
            district: item.district,
            city: item.city,
            areaSqm: Number(item.areaSqm ?? 0),
            bedrooms: item.bedrooms ?? 0,
            bathrooms: item.bathrooms ?? 0,
            furnitureStatus: item.furnitureStatus,
            createdAt: item.createdAt.toISOString(),
            user: {
                id: item.landlord.id,
                fullName: item.landlord.fullName ?? '',
                avatarUrl: item.landlord.avatarUrl ?? '',
                phone: item.landlord.phone
                    ? item.landlord.phone.slice(0, -3) + '***'
                    : '',
            },
            image: item.images[0]?.uri ?? null,
        }));

        const nextCursor = hasMore ? items[items.length - 1].propertyId : null;

        return { data, nextCursor, hasMore };
    }

    // ─────────────────────────────────────────────────────
    // PUBLIC: Featured / Latest properties for home page
    // ─────────────────────────────────────────────────────
    async getFeaturedProperties(limit = 12, cursor?: string) {
        // Lấy danh sách properties
        const items = await this.db.property.findMany({
            where: {
                deletedAt: null,
                status: PropertyStatus.active,
                approvalStatus: ApprovalStatus.approved,
            },
            orderBy: { createdAt: 'desc' },
            take: limit + 1, // +1 để check hasMore
            cursor: cursor ? { propertyId: cursor } : undefined,
            skip: cursor ? 1 : 0, // nếu dùng cursor, skip record đầu
            select: {
                propertyId: true,
                title: true,
                description: true,
                propertyType: true,
                pricePerMonth: true,
                address: true,
                district: true,
                city: true,
                areaSqm: true,
                bedrooms: true,
                bathrooms: true,
                furnitureStatus: true,
                createdAt: true,
                landlord: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true,
                        phone: true,
                    },
                },
                images: {
                    select: { id: true, uri: true, isPrimary: true },
                    orderBy: { isPrimary: 'desc' },
                    take: 1,
                },
            },
        });

        const hasMore = items.length > limit;
        if (hasMore) items.pop(); // remove extra record dùng để check hasMore

        const data = items.map((item) => ({
            id: item.propertyId,
            title: item.title,
            description: item.description ?? '',
            propertyType: item.propertyType,
            pricePerMonth: Number(item.pricePerMonth ?? 0),
            address: item.address,
            district: item.district,
            city: item.city,
            areaSqm: Number(item.areaSqm ?? 0),
            bedrooms: item.bedrooms ?? 0,
            bathrooms: item.bathrooms ?? 0,
            furnitureStatus: item.furnitureStatus,
            createdAt: item.createdAt.toISOString(),
            user: {
                id: item.landlord.id,
                fullName: item.landlord.fullName ?? '',
                avatarUrl: item.landlord.avatarUrl ?? '',
                phone: item.landlord.phone
                    ? item.landlord.phone.slice(0, -3) + '***'
                    : '',
            },
            image: item.images[0]?.uri ?? null,
        }));

        const nextCursor = hasMore ? items[items.length - 1].propertyId : null;

        // Lấy tổng số property (optional, nếu cần total)
        const total = await this.db.property.count({
            where: {
                deletedAt: null,
                status: PropertyStatus.active,
                approvalStatus: ApprovalStatus.approved,
            },
        });

        return {
            data,
            total,
            nextCursor,
            hasMore,
        };
    }

    async searchAuthProperties(dto: SearchPropertyDto, userId: string) {
        const limit = dto.limit ?? 20;
        const sortBy = dto.sortBy ?? 'newest';

        // Build WHERE clause
        const where: any = {
            deletedAt: null,
            status: PropertyStatus.active,
            approvalStatus: ApprovalStatus.approved,
            ...(userId && {
                landlordId: {
                    not: userId
                }
            })
        };

        if (dto.keyword) {
            where.OR = [
                { title: { contains: dto.keyword, mode: 'insensitive' } },
                { description: { contains: dto.keyword, mode: 'insensitive' } },
                { address: { contains: dto.keyword, mode: 'insensitive' } },
                { district: { contains: dto.keyword, mode: 'insensitive' } },
                { city: { contains: dto.keyword, mode: 'insensitive' } },
            ];
        }

        if (dto.propertyType) where.propertyType = dto.propertyType;
        if (dto.city) where.city = { contains: dto.city, mode: 'insensitive' };
        if (dto.district) where.district = { contains: dto.district, mode: 'insensitive' };
        if (dto.bedrooms !== undefined) where.bedrooms = dto.bedrooms;

        if (dto.priceMin !== undefined || dto.priceMax !== undefined) {
            where.pricePerMonth = {};
            if (dto.priceMin !== undefined) where.pricePerMonth.gte = dto.priceMin;
            if (dto.priceMax !== undefined && dto.priceMax > 0) where.pricePerMonth.lte = dto.priceMax;
        }

        if (dto.areaMin !== undefined || dto.areaMax !== undefined) {
            where.areaSqm = {};
            if (dto.areaMin !== undefined) where.areaSqm.gte = dto.areaMin;
            if (dto.areaMax !== undefined) where.areaSqm.lte = dto.areaMax;
        }

        // Determine ORDER BY based on sortBy
        let orderBy: any[] = [{ createdAt: 'desc' }, { propertyId: 'desc' }];
        if (sortBy === 'oldest') orderBy = [{ createdAt: 'asc' }, { propertyId: 'asc' }];
        else if (sortBy === 'price_asc') orderBy = [{ pricePerMonth: 'asc' }, { propertyId: 'asc' }];
        else if (sortBy === 'price_desc') orderBy = [{ pricePerMonth: 'desc' }, { propertyId: 'desc' }];
        else if (sortBy === 'area_asc') orderBy = [{ areaSqm: 'asc' }, { propertyId: 'asc' }];
        else if (sortBy === 'area_desc') orderBy = [{ areaSqm: 'desc' }, { propertyId: 'desc' }];

        // Decode cursor
        if (dto.cursor) {
            try {
                const decoded = JSON.parse(Buffer.from(dto.cursor, 'base64').toString('utf-8'));

                if (sortBy === 'newest') {
                    where.AND = [
                        {
                            OR: [
                                { createdAt: { lt: new Date(decoded.createdAt) } },
                                {
                                    createdAt: { equals: new Date(decoded.createdAt) },
                                    propertyId: { lt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'oldest') {
                    where.AND = [
                        {
                            OR: [
                                { createdAt: { gt: new Date(decoded.createdAt) } },
                                {
                                    createdAt: { equals: new Date(decoded.createdAt) },
                                    propertyId: { gt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'price_asc') {
                    where.AND = [
                        {
                            OR: [
                                { pricePerMonth: { gt: decoded.price } },
                                {
                                    pricePerMonth: { equals: decoded.price },
                                    propertyId: { gt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'price_desc') {
                    where.AND = [
                        {
                            OR: [
                                { pricePerMonth: { lt: decoded.price } },
                                {
                                    pricePerMonth: { equals: decoded.price },
                                    propertyId: { lt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'area_asc') {
                    where.AND = [
                        {
                            OR: [
                                { areaSqm: { gt: decoded.area } },
                                {
                                    areaSqm: { equals: decoded.area },
                                    propertyId: { gt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                } else if (sortBy === 'area_desc') {
                    where.AND = [
                        {
                            OR: [
                                { areaSqm: { lt: decoded.area } },
                                {
                                    areaSqm: { equals: decoded.area },
                                    propertyId: { lt: decoded.propertyId },
                                },
                            ],
                        },
                    ];
                }
            } catch {
                // Invalid cursor → ignore, start from beginning
            }
        }

        // Fetch limit+1 to detect hasMore
        const [totalCount, items] = await Promise.all([
            this.db.property.count({ where: { ...where, AND: undefined } }),
            this.db.property.findMany({
                where,
                orderBy,
                take: limit + 1,
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
                    furnitureStatus: true,
                    createdAt: true,
                    viewCount: true,
                    landlord: {
                        select: {
                            id: true,
                            fullName: true,
                            avatarUrl: true,
                            phone: true,
                        },
                    },
                    images: {
                        select: { id: true, uri: true, isPrimary: true },
                        orderBy: { isPrimary: 'desc' },
                        take: 4,
                    },
                },
            }),
        ]);

        const hasMore = items.length > limit;
        const data = hasMore ? items.slice(0, limit) : items;

        // Build next cursor from last item
        let nextCursor: string | null = null;
        if (hasMore && data.length > 0) {
            const last = data[data.length - 1];
            const cursorPayload: any = {
                createdAt: last.createdAt.toISOString(),
                propertyId: last.propertyId,
            };
            if (sortBy === 'price_asc' || sortBy === 'price_desc') {
                cursorPayload.price = last.pricePerMonth ? Number(last.pricePerMonth) : 0;
            }
            if (sortBy === 'area_asc' || sortBy === 'area_desc') {
                cursorPayload.area = last.areaSqm ? Number(last.areaSqm) : 0;
            }
            nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64');
        }

        return {
            data: data.map((item) => ({
                id: item.propertyId,
                title: item.title,
                description: item.description ?? '',
                propertyType: item.propertyType,
                pricePerMonth: Number(item.pricePerMonth ?? 0),
                address: item.address,
                ward: item.ward,
                district: item.district,
                city: item.city,
                areaSqm: Number(item.areaSqm ?? 0),
                bedrooms: item.bedrooms ?? 0,
                bathrooms: item.bathrooms ?? 0,
                furnitureStatus: item.furnitureStatus,
                createdAt: item.createdAt.toISOString(),
                viewCount: item.viewCount ?? 0,
                user: {
                    id: item.landlord.id,
                    fullName: item.landlord.fullName ?? '',
                    avatarUrl: item.landlord.avatarUrl ?? '',
                    phone: item.landlord.phone
                        ? item.landlord.phone.slice(0, -3) + '***'
                        : '',
                },
                images: item.images,
            })),
            nextCursor,
            hasMore,
            total: totalCount,
        };
    }

    async getPropertyByIdPublic(propertyId: string) {
        return await this.db.property.findUnique({
            where: {
                propertyId: propertyId
            }
        })
    }

    async getNumberPropertyByCity(propertyType?: string) {
        const counts = await this.db.property.groupBy({
            by: ['city'],
            where: {
                deletedAt: null,
                status: PropertyStatus.active,
                approvalStatus: ApprovalStatus.approved,
                ...(propertyType && { propertyType: propertyType as PropertyType })
            },
            _count: {
                propertyId: true,
            },
            orderBy: {
                _count: {
                    propertyId: 'desc',
                },
            },
            take: 5,
        });

        // Chuyển sang format trả về
        return counts.map((item) => ({
            city: item.city,
            numberProperty: item._count.propertyId,
        }));
    }
}
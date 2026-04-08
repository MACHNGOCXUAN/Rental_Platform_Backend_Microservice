import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { UserRole, KycStatus } from 'generated/prisma/enums';
import { UserResponseDto } from '../dtos/user.response.dto';
import { HashService } from 'src/common/services/hash.service';
import { AdminAccountQueryDto, AdminCreateAccountDto } from '../dtos/admin-user.dto';
import { Decimal } from 'generated/prisma/internal/prismaNamespace';

@Injectable()
export class UserService {

    constructor(
        private readonly databaseService: DatabaseService,
        private readonly hashService: HashService,
    ) {}

    async getUserProfile(userId: string): Promise<UserResponseDto | null> {
        const user = await this.databaseService.user.findUnique({
            where: { id: userId, deletedAt: null },
        });
        return user ?? null;
    }

    async getUserProfileByPhone(phone: string): Promise<UserResponseDto | null> {
        const user = await this.databaseService.user.findFirst({
            where: { phone, deletedAt: null },
        });
        return user;
    }

    async getUserProfileByEmail(email: string): Promise<UserResponseDto | null> {
        const user = await this.databaseService.user.findUnique({
            where: { email, deletedAt: null },
        });
        return user;
    }

    async updateUserProfile(userId: string, updateDto: Partial<UserResponseDto>): Promise<UserResponseDto> {
        const user = await this.getUserProfile(userId);
        if (!user) {
            throw new BadRequestException('Khong tim thay nguoi dung');
        }

        const profilePayload = updateDto.profile;

        return this.databaseService.$transaction(async (tx) => {
            const updatedUser = await tx.user.update({
                where: { id: user.id },
                data: {
                    fullName: updateDto.fullName,
                    email: updateDto.email,
                    phone: updateDto.phone,
                    isEmailVerified: updateDto.email !== undefined && updateDto.email !== user.email ? false : undefined,
                    emailVerifiedAt: updateDto.email !== undefined && updateDto.email !== user.email ? null : undefined,
                    phoneVerified: updateDto.phone !== undefined && updateDto.phone !== user.phone ? false : undefined,
                    gender: updateDto.gender,
                    walletAddress: updateDto.walletAddress,
                    walletType: updateDto.walletType,
                    dateOfBirth: updateDto.dateOfBirth ? new Date(updateDto.dateOfBirth) : undefined,
                },
            });

            if (profilePayload) {
                const existingProfile = await tx.userProfile.findUnique({
                    where: { userId },
                });

                const hasProfileChanges = [
                    profilePayload.fullName,
                    profilePayload.idCardNumber,
                    profilePayload.currentAddress,
                    profilePayload.currentWard,
                    profilePayload.currentDistrict,
                    profilePayload.currentCity,
                    profilePayload.occupation,
                    profilePayload.emergencyContactName,
                    profilePayload.emergencyContactPhone,
                ].some((value) => value !== undefined && value !== null && String(value).trim() !== '');

                if (!existingProfile && hasProfileChanges && !profilePayload.idCardNumber?.trim()) {
                    throw new BadRequestException('Vui lòng cập nhật CCCD/CMND trước khi lưu thông tin hồ sơ');
                }

                const profileData = {
                    fullName: profilePayload.fullName?.trim() || updateDto.fullName?.trim() || user.fullName,
                    idCardNumber: profilePayload.idCardNumber?.trim() || undefined,
                    currentAddress: profilePayload.currentAddress ?? null,
                    currentWard: profilePayload.currentWard ?? null,
                    currentDistrict: profilePayload.currentDistrict ?? null,
                    currentCity: profilePayload.currentCity ?? null,
                    occupation: profilePayload.occupation ?? null,
                    emergencyContactName: profilePayload.emergencyContactName ?? null,
                    emergencyContactPhone: profilePayload.emergencyContactPhone ?? null,
                };

                if (existingProfile) {
                    await tx.userProfile.update({
                        where: { userId },
                        data: {
                            fullName: profileData.fullName,
                            idCardNumber: profileData.idCardNumber ?? existingProfile.idCardNumber,
                            currentAddress: profileData.currentAddress,
                            currentWard: profileData.currentWard,
                            currentDistrict: profileData.currentDistrict,
                            currentCity: profileData.currentCity,
                            occupation: profileData.occupation,
                            emergencyContactName: profileData.emergencyContactName,
                            emergencyContactPhone: profileData.emergencyContactPhone,
                        },
                    });
                } else if (profileData.idCardNumber) {
                    await tx.userProfile.create({
                        data: {
                            userId,
                            fullName: profileData.fullName,
                            idCardNumber: profileData.idCardNumber,
                            currentAddress: profileData.currentAddress,
                            currentWard: profileData.currentWard,
                            currentDistrict: profileData.currentDistrict,
                            currentCity: profileData.currentCity,
                            occupation: profileData.occupation,
                            emergencyContactName: profileData.emergencyContactName,
                            emergencyContactPhone: profileData.emergencyContactPhone,
                        },
                    });
                }
            }

            const profile = await tx.userProfile.findUnique({
                where: { userId },
            });

            return {
                ...updatedUser,
                profile,
            } as UserResponseDto;
        });
    }

    // helo 
    async createUser(data): Promise<UserResponseDto> {
        return this.databaseService.user.create({
            data: {
                email: data.email ?? null,
                fullName: data.fullName?.trim(),
                phone: data.phone ?? null,
                role: data.role || UserRole.user,
                passwordHash: data.password ?? null,
                avatarUrl: data.avatarUrl ?? null,
                isEmailVerified: data.isEmailVerified ?? false,
                phoneVerified: data.phoneVerified ?? false,
            },
        });
    }

    async getAllUser(): Promise<UserResponseDto[]> {
        return this.databaseService.user.findMany({})
    }

    async getAccountsByRole(role: UserRole, query: AdminAccountQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const where: any = {
            role,
            deletedAt: null,
        };

        if (query.search?.trim()) {
            const keyword = query.search.trim();
            where.OR = [
                { fullName: { contains: keyword, mode: 'insensitive' } },
                { email: { contains: keyword, mode: 'insensitive' } },
                { phone: { contains: keyword, mode: 'insensitive' } },
            ];
        }

        if (query.kycStatus) {
            where.kycStatus = query.kycStatus;
        }

        if (typeof query.isBanned === 'boolean') {
            where.isBanned = query.isBanned;
        }

        const [items, total] = await Promise.all([
            this.databaseService.user.findMany({
                where,
                skip,
                take: limit,
                include: {
                    kycDocuments: {
                        orderBy: {
                            submittedAt: 'desc',
                        },
                        take: 1,
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.databaseService.user.count({ where }),
        ]);

        const mappedItems = items.map((item) => this.attachLatestKycMeta(item));

        return {
            items: mappedItems,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async createAccountByRole(role: UserRole, dto: AdminCreateAccountDto): Promise<UserResponseDto> {
        const passwordHash = this.hashService.createHash(dto.password);

        return this.databaseService.user.create({
            data: {
                email: dto.email ?? null,
                fullName: dto.fullName.trim(),
                phone: dto.phone ?? null,
                role,
                passwordHash,
                avatarUrl: dto.avatarUrl ?? null,
                kycStatus: dto.kycStatus ?? KycStatus.pending,
                isEmailVerified: dto.isEmailVerified ?? false,
                phoneVerified: dto.phoneVerified ?? false,
                isActive: dto.isActive ?? true,
            },
        });
    }

    async banAccount(userId: string, reason: string, until?: string) {
        const normalizedReason = reason?.trim();
        if (!normalizedReason || normalizedReason.length < 3) {
            throw new BadRequestException('Lý do khóa tài khoản là bắt buộc');
        }

        return this.databaseService.user.update({
            where: { id: userId },
            data: {
                isBanned: true,
                bannedAt: new Date(),
                bannedReason: normalizedReason,
                bannedUntil: until ? new Date(until) : null,
                isActive: false,
            },
        });
    }

    async unbanAccount(userId: string) {
        return this.databaseService.user.update({
            where: { id: userId },
            data: {
                isBanned: false,
                bannedAt: null,
                bannedReason: null,
                bannedUntil: null,
                isActive: true,
            },
        });
    }

    async getProfileById(userId: string): Promise<UserResponseDto | null> {
        const user = await this.databaseService.user.findUnique({
            where: { id: userId },
            include: {
                profile: true,
                kycDocuments: {
                    orderBy: {
                        submittedAt: 'desc',
                    },
                    take: 1,
                },
            }
        });

        if (!user) {
            return null;
        }

        return this.attachLatestKycMeta(user);
    }

    async updateAvatar(userId: string, avatarUrl: string): Promise<UserResponseDto> {
        return this.databaseService.user.update({
            where: { id: userId },
            data: { avatarUrl },
        });
    }

    async updatePassword(userId: string, passwordHash: string): Promise<UserResponseDto> {
        return this.databaseService.user.update({
            where: { id: userId },
            data: { passwordHash },
        });
    }

    async markEmailVerified(userId: string): Promise<UserResponseDto> {
        return this.databaseService.user.update({
            where: { id: userId },
            data: {
                isEmailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });
    }

    async updateEmailAndMarkVerified(userId: string, email: string): Promise<UserResponseDto> {
        return this.databaseService.user.update({
            where: { id: userId },
            data: {
                email,
                isEmailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });
    }

    private parseKycFlags(notes?: string | null): string[] {
        if (!notes) {
            return [];
        }

        try {
            const parsed = JSON.parse(notes);
            if (Array.isArray(parsed?.flags)) {
                return parsed.flags.filter((flag: unknown) => typeof flag === 'string');
            }
        } catch {
            return [];
        }

        return [];
    }

    private toNumber(value?: Decimal | null): number | null {
        if (!value) {
            return null;
        }

        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private attachLatestKycMeta<T extends { kycDocuments?: any[] }>(user: T) {
        const latest = user.kycDocuments?.[0] ?? null;

        return {
            ...user,
            latestKycDocument: latest
                ? {
                    kycId: latest.kycId,
                    status: latest.status,
                    frontImageUrl: latest.frontImageUrl,
                    backImageUrl: latest.backImageUrl,
                    selfieUrl: latest.selfieUrl,
                    ocrData: latest.ocrData,
                    score: this.toNumber(latest.faceMatchScore),
                    flags: this.parseKycFlags(latest.notes),
                    rejectionReason: latest.rejectionReason,
                    submittedAt: latest.submittedAt,
                    reviewedAt: latest.reviewedAt,
                }
                : null,
            kycScore: latest ? this.toNumber(latest.faceMatchScore) : null,
            kycFlags: latest ? this.parseKycFlags(latest.notes) : [],
            kycOcrData: latest?.ocrData ?? null,
        };
    }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { UserRole, KycStatus } from 'generated/prisma/enums';
import { UserResponseDto } from '../dtos/user.response.dto';
import { HashService } from 'src/common/services/hash.service';
import { AdminAccountQueryDto, AdminCreateAccountDto } from '../dtos/admin-user.dto';

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

        return this.databaseService.user.update({
            where: { id: user?.id },
            data: {
                fullName: updateDto.fullName,
                email: updateDto.email,
                phone: updateDto.phone,
                gender: updateDto.gender,
                dateOfBirth: updateDto.dateOfBirth ? new Date(updateDto.dateOfBirth) : undefined,
            },
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
                orderBy: { createdAt: 'desc' },
            }),
            this.databaseService.user.count({ where }),
        ]);

        return {
            items,
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
        return this.databaseService.user.findUnique({
            where: { id: userId },
            include: {
                profile: true
            }
        });
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
}

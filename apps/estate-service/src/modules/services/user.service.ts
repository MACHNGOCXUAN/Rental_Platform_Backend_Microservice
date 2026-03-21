import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { UserRole } from 'generated/prisma/enums';
import { UserResponseDto } from '../dtos/user.response.dto';

@Injectable()
export class UserService {

    constructor(private readonly databaseService: DatabaseService) {}

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

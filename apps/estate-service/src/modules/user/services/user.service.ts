import { Injectable } from '@nestjs/common';
import { UserResponseDto } from '../dtos/user.response.dto';
import { UserUpdateDto } from '../dtos/user.update.dto';
import { Role } from '../dtos/user-list.dto';
import { DatabaseService } from 'src/common/services/database.service';
import { UserRole } from 'generated/prisma/enums';

@Injectable()
export class UserService {

    constructor(private readonly databaseService: DatabaseService) {}

    async getUserProfile(userId: string): Promise<UserResponseDto | null> {
        const user = await this.databaseService.user.findUnique({
            where: { id: userId, deletedAt: null },
        });
        return user ?? null;
    }

    async getUserProfileByEmail(email: string): Promise<UserResponseDto | null> {
        const user = await this.databaseService.user.findUnique({
            where: { email, deletedAt: null },
        });
        return user;
    }

    async updateUserProfile(userId: string, updateDto: UserResponseDto): Promise<UserResponseDto> {
        const user = await this.getUserProfile(userId);

        return this.databaseService.user.update({
            where: { id: user?.id },
            data: {
                fullName: updateDto.fullName,
                email: updateDto.email,
                phone: updateDto.phone
            },
        });
    }

    // helo 
    async createUser(data): Promise<UserResponseDto> {
        return this.databaseService.user.create({
            data: {
                email: data.email,
                fullName: data.fullName?.trim(),
                phone: data.phone,
                role: data.role || UserRole.tenant,
                passwordHash: data.password,
            },
        });
    }

    async getAllUser(): Promise<UserResponseDto[]> {
        return this.databaseService.user.findMany({})
    }
}

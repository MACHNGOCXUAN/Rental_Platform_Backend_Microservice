import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserRole, Gender } from 'generated/prisma/enums';

export class UserResponseDto {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  role: UserRole;
  avatarUrl: string | null;
  isEmailVerified: boolean;
  gender: Gender | null;
  dateOfBirth: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  @Exclude()
  passwordHash: string | null;
}

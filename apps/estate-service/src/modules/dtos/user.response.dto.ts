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

  profile?: {
    profileId: string;
    idCardNumber: string | null;
    currentAddress?: string | null;
    currentWard?: string | null;
    currentDistrict?: string | null;
    currentCity?: string | null;
    occupation?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  } | null;
}

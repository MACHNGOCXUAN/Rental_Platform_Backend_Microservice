import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserRole, Gender, KycStatus } from 'generated/prisma/enums';

export class UserResponseDto {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  role: UserRole;
  phoneVerified: boolean;
  avatarUrl: string | null;
  kycStatus: KycStatus;
  isActive: boolean;
  isBanned: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
  bannedUntil: Date | null;
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

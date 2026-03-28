import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserRole, Gender, KycStatus, WalletType } from 'generated/prisma/enums';

export class UserResponseDto {
  id: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  role: UserRole;
  walletAddress: string | null;
  walletType: WalletType | null;
  phoneVerified: boolean;
  avatarUrl: string | null;
  kycStatus: KycStatus;
  kycSubmittedAt: Date | null;
  kycVerifiedAt: Date | null;
  kycExpiredAt: Date | null;
  kycRejectionReason: string | null;
  isActive: boolean;
  isBanned: boolean;
  bannedAt: Date | null;
  bannedReason: string | null;
  bannedUntil: Date | null;
  isEmailVerified: boolean;
  emailVerifiedAt: Date | null;
  gender: Gender | null;
  dateOfBirth: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  loginCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  @Exclude()
  passwordHash: string | null;

  profile?: {
    profileId: string;
    fullName: string;
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

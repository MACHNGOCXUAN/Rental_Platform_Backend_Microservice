import { IsString, IsDateString, IsOptional, IsEnum, IsUUID, IsArray, ArrayNotEmpty, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { RentalRequestStatus } from 'generated/prisma/enums';

export class CreateRentalRequestDto {
  @IsUUID()
  propertyId: string;

  @IsUUID()
  ownerId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @Type(() => Number)
  proposedRent?: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  autoRenew?: boolean;
}

export class ReviewRentalRequestDto {
  @IsEnum(RentalRequestStatus)
  status: 'under_review' | 'rejected';

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  landlordNotes?: string;
}

export class OpenHoldingDepositDto {
  @IsArray()
  @ArrayNotEmpty()
  requestIds: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  expireMinutes?: number;
}

export class PayHoldingDepositDto {
  @IsUUID()
  requestId: string;

  @IsString()
  @IsIn(['vnpay', 'momo', 'bank_transfer', 'wallet'])
  method: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

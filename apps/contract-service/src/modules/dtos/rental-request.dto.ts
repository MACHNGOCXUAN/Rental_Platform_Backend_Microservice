import { IsString, IsDateString, IsDecimal, IsOptional, IsEnum, IsUUID } from 'class-validator';
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
}

export class ReviewRentalRequestDto {
  @IsEnum(RentalRequestStatus)
  status: 'under_review' | 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  landlordNotes?: string;
}

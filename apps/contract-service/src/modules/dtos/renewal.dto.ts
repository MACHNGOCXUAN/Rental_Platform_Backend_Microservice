import { IsString, IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRenewalRequestDto {
  @IsUUID()
  contractId: string;

  @IsInt()
  @Min(1)
  @Max(36)
  @Type(() => Number)
  durationMonths: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ReviewRenewalRequestDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class RenewalQueryDto {
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  limit?: number;
}

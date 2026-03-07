import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsInt, IsBoolean, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class SendContractDto {
  @IsUUID()
  contractId: string;
}

export class SignContractDto {
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @Type(() => Number)
  monthlyRent?: number;

  @IsOptional()
  @Type(() => Number)
  depositAmount?: number;

  @IsOptional()
  @Type(() => Number)
  electricityCostPerKwh?: number;

  @IsOptional()
  @Type(() => Number)
  waterCostPerM3?: number;

  @IsOptional()
  @Type(() => Number)
  managementFee?: number;

  @IsOptional()
  @Type(() => Number)
  parkingFee?: number;

  @IsOptional()
  @Type(() => Number)
  internetFee?: number;

  @IsOptional()
  @IsInt()
  paymentDueDay?: number;

  @IsOptional()
  @Type(() => Number)
  lateFeePerDay?: number;

  @IsOptional()
  @IsInt()
  gracePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  autoRenewal?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  terms?: string[];
}

export class ContractQueryDto {
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

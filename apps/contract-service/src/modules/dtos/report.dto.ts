import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportPriority, ReportStatus, ReportType, TerminationResolution } from 'generated/prisma/enums';

export class CreateReportDto {
  @IsUUID()
  rentalId!: string;

  @IsUUID()
  againstId!: string;

  @IsOptional()
  @IsUUID()
  terminationRequestId?: string;

  @IsEnum(ReportType)
  type!: ReportType;

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsArray()
  attachments?: { url: string; type: string; fileName?: string; fileSize?: number }[];
}

export class UpdateReportStatusDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsEnum(TerminationResolution)
  terminationResolution?: TerminationResolution;
}

export class AdminReportQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminResolveReportDto {
  @IsString()
  adminNote!: string;

  @IsOptional()
  @IsEnum(TerminationResolution)
  terminationResolution?: TerminationResolution;
}

export class AdminResolveTerminationDto {
  @IsString()
  adminNote!: string;

  @IsEnum(TerminationResolution)
  resolution!: TerminationResolution;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  depositReturnAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  penaltyAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  compensationAmount?: number;
}

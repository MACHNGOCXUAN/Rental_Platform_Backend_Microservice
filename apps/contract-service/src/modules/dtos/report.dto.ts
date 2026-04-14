import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ReportPriority, ReportStatus, ReportType, TerminationResolution } from 'generated/prisma/enums';

export class CreateReportDto {
  @IsUUID()
  rentalId!: string;

  @IsUUID()
  againstId!: string;

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

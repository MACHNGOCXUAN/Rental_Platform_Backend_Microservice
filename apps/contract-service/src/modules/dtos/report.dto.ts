import { IsEnum, IsOptional, IsString } from 'class-validator';

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
  adminNote: string;
}

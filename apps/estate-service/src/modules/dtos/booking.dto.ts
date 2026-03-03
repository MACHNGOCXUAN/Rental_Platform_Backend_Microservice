import { IsUUID, IsDateString, IsString, IsOptional, IsInt, Min } from 'class-validator';

export class GetAvailableSlotsDto {
  @IsUUID()
  propertyId: string;

  @IsDateString()
  date: string; // format: YYYY-MM-DD
}

export class CreateBookingDto {
  @IsUUID()
  propertyId: string

  @IsDateString()
  visitDate: string

  @IsString()
  visitTimeStart: string

  @IsString()
  visitTimeEnd: string

  @IsOptional()
  @IsString()
  tenantNote?: string

  @IsOptional()
  @IsString()
  tenantPhone?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  numberOfVisitors?: number
}


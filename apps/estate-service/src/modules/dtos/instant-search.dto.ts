import { IsString, IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyType } from 'generated/prisma/enums';

/**
 * DTO for the body of POST /properties/instant-search
 * Receives the raw query + AI-extracted filters from ai-service.
 */
export class InstantSearchFiltersDto {
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export class InstantSearchDto {
  @IsString()
  q!: string;

  @IsOptional()
  filters?: InstantSearchFiltersDto;
}

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsOptional,
  Min,
  IsPositive,
  IsDateString,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FurnitureStatus, PropertyStatus, PropertyType } from 'generated/prisma/enums';

/* ---------------- Search / Public DTOs ---------------- */

export class SearchPropertyDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaMax?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  /** Base64-encoded cursor: { createdAt: ISO string, propertyId: string } */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  /** newest | oldest | price_asc | price_desc | area_asc | area_desc */
  @IsOptional()
  @IsString()
  sortBy?: string;
}

/* ---------------- Media ---------------- */

export class PropertyImageDto {
  @IsString()
  id!: string;

  @IsString()
  uri!: string;

  @IsBoolean()
  isPrimary!: boolean;
}

export class PropertyVideoDto {
  @IsString()
  id!: string;

  @IsString()
  uri!: string;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  duration?: number;
}

/* ---------------- Rules ---------------- */

export class RuleDto {
  @IsString()
  text!: string;

  @IsNumber()
  order!: number;
}

/* ---------------- Main DTO ---------------- */

export class CreatePropertyDto {
  /* ===== Thông tin cơ bản ===== */
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  pricePerMonth!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depositAmount!: number;

  @IsNumber()
  @Min(0)
  depositMonths!: number;

  /* ===== Vị trí ===== */
  @IsString()
  address!: string;

  @IsString()
  ward!: string;

  @IsString()
  district!: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  /* ===== Thông tin chi tiết ===== */
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  areaSqm!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  bedrooms?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  bathrooms?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  floorNumber?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  totalFloors?: number;

  @IsEnum(FurnitureStatus)
  furnitureStatus!: FurnitureStatus;

  /* ===== Chi phí ===== */
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  parkingFee?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  managementFee?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  electricityCostPerKwh?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  waterCostPerM3?: number;

  /* ===== Thời gian thuê ===== */
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  minimumLeaseMonths?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  maximumLeaseMonths?: number;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  /* ===== Pháp lý & an toàn ===== */
  @IsBoolean()
  hasFireCertificate!: boolean;

  /* ===== Media ===== */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyImageDto)
  images!: PropertyImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyVideoDto)
  videos?: PropertyVideoDto[];

  /* ===== Tiện ích & quy định ===== */
  @IsArray()
  @IsString({ each: true })
  amenities!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules?: RuleDto[];

  @IsEnum(PropertyStatus)
  status!: PropertyStatus;
}

export class CreatePropertySaveDraftDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  description!: string;

  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Min(1)
  pricePerMonth!: number;
  
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  depositAmount!: number;

  @IsNumber()
  @Min(0)
  depositMonths!: number;

  /* ===== Vị trí ===== */
  @IsString()
  address!: string;

  @IsString()
  ward!: string;

  @IsString()
  district!: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  /* ===== Thông tin chi tiết ===== */
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  areaSqm: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  bedrooms?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  bathrooms?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  floorNumber?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  totalFloors?: number;

  @IsEnum(FurnitureStatus)
  furnitureStatus!: FurnitureStatus;

  /* ===== Chi phí ===== */
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  parkingFee?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  managementFee?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  electricityCostPerKwh?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  waterCostPerM3?: number;

  /* ===== Thời gian thuê ===== */
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  minimumLeaseMonths?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  maximumLeaseMonths?: number;

  @IsOptional()
  @IsDateString()
  availableFrom: string;

  /* ===== Pháp lý & an toàn ===== */
  @IsBoolean()
  hasFireCertificate!: boolean;

  /* ===== Media ===== */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyImageDto)
  images!: PropertyImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyVideoDto)
  videos?: PropertyVideoDto[];

  /* ===== Tiện ích & quy định ===== */
  @IsArray()
  @IsString({ each: true })
  amenities!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  rules?: RuleDto[];

  @IsEnum(PropertyStatus)
  status!: PropertyStatus;
}

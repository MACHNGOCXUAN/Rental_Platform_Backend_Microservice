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
} from 'class-validator';
import { Type } from 'class-transformer';
import { FurnitureStatus, PropertyStatus, PropertyType } from 'generated/prisma/enums';

export enum ListingType {
  RENT = 'rent',
  SALE = 'sale',
}

export enum OwnershipType {
  RED_BOOK = 'redBook',
  PINK_BOOK = 'pinkBook',
  WAITING_FOR_BOOK = 'waitingForBook',
  SALE_CONTRACT = 'saleContract',
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

  @IsEnum(ListingType)
  listingType!: ListingType;

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

  @IsEnum(OwnershipType)
  ownershipType!: OwnershipType;

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

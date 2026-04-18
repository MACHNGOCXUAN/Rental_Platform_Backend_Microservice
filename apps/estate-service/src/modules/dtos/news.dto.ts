import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Min, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export const NEWS_STATUSES = ['draft', 'published', 'archived'] as const;
export type NewsStatus = typeof NEWS_STATUSES[number];

export class CreateNewsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(NEWS_STATUSES)
  status?: NewsStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(NEWS_STATUSES)
  status?: NewsStatus;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsString()
  slug?: string;
}

export class NewsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;
}

export class AdminNewsListQueryDto extends NewsListQueryDto {
  @IsOptional()
  @IsIn(NEWS_STATUSES)
  status?: NewsStatus;
}

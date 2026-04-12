import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsInt, Min, Max, IsOptional, IsArray, IsUUID, IsPositive } from 'class-validator';

export class CreateReviewDto {
    @ApiProperty({ description: 'ID hợp đồng thuê (từ contract-service)' })
    @IsUUID()
    rentalId: string;

    @ApiProperty({ description: 'ID bất động sản' })
    @IsUUID()
    propertyId: string;

    @ApiProperty({ description: 'Đánh giá 1-5 sao', minimum: 1, maximum: 5 })
    @IsInt()
    @Min(1)
    @Max(5)
    rating: number;

    @ApiProperty({ description: 'Nội dung đánh giá' })
    @IsString()
    comment: string;

    @ApiProperty({ description: 'Danh sách URL hình ảnh', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    imageUrls?: string[];
}

export class ReplyReviewDto {
    @ApiProperty({ description: 'Nội dung trả lời' })
    @IsString()
    reply: string;
}

export class ReviewQueryDto {
    @ApiProperty({ required: false, default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    @Min(1)
    page?: number = 1;

    @ApiProperty({ required: false, default: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    @Min(1)
    @Max(50)
    limit?: number = 10;

    @ApiProperty({ required: false, enum: ['newest', 'oldest', 'highest', 'lowest'] })
    @IsOptional()
    @IsString()
    sortBy?: 'newest' | 'oldest' | 'highest' | 'lowest';
}

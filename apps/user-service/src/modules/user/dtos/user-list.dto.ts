import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiBaseQueryDto } from 'src/common/dtos/api-query.dto';

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
}


export class UserListDto extends ApiBaseQueryDto {
    @IsOptional()
    @IsEnum(Role)
    role?: Role;

    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isVerified?: boolean;

    @IsOptional()
    emailDomain?: string;
}
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { UserResponseDto } from 'src/modules/dtos/user.response.dto';

export class AuthRefreshResponseDto {
    accessToken!: string;
    refreshToken!: string;
}

export class AuthResponseDto extends AuthRefreshResponseDto {
    @Type(() => UserResponseDto)
    @ValidateNested()
    user!: UserResponseDto;

    requireEmailUpdate?: boolean;
}
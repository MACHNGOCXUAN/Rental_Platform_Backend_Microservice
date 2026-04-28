import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubscribePushTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}

export class UnsubscribePushTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

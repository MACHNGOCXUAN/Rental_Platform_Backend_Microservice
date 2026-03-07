import { IsString, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatus, PaymentMethod } from 'generated/prisma/enums';

export class ConfirmPaymentDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  transactionRef?: string;

  @IsOptional()
  @Type(() => Number)
  paidAmount?: number;
}

export class PaymentQueryDto {
  @IsOptional()
  @IsUUID()
  rentalId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

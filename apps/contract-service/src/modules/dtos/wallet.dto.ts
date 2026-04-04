import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { WithdrawalStatus, WalletTransactionStatus, WalletTransactionType } from 'generated/prisma/enums';

export const WALLET_TOPUP_METHODS = ['momo', 'vnpay', 'zalopay', 'bank_transfer'] as const;
export type WalletTopupMethod = (typeof WALLET_TOPUP_METHODS)[number];

export class WalletTransactionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;
}

export class WalletTopupDto {
  @Type(() => Number)
  @IsInt()
  @Min(10000)
  amount: number;

  @IsIn(WALLET_TOPUP_METHODS)
  method: WalletTopupMethod;
}

export class ConfirmWalletTopupDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  paidAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  transactionRef?: string;
}

export class WithdrawalRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(10000)
  amount: number;

  @IsString()
  @MaxLength(30)
  bankCode: string;

  @IsString()
  @MaxLength(50)
  accountNumber: string;

  @IsString()
  @MaxLength(120)
  accountName: string;
}

export class WithdrawalQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(WithdrawalStatus)
  status?: WithdrawalStatus;
}

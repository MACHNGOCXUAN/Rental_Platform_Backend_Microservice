import { IsString, IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { TerminationReason } from 'generated/prisma/enums';

export class CreateTerminationRequestDto {
  @IsUUID()
  rentalId: string;

  @IsEnum(TerminationReason)
  reason: TerminationReason;

  @IsOptional()
  @IsString()
  note?: string;

  @IsDateString()
  requestedTerminationDate: string;

  @IsOptional()
  @Type(() => Number)
  earlyTerminationFee?: number;
}

export class ReviewTerminationRequestDto {
  @IsEnum(['approved', 'rejected'] as const)
  status: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  reviewNote?: string;
}

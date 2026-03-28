import { IsNotEmpty, IsString } from 'class-validator';

export class RejectKycDto {
  @IsString()
  @IsNotEmpty()
  rejectionReason!: string;
}

export class KycDecisionResponseDto {
  status!: string;
  score!: number;
  flags?: string[];
  rejectionReason?: string | null;
}

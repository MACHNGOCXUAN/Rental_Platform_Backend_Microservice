import { CallType } from "@prisma/client";
import { IsEnum, IsMongoId, IsOptional, IsString, IsNumberString } from "class-validator";

export class CreateCallDto {
  @IsMongoId()
  conversationId: string;

  @IsString()
  calleeId: string;

  @IsEnum(CallType)
  callType: CallType;
}

export class CallSignalDto {
  @IsMongoId()
  callId: string;

  @IsOptional()
  signal?: unknown;
}

export class GetCallHistoryQueryDto {
  @IsOptional()
  @IsMongoId()
  conversationId?: string;

  @IsOptional()
  @IsNumberString()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

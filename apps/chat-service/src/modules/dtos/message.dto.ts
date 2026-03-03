import { MessageType } from "@prisma/client";
import { IsEnum, IsInt, IsMongoId, IsNumberString, IsOptional, IsString } from "class-validator";

export class GetMessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}

export class SendMessageDto {
  @IsMongoId()
  conversationId: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsEnum(MessageType)
  messageType: MessageType;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  width?: number;

  @IsOptional()
  @IsInt()
  height?: number;

  @IsOptional()
  @IsInt()
  duration?: number;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsMongoId()
  replyToId?: string;
}
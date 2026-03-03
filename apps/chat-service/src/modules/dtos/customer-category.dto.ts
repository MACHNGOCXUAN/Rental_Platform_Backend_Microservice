import { IsString, IsOptional, IsNotEmpty, MaxLength, IsArray } from 'class-validator';

export class CreateCustomerCategoryDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    color?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    description?: string;
}

export class AddConversationToCategoryDto {

  @IsNotEmpty()
  @IsString()
  conversationId: string;

  @IsArray()
  @IsString({ each: true })
  categoryIds: string[];
}
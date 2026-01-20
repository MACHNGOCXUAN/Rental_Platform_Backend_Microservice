import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserRole } from 'generated/prisma/enums';

export class UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  @Exclude()
  passwordHash: string;
}

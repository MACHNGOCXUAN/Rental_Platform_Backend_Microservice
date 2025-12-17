import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLES_DECORATOR_KEY } from '../constants/request.constant';
import { UserRole } from 'generated/prisma/enums';

export const AllowedRoles = (roles: UserRole[]) => {
    return applyDecorators(SetMetadata(ROLES_DECORATOR_KEY, roles), ApiBearerAuth('accessToken'));
};

// Convenience decorators for common role combinations
export const AdminOnly = () => AllowedRoles([UserRole.ADMIN]);
export const UserAccountAndAdmin = () => AllowedRoles([UserRole.OWNER, UserRole.TENANT, UserRole.ADMIN]);
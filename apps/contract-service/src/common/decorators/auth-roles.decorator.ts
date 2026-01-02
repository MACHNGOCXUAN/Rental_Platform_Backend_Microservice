import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ROLES_DECORATOR_KEY } from '../constants/request.constant';

export enum ROLE {
    ADMIN = 'ADMIN',
    USER = 'USER',
    OWNER = 'OWNER',
    TENANT = 'TENANT'
}

export const AllowedRoles = (roles: ROLE[]) => {
    return applyDecorators(SetMetadata(ROLES_DECORATOR_KEY, roles), ApiBearerAuth('accessToken'));
};

// Convenience decorators for common role combinations
export const AdminOnly = () => AllowedRoles([ROLE.ADMIN]);
export const UserAccountAndAdmin = () => AllowedRoles([ROLE.OWNER, ROLE.TENANT, ROLE.ADMIN]);
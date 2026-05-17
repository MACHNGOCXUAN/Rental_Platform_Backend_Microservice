import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_DECORATOR_KEY, PUBLIC_ROUTE_KEY } from '../constants/request.constant';
import { ROLE } from '../decorators/auth-roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        // Check if route is public
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        // Get required roles
        const requiredRoles = this.reflector.getAllAndOverride<ROLE[]>(ROLES_DECORATOR_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user || !user.role) {
            throw new ForbiddenException('User role not found');
        }

        const userRole = (user.role as string).toUpperCase();
        const hasRole = requiredRoles.some(r => r.toUpperCase() === userRole);

        if (!hasRole) {
            throw new ForbiddenException('Insufficient permissions');
        }

        return true;
    }
}
import { Injectable, UnauthorizedException, ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ROUTE_KEY } from '../constants/request.constant';
import { GrpcAuthService } from 'src/services/grpc.auth.service';
import { UserRole } from '../interfaces/request.interface';

@Injectable()
export class AuthJwtAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector, 
        private grpcAuthService: GrpcAuthService
    ) {}

    async canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException('Token not found');
        }

        try {
            const response = await this.grpcAuthService.validateToken(token);

            if (!response.success || !response.payload) {
                throw new UnauthorizedException('Invalid token');
            }

            const rawRole = String(response.payload.role || '').toUpperCase();
            const role = (Object.values(UserRole).includes(rawRole as UserRole)
                ? (rawRole as UserRole)
                : response.payload.role) as UserRole;

            request.user = {
                id: response.payload.id,
                role,
            };

            return true;
        } catch (error) {
            throw new UnauthorizedException('Token validation failed');
        }
    }

    private extractTokenFromHeader(request: any): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
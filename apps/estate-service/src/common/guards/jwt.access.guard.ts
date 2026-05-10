import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ROUTE_KEY } from '../constants/request.constant';

@Injectable()
export class AuthJwtAccessGuard extends AuthGuard('jwt-access') {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // const isRpc = context.getType() === 'rpc';

        if (isPublic) {
            return true;
        }

        return super.canActivate(context);
    }

    handleRequest<TUser = any>(
        err: Error,
        user: TUser,
        info: Error,
        context: ExecutionContext,
    ): TUser {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        const request = context.switchToHttp().getRequest<{
            method?: string;
            url?: string;
            originalUrl?: string;
        }>();
        const method = request?.method ?? 'UNKNOWN_METHOD';
        const path = request?.originalUrl ?? request?.url ?? 'UNKNOWN_PATH';

        // const isRpc = context.getType() === 'rpc';

        if (isPublic) {
            return user;
        }

        // If passport strategy throws, keep the original auth error details.
        if (err) {
            throw err;
        }

        if (!user) {
            const infoName = info?.name ?? '';
            const infoMessage = info?.message ?? '';

            if (infoName === 'TokenExpiredError') {
                throw new UnauthorizedException('Access token has expired');
            }

            if (infoMessage.includes('No auth token') || infoMessage.includes('No authorization token')) {
                throw new UnauthorizedException('Access token is missing');
            }

            console.warn(`[AuthJwtAccessGuard] Unauthorized request ${method} ${path}: ${infoName || 'UnknownAuthError'} - ${infoMessage || 'No details'}`);
            throw new UnauthorizedException('Access token is invalid or expired');
        }

        return user;
    }
}
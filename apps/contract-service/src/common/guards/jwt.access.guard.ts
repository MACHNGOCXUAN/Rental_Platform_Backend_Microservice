import { Injectable, UnauthorizedException, ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY } from '../constants/request.constant';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface IAccessTokenPayload {
    id: string;
    role: string;
    tokenType?: string;
}

@Injectable()
export class AuthJwtAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        try {
            const request = context.switchToHttp().getRequest();
            const token = this.extractTokenFromHeader(request);
            if (!token) {
                throw new UnauthorizedException('Token not found');
            }

            const payload = await this.jwtService.verifyAsync<IAccessTokenPayload>(token, {
                secret: this.configService.get<string>('auth.accessToken.secret'),
            });

            console.log("Verify token contract service: ", payload);
            

            if (!payload?.id || !payload?.role) {
                throw new UnauthorizedException('Invalid token payload');
            }

            if (payload.tokenType && payload.tokenType !== 'AccessToken') {
                throw new UnauthorizedException('Invalid token type');
            }

            request.user = { id: payload.id, role: payload.role };

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
import { Injectable, UnauthorizedException, ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ROUTE_KEY } from '../constants/request.constant';
import { GrpcAuthService } from 'src/services/grpc.auth.service';
import { UserRole } from '../interfaces/request.interface';
import axios from 'axios';

@Injectable()
export class AuthJwtAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private grpcAuthService: GrpcAuthService
    ) { }

    async canActivate(context: ExecutionContext) {
        const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        let token: string | undefined;

        try {
            const request = context.switchToHttp().getRequest();
            token = this.extractTokenFromHeader(request);

            console.log("Xin chao12: ", process.env.ESTATE_SERVICE_URL, token);

            if (!token) {
                throw new UnauthorizedException('Token not found');
            }

            console.log("Xin chao1: ", process.env.ESTATE_SERVICE_URL);

            const response = await this.validateTokenViaHttp(token);

            console.log("helloijo: ", response);
            

            if (!response?.success || !response.payload) {
                throw new UnauthorizedException('Invalid token');
            }

            request.user = {
                id: response.payload.id,
                role: response.payload.role,
            };

            return true;
        } catch (error) {
            console.log("auth validation fail: ", error);
            
            throw new UnauthorizedException('Token validation failed');
        }
    }

    private async validateTokenViaHttp(token: string) {
        try {
            console.log("Xin chao: ", process.env.ESTATE_SERVICE_URL);
            
            const res = await axios.post(
                `${process.env.ESTATE_SERVICE_URL}/api/estate/auth/validate-token`,
                { token },
                { timeout: 3000 },
            );

            const data = res.data?.data;

            if (!data || data.success !== true) {
                return null;
            }

            return data;
        } catch (err: any) {
            console.error(
                'Auth API error:',
                err.response?.data || err.message,
            );
            return null;
        }
    }

    private extractTokenFromHeader(request: any): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
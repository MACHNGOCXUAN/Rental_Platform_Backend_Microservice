import { Injectable, UnauthorizedException, ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { PUBLIC_ROUTE_KEY } from '../constants/request.constant';
import { GrpcAuthService } from 'src/services/grpc.auth.service';
import axios from 'axios';

@Injectable()
export class AuthJwtAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly grpcAuthService: GrpcAuthService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1️⃣ Public route
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;

    const contextType = context.getType<'http' | 'ws'>();

    let token: string | undefined;

    // ===== HTTP =====
    if (contextType === 'http') {
      const request = context.switchToHttp().getRequest();
      token = this.extractTokenFromHeader(request);

      if (!token) {
        throw new UnauthorizedException('Token not found');
      }

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
    }

    // ===== WEBSOCKET =====
    if (contextType === 'ws') {
      const client = context.switchToWs().getClient();

      token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        throw new UnauthorizedException('WS token not found');
      }

      // const response = await this.grpcAuthService.validateToken(token);
      const response = await this.validateTokenViaHttp(token);

      if (!response?.success || !response.payload) {
        throw new UnauthorizedException('Invalid WS token');
      }

      // 👇 RẤT QUAN TRỌNG
      client.data.user = {
        id: response.payload.id,
        role: response.payload.role,
      };

      return true;
    }

    return false;
  }

  private async validateTokenViaHttp(token: string) {
    try {
      const res = await axios.post(
        `${process.env.ESTATE_SERVICE_URL}/auth/validate-token`,
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

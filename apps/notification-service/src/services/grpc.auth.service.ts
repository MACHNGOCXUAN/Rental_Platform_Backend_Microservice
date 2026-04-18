import { Injectable, Logger } from '@nestjs/common';
import { GrpcClientService } from 'nestjs-grpc';
import { ValidateTokenRequest, ValidateTokenResponse, GetUsersByRoleRequest, GetUsersByRoleResponse } from 'src/generated/auth';

@Injectable()
export class GrpcAuthService {
    constructor(private readonly grpcClientService: GrpcClientService) {}

    async validateToken(token: string): Promise<ValidateTokenResponse> {
        try {
            const request: ValidateTokenRequest = { token };

            const response = await this.grpcClientService.call<
                ValidateTokenRequest,
                ValidateTokenResponse
            >('AuthService', 'ValidateToken', request);

            return response;
        } catch (error) {
            throw error;
        }
    }

    async getUsersByRole(role: string): Promise<GetUsersByRoleResponse> {
        try {
            const request: GetUsersByRoleRequest = { role };
            const response = await this.grpcClientService.call<
                GetUsersByRoleRequest,
                GetUsersByRoleResponse
            >('AuthService', 'GetUsersByRole', request);
            return response;
        } catch (error) {
            Logger.error(`Failed to get users by role: ${error}`);
            return { users: [] };
        }
    }
}
import { Injectable, Logger } from '@nestjs/common';
import { GrpcClientService } from 'nestjs-grpc';
import { ValidateTokenRequest, ValidateTokenResponse } from 'src/generated/auth';

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
}
import { GrpcController, GrpcMethod } from 'nestjs-grpc';
import type { ValidateTokenRequest, ValidateTokenResponse } from 'src/generated/auth';
import { AuthService } from 'src/modules/services/auth.service';

@GrpcController('AuthService')
export class AuthGrpcController {
    constructor(private readonly authService: AuthService) {}

    @GrpcMethod('ValidateToken')
    async validateToken(data: ValidateTokenRequest): Promise<ValidateTokenResponse> {
        console.log("xianjnkjnk");
        
        if (!data.token) {
            return {
                success: false,
                payload: undefined,
            };
        }

        try {
            const response = await this.authService.verifyToken(data.token);
            return {
                success: true,
                payload: {
                    id: response.id,
                    role: response.role,
                },
            };
        } catch {
            return {
                success: false,
                payload: undefined,
            };
        }
    }
}
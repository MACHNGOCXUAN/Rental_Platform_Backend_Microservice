import { GrpcController, GrpcMethod } from 'nestjs-grpc';
import type { ValidateTokenRequest, ValidateTokenResponse, GetUsersByRoleRequest, GetUsersByRoleResponse } from 'src/generated/auth';
import { AuthService } from 'src/modules/services/auth.service';
import { UserService } from 'src/modules/services/user.service';

@GrpcController('AuthService')
export class AuthGrpcController {
    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
    ) {}

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

    @GrpcMethod('GetUsersByRole')
    async getUsersByRole(data: GetUsersByRoleRequest): Promise<GetUsersByRoleResponse> {
        try {
            const role = (data.role ?? 'admin').toLowerCase() as any;
            const result = await this.userService.getAccountsByRole(role, { page: 1, limit: 1000 });
            return {
                users: result.items.map((u: any) => ({
                    id: u.id,
                    role: u.role,
                    fullName: u.fullName ?? '',
                    email: u.email ?? '',
                })),
            };
        } catch {
            return { users: [] };
        }
    }
}
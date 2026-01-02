import { AdminOnly } from "src/common/decorators/auth-roles.decorator";
import { UserResponseDto } from "../dtos/user.response.dto";
import { UserService } from "../services/user.service";
import { Controller, Get } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { AuthResponseDto } from "src/modules/auth/dtos/auth.response.dto";

@Controller("/admin/user")
export class UserAdminController {
    constructor(
        private readonly userService: UserService
    ) {}

    @AdminOnly()
    @Get()
    @MessageKey('Lấy danh sách người dùng thành công', UserResponseDto)
    async getAllUser(): Promise<UserResponseDto[]>{
        return this.userService.getAllUser();
    }
}
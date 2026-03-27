import { AdminOnly } from "src/common/decorators/auth-roles.decorator";
import { UserResponseDto } from "../dtos/user.response.dto";
import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { MessageKey } from "src/common/decorators/message.decorator";
import { UserService } from "../services/user.service";
import { UserRole } from "generated/prisma/enums";
import { AdminAccountQueryDto, AdminBanAccountDto, AdminCreateAccountDto } from "../dtos/admin-user.dto";

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

    @AdminOnly()
    @Get('/users')
    @MessageKey('Lấy danh sách tài khoản người dùng thành công')
    async getUsers(@Query() query: AdminAccountQueryDto) {
        return this.userService.getAccountsByRole(UserRole.user, query);
    }

    @AdminOnly()
    @Get('/admins')
    @MessageKey('Lấy danh sách tài khoản quản trị thành công')
    async getAdmins(@Query() query: AdminAccountQueryDto) {
        return this.userService.getAccountsByRole(UserRole.admin, query);
    }

    @AdminOnly()
    @Post('/users')
    @MessageKey('Tạo tài khoản người dùng thành công', UserResponseDto)
    async createUserAccount(@Body() body: AdminCreateAccountDto): Promise<UserResponseDto> {
        return this.userService.createAccountByRole(UserRole.user, body);
    }

    @AdminOnly()
    @Post('/admins')
    @MessageKey('Tạo tài khoản quản trị thành công', UserResponseDto)
    async createAdminAccount(@Body() body: AdminCreateAccountDto): Promise<UserResponseDto> {
        return this.userService.createAccountByRole(UserRole.admin, body);
    }

    @AdminOnly()
    @Put('/:id/ban')
    @MessageKey('Cập nhật trạng thái ban tài khoản thành công', UserResponseDto)
    async banAccount(
        @Param('id') id: string,
        @Body() body: AdminBanAccountDto,
    ): Promise<UserResponseDto> {
        return this.userService.banAccount(id, body.reason, body.until);
    }

    @AdminOnly()
    @Put('/:id/unban')
    @MessageKey('Gỡ ban tài khoản thành công', UserResponseDto)
    async unbanAccount(@Param('id') id: string): Promise<UserResponseDto> {
        return this.userService.unbanAccount(id);
    }

    @AdminOnly()
    @Get('/:id')
    @MessageKey('Lấy thông tin chi tiết tài khoản thành công', UserResponseDto)
    async getAccountDetail(@Param('id') id: string): Promise<UserResponseDto | null> {
        return this.userService.getProfileById(id);
    }
}
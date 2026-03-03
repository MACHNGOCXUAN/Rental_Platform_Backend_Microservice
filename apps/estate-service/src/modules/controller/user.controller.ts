import { Controller, Get, Param } from '@nestjs/common';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import { UserService } from '../services/user.service';

@Controller('user')
export class UserController {
    
    constructor(
            private readonly userService: UserService,
        ) { }

    @Get(":id")
    @PublicRoute()
    getProfile(@Param("id") id: string) {
        return this.userService.getProfileById(id)
    }
}

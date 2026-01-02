import { Controller, Get } from '@nestjs/common';

@Controller('user')
export class UserController {
    @Get()
    getProfile() {
        return { message: 'User profile endpoint' };
    }
}

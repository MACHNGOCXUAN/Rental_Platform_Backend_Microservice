import { Module } from '@nestjs/common';
import { UserController } from './controller/user.controller';
import { UserService } from './services/user.service';
import { CommonModule } from 'src/common/common.module';
import { UserAdminController } from './controller/user.admin.controller';

@Module({
  imports: [CommonModule],
  controllers: [UserController, UserAdminController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}

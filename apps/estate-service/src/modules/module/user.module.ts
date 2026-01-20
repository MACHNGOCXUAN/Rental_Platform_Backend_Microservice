import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { UserController } from '../controller/user.controller';
import { UserAdminController } from '../controller/user.admin.controller';
import { UserService } from '../services/user.service';

@Module({
  imports: [CommonModule],
  controllers: [UserController, UserAdminController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}

import { Body, Controller, Param, Patch } from '@nestjs/common';
import { AdminOnly } from 'src/common/decorators/auth-roles.decorator';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { KycService } from '../services/kyc.service';
import type { IAuthPayload } from '../interfaces/auth.interface';
import { RejectKycDto } from '../dtos/kyc.dto';

@Controller('/admin/kyc')
export class KycAdminController {
  constructor(private readonly kycService: KycService) {}

  @AdminOnly()
  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @AuthUser() user: IAuthPayload,
  ) {
    return this.kycService.adminApproveKyc(id, user.id);
  }

  @AdminOnly()
  @Patch(':id/reject')
  async reject(
    @Param('id') id: string,
    @AuthUser() user: IAuthPayload,
    @Body() body: RejectKycDto,
  ) {
    return this.kycService.adminRejectKyc(id, user.id, body);
  }
}

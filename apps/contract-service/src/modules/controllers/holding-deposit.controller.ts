import { Body, Controller, Post } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { OpenHoldingDepositDto, PayHoldingDepositDto } from '../dtos/rental-request.dto';
import { RentalRequestService } from '../services/rental-request.service';

@Controller('holding-deposits')
export class HoldingDepositController {
  constructor(private readonly rentalRequestService: RentalRequestService) {}

  @Post('open')
  @MessageKey('Mở đặt cọc giữ chỗ thành công')
  openHoldingDeposit(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: OpenHoldingDepositDto,
  ) {
    return this.rentalRequestService.openHoldingDepositWindow(user.id, dto);
  }

  @Post('pay')
  @MessageKey('Thanh toán giữ chỗ thành công')
  payHoldingDeposit(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: PayHoldingDepositDto,
  ) {
    return this.rentalRequestService.payHoldingDeposit(user.id, dto);
  }
}

import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { PaymentService } from '../services/payment.service';
import { ConfirmPaymentDto, PaymentQueryDto } from '../dtos/payment.dto';

@Controller('payments')
export class PaymentController {

    constructor(private readonly paymentService: PaymentService) { }

    @Get('my')
    getMyPayments(
        @AuthUser() user: IAuthUserPayload,
        @Query() query: PaymentQueryDto,
    ) {
        return this.paymentService.getMyPayments(user.id, query);
    }

    @Get('contract/:rentalId/summary')
    getContractPaymentSummary(
        @AuthUser() user: IAuthUserPayload,
        @Param('rentalId') rentalId: string,
    ) {
        return this.paymentService.getContractPaymentSummary(rentalId, user.id);
    }

    @Get(':id')
    getPaymentDetail(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') paymentId: string,
    ) {
        return this.paymentService.getPaymentDetail(paymentId, user.id);
    }

    @Put(':id/confirm')
    @MessageKey('Xác nhận thanh toán thành công')
    confirmPayment(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') paymentId: string,
        @Body() dto: ConfirmPaymentDto,
    ) {
        return this.paymentService.confirmPayment(paymentId, dto, user.id);
    }
}

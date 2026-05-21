import { BadRequestException, Body, Controller, Get, InternalServerErrorException, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { PaymentService, verifyMomoSignature } from '../services/payment.service';
import { ConfirmPaymentDto, PaymentQueryDto, PaymentReconcileQueryDto } from '../dtos/payment.dto';
import { PublicRoute } from 'src/common/decorators/public.decorator';

@Controller('payments')
export class PaymentController {

    constructor(private readonly paymentService: PaymentService) { }

    @Post(':contractId/deposit')
    createDepositPayment(
        @AuthUser() _authUser: IAuthUserPayload,
        @Param('contractId') contractId: string,
    ) {
        return this.paymentService.createDepositPayment(contractId);
    }

    @Get('my')
    getMyPayments(
        @AuthUser() authUser: IAuthUserPayload,
        @Query() query: PaymentQueryDto,
    ) {
        return this.paymentService.getMyPayments(authUser.id, query);
    }

    @Get('reconcile-pending')
    reconcilePendingPayments(
        @AuthUser() _authUser: IAuthUserPayload,
        @Query() query: PaymentReconcileQueryDto,
    ) {
        return this.paymentService.reconcilePendingPayments(query);
    }

    @Get(':paymentId/verify-blockchain')
    verifyPaymentBlockchain(
        @AuthUser() authUser: IAuthUserPayload,
        @Param('paymentId') paymentId: string,
    ) {
        return this.paymentService.verifyPaymentBlockchain(paymentId, authUser.id);
    }

    @Put(':paymentId/confirm')
    confirmPaymentById(
        @AuthUser() authUser: IAuthUserPayload,
        @Param('paymentId') paymentId: string,
        @Body() confirmPaymentDto: ConfirmPaymentDto,
    ) {
        return this.paymentService.confirmPayment(paymentId, confirmPaymentDto, authUser.id);
    }

    @Post("confirm/:paymentId")
    confirmPayment(
        @AuthUser() authUser: IAuthUserPayload,
        @Param('paymentId') paymentId: string,
        @Body() confirmPaymentDto: ConfirmPaymentDto,
    ) {
        return this.paymentService.confirmPayment(paymentId, confirmPaymentDto, authUser.id);
    }

    @Post('webhook')
    @PublicRoute()
    async handlePaymentWebhook(@Body() body: any) {
        try {
            console.log("📩 MOMO WEBHOOK:", body);

            // 1. Check result
            if (body.resultCode !== 0) {
                throw new BadRequestException('Payment failed');
            }

            // 2. Verify signature
            const isValid = verifyMomoSignature(
                body,
                process.env.MOMO_ACCESS_KEY!,
                process.env.MOMO_SECRET_KEY!
            );

            if (!isValid) {
                throw new BadRequestException('Invalid signature');
            }

            // 3. Mapping data
            const paymentCode = body.orderId;
            const requestId = body.requestId;
            const transactionId = String(body.transId);
            const paidAmount = Number(body.amount);
            const transactionRef = `MOMO-${body.transId}`;

            // 4. Call service
            const result = await this.paymentService.handlePaymentWebhook(
                paymentCode,
                transactionId,
                transactionRef,
                paidAmount,
                requestId
            );

            return {
                success: true,
                data: result,
            };

        } catch (error) {
            console.error("❌ MOMO WEBHOOK ERROR:", error);

            // Nếu là lỗi mình throw ra (BadRequest, NotFound...)
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            // Lỗi không xác định
            throw new InternalServerErrorException('Webhook processing failed');
        }
    }
}

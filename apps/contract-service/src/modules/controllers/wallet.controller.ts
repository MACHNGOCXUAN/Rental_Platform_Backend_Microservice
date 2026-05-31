import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { WalletService } from '../services/wallet.service';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { PublicRoute } from 'src/common/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import {
  ConfirmWalletTopupDto,
  WalletTopupDto,
  WalletTransactionQueryDto,
  WithdrawalQueryDto,
  WithdrawalRequestDto,
} from '../dtos/wallet.dto';

@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly config: ConfigService,
  ) { }

  @Post('internal/deduct')
  @PublicRoute('Internal: khấu trừ tiền ví cho dịch vụ khác')
  async deductWalletInternal(
    @Body() dto: { userId: string; amount: number; description: string },
    @Req() request: express.Request,
  ) {
    const expected = this.config.get<string>('ESTATE_INTERNAL_TOKEN');
    if (expected) {
      const token = request.headers['x-internal-token'];
      if (typeof token !== 'string' || token !== expected) {
        throw new UnauthorizedException('Internal token is invalid');
      }
    }
    return this.walletService.deductWallet(dto.userId, dto.amount, dto.description);
  }

  // Tạo ví mới khi người dùng được tạo
  @EventPattern('user.created')
  handleUserCreated(data: any) {
    console.log("Kiểm tra rabbitMQ: ", data);

    return this.walletService.createWallet(data.userId);
  }

  // Lấy số dư ví của người dùng
  @Get('balance')
  getWalletBalance(@AuthUser() user: IAuthUserPayload) {
    return this.walletService.getWalletBalance(user.id);
  }

  // Lấy lịch sử giao dịch của ví
  @Get('transactions')
  getWalletTransactions(
    @AuthUser() user: IAuthUserPayload,
    @Query() query: WalletTransactionQueryDto,
  ) {
    return this.walletService.getWalletTransactions(user.id, query);
  }

  // Yêu cầu nạp tiền vào ví
  @Post('topup')
  topupWallet(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: WalletTopupDto,
  ) {
    return this.walletService.initiateTopup(user.id, dto);
  }

  // Xác nhận nạp tiền vào ví
  @Post('topup/:transactionId/confirm')
  confirmTopup(
    @AuthUser() user: IAuthUserPayload,
    @Param('transactionId') transactionId: string,
    @Body() dto: ConfirmWalletTopupDto,
  ) {
    return this.walletService.confirmTopup(user.id, transactionId, dto);
  }

  // Lấy trạng thái nạp tiền vào ví
  @Get('topup/:transactionId/status')
  getTopupStatus(
    @AuthUser() user: IAuthUserPayload,
    @Param('transactionId') transactionId: string,
  ) {
    return this.walletService.getTopupStatus(user.id, transactionId);
  }

  // Xử lý webhook từ MoMo sau khi người dùng nạp tiền qua MoMo
  @Post('webhook/momo')
  @PublicRoute('MoMo topup webhook')
  handleMomoTopupWebhook(@Body() body: any) {
    return this.walletService.handleMomoTopupWebhook(body);
  }

  // Xử lý webhook từ VNPAY sau khi người dùng nạp tiền qua VNPAY
  @Get('webhook/vnpay')
  @PublicRoute('VNPAY topup webhook')
  handleVnpayTopupWebhook(@Query() query: any) {
    console.log("vnpay query: ", query);

    return this.walletService.handleVnpayTopupWebhook(query);
  }

  // Yêu cầu rút tiền từ ví
  @Post('withdrawals')
  createWithdrawal(
    @AuthUser() user: IAuthUserPayload,
    @Body() dto: WithdrawalRequestDto,
  ) {
    return this.walletService.createWithdrawalRequest(user.id, dto);
  }

  @Get('withdrawals/:withdrawalId')
  getWithdrawalRequestById(
    @AuthUser() user: IAuthUserPayload,
    @Param('withdrawalId') withdrawalId: string,
  ) {
    return this.walletService.getWithdrawalRequestById(user.id, withdrawalId);
  }

  // Lấy danh sách yêu cầu rút tiền của người dùng
  @Get('withdrawals')
  getMyWithdrawals(
    @AuthUser() user: IAuthUserPayload,
    @Query() query: WithdrawalQueryDto,
  ) {
    return this.walletService.getMyWithdrawalRequests(user.id, query);
  }
}
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthPayload } from '../interfaces/auth.interface';
import { KycService } from '../services/kyc.service';

@Controller('kyc')
export class KycController {
  constructor(private kycService: KycService) {}

  @Post('submit')
  @UseInterceptors(FilesInterceptor('files', 3))
  async submit(
    @AuthUser() user: IAuthPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length < 3) {
      throw new BadRequestException('Vui long gui du 3 anh: selfie, back, front');
    }

    return this.kycService.verifyAndPersist(user.id, files);
  }

  @Post('verify')
  @UseInterceptors(FilesInterceptor('files', 3))
  async verify(
    @AuthUser() user: IAuthPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length < 3) {
      throw new BadRequestException('Vui long gui du 3 anh: selfie, back, front');
    }

    return this.kycService.verifyAndPersist(user.id, files);
  }

  @Post('save-for-admin')
  @UseInterceptors(FilesInterceptor('files', 3))
  async saveForAdmin(
    @AuthUser() user: IAuthPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length < 3) {
      throw new BadRequestException('Vui long gui du 3 anh: selfie, back, front');
    }

    return this.kycService.saveForAdminReview(user.id, files);
  }

  @Post('request-review')
  async requestReview(
    @AuthUser() user: IAuthPayload,
    @Body() body: { kycId: string },
  ) {
    return this.kycService.requestManualReview(user.id, body.kycId);
  }

  @Post('extract-ocr')
  @UseInterceptors(FilesInterceptor('files', 2))
  async extractOcr(
    @AuthUser() user: IAuthPayload,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length < 2) {
      throw new BadRequestException('Vui lòng gửi đủ 2 ảnh: mặt trước và mặt sau thẻ');
    }
    return this.kycService.extractOcr(user.id, files);
  }

  @Post('verify-face')
  @UseInterceptors(FilesInterceptor('files', 1))
  async verifyFace(
    @AuthUser() user: IAuthPayload,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { kycId: string },
  ) {
    if (!files || files.length < 1) {
      throw new BadRequestException('Vui lòng chụp hoặc gửi ảnh selfie');
    }
    if (!body.kycId) {
      throw new BadRequestException('Mã hồ sơ KYC là bắt buộc');
    }
    return this.kycService.verifyFace(user.id, body.kycId, files[0]);
  }
}
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
}
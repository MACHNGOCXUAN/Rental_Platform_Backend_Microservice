import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import type { IAuthPayload } from '../interfaces/auth.interface';
import { KycService } from '../services/kyc.service';

@Controller('kyc')
export class KycController {
  constructor(private kycService: KycService) {}

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
}
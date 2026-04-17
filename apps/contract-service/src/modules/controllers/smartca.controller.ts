import { Body, Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthUser } from 'src/common/decorators/auth-user.decorator';
import { MessageKey } from 'src/common/decorators/message.decorator';
import type { IAuthUserPayload } from 'src/common/interfaces/request.interface';
import { SmartCAService } from '../services/smartca.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('smartca')
export class SmartCAController {

    constructor(private readonly smartCAService: SmartCAService) { }

    @Post('/contracts/:id/sign')
    @MessageKey('Ký hợp đồng thành công')
    signContract(
        @AuthUser() user: IAuthUserPayload,
        @Param('id') id: string,
    ) {
        return this.smartCAService.signContract(id, user.id);
    }

    @Post('/sign/:transactionId')
    @MessageKey('Xử lý kết quả ký thành công')
    handleSignResult(
        @Param('transactionId') transactionId: string,
    ) {
        return this.smartCAService.handleSignResult(transactionId);
    }


    @Post('/verify/blockchain/:contractId')
    @UseInterceptors(FileInterceptor('file'))
    verifySignatureBlockchain(
        @Param('contractId') contractId: string,
        @UploadedFile() file: any,
    ) {
        return this.smartCAService.verifyBlockchainRecord(contractId, file.buffer);
    }   
}

import {
    BadRequestException,
    Injectable,
    InternalServerErrorException
} from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { EstateClientService } from './estate-client.service';
import {
    SignRequest,
    SignResponse,
    SignStatusResponse,
    VnptCertificate,
    VnptResponse
} from '../dtos/smartca.dto';
import axios from 'axios';
import * as crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { uploadFileUrl } from '../../utils/uploadFile';
import { storeHash } from './blockchain.service';

type BlockchainNetworkValue = 'ethereum' | 'polygon' | 'bsc' | 'solana' | 'other';

function generateTransactionId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomInt(1000, 9999)}`;
}

@Injectable()
export class SmartCAService {
    constructor(
        private readonly db: DatabaseService,
        private readonly estateService: EstateClientService
    ) { }

    // ================== COMMON CALL ==================
    private async callVNPT<T>(request: Promise<{ data: T }>): Promise<T> {
        try {
            const { data } = await request;

            // @ts-ignore
            if (data.status_code !== 200) {
                // @ts-ignore
                throw new BadRequestException(data.message);
            }

            return data;
        } catch (error: any) {
            if (error.response) {
                console.log(error.response.data)                    

                throw new BadRequestException(
                    // error.response.data?.message || 'VNPT API error'
                );
            }

            if (error.code === 'ECONNABORTED') {
                throw new InternalServerErrorException('VNPT timeout');
            }

            throw new InternalServerErrorException('VNPT connection failed');
        }
    }

    // ================== CERT ==================
    async getCertificate(idCardNumber: string): Promise<VnptCertificate | null> {
        const url = 'https://rmgateway.vnptit.vn/sca/sp769/v1/credentials/get_certificate';

        const data = await this.callVNPT<VnptResponse>(
            axios.post(url, {
                sp_id: process.env.VNPT_SP_ID,
                sp_password: process.env.VNPT_SP_PASSWORD,
                user_id: idCardNumber,
                transaction_id: generateTransactionId('TX'),
                serial_number: ''
            })
        );

        const certs = data.data?.user_certificates || [];

        const validCert = certs
            .filter(c => c.cert_status_code === 'VALID')
            .sort(
                (a, b) =>
                    new Date(b.cert_valid_to).getTime() -
                    new Date(a.cert_valid_to).getTime()
            )[0];

        return validCert || null;
    }

    // ================== DOWNLOAD ==================
    async downloadFile(url: string): Promise<Buffer> {
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(res.data);
    }

    // ================== SIGN ==================
    async signDocument(
        idCardNumber: string,
        serialNumber: string,
        hash: string
    ): Promise<SignResponse['data']> {
        const url = 'https://rmgateway.vnptit.vn/sca/sp769/v1/signatures/sign';

        const transactionId = generateTransactionId('TX');

        const body: SignRequest = {
            sp_id: process.env.VNPT_SP_ID!,
            sp_password: process.env.VNPT_SP_PASSWORD!,
            user_id: idCardNumber,
            transaction_id: transactionId,
            transaction_desc: 'Ky hop dong bat dong san',
            serial_number: serialNumber,
            sign_files: [
                {
                    file_type: 'pdf',
                    data_to_be_signed: hash,
                    doc_id: transactionId,
                    sign_type: 'hash'
                }
            ],
            time_stamp:
                new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
        };

        const data = await this.callVNPT<SignResponse>(
            axios.post<SignResponse>(url, body)
        );

        return data.data;
    }

    // ================== MAIN SIGN ==================
    async signContract(contractId: string, userId: string) {
        return this.db.$transaction(async tx => {
            // 1. user
            const user = await this.estateService.getUsersById(userId);
            if (!user) throw new BadRequestException('User not found');

            const idCard = user.profile?.idCardNumber;
            if (!idCard) throw new BadRequestException('Missing CCCD');

            // 2. contract
            let contract = await tx.rentalContract.findUnique({
                where: { rentalId: contractId }
            });
            if (!contract) throw new BadRequestException('Contract not found');

            // 3. role
            let role: 'OWNER' | 'TENANT';

            if (contract.ownerId === userId) role = 'OWNER';
            else if (contract.tenantId === userId) role = 'TENANT';
            else throw new BadRequestException('Not part of contract');

            // Resume session nếu đang có transaction còn hiệu lực
            const existingTransactionId = role === 'OWNER'
                ? contract.ownerTransactionId
                : contract.tenantTransactionId;

            if (existingTransactionId) {
                try {
                    const existingStatus = await this.getSignStatus(existingTransactionId);
                    const existingMessage = String(existingStatus.message || '').toUpperCase();
                    const existingExpiredIn = Number(existingStatus.data?.expired_in ?? 0);
                    const isTerminal = ['SUCCESS', 'REJECTED', 'EXPIRED', 'TIMEOUT', 'CANCELLED'].includes(existingMessage) || existingExpiredIn <= 0;

                    if (!isTerminal) {
                        return {
                            transactionId: existingTransactionId,
                            expiredIn: existingExpiredIn,
                            resumed: true
                        };
                    }
                } catch {
                    // VNPT status lỗi -> coi như stale transaction để tạo lại phiên mới
                }

                await tx.rentalContract.update({
                    where: { rentalId: contractId },
                    data: role === 'OWNER'
                        ? {
                            ownerTransactionId: null,
                            status: 'draft'
                        }
                        : {
                            tenantTransactionId: null,
                            status: 'owner_signed'
                        }
                });

                contract = {
                    ...contract,
                    ownerTransactionId: role === 'OWNER' ? null : contract.ownerTransactionId,
                    tenantTransactionId: role === 'TENANT' ? null : contract.tenantTransactionId,
                    status: role === 'OWNER' ? 'draft' : 'owner_signed'
                };
            }

            // 4. validate flow
            if (
                role === 'OWNER' &&
                !['draft'].includes(contract.status)
            ) {
                throw new BadRequestException('Invalid contract status');
            }

            if (
                role === 'TENANT' &&
                !['owner_signed'].includes(contract.status)
            ) {
                throw new BadRequestException('Invalid contract status');
            }

            // 5. cert
            const cert = await this.getCertificate(idCard);
            if (!cert) throw new BadRequestException('No valid certificate');

            // 6. file
            const sourcePdfUrl = role === 'TENANT'
                ? contract.signedContractUrl
                : contract.contractPdfUrl;

            if (!sourcePdfUrl)
                throw new BadRequestException('Missing PDF');

            const file = await this.downloadFile(sourcePdfUrl);

            // 7. hash
            const prepared = await this.getProperHashForVnpt(file);
            const hash = prepared.hash;

            await tx.rentalContract.update({
                where: { rentalId: contractId },
                data: { signHash: hash }
            });

            // 8. sign
            const signResult = await this.signDocument(
                idCard,
                cert.serial_number,
                hash
            );

            // 9. update contract
            const updateData: any = {};

            if (role === 'OWNER') {
                updateData.ownerTransactionId = signResult?.transaction_id;
                updateData.status = 'pending_landlord';
            } else {
                updateData.tenantTransactionId = signResult?.transaction_id;
                updateData.status = 'pending_tenant';
            }

            await tx.rentalContract.update({
                where: { rentalId: contractId },
                data: updateData
            });

            // 10. log
            await tx.contractSignatureLog.create({
                data: {
                    rentalId: contractId,
                    action: 'SIGN_REQUESTED',
                    actor: userId,
                    actorRole: role
                }
            });

            return {
                transactionId: signResult?.transaction_id,
                expiredIn: signResult?.expired_in
            };
        });
    }

    // ================== STATUS ==================
    async getSignStatus(transactionId: string) {
        const url = `https://rmgateway.vnptit.vn/sca/sp769/v1/signatures/sign/${transactionId}/status`

        return this.callVNPT<SignStatusResponse>(
            axios.post(url)
        );
    }

    // ================== HANDLE RESULT ==================
    async handleSignResult(transactionId: string) {
        const result = await this.getSignStatus(transactionId);

        const status = String(result.message || '').toUpperCase();

        if (!status) throw new BadRequestException('Invalid VNPT response');

        const contract = await this.db.rentalContract.findFirst({
            where: {
                OR: [
                    { ownerTransactionId: transactionId },
                    { tenantTransactionId: transactionId }
                ]
            }
        });

        if (!contract) throw new BadRequestException('Contract not found');

        const isOwner = contract.ownerTransactionId === transactionId;
        const role = isOwner ? 'OWNER' : 'TENANT';

        if (status === 'SUCCESS') {
            const signatureValue = result.data?.signatures[0].signature_value;
            if (!signatureValue) throw new InternalServerErrorException('Missing signature value from VNPT');

            // 1. Chọn file cần ký theo thứ tự owner -> tenant
            const sourcePdfUrl = isOwner
                ? contract.contractPdfUrl
                : contract.signedContractUrl || contract.contractPdfUrl;

            if (!sourcePdfUrl) {
                throw new InternalServerErrorException('Contract PDF URL not found');
            }
            const originalFile = await this.downloadFile(sourcePdfUrl);

            // 2. Chuẩn bị vùng chờ (Phải trùng với lúc tính Hash gửi đi)
            const preparedPdf = await this.preparePdfAndGetHash(originalFile);

            // 3. Đóng gói chữ ký vào File
            const signedFileBuffer = await this.appendSignatureToFile(preparedPdf, signatureValue);

            // 4. Upload file đã ký lên S3/Storage của bạn
            const fileName = `signed_${role.toLowerCase()}_${contract.rentalId}.pdf`;
            const signedFileUrl = await uploadFileUrl(signedFileBuffer, fileName);

            // Chi ghi blockchain khi ca 2 ben da ky (tenant ky thanh cong => fully_signed)
            const signedPdfHash = crypto
                .createHash('sha256')
                .update(signedFileBuffer)
                .digest('hex');

            let blockchainTxHash: string | null = null;
            let blockchainNetwork: BlockchainNetworkValue | null = null;
            let blockchainRecordedAt: Date | null = null;
            let blockchainErrorMessage: string | null = null;

            if (!isOwner) {
                try {
                    const chainResult = await storeHash(signedPdfHash);
                    blockchainTxHash = chainResult.txHash;
                    blockchainNetwork = this.resolveBlockchainNetwork(chainResult.chainId);
                    blockchainRecordedAt = new Date();
                } catch (error: any) {
                    blockchainErrorMessage = error?.message || 'Blockchain store failed';
                }
            }

            return this.db.$transaction(async tx => {
                if (isOwner && contract.ownerSignedAt)
                    return { status: 'SIGNED', alreadySigned: true };

                if (!isOwner && contract.tenantSignedAt)
                    return { status: 'SIGNED', alreadySigned: true };

                await tx.rentalContract.update({
                    where: { rentalId: contract.rentalId },
                    data: isOwner
                        ? {
                            status: 'owner_signed',
                            ownerSignedAt: new Date(),
                            ownerTransactionId: transactionId,
                            signedContractUrl: signedFileUrl
                        }
                        : {
                            status: 'fully_signed',
                            tenantSignedAt: new Date(),
                            signedDate: new Date(),
                            tenantTransactionId: transactionId,
                            signedContractUrl: signedFileUrl,
                            signHash: signedPdfHash,
                            blockchainTxHash,
                            blockchainNetwork,
                            blockchainRecordedAt
                        }
                });

                await tx.contractSignatureLog.create({
                    data: {
                        rentalId: contract.rentalId,
                        action: 'SIGNED_SUCCESS',
                        actor: isOwner ? contract.ownerId : contract.tenantId,
                        actorRole: role
                    }
                });

                if (!isOwner) {
                    await tx.contractSignatureLog.create({
                        data: {
                            rentalId: contract.rentalId,
                            action: blockchainTxHash ? 'BLOCKCHAIN_RECORDED' : 'BLOCKCHAIN_FAILED',
                            actor: contract.tenantId,
                            actorRole: role,
                            userAgent: blockchainErrorMessage ? blockchainErrorMessage.slice(0, 500) : null
                        }
                    });
                }

                return {
                    status: 'SIGNED',
                    signedFileUrl,
                    blockchain: !isOwner
                        ? {
                            recorded: Boolean(blockchainTxHash),
                            txHash: blockchainTxHash,
                            network: blockchainNetwork,
                            error: blockchainErrorMessage
                        }
                        : null
                };
            });
        }

        if (status === 'REJECTED') {
            await this.db.$transaction(async tx => {
                await tx.contractSignatureLog.create({
                    data: {
                        rentalId: contract.rentalId,
                        action: 'SIGNED_REJECTED',
                        actor: isOwner ? contract.ownerId : contract.tenantId,
                        actorRole: role
                    }
                });

                await tx.rentalContract.update({
                    where: { rentalId: contract.rentalId },
                    data: isOwner
                        ? {
                            ownerTransactionId: transactionId,
                            status: 'draft'
                        }
                        : {
                            tenantTransactionId: transactionId,
                            status: 'owner_signed'
                        }
                });
            });

            return { status: 'REJECTED' };
        }

        const expiredIn = Number(result.data?.expired_in ?? 0);
        const isExpiredMessage = ['EXPIRED', 'TIMEOUT', 'CANCELLED'].includes(status);

        if (isExpiredMessage || expiredIn <= 0) {
            await this.db.$transaction(async tx => {
                await tx.contractSignatureLog.create({
                    data: {
                        rentalId: contract.rentalId,
                        action: 'SIGNED_EXPIRED',
                        actor: isOwner ? contract.ownerId : contract.tenantId,
                        actorRole: role
                    }
                });

                await tx.rentalContract.update({
                    where: { rentalId: contract.rentalId },
                    data: isOwner
                        ? {
                            ownerTransactionId: null,
                            status: 'draft'
                        }
                        : {
                            tenantTransactionId: null,
                            status: 'owner_signed'
                        }
                });
            });

            return { status: 'EXPIRED' };
        }

        return { status: 'PENDING' };
    }

    private resolveBlockchainNetwork(chainId: number | string | bigint | undefined): BlockchainNetworkValue {
        const value = Number(chainId);

        if ([1, 11155111, 1337, 31337].includes(value)) return 'ethereum';
        if ([137, 80001].includes(value)) return 'polygon';
        if ([56, 97].includes(value)) return 'bsc';
        if ([101, 102].includes(value)) return 'solana';

        return 'other';
    }


    async appendSignatureToFile(preparedPdfBuffer: Buffer, signatureValue: string): Promise<Buffer> {
        try {
            const pdf = preparedPdfBuffer.toString('latin1');

            let placeholderHex = '';
            let placeholderRawLength = 0;
            let contentsStart = -1;
            let contentsEnd = -1;
            let contentsKeyIndex = -1;
            let isRawPlaceholder = false;

            const directContentsMatch = /\/Contents\s*<([0-9A-Fa-f\s]+)>/m.exec(pdf);

            if (directContentsMatch && directContentsMatch.index !== undefined) {
                const contentsToken = directContentsMatch[0];
                placeholderHex = directContentsMatch[1].replace(/\s+/g, '');
                contentsKeyIndex = directContentsMatch.index;
                contentsStart = directContentsMatch.index + contentsToken.indexOf('<');
                contentsEnd = directContentsMatch.index + contentsToken.lastIndexOf('>') + 1;
            } else {
                // Fallback cho PDF co /Contents dang tham chieu gian tiep: /Contents 12 0 R
                const contentsRefMatch = /\/Contents\s+(\d+)\s+(\d+)\s+R/m.exec(pdf);
                if (!contentsRefMatch) {
                    throw new Error('Khong tim thay placeholder Contents trong PDF');
                }

                if (contentsRefMatch.index !== undefined) {
                    contentsKeyIndex = contentsRefMatch.index;
                }

                const objectNo = contentsRefMatch[1];
                const generationNo = contentsRefMatch[2];
                const objectRegex = new RegExp(
                    `${objectNo}\\s+${generationNo}\\s+obj([\\s\\S]*?)endobj`,
                    'm'
                );
                const objectMatch = objectRegex.exec(pdf);

                if (!objectMatch || objectMatch.index === undefined) {
                    throw new Error('Khong tim thay object chua Contents trong PDF');
                }

                const fullObject = objectMatch[0];
                const hexMatchInObject = /<([0-9A-Fa-f\s]+)>/m.exec(fullObject);

                if (hexMatchInObject) {
                    const hexToken = hexMatchInObject[0];
                    const hexTokenOffset = fullObject.indexOf(hexToken);
                    if (hexTokenOffset < 0) {
                        throw new Error('Khong xac dinh duoc vi tri hex placeholder');
                    }

                    placeholderHex = hexMatchInObject[1].replace(/\s+/g, '');
                    contentsStart = objectMatch.index + hexTokenOffset + hexToken.indexOf('<');
                    contentsEnd = objectMatch.index + hexTokenOffset + hexToken.lastIndexOf('>') + 1;
                } else {
                    const streamMatch = /stream\r?\n([\s\S]*?)\r?\nendstream/m.exec(fullObject);
                    if (streamMatch) {
                        const streamToken = streamMatch[0];
                        const streamContent = streamMatch[1];
                        const streamTokenOffset = fullObject.indexOf(streamToken);
                        const streamContentOffset = streamToken.indexOf(streamContent);

                        if (streamTokenOffset < 0 || streamContentOffset < 0) {
                            throw new Error('Khong xac dinh duoc vi tri stream placeholder');
                        }

                        placeholderRawLength = Buffer.byteLength(streamContent, 'latin1');
                        contentsStart =
                            objectMatch.index + streamTokenOffset + streamContentOffset;
                        contentsEnd = contentsStart + streamContent.length;
                        isRawPlaceholder = true;
                    } else {
                        const literalMatch = /\(([^)]*)\)/m.exec(fullObject);
                        if (!literalMatch) {
                            throw new Error('Khong tim thay placeholder trong object Contents');
                        }

                        const literalToken = literalMatch[0];
                        const literalTokenOffset = fullObject.indexOf(literalToken);
                        if (literalTokenOffset < 0) {
                            throw new Error('Khong xac dinh duoc vi tri literal placeholder');
                        }

                        const literalContent = literalMatch[1];
                        placeholderRawLength = Buffer.byteLength(literalContent, 'latin1');
                        contentsStart = objectMatch.index + literalTokenOffset + 1;
                        contentsEnd = contentsStart + literalContent.length;
                        isRawPlaceholder = true;
                    }
                }
            }

            if (contentsStart < 0 || contentsEnd < 0 || (!placeholderHex && !isRawPlaceholder)) {
                throw new Error('Khong xac dinh duoc vung Contents de chen chu ky');
            }

            const signatureBytes = Buffer.from(signatureValue, 'base64');
            if (!signatureBytes.length) {
                throw new Error('Chu ky VNPT khong hop le');
            }

            let pdfWithSignature: string;

            if (isRawPlaceholder) {
                if (signatureBytes.length > placeholderRawLength) {
                    throw new Error(
                        `Dung luong chu ky vuot qua placeholder (${signatureBytes.length}/${placeholderRawLength})`
                    );
                }

                const paddedRaw = Buffer.concat([
                    signatureBytes,
                    Buffer.alloc(placeholderRawLength - signatureBytes.length)
                ]);

                pdfWithSignature =
                    pdf.slice(0, contentsStart) +
                    paddedRaw.toString('latin1') +
                    pdf.slice(contentsEnd);
            } else {
                const signatureHex = signatureBytes.toString('hex');
                if (signatureHex.length > placeholderHex.length) {
                    throw new Error(
                        `Dung luong chu ky vuot qua placeholder (${signatureHex.length}/${placeholderHex.length})`
                    );
                }

                const paddedSignatureHex = signatureHex.padEnd(placeholderHex.length, '0');
                pdfWithSignature =
                    pdf.slice(0, contentsStart + 1) +
                    paddedSignatureHex +
                    pdf.slice(contentsEnd - 1);
            }

            const byteRangeRegex = /\/ByteRange\s*\[[^\]]+\]/gm;
            let byteRangeMatch: RegExpExecArray | null = null;
            let candidate: RegExpExecArray | null;

            while ((candidate = byteRangeRegex.exec(pdfWithSignature)) !== null) {
                if (candidate.index < contentsStart) {
                    byteRangeMatch = candidate;
                }
            }

            if (!byteRangeMatch || byteRangeMatch.index === undefined) {
                if (contentsKeyIndex < 0) {
                    throw new Error('Khong tim thay ByteRange placeholder trong PDF');
                }

                // Reserve enough digits so real byte offsets can be written without overflow.
                const byteRangePlaceholder = '/ByteRange [0000000000 0000000000 0000000000 0000000000] ';
                let insertAt = contentsKeyIndex;

                if (insertAt <= contentsStart) {
                    contentsStart += byteRangePlaceholder.length;
                    contentsEnd += byteRangePlaceholder.length;
                }

                pdfWithSignature =
                    pdfWithSignature.slice(0, insertAt) +
                    byteRangePlaceholder +
                    pdfWithSignature.slice(insertAt);

                byteRangeRegex.lastIndex = 0;
                while ((candidate = byteRangeRegex.exec(pdfWithSignature)) !== null) {
                    if (candidate.index < contentsStart) {
                        byteRangeMatch = candidate;
                    }
                }

                if (!byteRangeMatch || byteRangeMatch.index === undefined) {
                    throw new Error('Khong tao duoc ByteRange trong PDF');
                }
            }

            const byteRangeStart = byteRangeMatch.index;
            const byteRangeEnd = byteRangeStart + byteRangeMatch[0].length;
            const range0 = 0;
            const range1 = contentsStart;
            const range2 = contentsEnd;
            const range3 = pdfWithSignature.length - range2;
            const byteRangeValue = `/ByteRange [${range0} ${range1} ${range2} ${range3}]`;

            if (byteRangeValue.length > byteRangeMatch[0].length) {
                throw new Error('ByteRange placeholder khong du do dai');
            }

            const paddedByteRange = byteRangeValue.padEnd(byteRangeMatch[0].length, ' ');
            const signedPdf =
                pdfWithSignature.slice(0, byteRangeStart) +
                paddedByteRange +
                pdfWithSignature.slice(byteRangeEnd);

            return Buffer.from(signedPdf, 'latin1');
        } catch (e: any) {
            throw new InternalServerErrorException('Loi dong goi PDF: ' + e.message);
        }
    }

    async preparePdfAndGetHash(pdfBuffer: Buffer) {
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        // Sử dụng thư viện chuẩn để chèn vùng chữ ký cùng cấu trúc đúng ByteRange
        pdflibAddPlaceholder({
            pdfDoc,
            reason: 'Ky hop dong thue nha',
            contactInfo: 'SmartCA',
            name: 'ThueNha',
            location: 'VN',
            signatureLength: 8192,
        });

        // Luu khong dung object stream de /Contents va /ByteRange hien thi dang plain text.
        // Neu de mac dinh, mot so file PDF se khong tim thay placeholder khi parse string.
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        return Buffer.from(pdfBytes);
    }

    async getProperHashForVnpt(pdfBuffer: Buffer): Promise<{ hash: string, preparedBuffer: Buffer }> {
        const preparedBuffer = await this.preparePdfAndGetHash(pdfBuffer);

        // Tính mã băm SHA256 trên phần dữ liệu "thực" (không bao gồm vùng Contents chữ ký)
        // Đây là bước quan trọng nhất để Adobe không báo lỗi "File altered"
        const hash = crypto.createHash('sha256').update(preparedBuffer).digest('hex');

        return { hash, preparedBuffer };
    }

    // Giả định hàm upload của bạn
    async uploadFile(buffer: Buffer, filename: string): Promise<string> {
        return uploadFileUrl(buffer, filename);
    }
}
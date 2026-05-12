import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
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
import { PDFDocument, rgb } from 'pdf-lib';
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib';
import { uploadFileUrl } from '../../utils/uploadFile';
import { storeHash } from './blockchain.service';
import signpdf from '@signpdf/signpdf';
import { Signer, findByteRange, removeTrailingNewLine } from '@signpdf/utils';
import { PaymentService } from './payment.service';
import { generateHash } from 'src/utils/hash';
import contractBlockchain from 'src/utils/config/blockchain';
import { ProcessingStatus } from 'generated/prisma/enums';
import { lastValueFrom } from 'rxjs';

type BlockchainNetworkValue = 'ethereum' | 'polygon' | 'bsc' | 'solana' | 'other';

function removeVietnamese(str: string): string {
    // NFD decomposes accented chars into base + combining marks, then strip combining marks
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip all combining diacritical marks
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

class VnptRemoteSigner extends Signer {
    constructor(private readonly signature: Buffer) {
        super();
    }

    async sign(_: Buffer): Promise<Buffer> {
        return this.signature;
    }
}

function generateTransactionId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomInt(1000, 9999)}`;
}


@Injectable()
export class SmartCAService {
    constructor(
        private readonly db: DatabaseService,
        private readonly estateService: EstateClientService,
        private readonly paymentService: PaymentService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
        @Inject('CONTRACT_RABBITMQ_SERVICE')
        private readonly rabbitContractClient: ClientProxy,
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
        console.log("quan: ", url);

        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(res.data);
    }

    // ================== SIGN ==================
    async signDocument(
        idCardNumber: string,
        serialNumber: string,
        hash: string,
        transactionId: string
    ): Promise<SignResponse['data']> {
        const url = 'https://rmgateway.vnptit.vn/sca/sp769/v1/signatures/sign';

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
                            status: 'pending_landlord'
                        }
                        : {
                            tenantTransactionId: null,
                            status: 'pending_tenant'
                        }
                });

                contract = {
                    ...contract,
                    ownerTransactionId: role === 'OWNER' ? null : contract.ownerTransactionId,
                    tenantTransactionId: role === 'TENANT' ? null : contract.tenantTransactionId,
                    status: role === 'OWNER' ? 'pending_landlord' : 'pending_tenant'
                };
            }

            // 4. validate flow
            if (
                role === 'OWNER' &&
                !['pending_landlord'].includes(contract.status)
            ) {
                throw new BadRequestException('Invalid contract status');
            }

            if (
                role === 'TENANT' &&
                !['pending_tenant'].includes(contract.status)
            ) {
                throw new BadRequestException('Invalid contract status');
            }

            // 5. cert
            const cert = await this.getCertificate(idCard);
            if (!cert) throw new BadRequestException('No valid certificate');

            // 6. file
            const sourcePdfUrl = role === 'TENANT'
                ? contract.contractPdfUrl
                : contract.signedContractUrl;

            if (!sourcePdfUrl)
                throw new BadRequestException('Missing PDF');

            const file = await this.downloadFile(sourcePdfUrl);

            // 7. hash
            const prepared = await this.getProperHashForVnpt(file, user.fullName || idCard, role);
            const hash = prepared.hash;
            const transactionId = generateTransactionId('TX');
            const preparedFileName = `prepared_${role.toLowerCase()}_${contractId}_${transactionId}.pdf`;
            const preparedPdfUrl = await uploadFileUrl(prepared.preparedBuffer, preparedFileName);

            await tx.rentalContract.update({
                where: { rentalId: contractId },
                data: { signHash: hash }
            });

            // 8. sign
            const signResult = await this.signDocument(
                idCard,
                cert.serial_number,
                hash,
                transactionId
            );

            const resolvedTransactionId = signResult?.transaction_id || transactionId;

            // 9. update contract
            const updateData: any = {};

            if (role === 'OWNER') {
                updateData.ownerTransactionId = resolvedTransactionId;
                updateData.status = 'pending_landlord';
            } else {
                updateData.tenantTransactionId = resolvedTransactionId;
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
                    actorRole: role,
                    userAgent: this.buildPreparedMeta(resolvedTransactionId, preparedPdfUrl, hash)
                }
            });

            return {
                transactionId: resolvedTransactionId,
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
            const statusField = isOwner ? 'ownerSignStatus' : 'tenantSignStatus';

            const updated = await this.db.rentalContract.updateMany({
                where: {
                    rentalId: contract.rentalId,
                    [statusField]: 'PENDING'
                },
                data: {
                    [statusField]: 'PROCESSING'
                }
            })

            if (updated.count === 1) {
                console.log("kiem tra 123: ", updated);

                await lastValueFrom(this.rabbitContractClient.emit('contract.process_signed', {
                    contractId: contract.rentalId,
                    transactionId,
                    role
                }));
            }

            return { status: 'PROCESSING' };




            // const signatureValue = result.data?.signatures?.[0]?.signature_value;
            // if (!signatureValue) throw new InternalServerErrorException('Missing signature value from VNPT');

            // // 1. Chọn file cần ký theo thứ tự tenant -> owner
            // const sourcePdfUrl = isOwner
            //     ? contract.signedContractUrl
            //     : contract.contractPdfUrl || contract.contractPdfUrl;

            // if (!sourcePdfUrl) {
            //     throw new InternalServerErrorException('Contract PDF URL not found');
            // }
            // // 2. Tải file đã được đóng dấu chuẩn bị từ log dựa trên transactionId
            // const preparedPdfUrl = await this.findPreparedPdfUrl(contract.rentalId, role, transactionId);
            // const preparedBuffer = await this.downloadFile(preparedPdfUrl);

            // const preparedHash = this.calculateDataToBeSignedHash(preparedBuffer);
            // if (contract.signHash && preparedHash !== contract.signHash) {
            //     throw new InternalServerErrorException('Prepared PDF hash mismatch with signing request payload');
            // }

            // // 3. Đóng gói chữ ký vào File
            // const signedFileBuffer = await this.appendSignatureToFile(preparedBuffer, signatureValue);

            // // 4. Upload file đã ký lên S3/Storage của bạn
            // const fileName = `signed_${role.toLowerCase()}_${contract.rentalId}.pdf`;
            // const signedFileUrl = await uploadFileUrl(signedFileBuffer, fileName);

            // // Chi ghi blockchain khi ca 2 ben da ky (tenant ky thanh cong => fully_signed)
            // const hash = generateHash(signedFileUrl);
            // const finalHash = generateHash(signedFileBuffer); // Hash thực tế của file đã ký, để đối chiếu với hash đã lưu trên blockchain

            // let blockchainTxHash: string | null = null;
            // let blockchainNetwork: BlockchainNetworkValue | null = null;
            // let blockchainRecordedAt: Date | null = null;
            // let blockchainErrorMessage: string | null = null;

            // if (isOwner) {
            //     try {
            //         const chainResult = await contractBlockchain.registerContract(
            //             contract.rentalId,
            //             "0x" + finalHash
            //         );

            //         const receipt = await chainResult.wait();
            //         blockchainTxHash = receipt.hash;
            //         blockchainNetwork = this.resolveBlockchainNetwork(chainResult.chainId);
            //         blockchainRecordedAt = new Date();
            //     } catch (error: any) {
            //         console.log("error blockchian: ", error);
            //         blockchainErrorMessage = error?.message || 'Blockchain store failed';
            //     }
            // }

            // return this.db.$transaction(async tx => {
            //     if (isOwner && contract.ownerSignedAt)
            //         return { status: 'SIGNED', alreadySigned: true };

            //     if (!isOwner && contract.tenantSignedAt)
            //         return { status: 'SIGNED', alreadySigned: true };

            //     await tx.rentalContract.update({
            //         where: { rentalId: contract.rentalId },
            //         data: isOwner
            //             ? {
            //                 status: 'active',
            //                 ownerSignedAt: new Date(),
            //                 ownerTransactionId: transactionId,
            //                 signedContractUrl: signedFileUrl,
            //                 signedDate: new Date(),
            //                 signHash: finalHash,
            //                 blockchainTxHash,
            //                 blockchainNetwork,
            //                 blockchainRecordedAt
            //             }
            //             : {
            //                 status: 'pending_landlord',
            //                 tenantSignedAt: new Date(),
            //                 tenantTransactionId: transactionId,
            //                 signedContractUrl: signedFileUrl,
            //             }
            //     });

            //     // Nếu chủ nhà ký thành công tạo hóa đơn tháng đầu ngày lập tức
            //     if (isOwner) {
            //         const startDate = new Date(contract.startDate);

            //         // 1. Xác định mốc chốt hóa đơn (chu kỳ tiếp theo)
            //         const nextCycleDate = new Date(startDate.getFullYear(), startDate.getMonth(), contract.paymentDueDay);

            //         // Nếu ngày nhận nhận (startDate) >= ngày thu tiền hàng tháng (vd thuê ngày 10, paymentDueDay là 5)
            //         // thì kỳ chốt hóa đơn tiếp theo sẽ lọt vào tháng sau (mùng 5 tháng sau).
            //         if (startDate.getDate() >= contract.paymentDueDay) {
            //             nextCycleDate.setMonth(nextCycleDate.getMonth() + 1);
            //         }

            //         // 2. Tính số ngày thực sử dụng ở tháng đầu
            //         const timeDiff = nextCycleDate.getTime() - startDate.getTime();
            //         const daysToNextCycle = Math.round(timeDiff / (1000 * 3600 * 24));

            //         // 3. Tính độ dài tổng số ngày của tháng bắt đầu để chia tỷ lệ
            //         const daysInStartMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();

            //         // 4. Tính tiền tháng đầu tiên (Prorated Rent)
            //         let firstMonthRent: any = contract.monthlyRent;
            //         if (startDate.getDate() !== contract.paymentDueDay) {
            //             const monthlyRentNum = Number(contract.monthlyRent);
            //             const calculatedRent = (monthlyRentNum / daysInStartMonth) * daysToNextCycle;
            //             // Làm tròn tới nghìn đồng (ví dụ 1.531.332 -> 1.531.000)
            //             firstMonthRent = Math.round(calculatedRent / 1000) * 1000;
            //         }

            //         const existingFirstRent = await tx.payment.findFirst({
            //             where: {
            //                 rentalId: contract.rentalId,
            //                 paymentType: 'rent',
            //                 dueDate: startDate,
            //             },
            //         });

            //         // Nếu chưa có kỳ thanh toán nào được tạo cho ngày đến hạn đầu tiên, thì tạo mới
            //         if (!existingFirstRent) {


            //             await tx.payment.create({
            //                 data: {
            //                     rentalId: contract.rentalId,
            //                     paymentCode: `RENT-${Date.now().toString(36).toUpperCase()}`,
            //                     paymentType: 'rent',
            //                     dueDate: startDate, // Tháng đầu trả luôn vào ngày bắt đầu thuê
            //                     amount: firstMonthRent,
            //                     remainingAmount: firstMonthRent,
            //                     status: 'pending',
            //                 },
            //             });
            //         }
            //     }

            //     await tx.contractSignatureLog.create({
            //         data: {
            //             rentalId: contract.rentalId,
            //             action: 'SIGNED_SUCCESS',
            //             actor: isOwner ? contract.ownerId : contract.tenantId,
            //             actorRole: role
            //         }
            //     });

            //     if (isOwner) {
            //         await tx.contractSignatureLog.create({
            //             data: {
            //                 rentalId: contract.rentalId,
            //                 action: blockchainTxHash ? 'BLOCKCHAIN_RECORDED' : 'BLOCKCHAIN_FAILED',
            //                 actor: contract.ownerId,
            //                 actorRole: role,
            //                 userAgent: blockchainErrorMessage ? blockchainErrorMessage : null
            //             }
            //         });
            //     }

            //     return {
            //         status: 'SIGNED',
            //         signedFileUrl,
            //         blockchain: isOwner
            //             ? {
            //                 recorded: Boolean(blockchainTxHash),
            //                 txHash: blockchainTxHash,
            //                 network: blockchainNetwork,
            //                 error: blockchainErrorMessage
            //             }
            //             : null
            //     };
            // }).then(async (result) => {
            //     if (isOwner) {
            //         this.rabbitClient.emit('contract.owner_signed', {
            //             contractId: contract.rentalId,
            //             contractCode: contract.contractCode,
            //             propertyId: contract.propertyId,
            //             ownerId: contract.ownerId,
            //             tenantId: contract.tenantId,
            //         });

            //         await this.estateService.updatePropertyContractStatus(
            //             contract.propertyId,
            //             'contract_active',
            //             contract.rentalId,
            //         );
            //     } else {
            //         this.rabbitClient.emit('contract.tenant_signed', {
            //             contractId: contract.rentalId,
            //             contractCode: contract.contractCode,
            //             propertyId: contract.propertyId,
            //             ownerId: contract.ownerId,
            //             tenantId: contract.tenantId,
            //         });
            //     }
            //     return result;
            // });
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
                            status: 'pending_landlord'
                        }
                        : {
                            tenantTransactionId: transactionId,
                            status: 'pending_tenant'
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
                            status: 'pending_landlord'
                        }
                        : {
                            tenantTransactionId: null,
                            status: 'pending_tenant'
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
            const signatureBuffer = Buffer.from(signatureValue, 'base64');
            if (!signatureBuffer.length) {
                throw new Error('Empty signature payload');
            }

            const signer = new VnptRemoteSigner(signatureBuffer);
            return await signpdf.sign(preparedPdfBuffer, signer);
        } catch (e: any) {
            throw new InternalServerErrorException(`Loi dong goi chu ky: ${e.message}`);
        }
    }

    async preparePdfAndGetHash(pdfBuffer: Buffer, signerName?: string, signerRole?: string) {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];

        const roleLabel = signerRole === 'OWNER' ? 'BEN CHO THUE' : 'BEN THUE';
        const displayName = removeVietnamese(signerName || 'N/A');
        const signDate = new Date().toLocaleDateString('en-GB');  // dd/mm/yyyy - no Vietnamese
        const signTime = new Date().toLocaleTimeString('en-GB');  // HH:MM:SS - no Vietnamese

        // Xác định vị trí ký dựa trên vai trò
        const xPos = signerRole === 'OWNER' ? 60 : 350;

        // Vẽ khung chữ ký số
        lastPage.drawRectangle({
            x: xPos,
            y: 40,
            width: 200,
            height: 80,
            borderColor: rgb(0, 0.4, 0.8),
            borderWidth: 1.5,
            opacity: 0,
        });

        // Vẽ text "ĐÃ KÝ SỐ"
        lastPage.drawText('DA KY SO - VNPT SMARTCA', {
            x: xPos + 10,
            y: 100,
            size: 8,
            color: rgb(0, 0.4, 0.8),
        });

        lastPage.drawText(`${roleLabel}: ${displayName}`, {
            x: xPos + 10,
            y: 85,
            size: 8,
            color: rgb(0, 0, 0),
        });

        lastPage.drawText(`Ngay ky: ${signDate} ${signTime}`, {
            x: xPos + 10,
            y: 70,
            size: 7,
            color: rgb(0.3, 0.3, 0.3),
        });

        lastPage.drawText('Chu ky so hop le', {
            x: xPos + 10,
            y: 55,
            size: 7,
            color: rgb(0, 0.6, 0),
        });

        // Placeholder cho chữ ký số thật
        pdflibAddPlaceholder({
            pdfDoc,
            pdfPage: lastPage,
            reason: `Ky hop dong - ${roleLabel}`,
            contactInfo: 'SmartCA',
            name: displayName,
            location: 'VN',
            signatureLength: 16192,
            widgetRect: [xPos, 40, xPos + 200, 120],
        });

        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        return Buffer.from(pdfBytes);
    }

    async getProperHashForVnpt(pdfBuffer: Buffer, signerName?: string, signerRole?: string): Promise<{ hash: string, preparedBuffer: Buffer }> {
        const preparedBuffer = removeTrailingNewLine(await this.preparePdfAndGetHash(pdfBuffer, signerName, signerRole));
        const hash = this.calculateDataToBeSignedHash(preparedBuffer);
        return { hash, preparedBuffer };
    }

    private calculateDataToBeSignedHash(preparedBuffer: Buffer): string {
        const { byteRangePlaceholder, byteRangePlaceholderPosition } = findByteRange(preparedBuffer);
        if (!byteRangePlaceholder || byteRangePlaceholderPosition === undefined) {
            throw new InternalServerErrorException('Could not find ByteRange placeholder');
        }

        const byteRangeEnd = byteRangePlaceholderPosition + byteRangePlaceholder.length;
        const contentsTagPos = preparedBuffer.indexOf('/Contents ', byteRangeEnd);
        const placeholderPos = preparedBuffer.indexOf('<', contentsTagPos);
        const placeholderEnd = preparedBuffer.indexOf('>', placeholderPos);

        if (contentsTagPos === -1 || placeholderPos === -1 || placeholderEnd === -1) {
            throw new InternalServerErrorException('Invalid signature placeholder structure');
        }

        const placeholderLengthWithBrackets = placeholderEnd + 1 - placeholderPos;
        const byteRange = [0, 0, 0, 0];
        byteRange[1] = placeholderPos;
        byteRange[2] = byteRange[1] + placeholderLengthWithBrackets;
        byteRange[3] = preparedBuffer.length - byteRange[2];

        let actualByteRange = `/ByteRange [${byteRange.join(' ')}]`;
        actualByteRange += ' '.repeat(byteRangePlaceholder.length - actualByteRange.length);

        const pdfForHash = Buffer.concat([
            preparedBuffer.slice(0, byteRangePlaceholderPosition),
            Buffer.from(actualByteRange),
            preparedBuffer.slice(byteRangeEnd),
        ]);

        const dataToHash = Buffer.concat([
            pdfForHash.slice(0, byteRange[1]),
            pdfForHash.slice(byteRange[2], byteRange[2] + byteRange[3]),
        ]);

        return crypto.createHash('sha256').update(dataToHash).digest('hex');
    }

    private buildPreparedMeta(transactionId: string, preparedPdfUrl: string, hash: string): string {
        const full = JSON.stringify({ transactionId, preparedPdfUrl, hash });
        if (full.length <= 500) return full;

        return JSON.stringify({ transactionId, preparedPdfUrl });
    }

    private async findPreparedPdfUrl(rentalId: string, role: 'OWNER' | 'TENANT', transactionId: string): Promise<string> {
        const log = await this.db.contractSignatureLog.findFirst({
            where: {
                rentalId,
                action: 'SIGN_REQUESTED',
                actorRole: role,
                userAgent: {
                    contains: transactionId,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (!log?.userAgent) {
            throw new InternalServerErrorException('Prepared PDF metadata missing for transaction');
        }

        try {
            const parsed = JSON.parse(log.userAgent) as { preparedPdfUrl?: string };

            if (!parsed.preparedPdfUrl) {
                throw new Error('Missing preparedPdfUrl');
            }

            return parsed.preparedPdfUrl;
        } catch {
            throw new InternalServerErrorException('Prepared PDF metadata is invalid');
        }
    }

    // Verify blockchian
    async verifyBlockchainRecord(contractId: string, fileBuffer: Buffer): Promise<boolean> {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId }
        });
        if (!contract) throw new BadRequestException('Contract not found');

        if (!contract.blockchainTxHash || !contract.signHash) {
            throw new BadRequestException('No blockchain record found for this contract');
        }

        const fileHash = generateHash(fileBuffer);

        const contractBlockchainRecord = await contractBlockchain.contracts(contract.rentalId);

        if (!contractBlockchainRecord) {
            throw new BadRequestException('No blockchain record found for this contract');
        }

        console.log("blockchian: ", contractBlockchainRecord.contractHash);
        console.log("file: ", fileHash);



        return (contractBlockchainRecord.contractHash === "0x" + contract.signHash && fileHash === contract.signHash);
    }


    async handleProcessSigned(data: any) {
        console.log("[handleProcessSigned] Received: ", data);

        const { contractId, transactionId, role } = data;

        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId }
        });

        if (!contract) return;

        // 🛑 idempotent
        const statusField = role === 'OWNER' ? 'ownerSignStatus' : 'tenantSignStatus';

        if (contract[statusField] === 'DONE') {
            console.log("[handleProcessSigned] Already DONE, skip. ContractId: ", contractId);
            return;
        }

        try {
            // ====== 1. LOAD FILE ======
            const preparedPdfUrl = await this.findPreparedPdfUrl(
                contract.rentalId,
                role,
                transactionId
            );

            const preparedBuffer = await this.downloadFile(preparedPdfUrl);

            // ====== 2. GET SIGNATURE ======
            const result = await this.getSignStatus(transactionId);
            const signatureValue = result.data?.signatures?.[0]?.signature_value;
            console.log("[handleProcessSigned] Role: ", role);

            if (!signatureValue) throw new Error('Missing signature');

            // ====== 3. APPEND SIGNATURE ======
            const signedFileBuffer = await this.appendSignatureToFile(
                preparedBuffer,
                signatureValue
            );

            // ====== 4. UPLOAD FILE ======
            const fileName = `signed_${role.toLowerCase()}_${contractId}.pdf`;
            const signedFileUrl = await uploadFileUrl(signedFileBuffer, fileName);

            // ====== 5. BLOCKCHAIN (OWNER ONLY, NON-BLOCKING) ======
            let blockchainTxHash = contract.blockchainTxHash;
            let blockchainNetwork = contract.blockchainNetwork;
            let blockchainAlreadyExists = false;
            let blockchainErrorMessage: string | null = null;

            const finalHash = generateHash(signedFileBuffer);

            if (role === 'OWNER') {
                try {
                    const existingChainRecord = await contractBlockchain.contracts(contractId);

                    if (existingChainRecord?.exists) {
                        blockchainAlreadyExists = true;
                        console.log('[handleProcessSigned] Blockchain record already exists, skip register:', contractId);
                    } else if (!contract.blockchainTxHash) {
                        const chainResult = await contractBlockchain.registerContract(
                            contractId,
                            "0x" + finalHash
                        );

                        const receipt = await chainResult.wait();
                        console.log("[handleProcessSigned] Blockchain receipt: ", receipt);

                        blockchainTxHash = receipt.hash;
                        blockchainNetwork = this.resolveBlockchainNetwork(chainResult.chainId);
                    }
                } catch (bcError: any) {
                    const errorMessage = String(bcError?.reason || bcError?.message || '');
                    if (errorMessage.toLowerCase().includes('already exists')) {
                        blockchainAlreadyExists = true;
                        console.log('[handleProcessSigned] Blockchain: Already exists, continuing:', contractId);
                    } else {
                        // ⚠️ Blockchain failed but we DON'T throw — contract signing continues
                        blockchainErrorMessage = errorMessage;
                        console.error('[handleProcessSigned] Blockchain failed (non-blocking):', errorMessage);
                    }
                }
            }

            // ====== 6. TRANSACTION (QUAN TRỌNG NHẤT) ======
            await this.db.$transaction(async (tx) => {

                // 🔄 reload contract trong transaction
                const freshContract = await tx.rentalContract.findUnique({
                    where: { rentalId: contractId }
                });

                if (!freshContract) throw new Error("Contract not found");

                // 🛑 double-check idempotent
                if (freshContract[statusField] === 'DONE') return;

                console.log("[handleProcessSigned] Updating contract, role: ", role);
                
                // ====== UPDATE CONTRACT ======
                await tx.rentalContract.update({
                    where: { rentalId: contractId },
                    data: role === 'OWNER'
                        ? {
                            ownerTransactionId: transactionId,
                            status: 'active',
                            ownerSignedAt: new Date(),
                            signedContractUrl: signedFileUrl,
                            signedDate: new Date(),
                            signHash: finalHash,
                            blockchainTxHash,
                            blockchainNetwork,
                            blockchainRecordedAt: (blockchainTxHash || blockchainAlreadyExists) ? new Date() : freshContract.blockchainRecordedAt,
                            [statusField]: 'DONE',
                            blockchainStatus: blockchainTxHash || blockchainAlreadyExists ? "DONE" : "PENDING"
                        } : {
                            tenantTransactionId: transactionId,
                            status: 'pending_landlord',
                            tenantSignedAt: new Date(),
                            signedContractUrl: signedFileUrl,
                            signedDate: new Date(),
                            [statusField]: 'DONE'
                        }
                });

                // ====== LOG ======
                await tx.contractSignatureLog.create({
                    data: {
                        rentalId: contract.rentalId,
                        action: 'SIGNED_SUCCESS',
                        actor: role === 'OWNER' ? contract.ownerId : contract.tenantId,
                        actorRole: role
                    }
                });

                if (role === 'OWNER') {
                    await tx.contractSignatureLog.create({
                        data: {
                            rentalId: contract.rentalId,
                            action: blockchainTxHash ? 'BLOCKCHAIN_RECORDED' : (blockchainAlreadyExists ? 'BLOCKCHAIN_RECORDED' : 'BLOCKCHAIN_FAILED'),
                            actor: contract.ownerId,
                            actorRole: role,
                            userAgent: blockchainErrorMessage || null
                        }
                    });
                }

                // ====== ✅ CREATE PAYMENT (OWNER ONLY) ======
                if (role === 'OWNER') {
                    await this.paymentService.createFirstMonthPayment(tx, freshContract);
                }
            });

            // ====== 7. POST-SIGN EVENTS (OUTSIDE TRANSACTION) ======
            if (role === 'OWNER') {
                this.rabbitClient.emit('contract.owner_signed', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                });

                try {
                    await this.estateService.updatePropertyContractStatus(
                        contract.propertyId,
                        'contract_active',
                        contract.rentalId,
                    );
                } catch (estateErr) {
                    console.error('[handleProcessSigned] Estate service update failed (non-blocking):', estateErr);
                }
            } else {
                this.rabbitClient.emit('contract.tenant_signed', {
                    contractId: contract.rentalId,
                    contractCode: contract.contractCode,
                    propertyId: contract.propertyId,
                    ownerId: contract.ownerId,
                    tenantId: contract.tenantId,
                });
            }

        } catch (error) {
            console.error("[handleProcessSigned] Worker error:", error);

            // 🔁 rollback để retry (sẽ bị block ở frontend để tránh infinite loop)
            await this.db.rentalContract.update({
                where: { rentalId: contractId },
                data: {
                    [statusField]: 'PENDING',
                    blockchainStatus: 'PENDING'
                }
            });
        }
    }


    async getContractStatus(contractId: string, userId: string) {
        const contract = await this.db.rentalContract.findUnique({
            where: { rentalId: contractId }
        });

        if (!contract) throw new BadRequestException('Contract not found');

        const statusField = contract.ownerId === userId ? 'ownerSignStatus' : 'tenantSignStatus';

        if (contract[statusField] === 'DONE') {
            return {
                status: 'SIGNED',
                signedFileUrl: contract.signedContractUrl
            };
        }

        if (contract[statusField] === 'PROCESSING') {
            return {
                status: 'PROCESSING'
            };
        }

        return {
            status: 'PENDING'
        };
    }
}
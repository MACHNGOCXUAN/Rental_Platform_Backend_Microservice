import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { Decimal } from 'generated/prisma/internal/prismaNamespace';
import { DocumentStatus, DocumentType, KycStatus } from 'generated/prisma/enums';
import { DatabaseService } from 'src/common/services/database.service';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class KycService {
    private readonly ocrApiKey = process.env.FPT_OCR_API_KEY;
    private readonly faceMatchApiKey = process.env.FPT_FACE_MATCH_API_KEY;
    private readonly kycPassThreshold = Number(process.env.KYC_FACE_THRESHOLD ?? 70);
    

    constructor(
        private readonly databaseService: DatabaseService,
        private readonly cloudinaryService: CloudinaryService,
    ) {}

    async ocrCCCD(file: Express.Multer.File) {

        if (!this.ocrApiKey) {
            return { error: 'Missing FPT_OCR_API_KEY' };
        }

        const form = new FormData();
        form.append('image', file.buffer, file.originalname);

        try {
            const res = await axios.post(
                'https://api.fpt.ai/vision/idr/vnm',
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'api-key': this.ocrApiKey,
                    },
                    timeout: 20000,
                },
            );

            return res.data;
        } catch (error) {
            throw new BadRequestException(error.response?.data || error.message);
        }
    }

    async faceMatch(file1: Express.Multer.File, file2: Express.Multer.File) {
        if (!this.faceMatchApiKey) {
            return { error: 'Missing FPT_FACE_MATCH_API_KEY' };
        }

        const form = new FormData();
        form.append('file[]', file1.buffer, file1.originalname);
        form.append('file[]', file2.buffer, file2.originalname);

        try {
            const res = await axios.post(
                'https://api.fpt.ai/dmp/checkface/v1',
                form,
                {
                    headers: {
                        ...form.getHeaders(),
                        'api-key': this.faceMatchApiKey,
                    },
                    timeout: 20000,
                },
            );

            return res.data;
        } catch (error) {
            console.error('FPT Face Match ERROR:', error.response?.data || error.message);
            throw new BadRequestException(error.response?.data || error.message);
        }
    }

    async verifyAndPersist(userId: string, files: Express.Multer.File[]) {
        if (!files || files.length < 3) {
            throw new BadRequestException('Vui long gui du 3 anh: selfie, back, front');
        }

        const [selfie, back, front] = files;

        const user = await this.databaseService.user.findFirst({
            where: {
                id: userId,
                deletedAt: null,
            },
            include: {
                kycDocuments: {
                    where: {
                        status: DocumentStatus.approved,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                },
            },
        });

        if (!user) {
            throw new NotFoundException('Khong tim thay nguoi dung');
        }

        if (user.kycStatus === KycStatus.verified && user.kycDocuments.length > 0) {
            throw new ConflictException('Tai khoan da duoc xac thuc KYC');
        }

        const [ocr, face] = await Promise.all([
            this.ocrCCCD(front),
            this.faceMatch(front, selfie),
        ]);

        const isValidOCR =
            !!ocr &&
            !ocr.error &&
            ocr.errorCode === 0 &&
            Array.isArray(ocr.data) &&
            ocr.data.length > 0;

        const similarity = this.extractSimilarity(face);
        const isFaceMatch =
            !!face &&
            !face.error &&
            String(face.code) === '200' &&
            face.data?.isMatch === true &&
            similarity >= this.kycPassThreshold;

        if (!isValidOCR || !isFaceMatch) {
            await this.databaseService.user.update({
                where: { id: userId },
                data: {
                    kycStatus: KycStatus.rejected,
                    kycSubmittedAt: new Date(),
                    kycVerifiedAt: null,
                    kycRejectionReason: !isValidOCR
                        ? 'OCR khong hop le'
                        : `Face match duoi nguong ${this.kycPassThreshold}%`,
                },
            });

            return {
                success: false,
                message: 'KYC that bai',
                similarity,
                threshold: this.kycPassThreshold,
                ocr,
                face,
            };
        }

        const documentNumber = this.extractDocumentNumber(ocr);
        if (!documentNumber) {
            throw new BadRequestException('Khong trich xuat duoc so CCCD tu OCR');
        }

        // const uploaded = await Promise.all([
        //     this.cloudinaryService.uploadImage(front, `real_estate/kyc/${userId}`),
        //     this.cloudinaryService.uploadImage(back, `real_estate/kyc/${userId}`),
        //     this.cloudinaryService.uploadImage(selfie, `real_estate/kyc/${userId}`),
        // ]);

        const now = new Date();
        const kycExpiredAt = new Date(now);
        kycExpiredAt.setFullYear(kycExpiredAt.getFullYear() + 2);

        const created = await this.databaseService.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    kycStatus: KycStatus.verified,
                    kycSubmittedAt: now,
                    kycVerifiedAt: now,
                    kycExpiredAt,
                    kycRejectionReason: null,
                },
            });

            return tx.kycDocument.create({
                data: {
                    userId,
                    documentType: DocumentType.id_card,
                    documentNumber,
                    // frontImageUrl: uploaded[0].secureUrl,
                    // backImageUrl: uploaded[1].secureUrl,
                    // selfieUrl: uploaded[2].secureUrl,
                    frontImageUrl: "uploaded[0].secureUrl",
                    backImageUrl: "uploaded[1].secureUrl",
                    selfieUrl: "uploaded[2].secureUrl",
                    faceMatchScore: new Decimal(similarity),
                    ocrData: ocr,
                    verificationProvider: 'fpt.ai',
                    status: DocumentStatus.approved,
                    submittedAt: now,
                    reviewedAt: now,
                },
            });
        });

        return {
            success: true,
            message: 'KYC thanh cong',
            kycDocumentId: created.kycId,
            similarity,
            threshold: this.kycPassThreshold,
            status: KycStatus.verified,
            fullName: ocr.data[0].name,
            idNumber: ocr.data[0].id,
            gender: ocr.data[0].sex,
            dob: ocr.data[0].dob
        };
    }

    private extractSimilarity(faceResult: any): number {
        const candidates = [
            faceResult?.data?.similarity,
            faceResult?.similarity,
            faceResult?.score,
            faceResult?.match,
            faceResult?.result?.similarity,
        ];

        for (const candidate of candidates) {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return 0;
    }

    private extractDocumentNumber(ocr: any): string | null {
        if (!ocr) {
            return null;
        }

        if (Array.isArray(ocr.data) && ocr.data.length > 0) {
            const firstRecord = ocr.data[0];
            if (typeof firstRecord?.id === 'string') {
                const normalizedId = firstRecord.id.replace(/\s+/g, '');
                if (/^\d{9,12}$/.test(normalizedId)) {
                    return normalizedId;
                }
            }
        }

        const normalized = JSON.stringify(ocr).match(/\b\d{9,12}\b/);
        return normalized ? normalized[0] : null;
    }
}
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
import { RejectKycDto } from '../dtos/kyc.dto';

@Injectable()
export class KycService {
    private readonly ocrApiKey = process.env.FPT_OCR_API_KEY;
    private readonly faceMatchApiKey = process.env.FPT_FACE_MATCH_API_KEY;
    private readonly inReviewMinScore = 60;
    private readonly verifiedMinScore = 85;
    

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

        const score = this.extractSimilarity(face);
        const isFaceMatch =
            !!face &&
            !face.error &&
            String(face.code) === '200' &&
            face.data?.isMatch === true &&
            score >= this.inReviewMinScore;

        const flags = this.buildFlags({
            isValidOCR,
            isFaceMatch,
            score,
            face,
        });
        const status = this.decideStatus(score, flags);
        const rejectionReason = this.buildRejectionReason(status, flags);

        const documentNumber = this.extractDocumentNumber(ocr);
        if (!documentNumber) {
            throw new BadRequestException('Khong trich xuat duoc so CCCD tu OCR');
        }

        const uploaded = await Promise.all([
            this.cloudinaryService.uploadImage(front, `real_estate/kyc/${userId}`),
            this.cloudinaryService.uploadImage(back, `real_estate/kyc/${userId}`),
            this.cloudinaryService.uploadImage(selfie, `real_estate/kyc/${userId}`),
        ]);

        const now = new Date();
        const kycExpiredAt = new Date(now);
        kycExpiredAt.setFullYear(kycExpiredAt.getFullYear() + 2);
        const documentStatus = this.mapKycStatusToDocumentStatus(status);

        const created = await this.databaseService.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    kycStatus: status,
                    kycSubmittedAt: now,
                    kycVerifiedAt: status === KycStatus.verified ? now : null,
                    kycExpiredAt: status === KycStatus.verified ? kycExpiredAt : null,
                    kycRejectionReason: rejectionReason,
                },
            });

            return tx.kycDocument.create({
                data: {
                    userId,
                    documentType: DocumentType.id_card,
                    documentNumber,
                    frontImageUrl: uploaded[0].secureUrl,
                    backImageUrl: uploaded[1].secureUrl,
                    selfieUrl: uploaded[2].secureUrl,
                    faceMatchScore: new Decimal(score),
                    ocrData: ocr,
                    verificationProvider: 'fpt.ai',
                    status: documentStatus,
                    submittedAt: now,
                    reviewedAt: status === KycStatus.in_review ? null : now,
                    rejectionReason,
                    notes: flags.length > 0 ? JSON.stringify({ flags }) : null,
                },
            });
        });

        return {
            success: status !== KycStatus.rejected,
            message: this.buildSubmitMessage(status),
            kycDocumentId: created.kycId,
            status,
            score,
            flags,
            rejectionReason,
            fullName: ocr.data[0].name,
            idNumber: ocr.data[0].id,
            gender: ocr.data[0].sex,
            dob: ocr.data[0].dob,
            ocrData: ocr.data[0] ?? null,
        };
    }

    async adminApproveKyc(kycId: string, reviewerId: string) {
        const document = await this.databaseService.kycDocument.findUnique({
            where: { kycId },
        });

        if (!document) {
            throw new NotFoundException('Khong tim thay ho so KYC');
        }

        // Idempotent approve: if already approved, return current state instead of failing.
        if (document.status === DocumentStatus.approved) {
            const now = new Date();
            const expiredAt = new Date(now);
            expiredAt.setFullYear(expiredAt.getFullYear() + 2);

            await this.databaseService.user.update({
                where: { id: document.userId },
                data: {
                    kycStatus: KycStatus.verified,
                    kycVerifiedAt: document.reviewedAt ?? now,
                    kycExpiredAt: expiredAt,
                    kycRejectionReason: null,
                },
            });

            return this.toKycAdminResponse(document);
        }

        const now = new Date();
        const expiredAt = new Date(now);
        expiredAt.setFullYear(expiredAt.getFullYear() + 2);

        const updated = await this.databaseService.$transaction(async (tx) => {
            const updatedDocument = await tx.kycDocument.update({
                where: { kycId },
                data: {
                    status: DocumentStatus.approved,
                    reviewedBy: reviewerId,
                    reviewedAt: now,
                    rejectionReason: null,
                },
            });

            await tx.user.update({
                where: { id: document.userId },
                data: {
                    kycStatus: KycStatus.verified,
                    kycVerifiedAt: now,
                    kycExpiredAt: expiredAt,
                    kycRejectionReason: null,
                },
            });

            return updatedDocument;
        });

        return this.toKycAdminResponse(updated);
    }

    async adminRejectKyc(kycId: string, reviewerId: string, dto: RejectKycDto) {
        const reason = dto.rejectionReason?.trim();
        if (!reason) {
            throw new BadRequestException('Ly do tu choi la bat buoc');
        }

        const document = await this.databaseService.kycDocument.findUnique({
            where: { kycId },
        });

        if (!document) {
            throw new NotFoundException('Khong tim thay ho so KYC');
        }

        // Idempotent reject: if already rejected, return current state instead of failing.
        if (document.status === DocumentStatus.rejected) {
            await this.databaseService.user.update({
                where: { id: document.userId },
                data: {
                    kycStatus: KycStatus.rejected,
                    kycVerifiedAt: null,
                    kycExpiredAt: null,
                    kycRejectionReason: reason,
                },
            });

            return this.toKycAdminResponse(document);
        }

        const now = new Date();

        const updated = await this.databaseService.$transaction(async (tx) => {
            const updatedDocument = await tx.kycDocument.update({
                where: { kycId },
                data: {
                    status: DocumentStatus.rejected,
                    reviewedBy: reviewerId,
                    reviewedAt: now,
                    rejectionReason: reason,
                },
            });

            await tx.user.update({
                where: { id: document.userId },
                data: {
                    kycStatus: KycStatus.rejected,
                    kycVerifiedAt: null,
                    kycExpiredAt: null,
                    kycRejectionReason: reason,
                },
            });

            return updatedDocument;
        });

        return this.toKycAdminResponse(updated);
    }

    private buildSubmitMessage(status: KycStatus): string {
        if (status === KycStatus.verified) {
            return 'KYC da duoc xac minh tu dong';
        }
        if (status === KycStatus.in_review) {
            return 'Ho so KYC dang cho admin xem xet';
        }
        return 'KYC bi tu choi';
    }

    private buildFlags(payload: {
        isValidOCR: boolean;
        isFaceMatch: boolean;
        score: number;
        face: any;
    }): string[] {
        const flags = new Set<string>();

        if (!payload.isValidOCR) {
            flags.add('ocr_invalid');
        }

        if (!payload.isFaceMatch) {
            flags.add('face_mismatch');
        }

        if (payload.score < this.inReviewMinScore) {
            flags.add('low_face_score');
        }

        if (payload.face?.data?.isLive === false) {
            flags.add('liveness_failed');
        }

        return Array.from(flags);
    }

    private decideStatus(score: number, flags: string[]): KycStatus {
        if (score < this.inReviewMinScore) {
            return KycStatus.rejected;
        }

        if (score >= this.verifiedMinScore && flags.length === 0) {
            return KycStatus.verified;
        }

        return KycStatus.in_review;
    }

    private buildRejectionReason(status: KycStatus, flags: string[]): string | null {
        if (status !== KycStatus.rejected) {
            return null;
        }

        if (flags.includes('ocr_invalid')) {
            return 'OCR khong hop le';
        }

        if (flags.includes('low_face_score')) {
            return `Diem doi chieu khuon mat duoi ${this.inReviewMinScore}`;
        }

        if (flags.includes('face_mismatch')) {
            return 'Khuon mat khong khop giay to';
        }

        return 'Ho so KYC khong dat yeu cau';
    }

    private mapKycStatusToDocumentStatus(status: KycStatus): DocumentStatus {
        if (status === KycStatus.verified) {
            return DocumentStatus.approved;
        }

        if (status === KycStatus.in_review) {
            return DocumentStatus.in_review;
        }

        return DocumentStatus.rejected;
    }

    private extractFlagsFromNotes(notes?: string | null): string[] {
        if (!notes) {
            return [];
        }

        try {
            const parsed = JSON.parse(notes);
            if (Array.isArray(parsed?.flags)) {
                return parsed.flags.filter((flag: unknown) => typeof flag === 'string');
            }
        } catch {
            return [];
        }

        return [];
    }

    private toKycAdminResponse(document: {
        status: DocumentStatus;
        faceMatchScore: Decimal | null;
        rejectionReason: string | null;
        notes: string | null;
    }) {
        return {
            status: this.mapDocumentStatusToKycStatus(document.status),
            score: document.faceMatchScore ? Number(document.faceMatchScore) : 0,
            flags: this.extractFlagsFromNotes(document.notes),
            rejectionReason: document.rejectionReason,
        };
    }

    private mapDocumentStatusToKycStatus(status: DocumentStatus): KycStatus {
        if (status === DocumentStatus.approved) {
            return KycStatus.verified;
        }

        if (status === DocumentStatus.in_review || status === DocumentStatus.pending) {
            return KycStatus.in_review;
        }

        return KycStatus.rejected;
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
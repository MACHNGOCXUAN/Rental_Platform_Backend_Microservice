import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
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
        @Inject('RABBITMQ_SERVICE') private readonly notificationClient: ClientProxy,
    ) { }

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

        let ocr: any = null;
        let face: any = null;

        try {
            ocr = await this.ocrCCCD(front);
        } catch (err: any) {
            console.error('FPT OCR ERROR (caught):', err.response?.data || err.message || err);
        }

        try {
            face = await this.faceMatch(front, selfie);
        } catch (err: any) {
            console.error('FPT Face Match ERROR (caught):', err.response?.data || err.message || err);
        }

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

        const documentNumber = this.extractDocumentNumber(ocr) || ocr?.data?.[0]?.id || 'UNKNOWN';

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

            await tx.userProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    fullName: ocr?.data?.[0]?.name?.trim() || 'UNKNOWN',
                    idCardNumber: documentNumber,

                    currentAddress: ocr?.data?.[0]?.address || null,

                    // Nếu OCR có tách riêng thì dùng, không thì để null
                    currentWard: ocr?.data?.[0]?.ward || null,
                    currentDistrict: ocr?.data?.[0]?.district || null,
                    currentCity: ocr?.data?.[0]?.city || null,

                    occupation: null,
                    emergencyContactName: null,
                    emergencyContactPhone: null,
                },
                update: {
                    fullName: ocr?.data?.[0]?.name?.trim() || undefined,
                    idCardNumber: documentNumber,

                    currentAddress: ocr?.data?.[0]?.address || undefined,
                    currentWard: ocr?.data?.[0]?.ward || undefined,
                    currentDistrict: ocr?.data?.[0]?.district || undefined,
                    currentCity: ocr?.data?.[0]?.city || undefined,

                    // không overwrite nếu không có data
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
                    ocrData: ocr || {},
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
            fullName: ocr?.data?.[0]?.name || 'UNKNOWN',
            idNumber: documentNumber,
            gender: ocr?.data?.[0]?.sex || 'UNKNOWN',
            dob: ocr?.data?.[0]?.dob || 'UNKNOWN',
            ocrData: ocr?.data?.[0] ?? null,
        };
    }

    async extractOcr(userId: string, files: Express.Multer.File[]) {
        if (!files || files.length < 2) {
            throw new BadRequestException('Vui lòng gửi đủ 2 ảnh: mặt trước và mặt sau thẻ');
        }

        const [back, front] = files;

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
            throw new NotFoundException('Không tìm thấy người dùng');
        }

        if (user.kycStatus === KycStatus.verified && user.kycDocuments.length > 0) {
            throw new ConflictException('Tài khoản đã được xác thực KYC');
        }

        let ocr: any = null;

        try {
            ocr = await this.ocrCCCD(front);
        } catch (err: any) {
            console.error('FPT OCR ERROR (caught):', err.response?.data || err.message || err);
        }

        const isValidOCR =
            !!ocr &&
            !ocr.error &&
            ocr.errorCode === 0 &&
            Array.isArray(ocr.data) &&
            ocr.data.length > 0;

        const documentNumber = this.extractDocumentNumber(ocr) || ocr?.data?.[0]?.id || 'UNKNOWN';

        const uploaded = await Promise.all([
            this.cloudinaryService.uploadImage(front, `real_estate/kyc/${userId}`),
            this.cloudinaryService.uploadImage(back, `real_estate/kyc/${userId}`),
        ]);

        const now = new Date();

        const created = await this.databaseService.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    kycStatus: KycStatus.pending,
                    kycSubmittedAt: now,
                    kycRejectionReason: null,
                },
            });

            await tx.userProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    fullName: ocr?.data?.[0]?.name?.trim() || 'UNKNOWN',
                    idCardNumber: documentNumber,
                    currentAddress: ocr?.data?.[0]?.address || null,
                    currentWard: ocr?.data?.[0]?.ward || null,
                    currentDistrict: ocr?.data?.[0]?.district || null,
                    currentCity: ocr?.data?.[0]?.city || null,
                    occupation: null,
                    emergencyContactName: null,
                    emergencyContactPhone: null,
                },
                update: {
                    fullName: ocr?.data?.[0]?.name?.trim() || undefined,
                    idCardNumber: documentNumber,
                    currentAddress: ocr?.data?.[0]?.address || undefined,
                    currentWard: ocr?.data?.[0]?.ward || undefined,
                    currentDistrict: ocr?.data?.[0]?.district || undefined,
                    currentCity: ocr?.data?.[0]?.city || undefined,
                },
            });

            return tx.kycDocument.create({
                data: {
                    userId,
                    documentType: DocumentType.id_card,
                    documentNumber,
                    frontImageUrl: uploaded[0].secureUrl,
                    backImageUrl: uploaded[1].secureUrl,
                    selfieUrl: 'PENDING',
                    faceMatchScore: new Decimal(0),
                    ocrData: ocr || {},
                    verificationProvider: 'fpt.ai',
                    status: DocumentStatus.pending,
                    submittedAt: now,
                    notes: JSON.stringify({ flags: isValidOCR ? [] : ['ocr_invalid'] }),
                },
            });
        });

        return {
            success: true,
            kycDocumentId: created.kycId,
            status: 'pending',
            fullName: ocr?.data?.[0]?.name || 'UNKNOWN',
            idNumber: documentNumber,
            gender: ocr?.data?.[0]?.sex || 'UNKNOWN',
            dob: ocr?.data?.[0]?.dob || 'UNKNOWN',
            ocrData: ocr?.data?.[0] ?? null,
        };
    }

    async verifyFace(userId: string, kycId: string, selfieFile: Express.Multer.File) {
        const document = await this.databaseService.kycDocument.findFirst({
            where: { kycId, userId },
        });

        if (!document) {
            throw new NotFoundException('Không tìm thấy hồ sơ KYC');
        }

        const user = await this.databaseService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });

        if (!user) {
            throw new NotFoundException('Không tìm thấy người dùng');
        }

        let face: any = null;
        try {
            const response = await axios.get(document.frontImageUrl, { responseType: 'arraybuffer' });
            const frontBuffer = Buffer.from(response.data);
            const frontFile: Express.Multer.File = {
                buffer: frontBuffer,
                originalname: 'front.jpg',
                mimetype: 'image/jpeg',
                fieldname: 'file[]',
                encoding: '7bit',
                size: frontBuffer.length,
                stream: null as any,
                destination: '',
                filename: '',
                path: '',
            };

            face = await this.faceMatch(frontFile, selfieFile);
        } catch (err: any) {
            console.error('FPT Face Match ERROR (caught):', err.response?.data || err.message || err);
        }

        const uploadedSelfie = await this.cloudinaryService.uploadImage(selfieFile, `real_estate/kyc/${userId}`);

        const ocr = document.ocrData;
        const isValidOCR =
            !!ocr &&
            !(ocr as any).error &&
            (ocr as any).errorCode === 0;

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
        const documentStatus = this.mapKycStatusToDocumentStatus(status);

        const now = new Date();
        const kycExpiredAt = new Date(now);
        kycExpiredAt.setFullYear(kycExpiredAt.getFullYear() + 2);

        await this.databaseService.$transaction(async (tx) => {
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

            await tx.kycDocument.update({
                where: { kycId },
                data: {
                    selfieUrl: uploadedSelfie.secureUrl,
                    faceMatchScore: new Decimal(score),
                    status: documentStatus,
                    reviewedAt: status === KycStatus.in_review ? null : now,
                    rejectionReason,
                    notes: flags.length > 0 ? JSON.stringify({ flags }) : null,
                },
            });
        });

        if (status === KycStatus.verified) {
            this.notificationClient.emit('kyc.approved', {
                userId,
                kycDocumentId: kycId,
            });
        } else if (status === KycStatus.rejected) {
            this.notificationClient.emit('kyc.rejected', {
                userId,
                kycDocumentId: kycId,
                rejectionReason,
            });
        }

        const ocrData: any = document.ocrData;

        return {
            success: status !== KycStatus.rejected,
            message: this.buildSubmitMessage(status),
            kycDocumentId: kycId,
            status,
            score,
            flags,
            rejectionReason,
            fullName: ocrData?.data?.[0]?.name || 'UNKNOWN',
            idNumber: document.documentNumber,
            gender: ocrData?.data?.[0]?.sex || 'UNKNOWN',
            dob: ocrData?.data?.[0]?.dob || 'UNKNOWN',
            ocrData: ocrData?.data?.[0] ?? null,
        };
    }

    async saveForAdminReview(userId: string, files: Express.Multer.File[]) {
        if (!files || files.length < 3) {
            throw new BadRequestException('Vui long gui du 3 anh: selfie, back, front');
        }

        const [selfie, back, front] = files;

        const user = await this.databaseService.user.findFirst({
            where: { id: userId, deletedAt: null },
            include: {
                kycDocuments: {
                    where: { status: DocumentStatus.approved },
                    orderBy: { createdAt: 'desc' },
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

        // Upload images
        const uploaded = await Promise.all([
            this.cloudinaryService.uploadImage(front, `real_estate/kyc/${userId}`),
            this.cloudinaryService.uploadImage(back, `real_estate/kyc/${userId}`),
            this.cloudinaryService.uploadImage(selfie, `real_estate/kyc/${userId}`),
        ]);

        const now = new Date();

        const created = await this.databaseService.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    kycStatus: KycStatus.in_review,
                    kycSubmittedAt: now,
                    kycRejectionReason: null,
                },
            });

            return tx.kycDocument.create({
                data: {
                    userId,
                    documentType: DocumentType.id_card,
                    documentNumber: 'PENDING_REVIEW',
                    frontImageUrl: uploaded[0].secureUrl,
                    backImageUrl: uploaded[1].secureUrl,
                    selfieUrl: uploaded[2].secureUrl,
                    faceMatchScore: new Decimal(0),
                    verificationProvider: 'manual_review',
                    status: DocumentStatus.in_review,
                    submittedAt: now,
                    notes: JSON.stringify({ flags: ['manual_review_requested'] }),
                },
            });
        });

        // Emit notification to admins
        this.notificationClient.emit('kyc.submitted_for_review', {
            userId,
            userName: user.fullName || user.email || user.phone || 'Người dùng',
            kycDocumentId: created.kycId,
        });

        return {
            success: true,
            message: 'Ho so KYC da gui cho admin xem xet',
            kycDocumentId: created.kycId,
            status: KycStatus.in_review,
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

        // Notify user that KYC has been approved
        this.notificationClient.emit('kyc.approved', {
            userId: document.userId,
            kycDocumentId: kycId,
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

        // Notify user that KYC has been rejected
        this.notificationClient.emit('kyc.rejected', {
            userId: document.userId,
            kycDocumentId: kycId,
            rejectionReason: reason,
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

    async requestManualReview(userId: string, kycId: string) {
        const document = await this.databaseService.kycDocument.findFirst({
            where: { kycId, userId },
        });

        if (!document) {
            throw new NotFoundException('Khong tim thay ho so KYC');
        }

        const user = await this.databaseService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });

        if (!user) {
            throw new NotFoundException('Khong tim thay nguoi dung');
        }

        const now = new Date();

        await this.databaseService.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: {
                    kycStatus: KycStatus.in_review,
                    kycSubmittedAt: now,
                    kycRejectionReason: null,
                },
            });

            await tx.kycDocument.update({
                where: { kycId },
                data: {
                    status: DocumentStatus.in_review,
                    submittedAt: now,
                    notes: JSON.stringify({ flags: ['manual_review_requested'] }),
                },
            });
        });

        // Emit notification to admins
        this.notificationClient.emit('kyc.submitted_for_review', {
            userId,
            userName: user.fullName || user.email || user.phone || 'Người dùng',
            kycDocumentId: kycId,
        });

        return {
            success: true,
            message: 'Ho so KYC da gui cho admin xem xet',
            kycDocumentId: kycId,
            status: KycStatus.in_review,
        };
    }
}
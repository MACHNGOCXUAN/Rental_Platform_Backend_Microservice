import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from 'src/common/services/database.service';
import { ClientProxy } from '@nestjs/microservices';
import { ApprovalStatus, PropertyStatus, ImportSessionStatus } from 'generated/prisma/enums';
import * as ExcelJS from 'exceljs';
import {
    bulkPropertyRowSchema, EXCEL_COLUMN_MAP, EXCEL_HEADERS, REQUIRED_HEADERS,
    PROPERTY_TYPE_VI_MAP, PROPERTY_TYPE_VI_LABELS,
    FURNITURE_STATUS_VI_MAP, FURNITURE_STATUS_VI_LABELS,
    type BulkPropertyRow,
} from '../dtos/bulk-import.dto';

@Injectable()
export class BulkImportService {
    private readonly logger = new Logger(BulkImportService.name);

    constructor(
        private readonly db: DatabaseService,
        @Inject('RABBITMQ_SERVICE')
        private readonly rabbitClient: ClientProxy,
    ) {}

    // ============================================================
    // ELIGIBILITY CHECK
    // ============================================================
    async checkEligibility(userId: string) {
        const user = await this.db.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                kycStatus: true,
                isActive: true,
                isBanned: true,
                createdAt: true,
            },
        });

        if (!user) throw new NotFoundException('Người dùng không tồn tại');

        const reasons: string[] = [];

        // Check KYC
        if (user.kycStatus !== 'verified') {
            reasons.push('Tài khoản chưa xác thực eKYC');
        }

        // Check account age >= 1 year
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        if (user.createdAt > oneYearAgo) {
            reasons.push('Tài khoản phải hoạt động trên 1 năm');
        }

        // Check active properties >= 3
        const activePropertyCount = await this.db.property.count({
            where: {
                landlordId: userId,
                status: { in: [PropertyStatus.active, PropertyStatus.rented] },
            },
        });
        if (activePropertyCount < 3) {
            reasons.push(`Cần ít nhất 3 bất động sản đang hoạt động (hiện có ${activePropertyCount})`);
        }

        // Check account status
        if (!user.isActive) reasons.push('Tài khoản không hoạt động');
        if (user.isBanned) reasons.push('Tài khoản đã bị khóa');

        // Check no active processing session
        const processingSession = await this.db.importSession.findFirst({
            where: { userId, status: ImportSessionStatus.PROCESSING },
        });
        if (processingSession) {
            reasons.push('Đang có phiên import chưa hoàn tất');
        }

        return {
            eligible: reasons.length === 0,
            reasons,
            stats: { activePropertyCount, kycStatus: user.kycStatus, accountAgeDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86400000) },
        };
    }

    // ============================================================
    // GENERATE EXCEL TEMPLATE
    // ============================================================
    async generateTemplate(): Promise<ExcelJS.Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'EstateAdmin';
        workbook.created = new Date();

        // --- Sheet 1: Data ---
        const dataSheet = workbook.addWorksheet('Dữ liệu', {
            properties: { defaultColWidth: 20 },
        });

        // Headers
        const headerRow = dataSheet.addRow(EXCEL_HEADERS);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B50DA' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' },
            };
        });

        // Mark required columns with * color
        REQUIRED_HEADERS.forEach((header) => {
            const colIdx = EXCEL_HEADERS.indexOf(header) + 1;
            if (colIdx > 0) {
                const cell = headerRow.getCell(colIdx);
                cell.value = `${header} *`;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
            }
        });

        // Column widths
        dataSheet.columns = EXCEL_HEADERS.map((h) => ({
            width: h.length < 10 ? 15 : h.length + 5,
        }));

        // Dropdowns for 100 data rows — Vietnamese labels
        const propertyTypeCol = EXCEL_HEADERS.indexOf('Loại BĐS') + 1;
        const furnitureCol = EXCEL_HEADERS.indexOf('Nội thất') + 1;
        const fireCol = EXCEL_HEADERS.indexOf('PCCC') + 1;

        const propertyTypeDropdown = PROPERTY_TYPE_VI_LABELS.join(',');
        const furnitureDropdown = FURNITURE_STATUS_VI_LABELS.join(',');

        for (let row = 2; row <= 101; row++) {
            if (propertyTypeCol > 0) {
                dataSheet.getCell(row, propertyTypeCol).dataValidation = {
                    type: 'list', allowBlank: false,
                    formulae: [`"${propertyTypeDropdown}"`],
                    showErrorMessage: true, errorTitle: 'Lỗi', error: 'Chọn loại BĐS hợp lệ',
                };
            }
            if (furnitureCol > 0) {
                dataSheet.getCell(row, furnitureCol).dataValidation = {
                    type: 'list', allowBlank: false,
                    formulae: [`"${furnitureDropdown}"`],
                    showErrorMessage: true, errorTitle: 'Lỗi', error: 'Chọn nội thất hợp lệ',
                };
            }
            if (fireCol > 0) {
                dataSheet.getCell(row, fireCol).dataValidation = {
                    type: 'list', allowBlank: false,
                    formulae: ['"TRUE,FALSE"'],
                    showErrorMessage: true, errorTitle: 'Lỗi', error: 'Chọn TRUE hoặc FALSE',
                };
            }
        }

        // Freeze header row
        dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

        // --- Sheet 2: Instructions ---
        const instrSheet = workbook.addWorksheet('Hướng dẫn');
        instrSheet.columns = [{ width: 25 }, { width: 60 }, { width: 20 }];
        const instrHeader = instrSheet.addRow(['Cột', 'Mô tả', 'Bắt buộc']);
        instrHeader.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B50DA' } };
        });

        const instructions: [string, string, string][] = [
            ['Tiêu đề', 'Tên bất động sản (5-255 ký tự)', 'Có'],
            ['Mô tả', 'Mô tả chi tiết (tối thiểu 10 ký tự)', 'Có'],
            ['Loại BĐS', PROPERTY_TYPE_VI_LABELS.join(', '), 'Có'],
            ['Giá thuê/tháng', 'Số tiền VND (ví dụ: 5000000)', 'Có'],
            ['Tiền cọc', 'Số tiền VND', 'Có'],
            ['Số tháng cọc', 'Số nguyên (ví dụ: 2)', 'Có'],
            ['Địa chỉ', 'Số nhà, tên đường', 'Có'],
            ['Phường/Xã', 'Tên phường/xã (hệ thống sẽ tự xác định tọa độ)', 'Có'],
            ['Quận/Huyện', 'Tên quận/huyện', 'Có'],
            ['Thành phố', 'Tên thành phố/tỉnh', 'Có'],
            ['Diện tích (m²)', 'Diện tích theo m²', 'Có'],
            ['Số phòng ngủ', 'Số nguyên', 'Không'],
            ['Số phòng tắm', 'Số nguyên', 'Không'],
            ['Tầng', 'Tầng đặt BĐS', 'Không'],
            ['Tổng số tầng', 'Tổng tầng tòa nhà', 'Không'],
            ['Nội thất', FURNITURE_STATUS_VI_LABELS.join(', '), 'Có'],
            ['Phí giữ xe', 'VND/tháng', 'Không'],
            ['Phí quản lý', 'VND/tháng', 'Không'],
            ['Điện (đ/kWh)', 'Giá điện', 'Không'],
            ['Nước (đ/m³)', 'Giá nước', 'Không'],
            ['Thuê tối thiểu (tháng)', 'Số tháng', 'Không'],
            ['Thuê tối đa (tháng)', 'Số tháng', 'Không'],
            ['Ngày có thể thuê', 'YYYY-MM-DD', 'Không'],
            ['PCCC', 'TRUE hoặc FALSE', 'Có'],
            ['URL Ảnh chính', 'URL Cloudinary ảnh đại diện', 'Có'],
            ['URL Ảnh phụ (;)', 'Nhiều URL cách bởi dấu ;', 'Không'],
            ['Tiện ích (;)', 'Nhiều tiện ích cách bởi dấu ;', 'Không'],
        ];
        instructions.forEach((row) => instrSheet.addRow(row));

        // --- Sheet 3: Note about geocoding ---
        const noteSheet = workbook.addWorksheet('Lưu ý');
        noteSheet.columns = [{ width: 80 }];
        const noteHeader = noteSheet.addRow(['LƯU Ý QUAN TRỌNG']);
        noteHeader.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFDC3545' } };
        noteSheet.addRow([]);
        noteSheet.addRow(['🔹 Hệ thống sẽ tự động xác định tọa độ (vĩ độ, kinh độ) từ địa chỉ bạn nhập.']);
        noteSheet.addRow(['🔹 Vui lòng nhập chính xác: Địa chỉ, Phường/Xã, Quận/Huyện, Thành phố.']);
        noteSheet.addRow(['🔹 Nếu không xác định được tọa độ, hệ thống sẽ sử dụng tọa độ trung tâm thành phố.']);
        noteSheet.addRow([]);
        noteSheet.addRow(['🔹 Loại BĐS: chọn từ dropdown (Căn hộ/Chung cư, Nhà nguyên căn, Đất, Văn phòng, Phòng trọ).']);
        noteSheet.addRow(['🔹 Nội thất: chọn từ dropdown (Không nội thất, Nội thất cơ bản, Nội thất đầy đủ, Nội thất cao cấp).']);
        noteSheet.addRow([]);
        noteSheet.addRow(['🔹 Tất cả BĐS sau khi import sẽ ở trạng thái "Chờ duyệt" (pending_approval).']);
        noteSheet.addRow(['🔹 Admin sẽ xem xét và duyệt từng BĐS.']);

        return await workbook.xlsx.writeBuffer();
    }

    // ============================================================
    // UPLOAD & PROCESS
    // ============================================================
    async processUpload(userId: string, file: Express.Multer.File) {
        // 1. Re-check eligibility
        const eligibility = await this.checkEligibility(userId);
        if (!eligibility.eligible) {
            throw new ForbiddenException(`Không đủ điều kiện: ${eligibility.reasons.join(', ')}`);
        }

        // 2. Parse Excel
        const workbook = new ExcelJS.Workbook();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await workbook.xlsx.load(file.buffer as any);
        const sheet = workbook.getWorksheet('Dữ liệu') || workbook.getWorksheet(1);
        if (!sheet) throw new BadRequestException('File Excel không hợp lệ');

        // 3. Read headers
        const headerRow = sheet.getRow(1);
        const colMap: Record<number, keyof BulkPropertyRow> = {};
        headerRow.eachCell((cell, colNumber) => {
            const headerText = String(cell.value || '').replace(' *', '').trim();
            const key = EXCEL_COLUMN_MAP[headerText];
            if (key) colMap[colNumber] = key;
        });

        // 4. Read data rows
        const rows: { rowNumber: number; data: Record<string, any> }[] = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // skip header
            const rowData: Record<string, any> = {};
            let hasData = false;
            row.eachCell((cell, colNumber) => {
                const key = colMap[colNumber];
                if (key) {
                    let value = cell.value;
                    // Handle ExcelJS rich text
                    if (value && typeof value === 'object' && 'richText' in value) {
                        value = (value as any).richText?.map((r: any) => r.text).join('') || '';
                    }
                    if (value && typeof value === 'object' && 'result' in value) {
                        value = (value as any).result;
                    }
                    rowData[key] = value;
                    if (value !== null && value !== undefined && value !== '') hasData = true;
                }
            });
            if (hasData) rows.push({ rowNumber, data: rowData });
        });

        if (rows.length === 0) {
            throw new BadRequestException('File Excel không có dữ liệu');
        }
        if (rows.length > 100) {
            throw new BadRequestException('Tối đa 100 dòng mỗi lần import');
        }

        // 5. Create import session
        const session = await this.db.importSession.create({
            data: {
                userId,
                fileName: file.originalname,
                totalRows: rows.length,
                status: ImportSessionStatus.PROCESSING,
            },
        });

        // 6. Validate & create properties
        let successCount = 0;
        let failedCount = 0;
        const errorRecords: { rowNumber: number; field: string; value: string; errorMessage: string }[] = [];

        const landlord = await this.db.user.findUnique({
            where: { id: userId },
            select: { email: true, fullName: true },
        });

        for (const { rowNumber, data } of rows) {
            // Type coercion + Vietnamese → enum mapping
            const coerced = this.coerceRowData(data);
            const result = bulkPropertyRowSchema.safeParse(coerced);

            if (!result.success) {
                failedCount++;
                for (const issue of result.error.issues) {
                    const field = issue.path.join('.');
                    errorRecords.push({
                        rowNumber,
                        field,
                        value: String(coerced[field] ?? '').substring(0, 500),
                        errorMessage: issue.message,
                    });
                }
                continue;
            }

            // Check duplicate title for this user
            const duplicate = await this.db.property.findFirst({
                where: { landlordId: userId, title: result.data.title, deletedAt: null },
                select: { propertyId: true },
            });
            if (duplicate) {
                failedCount++;
                errorRecords.push({
                    rowNumber, field: 'title',
                    value: result.data.title.substring(0, 500),
                    errorMessage: `Tiêu đề đã tồn tại (ID: ${duplicate.propertyId})`,
                });
                continue;
            }

            // Geocode address → lat/lng
            const fullAddress = `${result.data.address}, ${result.data.ward}, ${result.data.district}, ${result.data.city}`;
            const coords = await this.geocodeAddress(fullAddress);

            // Create property
            try {
                const images = this.parseImages(result.data);
                const amenities = result.data.amenities
                    ? result.data.amenities.split(';').map((s) => s.trim()).filter(Boolean)
                    : [];

                const property = await this.db.property.create({
                    data: {
                        landlordId: userId,
                        title: result.data.title,
                        description: result.data.description,
                        propertyType: result.data.propertyType as any,
                        pricePerMonth: result.data.pricePerMonth,
                        depositAmount: result.data.depositAmount,
                        depositMonths: result.data.depositMonths,
                        address: result.data.address,
                        ward: result.data.ward,
                        district: result.data.district,
                        city: result.data.city,
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        areaSqm: result.data.areaSqm,
                        bedrooms: result.data.bedrooms ?? 0,
                        bathrooms: result.data.bathrooms ?? 0,
                        floorNumber: result.data.floorNumber ?? undefined,
                        totalFloors: result.data.totalFloors ?? undefined,
                        furnitureStatus: result.data.furnitureStatus as any,
                        parkingFee: result.data.parkingFee ?? undefined,
                        managementFee: result.data.managementFee ?? undefined,
                        electricityCostPerKwh: result.data.electricityCostPerKwh ?? undefined,
                        waterCostPerM3: result.data.waterCostPerM3 ?? undefined,
                        minimumLeaseMonths: result.data.minimumLeaseMonths ?? 6,
                        maximumLeaseMonths: result.data.maximumLeaseMonths ?? undefined,
                        availableFrom: result.data.availableFrom ? new Date(result.data.availableFrom) : null,
                        hasFireCertificate: result.data.hasFireCertificate,
                        status: PropertyStatus.pending_approval,
                        approvalStatus: ApprovalStatus.pending,
                        images: images.length > 0 ? { createMany: { data: images } } : undefined,
                        amenities: amenities.length > 0
                            ? { createMany: { data: amenities.map((name) => ({ name })), skipDuplicates: true } }
                            : undefined,
                    },
                });

                // Emit event for notification
                this.rabbitClient.emit('property.created', {
                    propertyId: property.propertyId,
                    landlordId: userId,
                    landlordEmail: landlord?.email,
                    landlordName: landlord?.fullName,
                    status: property.status,
                    source: 'bulk_import',
                });

                successCount++;
            } catch (err: any) {
                failedCount++;
                errorRecords.push({
                    rowNumber, field: 'system',
                    value: '', errorMessage: `Lỗi hệ thống: ${err.message?.substring(0, 200)}`,
                });
            }
        }

        // 7. Save errors
        if (errorRecords.length > 0) {
            await this.db.importRowError.createMany({
                data: errorRecords.map((e) => ({ sessionId: session.id, ...e })),
            });
        }

        // 8. Update session
        const finalStatus = failedCount === 0
            ? ImportSessionStatus.COMPLETED
            : successCount === 0
                ? ImportSessionStatus.FAILED
                : ImportSessionStatus.PARTIAL_FAILED;

        const updated = await this.db.importSession.update({
            where: { id: session.id },
            data: { successRows: successCount, failedRows: failedCount, status: finalStatus, completedAt: new Date() },
        });

        return updated;
    }

    // ============================================================
    // SESSIONS
    // ============================================================
    async getSessions(userId: string) {
        return this.db.importSession.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
                id: true, fileName: true, totalRows: true, successRows: true,
                failedRows: true, status: true, createdAt: true, completedAt: true,
            },
        });
    }

    async getSessionDetail(userId: string, sessionId: string) {
        const session = await this.db.importSession.findFirst({
            where: { id: sessionId, userId },
            include: { rowErrors: { orderBy: { rowNumber: 'asc' } } },
        });
        if (!session) throw new NotFoundException('Không tìm thấy phiên import');
        return session;
    }

    async getSessionErrors(userId: string, sessionId: string) {
        const session = await this.db.importSession.findFirst({
            where: { id: sessionId, userId },
            select: { id: true },
        });
        if (!session) throw new NotFoundException('Không tìm thấy phiên import');

        return this.db.importRowError.findMany({
            where: { sessionId },
            orderBy: { rowNumber: 'asc' },
        });
    }

    async exportErrorsExcel(userId: string, sessionId: string): Promise<ExcelJS.Buffer> {
        const session = await this.db.importSession.findFirst({
            where: { id: sessionId, userId },
            select: { id: true, fileName: true },
        });
        if (!session) throw new NotFoundException('Không tìm thấy phiên import');

        const errors = await this.db.importRowError.findMany({
            where: { sessionId },
            orderBy: { rowNumber: 'asc' },
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Lỗi Import');
        sheet.columns = [
            { header: 'Dòng', key: 'rowNumber', width: 10 },
            { header: 'Trường', key: 'field', width: 20 },
            { header: 'Giá trị', key: 'value', width: 30 },
            { header: 'Lỗi', key: 'errorMessage', width: 50 },
        ];

        const errorHeaderRow = sheet.getRow(1);
        errorHeaderRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
        });

        errors.forEach((e) => sheet.addRow(e));
        return await workbook.xlsx.writeBuffer();
    }

    // ============================================================
    // GEOCODING (Nominatim / OpenStreetMap - free, no API key)
    // ============================================================
    private async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
        const DEFAULT_COORDS = { latitude: 10.7769, longitude: 106.7009 }; // HCM default

        try {
            const query = encodeURIComponent(address);
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=vn&limit=1`;

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'RentalPlatform/1.0 (graduation-thesis)',
                    'Accept-Language': 'vi',
                },
            });

            if (!response.ok) {
                this.logger.warn(`Geocoding API returned ${response.status} for: ${address}`);
                return DEFAULT_COORDS;
            }

            const results = await response.json() as Array<{ lat: string; lon: string }>;

            if (results.length > 0) {
                return {
                    latitude: parseFloat(results[0].lat),
                    longitude: parseFloat(results[0].lon),
                };
            }

            this.logger.warn(`No geocoding results for: ${address}`);
            return DEFAULT_COORDS;
        } catch (error) {
            this.logger.error(`Geocoding error for "${address}":`, error);
            return DEFAULT_COORDS;
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================
    private coerceRowData(data: Record<string, any>): Record<string, any> {
        const numericFields = [
            'pricePerMonth', 'depositAmount', 'depositMonths',
            'areaSqm', 'bedrooms', 'bathrooms', 'floorNumber', 'totalFloors',
            'parkingFee', 'managementFee', 'electricityCostPerKwh', 'waterCostPerM3',
            'minimumLeaseMonths', 'maximumLeaseMonths',
        ];

        const coerced = { ...data };
        for (const field of numericFields) {
            if (coerced[field] !== undefined && coerced[field] !== null && coerced[field] !== '') {
                coerced[field] = Number(coerced[field]);
            } else {
                coerced[field] = undefined;
            }
        }

        // Boolean coercion
        if (typeof coerced.hasFireCertificate === 'string') {
            coerced.hasFireCertificate = coerced.hasFireCertificate.toUpperCase() === 'TRUE';
        }

        // Vietnamese → enum mapping for propertyType
        if (coerced.propertyType && typeof coerced.propertyType === 'string') {
            const trimmed = coerced.propertyType.trim();
            coerced.propertyType = PROPERTY_TYPE_VI_MAP[trimmed] || trimmed;
        }

        // Vietnamese → enum mapping for furnitureStatus
        if (coerced.furnitureStatus && typeof coerced.furnitureStatus === 'string') {
            const trimmed = coerced.furnitureStatus.trim();
            coerced.furnitureStatus = FURNITURE_STATUS_VI_MAP[trimmed] || trimmed;
        }

        // String coercion
        ['title', 'description', 'address', 'ward', 'district', 'city', 'primaryImageUrl',
         'additionalImageUrls', 'amenities', 'availableFrom']
            .forEach((f) => {
                if (coerced[f] !== undefined && coerced[f] !== null) {
                    coerced[f] = String(coerced[f]).trim();
                }
            });

        return coerced;
    }

    private parseImages(data: BulkPropertyRow) {
        const images: { uri: string; isPrimary: boolean }[] = [];
        if (data.primaryImageUrl) {
            images.push({ uri: data.primaryImageUrl, isPrimary: true });
        }
        if (data.additionalImageUrls) {
            const urls = data.additionalImageUrls.split(';').map((s) => s.trim()).filter(Boolean);
            urls.forEach((uri) => images.push({ uri, isPrimary: false }));
        }
        return images;
    }
}

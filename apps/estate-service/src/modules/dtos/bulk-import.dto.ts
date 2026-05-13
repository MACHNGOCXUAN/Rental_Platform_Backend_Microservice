import { z } from 'zod';

// ============================================================
// VIETNAMESE ↔ ENUM MAPPINGS
// ============================================================
export const PROPERTY_TYPE_VI_MAP: Record<string, string> = {
    'Căn hộ/Chung cư': 'apartment',
    'Nhà nguyên căn': 'house',
    'Đất': 'land',
    'Văn phòng': 'office',
    'Phòng trọ': 'room',
};

export const FURNITURE_STATUS_VI_MAP: Record<string, string> = {
    'Không nội thất': 'empty',
    'Nội thất cơ bản': 'basic',
    'Nội thất đầy đủ': 'full',
    'Nội thất cao cấp': 'luxury',
};

export const PROPERTY_TYPE_VI_LABELS = Object.keys(PROPERTY_TYPE_VI_MAP);
export const FURNITURE_STATUS_VI_LABELS = Object.keys(FURNITURE_STATUS_VI_MAP);

// ============================================================
// ZOD SCHEMA (accepts Vietnamese labels, will be mapped later)
// ============================================================
export const bulkPropertyRowSchema = z.object({
    title: z.string().min(5, 'Tiêu đề phải có ít nhất 5 ký tự').max(255, 'Tiêu đề tối đa 255 ký tự'),
    description: z.string().min(10, 'Mô tả phải có ít nhất 10 ký tự'),
    propertyType: z.string().refine(
        (val) => Object.values(PROPERTY_TYPE_VI_MAP).includes(val),
        { message: `Loại BĐS không hợp lệ (${PROPERTY_TYPE_VI_LABELS.join(', ')})` },
    ),
    pricePerMonth: z.number({ error: 'Giá thuê phải là số' }).positive('Giá thuê phải lớn hơn 0'),
    depositAmount: z.number({ error: 'Tiền cọc phải là số' }).min(0, 'Tiền cọc không được âm'),
    depositMonths: z.number({ error: 'Số tháng cọc phải là số' }).int().min(0, 'Số tháng cọc không được âm'),
    address: z.string().min(5, 'Địa chỉ phải có ít nhất 5 ký tự'),
    ward: z.string().min(1, 'Phường/Xã không được để trống'),
    district: z.string().min(1, 'Quận/Huyện không được để trống'),
    city: z.string().min(1, 'Thành phố không được để trống'),
    areaSqm: z.number({ error: 'Diện tích phải là số' }).positive('Diện tích phải lớn hơn 0'),
    bedrooms: z.number().int().min(0).optional().nullable(),
    bathrooms: z.number().int().min(0).optional().nullable(),
    floorNumber: z.number().int().min(0).optional().nullable(),
    totalFloors: z.number().int().min(0).optional().nullable(),
    furnitureStatus: z.string().refine(
        (val) => Object.values(FURNITURE_STATUS_VI_MAP).includes(val),
        { message: `Nội thất không hợp lệ (${FURNITURE_STATUS_VI_LABELS.join(', ')})` },
    ),
    parkingFee: z.number().min(0).optional().nullable(),
    managementFee: z.number().min(0).optional().nullable(),
    electricityCostPerKwh: z.number().min(0).optional().nullable(),
    waterCostPerM3: z.number().min(0).optional().nullable(),
    minimumLeaseMonths: z.number().int().min(1).optional().nullable(),
    maximumLeaseMonths: z.number().int().min(1).optional().nullable(),
    availableFrom: z.string().optional().nullable(),
    hasFireCertificate: z.boolean({ error: 'PCCC phải là TRUE hoặc FALSE' }),
    primaryImageUrl: z.string().url('URL ảnh chính không hợp lệ'),
    additionalImageUrls: z.string().optional().nullable(),
    amenities: z.string().optional().nullable(),
});

export type BulkPropertyRow = z.infer<typeof bulkPropertyRowSchema>;

// ============================================================
// EXCEL COLUMN MAPPING (Vietnamese header → schema key)
// ============================================================
export const EXCEL_COLUMN_MAP: Record<string, keyof BulkPropertyRow> = {
    'Tiêu đề': 'title',
    'Mô tả': 'description',
    'Loại BĐS': 'propertyType',
    'Giá thuê/tháng': 'pricePerMonth',
    'Tiền cọc': 'depositAmount',
    'Số tháng cọc': 'depositMonths',
    'Địa chỉ': 'address',
    'Phường/Xã': 'ward',
    'Quận/Huyện': 'district',
    'Thành phố': 'city',
    'Diện tích (m²)': 'areaSqm',
    'Số phòng ngủ': 'bedrooms',
    'Số phòng tắm': 'bathrooms',
    'Tầng': 'floorNumber',
    'Tổng số tầng': 'totalFloors',
    'Nội thất': 'furnitureStatus',
    'Phí giữ xe': 'parkingFee',
    'Phí quản lý': 'managementFee',
    'Điện (đ/kWh)': 'electricityCostPerKwh',
    'Nước (đ/m³)': 'waterCostPerM3',
    'Thuê tối thiểu (tháng)': 'minimumLeaseMonths',
    'Thuê tối đa (tháng)': 'maximumLeaseMonths',
    'Ngày có thể thuê': 'availableFrom',
    'PCCC': 'hasFireCertificate',
    'URL Ảnh chính': 'primaryImageUrl',
    'URL Ảnh phụ (;)': 'additionalImageUrls',
    'Tiện ích (;)': 'amenities',
};

export const EXCEL_HEADERS = Object.keys(EXCEL_COLUMN_MAP);
export const REQUIRED_HEADERS = [
    'Tiêu đề', 'Mô tả', 'Loại BĐS', 'Giá thuê/tháng', 'Tiền cọc', 'Số tháng cọc',
    'Địa chỉ', 'Phường/Xã', 'Quận/Huyện', 'Thành phố',
    'Diện tích (m²)', 'Nội thất', 'PCCC', 'URL Ảnh chính',
];

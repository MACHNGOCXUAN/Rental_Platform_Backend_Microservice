# LUỒNG NGHIỆP VỤ: CHẤM DỨT HỢP ĐỒNG & XỬ LÝ TRANH CHẤP

> Phân tích từ source code thực tế trong `contract-service` và `notification-service`.

---

## 1. TỔNG QUAN

Hệ thống có **2 module chính** xử lý tranh chấp và chấm dứt:

| Module | File chính | Mục đích |
|--------|-----------|----------|
| **Termination** | `termination.service.ts`, `termination.controller.ts` | Yêu cầu chấm dứt hợp đồng, review, thương lượng, escalate admin |
| **Report** | `report.service.ts`, `report.controller.ts` | Khiếu nại/tranh chấp, gửi admin xử lý, đính kèm bằng chứng |

**Quan hệ**: Report có thể liên kết với TerminationRequest qua `terminationRequestId`. Khi giải quyết Report liên kết termination, hệ thống đồng bộ trạng thái cả hai.

---

## 2. CÁC TRẠNG THÁI (ENUM)

### 2.1 TerminationRequestStatus
```
pending → approved | rejected
rejected → negotiating | admin_review
negotiating → resolved | admin_review
admin_review → admin_processing | resolved
admin_processing → resolved
```
Trạng thái kết thúc: `approved`, `resolved`, `cancelled`

### 2.2 TerminationResolution
- `continue_contract` — Tiếp tục hợp đồng
- `terminate_contract` — Chấm dứt hợp đồng

### 2.3 TerminationReason
- `lease_end` — Hết hạn hợp đồng
- `unilateral_termination` — Đơn phương chấm dứt
- `mutual_agreement` — Thỏa thuận hai bên
- `breach_of_contract` — Vi phạm hợp đồng
- `non_payment` — Không thanh toán
- `force_majeure` — Bất khả kháng
- `other` — Lý do khác

### 2.4 ReportStatus
```
open → cancelled
admin → resolved
```
Trạng thái kết thúc: `resolved`, `cancelled`

---

## 3. LUỒNG CHẤM DỨT HỢP ĐỒNG (TERMINATION)

### 3.1 Bước 1: Tenant/Owner gửi yêu cầu chấm dứt

**API**: `POST /contract/terminations`

**DTO**:
```typescript
{
  rentalId: string;          // UUID hợp đồng
  reason: TerminationReason; // Lý do chấm dứt
  note?: string;             // Ghi chú
  requestedTerminationDate: string; // Ngày muốn chấm dứt
  earlyTerminationFee?: number;     // Phí chấm dứt sớm
}
```

**Điều kiện**:
- Hợp đồng phải đang `active`
- Người gửi phải là owner hoặc tenant của hợp đồng
- Không có yêu cầu chấm dứt nào đang xử lý (pending/rejected/negotiating/admin_review/admin_processing)
- Không có khiếu nại nào đang do admin xử lý

**Kết quả**: Tạo record `ContractTerminationRequest` với status = `pending`.

**Thông báo**: Gửi event `termination.created` → notification-service thông báo cho bên còn lại.

### 3.2 Bước 2: Bên còn lại review (Chấp thuận / Từ chối)

**API**: `PUT /contract/terminations/:id/review`

**DTO**:
```typescript
{
  status: 'approved' | 'rejected';
  reviewNote?: string;
}
```

**Điều kiện**:
- Trạng thái hiện tại phải là `pending`
- Người review phải là bên còn lại (không phải người gửi yêu cầu)

**Nếu `approved`**:
1. Gọi `settleTermination()` — quyết toán tài chính (tiền cọc, phí phạt)
2. Cập nhật hợp đồng: status → `terminated` hoặc `expired` (nếu lý do là `lease_end`)
3. Cập nhật rental request → `expired`
4. Cập nhật property contract status → `contract_ended`

**Nếu `rejected`**: Trạng thái → `rejected`. Người gửi được thông báo và có 2 lựa chọn tiếp theo.

**Thông báo**: Event `termination.reviewed` → thông báo cho người gửi yêu cầu ban đầu.

### 3.3 Bước 3: Sau khi bị từ chối — Thương lượng hoặc Escalate

**API**: `PUT /contract/terminations/:id/status`

**DTO**:
```typescript
{
  status: TerminationRequestStatus;
  resolution?: TerminationResolution; // Bắt buộc nếu status = 'resolved'
  note?: string;
}
```

#### Kịch bản A: Chuyển sang thương lượng (`negotiating`)
- Từ trạng thái `rejected` → `negotiating`
- Hai bên tự trao đổi (qua chat/điện thoại)
- Event `termination.negotiating` → thông báo bên kia bắt đầu thương lượng

#### Kịch bản B: Thương lượng thành công → Tự giải quyết (`resolved`)
- Từ `negotiating` → `resolved`
- Bắt buộc chọn `resolution`: `continue_contract` hoặc `terminate_contract`
- Nếu `terminate_contract`: gọi `settleTermination()`, cập nhật hợp đồng

#### Kịch bản C: Không thỏa thuận được → Gửi admin (`admin_review`)
- Từ `rejected` hoặc `negotiating` → `admin_review`
- Hệ thống **tự động tạo Report** liên kết với termination request
- Event `termination.escalated` → thông báo cho **tất cả admin** (priority URGENT) + bên còn lại

**Khi chuyển sang `admin_review`**, hệ thống:
1. Kiểm tra đã có Report liên kết chưa
2. Nếu chưa → tạo Report mới với status `admin`, type `contract`, liên kết `terminationRequestId`
3. Tạo ReportHistory ghi nhận hành động `SENT_TO_ADMIN`

### 3.4 Sơ đồ trạng thái Termination

```
Tenant/Owner tạo yêu cầu
         │
         ▼
      [pending]
         │
    Bên kia review
     ┌────┴────┐
     ▼         ▼
[approved]  [rejected]
  (kết thúc    │
  + settle)    ├──────────────────┐
               │                  │
               ▼                  ▼
         [negotiating]      [admin_review]
            │    │                │
            │    │           Admin tiếp nhận
            │    │                │
            ▼    ▼                ▼
       [resolved] [admin_review] [admin_processing]
                                  │
                                  ▼
                             [resolved]
```

---

## 4. LUỒNG KHIẾU NẠI (REPORT)

### 4.1 Tạo khiếu nại

**API**: `POST /contract/reports`

**DTO**:
```typescript
{
  rentalId: string;
  againstId: string;              // Khiếu nại ai
  terminationRequestId?: string;  // Liên kết termination (nếu có)
  type: 'payment' | 'deposit' | 'property' | 'contract' | 'other';
  priority?: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  attachments?: { url: string; type: string; fileName?: string; fileSize?: number }[];
}
```

**Điều kiện**:
- Admin không được tạo khiếu nại
- `againstId` phải là bên còn lại trong hợp đồng
- Không có termination request nào đang do admin xử lý
- Không có khiếu nại nào đang do admin xử lý

**Kết quả**:
- Tạo Report với status = `admin` (gửi thẳng admin)
- Lưu attachments (bằng chứng)
- Nếu có `terminationRequestId` → cập nhật termination → `admin_review`

**Thông báo**: Event `report.created` → thông báo tất cả admin + bên bị khiếu nại.

### 4.2 Cập nhật trạng thái Report

**API**: `PUT /contract/reports/:id/status`

**Chuyển trạng thái hợp lệ**:
- `open` → `cancelled` (chỉ người tạo)
- `admin` → `resolved` (chỉ admin)

**Khi resolved** và có liên kết termination:
- Cập nhật termination → `resolved`
- Resolution mặc định: `continue_contract`

### 4.3 Admin giải quyết Report (endpoint riêng)

**API**: `PATCH /contract/admin/reports/:id/resolve`

**DTO**:
```typescript
{
  adminNote: string;
  terminationResolution?: TerminationResolution;
}
```

Khi resolve, nếu Report có liên kết termination → đồng bộ termination status = `resolved`, resolution = `continue_contract`.

---

## 5. ADMIN GIẢI QUYẾT TRANH CHẤP CHẤM DỨT

### 5.1 Xem danh sách

**API**: `GET /contract/terminations/admin/list?status=admin_review`

Trả về danh sách termination requests kèm thông tin hợp đồng và reports liên kết.

### 5.2 Xem chi tiết

**API**: `GET /contract/terminations/admin/:id`

Trả về chi tiết bao gồm:
- Thông tin termination request
- Hợp đồng + payments + deposits
- Reports liên kết + histories + attachments (bằng chứng)
- Decisions đã đưa ra trước đó

### 5.3 Admin ra quyết định

**API**: `PUT /contract/terminations/admin/:id/resolve`

**DTO**:
```typescript
{
  adminNote: string;
  resolution: 'continue_contract' | 'terminate_contract';
  depositReturnAmount?: number;   // Số tiền cọc hoàn trả
  penaltyAmount?: number;         // Số tiền phạt
  compensationAmount?: number;    // Số tiền bồi thường
}
```

**Điều kiện**: Termination phải đang ở `admin_review` hoặc `admin_processing`.

**Xử lý**:

1. **Ghi nhận quyết định** → Tạo `TerminationDecision` (audit trail)
2. **Cập nhật termination** → status = `resolved`
3. **Nếu `terminate_contract`**:
   - Gọi `settleTermination()` — quyết toán tài chính
   - Hợp đồng → `terminated`/`expired`
   - Rental request → `expired`
   - Property → `contract_ended`
4. **Đóng Reports liên kết** → status = `resolved` + ghi history
5. **Thông báo**: Event `termination.resolved` → thông báo cả owner và tenant

### 5.4 Admin cũng có thể chuyển trạng thái

**API**: `PUT /contract/terminations/:id/status` (với role ADMIN)

Admin được phép:
- `admin_review` → `admin_processing` hoặc `resolved`
- `admin_processing` → `resolved`

---

## 6. CHÍNH SÁCH TÀI CHÍNH KHI CHẤM DỨT (settleTermination)

### 6.1 Quy tắc theo lý do chấm dứt

| Lý do | Tiền cọc | Phí phạt |
|-------|----------|----------|
| `unilateral_termination` (Tenant gửi) | Tịch thu cho Owner | Tenant trả phí |
| `unilateral_termination` (Owner gửi) | Hoàn cho Tenant | Owner trả phí |
| `breach_of_contract` | Tịch thu cho bên không vi phạm | Bên vi phạm trả |
| `non_payment` | Tịch thu cho Owner | Tenant trả phí |
| `mutual_agreement` / `lease_end` / `force_majeure` | Hoàn cho Tenant | Không có |

### 6.2 Quy trình quyết toán

1. Xác định policy theo lý do + vai trò người gửi
2. Tìm deposit transaction của hợp đồng
3. Tìm ví owner + tenant
4. Tính tổng công nợ chưa thanh toán (payments đến hạn chưa trả)
5. **Xử lý phí phạt**: Trừ ví bên phải trả, cộng ví bên nhận
6. **Xử lý tiền cọc**:
   - Owner đơn phương → hoàn cọc cho tenant từ pendingBalance
   - Tịch thu cho owner → chuyển từ pendingBalance sang balance
   - Tịch thu cho tenant → hoàn từ pendingBalance owner sang balance tenant
   - Mặc định: dùng cọc trả công nợ, phần dư hoàn tenant
7. Cập nhật deposit status: `forfeited` / `fully_returned` / `partially_returned`
8. Cập nhật payments đã trả bằng tiền cọc

---

## 7. HỆ THỐNG THÔNG BÁO

### 7.1 Các event RabbitMQ

| Event | Người nhận | Mô tả |
|-------|-----------|-------|
| `termination.created` | Bên còn lại | Có yêu cầu chấm dứt mới |
| `termination.reviewed` | Người gửi yêu cầu | Kết quả review (approved/rejected) |
| `termination.negotiating` | Bên còn lại | Bắt đầu thương lượng |
| `termination.escalated` | Tất cả Admin + bên kia | Tranh chấp gửi lên admin |
| `termination.resolved` | Owner + Tenant | Admin đã giải quyết |
| `report.created` | Tất cả Admin + bên bị khiếu nại | Khiếu nại mới |
| `report.resolved` | Owner + Tenant | Khiếu nại đã giải quyết |
| `report.cancelled` | Bên còn lại | Khiếu nại bị hủy |

### 7.2 Kênh thông báo
- **In-app**: Lưu DB + hiển thị dropdown
- **Realtime**: Socket event `notification`
- **Push**: Firebase (nếu đã subscribe token)

---

## 8. LUỒNG TỔNG THỂ (END-TO-END)

```
┌─────────────────────────────────────────────────────────────────┐
│                    GIAI ĐOẠN 1: GỬI YÊU CẦU                    │
│  Tenant/Owner tạo termination request (POST /terminations)      │
│  → Status: pending                                              │
│  → Thông báo cho bên còn lại                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                GIAI ĐOẠN 2: REVIEW (BÊN CÒN LẠI)               │
│  PUT /terminations/:id/review                                   │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │  APPROVED ✅  │  │  REJECTED ❌ │                             │
│  │  → settle     │  │  → rejected  │                             │
│  │  → terminate  │  │              │                             │
│  │  → KẾT THÚC  │  │              │                             │
│  └──────────────┘  └──────┬───────┘                             │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│             GIAI ĐOẠN 3: THƯƠNG LƯỢNG HOẶC ESCALATE            │
│  PUT /terminations/:id/status                                   │
│  ┌─────────────────┐  ┌──────────────────┐                      │
│  │  NEGOTIATING 🤝 │  │  ADMIN_REVIEW 📋 │                      │
│  │  Hai bên tự giải│  │  Tạo Report tự   │                      │
│  │  quyết qua chat │  │  động + thông    │                      │
│  │                 │  │  báo admin        │                      │
│  └────────┬────────┘  └────────┬─────────┘                      │
│           │                    │                                 │
│  ┌────────▼────────┐  ┌───────▼──────────┐                      │
│  │  resolved ✅     │  │  Hoặc tạo Report │                      │
│  │  (continue/     │  │  riêng với bằng  │                      │
│  │   terminate)    │  │  chứng đính kèm  │                      │
│  └─────────────────┘  └───────┬──────────┘                      │
└───────────────────────────────┼─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│               GIAI ĐOẠN 4: ADMIN GIẢI QUYẾT                    │
│  GET  /terminations/admin/:id        — Xem chi tiết             │
│  PUT  /terminations/admin/:id/resolve — Ra quyết định           │
│                                                                  │
│  Admin quyết định:                                               │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │  continue_contract   │  │  terminate_contract   │             │
│  │  Tiếp tục hợp đồng  │  │  Chấm dứt hợp đồng  │             │
│  │  → resolved          │  │  → settle tài chính  │             │
│  │  → đóng reports      │  │  → terminated/expired│             │
│  │                      │  │  → đóng reports      │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                  │
│  → Ghi TerminationDecision (audit)                               │
│  → Thông báo cả owner + tenant                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. CÁC RÀNG BUỘC NGHIỆP VỤ QUAN TRỌNG

1. **Không trùng lặp**: Chỉ 1 termination request active tại 1 thời điểm cho 1 hợp đồng
2. **Không tự duyệt**: Người gửi không thể review yêu cầu của mình
3. **Không chồng chéo**: Không tạo report khi đang có termination do admin xử lý và ngược lại
4. **Admin không tạo khiếu nại**: Admin chỉ giải quyết, không tạo
5. **Người tạo hủy**: Chỉ người tạo report mới được hủy
6. **Đồng bộ**: Khi resolve report liên kết termination → tự động resolve termination
7. **Wallet check**: Kiểm tra số dư ví trước khi trừ phí phạt
8. **Audit trail**: Mọi quyết định admin được ghi vào TerminationDecision + ReportHistory

---

## 10. SOURCE CODE THAM CHIẾU

| File | Đường dẫn |
|------|-----------|
| Termination Controller | `apps/contract-service/src/modules/controllers/termination.controller.ts` |
| Termination Service | `apps/contract-service/src/modules/services/termination.service.ts` |
| Report Controller | `apps/contract-service/src/modules/controllers/report.controller.ts` |
| Report Service | `apps/contract-service/src/modules/services/report.service.ts` |
| Termination DTO | `apps/contract-service/src/modules/dtos/termination.dto.ts` |
| Report DTO | `apps/contract-service/src/modules/dtos/report.dto.ts` |
| Prisma Schema | `apps/contract-service/prisma/schema.prisma` |
| Notification Handlers | `apps/notification-service/src/modules/controllers/notification.controller.ts` |

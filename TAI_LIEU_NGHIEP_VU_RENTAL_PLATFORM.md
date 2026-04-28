# TAI LIEU NGHIEP VU HE THONG NEN TANG THUE BAT DONG SAN

## 1. Tong quan he thong
### 1.1 Muc dich kinh doanh
He thong la nen tang fullstack ho tro quy trinh cho thue bat dong san tu dau den cuoi:
- Dang ky, xac thuc, quan ly ho so nguoi dung.
- Dang tin bat dong san, duyet tin, tim kiem va loc tin.
- Dat lich xem nha.
- Tao yeu cau thue, mo coc giu cho, tao hop dong, ky hop dong dien tu.
- Thanh toan, vi dien tu, giao dich, doi soat.
- Khieu nai/tranh chap va cham dut hop dong.
- Chat realtime, goi voice/video, thong bao realtime.
- Phan tich du lieu va AI (du doan gia, goi y noi dung).

### 1.2 Tac nhan nghiep vu
- Khach thue (Tenant): tim nha, gui yeu cau thue, dat coc, ky hop dong, thanh toan, gui cham dut, khieu nai, quan ly tai san.
- Chu nha (Owner):xac thuc KYC, dang tin, quan ly tai san, duyet yeu cau thue, tao/chinh sua hop dong, xu ly tranh chap, gui cham dut hop dong
- Quan tri vien (Admin): duyet tin, duyet KYC, quan ly user, xu ly khieu nai, quan ly noi dung tin tuc.
- He thong tu dong: gui thong bao, doi soat thanh toan

### 1.3 Kien truc tong the
Kien truc microservices voi API Gateway (Kong), giao tiep REST + gRPC + RMQ + Socket:
- Gateway: Kong, route theo prefix `/api/estate`, `/api/contract`, `/api/chat`, `/api/notification`, `/api/ai`.
- Backend services:
  - estate-service (NestJS + PostgreSQL): auth/user/property/booking/news/kyc.
  - contract-service (NestJS + PostgreSQL): rental request/contract/payment/wallet/report/termination/template.
  - chat-service (NestJS + MongoDB): conversation/message/call/category + websocket.
  - notification-service (NestJS + PostgreSQL + RMQ + Firebase): thong bao da kenh + websocket.
  - ai-service (FastAPI): predict price/chat/vision.
- Ha tang: PostgreSQL, MongoDB, Redis, RabbitMQ, Cloudinary, Firebase, MoMo/VNPAY, SmartCA, blockchain module rieng.

Nguon doi chieu chinh:
- `Rental_Platform_Backend_Microservice/configs/kong/config.yml`
- `Rental_Platform_Backend_Microservice/docker-compose.dev.yml`
- `Rental_Platform_Backend_Microservice/apps/*/src/main.ts`

## 2. Tac nhan va phan quyen
### 2.1 Roles trong he thong
Role theo payload auth dung chung:
- TENANT
- OWNER
- ADMIN

Co su khac biet ky thuat can luu y:
- Trong estate-service Prisma enum role dang la `admin`, `user`.
- Trong contract-service enum user role nghiep vu la `OWNER`, `TENANT`.

=> Gia dinh nghiep vu hop ly: estate-service `user` la nguoi dung ung dung (co the la tenant/owner theo luong), con contract-service tach ro OWNER/TENANT o context hop dong.

### 2.2 Quyen han theo role
- Tenant:
  - Tim kiem tin dang, xem chi tiet, dat lich xem nha.
  - Gui yeu cau thue, dat coc giu cho, ky hop dong.
  - Thanh toan, theo doi hoa don, su dung vi.
  - Tao khieu nai, yeu cau cham dut hop dong.
- Owner:
  - Tao/chinh sua dang tin, gui duyet, quan ly hien thi.
  - Xem va review yeu cau thue.
  - Tao/chinh sua/gui hop dong, ky hop dong.
  - Theo doi thanh toan, xu ly van de voi tenant.
- Admin:
  - Duyet/tu choi bat dong san, quan ly user/admin.
  - Duyet KYC.
  - Quan ly tin tuc.
  - Xu ly tranh chap, quyet dinh ket thuc/cham dut.

## 3. Cac module nghiep vu (theo service)
### 3.1 Estate service
Muc dich:
- Cung cap nghiep vu cot loi user + property + booking + news + kyc.

Entity chinh (Prisma):
- User, UserProfile, SocialAccount.
- KycDocument.
- Property, PropertyImage, PropertyVideo, PropertyAmenity, PropertyRule.
- Booking, Review, Favorite.
- MaintenanceRequest, MaintenanceUpdate, PropertyInspection.
- NewsArticle.

API chinh (rut gon):
- Auth:
  - `POST /auth/admin/login`
  - `POST /auth/user/login`
  - `POST /auth/signup`
  - `GET /auth/profile`, `PUT /auth/profile`, `PUT /auth/avatar`
  - OAuth: `GET /auth/google`, `GET /auth/facebook`, callback/exchange
  - OTP: request/verify qua phone, email, forgot password
- Property:
  - `GET /properties/search`, `GET /properties/featured`, `GET /properties/public/:id`
  - `POST /properties`, `POST /properties/draft`
  - `GET /properties/status-count`, `GET /properties/status`
  - `GET /properties/favorites`, `POST /properties/:id/favorite`, `PUT /properties/:id/unfavorite`
  - `PUT /properties/update/:id`, `PUT /properties/:id/visibility`
  - Admin: `POST /properties/admin`, `PUT /properties/admin/approve/:id`, `PUT /properties/admin/visibility/:id`
- Booking:
  - `GET /booking/available-slots`
  - `POST /booking/create`
  - `GET /booking/my`, `GET /booking/owner`
  - `PUT /booking/:id/confirm|reject|cancel|complete`
- KYC:
  - User: `POST /kyc/submit`, `POST /kyc/verify`
  - Admin: `PATCH /admin/kyc/:id/approve|reject`
- News:
  - Public: `GET /news`, `GET /news/featured`, `GET /news/:slug`
  - Admin: CRUD + publish/unpublish/feature

Quy tac nghiep vu noi bat:
- Dang tin co trang thai tu draft -> pending_approval -> active/rejected.
- Favorites gom add/remove + check status theo user.
- Booking phan tach ro luong nguoi dat va chu nha phe duyet.
- KYC co 2 lop xu ly: auto verify (OCR + face match) va admin review thu cong.
- KYC scoring:
  - score < 60 => reject
  - score >= 85 va khong co co canh bao => verified
  - cac truong hop con lai => in_review cho admin duyet

### 3.2 Contract service
Muc dich:
- Xu ly vong doi giao dich cho thue: request -> coc -> hop dong -> thanh toan -> tranh chap/cham dut.

Entity chinh:
- RentalRequest, RentalContract.
- Payment, DepositTransaction.
- Wallet, WalletTransaction, WithdrawalRequest.
- ContractTemplate, ContractTerm, ContractDocument, ContractAmendment.
- Report, ReportHistory, ReportAttachment.
- ContractTerminationRequest, TerminationDecision.

API chinh:
- Rental request: `POST /rental-requests`, `GET /rental-requests/my|owner`, `PUT /rental-requests/:id/review|cancel`.
- Holding deposit: `POST /holding-deposits/open|pay`.
- Rental contract:
  - `GET /rental-contracts/my|status-count|:id`
  - `PUT /rental-contracts/:id`
  - `PUT /rental-contracts/:id/send|tenant-sign|owner-sign|activate|cancel`
  - `POST /rental-contracts/createContract`
- Payment: `POST /payments/:contractId/deposit`, `GET /payments/my`, `PUT /payments/:paymentId/confirm`, `POST /payments/confirm/:paymentId`, `POST /payments/webhook`.
- Wallet:
  - `GET /wallet/balance`, `GET /wallet/transactions`
  - `POST /wallet/topup`, `POST /wallet/topup/:transactionId/confirm`
  - `GET /wallet/topup/:transactionId/status`
  - `POST /wallet/withdrawals`, `GET /wallet/withdrawals`, `GET /wallet/withdrawals/:withdrawalId`
  - webhook: `/wallet/webhook/momo`, `/wallet/webhook/vnpay`
- Report:
  - User: `POST /reports`, `GET /reports/contract/:rentalId`, `PUT /reports/:id/status`
  - Admin: `GET /admin/reports`, `GET /admin/reports/:id`, `PATCH /admin/reports/:id/resolve`
- Termination:
  - User: `POST /terminations`, `GET /terminations/contract/:rentalId`, `PUT /terminations/:id/review|status`
  - Admin: `GET /terminations/admin/list`, `GET /terminations/admin/:id`, `PUT /terminations/admin/:id/resolve`
- Contract template: CRUD + default + status + filter theo type.
- SmartCA: ky hop dong + verify blockchain.

Quy tac nghiep vu noi bat:
- RentalRequest co trang thai coc giu cho chi tiet (open/paid/locked/expired/refunded).
- Hop dong co trang thai chu ky 2 ben (pending_tenant -> tenant_signed -> pending_landlord -> owner_signed -> fully_signed -> active).
- Tranh chap/termination co nha nuoc trang thai dam phan + escalte admin.

### 3.3 Chat service
Muc dich:
- Kenh giao tiep realtime giua owner va tenant.

Entity chinh:
- Conversation, Message, CallSession.
- CustomerCategory, ConversationCategory.

API HTTP chinh:
- Conversation: `POST /conversations`, `GET /conversations/my`.
- Message: `GET /messages/conversation/:conversationId`, `POST /messages`, `POST /messages/:id/react`, `PUT /messages/conversation/:conversationId/message/read`.
- Upload file chat: `POST /upload-file`.
- Category: CRUD + gan conversation.
- Call history: `GET /calls`, `GET /calls/:id`.

Realtime:
- Socket namespace qua gateway route `/api/chat/socket.io`.
- Event: `new_message`, `new_conversation`, `message_read`, typing, call signaling.

### 3.4 Notification service
Muc dich:
- Xu ly thong bao in-app + push + email + sms va lang nghe su kien RMQ.

Entity chinh:
- Notification, NotificationRecipient, NotificationPreference, NotificationDevice.

API HTTP chinh:
- `GET /notification`
- `POST /notification/push/subscribe`
- `DELETE /notification/push/unsubscribe`
- `PATCH /notification/:id/read`
- `DELETE /notification/read`
- test push endpoint.
- SMS controller co event handler `send_sms`.

Event nghiep vu tieu bieu lang nghe tu RabbitMQ:
- property.created/approved/rejected
- rental.request.created/reviewed/...holding_deposit_*
- contract.sent_to_tenant/tenant_signed/owner_signed
- payment.reminder/due/warning/overdue
- termination.created/reviewed/escalated/resolved/negotiating
- report.created/resolved/cancelled
- email.otp.send

Cach thong bao duoc gui (day du):
- In-app notification: luu Notification + NotificationRecipient, hien thi dropdown/dashboard.
- Push notification: gui qua Firebase den token da subscribe (`/notification/push/subscribe`).
- Realtime notification: emit socket event `notification` va `notification:read` qua namespace `/notification`.
- Email/SMS notification:
  - Email OTP tu event `email.otp.send`.
  - SMS qua event `send_sms`.

### 3.5 AI service
Muc dich:
- Ho tro du doan gia va tro ly AI.

API chinh (prefix `/api/v1` trong service, qua gateway thanh `/api/ai/api/v1`):
- `POST /predict-price`
- `POST /train`
- `GET /price-analytics`
- `POST /chat`
- `POST /vision/describe`
- `POST /vision/generate-description`
- `GET /health`

Chi tiet AI Chat:
- Input: `userId`, `message`.
- Output: `answer`, `provider`, `properties[]`.
- Hanh vi nghiep vu:
  - AI co the tra ve action JSON `search_estate`.
  - Neu co `search_estate`, ai-service goi estate-service de tim property.
  - Ket qua duoc tra ve kem danh sach card bat dong san (toi da 3 card) de frontend render ngay trong hop chat.
  - Co fallback provider (OpenAI/Gemini/Groq), neu fail thi tra loi xin thu lai sau.

## 4. Luong nghiep vu trong tam (quan trong nhat)
### 4.1 Dang ky/Dang nhap
1. Nguoi dung mo auth modal web-client.
2. Chon dang nhap thuong hoac OAuth (Google/Facebook).
3. Frontend goi `/estate/auth/user/login` hoac redirect OAuth.
4. Backend validate credentials/token OAuth.
5. Tao access/refresh token, tra ve profile.
6. Frontend luu token (cookie/localStorage tuy app) va dong bo state.

Edge case:
- Sai thong tin dang nhap -> thong bao loi.
- Token het han -> refresh/yeu cau dang nhap lai.

### 4.2 Tao dang tin bat dong san
1. Owner vao man hinh tao tin (`/post/create`).
2. Upload media qua `/estate/upload/image|images|video|videos`.
3. Luu nhap hoac dang chinh thuc qua `/estate/properties/draft` hoac `/estate/properties`.
4. He thong dat trang thai pending_approval.
5. Admin duyet/tu choi qua endpoint admin properties.
6. Neu duyet -> listing xuat hien tren search/featured/public detail.

Validation chinh:
- Kiem tra field bat buoc (title, propertyType, gia, dia chi...).
- Trang thai KYC co the la dieu kien voi owner (theo luong UI).

### 4.3 Dat lich xem nha
1. Tenant xem chi tiet bat dong san va mo dat lich.
2. Frontend lay slots trong qua `/estate/booking/available-slots`.
3. Tenant gui `/estate/booking/create`.
4. Owner vao dashboard bookings de confirm/reject.
5. Sau buoi xem, owner/tenant cap nhat complete/cancel.

### 4.4 Gui yeu cau thue va coc giu cho
1. Tenant tao rental request qua `/contract/rental-requests`.
2. Owner xem danh sach request `/contract/rental-requests/owner`.
3. Owner review approve/reject.
4. Neu can coc: owner mo cua so coc qua `/contract/holding-deposits/open`.
5. Tenant thanh toan coc `/contract/holding-deposits/pay`.
6. Payment cap nhat trang thai + phat su kien thong bao.

### 4.5 Tao va ky hop dong
1. Tu rental request da du dieu kien, owner tao hop dong `/contract/rental-contracts/createContract`.
2. Owner chinh sua noi dung (neu can) va send `/contract/rental-contracts/:id/send`.
3. Tenant ky `/contract/rental-contracts/:id/tenant-sign` (hoac SmartCA flow).
4. Owner ky `/contract/rental-contracts/:id/owner-sign`.
5. He thong chuyen fully_signed, sau do activate `/contract/rental-contracts/:id/activate`.
6. Neu bat blockchain verification, su dung `/contract/smartca/verify/blockchain/:contractId`.

### 4.6 Thanh toan va vi
1. User xem so du va giao dich qua `/contract/wallet/*`.
2. Topup tao giao dich -> confirm/status.
3. Thanh toan lien quan hop dong qua `/contract/payments/*`.
4. Webhook payment gateway cap nhat trang thai thuc te.
5. He thong phat event reminder/due/overdue.

### 4.7 Khieu nai (report) va xu ly tranh chap
1. Owner/Tenant tao report `/contract/reports`.
2. Hai ben cap nhat trang thai report khi dam phan.
3. Neu can escalte: admin xu ly qua `/contract/admin/reports/:id/resolve`.
4. Ket qua co the dong bo voi termination neu report gan voi yeu cau cham dut.

### 4.8 Cham dut hop dong
1. Tenant/Owner tao yeu cau cham dut `/contract/terminations`.
2. Doi ben review `/contract/terminations/:id/review`.
3. Neu khong thong nhat, admin resolve `/contract/terminations/admin/:id/resolve`.
4. He thong cap nhat settlement va thong bao cac ben.

### 4.9 Chat/goi va thong bao realtime
1. User ket noi socket chat va notification thong qua gateway.
2. Khi gui tin: frontend goi REST tao message + socket phat event realtime.
3. Khi read/react: update DB + emit event.
4. Notification service phat in-app/push den nguoi nhan.

### 4.10 Chat voi AI (day du)
1. User mo AI Chat Box tren web-client.
2. Frontend goi `POST /api/ai/api/v1/chat` voi payload `{ userId, message }`.
3. AI service chon provider AI va sinh cau tra loi.
4. Neu AI xac dinh y dinh tim nha:
  - AI chen action `search_estate`.
  - AI service goi estate-service search API de lay danh sach property phu hop.
  - AI service map du lieu ve dang card (id, title, image, price, district, city, slug).
5. Frontend hien thi:
  - Cau tra loi text cua AI.
  - Danh sach card bat dong san (neu co).

Edge case:
- Provider AI loi/timeout => fallback provider khac hoac tra thong diep fallback.
- Search estate khong co ket qua => van tra text huong dan user doi tieu chi.

### 4.11 Xu ly KYC (day du)
1. User vao man hinh KYC va upload 3 anh bat buoc: `selfie`, `back`, `front`.
2. Frontend gui `POST /estate/kyc/submit` (hoac `/estate/kyc/verify`) dang multipart.
3. Backend estate-service thuc hien auto-check:
  - OCR CCCD qua FPT OCR (`front`).
  - Face match qua FPT Face Match (`front` + `selfie`).
  - Trich xuat document number (9-12 so), fullName, address...
4. Neu OCR khong hop le hoac khong trich duoc so giay to => reject som.
5. Upload 3 anh len Cloudinary.
6. Luu transaction DB:
  - cap nhat User.kycStatus, kycSubmittedAt, kycVerifiedAt, kycExpiredAt, kycRejectionReason.
  - upsert UserProfile (idCardNumber, fullName, currentAddress...).
  - tao KycDocument (score, ocrData, provider, status, notes flags).
7. Rule quyet dinh trang thai:
  - `< 60`: rejected.
  - `>= 85` va khong co flags: verified.
  - con lai: in_review.
8. Neu in_review, admin vao luong duyet:
  - `PATCH /estate/admin/kyc/:id/approve` => user sang verified.
  - `PATCH /estate/admin/kyc/:id/reject` + rejectionReason => user sang rejected.

Flags nghiep vu thuong gap:
- `ocr_invalid`, `face_mismatch`, `low_face_score`, `liveness_failed`.

### 4.12 Xu ly thong bao (day du)
1. Service nghiep vu (estate/contract) emit event qua RabbitMQ.
2. notification-service bat event (`@EventPattern`) va tao noi dung theo ngu canh:
  - rental request, contract signing, payment due/overdue, termination, report...
3. notification-service tao ban ghi Notification + Recipient.
4. Kenh phat:
  - In-app: user xem qua `GET /notification/notification`.
  - Realtime: gateway emit socket event `notification` vao room theo userId.
  - Push: neu user da subscribe token, gui Firebase push.
  - Email/SMS: OTP va cac mau email theo su kien.
5. User danh dau da doc:
  - `PATCH /notification/notification/:id/read`.
  - Neu la thong bao chung admin, khi 1 admin doc thi he thong co co che clear cho admin con lai.
6. User xoa thong bao da doc:
  - `DELETE /notification/notification/read`.

## 5. Mo hinh du lieu
### 5.1 Estate DB (PostgreSQL)
Nhom bang chinh va quan he:
- User 1-1 UserProfile.
- User 1-n Property (landlord).
- Property 1-n PropertyImage/PropertyVideo/PropertyAmenity/PropertyRule.
- User n-n Property thong qua Favorite.
- Property 1-n Booking; Booking lien ket tenant + landlord.
- User 1-n KycDocument.
- Property 1-n Review.
- NewsArticle doc lap theo admin workflow.

Field nghiep vu quan trong:
- Property.status, approvalStatus, visible.
- KycDocument.status.
- Booking.status.

### 5.2 Contract DB (PostgreSQL)
- RentalRequest lien ket propertyId + tenantId + ownerId.
- RentalContract co vong doi chu ky va trang thai thuc thi.
- Payment gan rental/contract + method/type/status.
- Wallet 1-1 theo user (qua userId), WalletTransaction 1-n.
- Report va Termination la cac kenh xu ly tranh chap/ket thuc.

Field nghiep vu quan trong:
- RentalRequestStatus, HoldingDepositStatus.
- RentalContractStatus.
- PaymentStatus, PaymentMethod, PaymentType.
- ReportStatus, TerminationRequestStatus.

### 5.3 Chat DB (MongoDB)
- Conversation chua thong tin cap user, unread, pin/archive.
- Message chua type media/text/reaction/read state.
- CallSession chua life-cycle cuoc goi (ringing/accepted/ended/missed...).

### 5.4 Notification DB (PostgreSQL)
- Notification la thong diep goc.
- NotificationRecipient luu trạng thai giao/da doc theo tung nguoi nhan.
- NotificationDevice luu token push.

## 6. Tong hop API theo service
Luu y: do so luong endpoint lon, bang sau tong hop endpoint nghiep vu cot loi (de ve use case va sequence), khong liệt ke toan bo endpoint ky thuat.

### 6.1 Estate
- Auth + profile + OAuth + OTP.
- Property public/user/admin workflow.
- Booking workflow.
- KYC user/admin.
- News public/admin.

### 6.2 Contract
- Rental requests.
- Holding deposits.
- Rental contracts + signing.
- Payments + wallet + withdrawals + webhook.
- Reports + admin resolve.
- Terminations + admin resolve.
- Contract templates.
- SmartCA/blockchain verify.

### 6.3 Chat
- Conversations, messages, reactions, read status.
- Category/tags cho conversation.
- Upload file chat.
- Call history + signaling realtime.

### 6.4 Notification
- Danh sach thong bao, mark read/clear read.
- Push subscribe/unsubscribe.
- Event-driven handler tu RabbitMQ.
- Socket realtime event `notification` va `notification:read`.
- Email OTP va SMS event.

### 6.5 AI
- Predict price/train/analytics.
- AI chat.
- Vision mo ta va tao description.
- AI chat co the tra them danh sach property de goi y truc tiep trong giao dien.

## 7. Hanh vi frontend
### 7.1 Web-client (Next.js)
Man hinh/chuc nang chinh:
- Public:
  - Home, search, property detail, news list/detail, template-contracts, terms/privacy.
- Authenticated dashboard:
  - profile, favorites, posts, customers, bookings, rental-requests, contracts, payments, wallet, statistics.
- KYC flow, chat page, tao tin dang, dat lich xem nha.
- AI chat box xuat hien trong layout va goi truc tiep AI service.

UI -> API pattern:
- Dung HTTP client chung trong `src/utils/api.ts`.
- Base URL tu `NEXT_PUBLIC_API_ENDPOINT`, tu dong them prefix `/api`.
- Redux slices goi endpoint theo domain:
  - auth.slice -> `/estate/auth/*`
  - property/estate/booking/kyc slices -> `/estate/*`
  - contract/wallet/smartca slices -> `/contract/*`
  - conversation/message/category slices -> `/chat/*`
  - notification slice -> `/notification/*`
- Socket:
  - Chat: namespace `/chat`, path `/api/chat/socket.io`.
  - Notification: namespace `/notification`, path `/api/notification/socket.io`.

Chi tiet 3 luong frontend ban can:
- AI Chat:
  - UI: `AIChatBox` goi `/api/ai/api/v1/chat`.
  - Neu response co `properties`, UI render card bat dong san de dieu huong sang trang chi tiet.
- KYC:
  - UI KYC thu thap 3 anh va submit qua `kyc.slice` (`/estate/kyc/submit`).
  - Hien thi trang thai `verified/in_review/rejected` va ly do neu bi tu choi.
- Notification:
  - NotificationDropdown/Redux lay danh sach tu `/notification/notification`.
  - Co mark-as-read va clear-read.
  - Socket context cap nhat thong bao moi theo thoi gian thuc.

### 7.2 Web-admin (React + react-router)
Routes chinh:
- Login.
- Dashboard tong quan.
- User list/detail, admin list/detail, profile.
- Property moderation: pending/approved/rejected/detail.
- Contract template management.
- Complaints (bao gom resolve report/termination).
- News CRUD + publish flow.
- AI analytics.
- Settings.

UI -> API:
- HTTP client `web-admin/src/utils/api.ts` (tu dong `/api` prefix).
- Goi den:
  - `/estate/admin/*` cho user/property/kyc/analytics/news.
  - `/contract/*` cho contract template va complaint resolution.
  - `/notification/*` cho thong bao admin.

## 8. Tich hop he thong
### 8.1 Giao tiep giua services
- REST qua Kong Gateway cho client.
- gRPC AuthService (estate-service) duoc service khac goi de validate/get user.
- RabbitMQ cho event-driven process:
  - estate/contract emit su kien nghiep vu.
  - notification-service subscribe va phat thong bao.
- WebSocket cho chat va notification realtime.

### 8.2 Co che xac thuc
- JWT access token qua header Authorization: Bearer.
- Guard role tren Nest controllers.
- Frontend web-client luu token bang cookie (HTTP client) va mot so module dung localStorage.
- web-admin luu token localStorage, tu dong logout khi 401.

### 8.3 Tich hop ben ngoai
- OAuth: Google, Facebook.
- Firebase: push notification.
- Cloudinary: upload image/video/file.
- Payment gateways: MoMo, VNPAY webhook flow.
- SmartCA: ky so hop dong.
- Blockchain module: luu/verify hash hop dong.
- AI provider stack trong ai-service (chat + vision + prediction).

## 9. Validation, bao mat, edge case
### 9.1 Validation
- Nest ValidationPipe bat global tren cac service (transform + whitelist).
- contract/chat/notification dung `forbidNonWhitelisted: true` (chat va notification/contract).
- estate cho phep non-whitelisted (`false`) nen can luu y nang cao validate o DTO/service.

### 9.2 Bao mat
- JWT guard + role guard.
- CORS thong qua Kong + service.
- Gateway co rate limiting plugin.
- Upload file can kiem soat type/size o frontend va backend.

### 9.3 Edge cases nghiep vu can test
- Race condition khi 2 tenant cung dat coc cho 1 property.
- Webhook thanh toan den cham/duplicate.
- User mat ket noi trong qua trinh ky SmartCA.
- Bat dong bo role enum giua estate va contract context.
- Contract da fully_signed nhung activate that bai.
- Notification event duoc emit nhieu lan (idempotency).
- Socket reconnect khi token het han.
- KYC OCR tra ket qua thieu field hoac sai dinh dang CCCD.
- KYC face score nam trong vung can review (60-84) can admin xu ly kip thoi.
- Token push het han/khong hop le lam push fail nhung in-app van phai luu.
- AI tra action JSON loi format, he thong phai fallback ve text thong thuong.

## 10. Danh sach use case de ve UML
### 10.1 Tenant
- Dang ky/Dang nhap.
- Tim kiem va xem chi tiet bat dong san.
- Dat lich xem nha.
- Gui yeu cau thue.
- Dat coc giu cho.
- Ky hop dong.
- Thanh toan hoa don.
- Quan ly vi (nap/rut/xem giao dich).
- Chat/goi voi owner.
- Tao/cap nhat khieu nai.
- Tao yeu cau cham dut hop dong.

### 10.2 Owner
- Dang ky/Dang nhap.
- KYC va cap nhat ho so.
- Tao/chinh sua dang tin.
- Gui duyet va theo doi trang thai phe duyet.
- Duyet/tu choi rental request.
- Tao/chinh sua/gui hop dong.
- Ky hop dong.
- Theo doi thanh toan.
- Xu ly khieu nai va termination review.
- Chat/goi voi tenant.

### 10.3 Admin
- Dang nhap admin.
- Quan ly user/admin.
- Duyet KYC.
- Moderation bat dong san.
- Quan ly tin tuc.
- Xem analytics.
- Xu ly khieu nai.
- Resolve termination.
- Quan ly template hop dong.

### 10.4 He thong tu dong
- Gui thong bao theo su kien RMQ.
- Nhac han thanh toan/due/overdue.
- Dong bo trang thai coc/hop dong/bao cao.
- Xu ly webhook payment.

## 11. CAC MODULE BO SUNG (THIEU TRONG TAI LIEU GOC)

### 11.1 Review module (estate-service)
Module danh gia bat dong san sau khi thue.

API:
- `GET /reviews/property/:propertyId` (Public): Lay danh sach danh gia cua bat dong san, ho tro phan trang va sap xep (newest/oldest/highest/lowest). Tra ve rating trung binh, tong so danh gia.
- `POST /reviews`: Tenant tao danh gia (rating 1-5, comment, imageUrls). Moi tenant chi danh gia 1 lan cho 1 hop dong thue (rentalId). Chu nha khong duoc tu danh gia.
- `PATCH /reviews/:id/reply`: Chu nha (landlord) tra loi danh gia.
- `DELETE /reviews/:id`: Xoa danh gia (chi nguoi tao hoac admin).

Entity: Review (reviewId, rentalId, propertyId, reviewerId, rating, comment, imageUrls, reply, repliedAt, isPublic).

### 11.2 Upload module (estate-service)
Module upload media len Cloudinary.

API:
- `POST /upload/image`: Upload 1 anh (max 10MB, cho phep jpeg/png/gif/webp).
- `POST /upload/images`: Upload nhieu anh (toi da 12 anh).
- `POST /upload/video`: Upload 1 video (max 100MB, cho phep mp4/quicktime/avi/webm).
- `POST /upload/videos`: Upload nhieu video (toi da 3 video).
- `GET /upload/get-signature` (Public): Lay Cloudinary signature de upload truc tiep tu client.

### 11.3 User Admin module (estate-service)
Quan ly tai khoan nguoi dung boi admin.

API:
- `GET /admin/user`: Lay danh sach tat ca user.
- `GET /admin/user/users`: Lay danh sach tai khoan user (role = user), co filter/search.
- `GET /admin/user/admins`: Lay danh sach tai khoan admin (role = admin), co filter/search.
- `POST /admin/user/users`: Tao tai khoan user moi.
- `POST /admin/user/admins`: Tao tai khoan admin moi.
- `PUT /admin/user/:id/ban`: Ban tai khoan (co reason va thoi han bannedUntil).
- `PUT /admin/user/:id/unban`: Go ban tai khoan.
- `GET /admin/user/:id`: Xem chi tiet tai khoan.

User model co cac truong ban: isBanned, bannedAt, bannedReason, bannedUntil.

### 11.4 Dashboard Analytics (estate-service)
API: `GET /admin/analytics/dashboard` (AdminOnly)

Tra ve du lieu tong hop cho admin dashboard:
- **overview**: tong bat dong san, tong nguoi dung, tong yeu cau thue, ti le tang truong thang, conversion rate, occupancy rate.
- **propertyType**: so luong/doanh thu/ty le/gia trung binh theo loai BDS (apartment/house/land/office/room), xu huong theo thang.
- **pricing**: min/max/avg/median gia, gia theo khu vuc, xu huong gia theo thang, outliers.
- **location**: so luong theo thanh pho, doanh thu theo khu vuc, khu vuc hot/it hoat dong.
- **users**: DAU/MAU, ty le thue thanh cong, thong ke KYC (verified/pending/rejected), user bi khoa, funnel chuyen doi.
- **listings**: trang thai tin dang, chat luong (co anh/co mo ta).
- **requests**: trang thai yeu cau (pending/approved/rejected/cancelled), funnel View→Request→Approve→Contract→Payment.
- **revenue**: tong doanh thu uoc tinh, hoa hong nen tang (12%), phi dich vu.
- **contracts**: dang hoat dong/het han/bi huy, theo trang thai.
- **moderation**: tin bi report, user bi khoa, ti le gian lan, thong ke KYC.
- **ai**: so request du doan gia/mo ta tu dong/chat AI, do chinh xac model.
- **system**: API calls/sec, error rate, response time, uptime.
- **advanced**: top khu vuc hot, top chu nha, top BDS xem nhieu, user retention, LTV, CAC.

### 11.5 Price Analytics (estate-service)
API: `GET /analytics/price` (Public)

Phan tich gia cho thue theo thi truong. Filter: propertyType, city, district, ward, months (3-24), top (3-20).

Tra ve:
- **summary**: so luong mau, gia trung binh/trung vi/min/max, dien tich trung binh, gia/m2, khoang gia pho bien (Q1-Q3).
- **distribution**: phan bo gia thanh 5 bucket.
- **trend**: xu huong gia trung binh/trung vi/min/max theo tung thang, ti le thay doi so voi thang truoc.
- **topCities**: top thanh pho theo gia trung binh va so luong.

### 11.6 Cronjob tu dong (contract-service)
He thong co 4 cronjob chinh chay dinh ky:

1. **handleMonthlyPayment** (cron: `CONTRACT_LIFECYCLE_CRON`, mac dinh moi 15 giay):
   - Quet tat ca hop dong active.
   - Tinh ngay den han thanh toan theo paymentDueDay.
   - 5 ngay truoc han → tao hoa don + gui thong bao `payment.reminder`.
   - Dung ngay den han → gui `payment.due` neu chua thanh toan.
   - Qua han:
     - < 5 ngay: gui `payment.due`.
     - >= 5 ngay: gui `payment.warning`.
     - >= 10 ngay: gui `payment.overdue` (severity: critical).
   - Tu dong tao cac payment phu (management_fee, parking, internet) cung ky.

2. **handlePaymentReconcile** (cron: `PAYMENT_RECONCILE_CRON`, mac dinh moi 20 giay):
   - Kiem tra trang thai cac payment pending qua cong thanh toan.
   - Doi soat wallet transaction pending.

3. **handleContractLifecycle** (cron: `CONTRACT_LIFECYCLE_CRON`):
   - **Tu dong gia han**: Neu hop dong co `autoRenewal = true` va da het han:
     - Hop dong dai han (>= 730 ngay): Tao hop dong moi hoan chinh (RENEW-xxx), chuyen deposit, ghi log `AUTO_RENEWED`.
     - Hop dong ngan han: Tao phu luc gia han (ContractAmendment), cap nhat endDate.
   - **Tu dong cham dut**: Neu hop dong het han va khong tu dong gia han → goi `autoTerminateContract(reason: 'lease_end')`.
   - **Cham dut do khong thanh toan**: Neu payment overdue qua `PAYMENT_OVERDUE_TERMINATE_DAYS` ngay (mac dinh 10 ngay) → goi `autoTerminateContract(reason: 'non_payment')`.

4. **handleHoldingDepositExpiration** (cron: `HOLDING_DEPOSIT_EXPIRE_CRON`, mac dinh moi 30 giay):
   - Quet rental request co trang thai `holding_deposit_open` da het han.
   - Chuyen trang thai sang `holding_deposit_expired`.
   - Gui thong bao `rental.request.holding_deposit_expired` cho owner.

### 11.7 Auth bo sung (estate-service)
Tai lieu goc thieu cac endpoint sau:
- `POST /auth/validate-token` (Public): Validate JWT token (dung cho inter-service communication).
- `POST /auth/phone/request-otp` (Public): Gui OTP dang ky qua SDT.
- `POST /auth/phone/signup` (Public): Dang ky bang SDT + OTP + password.
- `POST /auth/phone-update/signup` (Public): Dang ky voi cap nhat SDT.
- `POST /auth/otp/verify-phone`: Xac thuc OTP cap nhat SDT (can dang nhap).
- `POST /auth/email/request-otp`: Gui OTP xac thuc email (can dang nhap).
- `POST /auth/email/verify`: Xac thuc email bang OTP.
- `PUT /auth/change-password`: Doi mat khau (can mat khau cu).
- `POST /auth/forgot-password/request-otp` (Public): Gui OTP quen mat khau qua SDT.
- `POST /auth/forgot-password/reset` (Public): Dat lai mat khau bang OTP.
- `POST /auth/google/exchange` (Public): Trao doi auth code Google thanh JWT.
- `POST /auth/facebook/exchange` (Public): Trao doi auth code Facebook thanh JWT.

### 11.8 Giao tiep noi bo contract-service → estate-service
`EstateClientService` trong contract-service goi truc tiep API cua estate-service qua HTTP:
- `GET /api/estate/user/:id`: Lay thong tin user.
- `GET /api/estate/properties/internal/:id`: Lay chi tiet property (dung x-internal-token de xac thuc).
- `POST /api/estate/properties/:id/contract-status`: Cap nhat trang thai property khi hop dong active/ended.
- `PUT /api/estate/properties/:id/visibility/internal`: Cap nhat hien thi property.

### 11.9 Chat WebSocket chi tiet (chat-service)
Namespace: `/chat` | Transport: websocket + polling

**Ket noi**: Client gui token qua `handshake.auth.token`, server validate qua HTTP call den estate-service. Sau do join room theo userId.

**Server → Client events**:
- `online_users_snapshot`: Danh sach user dang online (gui khi client ket noi).
- `user_online` / `user_offline`: Khi user ket noi/ngat ket noi.
- `new_conversation`: Cuoc tro chuyen moi duoc tao.
- `new_message`: Tin nhan moi.
- `message_read`: Tin nhan da doc (gui den ben kia).
- `message_reaction`: Reaction tren tin nhan.
- `user_typing`: Typing indicator (conversationId, userId, isTyping).

**Client → Server events**:
- `typing`: { conversationId, recipientId, isTyping }

**Call signaling (WebRTC)**:
- `call:invite` → tao CallSession, emit `call:incoming` cho callee va `call:outgoing` cho caller. Neu callee offline → `call:missed`.
- `call:accept` → emit `call:accepted` cho ca 2 ben.
- `call:reject` → emit `call:rejected`.
- `call:cancel` → emit `call:canceled`.
- `call:end` → emit `call:ended` (kem duration).
- `call:offer` → chuyen tiep SDP offer den ben kia.
- `call:answer` → chuyen tiep SDP answer den ben kia.
- `call:ice` → chuyen tiep ICE candidate den ben kia.
- `call:error` → thong bao loi (INVALID_PAYLOAD, INVITE_FAILED, ACCEPT_FAILED...).

### 11.10 Notification WebSocket chi tiet (notification-service)
Namespace: `/notification` | Transport: websocket + polling

**Ket noi**: Client gui token qua `handshake.auth.token`, server validate qua HTTP call. Client join room theo userId.

**Internal events** (EventEmitter, khong phai RabbitMQ):
- `notification.created` → emit `notification` event den client (userId).
- `notification.read` → emit `notification:read` den client (userId).

### 11.11 Estate DB - Cac entity thieu trong tai lieu
Cac model co trong Prisma schema nhung chua duoc liet ke day du:
- **Report** (estate-service): Bao cao vi pham (property/user/review/rental), co ReportCategory (fraud/scam/fake_listing/...), ReportStatus, ActionTaken. Khac voi Report trong contract-service (xu ly tranh chap hop dong).
- **MaintenanceRequest**: Yeu cau bao tri tai san (plumbing/electrical/appliance/...), co workflow trang thai submitted→acknowledged→scheduled→in_progress→completed. Co truong estimatedCost/actualCost/whoPays.
- **MaintenanceUpdate**: Lich su cap nhat MaintenanceRequest (status_change/assignment/note/completion/cost_update).
- **PropertyInspection**: Kiem tra tai san (move_in/move_out/periodic/maintenance/damage_assessment), co overallCondition, findings (JSON), damageCost, responsibleParty.
- **NotificationPreference**: Cai dat thong bao theo tung loai (email/push/sms) cho tung su kien (booking/payment/maintenance/message/review/marketing).
- **ActivityLog**: Ghi nhan hoat dong nguoi dung (activityType, description, metadata, ipAddress).
- **SystemSetting**: Cau hinh he thong (key/value/type, isPublic).
- **Favorite**: co truong notes de nguoi dung ghi chu.

### 11.12 Luong cham dut hop dong va tranh chap chi tiet
Tai lieu goc chi mo ta so luoc (muc 4.7 va 4.8). Chi tiet day du:

**Trang thai TerminationRequest**: pending → approved | rejected → negotiating | admin_review → admin_processing → resolved.

**Chinh sach tai chinh** khi cham dut (settleTermination):
| Ly do | Tien coc | Phi phat |
|-------|----------|----------|
| unilateral_termination (Tenant gui) | Tich thu cho Owner | Tenant tra |
| unilateral_termination (Owner gui) | Hoan cho Tenant | Owner tra |
| breach_of_contract | Tich thu cho ben khong vi pham | Ben vi pham tra |
| non_payment | Tich thu cho Owner | Tenant tra |
| mutual_agreement / lease_end / force_majeure | Hoan cho Tenant | Khong co |

**Quy trinh quyet toan**: Tim deposit, tinh cong no chua thanh toan, xu ly phi phat qua vi, xu ly tien coc (tich thu/hoan tra/bu cong no), cap nhat payment da tra bang tien coc.

**Admin giai quyet** (adminResolveWithFinancials):
- Ghi nhan TerminationDecision (depositReturnAmount, penaltyAmount, compensationAmount) phuc vu audit.
- Quyet dinh: `continue_contract` hoac `terminate_contract`.
- Neu terminate → settle tai chinh + cap nhat hop dong/property.
- Tu dong dong tat ca Reports lien ket.

**Lien ket Report ↔ Termination**: Khi user gui termination len admin (admin_review), he thong tu dong tao Report lien ket. Khi admin resolve 1 trong 2, he thong dong bo trang thai ca 2.

**Rang buoc**: Chi 1 termination active tai 1 thoi diem, khong tu duyet, khong chong cheo report va termination tren admin.

## 12. Gia dinh va gioi han
- Tai lieu uu tien backend + web-client + web-admin theo yeu cau, khong mo rong sau vao mobile-client.
- Mot so endpoint co ten hoac style khong dong nhat (vi du ky tu hoa role, 2 endpoint confirm payment), tai lieu da mo ta theo hien trang code.
- AI integration voi estate/contract trong `ai-service/app/integrations` co tinh chat fallback/candidate path; can xac nhan endpoint chuan khi deploy production.
- Cronjob interval mac dinh rat nhanh (15-30 giay) de phuc vu demo/test; can dieu chinh khi deploy production (vi du moi 1 gio hoac moi ngay).
- MaintenanceRequest va PropertyInspection co model day du trong Prisma schema nhung chua co controller/service tuong ung de expose API, chi la du lieu tham chieu.

---
Tai lieu nay phuc vu muc tieu phan tich nghiep vu va ve Use Case Diagram/Sequence Diagram tu he thong hien co. Neu can, co the tach tiep thanh:
1) Tai lieu Use Case chi tiet theo actor.
2) BPMN cho luong Rental Request -> Contract -> Payment.
3) ERD logic tong hop 4 database/service.

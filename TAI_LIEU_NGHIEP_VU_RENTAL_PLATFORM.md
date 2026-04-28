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

### 6.5 AI
- Predict price/train/analytics.
- AI chat.
- Vision mo ta va tao description.

## 7. Hanh vi frontend
### 7.1 Web-client (Next.js)
Man hinh/chuc nang chinh:
- Public:
  - Home, search, property detail, news list/detail, template-contracts, terms/privacy.
- Authenticated dashboard:
  - profile, favorites, posts, customers, bookings, rental-requests, contracts, payments, wallet, statistics.
- KYC flow, chat page, tao tin dang, dat lich xem nha.

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

## 11. Gia dinh va gioi han
- Tai lieu uu tien backend + web-client + web-admin theo yeu cau, khong mo rong sau vao mobile-client.
- Mot so endpoint co ten hoac style khong dong nhat (vi du ky tu hoa role, 2 endpoint confirm payment), tai lieu da mo ta theo hien trang code.
- AI integration voi estate/contract trong `ai-service/app/integrations` co tinh chat fallback/candidate path; can xac nhan endpoint chuan khi deploy production.

---
Tai lieu nay phuc vu muc tieu phan tich nghiep vu va ve Use Case Diagram/Sequence Diagram tu he thong hien co. Neu can, co the tach tiep thanh:
1) Tai lieu Use Case chi tiet theo actor.
2) BPMN cho luong Rental Request -> Contract -> Payment.
3) ERD logic tong hop 4 database/service.

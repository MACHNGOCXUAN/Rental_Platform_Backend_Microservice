# 🏠 Rental Platform Backend

## 🎯 Giới thiệu

**Rental Platform** là hệ thống quản lý cho thuê bất động sản với các tính năng:

- 🏘️ Quản lý bất động sản
- 👥 Quản lý người dùng (chủ nhà & người thuê)
- 💰 Thanh toán trực tuyến
- 📝 Hợp đồng điện tử
- 💬 Chat real-time
- 🔔 Thông báo đa kênh
- 🤖 AI hỗ trợ
- 🎫 Hệ thống support

---

## 🏗️ Kiến trúc hệ thống

### Sơ đồ tổng quan

## 🧩 Kiến trúc hệ thống (System Architecture)

| Service | Port | Mô tả chức năng | Database |
|------|------|-----------------|----------|
| **Kong API Gateway** | 8000 | API Gateway, Routing, Auth, Rate Limit | ❌ |
| **User Service** | 9001 | Người dùng, đăng nhập, phân quyền | PostgreSQL |
| **Property Service** | 9002 | Bất động sản, tìm kiếm, lọc | PostgreSQL |
| **Payment Service** | 9003 | Thanh toán, hóa đơn, giao dịch | PostgreSQL |
| **Contract Service** | 9005 | Quản lý hợp đồng, ký số | PostgreSQL |
| **Notification Service** | 9004 | Email, SMS, Push Notification | ❌ (Redis Queue) |
| **Chat Service** | 9006 | Chat realtime, message history | **MongoDB** |
| **Support Service** | 9007 | Ticket, FAQ, CSKH | PostgreSQL |
| **AI Service** | 9008 | Gợi ý, chatbot, AI analysis | ❌ (Redis / Vector Store) |

---

### Công nghệ sử dụng

- **Framework**: NestJS + TypeScript
- **Database**: PostgreSQL 14+ với Prisma ORM
- **Cache**: Redis 6+
- **API Gateway**: Kong
- **Communication**: gRPC (service-to-service), REST (client-to-server), WebSocket (real-time)
- **Container**: Docker + Docker Compose

---

## 🚀 Hướng dẫn cài đặt

### Phương án 1: Cài đặt tự động (Khuyến nghị)

```bash
# 1. Clone repository
git clone https://github.com/your-org/rental-platform-backend.git
cd rental-platform-backend

# 2. Chạy script cài đặt tự động (install + generate proto + migrate)

```bash
# Cấp quyền thực thi
chmod +x scripts/*.sh

# Chạy script
./install-all.sh
./generate-proto.sh
./migrate-all.sh
```

**Script sẽ tự động:**
- ✅ Cài đặt dependencies cho tất cả services
- ✅ Generate Protocol Buffer files
- ✅ Generate Prisma Client

### Phương án 2: Cài đặt thủ công

#### Bước 1: Cài đặt Dependencies

```bash
# Cài cho từng service
cd apps/user-service
npm install
cd ../..
```

#### Bước 2: Generate Protocol Buffers

```bash
# Generate proto files cho từng service
cd apps/user-service && npm run proto:generate
```

#### Bước 3: Setup Database với Prisma

**Generate Prisma Client và chạy migrations:**

```bash
# User Service
cd apps/user-service
npm run prisma:generate
npm run prisma:migrate
```

---

## 🐳 Chạy dự án

### Development Mode(Môi trường dev)

```bash
# Start tất cả services với Docker Compose
docker-compose -f docker-compose.dev.yml up -d --build

# Chạy script
./migrate-all.sh
```
- ✅ Chạy database migrations

# Xem logs
docker-compose logs -f

# Xem logs của một service cụ thể
docker-compose logs -f user-service
```

### Production Mode(Môi trường pro)

```bash
docker-compose up -d --build
```

### Dừng services

```bash
# Dừng tất cả
docker-compose down

# Dừng và xóa volumes (reset database)
docker-compose down -v
```
---
# Kiến Trúc AI Service – Dự Đoán Giá & Tạo Mô Tả Bất Động Sản

> **Cập nhật lần cuối:** 2026-05-18  
> **Mục đích:** Mô tả đầy đủ luồng code từ training → serving → gọi API, bao gồm toàn bộ features thực tế đang dùng.

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Stack Công Nghệ](#2-stack-công-nghệ)
3. [Cấu Trúc Thư Mục](#3-cấu-trúc-thư-mục)
4. [Module 1 – Dự Đoán Giá (Price Prediction)](#4-module-1--dự-đoán-giá-price-prediction)
5. [Module 2 – Tạo Mô Tả (Vision & Description Generation)](#5-module-2--tạo-mô-tả-vision--description-generation)
6. [API Endpoints Đầy Đủ](#6-api-endpoints-đầy-đủ)
7. [Luồng Gọi API từ web-admin](#7-luồng-gọi-api-từ-web-admin)
8. [Hướng Dẫn Mở Rộng](#8-hướng-dẫn-mở-rộng)

---

## 1. Tổng Quan Kiến Trúc

```
┌──────────────────────────────────────────────────────────────┐
│                      web-admin (React)                       │
│  AiAnalyticsPage – dự đoán giá, train, analytics            │
│  PostForm / EditPost – tạo mô tả tự động khi đăng tin       │
└────────────────────┬─────────────────────────────────────────┘
                     │ HTTP qua API Gateway (port 8000)
                     ▼
┌──────────────────────────────────────────────────────────────┐
│                   AI Service (FastAPI)  :50055               │
│                                                              │
│  POST /api/v1/predict-price   ← dự đoán giá 1 BĐS           │
│  POST /api/v1/train           ← train lại model từ DB        │
│  GET  /api/v1/price-analytics ← thống kê theo loại BĐS      │
│  POST /api/v1/vision/describe          ← phân tích ảnh upload│
│  POST /api/v1/vision/generate-description ← tạo mô tả       │
│  POST /api/v1/chat            ← chatbot BĐS                  │
│                                                              │
│  services/price_service.py   ← ML business logic            │
│  services/vision_service.py  ← Generative AI logic          │
│  training/model.pkl          ← trained model                 │
│  training/dataset.csv        ← cached dataset               │
└───────────┬────────────────────────────────────────────────--┘
            │ HTTP nội bộ Docker
            ▼
┌──────────────────────────────────────────────────────────────┐
│              estate-service (NestJS)  :9001                  │
│  GET /properties/search?limit=50&cursor=...                  │
│  → Cung cấp raw data để train model                          │
│  → Cung cấp description mẫu để làm reference prompt         │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Công Nghệ

| Thành phần | Công nghệ |
|---|---|
| Web Framework | FastAPI 0.115.8 |
| Runtime | Python 3.11, Uvicorn |
| ML Library | scikit-learn 1.6.1 |
| ML Algorithm | `RandomForestRegressor(n_estimators=200)` |
| Data Processing | pandas 2.2.3 |
| Model Storage | pickle (file `.pkl`) |
| Generative AI | OpenAI GPT-4o (primary) + Google Gemini Pro (fallback) |
| Vision AI | GPT-4o Vision + Gemini Pro Vision |
| Accuracy metric | MAPE + Cross-Validation |

---

## 3. Cấu Trúc Thư Mục

```
apps/ai-service/
├── app/
│   ├── main.py
│   ├── api/v1/
│   │   ├── prediction.py   ← endpoints: predict, train, analytics
│   │   ├── vision.py       ← endpoints: describe, generate-description
│   │   └── chat.py         ← endpoint: chat
│   ├── services/
│   │   ├── price_service.py   ← RandomForest ML logic
│   │   └── vision_service.py  ← OpenAI/Gemini logic
│   ├── schemas/
│   │   ├── price_schema.py    ← PricePredictionRequest (27 fields)
│   │   └── vision_schema.py   ← GenerateDescriptionRequest
│   ├── constants/
│   │   └── prompts.py         ← GENERATE_DESCRIPTION_PROMPT, VISION_PROMPT
│   └── core/config.py
└── training/
    ├── train_price_model.py   ← Script train offline
    ├── model.pkl              ← Auto-generated
    └── dataset.csv            ← Auto-generated
```

---

## 4. Module 1 – Dự Đoán Giá (Price Prediction)

### 4.1 Input Features – 27 Trường (Thực tế trong code)

Tất cả được định nghĩa trong `app/schemas/price_schema.py` class `PricePredictionRequest`.

#### Nhóm Core (Bắt buộc / rất quan trọng)

| Field | Kiểu | Áp dụng | Mô tả |
|---|---|---|---|
| `area` | `float > 0` | **ALL** | Diện tích sử dụng (m²) |
| `location` | `string` | **ALL** | Quận/Huyện – MD5 hash → location_code |
| `propertyType` | enum | **ALL** | `apartment` / `house` / `land` / `office` / `room` |
| `rooms` | `int >= 0` | RESIDENTIAL | Số phòng ngủ (0 nếu đất/VP) |
| `bathrooms` | `int >= 0` | apartment, house, room | Số phòng tắm |
| `floors` | `int >= 0` | apartment, house | Số tầng / tầng mấy |
| `totalFloors` | `int` optional | apartment | Tổng số tầng tòa nhà |

#### Nhóm Vật lý & Pháp lý

| Field | Kiểu | Mô tả | Encoding |
|---|---|---|---|
| `direction` | enum optional | Hướng nhà (east/west/south/north/...) | DIRECTION_MAP → 0-8 |
| `streetFacing` | `bool` optional | Mặt tiền đường lớn hay hẻm | bool → 0/1 |
| `furnitureStatus` | enum | `none` / `basic` / `full` | FURNITURE_MAP → 0/1/2 |
| `legalStatus` | enum optional | `redBook`/`pinkBook`/`waitingForBook`/`noBook` | LEGAL_MAP → 0-3 |

#### Nhóm Proximity (Vị trí lân cận)

| Field | Kiểu | Áp dụng | Mô tả |
|---|---|---|---|
| `nearCityCenter` | `bool` | ALL | Gần trung tâm thành phố |
| `nearShoppingMall` | `bool` | ALL | Gần trung tâm thương mại |
| `nearMarket` | `bool` | ALL | Gần chợ/siêu thị |
| `nearSchool` | `bool` | ALL | Gần trường học |
| `nearHospital` | `bool` | ALL | Gần bệnh viện |
| `nearPark` | `bool` | apartment, house | Gần công viên |
| `nearBusStation` | `bool` | ALL | Gần bến xe/trạm bus |
| `nearIndustrialZone` | `bool` | land, room | Gần khu công nghiệp |

#### Nhóm Amenities (Tiện ích nội khu)

| Field | Kiểu | Áp dụng | Mô tả |
|---|---|---|---|
| `hasElevator` | `bool` | apartment, office | Có thang máy |
| `hasParking` | `bool` | ALL | Có chỗ đậu xe |
| `hasGenerator` | `bool` | office | Có máy phát điện |
| `hasPool` | `bool` | apartment, house | Có hồ bơi |
| `hasGym` | `bool` | apartment, office | Có phòng gym |
| `hasSecurity` | `bool` | ALL | Có bảo vệ 24/7 |

#### Nhóm Đặc thù Đất

| Field | Kiểu | Áp dụng | Mô tả |
|---|---|---|---|
| `landFrontage` | `float` optional | **land** | Chiều ngang mặt tiền (m) |
| `landDepth` | `float` optional | **land** | Chiều sâu lô đất (m) |
| `landShape` | `string` optional | **land** | `square`/`rectangle`/`irregular` |

#### Nhóm Thời Gian

| Field | Kiểu | Mô tả |
|---|---|---|
| `postMonth` | `int 1-12` optional | Tháng đăng tin – yếu tố mùa vụ |
| `postYear` | `int` optional | Năm đăng tin |

> **Lưu ý:** Tổng cộng **27 features** được đưa vào `FEATURE_COLS` trong `price_service.py`.  
> Input đầu vào **khác nhau theo loại BĐS** – ví dụ đất cần `landFrontage`/`landDepth`, văn phòng cần `hasGenerator`/`hasElevator`, phòng trọ thì proximity quan trọng hơn tiện ích cao cấp.

### 4.2 Feature Columns (thứ tự cố định trong FEATURE_COLS)

```python
FEATURE_COLS = [
    # Core
    "area", "rooms", "bathrooms", "floors",
    "location_code", "property_type",
    # Vật lý
    "furniture", "direction_code", "street_facing", "legal_code",
    # Proximity
    "near_city_center", "near_shopping_mall", "near_market",
    "near_school", "near_hospital", "near_park",
    "near_bus_station", "near_industrial_zone",
    # Amenities
    "has_elevator", "has_parking", "has_generator",
    "has_pool", "has_gym", "has_security",
    # Đặc thù đất
    "land_frontage", "land_depth",
    # Thời gian
    "post_month",
]  # Tổng: 27 features
```

> ⚠️ **Thứ tự này PHẢI khớp giữa `price_service.py` và `train_price_model.py`.**

### 4.3 Encoding Map

```python
PROPERTY_TYPE_MAP = {"apartment":0, "house":1, "land":2, "office":3, "room":4}
FURNITURE_MAP     = {"none":0, "basic":1, "full":2}
DIRECTION_MAP     = {"":0, "east":1, "west":2, "south":3, "north":4,
                     "northeast":5, "northwest":6, "southeast":7, "southwest":8}
LEGAL_MAP         = {"noBook":0, "waitingForBook":1, "pinkBook":2, "redBook":3, "":0}
# location_code   = MD5(district.strip().lower()) % 1000  → [0, 999]
```

### 4.4 Luồng Training

```
Admin bấm "Train Model" (web-admin)
        │
        ▼
POST /api/v1/train
        │
        ▼
price_service.train_from_db()
        │
        ├─► _fetch_properties_from_db()
        │       └── GET estate-service/properties/search (cursor pagination, max 2500)
        │
        ├─► _property_to_row(p) cho từng record
        │       ├── Parse bedrooms, bathrooms, floor, furnitureStatus
        │       ├── Parse amenities list → has_pool, has_gym, has_security,...
        │       ├── Parse createdAt → post_month
        │       └── Encode: location_code, property_type, furniture, direction, legal
        │
        ├─► pd.DataFrame(rows) → save dataset.csv
        │
        ├─► RandomForestRegressor(n_estimators=200).fit(X[FEATURE_COLS], y)
        │
        ├─► Cross-validation MAPE → accuracy %
        │
        └─► pickle.dump(model) → training/model.pkl
```

### 4.5 Luồng Dự Đoán (Inference)

```
POST /api/v1/predict-price
{
  "area": 55, "rooms": 2, "bathrooms": 2, "floors": 10,
  "location": "Quận 7", "propertyType": "apartment",
  "furnitureStatus": "full", "direction": "east",
  "nearCityCenter": true, "nearShoppingMall": true,
  "hasElevator": true, "hasParking": true,
  "hasPool": true, "hasGym": true, "hasSecurity": true,
  "postMonth": 5
}
        │
        ▼
PriceService.predict(payload)
        │
        ├─► _payload_to_feature_row(payload)
        │       → dict với đúng 27 keys theo thứ tự FEATURE_COLS
        │
        ├─► pd.DataFrame([row])[FEATURE_COLS]
        │
        ├─► model.predict(input_df) → [12_000_000]
        │
        └─► {"predictedPrice": 12000000.0}
```

---

## 5. Module 2 – Tạo Mô Tả (Vision & Description Generation)

### 5.1 Input Schema `GenerateDescriptionRequest`

Định nghĩa trong `app/schemas/vision_schema.py`:

| Field | Kiểu | Default | Mô tả |
|---|---|---|---|
| `title` | `string` | `""` | Tiêu đề bài đăng |
| `propertyType` | `string` | `"apartment"` | Loại BĐS |
| `areaSqm` | `float` | `0` | Diện tích m² |
| `bedrooms` | `int` | `0` | Số phòng ngủ |
| `bathrooms` | `int` | `0` | Số phòng tắm |
| `address` | `string` | `""` | Địa chỉ cụ thể |
| `district` | `string` | `""` | Quận/Huyện |
| `city` | `string` | `""` | Thành phố |
| `pricePerMonth` | `float` | `0` | Giá thuê/tháng |
| `depositAmount` | `float` | `0` | Tiền cọc |
| `furnitureStatus` | `string` | `"basic"` | Tình trạng nội thất |
| `amenities` | `list[str]` | `[]` | Danh sách tiện ích |
| `tone` | enum | `"professional"` | `professional`/`friendly`/`luxury`/`simple` |
| `length` | enum | `"medium"` | `short`(80-120 từ)/`medium`(150-250)/`long`(300-450) |
| `includeEmoji` | `bool` | `False` | Cho phép emoji |
| `imageUrls` | `list[str]` max 3 | `[]` | **URL ảnh thực tế từ khi đăng tin** |

### 5.2 Luồng Tạo Mô Tả – Đọc Ảnh Thực Tế

**Đây là điểm quan trọng:** Khi user đăng tin và đã upload ảnh, frontend truyền URLs của ảnh đó vào `imageUrls`. AI sẽ thực sự **download và phân tích từng ảnh** trước khi viết mô tả.

```
POST /api/v1/vision/generate-description
{
  "propertyType": "apartment",
  "areaSqm": 55,
  "bedrooms": 2, "bathrooms": 2,
  "address": "123 Nguyễn Văn Linh",
  "district": "Quận 7", "city": "TP.HCM",
  "pricePerMonth": 12000000,
  "furnitureStatus": "full",
  "amenities": ["Hồ bơi", "Gym", "Bảo vệ 24/7"],
  "tone": "luxury", "length": "long",
  "imageUrls": [
    "https://cloudinary.com/.../img1.jpg",
    "https://cloudinary.com/.../img2.jpg"
  ]
}
        │
        ▼
VisionService.generate_description(req)
        │
        ├─► [1] _describe_images_from_urls(req.imageUrls)
        │       ├── requests.get(url) → download ảnh (timeout 8s)
        │       ├── to_base64(bytes) → base64 string
        │       ├── openai_provider.describe_image(
        │       │     model=gpt-4o,
        │       │     prompt="Mô tả ngắn gọn hình ảnh BĐS này bằng Tiếng Việt (2-3 câu):"
        │       │     image_base64=..., mime_type=...
        │       │   )
        │       │   [fallback] gemini_provider.describe_image(...)
        │       └── → image_desc = "Phòng khách rộng rãi, nội thất hiện đại..."
        │
        ├─► [2] _fetch_reference_descriptions(req.propertyType)
        │       └── estate_client.search_properties({propertyType: "apartment"})
        │           → Lấy 2 description mẫu từ DB (≤300 ký tự mỗi cái)
        │
        ├─► [3] Build prompt (GENERATE_DESCRIPTION_PROMPT)
        │       Inject: loại BĐS, tiêu đề, diện tích, phòng, địa chỉ,
        │               giá, nội thất, tiện ích,
        │               MÔ TẢ ẢNH: {image_desc},   ← ảnh thực tế từ bài đăng
        │               MẪU THAM KHẢO TỪ DATABASE: {reference},
        │               tone, length, emoji_instruction
        │
        ├─► [4] openai_provider.chat(gpt-4o, prompt)
        │       [fallback] gemini_provider.chat(gemini-pro, prompt)
        │       [fallback] _fallback_description(req) → mô tả template đơn giản
        │
        └─► {"description": "...", "provider": "openai"}
```

### 5.3 Endpoint Phân Tích Ảnh Upload

Ngoài `generate-description`, còn có endpoint riêng để phân tích ảnh upload trực tiếp:

```
POST /api/v1/vision/describe
Content-Type: multipart/form-data
file: <image_file>
        │
        ▼
VisionService.describe_image(file: UploadFile)
        ├── read bytes → base64
        ├── openai.describe_image(VISION_PROMPT) → mô tả chuyên nghiệp
        │   [fallback] gemini.describe_image(...)
        └── {"description": "...", "provider": "openai"}
```

---

## 6. API Endpoints Đầy Đủ

### 6.1 `POST /api/v1/predict-price`

**Request Body** (27 fields, xem mục 4.1):

```json
{
  "area": 55.0,
  "rooms": 2,
  "bathrooms": 2,
  "floors": 10,
  "location": "Quận 7",
  "propertyType": "apartment",
  "furnitureStatus": "full",
  "direction": "east",
  "streetFacing": false,
  "legalStatus": "redBook",
  "nearCityCenter": true,
  "nearShoppingMall": true,
  "nearMarket": false,
  "nearSchool": true,
  "nearHospital": false,
  "nearPark": true,
  "nearBusStation": true,
  "nearIndustrialZone": false,
  "hasElevator": true,
  "hasParking": true,
  "hasGenerator": false,
  "hasPool": true,
  "hasGym": true,
  "hasSecurity": true,
  "postMonth": 5
}
```

**Response:**
```json
{ "predictedPrice": 12500000.0 }
```

### 6.2 `POST /api/v1/train`

**Request:** Không có body.

**Response:**
```json
{
  "message": "Model trained successfully with 312 samples",
  "sampleCount": 312,
  "accuracy": 84.5
}
```

### 6.3 `GET /api/v1/price-analytics`

**Response:**
```json
{
  "predictions": [
    {
      "propertyType": "Căn hộ",
      "avgPrice": 12000000,
      "minPrice": 5000000,
      "maxPrice": 35000000,
      "predictedAvg": 11500000,
      "sampleCount": 120
    }
  ],
  "modelAccuracy": 84.5,
  "totalSamples": 312,
  "lastTrainedAt": "2026-05-18T10:30:00"
}
```

### 6.4 `POST /api/v1/vision/generate-description`

Xem schema `GenerateDescriptionRequest` ở mục 5.1.

### 6.5 `POST /api/v1/vision/describe`

`multipart/form-data` với field `file` là file ảnh. Phân tích ảnh upload.

---

## 7. Luồng Gọi API từ web-admin

### 7.1 Base URL

```typescript
const AI_BASE = `${envConfig.API_ENDPOINT}/api/ai/api/v1`;
// → http://localhost:8000/api/ai/api/v1  (qua API Gateway → ai-service:50055)
```

### 7.2 Luồng Dự Đoán

```
Admin điền form (area, rooms, location, propertyType, + extended fields)
→ handlePredict()
→ POST ${AI_BASE}/predict-price  { body: JSON.stringify(predictForm) }
→ setPredictResult({ predictedPrice: 12500000 })
→ Hiển thị "12.500.000 ₫"
```

### 7.3 Luồng Tạo Mô Tả (khi đăng tin trên web-client)

```
User đăng tin → upload ảnh → ảnh lưu lên Cloudinary → nhận URL
→ Bấm "Tạo mô tả tự động"
→ POST ${AI_BASE}/vision/generate-description
    {
      imageUrls: ["https://cloudinary.com/.../img1.jpg"],
      propertyType, areaSqm, bedrooms, bathrooms,
      address, district, city,
      pricePerMonth, furnitureStatus, amenities,
      tone: "professional", length: "medium"
    }
→ AI download ảnh → phân tích → viết mô tả dựa trên ảnh thực tế
→ Điền vào textarea description
```

---

## 8. Hướng Dẫn Mở Rộng

### 8.1 Thêm Feature Mới vào Price Model

Cần sửa **4 file** theo thứ tự:

| Bước | File | Việc cần làm |
|---|---|---|
| 1 | `app/schemas/price_schema.py` | Thêm field vào `PricePredictionRequest` |
| 2 | `app/services/price_service.py` | Thêm encoding map + thêm key vào `FEATURE_COLS` + `_payload_to_feature_row()` + `_property_to_row()` |
| 3 | `training/train_price_model.py` | Thêm cột vào `_build_sample_dataset()` + `FEATURE_COLS` |
| 4 | **Xóa model.pkl** | `rm training/model.pkl training/dataset.csv` rồi train lại |

> ⚠️ **Bắt buộc:** Sau khi thay đổi số features, model cũ sẽ crash. Phải xóa `model.pkl` và train lại.

### 8.2 Input Đặc Thù Theo Loại BĐS

Khi build form frontend, chỉ hiển thị các field phù hợp:

| Loại BĐS | Fields đặc thù cần nhập |
|---|---|
| **apartment** | `floors`, `totalFloors`, `hasElevator`, `hasPool`, `hasGym`, `nearPark` |
| **house** | `floors`, `streetFacing`, `landFrontage`, `landDepth`, `direction` |
| **room** | `nearMarket`, `nearBusStation`, `nearIndustrialZone` |
| **office** | `hasElevator`, `hasGenerator`, `hasSecurity`, `nearCityCenter` |
| **land** | `landFrontage`, `landDepth`, `landShape`, `legalStatus`, `streetFacing` |

### 8.3 Thêm Loại BĐS Mới

```python
# 1. price_service.py + price_schema.py
PropertyType = Literal["apartment", "house", "land", "office", "room", "villa"]  # thêm "villa"
PROPERTY_TYPE_MAP = {..., "villa": 5}

# 2. Thêm sample data trong train_price_model.py
# 3. Xóa model.pkl → train lại
```

### 8.4 Cải Thiện Generate Description

Để thêm trường mới vào prompt mô tả:
1. Thêm field vào `GenerateDescriptionRequest` (`vision_schema.py`)
2. Thêm placeholder `{new_field}` vào `GENERATE_DESCRIPTION_PROMPT` (`constants/prompts.py`)
3. Truyền giá trị vào `GENERATE_DESCRIPTION_PROMPT.format(...)` trong `vision_service.py`

---

## Tóm Tắt Nhanh

| Thành phần | Chi tiết |
|---|---|
| **Price Model** | `RandomForestRegressor(n_estimators=200)` |
| **Features** | 27 features: core + proximity + amenities + đất + thời gian |
| **Target** | `pricePerMonth` (VNĐ/tháng) |
| **Accuracy** | MAPE → `accuracy = (1 - MAPE) * 100%` |
| **Model file** | `training/model.pkl` |
| **Dataset** | `training/dataset.csv` |
| **Generate Description** | OpenAI GPT-4o → Gemini fallback → template fallback |
| **Image reading** | Download ảnh từ URL → base64 → GPT-4o Vision → inject vào prompt |
| **Train trigger** | `POST /api/v1/train` hoặc `python training/train_price_model.py` |

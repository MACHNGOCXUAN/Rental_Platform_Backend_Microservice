# Kiến Trúc AI Service – Mô Hình Dự Đoán Giá Thuê Bất Động Sản

> **Mục đích tài liệu:** Mô tả đầy đủ, chi tiết luồng code từ training → serving → gọi API từ web-admin, để làm cơ sở mở rộng thêm input trong tương lai.

---

## Mục Lục

1. [Tổng Quan Kiến Trúc](#1-tổng-quan-kiến-trúc)
2. [Stack Công Nghệ](#2-stack-công-nghệ)
3. [Cấu Trúc Thư Mục](#3-cấu-trúc-thư-mục)
4. [Luồng Training Model](#4-luồng-training-model)
5. [Input Features – Chi Tiết Từng Field](#5-input-features--chi-tiết-từng-field)
6. [Thuật Toán Dự Đoán](#6-thuật-toán-dự-đoán)
7. [Luồng Dự Đoán (Inference)](#7-luồng-dự-đoán-inference)
8. [API Endpoints](#8-api-endpoints)
9. [Luồng Gọi API: web-admin → AI Service](#9-luồng-gọi-api-web-admin--ai-service)
10. [Phân Tích Theo Khu Vực và Loại BĐS](#10-phân-tích-theo-khu-vực-và-loại-bđs)
11. [Điểm Mở Rộng – Hướng Dẫn Thêm Input Mới](#11-điểm-mở-rộng--hướng-dẫn-thêm-input-mới)

---

## 1. Tổng Quan Kiến Trúc

```
┌────────────────────────────────────────────────────────────────┐
│                        web-admin (React)                       │
│   AiAnalyticsPage.tsx                                          │
│   - Nút "Train Model từ DB"  → POST /api/ai/api/v1/train       │
│   - Form dự đoán thủ công   → POST /api/ai/api/v1/predict-price│
│   - Hiển thị analytics      → GET  /api/ai/api/v1/price-analytics│
└────────────────────┬───────────────────────────────────────────┘
                     │  HTTP qua API Gateway (port 8000)
                     ▼
┌────────────────────────────────────────────────────────────────┐
│                      AI Service (FastAPI)                      │
│   Port: 50055                                                  │
│   app/api/v1/prediction.py                                     │
│   app/services/price_service.py  ← business logic             │
│   training/model.pkl             ← trained model (file)        │
│   training/dataset.csv           ← cached dataset             │
└────────────────────┬───────────────────────────────────────────┘
                     │  HTTP nội bộ Docker
                     ▼
┌────────────────────────────────────────────────────────────────┐
│                     estate-service (NestJS)                    │
│   Port: 9001                                                   │
│   GET /properties/search?limit=50&cursor=...                   │
│   → Cung cấp raw data để train model                           │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Công Nghệ

| Thành phần | Công nghệ |
|---|---|
| Web Framework | FastAPI 0.115.8 |
| Runtime | Python 3.11, Uvicorn |
| ML Library | scikit-learn 1.6.1 |
| ML Algorithm | `RandomForestRegressor` |
| Data Processing | pandas 2.2.3 |
| Model Storage | pickle (file `.pkl`) |
| Số lượng estimators | 200 cây quyết định |
| Đánh giá độ chính xác | MAPE (Mean Absolute Percentage Error) + Cross-Validation |

---

## 3. Cấu Trúc Thư Mục

```
apps/ai-service/
├── app/
│   ├── main.py                    ← FastAPI app, đăng ký router
│   ├── core/
│   │   └── config.py              ← Settings từ .env
│   ├── api/
│   │   └── v1/
│   │       └── prediction.py      ← 3 endpoints: predict, train, analytics
│   ├── services/
│   │   └── price_service.py       ← Toàn bộ business logic ML
│   ├── schemas/
│   │   └── price_schema.py        ← Pydantic models: Request/Response
│   └── models/
│       └── model_loader.py        ← Load model từ file .pkl
├── training/
│   ├── train_price_model.py       ← Script train offline (chạy tay)
│   ├── model.pkl                  ← File model đã train (auto-generated)
│   └── dataset.csv                ← Dataset cache từ DB (auto-generated)
└── requirements.txt
```

---

## 4. Luồng Training Model

### 4.1 Hai cách train

```
Cách 1 – Train offline (script thủ công):
  $ python training/train_price_model.py
  → Đọc training/dataset.csv (nếu tồn tại) hoặc dùng 10 sample hardcode
  → Train RandomForestRegressor
  → Lưu model vào training/model.pkl

Cách 2 – Train từ DB qua API (được dùng trong web-admin):
  POST /api/v1/train
  → Gọi estate-service lấy toàn bộ bất động sản (phân trang cursor)
  → Lọc, làm sạch dữ liệu
  → Train RandomForestRegressor với cross-validation
  → Lưu dataset.csv + model.pkl
  → Trả về { sampleCount, accuracy }
```

### 4.2 Luồng train từ DB (chi tiết)

```
POST /api/v1/train
        │
        ▼
PriceService.train_from_db()
        │
        ├─► _fetch_properties_from_db()
        │       └── Gọi GET estate-service/properties/search?limit=50
        │           └── Phân trang bằng cursor (tối đa 50 trang = 2500 BĐS)
        │           └── Collect tất cả items
        │
        ├─► Lọc và làm sạch dữ liệu:
        │       ├── Bỏ record thiếu: pricePerMonth hoặc areaSqm
        │       ├── Bỏ giá trị ≤ 0
        │       └── Encode: district → location_code (MD5 hash % 1000)
        │                   propertyType → số nguyên 0-4
        │
        ├─► Kiểm tra: tối thiểu 5 mẫu, nếu ít hơn → raise RuntimeError
        │
        ├─► Lưu dataset.csv vào training/
        │
        ├─► Cross-Validation (k = min(5, n_samples)):
        │       └── cross_val_predict → tính MAPE → accuracy = (1 - MAPE) * 100
        │
        ├─► Fit final model:
        │       └── RandomForestRegressor(n_estimators=200, random_state=42).fit(X, y)
        │
        └─► Lưu model.pkl → reload vào memory
```

### 4.3 Cấu trúc dữ liệu từ estate-service

Trường lấy từ `GET /properties/search`:

| Trường raw (estate-service) | Mô tả |
|---|---|
| `pricePerMonth` | Giá thuê (float, VNĐ/tháng) → **target y** |
| `areaSqm` | Diện tích m² → feature `area` |
| `bedrooms` | Số phòng ngủ → feature `rooms` |
| `district` | Quận/huyện → encode thành `location_code` |
| `propertyType` | Loại BĐS (`apartment`, `house`, ...) → encode thành số |

---

## 5. Input Features – Chi Tiết Từng Field

### 5.1 Features hiện tại (4 features)

| Tên feature (trong model) | Kiểu | Nguồn | Cách xử lý | Giá trị ví dụ |
|---|---|---|---|---|
| `area` | `float` | `areaSqm` từ DB hoặc form | Dùng trực tiếp (m²) | `50.0` |
| `rooms` | `int` | `bedrooms` từ DB hoặc form | Dùng trực tiếp | `2` |
| `location_code` | `int` | `district` từ DB hoặc form | MD5 hash của chuỗi (lowercase, UTF-8) % 1000 | `101` |
| `property_type` | `int` | `propertyType` từ DB hoặc form | Label encoding cố định | xem bảng dưới |

### 5.2 Encoding `propertyType`

```python
PROPERTY_TYPE_MAP = {
    "apartment": 0,   # Căn hộ
    "house":     1,   # Nhà nguyên căn
    "land":      2,   # Đất
    "office":    3,   # Văn phòng
    "room":      4,   # Phòng trọ
}
```

### 5.3 Encoding `location` → `location_code`

```python
def _encode_location(location: str) -> int:
    normalized = location.strip().lower().encode("utf-8")
    return int(hashlib.md5(normalized).hexdigest(), 16) % 1000
```

- Input: chuỗi tên quận/huyện (ví dụ `"Quận 7"`, `"Cầu Giấy"`)
- Output: số nguyên trong khoảng `[0, 999]`
- **Lưu ý:** Cùng tên địa điểm → cùng code. Khác viết hoa/thường → khác code.
  - `"Quận 7"` và `"quận 7"` cho ra **cùng code** (do `.lower()`)
  - `"Quận 7"` và `"District 7"` cho ra **khác code**

### 5.4 Target (y)

| Field | Kiểu | Mô tả |
|---|---|---|
| `rental_price` | `float` | Giá thuê VNĐ/tháng (`pricePerMonth`) |

---

## 6. Thuật Toán Dự Đoán

### 6.1 Mô hình: Random Forest Regressor

```python
RandomForestRegressor(n_estimators=200, random_state=42)
```

**Cách hoạt động:**
- Xây dựng 200 cây quyết định độc lập (Decision Trees)
- Mỗi cây được train trên một subset ngẫu nhiên của dữ liệu (bootstrap sampling)
- Mỗi node trong cây chỉ xem xét một subset ngẫu nhiên của features
- Kết quả dự đoán = **trung bình** của 200 cây

**Ưu điểm với bài toán này:**
- Không cần normalize/scale features
- Xử lý tốt dữ liệu phi tuyến (ví dụ: diện tích tăng không kéo giá tăng tuyến tính)
- Chịu được outliers (giá quá cao/thấp bất thường)
- Dữ liệu ít (< 1000 mẫu) vẫn hoạt động ổn

### 6.2 Đánh giá độ chính xác (MAPE-based)

```python
# Cross-validation với k-fold (k = min(5, n_samples))
y_pred_cv = cross_val_predict(model_cv, X, y, cv=n_splits)
mape = (abs(y - y_pred_cv) / y.clip(lower=1)).mean()
accuracy = max(0, (1 - mape)) * 100
```

- **MAPE** = Mean Absolute Percentage Error
- **Accuracy** = `(1 - MAPE) * 100%`
- Ví dụ: MAPE = 0.15 → Accuracy = 85%

### 6.3 Feature Importance (cơ chế ẩn của Random Forest)

Model nội tại tự đánh giá tầm quan trọng của từng feature dựa trên mức độ giảm impurity (variance) khi split. Thứ tự tầm quan trọng ước đoán với dữ liệu thực tế:

1. `area` – Diện tích (ảnh hưởng lớn nhất)
2. `property_type` – Loại BĐS (phòng trọ vs căn hộ chênh lệch rất lớn)
3. `location_code` – Khu vực (ảnh hưởng theo vùng)
4. `rooms` – Số phòng (ảnh hưởng thấp hơn do tương quan cao với area)

---

## 7. Luồng Dự Đoán (Inference)

```
Client gửi POST /api/v1/predict-price
{
  "area": 50,
  "rooms": 2,
  "location": "Quận 7",
  "propertyType": "apartment"
}
        │
        ▼
prediction.py → predict_rental_price(payload)
        │
        ▼
PriceService.predict(payload)
        │
        ├─► Kiểm tra model đã load chưa (nếu chưa → load từ training/model.pkl)
        │
        ├─► Encode:
        │       property_type_code = PROPERTY_TYPE_MAP["apartment"] = 0
        │       location_code = MD5("quận 7") % 1000 = (ví dụ) 743
        │
        ├─► Tạo DataFrame:
        │       pd.DataFrame([{
        │           "area": 50,
        │           "rooms": 2,
        │           "location_code": 743,
        │           "property_type": 0
        │       }])
        │
        ├─► model.predict(input_df) → [8_500_000]
        │
        └─► Trả về: { "predictedPrice": 8500000.0 }
```

---

## 8. API Endpoints

### 8.1 `POST /api/v1/predict-price` – Dự đoán giá 1 BĐS

**Request Body:**
```json
{
  "area": 50.0,
  "rooms": 2,
  "location": "Quận 7",
  "propertyType": "apartment"
}
```

| Field | Kiểu | Bắt buộc | Ràng buộc | Mô tả |
|---|---|---|---|---|
| `area` | `float` | ✅ | `> 0` | Diện tích m² |
| `rooms` | `int` | ✅ | `>= 0` | Số phòng ngủ |
| `location` | `string` | ✅ | `min_length=1` | Tên quận/huyện/khu vực |
| `propertyType` | `string` | ✅ | enum | `apartment` \| `house` \| `land` \| `office` \| `room` |

**Response:**
```json
{
  "predictedPrice": 8500000.0
}
```

---

### 8.2 `POST /api/v1/train` – Train lại model từ DB

**Request:** Không có body.

**Response:**
```json
{
  "message": "Model trained successfully with 312 samples",
  "sampleCount": 312,
  "accuracy": 82.5
}
```

| Field | Mô tả |
|---|---|
| `message` | Thông báo kết quả |
| `sampleCount` | Số mẫu dùng để train |
| `accuracy` | Độ chính xác (%) theo MAPE |

---

### 8.3 `GET /api/v1/price-analytics` – Thống kê giá theo loại BĐS

**Response:**
```json
{
  "predictions": [
    {
      "propertyType": "Căn hộ",
      "avgPrice": 9000000,
      "minPrice": 4000000,
      "maxPrice": 25000000,
      "predictedAvg": 8750000,
      "sampleCount": 120
    },
    ...
  ],
  "modelAccuracy": 82.5,
  "totalSamples": 312,
  "lastTrainedAt": "2026-04-21T10:30:00"
}
```

**Cách tính `predictedAvg` trong analytics:**
- Lấy tất cả mẫu của loại BĐS đó trong `dataset.csv`
- Tính `avg_area`, `avg_rooms`, `mode(location_code)` của loại đó
- Gọi `model.predict()` với các giá trị trung bình → ra `predictedAvg`

---

## 9. Luồng Gọi API: web-admin → AI Service

### 9.1 Cấu hình Base URL

```typescript
// web-admin/src/pages/dashboard/AiAnalyticsPage.tsx
const AI_BASE = `${envConfig.API_ENDPOINT}/api/ai/api/v1`;
// Ví dụ: http://localhost:8000/api/ai/api/v1
//   └── Qua API Gateway (Kong/Apisix) → forward tới ai-service:50055
```

### 9.2 Luồng Train Model từ web-admin

```
[Admin bấm nút "Train Model từ DB"]
        │
        ▼
handleTrain() trong AiAnalyticsPage.tsx
        │
        ▼
fetch(`${AI_BASE}/train`, { method: "POST" })
        │    HTTP POST → API Gateway → ai-service:50055
        ▼
ai-service: POST /api/v1/train
        │
        ├─► Lấy data từ estate-service (phân trang cursor)
        ├─► Làm sạch → train RandomForest → lưu model.pkl
        └─► Trả về { sampleCount, accuracy }
        │
        ▼
message.success("Train thành công: 312 mẫu, độ chính xác 82.5%")
        │
        ▼
fetchAnalytics() → GET /api/v1/price-analytics → cập nhật UI
```

### 9.3 Luồng Dự Đoán từ web-admin

```
[Admin điền form: area=50, rooms=2, location="Quận 7", type="apartment"]
[Admin bấm "Dự đoán"]
        │
        ▼
handlePredict() trong AiAnalyticsPage.tsx
        │
        ▼
fetch(`${AI_BASE}/predict-price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        area: 50,
        rooms: 2,
        location: "Quận 7",
        propertyType: "apartment"
    })
})
        │
        ▼
ai-service: POST /api/v1/predict-price
        │
        └─► PriceService.predict() → model.predict() → 8_500_000
        │
        ▼
setPredictResult({ predictedPrice: 8500000 })
→ Hiển thị: "8.500.000 ₫"
```

### 9.4 State Management trong AiAnalyticsPage

```typescript
// States
const [loading, setLoading]       = useState(true);      // Đang load analytics
const [training, setTraining]     = useState(false);     // Đang train model
const [predicting, setPredicting] = useState(false);     // Đang dự đoán
const [analytics, setAnalytics]   = useState<PriceAnalytics | null>(null);
const [predictResult, setPredictResult] = useState<PredictResult | null>(null);

// Form state
const [predictForm, setPredictForm] = useState({
    area: 50,
    rooms: 2,
    location: "Quận 7",
    propertyType: "apartment",
});
```

---

## 10. Phân Tích Theo Khu Vực và Loại BĐS

### 10.1 Phân tích theo khu vực (hiện tại – gián tiếp)

Hiện tại model **không phân tích trực tiếp từng quận** ra bảng thống kê. Khu vực được encode thành `location_code` (0–999) và là **một trong 4 features đầu vào** cho model. Model học mối quan hệ:

```
Cùng area + rooms + propertyType, nhưng location_code khác → giá dự đoán khác
```

Ví dụ:
- `location_code` của `"Quận 1"` ≈ 847 → giá dự đoán cao hơn
- `location_code` của `"Bình Dương"` ≈ 213 → giá dự đoán thấp hơn

### 10.2 Phân tích theo loại BĐS (endpoint `/price-analytics`)

Endpoint `GET /price-analytics` trả về thống kê thực tế + dự đoán AI cho 5 loại:

| Loại BĐS | `property_type` code |
|---|---|
| Căn hộ (`apartment`) | 0 |
| Nhà nguyên căn (`house`) | 1 |
| Đất (`land`) | 2 |
| Văn phòng (`office`) | 3 |
| Phòng trọ (`room`) | 4 |

Với mỗi loại, service tính:
- `avgPrice` = mean thực tế trong dataset
- `minPrice` / `maxPrice` = min/max thực tế
- `predictedAvg` = model dự đoán với input = (avg_area, avg_rooms, mode_location_code, property_type)
- `sampleCount` = số mẫu trong dataset

---

## 11. Điểm Mở Rộng – Hướng Dẫn Thêm Input Mới

> Đây là phần quan trọng nhất nếu bạn muốn bổ sung thêm features để tăng độ chính xác.

### 11.1 Danh sách các features có thể thêm

| Feature | Trường trong estate-service | Lý do cần thêm |
|---|---|---|
| `bathrooms` | `bathrooms` | Số phòng tắm ảnh hưởng giá |
| `furniture_status` | `furnitureStatus` | Nội thất đầy đủ vs không có |
| `floor` | `floor` | Tầng cao/thấp ảnh hưởng giá |
| `has_parking` | từ `amenities` | Chỗ đậu xe tăng giá |
| `city_code` | `city` | Phân biệt tỉnh thành (hiện chỉ có quận) |
| `deposit_ratio` | `depositAmount / pricePerMonth` | Tỷ lệ đặt cọc |
| `year` / `month` | timestamp | Yếu tố thời vụ giá thuê |

### 11.2 Các file cần sửa để thêm feature mới

```
Giả sử thêm feature "furnitureStatus" (none=0, basic=1, full=2)
```

**Bước 1: Thêm vào schema** – `app/schemas/price_schema.py`

```python
class PricePredictionRequest(BaseModel):
    area: float = Field(..., gt=0)
    rooms: int = Field(..., ge=0)
    location: str = Field(..., min_length=1)
    propertyType: PropertyType
    # ✅ THÊM MỚI:
    furnitureStatus: Literal["none", "basic", "full"] = "basic"
```

**Bước 2: Thêm encoding** – `app/services/price_service.py`

```python
# Thêm mapping constant ở đầu file
FURNITURE_MAP = {
    "none": 0,
    "basic": 1,
    "full": 2,
}

# Sửa hàm predict():
def predict(self, payload: PricePredictionRequest) -> dict[str, float]:
    ...
    input_df = pd.DataFrame([{
        "area": payload.area,
        "rooms": payload.rooms,
        "location_code": location_code,
        "property_type": property_type_code,
        "furniture": FURNITURE_MAP.get(payload.furnitureStatus, 1),  # ✅ THÊM
    }])
    ...
```

**Bước 3: Thêm vào data collection** – `train_from_db()` trong `price_service.py`

```python
# Trong vòng lặp xử lý properties:
furniture = p.get("furnitureStatus", "basic")

rows.append({
    "area": area_val,
    "rooms": bedrooms,
    "location_code": self._encode_location(district),
    "property_type": PROPERTY_TYPE_MAP.get(ptype, 0),
    "furniture": FURNITURE_MAP.get(furniture, 1),  # ✅ THÊM
    "rental_price": price_val,
})
```

**Bước 4: Cập nhật feature_cols** – trong cả `train_from_db()` và `get_price_analytics()`

```python
feature_cols = ["area", "rooms", "location_code", "property_type", "furniture"]  # ✅ THÊM
```

**Bước 5: Cập nhật script train offline** – `training/train_price_model.py`

```python
# Thêm cột "furniture" vào _build_sample_dataset()
# Thêm "furniture" vào feature_cols
```

**Bước 6: Cập nhật form web-admin** – `AiAnalyticsPage.tsx`

```typescript
// Thêm vào predictForm state
const [predictForm, setPredictForm] = useState({
    area: 50,
    rooms: 2,
    location: "Quận 7",
    propertyType: "apartment",
    furnitureStatus: "basic",  // ✅ THÊM
});

// Thêm Select vào UI
<Select
    value={predictForm.furnitureStatus}
    onChange={(v) => setPredictForm({ ...predictForm, furnitureStatus: v })}
>
    <Option value="none">Không nội thất</Option>
    <Option value="basic">Nội thất cơ bản</Option>
    <Option value="full">Nội thất đầy đủ</Option>
</Select>
```

**Bước 7: Xóa model.pkl cũ và train lại**

```bash
# Xóa model cũ (vì số features thay đổi, model cũ không tương thích)
rm training/model.pkl
rm training/dataset.csv

# Train lại từ web-admin: nhấn nút "Train Model từ DB"
# Hoặc chạy script:
python training/train_price_model.py
```

> ⚠️ **Quan trọng:** Sau khi thêm/bỏ feature, **bắt buộc phải xóa `model.pkl` và train lại**. Model cũ train với 4 features sẽ crash khi nhận input 5 features.

### 11.3 Lưu ý khi thêm categorical features

Với features là category (ví dụ `furnitureStatus`, `city`), có 2 cách encode:

| Cách | Khi nào dùng | Code mẫu |
|---|---|---|
| **Label Encoding** (số nguyên 0,1,2) | Khi có thứ tự tự nhiên (none < basic < full) | `FURNITURE_MAP = {"none": 0, "basic": 1, "full": 2}` |
| **One-Hot Encoding** | Khi không có thứ tự (city, district) | `pd.get_dummies(df, columns=["city"])` |

Random Forest xử lý được cả hai cách. Tuy nhiên:
- **Label Encoding** đơn giản hơn, phù hợp với pipeline hiện tại
- **One-Hot** tốt hơn nếu category không có thứ tự nhưng làm tăng số columns

### 11.4 Thêm phân tích theo khu vực (city/district)

Hiện tại `price-analytics` chỉ phân tích theo loại BĐS. Để thêm phân tích theo khu vực:

```python
# Thêm endpoint mới: GET /price-analytics/by-location
@router.get("/price-analytics/by-location")
def get_price_analytics_by_location():
    df = pd.read_csv(DATASET_PATH)
    # Group by district (cần lưu tên gốc, không phải location_code)
    # Thêm cột "district_name" vào dataset khi train
    result = df.groupby("district_name")["rental_price"].agg(["mean", "min", "max", "count"])
    return result.to_dict()
```

**Để làm điều này cần:** Lưu thêm cột `district_name` (string) vào `dataset.csv` thay vì chỉ lưu `location_code`.

---

## Tóm Tắt Nhanh

| Bước | Mô tả |
|---|---|
| **Data source** | `estate-service` GET `/properties/search` (phân trang cursor) |
| **Features dùng** | `area`, `rooms`, `location_code` (MD5), `property_type` (label encode) |
| **Target** | `pricePerMonth` (VNĐ/tháng) |
| **Algorithm** | `RandomForestRegressor(n_estimators=200)` |
| **Accuracy metric** | MAPE → `accuracy = (1 - MAPE) * 100%` |
| **Model lưu** | `training/model.pkl` (pickle) |
| **Dataset cache** | `training/dataset.csv` |
| **Train trigger** | API `POST /api/v1/train` hoặc script offline |
| **Predict** | API `POST /api/v1/predict-price` |
| **Analytics** | API `GET /api/v1/price-analytics` |
| **web-admin base URL** | `${API_ENDPOINT}/api/ai/api/v1` |

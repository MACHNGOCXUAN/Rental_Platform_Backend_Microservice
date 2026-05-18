from typing import Literal, Optional

from pydantic import BaseModel, Field

# -----------------------------------------------------------------------
# Enums / Literal types
# -----------------------------------------------------------------------

PropertyType = Literal["apartment", "house", "land", "office", "room"]

FurnitureStatus = Literal["none", "basic", "full"]

DirectionType = Literal["east", "west", "south", "north", "northeast", "northwest", "southeast", "southwest", ""]

LegalStatus = Literal["redBook", "pinkBook", "waitingForBook", "noBook", ""]


# -----------------------------------------------------------------------
# Request schema – input đầu vào dự đoán giá
# Các field được nhóm theo mức độ áp dụng:
#   [ALL]        = mọi loại BĐS
#   [RESIDENTIAL]= apartment, house, room
#   [LAND]       = land
#   [COMMERCIAL] = office
# -----------------------------------------------------------------------

class PricePredictionRequest(BaseModel):
    # ── Bắt buộc [ALL] ──────────────────────────────────────────────────
    area: float = Field(..., gt=0, description="Diện tích sử dụng (m²)")
    location: str = Field(..., min_length=1, description="Quận/Huyện hoặc tên khu vực")
    propertyType: PropertyType = Field(..., description="Loại hình BĐS")

    # ── Không gian / phòng [RESIDENTIAL] ────────────────────────────────
    rooms: int = Field(default=0, ge=0, description="Số phòng ngủ (0 nếu là đất/VP không phân phòng)")
    bathrooms: int = Field(default=0, ge=0, description="Số phòng tắm [apartment, house, room]")
    floors: int = Field(default=1, ge=0, description="Số tầng / tầng số mấy của BĐS [house, apartment]")
    totalFloors: Optional[int] = Field(default=None, ge=1, description="Tổng số tầng của tòa nhà [apartment]")

    # ── Hướng & mặt tiền ────────────────────────────────────────────────
    direction: DirectionType = Field(default="", description="Hướng nhà (đông/tây/nam/bắc,...) [house, apartment]")
    streetFacing: Optional[bool] = Field(default=None, description="Mặt tiền đường lớn (True) hay hẻm (False)")

    # ── Nội thất [RESIDENTIAL] ──────────────────────────────────────────
    furnitureStatus: FurnitureStatus = Field(default="none", description="Tình trạng nội thất")

    # ── Pháp lý & tình trạng ────────────────────────────────────────────
    legalStatus: LegalStatus = Field(default="", description="Tình trạng pháp lý BĐS")

    # ── Vị trí địa lý (Proximity factors) [ALL] ─────────────────────────
    nearCityCenter: Optional[bool] = Field(default=False, description="Gần trung tâm thành phố")
    nearShoppingMall: Optional[bool] = Field(default=False, description="Gần trung tâm thương mại")
    nearMarket: Optional[bool] = Field(default=False, description="Gần chợ/siêu thị")
    nearSchool: Optional[bool] = Field(default=False, description="Gần trường học")
    nearHospital: Optional[bool] = Field(default=False, description="Gần bệnh viện")
    nearPark: Optional[bool] = Field(default=False, description="Gần công viên [apartment, house]")
    nearBusStation: Optional[bool] = Field(default=False, description="Gần bến xe/trạm bus")
    nearIndustrialZone: Optional[bool] = Field(default=False, description="Gần khu công nghiệp [land, room]")

    # ── Đặc thù thương mại [office, land] ───────────────────────────────
    hasElevator: Optional[bool] = Field(default=False, description="Có thang máy [office, apartment cao tầng]")
    hasParking: Optional[bool] = Field(default=False, description="Có chỗ đậu xe / bãi giữ xe")
    hasGenerator: Optional[bool] = Field(default=False, description="Có máy phát điện dự phòng [office]")

    # ── Tiện ích nội khu [apartment, house] ─────────────────────────────
    hasPool: Optional[bool] = Field(default=False, description="Có hồ bơi")
    hasGym: Optional[bool] = Field(default=False, description="Có phòng gym")
    hasSecurity: Optional[bool] = Field(default=False, description="Có bảo vệ 24/7")
    hasPetAllowed: Optional[bool] = Field(default=False, description="Cho phép nuôi thú cưng")

    # ── Tính chất đất [land] ─────────────────────────────────────────────
    landFrontage: Optional[float] = Field(default=None, ge=0, description="Chiều ngang mặt tiền đất (m) [land]")
    landDepth: Optional[float] = Field(default=None, ge=0, description="Chiều sâu lô đất (m) [land]")
    landShape: Optional[str] = Field(default=None, description="Hình dạng lô đất: square/rectangle/irregular [land]")

    # ── Thời gian ────────────────────────────────────────────────────────
    postMonth: Optional[int] = Field(default=None, ge=1, le=12, description="Tháng đăng tin (1-12) – yếu tố mùa vụ")
    postYear: Optional[int] = Field(default=None, ge=2020, description="Năm đăng tin")


# -----------------------------------------------------------------------
# Response schemas
# -----------------------------------------------------------------------

class PricePredictionResponse(BaseModel):
    predictedPrice: float


class TrainModelResponse(BaseModel):
    message: str
    sampleCount: int
    accuracy: float


class PricePredictionByTypeResponse(BaseModel):
    propertyType: str
    avgPrice: float
    minPrice: float
    maxPrice: float
    predictedAvg: float
    sampleCount: int


class PriceAnalyticsResponse(BaseModel):
    predictions: list[PricePredictionByTypeResponse]
    modelAccuracy: float
    totalSamples: int
    lastTrainedAt: str

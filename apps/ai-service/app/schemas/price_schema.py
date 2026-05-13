from typing import Literal
from typing import Optional
from pydantic import BaseModel, Field


PropertyType = Literal["apartment", "house", "land", "office", "room"]


class PricePredictionRequest(BaseModel):
	area: float = Field(..., gt=0)
	rooms: int = Field(..., ge=0)
	location: str = Field(..., min_length=1)
	propertyType: PropertyType
	# Extended features from frontend
	floors: Optional[int] = 1
	streetFacing: Optional[bool] = None
	furnitureStatus: Optional[str] = "none"
	nearCityCenter: Optional[bool] = False
	nearShoppingMall: Optional[bool] = False
	nearMarket: Optional[bool] = False
	nearSchool: Optional[bool] = False
	nearHospital: Optional[bool] = False


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

from typing import Literal

from pydantic import BaseModel, Field


PropertyType = Literal["apartment", "house", "land", "office", "room"]


class PricePredictionRequest(BaseModel):
	area: float = Field(..., gt=0)
	rooms: int = Field(..., ge=0)
	location: str = Field(..., min_length=1)
	propertyType: PropertyType


class PricePredictionResponse(BaseModel):
	predictedPrice: float

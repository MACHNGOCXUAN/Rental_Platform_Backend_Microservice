from typing import Literal, Optional

from pydantic import BaseModel, Field


class VisionDescribeResponse(BaseModel):
	description: str
	provider: str


class GenerateDescriptionRequest(BaseModel):
	title: str = ""
	propertyType: str = "apartment"
	areaSqm: float = 0
	bedrooms: int = 0
	bathrooms: int = 0
	address: str = ""
	district: str = ""
	city: str = ""
	pricePerMonth: float = 0
	depositAmount: float = 0
	furnitureStatus: str = "basic"
	amenities: list[str] = []
	tone: Literal["professional", "friendly", "luxury", "simple"] = "professional"
	length: Literal["short", "medium", "long"] = "medium"
	includeEmoji: bool = False
	imageUrls: list[str] = Field(default=[], max_length=3)


class GenerateDescriptionResponse(BaseModel):
	description: str
	provider: str

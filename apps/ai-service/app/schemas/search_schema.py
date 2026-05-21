from typing import Optional

# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field


class InstantSearchRequest(BaseModel):
    q: str = Field(..., min_length=1, description="User search query")
    mode: str = Field(
        default="home",
        description="Search mode: 'home' (keywords only) or 'search' (keywords + properties)",
    )


class ExtractedFilters(BaseModel):
    propertyType: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    priceMax: Optional[float] = None
    priceMin: Optional[float] = None
    bedrooms: Optional[int] = None
    keyword: Optional[str] = None


class InstantSearchPropertyCard(BaseModel):
    id: str
    title: str
    image: str = ""
    price: str
    district: str = ""
    city: str = ""
    slug: str = ""


class InstantSearchResponse(BaseModel):
    keywords: list[str] = []
    properties: list[InstantSearchPropertyCard] = []
    filters: Optional[ExtractedFilters] = None

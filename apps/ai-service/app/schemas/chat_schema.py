from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)


class PropertyCard(BaseModel):
    id: str
    title: str
    image: str = ""
    price: str
    district: str = ""
    city: str = ""
    slug: str = ""


class ChatResponse(BaseModel):
    answer: str
    provider: str
    properties: list[PropertyCard] = []

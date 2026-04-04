from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)


class ChatResponse(BaseModel):
    answer: str
    provider: str
    
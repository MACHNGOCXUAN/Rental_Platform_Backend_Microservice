from fastapi import FastAPI

from app.api.v1.chat import router as chat_router
from app.api.v1.health import router as health_router
from app.api.v1.prediction import router as prediction_router
from app.api.v1.vision import router as vision_router
from app.core.config import settings

app = FastAPI(
    title="Rental Platform AI Service",
    version="1.0.0",
    description="AI microservice for chat, vision, and rental price prediction.",
)

app.include_router(health_router, prefix="/api/v1", tags=["health"])
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])
app.include_router(vision_router, prefix="/api/v1", tags=["vision"])
app.include_router(prediction_router, prefix="/api/v1", tags=["prediction"])


@app.get("/")
def root() -> dict:
    return {
        "message": "AI Service is running",
        "port": settings.port,
        "docs": "/docs",
    }
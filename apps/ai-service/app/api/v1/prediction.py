from fastapi import APIRouter, HTTPException

from app.schemas.price_schema import (
	PriceAnalyticsResponse,
	PricePredictionRequest,
	PricePredictionResponse,
	TrainModelResponse,
)
from app.services.price_service import PriceService

router = APIRouter()
price_service = PriceService()


@router.post("/predict-price", response_model=PricePredictionResponse)
def predict_rental_price(payload: PricePredictionRequest) -> PricePredictionResponse:
	try:
		result = price_service.predict(payload)
		return PricePredictionResponse(**result)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/train", response_model=TrainModelResponse)
def train_model() -> TrainModelResponse:
	try:
		result = price_service.train_from_db()
		return TrainModelResponse(**result)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/price-analytics", response_model=PriceAnalyticsResponse)
def get_price_analytics() -> PriceAnalyticsResponse:
	try:
		result = price_service.get_price_analytics()
		return PriceAnalyticsResponse(**result)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc

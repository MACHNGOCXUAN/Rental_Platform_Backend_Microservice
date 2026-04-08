from fastapi import APIRouter, HTTPException

from app.schemas.price_schema import PricePredictionRequest, PricePredictionResponse
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

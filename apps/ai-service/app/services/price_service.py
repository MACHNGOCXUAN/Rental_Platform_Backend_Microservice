import hashlib

import pandas as pd

from app.core.config import settings
from app.models.model_loader import load_pickle_model
from app.schemas.price_schema import PricePredictionRequest

PROPERTY_TYPE_MAP = {
	"apartment": 0,
	"house": 1,
	"land": 2,
	"office": 3,
	"room": 4,
}


class PriceService:
	def __init__(self) -> None:
		self.model = load_pickle_model(settings.price_model_path)

	@staticmethod
	def _encode_location(location: str) -> int:
		normalized = location.strip().lower().encode("utf-8")
		return int(hashlib.md5(normalized).hexdigest(), 16) % 1000

	def predict(self, payload: PricePredictionRequest) -> dict[str, float]:
		property_type_code = PROPERTY_TYPE_MAP[payload.propertyType]
		location_code = self._encode_location(payload.location)

		input_df = pd.DataFrame(
			[
				{
					"area": payload.area,
					"rooms": payload.rooms,
					"location_code": location_code,
					"property_type": property_type_code,
				}
			]
		)

		prediction = self.model.predict(input_df)
		return {"predictedPrice": float(prediction[0])}

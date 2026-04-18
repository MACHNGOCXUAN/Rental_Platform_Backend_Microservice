import hashlib
import pickle
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score

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

PROPERTY_TYPE_REVERSE = {v: k for k, v in PROPERTY_TYPE_MAP.items()}

PROPERTY_TYPE_LABELS = {
	"apartment": "Căn hộ",
	"house": "Nhà nguyên căn",
	"land": "Đất",
	"office": "Văn phòng",
	"room": "Phòng trọ",
}

MODEL_PATH = Path("training/model.pkl")
DATASET_PATH = Path("training/dataset.csv")


class PriceService:
	def __init__(self) -> None:
		self.model = None
		self._last_trained_at: str = ""
		self._model_accuracy: float = 0.0
		self._total_samples: int = 0
		self._load_model()

	def _load_model(self) -> None:
		try:
			self.model = load_pickle_model(settings.price_model_path)
		except FileNotFoundError:
			self.model = None

	@staticmethod
	def _encode_location(location: str) -> int:
		normalized = location.strip().lower().encode("utf-8")
		return int(hashlib.md5(normalized).hexdigest(), 16) % 1000

	def predict(self, payload: PricePredictionRequest) -> dict[str, float]:
		if self.model is None:
			self._load_model()
		if self.model is None:
			raise RuntimeError("Model not trained yet. Call /train first.")

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

	def _fetch_properties_from_db(self) -> list[dict]:
		"""Fetch all properties from estate-service for training."""
		base_url = settings.estate_service_base_url.rstrip("/")
		all_properties = []
		cursor = None
		limit = 50

		for _ in range(50):  # max 50 pages = 2500 properties
			params: dict = {"limit": limit}
			if cursor:
				params["cursor"] = cursor

			try:
				resp = requests.get(
					f"{base_url}/properties/search",
					params=params,
					timeout=15,
				)
				if resp.status_code != 200:
					break
				data = resp.json()
				outer = data.get("data", data)
				if isinstance(outer, dict):
					items = outer.get("data", [])
					has_more = outer.get("hasMore", False)
					cursor = outer.get("nextCursor")
				elif isinstance(outer, list):
					items = outer
					has_more = False
				else:
					break

				all_properties.extend(items)
				if not has_more or not cursor:
					break
			except Exception:
				break

		return all_properties

	def train_from_db(self) -> dict:
		"""Fetch data from DB and retrain model."""
		properties = self._fetch_properties_from_db()

		rows = []
		for p in properties:
			price = p.get("pricePerMonth")
			area = p.get("areaSqm")
			ptype = p.get("propertyType", "")
			district = p.get("district", "")

			if not price or not area:
				continue
			try:
				price_val = float(price)
				area_val = float(area)
			except (ValueError, TypeError):
				continue
			if price_val <= 0 or area_val <= 0:
				continue

			bedrooms = p.get("bedrooms", 0)
			try:
				bedrooms = int(bedrooms)
			except (ValueError, TypeError):
				bedrooms = 0

			rows.append({
				"area": area_val,
				"rooms": bedrooms,
				"location_code": self._encode_location(district),
				"property_type": PROPERTY_TYPE_MAP.get(ptype, 0),
				"rental_price": price_val,
			})

		if len(rows) < 5:
			raise RuntimeError(f"Not enough data to train ({len(rows)} rows). Need at least 5.")

		df = pd.DataFrame(rows)

		# Save dataset
		DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)
		df.to_csv(DATASET_PATH, index=False)

		# Train
		feature_cols = ["area", "rooms", "location_code", "property_type"]
		X = df[feature_cols]
		y = df["rental_price"]

		model = RandomForestRegressor(n_estimators=200, random_state=42)

		# Cross-validation for accuracy (MAPE-based)
		n_splits = min(5, len(df))
		if n_splits >= 2:
			from sklearn.model_selection import cross_val_predict
			model_cv = RandomForestRegressor(n_estimators=200, random_state=42)
			y_pred_cv = cross_val_predict(model_cv, X, y, cv=n_splits)
			mape = (abs(y - y_pred_cv) / y.clip(lower=1)).mean()
			accuracy = max(0, (1 - mape)) * 100
		else:
			accuracy = 0.0

		# Fit final model
		model.fit(X, y)

		# Save
		MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
		with MODEL_PATH.open("wb") as f:
			pickle.dump(model, f)

		# Reload
		self.model = model
		self._model_accuracy = round(accuracy, 2)
		self._total_samples = len(df)
		self._last_trained_at = datetime.now().isoformat()

		return {
			"message": f"Model trained successfully with {len(df)} samples",
			"sampleCount": len(df),
			"accuracy": self._model_accuracy,
		}

	def get_price_analytics(self) -> dict:
		"""Get price predictions for each property type."""
		if self.model is None:
			self._load_model()

		# Load dataset
		df = None
		if DATASET_PATH.exists() and DATASET_PATH.stat().st_size > 0:
			df = pd.read_csv(DATASET_PATH)

		predictions = []
		property_types = ["apartment", "house", "room", "office", "land"]

		for pt in property_types:
			pt_code = PROPERTY_TYPE_MAP[pt]

			if df is not None and len(df) > 0:
				pt_data = df[df["property_type"] == pt_code]
				if len(pt_data) > 0:
					avg_price = float(pt_data["rental_price"].mean())
					min_price = float(pt_data["rental_price"].min())
					max_price = float(pt_data["rental_price"].max())
					avg_area = float(pt_data["area"].mean())
					avg_rooms = int(pt_data["rooms"].mean())
					sample_count = len(pt_data)

					# Predict using average features
					predicted = 0.0
					if self.model is not None:
						loc_code = int(pt_data["location_code"].mode().iloc[0]) if len(pt_data) > 0 else 500
						pred_df = pd.DataFrame([{
							"area": avg_area,
							"rooms": avg_rooms,
							"location_code": loc_code,
							"property_type": pt_code,
						}])
						predicted = float(self.model.predict(pred_df)[0])

					predictions.append({
						"propertyType": PROPERTY_TYPE_LABELS.get(pt, pt),
						"avgPrice": round(avg_price),
						"minPrice": round(min_price),
						"maxPrice": round(max_price),
						"predictedAvg": round(predicted),
						"sampleCount": sample_count,
					})
				else:
					predictions.append({
						"propertyType": PROPERTY_TYPE_LABELS.get(pt, pt),
						"avgPrice": 0, "minPrice": 0, "maxPrice": 0,
						"predictedAvg": 0, "sampleCount": 0,
					})
			else:
				predictions.append({
					"propertyType": PROPERTY_TYPE_LABELS.get(pt, pt),
					"avgPrice": 0, "minPrice": 0, "maxPrice": 0,
					"predictedAvg": 0, "sampleCount": 0,
				})

		return {
			"predictions": predictions,
			"modelAccuracy": self._model_accuracy,
			"totalSamples": self._total_samples,
			"lastTrainedAt": self._last_trained_at or "Chưa train",
		}

import hashlib
import pickle
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests
from sklearn.ensemble import RandomForestRegressor

from app.core.config import settings
from app.models.model_loader import load_pickle_model
from app.schemas.price_schema import PricePredictionRequest

# -----------------------------------------------------------------------
# Encoding maps
# -----------------------------------------------------------------------

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

FURNITURE_MAP = {
    "none": 0,
    "basic": 1,
    "full": 2,
}

DIRECTION_MAP = {
    "east": 1, "west": 2, "south": 3, "north": 4,
    "northeast": 5, "northwest": 6, "southeast": 7, "southwest": 8,
    "": 0,
}

LEGAL_MAP = {
    "redBook": 3,
    "pinkBook": 2,
    "waitingForBook": 1,
    "noBook": 0,
    "": 0,
}

LAND_SHAPE_MAP = {
    "square": 2,
    "rectangle": 1,
    "irregular": 0,
    None: 1,
}

MODEL_PATH = Path("training/model.pkl")
DATASET_PATH = Path("training/dataset.csv")

# Feature columns – thứ tự PHẢI khớp giữa train và predict
FEATURE_COLS = [
    # Core features
    "area",
    "rooms",
    "bathrooms",
    "floors",
    "location_code",
    "property_type",
    # Vật lý
    "furniture",
    "direction_code",
    "street_facing",
    "legal_code",
    # Proximity
    "near_city_center",
    "near_shopping_mall",
    "near_market",
    "near_school",
    "near_hospital",
    "near_park",
    "near_bus_station",
    "near_industrial_zone",
    # Amenities
    "has_elevator",
    "has_parking",
    "has_generator",
    "has_pool",
    "has_gym",
    "has_security",
    # Đặc thù đất
    "land_frontage",
    "land_depth",
    # Thời gian
    "post_month",
]


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

def _bool_to_int(val) -> int:
    """Convert bool / None → 0 or 1."""
    if val is None:
        return 0
    return int(bool(val))


def _safe_float(val, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _safe_int(val, default: int = 0) -> int:
    try:
        return int(val) if val is not None else default
    except (ValueError, TypeError):
        return default


# -----------------------------------------------------------------------
# PriceService
# -----------------------------------------------------------------------

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

    def _payload_to_feature_row(self, payload: PricePredictionRequest) -> dict:
        """Chuyển PricePredictionRequest thành dict features đúng thứ tự FEATURE_COLS."""
        now = datetime.now()
        return {
            # Core
            "area": payload.area,
            "rooms": payload.rooms,
            "bathrooms": payload.bathrooms,
            "floors": payload.floors,
            "location_code": self._encode_location(payload.location),
            "property_type": PROPERTY_TYPE_MAP.get(payload.propertyType, 0),
            # Vật lý
            "furniture": FURNITURE_MAP.get(payload.furnitureStatus or "none", 0),
            "direction_code": DIRECTION_MAP.get(payload.direction or "", 0),
            "street_facing": _bool_to_int(payload.streetFacing),
            "legal_code": LEGAL_MAP.get(payload.legalStatus or "", 0),
            # Proximity
            "near_city_center": _bool_to_int(payload.nearCityCenter),
            "near_shopping_mall": _bool_to_int(payload.nearShoppingMall),
            "near_market": _bool_to_int(payload.nearMarket),
            "near_school": _bool_to_int(payload.nearSchool),
            "near_hospital": _bool_to_int(payload.nearHospital),
            "near_park": _bool_to_int(payload.nearPark),
            "near_bus_station": _bool_to_int(payload.nearBusStation),
            "near_industrial_zone": _bool_to_int(payload.nearIndustrialZone),
            # Amenities
            "has_elevator": _bool_to_int(payload.hasElevator),
            "has_parking": _bool_to_int(payload.hasParking),
            "has_generator": _bool_to_int(payload.hasGenerator),
            "has_pool": _bool_to_int(payload.hasPool),
            "has_gym": _bool_to_int(payload.hasGym),
            "has_security": _bool_to_int(payload.hasSecurity),
            # Đặc thù đất
            "land_frontage": _safe_float(payload.landFrontage, 0.0),
            "land_depth": _safe_float(payload.landDepth, 0.0),
            # Thời gian
            "post_month": payload.postMonth if payload.postMonth else now.month,
        }

    def predict(self, payload: PricePredictionRequest) -> dict[str, float]:
        if self.model is None:
            self._load_model()
        if self.model is None:
            raise RuntimeError("Model not trained yet. Call /train first.")

        row = self._payload_to_feature_row(payload)
        input_df = pd.DataFrame([row])[FEATURE_COLS]
        prediction = self.model.predict(input_df)
        return {"predictedPrice": float(prediction[0])}

    # -----------------------------------------------------------------------
    # Training
    # -----------------------------------------------------------------------

    def _fetch_properties_from_db(self) -> list[dict]:
        """Fetch all properties from estate-service for training (cursor pagination)."""
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

    def _property_to_row(self, p: dict) -> dict | None:
        """Chuyển 1 bản ghi từ estate-service thành row dict cho DataFrame."""
        price = p.get("pricePerMonth")
        area = p.get("areaSqm")
        ptype = p.get("propertyType", "")
        district = p.get("district", "")

        if not price or not area:
            return None
        try:
            price_val = float(price)
            area_val = float(area)
        except (ValueError, TypeError):
            return None
        if price_val <= 0 or area_val <= 0:
            return None

        # Tiện ích từ danh sách amenities (list[str])
        amenities: list[str] = p.get("amenities", []) or []
        amenity_set = {a.lower() for a in amenities}

        # Thời gian đăng tin
        created_at = p.get("createdAt", "")
        try:
            post_month = int(created_at[5:7]) if created_at else datetime.now().month
        except Exception:
            post_month = datetime.now().month

        return {
            # Core
            "area": area_val,
            "rooms": _safe_int(p.get("bedrooms"), 0),
            "bathrooms": _safe_int(p.get("bathrooms"), 0),
            "floors": _safe_int(p.get("floor") or p.get("floors"), 1),
            "location_code": self._encode_location(district),
            "property_type": PROPERTY_TYPE_MAP.get(ptype, 0),
            # Vật lý
            "furniture": FURNITURE_MAP.get(p.get("furnitureStatus", "none"), 0),
            "direction_code": DIRECTION_MAP.get(p.get("direction", ""), 0),
            "street_facing": _bool_to_int(p.get("streetFacing")),
            "legal_code": LEGAL_MAP.get(p.get("legalStatus", ""), 0),
            # Proximity
            "near_city_center": _bool_to_int(p.get("nearCityCenter")),
            "near_shopping_mall": _bool_to_int(p.get("nearShoppingMall")),
            "near_market": _bool_to_int(p.get("nearMarket")),
            "near_school": _bool_to_int(p.get("nearSchool")),
            "near_hospital": _bool_to_int(p.get("nearHospital")),
            "near_park": _bool_to_int(p.get("nearPark")),
            "near_bus_station": _bool_to_int(p.get("nearBusStation")),
            "near_industrial_zone": _bool_to_int(p.get("nearIndustrialZone")),
            # Amenities (parse từ list hoặc boolean field)
            "has_elevator": _bool_to_int(
                p.get("hasElevator") or "thang máy" in amenity_set or "elevator" in amenity_set
            ),
            "has_parking": _bool_to_int(
                p.get("hasParking") or "bãi đậu xe" in amenity_set or "parking" in amenity_set
            ),
            "has_generator": _bool_to_int(
                p.get("hasGenerator") or "máy phát điện" in amenity_set or "generator" in amenity_set
            ),
            "has_pool": _bool_to_int(
                p.get("hasPool") or "hồ bơi" in amenity_set or "swimming pool" in amenity_set
            ),
            "has_gym": _bool_to_int(
                p.get("hasGym") or "gym" in amenity_set or "phòng gym" in amenity_set
            ),
            "has_security": _bool_to_int(
                p.get("hasSecurity") or "bảo vệ" in amenity_set or "security" in amenity_set
            ),
            # Đặc thù đất
            "land_frontage": _safe_float(p.get("landFrontage"), 0.0),
            "land_depth": _safe_float(p.get("landDepth"), 0.0),
            # Thời gian
            "post_month": post_month,
            # Target
            "rental_price": price_val,
        }

    def train_from_db(self) -> dict:
        """Fetch data from DB and retrain model with all extended features."""
        properties = self._fetch_properties_from_db()

        rows = []
        for p in properties:
            row = self._property_to_row(p)
            if row is not None:
                rows.append(row)

        if len(rows) < 5:
            raise RuntimeError(f"Not enough data to train ({len(rows)} rows). Need at least 5.")

        df = pd.DataFrame(rows)

        # Đảm bảo các cột đúng thứ tự
        all_cols = FEATURE_COLS + ["rental_price"]
        for col in all_cols:
            if col not in df.columns:
                df[col] = 0

        # Save dataset
        DATASET_PATH.parent.mkdir(parents=True, exist_ok=True)
        df[all_cols].to_csv(DATASET_PATH, index=False)

        # Train
        X = df[FEATURE_COLS]
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
            # Backward compat: nếu dataset cũ thiếu cột mới thì fill 0
            for col in FEATURE_COLS:
                if col not in df.columns:
                    df[col] = 0

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
                    sample_count = len(pt_data)

                    # Predict using average / mode of all features
                    predicted = 0.0
                    if self.model is not None:
                        avg_row = {}
                        for col in FEATURE_COLS:
                            if col in pt_data.columns:
                                col_series = pt_data[col]
                                # Dùng mode cho categorical, mean cho numeric
                                if col in ("property_type", "furniture", "direction_code",
                                           "legal_code", "location_code", "post_month",
                                           "near_city_center", "near_shopping_mall",
                                           "near_market", "near_school", "near_hospital",
                                           "near_park", "near_bus_station", "near_industrial_zone",
                                           "has_elevator", "has_parking", "has_generator",
                                           "has_pool", "has_gym", "has_security",
                                           "street_facing"):
                                    avg_row[col] = col_series.mode().iloc[0] if len(col_series) > 0 else 0
                                else:
                                    avg_row[col] = col_series.mean()
                            else:
                                avg_row[col] = 0

                        pred_df = pd.DataFrame([avg_row])[FEATURE_COLS]
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

"""
train_price_model.py – Script train offline (chạy tay hoặc CI).

Chạy từ thư mục root của ai-service:
    python training/train_price_model.py

Dataset: nếu training/dataset.csv tồn tại (đã fetch từ DB) → dùng luôn.
         Nếu chưa có → dùng dataset mẫu dưới đây.
"""

import pickle
from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestRegressor

DATASET_PATH = Path("training/dataset.csv")
MODEL_PATH = Path("training/model.pkl")

PROPERTY_TYPE_MAP = {
    "apartment": 0,
    "house": 1,
    "land": 2,
    "office": 3,
    "room": 4,
}

# Feature columns – PHẢI khớp với FEATURE_COLS trong price_service.py
FEATURE_COLS = [
    "area", "rooms", "bathrooms", "floors",
    "location_code", "property_type",
    "furniture", "direction_code", "street_facing", "legal_code",
    "near_city_center", "near_shopping_mall", "near_market",
    "near_school", "near_hospital", "near_park",
    "near_bus_station", "near_industrial_zone",
    "has_elevator", "has_parking", "has_generator",
    "has_pool", "has_gym", "has_security",
    "land_frontage", "land_depth",
    "post_month",
]


def _build_sample_dataset() -> pd.DataFrame:
    """
    Dataset mẫu đa dạng theo từng loại BĐS.
    Các cột proximity/amenities = 0/1 boolean int.
    """
    rows = [
        # ── Phòng trọ (room) ──────────────────────────────────────────────────────
        # area, rooms, baths, floors, loc_code, type, furn, dir, street, legal,
        # city_ctr, mall, mkt, sch, hosp, park, bus, indust,
        # elev, park_f, gen, pool, gym, sec,
        # frontage, depth, month
        # rental_price
        {"area": 18, "rooms": 1, "bathrooms": 1, "floors": 1, "location_code": 621, "property_type": 4,
         "furniture": 0, "direction_code": 0, "street_facing": 0, "legal_code": 0,
         "near_city_center": 0, "near_shopping_mall": 0, "near_market": 1, "near_school": 1, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 0, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 0,
         "land_frontage": 0, "land_depth": 0, "post_month": 3, "rental_price": 2500000},
        {"area": 25, "rooms": 1, "bathrooms": 1, "floors": 2, "location_code": 412, "property_type": 4,
         "furniture": 1, "direction_code": 1, "street_facing": 0, "legal_code": 0,
         "near_city_center": 0, "near_shopping_mall": 0, "near_market": 1, "near_school": 1, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 1,
         "has_elevator": 0, "has_parking": 1, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 6, "rental_price": 3500000},
        {"area": 30, "rooms": 1, "bathrooms": 1, "floors": 3, "location_code": 311, "property_type": 4,
         "furniture": 2, "direction_code": 3, "street_facing": 1, "legal_code": 1,
         "near_city_center": 1, "near_shopping_mall": 0, "near_market": 1, "near_school": 1, "near_hospital": 1,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 1, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 9, "rental_price": 5500000},

        # ── Căn hộ (apartment) ────────────────────────────────────────────────────
        {"area": 40, "rooms": 1, "bathrooms": 1, "floors": 5, "location_code": 743, "property_type": 0,
         "furniture": 1, "direction_code": 1, "street_facing": 0, "legal_code": 2,
         "near_city_center": 0, "near_shopping_mall": 1, "near_market": 1, "near_school": 1, "near_hospital": 0,
         "near_park": 1, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 0, "has_gym": 0, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 1, "rental_price": 6500000},
        {"area": 55, "rooms": 2, "bathrooms": 2, "floors": 10, "location_code": 743, "property_type": 0,
         "furniture": 2, "direction_code": 4, "street_facing": 0, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 0, "near_school": 1, "near_hospital": 1,
         "near_park": 1, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 1, "has_gym": 1, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 5, "rental_price": 12000000},
        {"area": 70, "rooms": 2, "bathrooms": 2, "floors": 15, "location_code": 847, "property_type": 0,
         "furniture": 2, "direction_code": 1, "street_facing": 0, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 1, "near_school": 1, "near_hospital": 1,
         "near_park": 1, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 1, "has_gym": 1, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 8, "rental_price": 18000000},
        {"area": 90, "rooms": 3, "bathrooms": 2, "floors": 20, "location_code": 847, "property_type": 0,
         "furniture": 2, "direction_code": 4, "street_facing": 0, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 0, "near_school": 1, "near_hospital": 1,
         "near_park": 1, "near_bus_station": 0, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 1, "has_gym": 1, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 2, "rental_price": 25000000},

        # ── Nhà nguyên căn (house) ────────────────────────────────────────────────
        {"area": 60, "rooms": 3, "bathrooms": 2, "floors": 2, "location_code": 512, "property_type": 1,
         "furniture": 1, "direction_code": 3, "street_facing": 1, "legal_code": 2,
         "near_city_center": 0, "near_shopping_mall": 0, "near_market": 1, "near_school": 1, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 1, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 0,
         "land_frontage": 5.0, "land_depth": 12.0, "post_month": 4, "rental_price": 10000000},
        {"area": 100, "rooms": 4, "bathrooms": 3, "floors": 3, "location_code": 512, "property_type": 1,
         "furniture": 2, "direction_code": 1, "street_facing": 1, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 1, "near_school": 1, "near_hospital": 1,
         "near_park": 1, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 1, "has_generator": 0, "has_pool": 1, "has_gym": 0, "has_security": 1,
         "land_frontage": 6.0, "land_depth": 16.0, "post_month": 7, "rental_price": 22000000},
        {"area": 150, "rooms": 5, "bathrooms": 4, "floors": 4, "location_code": 213, "property_type": 1,
         "furniture": 2, "direction_code": 4, "street_facing": 1, "legal_code": 3,
         "near_city_center": 0, "near_shopping_mall": 0, "near_market": 1, "near_school": 1, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 0, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 1, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 0,
         "land_frontage": 8.0, "land_depth": 18.0, "post_month": 11, "rental_price": 18000000},

        # ── Văn phòng (office) ────────────────────────────────────────────────────
        {"area": 50, "rooms": 0, "bathrooms": 1, "floors": 3, "location_code": 847, "property_type": 3,
         "furniture": 0, "direction_code": 1, "street_facing": 1, "legal_code": 2,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 0, "near_school": 0, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 0, "has_gym": 0, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 1, "rental_price": 12000000},
        {"area": 100, "rooms": 0, "bathrooms": 2, "floors": 8, "location_code": 847, "property_type": 3,
         "furniture": 1, "direction_code": 4, "street_facing": 1, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 0, "near_school": 0, "near_hospital": 1,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 0, "has_gym": 1, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 3, "rental_price": 25000000},
        {"area": 200, "rooms": 0, "bathrooms": 3, "floors": 15, "location_code": 743, "property_type": 3,
         "furniture": 2, "direction_code": 1, "street_facing": 1, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 0, "near_school": 0, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 1, "has_parking": 1, "has_generator": 1, "has_pool": 0, "has_gym": 1, "has_security": 1,
         "land_frontage": 0, "land_depth": 0, "post_month": 6, "rental_price": 45000000},

        # ── Đất (land) ────────────────────────────────────────────────────────────
        {"area": 80, "rooms": 0, "bathrooms": 0, "floors": 0, "location_code": 213, "property_type": 2,
         "furniture": 0, "direction_code": 3, "street_facing": 0, "legal_code": 1,
         "near_city_center": 0, "near_shopping_mall": 0, "near_market": 0, "near_school": 0, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 0, "near_industrial_zone": 1,
         "has_elevator": 0, "has_parking": 0, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 0,
         "land_frontage": 8.0, "land_depth": 10.0, "post_month": 2, "rental_price": 5000000},
        {"area": 200, "rooms": 0, "bathrooms": 0, "floors": 0, "location_code": 512, "property_type": 2,
         "furniture": 0, "direction_code": 1, "street_facing": 1, "legal_code": 2,
         "near_city_center": 0, "near_shopping_mall": 0, "near_market": 1, "near_school": 0, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 0, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 0,
         "land_frontage": 10.0, "land_depth": 20.0, "post_month": 8, "rental_price": 12000000},
        {"area": 500, "rooms": 0, "bathrooms": 0, "floors": 0, "location_code": 847, "property_type": 2,
         "furniture": 0, "direction_code": 1, "street_facing": 1, "legal_code": 3,
         "near_city_center": 1, "near_shopping_mall": 1, "near_market": 0, "near_school": 0, "near_hospital": 0,
         "near_park": 0, "near_bus_station": 1, "near_industrial_zone": 0,
         "has_elevator": 0, "has_parking": 0, "has_generator": 0, "has_pool": 0, "has_gym": 0, "has_security": 0,
         "land_frontage": 20.0, "land_depth": 25.0, "post_month": 5, "rental_price": 50000000},
    ]
    return pd.DataFrame(rows)


def _load_dataset() -> pd.DataFrame:
    if DATASET_PATH.exists() and DATASET_PATH.stat().st_size > 0:
        df = pd.read_csv(DATASET_PATH)
        # Backward compat: thêm cột mới nếu dataset cũ thiếu
        for col in FEATURE_COLS:
            if col not in df.columns:
                df[col] = 0
        print(f"Loaded dataset from {DATASET_PATH} ({len(df)} rows)")
    else:
        df = _build_sample_dataset()
        print(f"Using built-in sample dataset ({len(df)} rows)")

    required_cols = set(FEATURE_COLS) | {"rental_price"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {sorted(missing)}")

    if df["property_type"].dtype == object:
        df["property_type"] = (
            df["property_type"].astype(str).str.lower().map(PROPERTY_TYPE_MAP).fillna(0).astype(int)
        )

    return df


def train() -> None:
    df = _load_dataset()

    X = df[FEATURE_COLS]
    y = df["rental_price"]

    model = RandomForestRegressor(n_estimators=200, random_state=42)
    model.fit(X, y)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MODEL_PATH.open("wb") as model_file:
        pickle.dump(model, model_file)

    print(f"Model saved to {MODEL_PATH}")
    print(f"Feature importances:")
    for feat, imp in sorted(zip(FEATURE_COLS, model.feature_importances_), key=lambda x: -x[1]):
        print(f"  {feat:30s}: {imp:.4f}")


if __name__ == "__main__":
    train()

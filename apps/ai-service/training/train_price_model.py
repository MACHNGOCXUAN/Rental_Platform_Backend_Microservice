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


def _build_sample_dataset() -> pd.DataFrame:
	return pd.DataFrame(
		[
			{"area": 28, "rooms": 1, "location_code": 101, "property_type": 4, "rental_price": 3500000},
			{"area": 45, "rooms": 2, "location_code": 101, "property_type": 0, "rental_price": 6200000},
			{"area": 60, "rooms": 2, "location_code": 205, "property_type": 0, "rental_price": 9000000},
			{"area": 75, "rooms": 3, "location_code": 205, "property_type": 1, "rental_price": 12000000},
			{"area": 120, "rooms": 4, "location_code": 305, "property_type": 1, "rental_price": 18000000},
			{"area": 35, "rooms": 1, "location_code": 450, "property_type": 3, "rental_price": 7000000},
			{"area": 200, "rooms": 0, "location_code": 512, "property_type": 2, "rental_price": 10000000},
			{"area": 90, "rooms": 3, "location_code": 450, "property_type": 3, "rental_price": 14000000},
			{"area": 50, "rooms": 2, "location_code": 620, "property_type": 0, "rental_price": 8000000},
			{"area": 30, "rooms": 1, "location_code": 620, "property_type": 4, "rental_price": 4000000},
		]
	)


def _load_dataset() -> pd.DataFrame:
	if DATASET_PATH.exists() and DATASET_PATH.stat().st_size > 0:
		df = pd.read_csv(DATASET_PATH)
	else:
		df = _build_sample_dataset()

	required_cols = {"area", "rooms", "location_code", "property_type", "rental_price"}
	missing_cols = required_cols - set(df.columns)
	if missing_cols:
		raise ValueError(f"Dataset is missing required columns: {sorted(missing_cols)}")

	if df["property_type"].dtype == object:
		df["property_type"] = (
			df["property_type"].astype(str).str.lower().map(PROPERTY_TYPE_MAP).fillna(0).astype(int)
		)

	return df


def train() -> None:
	df = _load_dataset()

	feature_cols = ["area", "rooms", "location_code", "property_type"]
	X = df[feature_cols]
	y = df["rental_price"]

	model = RandomForestRegressor(n_estimators=200, random_state=42)
	model.fit(X, y)

	MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
	with MODEL_PATH.open("wb") as model_file:
		import pickle

		pickle.dump(model, model_file)

	print(f"Model saved to {MODEL_PATH}")


if __name__ == "__main__":
	train()

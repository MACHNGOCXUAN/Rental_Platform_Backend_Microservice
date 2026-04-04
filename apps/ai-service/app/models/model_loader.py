import pickle
from pathlib import Path
from typing import Any


def load_pickle_model(model_path: str) -> Any:
	path = Path(model_path)
	if not path.exists():
		raise FileNotFoundError(f"Model file not found: {model_path}")

	with path.open("rb") as model_file:
		return pickle.load(model_file)

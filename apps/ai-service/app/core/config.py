import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
	port: int = int(os.getenv("PORT", "50055"))

	openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
	gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")

	chat_model_openai: str = os.getenv("CHAT_MODEL_OPENAI", "gpt-4.1-mini")
	chat_model_gemini: str = os.getenv("CHAT_MODEL_GEMINI", "gemini-2.0-flash")
	vision_model_openai: str = os.getenv("VISION_MODEL_OPENAI", "gpt-4.1-mini")
	vision_model_gemini: str = os.getenv("VISION_MODEL_GEMINI", "gemini-2.0-flash")

	estate_service_base_url: str = os.getenv(
		"ESTATE_SERVICE_BASE_URL", "http://estate-service:9001"
	)
	contract_service_base_url: str = os.getenv(
		"CONTRACT_SERVICE_BASE_URL", "http://contract-service:9002"
	)

	price_model_path: str = os.getenv("PRICE_MODEL_PATH", "training/model.pkl")


settings = Settings()
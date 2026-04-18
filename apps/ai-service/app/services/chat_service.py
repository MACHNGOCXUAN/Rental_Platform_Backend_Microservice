import json
import re
import unicodedata
from typing import Any

from app.constants.prompts import CHAT_SYSTEM_PROMPT
from app.core.config import settings
from app.integrations.contract_client import ContractClient
from app.integrations.estate_client import EstateClient
from app.providers.gemini_provider import GeminiProvider
from app.providers.groq_provider import GroqProvider
from app.providers.openai_provider import OpenAIProvider
from app.schemas.chat_schema import PropertyCard


def _to_slug(text: str) -> str:
	"""Convert Vietnamese text to URL slug."""
	text = unicodedata.normalize("NFD", text.lower())
	text = re.sub(r"[\u0300-\u036f]", "", text)
	text = text.replace("đ", "d").replace("Đ", "d")
	text = re.sub(r"[^a-z0-9\s-]", "", text)
	text = re.sub(r"\s+", "-", text).strip("-")
	return re.sub(r"-+", "-", text)


def _format_price(price: Any) -> str:
	"""Format price to Vietnamese style."""
	try:
		p = float(price)
		if p >= 1_000_000:
			return f"{p / 1_000_000:,.1f} triệu/tháng".replace(",", ".")
		return f"{p:,.0f} đ/tháng".replace(",", ".")
	except (TypeError, ValueError):
		return "Liên hệ"


class ChatService:
	def __init__(self) -> None:
		self.estate_client = EstateClient(settings.estate_service_base_url)
		self.contract_client = ContractClient(settings.contract_service_base_url)

		self.openai_provider = OpenAIProvider(settings.openai_api_key)
		self.gemini_provider = GeminiProvider(settings.gemini_api_key)
		self.groq_provider = GroqProvider(settings.groq_api_key) if settings.groq_api_key else None

	def _call_ai(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
		"""Try OpenAI → Gemini → Groq, return (answer, provider)."""
		providers = [
			("openai", lambda: self.openai_provider.chat(
				model=settings.chat_model_openai,
				system_prompt=system_prompt,
				user_prompt=user_prompt,
			)),
			("gemini", lambda: self.gemini_provider.chat(
				model=settings.chat_model_gemini,
				system_prompt=system_prompt,
				user_prompt=user_prompt,
			)),
		]
		if self.groq_provider:
			providers.append(("groq", lambda: self.groq_provider.chat(
				model=settings.chat_model_groq,
				system_prompt=system_prompt,
				user_prompt=user_prompt,
			)))

		for provider_name, call_fn in providers:
			try:
				answer = call_fn()
				if answer and answer.strip():
					return answer, provider_name
			except Exception as e:
				print(f"[ChatService] {provider_name} failed: {e}")
				continue

		return "Xin lỗi, tôi không thể kết nối AI lúc này. Vui lòng thử lại sau.", "fallback"

	def _extract_and_clean_action(self, text: str) -> tuple[dict[str, Any] | None, str]:
		"""Extract search_estate JSON (handles nested braces) and return (action, clean_text)."""
		start = text.find('{"action"')
		if start == -1:
			return None, text

		depth = 0
		for i, ch in enumerate(text[start:], start):
			if ch == "{":
				depth += 1
			elif ch == "}":
				depth -= 1
				if depth == 0:
					json_str = text[start : i + 1]
					try:
						action = json.loads(json_str)
						clean_text = (text[:start] + text[i + 1 :]).strip()
						return action, clean_text
					except json.JSONDecodeError:
						return None, text
		return None, text

	def _build_property_cards(self, properties: list[dict[str, Any]]) -> list[PropertyCard]:
		"""Convert raw property data to PropertyCard list."""
		cards = []
		for prop in properties[:3]:
			images = prop.get("images", [])
			image_url = ""
			for img in images:
				if img.get("isPrimary"):
					image_url = img.get("uri", "")
					break
			if not image_url and images:
				image_url = images[0].get("uri", "")

			prop_id = prop.get("id", "")
			title = prop.get("title", "Bất động sản")
			slug = f"{_to_slug(title)}-pr{prop_id}"

			cards.append(PropertyCard(
				id=prop_id,
				title=title,
				image=image_url,
				price=_format_price(prop.get("pricePerMonth")),
				district=prop.get("district", ""),
				city=prop.get("city", ""),
				slug=slug,
			))
		return cards

	def chat(self, user_id: str, question: str) -> dict[str, Any]:
		"""Main chat method with intent detection and property search."""
		# Call AI with the system prompt
		ai_answer, provider = self._call_ai(CHAT_SYSTEM_PROMPT, question)

		# Check if AI returned a search action
		action, clean_answer = self._extract_and_clean_action(ai_answer)
		properties: list[PropertyCard] = []

		if action and action.get("action") == "search_estate":
			params = action.get("params", {})
			# Search properties from estate-service
			raw_properties = self.estate_client.search_properties(params)

			if raw_properties:
				properties = self._build_property_cards(raw_properties)
				if not clean_answer:
					clean_answer = f"Tôi đã tìm thấy {len(properties)} bất động sản phù hợp cho bạn!"
				ai_answer = clean_answer
			else:
				if not clean_answer:
					clean_answer = "Xin lỗi, tôi không tìm thấy bất động sản phù hợp. Bạn có thể thử tìm với tiêu chí khác?"
				ai_answer = clean_answer

		return {
			"answer": ai_answer,
			"provider": provider,
			"properties": [p.model_dump() for p in properties],
		}


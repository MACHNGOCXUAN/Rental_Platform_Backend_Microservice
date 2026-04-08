import json
from typing import Any

from app.constants.prompts import CHAT_SYSTEM_PROMPT
from app.core.config import settings
from app.integrations.contract_client import ContractClient
from app.integrations.estate_client import EstateClient
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider


class ChatService:
	def __init__(self) -> None:
		self.estate_client = EstateClient(settings.estate_service_base_url)
		self.contract_client = ContractClient(settings.contract_service_base_url)

		self.openai_provider = OpenAIProvider(settings.openai_api_key)
		self.gemini_provider = GeminiProvider(settings.gemini_api_key)

	def _build_user_prompt(
		self, user_id: str, question: str, estates: list[dict[str, Any]], contracts: list[dict[str, Any]]
	) -> str:
		context = {
			"userId": user_id,
			"estates": estates,
			"contracts": contracts,
			"question": question,
		}
		return json.dumps(context, ensure_ascii=False, indent=2)

	def chat(self, user_id: str, question: str) -> dict[str, str]:
		estates = self.estate_client.get_estates(user_id)
		contracts = self.contract_client.get_contracts(user_id)

		user_prompt = self._build_user_prompt(user_id, question, estates, contracts)

		try:
			answer = self.openai_provider.chat(
				model=settings.chat_model_openai,
				system_prompt=CHAT_SYSTEM_PROMPT,
				user_prompt=user_prompt,
			)
			return {"answer": answer, "provider": "openai"}
		except Exception:
			try:
				answer = self.gemini_provider.chat(
					model=settings.chat_model_gemini,
					system_prompt=CHAT_SYSTEM_PROMPT,
					user_prompt=user_prompt,
				)
				return {"answer": answer, "provider": "gemini"}
			except Exception:
				fallback_answer = (
					"I cannot reach AI providers right now. "
					f"Loaded context: {len(estates)} estates and {len(contracts)} contracts. "
					"Please retry in a moment."
				)
				return {"answer": fallback_answer, "provider": "fallback"}

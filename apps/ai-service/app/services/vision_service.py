from fastapi import UploadFile

from app.constants.prompts import VISION_PROMPT
from app.core.config import settings
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider
from app.utils.image_utils import to_base64


class VisionService:
	def __init__(self) -> None:
		self.openai_provider = OpenAIProvider(settings.openai_api_key)
		self.gemini_provider = GeminiProvider(settings.gemini_api_key)

	async def describe_image(self, file: UploadFile) -> dict[str, str]:
		file_bytes = await file.read()
		if not file_bytes:
			raise ValueError("Image file is empty")

		content_type = file.content_type or "image/jpeg"
		image_base64 = to_base64(file_bytes)

		try:
			description = self.openai_provider.describe_image(
				model=settings.vision_model_openai,
				prompt=VISION_PROMPT,
				image_base64=image_base64,
				mime_type=content_type,
			)
			return {"description": description, "provider": "openai"}
		except Exception:
			try:
				description = self.gemini_provider.describe_image(
					model=settings.vision_model_gemini,
					prompt=VISION_PROMPT,
					image_base64=image_base64,
					mime_type=content_type,
				)
				return {"description": description, "provider": "gemini"}
			except Exception:
				fallback_description = (
					"This property image appears suitable for listing. "
					"Highlight key selling points such as room layout, natural lighting, "
					"furniture condition, and nearby amenities."
				)
				return {"description": fallback_description, "provider": "fallback"}

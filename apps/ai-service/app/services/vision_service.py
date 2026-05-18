import logging
import requests

logger = logging.getLogger(__name__)
from fastapi import UploadFile

from app.constants.prompts import GENERATE_DESCRIPTION_PROMPT, VISION_PROMPT
from app.core.config import settings
from app.integrations.estate_client import EstateClient
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider
from app.schemas.vision_schema import GenerateDescriptionRequest
from app.utils.image_utils import to_base64

PROPERTY_TYPE_LABELS = {
	"apartment": "Căn hộ",
	"house": "Nhà nguyên căn",
	"land": "Đất",
	"office": "Văn phòng",
	"room": "Phòng trọ",
}

FURNITURE_LABELS = {
	"none": "Không nội thất",
	"basic": "Nội thất cơ bản",
	"full": "Nội thất đầy đủ",
}

TONE_LABELS = {
	"professional": "chuyên nghiệp, đáng tin cậy",
	"friendly": "thân thiện, gần gũi, vui vẻ",
	"luxury": "sang trọng, đẳng cấp, cao cấp",
	"simple": "đơn giản, ngắn gọn, súc tích",
}

LENGTH_MAP = {
	"short": "khoảng 80-120 từ",
	"medium": "khoảng 150-250 từ",
	"long": "khoảng 300-450 từ",
}


class VisionService:
	def __init__(self) -> None:
		self.openai_provider = OpenAIProvider(settings.openai_api_key)
		self.gemini_provider = GeminiProvider(settings.gemini_api_key)
		self.estate_client = EstateClient(settings.estate_service_base_url)

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

	def _fetch_reference_descriptions(self, property_type: str) -> str:
		"""Fetch 2-3 sample descriptions from DB for reference."""
		try:
			properties = self.estate_client.search_properties({
				"propertyType": property_type,
			})
			descriptions = []
			for p in properties[:2]:
				desc = p.get("description", "")
				if desc and len(desc) > 50:
					descriptions.append(desc[:300])
			if descriptions:
				return "\n---\n".join(descriptions)
		except Exception:
			pass
		return "Không có mẫu tham khảo."

	def _describe_images_from_urls(self, image_urls: list[str]) -> str:
		"""Download and describe up to 2 images."""
		descriptions = []
		for url in image_urls[:2]:
			try:
				resp = requests.get(url, timeout=8)
				if resp.status_code != 200:
					continue
				image_base64 = to_base64(resp.content)
				content_type = resp.headers.get("content-type", "image/jpeg")
				try:
					desc = self.openai_provider.describe_image(
						model=settings.vision_model_openai,
						prompt="Mô tả ngắn gọn hình ảnh bất động sản này bằng Tiếng Việt (2-3 câu):",
						image_base64=image_base64,
						mime_type=content_type,
					)
				except Exception:
					desc = self.gemini_provider.describe_image(
						model=settings.vision_model_gemini,
						prompt="Mô tả ngắn gọn hình ảnh bất động sản này bằng Tiếng Việt (2-3 câu):",
						image_base64=image_base64,
						mime_type=content_type,
					)
				if desc:
					descriptions.append(desc)
			except Exception:
				continue
		return "; ".join(descriptions) if descriptions else ""

	async def generate_description(self, req: GenerateDescriptionRequest) -> dict[str, str]:
		"""Generate property description using AI with context from DB and images."""
		# Get image descriptions if URLs provided
		image_desc = ""
		if req.imageUrls:
			image_desc = self._describe_images_from_urls(req.imageUrls)

		# Get reference descriptions from DB
		reference = self._fetch_reference_descriptions(req.propertyType)

		# Build prompt
		prompt = GENERATE_DESCRIPTION_PROMPT.format(
			property_type=PROPERTY_TYPE_LABELS.get(req.propertyType, req.propertyType),
			title=req.title or "Chưa có tiêu đề",
			area=req.areaSqm or "N/A",
			bedrooms=req.bedrooms or 0,
			bathrooms=req.bathrooms or 0,
			address=req.address or "Chưa có",
			district=req.district or "Chưa có",
			city=req.city or "Chưa có",
			price=f"{req.pricePerMonth:,.0f}" if req.pricePerMonth else "Thương lượng",
			deposit=f"{req.depositAmount:,.0f}" if req.depositAmount else "Thương lượng",
			furniture=FURNITURE_LABELS.get(req.furnitureStatus, req.furnitureStatus),
			amenities=", ".join(req.amenities) if req.amenities else "Không rõ",
			image_description=f"\nMÔ TẢ ẢNH:\n{image_desc}" if image_desc else "",
			reference_descriptions=reference,
			tone=TONE_LABELS.get(req.tone, "chuyên nghiệp"),
			length=LENGTH_MAP.get(req.length, "khoảng 150-250 từ"),
			emoji_instruction="Có thể sử dụng emoji phù hợp" if req.includeEmoji else "KHÔNG sử dụng emoji",
		)

		# Call AI
		try:
			description = self.openai_provider.chat(
				model=settings.chat_model_openai,
				system_prompt="Bạn là chuyên gia viết mô tả bất động sản cho thuê tại Việt Nam.",
				user_prompt=prompt,
			)
			return {"description": description.strip(), "provider": "openai"}
		except Exception as e_openai:
			logger.warning("[VisionService] OpenAI chat failed: %s", e_openai)
			try:
				description = self.gemini_provider.chat(
					model=settings.chat_model_gemini,
					system_prompt="Bạn là chuyên gia viết mô tả bất động sản cho thuê tại Việt Nam.",
					user_prompt=prompt,
				)
				return {"description": description.strip(), "provider": "gemini"}
			except Exception as e_gemini:
				logger.error("[VisionService] Gemini chat also failed: %s — using fallback", e_gemini)
				return {
					"description": self._fallback_description(req),
					"provider": "fallback",
				}

	@staticmethod
	def _fallback_description(req: GenerateDescriptionRequest) -> str:
		"""Fallback khi AI không khả dụng — tạo mô tả có văn phong từ dữ liệu có sẵn."""
		pt = PROPERTY_TYPE_LABELS.get(req.propertyType, "bất động sản")
		furniture = FURNITURE_LABELS.get(req.furnitureStatus, "cơ bản").lower()
		location_parts = [p for p in [req.address, req.district, req.city] if p]
		location_str = ", ".join(location_parts) if location_parts else "vị trí thuận tiện"

		# Đoạn 1 – Tổng quan
		para1_parts = [f"{pt} diện tích {req.areaSqm}m²" if req.areaSqm else pt]
		if req.bedrooms and req.bathrooms:
			para1_parts.append(f"với {req.bedrooms} phòng ngủ, {req.bathrooms} phòng tắm")
		elif req.bedrooms:
			para1_parts.append(f"với {req.bedrooms} phòng ngủ")
		para1 = f"Chào mừng bạn đến với {' '.join(para1_parts)} tọa lạc tại {location_str}. "
		para1 += f"Không gian được trang bị {furniture}, mang đến sự thoải mái và tiện nghi cho người thuê."

		# Đoạn 2 – Tiện ích
		para2 = ""
		if req.amenities:
			amenity_str = ", ".join(req.amenities[:6])
			para2 = f" Bất động sản được trang bị đầy đủ các tiện ích nổi bật: {amenity_str} — đáp ứng mọi nhu cầu sinh hoạt hàng ngày."

		# Đoạn 3 – Giá và CTA
		para3 = ""
		if req.pricePerMonth:
			para3 = f" Mức giá thuê hấp dẫn chỉ {req.pricePerMonth:,.0f} VNĐ/tháng"
			if req.depositAmount:
				para3 += f", đặt cọc {req.depositAmount:,.0f} VNĐ"
			para3 += ". Đây là cơ hội lý tưởng cho những ai đang tìm kiếm không gian sống chất lượng với mức chi phí hợp lý. Liên hệ ngay để đặt lịch xem nhà!"

		return (para1 + para2 + para3).strip()

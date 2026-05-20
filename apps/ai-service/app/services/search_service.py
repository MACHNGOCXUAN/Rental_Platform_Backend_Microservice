import json
import re
import unicodedata
from typing import Any

from app.constants.prompts import SEARCH_AGENT_PROMPT
from app.core.config import settings
from app.integrations.estate_client import EstateClient
from app.providers.gemini_provider import GeminiProvider
from app.providers.groq_provider import GroqProvider
from app.providers.openai_provider import OpenAIProvider
from app.schemas.search_schema import ExtractedFilters, InstantSearchPropertyCard
from app.services.search_history import search_history


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


# Valid property types matching Prisma enum
_VALID_PROPERTY_TYPES = {"apartment", "house", "room", "office", "land"}


class SearchService:
    def __init__(self) -> None:
        self.estate_client = EstateClient(settings.estate_service_base_url)

        self.openai_provider = OpenAIProvider(settings.openai_api_key)
        self.gemini_provider = GeminiProvider(settings.gemini_api_key)
        self.groq_provider = (
            GroqProvider(settings.groq_api_key) if settings.groq_api_key else None
        )

    def _call_ai(self, system_prompt: str, user_prompt: str) -> tuple[str, str]:
        """Try OpenAI → Gemini → Groq, return (answer, provider)."""
        providers = [
            (
                "openai",
                lambda: self.openai_provider.chat(
                    model=settings.chat_model_openai,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                ),
            ),
            (
                "gemini",
                lambda: self.gemini_provider.chat(
                    model=settings.chat_model_gemini,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                ),
            ),
        ]
        if self.groq_provider:
            providers.append(
                (
                    "groq",
                    lambda: self.groq_provider.chat(
                        model=settings.chat_model_groq,
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                    ),
                )
            )

        for provider_name, call_fn in providers:
            try:
                answer = call_fn()
                if answer and answer.strip():
                    return answer, provider_name
            except Exception as e:
                print(f"[SearchService] {provider_name} failed: {e}")
                continue

        return "", "fallback"

    def _parse_agent_response(self, raw: str) -> dict[str, Any]:
        """Extract JSON from AI response, handling markdown code blocks."""
        text = raw.strip()

        # Remove markdown code fences if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```\s*$", "", text)

        # Try to find JSON object in the text
        start = text.find("{")
        if start == -1:
            return {}

        depth = 0
        for i, ch in enumerate(text[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start : i + 1])
                    except json.JSONDecodeError:
                        return {}
        return {}

    def _sanitize_filters(self, raw_filters: dict[str, Any]) -> ExtractedFilters:
        """Validate and sanitize extracted filters to match estate-service DTOs."""
        prop_type = raw_filters.get("propertyType")
        if prop_type and prop_type not in _VALID_PROPERTY_TYPES:
            prop_type = None

        bedrooms = raw_filters.get("bedrooms") or raw_filters.get("min_bedrooms")
        if bedrooms is not None:
            try:
                bedrooms = int(bedrooms)
            except (ValueError, TypeError):
                bedrooms = None

        price_max = raw_filters.get("priceMax") or raw_filters.get("max_price")
        if price_max is not None:
            try:
                price_max = float(price_max)
            except (ValueError, TypeError):
                price_max = None

        price_min = raw_filters.get("priceMin") or raw_filters.get("min_price")
        if price_min is not None:
            try:
                price_min = float(price_min)
            except (ValueError, TypeError):
                price_min = None

        return ExtractedFilters(
            propertyType=prop_type,
            district=raw_filters.get("district"),
            city=raw_filters.get("city"),
            priceMax=price_max,
            priceMin=price_min,
            bedrooms=bedrooms,
            keyword=raw_filters.get("keyword"),
        )

    def _build_property_cards(
        self, properties: list[dict[str, Any]]
    ) -> list[InstantSearchPropertyCard]:
        """Convert raw estate-service data to compact property cards."""
        cards: list[InstantSearchPropertyCard] = []
        for prop in properties[:5]:
            images = prop.get("images", [])
            image_url = ""
            for img in images:
                if img.get("isPrimary"):
                    image_url = img.get("uri", "")
                    break
            if not image_url and images:
                image_url = images[0].get("uri", "")

            prop_id = prop.get("id", prop.get("propertyId", ""))
            title = prop.get("title", "Bất động sản")
            slug = f"{_to_slug(title)}-pr{prop_id}"

            cards.append(
                InstantSearchPropertyCard(
                    id=prop_id,
                    title=title,
                    image=image_url,
                    price=_format_price(
                        prop.get("pricePerMonth", prop.get("price_per_month"))
                    ),
                    district=prop.get("district", ""),
                    city=prop.get("city", ""),
                    slug=slug,
                )
            )
        return cards

    def _search_estate(self, query: str, filters: ExtractedFilters) -> list[dict[str, Any]]:
        """Query estate-service using extracted filters."""
        filter_dict: dict[str, Any] = {}
        if filters.keyword:
            filter_dict["keyword"] = filters.keyword
        if filters.propertyType:
            filter_dict["propertyType"] = filters.propertyType
        if filters.district:
            filter_dict["district"] = filters.district
        if filters.city:
            filter_dict["city"] = filters.city
        if filters.priceMin is not None:
            filter_dict["priceMin"] = filters.priceMin
        if filters.priceMax is not None:
            filter_dict["priceMax"] = filters.priceMax
        if filters.bedrooms is not None:
            filter_dict["bedrooms"] = filters.bedrooms

        return self.estate_client.instant_search_properties(query, filter_dict)

    def instant_search(
        self, query: str, mode: str = "home"
    ) -> dict[str, Any]:
        """
        Main instant search method.
        - mode='home': returns keywords only
        - mode='search': returns keywords + property cards + filters
        """
        # 1. Get search history for prompt context
        history_text = search_history.get_history_for_prompt(limit=15)

        # 2. Build prompt and call LLM
        prompt = SEARCH_AGENT_PROMPT.format(
            search_history=history_text, user_input=query
        )
        ai_response, provider = self._call_ai(prompt, query)

        # 3. Parse AI response
        agent_data = self._parse_agent_response(ai_response)
        keywords = agent_data.get("predicted_next_words", [])
        raw_filters = agent_data.get("extracted_filters", {})

        # Ensure keywords is a list of strings
        if not isinstance(keywords, list):
            keywords = []
        keywords = [str(k) for k in keywords if k][:3]

        # 4. Sanitize filters
        filters = self._sanitize_filters(raw_filters) if raw_filters else None

        # 5. If search mode, query estate-service for properties
        properties: list[InstantSearchPropertyCard] = []
        if mode == "search" and filters:
            try:
                raw_properties = self._search_estate(query, filters)
                if raw_properties:
                    properties = self._build_property_cards(raw_properties)
            except Exception as e:
                print(f"[SearchService] Estate search failed: {e}")

        # 6. Save query to search history (async-safe with threading)
        try:
            search_history.add_search(query)
        except Exception as e:
            print(f"[SearchService] Failed to save search history: {e}")

        result: dict[str, Any] = {"keywords": keywords}
        if mode == "search":
            result["properties"] = [p.model_dump() for p in properties]
            result["filters"] = filters.model_dump() if filters else None

        return result

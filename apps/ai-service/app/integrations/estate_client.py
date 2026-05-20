from typing import Any

import requests


class EstateClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def get_estates(self, user_id: str) -> list[dict[str, Any]]:
        candidate_paths = ["/estates", "/api/v1/estates"]

        for path in candidate_paths:
            try:
                url = f"{self.base_url}{path}"
                response = requests.get(url, params={"userId": user_id}, timeout=10)
                if response.status_code >= 400:
                    continue

                payload = response.json()
                if isinstance(payload, list):
                    return payload
                if isinstance(payload, dict):
                    for key in ("data", "items", "estates"):
                        if isinstance(payload.get(key), list):
                            return payload[key]
            except requests.RequestException:
                continue
        return []

    def search_properties(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        """Search properties using estate-service search API."""
        search_paths = ["/properties/search", "/estate/properties/search"]

        query_params: dict[str, Any] = {"limit": 3}
        if params.get("keyword"):
            query_params["keyword"] = params["keyword"]
        if params.get("district"):
            query_params["district"] = params["district"]
        if params.get("city"):
            query_params["city"] = params["city"]
        if params.get("priceMin") is not None:
            query_params["priceMin"] = params["priceMin"]
        if params.get("priceMax") is not None:
            query_params["priceMax"] = params["priceMax"]
        if params.get("propertyType"):
            query_params["propertyType"] = params["propertyType"]
        if params.get("bedrooms") is not None:
            query_params["bedrooms"] = params["bedrooms"]

        for path in search_paths:
            try:
                url = f"{self.base_url}{path}"
                response = requests.get(url, params=query_params, timeout=10)
                if response.status_code >= 400:
                    continue

                payload = response.json()
                # Handle nested: { data: { data: [...] } }
                if isinstance(payload, dict):
                    outer = payload.get("data")
                    if isinstance(outer, dict):
                        inner = outer.get("data")
                        if isinstance(inner, list):
                            return inner[:3]
                    if isinstance(outer, list):
                        return outer[:3]
                if isinstance(payload, list):
                    return payload[:3]
            except requests.RequestException:
                continue
        return []

    def instant_search_properties(
        self, query: str, filters: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Search properties using the instant-search POST endpoint."""
        instant_paths = [
            "/properties/instant-search",
            "/estate/properties/instant-search",
        ]

        body = {"q": query, "filters": filters}

        for path in instant_paths:
            try:
                url = f"{self.base_url}{path}"
                response = requests.post(url, json=body, timeout=3)
                if response.status_code >= 400:
                    continue

                payload = response.json()
                if isinstance(payload, dict):
                    data = payload.get("data")
                    if isinstance(data, list):
                        return data[:5]
                if isinstance(payload, list):
                    return payload[:5]
            except requests.RequestException:
                continue

        # Fallback to regular search
        return self.search_properties({**filters, "limit": 5})

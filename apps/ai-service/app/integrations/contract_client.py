from typing import Any

import requests


class ContractClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def get_contracts(self, user_id: str) -> list[dict[str, Any]]:
        candidate_paths = ["/contracts", "/api/v1/contracts"]

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
                    for key in ("data", "items", "contracts"):
                        if isinstance(payload.get(key), list):
                            return payload[key]
            except requests.RequestException:
                continue
        return []

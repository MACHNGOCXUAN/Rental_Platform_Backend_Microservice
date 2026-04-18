import requests


class GroqProvider:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("GROQ_API_KEY is missing")
        self.api_key = api_key
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

    def chat(self, model: str, system_prompt: str, user_prompt: str) -> str:
        response = requests.post(
            self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt[-6000:]},
                ],
                "temperature": 0.3,
                "max_tokens": 1000,
            },
            timeout=30,
        )
        data = response.json()

        if "error" in data:
            raise RuntimeError(f"Groq API error: {data['error'].get('message', str(data['error']))}")

        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not text.strip():
            raise RuntimeError("Groq returned empty response")
        return text

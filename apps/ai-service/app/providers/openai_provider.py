from openai import OpenAI


class OpenAIProvider:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("OPENAI_API_KEY is missing")
        self.client = OpenAI(api_key=api_key)

    def chat(self, model: str, system_prompt: str, user_prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return response.choices[0].message.content or ""

    def describe_image(
        self, model: str, prompt: str, image_base64: str, mime_type: str = "image/jpeg"
    ) -> str:
        response = self.client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_base64}",
                            },
                        },
                    ],
                }
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or ""

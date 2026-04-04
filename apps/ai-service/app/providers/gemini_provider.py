import base64

import google.generativeai as genai


class GeminiProvider:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("GEMINI_API_KEY is missing")
        genai.configure(api_key=api_key)

    def chat(self, model: str, system_prompt: str, user_prompt: str) -> str:
        model_name = model if model.startswith("models/") else f"models/{model}"
        gemini_model = genai.GenerativeModel(model_name)
        response = gemini_model.generate_content(
            f"System instruction: {system_prompt}\n\nUser request:\n{user_prompt}"
        )
        return getattr(response, "text", "") or ""

    def describe_image(
        self, model: str, prompt: str, image_base64: str, mime_type: str = "image/jpeg"
    ) -> str:
        model_name = model if model.startswith("models/") else f"models/{model}"
        gemini_model = genai.GenerativeModel(model_name)
        image_bytes = base64.b64decode(image_base64)
        response = gemini_model.generate_content(
            [prompt, {"mime_type": mime_type, "data": image_bytes}]
        )
        return getattr(response, "text", "") or ""

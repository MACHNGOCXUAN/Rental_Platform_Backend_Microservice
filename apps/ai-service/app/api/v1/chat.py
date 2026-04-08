from fastapi import APIRouter, HTTPException

from app.schemas.chat_schema import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

router = APIRouter()
chat_service = ChatService()


@router.post("/chat", response_model=ChatResponse)
def chat_with_ai(payload: ChatRequest) -> ChatResponse:
	try:
		result = chat_service.chat(user_id=payload.userId, question=payload.message)
		return ChatResponse(**result)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc

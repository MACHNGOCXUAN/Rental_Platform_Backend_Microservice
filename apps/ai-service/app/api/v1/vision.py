from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.vision_schema import (
	GenerateDescriptionRequest,
	GenerateDescriptionResponse,
	VisionDescribeResponse,
)
from app.services.vision_service import VisionService

router = APIRouter()
vision_service = VisionService()


@router.post("/vision/describe", response_model=VisionDescribeResponse)
async def describe_property_image(file: UploadFile = File(...)) -> VisionDescribeResponse:
	try:
		result = await vision_service.describe_image(file)
		return VisionDescribeResponse(**result)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/vision/generate-description", response_model=GenerateDescriptionResponse)
async def generate_property_description(
	payload: GenerateDescriptionRequest,
) -> GenerateDescriptionResponse:
	try:
		result = await vision_service.generate_description(payload)
		return GenerateDescriptionResponse(**result)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc

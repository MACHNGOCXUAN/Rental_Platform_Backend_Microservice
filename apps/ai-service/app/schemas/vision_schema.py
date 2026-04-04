from pydantic import BaseModel


class VisionDescribeResponse(BaseModel):
	description: str
	provider: str

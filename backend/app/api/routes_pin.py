from fastapi import APIRouter

from app.dependencies import get_pin_service
from app.schemas.pin import PinSequenceRequest, PinSequenceResponse

router = APIRouter(prefix="/pin", tags=["pin"])


@router.post("/sequence", response_model=PinSequenceResponse)
async def sequence_pin(request: PinSequenceRequest) -> PinSequenceResponse:
    return get_pin_service().plan_sequence(request)

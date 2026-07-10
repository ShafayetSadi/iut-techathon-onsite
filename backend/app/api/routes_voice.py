from fastapi import APIRouter

from app.dependencies import get_voice_service
from app.schemas.voice import VoiceCommandRequest, VoiceCommandResponse

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/command", response_model=VoiceCommandResponse)
async def voice_command(request: VoiceCommandRequest) -> VoiceCommandResponse:
    return get_voice_service().interpret(request)

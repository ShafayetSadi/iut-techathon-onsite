from fastapi import APIRouter, File, UploadFile

from app.core.config import get_settings
from app.core.errors import ValidationError
from app.dependencies import get_voice_service
from app.schemas.voice import TranscriptionResponse

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe(audio: UploadFile = File(...)) -> TranscriptionResponse:
    limit = get_settings().max_audio_bytes
    if audio.size is not None and audio.size > limit:
        raise ValidationError(f"Audio upload exceeds the {limit // (1024 * 1024)}MB limit.")

    return await get_voice_service().transcribe(
        await audio.read(),
        audio.filename or "audio.webm",
        audio.content_type or "application/octet-stream",
    )

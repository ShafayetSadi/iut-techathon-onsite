from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.errors import ValidationError
from app.schemas.voice import TranscriptionResponse


class VoiceService:
    """Speech-to-text only.

    Transcripts are returned and forgotten — nothing is stored here. Mapping an
    utterance onto a MotionCommand happens in the frontend, where the command
    union and the deterministic safety gate are already defined.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def transcribe(self, audio: bytes, filename: str, content_type: str) -> TranscriptionResponse:
        if not self.settings.elevenlabs_api_key:
            raise ValidationError(
                "Speech-to-text is not configured: set ROBOT_ELEVENLABS_API_KEY on the backend."
            )
        if not audio:
            raise ValidationError("Audio upload is empty.")
        if len(audio) > self.settings.max_audio_bytes:
            limit_mb = self.settings.max_audio_bytes // (1024 * 1024)
            raise ValidationError(f"Audio upload exceeds the {limit_mb}MB limit.")

        try:
            async with httpx.AsyncClient(timeout=self.settings.elevenlabs_timeout_s) as client:
                response = await client.post(
                    self.settings.elevenlabs_stt_url,
                    headers={"xi-api-key": self.settings.elevenlabs_api_key},
                    data={"model_id": self.settings.elevenlabs_stt_model},
                    files={"file": (filename, audio, content_type)},
                )
        except httpx.HTTPError as exc:
            raise ValidationError(f"Speech-to-text request failed: {exc}") from exc

        if response.status_code >= 400:
            raise ValidationError(
                f"Speech-to-text provider returned {response.status_code}: {response.text[:200]}"
            )

        payload = response.json()
        return TranscriptionResponse(
            transcript=(payload.get("text") or "").strip(),
            language_code=payload.get("language_code"),
        )

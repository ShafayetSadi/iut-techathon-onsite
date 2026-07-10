from __future__ import annotations

import logging

import httpx

from app.core.config import Settings
from app.core.errors import ValidationError
from app.schemas.voice import TranscriptionResponse
from app.voice.keyterms import KEYTERMS

logger = logging.getLogger(__name__)

# Provider error codes we translate into something an operator can act on.
_AUDIO_TOO_SHORT = "audio_too_short"

# Verified against the live API: scribe_v1 answers a keyterms request with
# "The 'keyterms' parameter is only supported with the 'scribe_v2' model."
# Sending it anyway would cost a rejected round trip on every single utterance.
_KEYTERMS_MODEL_PREFIX = "scribe_v2"


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

        keyterms = list(KEYTERMS) if self._keyterms_supported() else None

        try:
            async with httpx.AsyncClient(timeout=self.settings.elevenlabs_timeout_s) as client:
                response = await self._post(client, audio, filename, content_type, keyterms)

                # Belt and braces. `_keyterms_supported` already spares the known
                # rejection, but any non-2xx raises below — so a model that starts
                # refusing the parameter would fail every utterance rather than one.
                if keyterms and _rejects_keyterms(response):
                    logger.warning(
                        "Speech-to-text rejected keyterms (%s); retrying without them. "
                        "Set ROBOT_ELEVENLABS_KEYTERMS_ENABLED=false to skip this round trip.",
                        self.settings.elevenlabs_stt_model,
                    )
                    response = await self._post(client, audio, filename, content_type, None)
        except httpx.HTTPError as exc:
            raise ValidationError(f"Speech-to-text request failed: {exc}") from exc

        if response.status_code >= 400:
            raise ValidationError(_provider_error(response))

        payload = response.json()
        return TranscriptionResponse(
            transcript=(payload.get("text") or "").strip(),
            language_code=payload.get("language_code"),
        )

    def _keyterms_supported(self) -> bool:
        return (
            self.settings.elevenlabs_keyterms_enabled
            and self.settings.elevenlabs_stt_model.startswith(_KEYTERMS_MODEL_PREFIX)
        )

    async def _post(
        self,
        client: httpx.AsyncClient,
        audio: bytes,
        filename: str,
        content_type: str,
        keyterms: list[str] | None,
    ) -> httpx.Response:
        # httpx renders a list value as one repeated part per item, which is how
        # the official SDK sends keyterms. Booleans are spelled out rather than
        # left to str(bool), which would send "False".
        data: dict[str, object] = {
            "model_id": self.settings.elevenlabs_stt_model,
            "tag_audio_events": "true" if self.settings.elevenlabs_tag_audio_events else "false",
        }
        if self.settings.elevenlabs_language_code:
            data["language_code"] = self.settings.elevenlabs_language_code
        if keyterms:
            data["keyterms"] = keyterms

        return await client.post(
            self.settings.elevenlabs_stt_url,
            headers={"xi-api-key": self.settings.elevenlabs_api_key},
            data=data,
            files={"file": (filename, audio, content_type)},
        )


def _rejects_keyterms(response: httpx.Response) -> bool:
    """A 400 that names the parameter, rather than any 400 — an unplayable clip
    must not be retried."""
    return response.status_code == 400 and "keyterm" in response.text.lower()


def _provider_error(response: httpx.Response) -> str:
    """Pull the human sentence out of ElevenLabs' error envelope.

    Their failures arrive as {"detail": {"status": ..., "message": ...}}, and
    rendering that raw put a wall of JSON in the operator's transcript log.
    """
    detail: object = None
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        detail = payload.get("detail")

    if isinstance(detail, dict):
        if detail.get("status") == _AUDIO_TOO_SHORT or detail.get("code") == _AUDIO_TOO_SHORT:
            return "Audio was too short — hold the button while you speak."
        message = detail.get("message")
        if isinstance(message, str) and message:
            return f"Speech-to-text failed ({response.status_code}): {message}"
    if isinstance(detail, str) and detail:
        return f"Speech-to-text failed ({response.status_code}): {detail}"

    return f"Speech-to-text failed ({response.status_code}): {response.text[:200]}"

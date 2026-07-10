from app.schemas.voice import VoiceCommandRequest, VoiceCommandResponse


class VoiceService:
    def interpret(self, request: VoiceCommandRequest) -> VoiceCommandResponse:
        normalized = request.transcript.strip().lower()
        return VoiceCommandResponse(
            success=False,
            transcript=request.transcript,
            interpretedCommand=None,
            message=f"Voice scaffold received {normalized!r}; deterministic command mapping will be wired in Phase 3.",
        )


from app.schemas.pin import PinSequenceRequest, PinSequenceResponse


class PinService:
    def plan_sequence(self, request: PinSequenceRequest) -> PinSequenceResponse:
        return PinSequenceResponse(
            success=False,
            pin=request.pin,
            message="PIN sequencing scaffold is ready; implement approach, touch, and retract trajectories after Phase 2 IK is connected.",
            plannedDigits=list(request.pin),
        )


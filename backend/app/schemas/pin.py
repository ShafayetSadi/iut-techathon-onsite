from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Vector3
from app.schemas.motion import TrajectoryPoint


class PinSequenceRequest(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6, pattern=r"^[1-6]{6}$")
    current_joints: dict[str, float] | None = Field(default=None, alias="currentJoints")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class PinSequenceStep(BaseModel):
    index: int
    digit: str
    key_position: Vector3 = Field(alias="keyPosition")
    approach_target: Vector3 = Field(alias="approachTarget")
    touch_target: Vector3 = Field(alias="touchTarget")
    retract_target: Vector3 = Field(alias="retractTarget")
    touch_error_meters: float | None = Field(default=None, alias="touchErrorMeters")
    pressed: bool
    trajectory: list[TrajectoryPoint] = Field(default_factory=list)
    message: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class PinSequenceResponse(BaseModel):
    success: bool
    pin: str
    message: str
    planned_digits: list[str] = Field(alias="plannedDigits")
    tolerance_meters: float = Field(alias="toleranceMeters")
    approach_offset_meters: float = Field(alias="approachOffsetMeters")
    steps: list[PinSequenceStep] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)

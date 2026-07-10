from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import Vector3


class IKSolveRequest(BaseModel):
    target: Vector3
    current_joints: dict[str, float] | None = Field(default=None, alias="currentJoints")
    tolerance_meters: float | None = Field(default=None, alias="toleranceMeters")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class TrajectoryPoint(BaseModel):
    time_ms: int = Field(alias="timeMs")
    joints: dict[str, float]
    tip: dict[str, float]

    model_config = ConfigDict(populate_by_name=True)


class IKSolveResponse(BaseModel):
    success: bool
    joints: dict[str, float] | None = None
    tip: dict[str, float] | None = None
    error_meters: float | None = Field(default=None, alias="errorMeters")
    iterations: int | None = None
    trajectory: list[TrajectoryPoint] = []
    reason: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class JogRequest(BaseModel):
    current_joints: dict[str, float] = Field(alias="currentJoints")
    delta: Vector3

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class MotionCommandResponse(IKSolveResponse):
    command: str | None = None


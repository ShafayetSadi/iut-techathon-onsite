from pydantic import BaseModel, ConfigDict, Field


class PinSequenceRequest(BaseModel):
    pin: str = Field(..., min_length=6, max_length=6, pattern=r"^[1-6]{6}$")
    current_joints: dict[str, float] | None = Field(default=None, alias="currentJoints")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class PinSequenceResponse(BaseModel):
    success: bool
    pin: str
    message: str
    planned_digits: list[str] = Field(alias="plannedDigits")

    model_config = ConfigDict(populate_by_name=True)


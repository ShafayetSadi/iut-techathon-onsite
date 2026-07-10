from pydantic import BaseModel, ConfigDict, Field


class VoiceCommandRequest(BaseModel):
    transcript: str = Field(..., min_length=1)
    current_joints: dict[str, float] | None = Field(default=None, alias="currentJoints")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class VoiceCommandResponse(BaseModel):
    success: bool
    transcript: str
    interpreted_command: str | None = Field(default=None, alias="interpretedCommand")
    message: str

    model_config = ConfigDict(populate_by_name=True)


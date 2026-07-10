from pydantic import BaseModel, ConfigDict, Field


class Vector3(BaseModel):
    x: float = Field(..., description="X coordinate in meters")
    y: float = Field(..., description="Y coordinate in meters")
    z: float = Field(..., description="Z coordinate in meters")

    model_config = ConfigDict(extra="forbid")


class ErrorResponse(BaseModel):
    success: bool = False
    reason: str


from pydantic import BaseModel

from app.schemas.common import Vector3


class PanelKey(BaseModel):
    digit: str
    position: Vector3


class PanelKeysResponse(BaseModel):
    frame: str
    units: str
    approach_axis: str
    keys: list[PanelKey]


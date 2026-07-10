from __future__ import annotations

import json
from pathlib import Path

from app.core.errors import ValidationError
from app.schemas.common import Vector3
from app.schemas.panel import PanelKey, PanelKeysResponse


class PanelService:
    def __init__(self, config_path: Path) -> None:
        self.config_path = config_path.resolve()

    def get_config(self) -> dict[str, object]:
        if not self.config_path.exists():
            raise ValidationError(f"Panel config not found: {self.config_path}")
        return json.loads(self.config_path.read_text())

    def get_keys(self) -> PanelKeysResponse:
        data = self.get_config()
        keys = [
            PanelKey(digit=digit, position=Vector3(x=value["x"], y=value["y"], z=value["z"]))
            for digit, value in sorted(data["keys"].items())
        ]
        return PanelKeysResponse(
            frame=data.get("frame", "base_link"),
            units=data.get("units", "meters"),
            approach_axis=data.get("approach_axis", "-z"),
            keys=keys,
        )

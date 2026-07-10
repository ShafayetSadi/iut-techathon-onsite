from __future__ import annotations

import math

from app.core.errors import ValidationError
from app.schemas.common import Vector3


class SafetyValidator:
    def __init__(self, *, workspace_radius_m: float, min_z_m: float, max_z_m: float) -> None:
        self.workspace_radius_m = workspace_radius_m
        self.min_z_m = min_z_m
        self.max_z_m = max_z_m

    def validate_target(self, target: Vector3) -> None:
        values = (target.x, target.y, target.z)
        if not all(math.isfinite(value) for value in values):
            raise ValidationError("Target coordinates must be finite numbers")

        radius = math.sqrt(target.x * target.x + target.y * target.y + target.z * target.z)
        if radius > self.workspace_radius_m:
            raise ValidationError(f"Target is outside workspace radius {self.workspace_radius_m:.2f}m")
        if target.z < self.min_z_m or target.z > self.max_z_m:
            raise ValidationError(f"Target z must be between {self.min_z_m:.2f}m and {self.max_z_m:.2f}m")


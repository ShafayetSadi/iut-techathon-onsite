from __future__ import annotations

import math

from app.robot.urdf_loader import RobotModel


def clamp_joint_map(model: RobotModel, joints: dict[str, float]) -> dict[str, float]:
    limits = model.joint_limits()
    clamped: dict[str, float] = {}
    for name in model.controlled_joint_names:
        value = float(joints.get(name, 0.0))
        limit = limits[name]
        clamped[name] = min(max(value, limit.lower), limit.upper)
    return clamped


def joint_map_to_vector(model: RobotModel, joints: dict[str, float]) -> list[float]:
    clamped = clamp_joint_map(model, joints)
    return [clamped[name] for name in model.controlled_joint_names]


def vector_to_joint_map(model: RobotModel, values: list[float] | tuple[float, ...]) -> dict[str, float]:
    return {name: float(value) for name, value in zip(model.controlled_joint_names, values, strict=True)}


def normalize_angle(angle: float) -> float:
    return math.atan2(math.sin(angle), math.cos(angle))


from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from app.robot.urdf_loader import RobotModel


@dataclass(frozen=True)
class ForwardKinematicsResult:
    tip: np.ndarray
    transforms: dict[str, np.ndarray]


def forward_kinematics(model: RobotModel, joints: dict[str, float]) -> ForwardKinematicsResult:
    transform = np.eye(4)
    transforms: dict[str, np.ndarray] = {model.base_link: transform.copy()}

    for joint in model.chain:
        transform = transform @ transform_from_xyz_rpy(joint.origin_xyz, joint.origin_rpy)
        if joint.joint_type in {"revolute", "continuous"}:
            angle = joints.get(joint.name, 0.0)
            transform = transform @ rotation_about_axis(joint.axis, angle)
        transforms[joint.child] = transform.copy()

    return ForwardKinematicsResult(tip=transform[:3, 3].copy(), transforms=transforms)


def numerical_jacobian(
    model: RobotModel,
    joints: dict[str, float],
    joint_names: tuple[str, ...],
    *,
    epsilon: float = 1e-5,
) -> np.ndarray:
    jacobian = np.zeros((3, len(joint_names)), dtype=float)

    for index, name in enumerate(joint_names):
        plus = dict(joints)
        minus = dict(joints)
        plus[name] = plus.get(name, 0.0) + epsilon
        minus[name] = minus.get(name, 0.0) - epsilon
        p_plus = forward_kinematics(model, plus).tip
        p_minus = forward_kinematics(model, minus).tip
        jacobian[:, index] = (p_plus - p_minus) / (2.0 * epsilon)

    return jacobian


def transform_from_xyz_rpy(xyz: np.ndarray, rpy: np.ndarray) -> np.ndarray:
    transform = np.eye(4)
    transform[:3, :3] = rotation_from_rpy(float(rpy[0]), float(rpy[1]), float(rpy[2]))
    transform[:3, 3] = xyz
    return transform


def rotation_from_rpy(roll: float, pitch: float, yaw: float) -> np.ndarray:
    cr, sr = math.cos(roll), math.sin(roll)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cy, sy = math.cos(yaw), math.sin(yaw)

    rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]], dtype=float)
    ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]], dtype=float)
    rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]], dtype=float)
    return rz @ ry @ rx


def rotation_about_axis(axis: np.ndarray, angle: float) -> np.ndarray:
    axis = axis / np.linalg.norm(axis)
    x, y, z = axis
    c = math.cos(angle)
    s = math.sin(angle)
    one_minus_c = 1.0 - c
    rotation = np.array(
        [
            [c + x * x * one_minus_c, x * y * one_minus_c - z * s, x * z * one_minus_c + y * s],
            [y * x * one_minus_c + z * s, c + y * y * one_minus_c, y * z * one_minus_c - x * s],
            [z * x * one_minus_c - y * s, z * y * one_minus_c + x * s, c + z * z * one_minus_c],
        ],
        dtype=float,
    )
    transform = np.eye(4)
    transform[:3, :3] = rotation
    return transform


from __future__ import annotations

from app.robot.kinematics import forward_kinematics
from app.robot.urdf_loader import RobotModel
from app.schemas.motion import TrajectoryPoint


def build_joint_trajectory(
    model: RobotModel,
    start_joints: dict[str, float],
    end_joints: dict[str, float],
    *,
    steps: int,
    total_ms: int = 1200,
) -> list[TrajectoryPoint]:
    steps = max(2, steps)
    points: list[TrajectoryPoint] = []
    names = model.controlled_joint_names

    for index in range(steps):
        alpha = index / (steps - 1)
        eased = alpha * alpha * (3.0 - 2.0 * alpha)
        joints = {
            name: float(start_joints.get(name, 0.0) + (end_joints[name] - start_joints.get(name, 0.0)) * eased)
            for name in names
        }
        tip = forward_kinematics(model, joints).tip
        points.append(
            TrajectoryPoint(
                timeMs=round(total_ms * alpha),
                joints=joints,
                tip={"x": float(tip[0]), "y": float(tip[1]), "z": float(tip[2])},
            )
        )

    return points


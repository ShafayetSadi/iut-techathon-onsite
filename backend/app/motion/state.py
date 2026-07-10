from __future__ import annotations

from dataclasses import dataclass, field

from app.robot.kinematics import forward_kinematics
from app.robot.urdf_loader import RobotModel


@dataclass
class RobotStateStore:
    model: RobotModel
    joints: dict[str, float] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.joints:
            self.joints = self.model.neutral_pose()

    def get_joints(self) -> dict[str, float]:
        return dict(self.joints)

    def set_joints(self, joints: dict[str, float]) -> None:
        self.joints = {name: float(joints.get(name, 0.0)) for name in self.model.controlled_joint_names}

    def snapshot(self) -> dict[str, object]:
        tip = forward_kinematics(self.model, self.joints).tip
        return {
            "joints": self.get_joints(),
            "tip": {"x": float(tip[0]), "y": float(tip[1]), "z": float(tip[2])},
        }


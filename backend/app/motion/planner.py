from __future__ import annotations

import numpy as np

from app.motion.safety import SafetyValidator
from app.motion.trajectory import build_joint_trajectory
from app.robot.ik_solver import IKSolver
from app.robot.kinematics import forward_kinematics
from app.robot.limits import clamp_joint_map
from app.robot.urdf_loader import RobotModel
from app.schemas.common import Vector3
from app.schemas.motion import IKSolveResponse


class MotionPlanner:
    def __init__(
        self,
        model: RobotModel,
        solver: IKSolver,
        safety: SafetyValidator,
        *,
        trajectory_steps: int,
    ) -> None:
        self.model = model
        self.solver = solver
        self.safety = safety
        self.trajectory_steps = trajectory_steps

    def solve_target(self, target: Vector3, current_joints: dict[str, float] | None = None) -> IKSolveResponse:
        self.safety.validate_target(target)
        start = clamp_joint_map(self.model, current_joints or self.model.neutral_pose())
        result = self.solver.solve(np.array([target.x, target.y, target.z], dtype=float), start)
        trajectory = []
        if result.success:
            trajectory = build_joint_trajectory(self.model, start, result.joints, steps=self.trajectory_steps)

        return IKSolveResponse(
            success=result.success,
            joints=result.joints if result.success else None,
            tip={"x": float(result.tip[0]), "y": float(result.tip[1]), "z": float(result.tip[2])},
            errorMeters=result.error_meters,
            iterations=result.iterations,
            trajectory=trajectory,
            reason=result.reason,
        )

    def jog(self, current_joints: dict[str, float], delta: Vector3) -> IKSolveResponse:
        start = clamp_joint_map(self.model, current_joints)
        current_tip = forward_kinematics(self.model, start).tip
        target = Vector3(
            x=float(current_tip[0] + delta.x),
            y=float(current_tip[1] + delta.y),
            z=float(current_tip[2] + delta.z),
        )
        return self.solve_target(target, start)


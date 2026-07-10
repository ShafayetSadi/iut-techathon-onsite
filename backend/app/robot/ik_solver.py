from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from app.robot.kinematics import forward_kinematics, numerical_jacobian
from app.robot.limits import clamp_joint_map
from app.robot.urdf_loader import RobotModel


@dataclass(frozen=True)
class IKResult:
    success: bool
    joints: dict[str, float]
    tip: np.ndarray
    error_meters: float
    iterations: int
    reason: str | None = None


class IKSolver:
    def __init__(
        self,
        model: RobotModel,
        *,
        tolerance_m: float,
        max_iterations: int,
        damping: float,
    ) -> None:
        self.model = model
        self.tolerance_m = tolerance_m
        self.max_iterations = max_iterations
        self.damping = damping

    def solve(self, target: np.ndarray, current_joints: dict[str, float] | None = None) -> IKResult:
        seeds = self._build_seeds(target, current_joints)
        best: IKResult | None = None

        for seed in seeds:
            result = self._solve_from_seed(target, seed)
            if result.success:
                return result
            if best is None or result.error_meters < best.error_meters:
                best = result

        assert best is not None
        return IKResult(
            success=False,
            joints=best.joints,
            tip=best.tip,
            error_meters=best.error_meters,
            iterations=best.iterations,
            reason=f"IK did not converge within {self.tolerance_m:.3f}m tolerance",
        )

    def solve_local(
        self,
        target: np.ndarray,
        current_joints: dict[str, float],
        *,
        tolerance_m: float | None = None,
    ) -> IKResult:
        result = self._solve_from_seed(target, current_joints, tolerance_m=tolerance_m)
        if result.success:
            return result
        tolerance = tolerance_m if tolerance_m is not None else self.tolerance_m
        return IKResult(
            success=False,
            joints=result.joints,
            tip=result.tip,
            error_meters=result.error_meters,
            iterations=result.iterations,
            reason=f"IK did not converge within {tolerance:.3f}m tolerance",
        )

    def _solve_from_seed(
        self,
        target: np.ndarray,
        seed: dict[str, float],
        *,
        tolerance_m: float | None = None,
    ) -> IKResult:
        joints = clamp_joint_map(self.model, seed)
        names = self.model.controlled_joint_names
        limit_map = self.model.joint_limits()
        tolerance = tolerance_m if tolerance_m is not None else self.tolerance_m

        for iteration in range(1, self.max_iterations + 1):
            tip = forward_kinematics(self.model, joints).tip
            error = target - tip
            error_norm = float(np.linalg.norm(error))
            if error_norm <= tolerance:
                return IKResult(True, joints, tip, error_norm, iteration)

            jacobian = numerical_jacobian(self.model, joints, names)
            lhs = jacobian @ jacobian.T + (self.damping**2) * np.eye(3)
            delta = jacobian.T @ np.linalg.solve(lhs, error)
            delta = np.clip(delta, -0.18, 0.18)

            next_joints = {}
            for index, name in enumerate(names):
                limit = limit_map[name]
                value = joints[name] + float(delta[index])
                next_joints[name] = min(max(value, limit.lower), limit.upper)
            joints = next_joints

        tip = forward_kinematics(self.model, joints).tip
        error_norm = float(np.linalg.norm(target - tip))
        return IKResult(False, joints, tip, error_norm, self.max_iterations)

    def _build_seeds(
        self,
        target: np.ndarray,
        current_joints: dict[str, float] | None,
    ) -> list[dict[str, float]]:
        yaw = math.atan2(float(target[1]), float(target[0]))
        base = self.model.neutral_pose()
        seeds: list[dict[str, float]] = []

        if current_joints:
            current = dict(base)
            current.update(current_joints)
            seeds.append(current)

        # Multiple elbow-up/down postures make the position-only solver reliable
        # from cold starts and avoid depending on a single singular neutral pose.
        pitch_sets = [
            (1.15, 1.05, 0.0, 0.55),
            (0.75, 1.35, 0.0, 0.85),
            (1.45, -0.45, 0.0, 1.05),
            (0.35, 1.85, 0.0, -0.35),
            (-0.45, 1.75, 0.0, 0.95),
            (1.65, 0.65, 0.0, -1.0),
            (0.0, 0.0, 0.0, 0.0),
        ]

        for shoulder, elbow, wrist, stylus in pitch_sets:
            seed = dict(base)
            seed.update(
                {
                    "joint_1": yaw,
                    "joint_2": shoulder,
                    "joint_3": elbow,
                    "joint_4": 0.0,
                    "joint_5": wrist,
                    "joint_6": 0.0,
                    "stylus_pitch": stylus,
                }
            )
            seeds.append(seed)

        return [clamp_joint_map(self.model, seed) for seed in seeds]

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
        self.safety.validate_target(target)

        target_tip = np.array([target.x, target.y, target.z], dtype=float)
        result = self.solver.solve_local(target_tip, start)
        if result.success or self._is_acceptable_jog_near_miss(
            current_tip=current_tip,
            requested_delta=np.array([delta.x, delta.y, delta.z], dtype=float),
            result_tip=result.tip,
            error_meters=result.error_meters,
        ):
            trajectory = build_joint_trajectory(self.model, start, result.joints, steps=self.trajectory_steps)
            return IKSolveResponse(
                success=True,
                joints=result.joints,
                tip={"x": float(result.tip[0]), "y": float(result.tip[1]), "z": float(result.tip[2])},
                errorMeters=result.error_meters,
                iterations=result.iterations,
                trajectory=trajectory,
                reason=None,
            )

        if self._is_off_axis_jog_near_miss(
            current_tip=current_tip,
            requested_delta=np.array([delta.x, delta.y, delta.z], dtype=float),
            result_tip=result.tip,
            error_meters=result.error_meters,
        ):
            requested_m = float(np.linalg.norm(np.array([delta.x, delta.y, delta.z], dtype=float)))
            return IKSolveResponse(
                success=True,
                joints=start,
                tip={"x": float(current_tip[0]), "y": float(current_tip[1]), "z": float(current_tip[2])},
                errorMeters=requested_m,
                iterations=result.iterations,
                trajectory=[],
                reason="Jog blocked: requested direction is outside the arm's reachable workspace from this posture.",
            )

        return IKSolveResponse(
            success=False,
            joints=None,
            tip={"x": float(result.tip[0]), "y": float(result.tip[1]), "z": float(result.tip[2])},
            errorMeters=result.error_meters,
            iterations=result.iterations,
            trajectory=[],
            reason=result.reason,
        )

    def _is_acceptable_jog_near_miss(
        self,
        *,
        current_tip: np.ndarray,
        requested_delta: np.ndarray,
        result_tip: np.ndarray,
        error_meters: float,
    ) -> bool:
        requested_m = float(np.linalg.norm(requested_delta))
        if requested_m <= 0.0:
            return False

        actual_m = float(np.linalg.norm(result_tip - current_tip))
        jog_tolerance_m = max(self.solver.tolerance_m * 1.5, min(requested_m * 0.5, 0.005))
        min_useful_motion_m = min(requested_m * 0.5, 0.002)
        max_cross_axis_drift_m = max(0.001, requested_m * 0.25)

        if error_meters > jog_tolerance_m or actual_m < min_useful_motion_m:
            return False

        requested_unit = requested_delta / requested_m
        actual_delta = result_tip - current_tip
        projected_m = float(np.dot(actual_delta, requested_unit))
        cross_axis_m = float(np.linalg.norm(actual_delta - projected_m * requested_unit))
        return projected_m >= min_useful_motion_m and cross_axis_m <= max_cross_axis_drift_m

    def _is_off_axis_jog_near_miss(
        self,
        *,
        current_tip: np.ndarray,
        requested_delta: np.ndarray,
        result_tip: np.ndarray,
        error_meters: float,
    ) -> bool:
        requested_m = float(np.linalg.norm(requested_delta))
        if requested_m <= 0.0:
            return False

        actual_m = float(np.linalg.norm(result_tip - current_tip))
        jog_tolerance_m = max(self.solver.tolerance_m * 1.5, min(requested_m * 0.5, 0.005))
        min_useful_motion_m = min(requested_m * 0.5, 0.002)
        return error_meters <= jog_tolerance_m and actual_m >= min_useful_motion_m

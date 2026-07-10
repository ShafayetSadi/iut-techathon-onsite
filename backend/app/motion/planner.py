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

    def solve_target(
        self,
        target: Vector3,
        current_joints: dict[str, float] | None = None,
        *,
        tolerance_m: float | None = None,
    ) -> IKSolveResponse:
        self.safety.validate_target(target)
        start = clamp_joint_map(self.model, current_joints or self.model.neutral_pose())
        target_vec = np.array([target.x, target.y, target.z], dtype=float)
        result = self.solver.solve_local(target_vec, start, tolerance_m=tolerance_m) if tolerance_m is not None else self.solver.solve(target_vec, start)
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
        requested_delta = np.array([delta.x, delta.y, delta.z], dtype=float)
        requested_m = float(np.linalg.norm(requested_delta))
        target = Vector3(
            x=float(current_tip[0] + delta.x),
            y=float(current_tip[1] + delta.y),
            z=float(current_tip[2] + delta.z),
        )
        self.safety.validate_target(target)

        target_tip = np.array([target.x, target.y, target.z], dtype=float)
        singular_vertical_mode = self._singular_vertical_jog_mode(
            current_tip=current_tip,
            requested_delta=requested_delta,
        )

        jog_solve_tolerance_m = max(0.0001, min(self.solver.tolerance_m, requested_m * 0.2))
        if singular_vertical_mode == "escape_down":
            escape_seed = self._singular_vertical_escape_seed(start)
            result = self.solver.solve_local(target_tip, escape_seed, tolerance_m=self.solver.tolerance_m)
        else:
            result = self.solver.solve_local(target_tip, start, tolerance_m=jog_solve_tolerance_m)

        # A straight-up home pose is singular for small local Z jogs: the
        # Jacobian update can collapse to zero even though a nearby bent posture
        # would reach the target. Fall back to the multi-seed global solver so
        # jog-down can escape the singularity without weakening the normal local
        # jog behavior.
        if not result.success and singular_vertical_mode != "escape_down":
            fallback = self.solver.solve(target_tip, start)
            if fallback.success or fallback.error_meters < result.error_meters:
                result = fallback

        if result.success or self._is_acceptable_jog_near_miss(
            current_tip=current_tip,
            requested_delta=requested_delta,
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
            requested_delta=requested_delta,
            result_tip=result.tip,
            error_meters=result.error_meters,
        ):
            return IKSolveResponse(
                success=True,
                joints=start,
                tip={"x": float(current_tip[0]), "y": float(current_tip[1]), "z": float(current_tip[2])},
                errorMeters=requested_m,
                iterations=result.iterations,
                trajectory=[],
                reason="Jog blocked: requested direction is outside the arm's reachable workspace from this posture.",
            )

        boundary_reason = self._boundary_block_reason(
            current_tip=current_tip,
            requested_delta=requested_delta,
            result_tip=result.tip,
        )

        return IKSolveResponse(
            success=False,
            joints=None,
            tip={"x": float(result.tip[0]), "y": float(result.tip[1]), "z": float(result.tip[2])},
            errorMeters=result.error_meters,
            iterations=result.iterations,
            trajectory=[],
            reason=boundary_reason or result.reason,
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

    def _singular_vertical_jog_mode(
        self,
        *,
        current_tip: np.ndarray,
        requested_delta: np.ndarray,
    ) -> str | None:
        requested_m = float(np.linalg.norm(requested_delta))
        if requested_m <= 0.0:
            return None

        requested_unit = requested_delta / requested_m
        if abs(float(requested_unit[2])) < 0.9:
            return None

        radial_m = float(np.hypot(current_tip[0], current_tip[1]))
        if radial_m > 0.01:
            return None

        return "escape_down" if float(requested_unit[2]) < 0.0 else None

    def _singular_vertical_escape_seed(self, current_joints: dict[str, float]) -> dict[str, float]:
        seed = dict(current_joints)
        seed["joint_2"] = seed.get("joint_2", 0.0) + 0.15
        seed["joint_3"] = seed.get("joint_3", 0.0) - 0.15
        return clamp_joint_map(self.model, seed)

    def _boundary_block_reason(
        self,
        *,
        current_tip: np.ndarray,
        requested_delta: np.ndarray,
        result_tip: np.ndarray,
    ) -> str | None:
        requested_m = float(np.linalg.norm(requested_delta))
        if requested_m <= 0.0:
            return None

        actual_m = float(np.linalg.norm(result_tip - current_tip))
        if actual_m > max(0.0005, requested_m * 0.1):
            return None

        requested_unit = requested_delta / requested_m
        vertical = float(requested_unit[2])
        current_z = float(current_tip[2])
        z_margin = max(0.005, requested_m)

        if vertical > 0.9 and current_z >= self.safety.max_z_m - z_margin:
            return "Jog blocked: already at top of reachable workspace from this posture."
        if vertical < -0.9 and current_z <= self.safety.min_z_m + z_margin:
            return "Jog blocked: already at bottom of reachable workspace."

        return None

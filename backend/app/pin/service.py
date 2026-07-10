from app.motion.planner import MotionPlanner
from app.panel.service import PanelService
from app.schemas.common import Vector3
from app.schemas.motion import IKSolveResponse, TrajectoryPoint
from app.schemas.pin import PinSequenceRequest, PinSequenceResponse, PinSequenceStep


TOUCH_TOLERANCE_M = 0.005
APPROACH_OFFSET_M = 0.03


class PinService:
    def __init__(
        self,
        panel_service: PanelService,
        motion_planner: MotionPlanner,
        *,
        tolerance_m: float = TOUCH_TOLERANCE_M,
        approach_offset_m: float = APPROACH_OFFSET_M,
    ) -> None:
        self.panel_service = panel_service
        self.motion_planner = motion_planner
        self.tolerance_m = tolerance_m
        self.approach_offset_m = approach_offset_m

    def plan_sequence(self, request: PinSequenceRequest) -> PinSequenceResponse:
        panel = self.panel_service.get_keys()
        key_positions = {key.digit: key.position for key in panel.keys}
        planned_digits = list(request.pin)
        current_joints = request.current_joints
        steps: list[PinSequenceStep] = []

        for index, digit in enumerate(planned_digits, start=1):
            key_position = key_positions[digit]
            approach_target = self._approach_target(key_position)
            touch_target = key_position
            retract_target = approach_target
            trajectory: list[TrajectoryPoint] = []

            approach = self.motion_planner.solve_target(approach_target, current_joints)
            if not self._is_successful_solve(approach):
                steps.append(
                    self._build_step(
                        index=index,
                        digit=digit,
                        key_position=key_position,
                        approach_target=approach_target,
                        touch_target=touch_target,
                        retract_target=retract_target,
                        trajectory=trajectory,
                        pressed=False,
                        message=self._failure_message(digit, "approach", approach),
                    )
                )
                return self._failure_response(request.pin, planned_digits, steps, steps[-1].message)
            current_joints = approach.joints
            trajectory.extend(approach.trajectory)

            touch = self.motion_planner.solve_target(touch_target, current_joints)
            trajectory.extend(touch.trajectory)
            touch_error = touch.error_meters
            if not self._is_successful_solve(touch):
                steps.append(
                    self._build_step(
                        index=index,
                        digit=digit,
                        key_position=key_position,
                        approach_target=approach_target,
                        touch_target=touch_target,
                        retract_target=retract_target,
                        trajectory=trajectory,
                        touch_error_meters=touch_error,
                        pressed=False,
                        message=self._failure_message(digit, "touch", touch),
                    )
                )
                return self._failure_response(request.pin, planned_digits, steps, steps[-1].message)
            if touch_error is None or touch_error > self.tolerance_m:
                message = (
                    f"Key {digit} touch missed tolerance: "
                    f"{(touch_error or 0.0) * 1000:.1f}mm > {self.tolerance_m * 1000:.1f}mm"
                )
                steps.append(
                    self._build_step(
                        index=index,
                        digit=digit,
                        key_position=key_position,
                        approach_target=approach_target,
                        touch_target=touch_target,
                        retract_target=retract_target,
                        trajectory=trajectory,
                        touch_error_meters=touch_error,
                        pressed=False,
                        message=message,
                    )
                )
                return self._failure_response(request.pin, planned_digits, steps, message)
            current_joints = touch.joints

            retract = self.motion_planner.solve_target(retract_target, current_joints)
            trajectory.extend(retract.trajectory)
            if not self._is_successful_solve(retract):
                steps.append(
                    self._build_step(
                        index=index,
                        digit=digit,
                        key_position=key_position,
                        approach_target=approach_target,
                        touch_target=touch_target,
                        retract_target=retract_target,
                        trajectory=trajectory,
                        touch_error_meters=touch_error,
                        pressed=True,
                        message=self._failure_message(digit, "retract", retract),
                    )
                )
                return self._failure_response(request.pin, planned_digits, steps, steps[-1].message)
            current_joints = retract.joints

            steps.append(
                self._build_step(
                    index=index,
                    digit=digit,
                    key_position=key_position,
                    approach_target=approach_target,
                    touch_target=touch_target,
                    retract_target=retract_target,
                    trajectory=trajectory,
                    touch_error_meters=touch_error,
                    pressed=True,
                    message=f"Pressed key {digit}: error {touch_error * 1000:.1f}mm",
                )
            )

        return PinSequenceResponse(
            success=True,
            pin=request.pin,
            message=f"PIN {request.pin} planned successfully.",
            plannedDigits=list(request.pin),
            toleranceMeters=self.tolerance_m,
            approachOffsetMeters=self.approach_offset_m,
            steps=steps,
        )

    def _approach_target(self, key_position: Vector3) -> Vector3:
        return Vector3(
            x=key_position.x,
            y=key_position.y,
            z=key_position.z + self.approach_offset_m,
        )

    def _build_step(
        self,
        *,
        index: int,
        digit: str,
        key_position: Vector3,
        approach_target: Vector3,
        touch_target: Vector3,
        retract_target: Vector3,
        trajectory: list[TrajectoryPoint],
        pressed: bool,
        touch_error_meters: float | None = None,
        message: str | None = None,
    ) -> PinSequenceStep:
        return PinSequenceStep(
            index=index,
            digit=digit,
            keyPosition=key_position,
            approachTarget=approach_target,
            touchTarget=touch_target,
            retractTarget=retract_target,
            touchErrorMeters=touch_error_meters,
            pressed=pressed,
            trajectory=trajectory,
            message=message,
        )

    def _failure_response(
        self,
        pin: str,
        planned_digits: list[str],
        steps: list[PinSequenceStep],
        message: str | None,
    ) -> PinSequenceResponse:
        return PinSequenceResponse(
            success=False,
            pin=pin,
            message=message or "PIN sequence failed.",
            plannedDigits=planned_digits,
            toleranceMeters=self.tolerance_m,
            approachOffsetMeters=self.approach_offset_m,
            steps=steps,
        )

    def _is_successful_solve(self, response: IKSolveResponse) -> bool:
        return response.success and response.joints is not None

    def _failure_message(self, digit: str, phase: str, response: IKSolveResponse) -> str:
        return response.reason or f"Key {digit} {phase} waypoint could not be reached."

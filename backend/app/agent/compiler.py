from __future__ import annotations

import math

import numpy as np

from app.core.errors import ValidationError
from app.motion.planner import MotionPlanner
from app.panel.service import PanelService
from app.robot.kinematics import forward_kinematics
from app.robot.urdf_loader import RobotModel
from app.schemas.agent import (
    AgentDraft,
    AgentPlanStep,
    CartesianJogAction,
    JointAction,
    JointCommand,
    JogCartesianCommand,
    MoveToAction,
    MoveToCommand,
    PhysicalCommand,
    PressKeyAction,
    RelativeMoveAction,
    SemanticAction,
    SequenceCommand,
    SimpleAction,
    SimpleCommand,
)
from app.schemas.common import Vector3


MAX_PLAN_STEPS = 24
TOUCH_TOLERANCE_M = 0.005
APPROACH_OFFSET_M = 0.03


class AgentCompiler:
    def __init__(self, model: RobotModel, planner: MotionPlanner, panel: PanelService) -> None:
        self.model = model
        self.planner = planner
        self.panel = panel

    def compile(
        self,
        draft: AgentDraft,
        current_joints: dict[str, float],
    ) -> tuple[list[AgentPlanStep], SequenceCommand]:
        joints = self._validated_joints(current_joints)
        commands: list[PhysicalCommand] = []
        display_steps: list[AgentPlanStep] = []

        for semantic in draft.steps:
            if semantic.status != "resolved" or semantic.action is None:
                raise ValidationError(f"Step {semantic.id} is not fully resolved")

            expanded = self._expand(semantic.action, joints)
            if len(commands) + len(expanded) > MAX_PLAN_STEPS:
                raise ValidationError(f"Agent plan exceeds the {MAX_PLAN_STEPS}-step limit")

            for index, (intent, analysis, command, touch_target) in enumerate(expanded, start=1):
                joints = self._preflight(command, joints, touch_target=touch_target)
                commands.append(command)
                display_steps.append(
                    AgentPlanStep(
                        id=f"{semantic.id}.{index}",
                        sourceText=semantic.source_text,
                        intent=intent,
                        analysis=analysis,
                        status="validated",
                        command=command,
                    )
                )

        if not commands:
            raise ValidationError("Agent plan produced no executable steps")
        return display_steps, SequenceCommand(steps=commands)

    def _expand(
        self,
        action: SemanticAction,
        joints: dict[str, float],
    ) -> list[tuple[str, str, PhysicalCommand, Vector3 | None]]:
        if isinstance(action, RelativeMoveAction):
            tip = forward_kinematics(self.model, joints).tip
            target = self._reference_position(action.reference)
            vector = np.array([target.x, target.y, target.z], dtype=float) - tip
            norm = float(np.linalg.norm(vector))
            if norm <= 1e-9:
                raise ValidationError(
                    f"Cannot move toward {action.reference}: the tip is already at that reference"
                )
            delta = vector / norm * action.distance_m
            command = JogCartesianCommand(
                delta=Vector3(x=float(delta[0]), y=float(delta[1]), z=float(delta[2]))
            )
            return [
                (
                    f"Move {action.distance_m * 100:.0f} cm toward {action.reference}",
                    f"Resolved {action.reference} in the base frame and normalized "
                    f"the direction to {action.distance_m * 1000:.0f} mm.",
                    command,
                    None,
                )
            ]

        if isinstance(action, CartesianJogAction):
            magnitude = math.sqrt(action.delta.x**2 + action.delta.y**2 + action.delta.z**2)
            if magnitude > 0.30:
                raise ValidationError("Cartesian jog exceeds the 300 mm single-step limit")
            return [
                (
                    "Jog the tip",
                    "Using the requested base-frame displacement.",
                    JogCartesianCommand(delta=action.delta),
                    None,
                )
            ]

        if isinstance(action, MoveToAction):
            return [
                (
                    "Move to target",
                    "Using the requested base-frame target.",
                    MoveToCommand(target=action.target),
                    None,
                )
            ]

        if isinstance(action, PressKeyAction):
            key = self._key_position(action.key)
            approach = self._approach_position(key)
            result: list[tuple[str, str, PhysicalCommand, Vector3 | None]] = [
                (
                    f"Approach key {action.key}",
                    f"Move to the configured {APPROACH_OFFSET_M * 1000:.0f} mm approach point.",
                    MoveToCommand(target=approach),
                    None,
                )
            ]
            for repetition in range(1, action.repeat + 1):
                result.extend(
                    [
                        (
                            f"Touch key {action.key} ({repetition}/{action.repeat})",
                            f"Reach the configured key coordinate within "
                            f"{TOUCH_TOLERANCE_M * 1000:.0f} mm.",
                            MoveToCommand(target=key),
                            key,
                        ),
                        (
                            f"Retract from key {action.key} ({repetition}/{action.repeat})",
                            "Return to the approach point before another touch or subsequent motion.",
                            MoveToCommand(target=approach),
                            None,
                        ),
                    ]
                )
            return result

        if isinstance(action, JointAction):
            if action.joint not in self.model.controlled_joint_names:
                raise ValidationError(f"Unknown controlled joint {action.joint}")
            index = self.model.controlled_joint_names.index(action.joint)
            if action.type == "jog_joint":
                command = JointCommand(type="jog_joint", joint=index, delta=action.radians)
                return [(f"Jog {action.joint}", "Resolved the named URDF joint.", command, None)]
            command = JointCommand(type="set_joint", joint=index, value=action.radians)
            return [(f"Set {action.joint}", "Resolved the named URDF joint.", command, None)]

        if isinstance(action, SimpleAction):
            return [
                (
                    action.type.capitalize(),
                    "No geometric parameters are required.",
                    SimpleCommand(type=action.type),
                    None,
                )
            ]

        raise ValidationError("Unsupported semantic action")

    def _preflight(
        self,
        command: PhysicalCommand,
        joints: dict[str, float],
        *,
        touch_target: Vector3 | None,
    ) -> dict[str, float]:
        if isinstance(command, JogCartesianCommand):
            response = self.planner.jog(joints, command.delta)
            if not response.success or response.joints is None or response.reason:
                raise ValidationError(response.reason or "Cartesian jog is unreachable")
            return response.joints

        if isinstance(command, MoveToCommand):
            response = self.planner.solve_target(command.target, joints)
            if not response.success or response.joints is None:
                raise ValidationError(response.reason or "Target is unreachable")
            if touch_target is not None and (
                response.error_meters is None or response.error_meters > TOUCH_TOLERANCE_M
            ):
                error_mm = 0.0 if response.error_meters is None else response.error_meters * 1000
                raise ValidationError(f"Key touch misses the 5 mm tolerance ({error_mm:.1f} mm)")
            return response.joints

        if isinstance(command, JointCommand):
            name = self.model.controlled_joint_names[command.joint]
            value = joints[name] + command.delta if command.type == "jog_joint" else command.value
            if value is None or not math.isfinite(value):
                raise ValidationError(f"Joint command for {name} is malformed")
            limit = self.model.joint_limits()[name]
            if value < limit.lower or value > limit.upper:
                raise ValidationError(f"Joint {name} would exceed its URDF limits")
            updated = dict(joints)
            updated[name] = value
            return updated

        if isinstance(command, SimpleCommand) and command.type == "home":
            return self.model.neutral_pose()
        return joints

    def _validated_joints(self, current: dict[str, float]) -> dict[str, float]:
        missing = [name for name in self.model.controlled_joint_names if name not in current]
        if missing:
            raise ValidationError(f"Current joint state is missing: {', '.join(missing)}")
        limits = self.model.joint_limits()
        result: dict[str, float] = {}
        for name in self.model.controlled_joint_names:
            value = float(current[name])
            if not math.isfinite(value) or value < limits[name].lower or value > limits[name].upper:
                raise ValidationError(f"Current joint {name} is outside its URDF limits")
            result[name] = value
        return result

    def _reference_position(self, reference: str) -> Vector3:
        if reference == "panel":
            keys = self.panel.get_keys().keys
            return Vector3(
                x=sum(item.position.x for item in keys) / len(keys),
                y=sum(item.position.y for item in keys) / len(keys),
                z=sum(item.position.z for item in keys) / len(keys),
            )
        if reference.startswith("key:"):
            return self._key_position(reference.removeprefix("key:"))
        raise ValidationError(f"Unknown spatial reference {reference!r}")

    def _key_position(self, digit: str) -> Vector3:
        for key in self.panel.get_keys().keys:
            if key.digit == digit:
                return key.position
        raise ValidationError(f"Panel key {digit} is not configured")

    def _approach_position(self, key: Vector3) -> Vector3:
        axis = self.panel.get_keys().approach_axis
        offsets = {
            "-x": (APPROACH_OFFSET_M, 0.0, 0.0),
            "+x": (-APPROACH_OFFSET_M, 0.0, 0.0),
            "-y": (0.0, APPROACH_OFFSET_M, 0.0),
            "+y": (0.0, -APPROACH_OFFSET_M, 0.0),
            "-z": (0.0, 0.0, APPROACH_OFFSET_M),
            "+z": (0.0, 0.0, -APPROACH_OFFSET_M),
        }
        if axis not in offsets:
            raise ValidationError(f"Unsupported panel approach axis {axis!r}")
        dx, dy, dz = offsets[axis]
        return Vector3(x=key.x + dx, y=key.y + dy, z=key.z + dz)

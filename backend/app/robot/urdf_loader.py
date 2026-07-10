from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np

from app.core.errors import KinematicsError


CONTROLLED_JOINTS = (
    "joint_1",
    "joint_2",
    "joint_3",
    "joint_4",
    "joint_5",
    "joint_6",
    "stylus_pitch",
)


@dataclass(frozen=True)
class JointLimit:
    lower: float
    upper: float
    effort: float | None
    velocity: float | None


@dataclass(frozen=True)
class Joint:
    name: str
    joint_type: str
    parent: str
    child: str
    origin_xyz: np.ndarray
    origin_rpy: np.ndarray
    axis: np.ndarray
    limit: JointLimit | None


@dataclass(frozen=True)
class RobotModel:
    name: str
    base_link: str
    tcp_link: str
    joints: dict[str, Joint]
    chain: list[Joint]
    controlled_joint_names: tuple[str, ...]

    def joint_limits(self) -> dict[str, JointLimit]:
        limits: dict[str, JointLimit] = {}
        for name in self.controlled_joint_names:
            limit = self.joints[name].limit
            if limit is None:
                raise KinematicsError(f"Controlled joint {name} has no URDF limit")
            limits[name] = limit
        return limits

    def neutral_pose(self) -> dict[str, float]:
        return {name: 0.0 for name in self.controlled_joint_names}


def load_robot_model(
    urdf_path: Path,
    *,
    base_link: str = "base_link",
    tcp_link: str = "stylus_tip",
) -> RobotModel:
    path = urdf_path.resolve()
    if not path.exists():
        raise KinematicsError(f"URDF file not found: {path}")

    root = ET.parse(path).getroot()
    joints: dict[str, Joint] = {}
    child_to_joint: dict[str, Joint] = {}

    for joint_el in root.findall("joint"):
        joint = _parse_joint(joint_el)
        joints[joint.name] = joint
        child_to_joint[joint.child] = joint

    chain_reversed: list[Joint] = []
    cursor = tcp_link
    while cursor != base_link:
        joint = child_to_joint.get(cursor)
        if joint is None:
            raise KinematicsError(f"No joint connects {cursor} back to {base_link}")
        chain_reversed.append(joint)
        cursor = joint.parent
    chain = list(reversed(chain_reversed))

    missing = [name for name in CONTROLLED_JOINTS if name not in joints]
    if missing:
        raise KinematicsError(f"URDF missing controlled joints: {', '.join(missing)}")

    return RobotModel(
        name=root.attrib.get("name", "robot"),
        base_link=base_link,
        tcp_link=tcp_link,
        joints=joints,
        chain=chain,
        controlled_joint_names=CONTROLLED_JOINTS,
    )


def _parse_joint(joint_el: ET.Element) -> Joint:
    name = joint_el.attrib["name"]
    joint_type = joint_el.attrib["type"]
    parent = _required_child(joint_el, "parent").attrib["link"]
    child = _required_child(joint_el, "child").attrib["link"]

    origin_el = joint_el.find("origin")
    origin_xyz = _parse_float_vector(origin_el.attrib.get("xyz", "0 0 0") if origin_el is not None else "0 0 0")
    origin_rpy = _parse_float_vector(origin_el.attrib.get("rpy", "0 0 0") if origin_el is not None else "0 0 0")

    axis_el = joint_el.find("axis")
    axis = _parse_float_vector(axis_el.attrib.get("xyz", "0 0 1") if axis_el is not None else "0 0 1")
    norm = np.linalg.norm(axis)
    if norm > 0:
        axis = axis / norm

    limit = None
    limit_el = joint_el.find("limit")
    if limit_el is not None:
        limit = JointLimit(
            lower=float(limit_el.attrib.get("lower", "0")),
            upper=float(limit_el.attrib.get("upper", "0")),
            effort=_optional_float(limit_el.attrib.get("effort")),
            velocity=_optional_float(limit_el.attrib.get("velocity")),
        )

    return Joint(
        name=name,
        joint_type=joint_type,
        parent=parent,
        child=child,
        origin_xyz=origin_xyz,
        origin_rpy=origin_rpy,
        axis=axis,
        limit=limit,
    )


def _required_child(element: ET.Element, tag: str) -> ET.Element:
    child = element.find(tag)
    if child is None:
        raise KinematicsError(f"URDF joint {element.attrib.get('name')} missing <{tag}>")
    return child


def _parse_float_vector(raw: str) -> np.ndarray:
    values = [float(part) for part in raw.split()]
    if len(values) != 3:
        raise KinematicsError(f"Expected 3-vector, got {raw!r}")
    return np.array(values, dtype=float)


def _optional_float(raw: str | None) -> float | None:
    return None if raw is None else float(raw)


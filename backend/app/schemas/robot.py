from pydantic import BaseModel


class JointLimit(BaseModel):
    lower: float
    upper: float
    velocity: float | None = None
    effort: float | None = None


class JointInfo(BaseModel):
    name: str
    axis: tuple[float, float, float]
    limit: JointLimit


class RobotModelResponse(BaseModel):
    name: str
    base_link: str
    tcp_link: str
    controlled_joints: list[JointInfo]
    neutral_pose: dict[str, float]


class RobotState(BaseModel):
    joints: dict[str, float]
    tip: dict[str, float]


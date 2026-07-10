from fastapi import APIRouter

from app.dependencies import get_robot_model, get_state_store
from app.robot.urdf_loader import RobotModel
from app.schemas.robot import JointInfo, JointLimit, RobotModelResponse, RobotState

router = APIRouter(prefix="/robot", tags=["robot"])


@router.get("/model", response_model=RobotModelResponse)
async def robot_model() -> RobotModelResponse:
    model: RobotModel = get_robot_model()
    limits = model.joint_limits()
    return RobotModelResponse(
        name=model.name,
        base_link=model.base_link,
        tcp_link=model.tcp_link,
        controlled_joints=[
            JointInfo(
                name=name,
                axis=tuple(float(value) for value in model.joints[name].axis),
                limit=JointLimit(
                    lower=limits[name].lower,
                    upper=limits[name].upper,
                    velocity=limits[name].velocity,
                    effort=limits[name].effort,
                ),
            )
            for name in model.controlled_joint_names
        ],
        neutral_pose=model.neutral_pose(),
    )


@router.get("/state", response_model=RobotState)
async def robot_state() -> dict[str, object]:
    return get_state_store().snapshot()

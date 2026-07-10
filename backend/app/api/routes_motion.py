from fastapi import APIRouter

from app.dependencies import get_motion_planner, get_state_store
from app.schemas.motion import JogRequest, MotionCommandResponse

router = APIRouter(prefix="/motion", tags=["motion"])


@router.post("/jog", response_model=MotionCommandResponse)
async def jog(request: JogRequest) -> MotionCommandResponse:
    planner = get_motion_planner()
    response = planner.jog(
        request.current_joints,
        request.delta,
        include_trajectory=request.include_trajectory,
    )
    if response.success and response.joints:
        get_state_store().set_joints(response.joints)
    return MotionCommandResponse(**response.model_dump(by_alias=True), command="jog")

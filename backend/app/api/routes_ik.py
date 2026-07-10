from fastapi import APIRouter

from app.dependencies import get_motion_planner, get_state_store
from app.schemas.motion import IKSolveRequest, IKSolveResponse

router = APIRouter(prefix="/ik", tags=["inverse kinematics"])


@router.post("/solve", response_model=IKSolveResponse)
async def solve_ik(request: IKSolveRequest) -> IKSolveResponse:
    planner = get_motion_planner()
    response = planner.solve_target(request.target, request.current_joints)
    if response.success and response.joints:
        get_state_store().set_joints(response.joints)
    return response

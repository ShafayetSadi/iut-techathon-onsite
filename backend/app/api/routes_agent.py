from fastapi import APIRouter

from app.dependencies import get_agent_service
from app.schemas.agent import AgentRequest, AgentResponse


router = APIRouter(prefix="/agent", tags=["agentic control"])


@router.post("/interpret", response_model=AgentResponse)
async def interpret_agent(request: AgentRequest) -> AgentResponse:
    return await get_agent_service().interpret(request)

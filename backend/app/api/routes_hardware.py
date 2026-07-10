from fastapi import APIRouter

from app.dependencies import get_hardware_service

router = APIRouter(prefix="/hardware", tags=["hardware"])


@router.get("/schematic")
async def schematic() -> dict[str, object]:
    return get_hardware_service().schematic_metadata()

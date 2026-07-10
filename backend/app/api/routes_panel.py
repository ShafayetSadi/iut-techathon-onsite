from fastapi import APIRouter

from app.dependencies import get_panel_service
from app.schemas.panel import PanelKeysResponse

router = APIRouter(prefix="/panel", tags=["panel"])


@router.get("/keys", response_model=PanelKeysResponse)
async def panel_keys() -> PanelKeysResponse:
    return get_panel_service().get_keys()


@router.get("/config")
async def panel_config() -> dict[str, object]:
    return get_panel_service().get_config()

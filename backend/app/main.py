from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    routes_hardware,
    routes_health,
    routes_ik,
    routes_motion,
    routes_panel,
    routes_pin,
    routes_robot,
    routes_voice,
    websocket_state,
)
from app.core.config import get_settings
from app.core.errors import RobotBackendError


settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RobotBackendError)
async def robot_backend_error_handler(request: Request, exc: RobotBackendError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"success": False, "reason": str(exc)})


app.include_router(routes_health.router)
app.include_router(routes_robot.router, prefix=settings.api_prefix)
app.include_router(routes_ik.router, prefix=settings.api_prefix)
app.include_router(routes_motion.router, prefix=settings.api_prefix)
app.include_router(routes_panel.router, prefix=settings.api_prefix)
app.include_router(routes_pin.router, prefix=settings.api_prefix)
app.include_router(routes_voice.router, prefix=settings.api_prefix)
app.include_router(routes_hardware.router, prefix=settings.api_prefix)
app.include_router(websocket_state.router)


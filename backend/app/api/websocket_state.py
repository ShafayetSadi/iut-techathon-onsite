from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.dependencies import get_state_store

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/state")
async def websocket_state(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json({"type": "state", "payload": get_state_store().snapshot()})
            await asyncio.sleep(0.2)
    except WebSocketDisconnect:
        return


"""Live WebSocket channel (/ws/live).

The simulator broadcasts reading batches, new issues and notifications here.
A ``hello`` event is sent on connect; send ``ping`` to receive ``pong``.
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.realtime import manager

router = APIRouter(tags=["live"])


async def _live_handler(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    await manager.send(
        websocket,
        "hello",
        {"message": "Verdant Twin live channel ready", "clients": len(manager.active)},
    )
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await manager.send(websocket, "pong", {})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.websocket("/ws/live")
async def live(websocket: WebSocket) -> None:
    await _live_handler(websocket)


@router.websocket("/ws")
async def live_legacy(websocket: WebSocket) -> None:
    """Alias kept for backwards compatibility."""
    await _live_handler(websocket)

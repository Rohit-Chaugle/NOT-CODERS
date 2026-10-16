"""WebSocket connection manager shared by all routers.

Feature code will call ``manager.broadcast({...})`` from ingestion endpoints to
push live updates to connected clients.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active:
            self.active.remove(websocket)

    async def send(self, websocket: WebSocket, message_type: str, payload: Any) -> None:
        await websocket.send_json(self._envelope(message_type, payload))

    async def broadcast(self, message_type: str, payload: Any) -> None:
        message = self._envelope(message_type, payload)
        for websocket in list(self.active):
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(websocket)

    @staticmethod
    def _envelope(message_type: str, payload: Any) -> dict[str, Any]:
        return {
            "type": message_type,
            "payload": payload,
            "ts": datetime.now(timezone.utc).isoformat(),
        }


manager = ConnectionManager()

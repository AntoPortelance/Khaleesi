"""Pushes state changes to every connected browser over WebSocket."""

import asyncio
from urllib.parse import urlsplit

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from khaleesi.auth import SESSION_COOKIE, SessionManager


class EventHub:
    def __init__(self, sessions: SessionManager, send_timeout: float = 1.0) -> None:
        self._sessions = sessions
        self._send_timeout = send_timeout
        self._clients: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, token: str) -> None:
        await websocket.accept()
        self._clients[websocket] = token

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.pop(websocket, None)

    async def broadcast(self, event: dict) -> None:
        clients = list(self._clients.items())
        await asyncio.gather(*(self._send(client, token, event) for client, token in clients))

    async def close_session(self, token: str | None) -> None:
        clients = [client for client, owner in self._clients.items() if owner == token]
        await asyncio.gather(*(self._drop(client) for client in clients))

    async def _send(self, websocket: WebSocket, token: str, event: dict) -> None:
        if self._sessions.get(token) is None:
            await self._drop(websocket)
            return
        try:
            await asyncio.wait_for(websocket.send_json(event), self._send_timeout)
        except Exception:
            # One slow or broken client must never make a command fail. It reloads the
            # full state when it reconnects.
            await self._drop(websocket)

    async def _drop(self, websocket: WebSocket) -> None:
        self.disconnect(websocket)
        try:
            await asyncio.wait_for(websocket.close(code=1008), self._send_timeout)
        except Exception:
            return


def _origin_matches_host(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    host = websocket.headers.get("host")
    return bool(origin and host) and urlsplit(origin).netloc.lower() == host.lower()


router = APIRouter()


@router.websocket("/ws/events")
async def events(websocket: WebSocket) -> None:
    state = websocket.app.state
    token = websocket.cookies.get(SESSION_COOKIE)
    if state.sessions.get(token) is None or not _origin_matches_host(websocket):
        await websocket.close(code=1008)
        return

    await state.hub.connect(websocket, token)
    try:
        while True:
            # Browsers only send heartbeats, and use the reply to detect a dead server.
            await websocket.receive_text()
            await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        state.hub.disconnect(websocket)

"""Password hashing, in-memory sessions, login throttling, and authentication routes.

Sessions and throttling state are only touched from the event loop, and live in the
single server process: a restart logs everyone out.
"""

import secrets
import time
from collections.abc import Callable
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

SESSION_COOKIE = "khaleesi_session"

_hasher = PasswordHasher()
# Verified when the username is unknown, so that both cases take the same time.
_UNKNOWN_USER_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str | None, password: str) -> bool:
    try:
        matches = _hasher.verify(stored_hash or _UNKNOWN_USER_HASH, password)
    except (Argon2Error, InvalidHashError):
        return False
    return matches and stored_hash is not None


class SessionManager:
    def __init__(
        self, lifetime_seconds: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._lifetime = lifetime_seconds
        self._clock = clock
        self._sessions: dict[str, tuple[str, float]] = {}

    def create(self, username: str) -> str:
        now = self._clock()
        self._sessions = {token: entry for token, entry in self._sessions.items() if entry[1] > now}
        token = secrets.token_urlsafe(32)
        self._sessions[token] = (username, now + self._lifetime)
        return token

    def get(self, token: str | None) -> str | None:
        entry = self._sessions.get(token) if token else None
        if entry is None or entry[1] <= self._clock():
            return None
        return entry[0]

    def revoke(self, token: str | None) -> None:
        if token:
            self._sessions.pop(token, None)


class LoginThrottle:
    """Blocks a client and username pair for a while after repeated failures."""

    def __init__(
        self,
        max_failures: int,
        block_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_failures = max_failures
        self._block_seconds = block_seconds
        self._clock = clock
        self._failures: dict[str, tuple[int, float]] = {}

    def is_blocked(self, key: str) -> bool:
        entry = self._failures.get(key)
        if entry is None:
            return False
        if self._clock() - entry[1] >= self._block_seconds:
            del self._failures[key]
            return False
        return entry[0] >= self._max_failures

    def record_failure(self, key: str) -> None:
        now = self._clock()
        self._failures = {
            other: entry
            for other, entry in self._failures.items()
            if now - entry[1] < self._block_seconds
        }
        count = self._failures.get(key, (0, now))[0]
        self._failures[key] = (count + 1, now)

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


async def current_user(request: Request) -> str:
    username = request.app.state.sessions.get(request.cookies.get(SESSION_COOKIE))
    if username is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return username


CurrentUser = Annotated[str, Depends(current_user)]

router = APIRouter(prefix="/api/auth")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=1024)


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response) -> dict[str, str]:
    state = request.app.state
    client_host = request.client.host if request.client else "unknown"
    throttle_key = f"{client_host}:{payload.username.lower()}"

    if state.throttle.is_blocked(throttle_key):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in a minute.")

    stored_hash = await run_in_threadpool(state.db.find_password_hash, payload.username)
    if not await run_in_threadpool(verify_password, stored_hash, payload.password):
        state.throttle.record_failure(throttle_key)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    state.throttle.reset(throttle_key)
    response.set_cookie(
        SESSION_COOKIE,
        state.sessions.create(payload.username),
        max_age=int(state.settings.session_hours * 3600),
        httponly=True,
        secure=state.settings.cookie_secure,
        samesite="strict",
    )
    return {"username": payload.username}


@router.post("/logout", status_code=204)
async def logout(_: CurrentUser, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    request.app.state.sessions.revoke(token)
    await request.app.state.hub.close_session(token)
    response.delete_cookie(SESSION_COOKIE)


@router.get("/me")
async def me(username: CurrentUser) -> dict[str, str]:
    return {"username": username}

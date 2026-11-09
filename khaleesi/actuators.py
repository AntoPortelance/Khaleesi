"""HTTP routes to list, place, and command actuators."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, StringConstraints

from khaleesi.auth import CurrentUser
from khaleesi.commands import INITIAL_STATES, present

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
# Positions are fractions of the P&ID size, so they hold at any screen size.
Coordinate = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class ActuatorCreate(BaseModel):
    name: Name
    kind: Literal["valve", "cylinder"]
    x: Coordinate = 0.5
    y: Coordinate = 0.5


class ActuatorUpdate(BaseModel):
    name: Name | None = None
    x: Coordinate | None = None
    y: Coordinate | None = None


class CommandRequest(BaseModel):
    target: str = Field(max_length=32)


router = APIRouter(prefix="/api/actuators")


@router.get("")
def list_actuators(_: CurrentUser, request: Request) -> list[dict]:
    return [present(actuator) for actuator in request.app.state.db.list_actuators()]


@router.post("", status_code=201)
async def add_actuator(payload: ActuatorCreate, _: CurrentUser, request: Request) -> dict:
    state = request.app.state
    actuator = present(
        await run_in_threadpool(
            state.db.add_actuator,
            uuid.uuid4().hex,
            payload.name,
            payload.kind,
            INITIAL_STATES[payload.kind],
            payload.x,
            payload.y,
        )
    )
    await state.hub.broadcast({"type": "actuator_added", "actuator": actuator})
    return actuator


@router.patch("/{actuator_id}")
async def update_actuator(
    actuator_id: str, payload: ActuatorUpdate, _: CurrentUser, request: Request
) -> dict:
    return await request.app.state.commands.update_layout(
        actuator_id, payload.name, payload.x, payload.y
    )


@router.delete("/{actuator_id}", status_code=204)
async def delete_actuator(actuator_id: str, _: CurrentUser, request: Request) -> None:
    await request.app.state.commands.remove(actuator_id)


@router.post("/{actuator_id}/command")
async def command_actuator(
    actuator_id: str, payload: CommandRequest, username: CurrentUser, request: Request
) -> dict:
    return await request.app.state.commands.execute(actuator_id, payload.target, username)

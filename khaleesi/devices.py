"""HTTP routes for the full device list used at startup, and for sensors."""

import uuid

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from khaleesi.actuators import LayoutUpdate
from khaleesi.auth import CurrentUser
from khaleesi.commands import present
from khaleesi.device_store import Coordinate, Name, SensorKind


class SensorCreate(BaseModel):
    name: Name
    kind: SensorKind
    x: Coordinate = 0.5
    y: Coordinate = 0.5


router = APIRouter(prefix="/api")


@router.get("/devices")
def list_devices(_: CurrentUser, request: Request) -> dict:
    """Returns every sensor and actuator with its position, to draw the P&ID at startup."""
    devices = request.app.state.devices.list_devices()
    return {
        "actuators": [present(actuator) for actuator in devices["actuators"]],
        "sensors": devices["sensors"],
    }


@router.post("/sensors", status_code=201)
async def add_sensor(payload: SensorCreate, _: CurrentUser, request: Request) -> dict:
    state = request.app.state
    sensor = await run_in_threadpool(
        state.devices.add_sensor,
        uuid.uuid4().hex,
        payload.name,
        payload.kind,
        payload.x,
        payload.y,
    )
    await state.hub.broadcast({"type": "sensor_added", "sensor": sensor})
    return sensor


@router.patch("/sensors/{sensor_id}")
async def update_sensor(
    sensor_id: str, payload: LayoutUpdate, _: CurrentUser, request: Request
) -> dict:
    return await request.app.state.commands.update_sensor_layout(
        sensor_id, payload.name, payload.x, payload.y
    )


@router.delete("/sensors/{sensor_id}", status_code=204)
async def delete_sensor(sensor_id: str, _: CurrentUser, request: Request) -> None:
    await request.app.state.commands.remove_sensor(sensor_id)

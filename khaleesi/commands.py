"""Actuator changes: one operation at a time per actuator, then a broadcast to all screens.

A command is considered applied as soon as it is valid and written to the database. The
stored state is the commanded state: no hardware is driven and no feedback is measured yet.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi.concurrency import run_in_threadpool

from khaleesi.database import Database
from khaleesi.events import EventHub

ALLOWED_STATES = {
    "valve": ("OPEN", "CLOSED"),
    "cylinder": ("EXTENDED", "RETRACTED"),
}
INITIAL_STATES = {"valve": "CLOSED", "cylinder": "RETRACTED"}


class ActuatorNotFoundError(Exception):
    """No actuator has this identifier."""


class ActuatorBusyError(Exception):
    """Another operation is in progress on this actuator."""


class InvalidTargetError(Exception):
    """The requested state does not exist for this kind of actuator."""


def present(actuator: dict) -> dict:
    """Adds what a client needs to offer only valid commands."""
    return {**actuator, "allowed_states": list(ALLOWED_STATES[actuator["kind"]])}


class CommandService:
    def __init__(self, db: Database, hub: EventHub) -> None:
        self._db = db
        self._hub = hub
        self._busy: set[str] = set()

    @asynccontextmanager
    async def _exclusive(self, actuator_id: str) -> AsyncIterator[None]:
        # Checking and adding happen without an await in between, so the event loop
        # makes this atomic. It relies on the server running as a single process.
        if actuator_id in self._busy:
            raise ActuatorBusyError(actuator_id)
        self._busy.add(actuator_id)
        try:
            yield
        finally:
            self._busy.discard(actuator_id)

    async def execute(self, actuator_id: str, target: str, username: str) -> dict:
        async with self._exclusive(actuator_id):
            actuator = await run_in_threadpool(self._db.get_actuator, actuator_id)
            if actuator is None:
                raise ActuatorNotFoundError(actuator_id)
            if target not in ALLOWED_STATES[actuator["kind"]]:
                raise InvalidTargetError(target)

            timestamp = datetime.now(UTC).isoformat()
            updated = await run_in_threadpool(
                self._db.set_actuator_state, actuator_id, target, username, timestamp
            )
            return await self._publish_update(updated)

    async def update_layout(
        self, actuator_id: str, name: str | None, x: float | None, y: float | None
    ) -> dict:
        async with self._exclusive(actuator_id):
            updated = await run_in_threadpool(
                self._db.update_actuator_layout, actuator_id, name, x, y
            )
            if updated is None:
                raise ActuatorNotFoundError(actuator_id)
            return await self._publish_update(updated)

    async def remove(self, actuator_id: str) -> None:
        async with self._exclusive(actuator_id):
            if not await run_in_threadpool(self._db.delete_actuator, actuator_id):
                raise ActuatorNotFoundError(actuator_id)
            await self._hub.broadcast({"type": "actuator_removed", "id": actuator_id})

    async def _publish_update(self, actuator: dict) -> dict:
        presented = present(actuator)
        await self._hub.broadcast({"type": "actuator_updated", "actuator": presented})
        return presented

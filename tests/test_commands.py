import asyncio
import threading

import pytest

from khaleesi.commands import CommandService, DeviceBusyError


class FakeDatabase:
    """Lets a test hold a command in the middle of its database write."""

    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.write_started = threading.Event()
        self.allow_write = threading.Event()
        self.allow_write.set()

    def get_actuator(self, actuator_id: str) -> dict:
        return {"id": actuator_id, "kind": "valve", "state": "CLOSED"}

    def set_actuator_state(self, actuator_id: str, state: str, _by: str, _at: str) -> dict:
        self.write_started.set()
        self.allow_write.wait(timeout=5)
        if self.fail:
            raise OSError("disk failure")
        return {"id": actuator_id, "kind": "valve", "state": state}


class FakeHub:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def broadcast(self, event: dict) -> None:
        self.events.append(event)


async def _wait_for(flag: threading.Event) -> None:
    while not flag.is_set():
        await asyncio.sleep(0.001)


def test_second_command_on_the_same_actuator_is_refused() -> None:
    database, hub = FakeDatabase(), FakeHub()
    service = CommandService(database, hub)
    database.allow_write.clear()

    async def scenario() -> None:
        first = asyncio.create_task(service.execute("v1", "OPEN", "alice"))
        await _wait_for(database.write_started)
        with pytest.raises(DeviceBusyError):
            await service.execute("v1", "CLOSED", "bob")
        database.allow_write.set()
        await first

    asyncio.run(scenario())
    assert [event["actuator"]["state"] for event in hub.events] == ["OPEN"]


def test_other_actuators_stay_available_during_a_command() -> None:
    database, hub = FakeDatabase(), FakeHub()
    service = CommandService(database, hub)
    database.allow_write.clear()

    async def scenario() -> None:
        first = asyncio.create_task(service.execute("v1", "OPEN", "alice"))
        await _wait_for(database.write_started)
        second = asyncio.create_task(service.execute("v2", "OPEN", "bob"))
        await asyncio.sleep(0.01)
        database.allow_write.set()
        await asyncio.gather(first, second)

    asyncio.run(scenario())
    assert {event["actuator"]["id"] for event in hub.events} == {"v1", "v2"}


def test_failed_write_releases_the_actuator_and_broadcasts_nothing() -> None:
    database, hub = FakeDatabase(fail=True), FakeHub()
    service = CommandService(database, hub)

    async def scenario() -> None:
        with pytest.raises(OSError):
            await service.execute("v1", "OPEN", "alice")
        assert hub.events == []

        database.fail = False
        await service.execute("v1", "OPEN", "alice")

    asyncio.run(scenario())
    assert len(hub.events) == 1

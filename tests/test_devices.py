import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from khaleesi.app import create_app
from khaleesi.config import Settings
from khaleesi.device_store import DeviceFileError
from tests.conftest import ORIGIN, add_valve


def add_sensor(client: TestClient, name: str = "PT-1", x: float = 0.2, y: float = 0.3) -> dict:
    payload = {"name": name, "kind": "analog", "x": x, "y": y}
    response = client.post("/api/sensors", json=payload)
    assert response.status_code == 201
    return response.json()


def test_startup_route_is_empty_at_first(client: TestClient) -> None:
    assert client.get("/api/devices").json() == {"actuators": [], "sensors": []}


def test_startup_route_returns_every_device_with_its_position(client: TestClient) -> None:
    valve = add_valve(client)
    client.patch(f"/api/actuators/{valve['id']}", json={"x": 0.4, "y": 0.6})
    sensor = add_sensor(client)

    devices = client.get("/api/devices").json()

    assert [(item["id"], item["x"], item["y"]) for item in devices["actuators"]] == [
        (valve["id"], 0.4, 0.6)
    ]
    assert devices["actuators"][0]["allowed_states"] == ["OPEN", "CLOSED"]
    assert [(item["id"], item["x"], item["y"]) for item in devices["sensors"]] == [
        (sensor["id"], 0.2, 0.3)
    ]


def test_devices_are_written_to_the_json_file(client: TestClient, settings: Settings) -> None:
    valve = add_valve(client)
    client.post(f"/api/actuators/{valve['id']}/command", json={"target": "OPEN"})
    sensor = add_sensor(client)

    stored = json.loads(settings.devices_path.read_text())

    assert stored["actuators"][0]["id"] == valve["id"]
    assert stored["actuators"][0]["state"] == "OPEN"
    assert stored["actuators"][0]["updated_by"] == "alice"
    assert stored["sensors"] == [
        {"id": sensor["id"], "name": "PT-1", "kind": "analog", "x": 0.2, "y": 0.3}
    ]


def test_devices_survive_a_restart(client: TestClient, settings: Settings) -> None:
    valve = add_valve(client)
    client.post(f"/api/actuators/{valve['id']}/command", json={"target": "OPEN"})
    sensor = add_sensor(client)

    restarted = create_app(settings).state.devices.list_devices()

    assert restarted["actuators"][0]["state"] == "OPEN"
    assert restarted["sensors"][0]["id"] == sensor["id"]
    assert (restarted["sensors"][0]["x"], restarted["sensors"][0]["y"]) == (0.2, 0.3)


def test_sensor_layout_can_be_changed(client: TestClient, app: FastAPI) -> None:
    sensor = add_sensor(client)
    response = client.patch(f"/api/sensors/{sensor['id']}", json={"name": "PT-2", "x": 0.9})

    assert response.status_code == 200
    stored = app.state.devices.list_devices()["sensors"][0]
    assert (stored["name"], stored["x"], stored["y"]) == ("PT-2", 0.9, 0.3)


def test_sensors_can_be_removed(client: TestClient) -> None:
    sensor = add_sensor(client)
    assert client.delete(f"/api/sensors/{sensor['id']}").status_code == 204
    assert client.get("/api/devices").json()["sensors"] == []
    assert client.delete(f"/api/sensors/{sensor['id']}").status_code == 404


def test_unknown_sensor_is_not_found(client: TestClient) -> None:
    assert client.patch("/api/sensors/unknown", json={"x": 0.1}).status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   ", "kind": "analog"},
        {"name": "PT", "kind": "valve"},
        {"name": "PT", "kind": "analog", "x": 1.5},
        {"name": "PT", "kind": "digital", "y": -0.1},
    ],
)
def test_invalid_sensors_are_refused(client: TestClient, settings: Settings, payload: dict) -> None:
    assert client.post("/api/sensors", json=payload).status_code == 422
    assert json.loads(settings.devices_path.read_text())["sensors"] == []


def test_sensor_changes_reach_connected_screens(client: TestClient) -> None:
    with client.websocket_connect("/ws/events", headers=ORIGIN) as screen:
        sensor = add_sensor(client)
        added = screen.receive_json()
        assert (added["type"], added["sensor"]["id"]) == ("sensor_added", sensor["id"])

        client.patch(f"/api/sensors/{sensor['id']}", json={"x": 0.7})
        updated = screen.receive_json()
        assert (updated["type"], updated["sensor"]["x"]) == ("sensor_updated", 0.7)

        client.delete(f"/api/sensors/{sensor['id']}")
        assert screen.receive_json() == {"type": "sensor_removed", "id": sensor["id"]}


def test_unreadable_file_stops_startup_and_is_kept(settings: Settings) -> None:
    settings.devices_path.write_text('{"actuators": [oops')

    with pytest.raises(DeviceFileError):
        create_app(settings)

    assert settings.devices_path.read_text() == '{"actuators": [oops'


def test_saving_leaves_no_temporary_file(client: TestClient, settings: Settings) -> None:
    add_sensor(client)
    leftovers = [path.name for path in settings.data_dir.glob(".devices.json.*")]
    assert leftovers == []

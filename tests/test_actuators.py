import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import USERNAME, add_valve


def test_new_actuators_start_in_their_initial_state(client: TestClient) -> None:
    valve = add_valve(client)
    cylinder = client.post("/api/actuators", json={"name": "C-1", "kind": "cylinder"}).json()

    assert valve["state"] == "CLOSED"
    assert valve["allowed_states"] == ["OPEN", "CLOSED"]
    assert cylinder["state"] == "RETRACTED"
    assert {item["id"] for item in client.get("/api/actuators").json()} == {
        valve["id"],
        cylinder["id"],
    }


def test_layout_can_be_changed_and_is_stored(client: TestClient, app: FastAPI) -> None:
    valve = add_valve(client)
    response = client.patch(
        f"/api/actuators/{valve['id']}", json={"name": "V-200", "x": 0.25, "y": 0.75}
    )

    assert response.status_code == 200
    stored = app.state.db.get_actuator(valve["id"])
    assert (stored["name"], stored["x"], stored["y"]) == ("V-200", 0.25, 0.75)
    assert stored["state"] == "CLOSED"


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "   ", "kind": "valve"},
        {"name": "V", "kind": "pump"},
        {"name": "V", "kind": "valve", "x": 1.5},
        {"name": "V", "kind": "valve", "y": -0.1},
    ],
)
def test_invalid_actuators_are_refused(client: TestClient, payload: dict) -> None:
    assert client.post("/api/actuators", json=payload).status_code == 422


def test_actuators_can_be_removed(client: TestClient) -> None:
    valve = add_valve(client)
    assert client.delete(f"/api/actuators/{valve['id']}").status_code == 204
    assert client.get("/api/actuators").json() == []
    assert client.delete(f"/api/actuators/{valve['id']}").status_code == 404


def test_command_changes_the_state_in_the_table(client: TestClient, app: FastAPI) -> None:
    valve = add_valve(client)
    response = client.post(f"/api/actuators/{valve['id']}/command", json={"target": "OPEN"})

    assert response.status_code == 200
    assert response.json()["state"] == "OPEN"
    stored = app.state.db.get_actuator(valve["id"])
    assert stored["state"] == "OPEN"
    assert stored["updated_by"] == USERNAME
    assert stored["updated_at"] is not None


@pytest.mark.parametrize("target", ["BANANA", "EXTENDED", ""])
def test_invalid_target_leaves_the_state_unchanged(
    client: TestClient, app: FastAPI, target: str
) -> None:
    valve = add_valve(client)
    response = client.post(f"/api/actuators/{valve['id']}/command", json={"target": target})

    assert response.status_code == 422
    assert app.state.db.get_actuator(valve["id"])["state"] == "CLOSED"


def test_command_on_unknown_actuator_is_not_found(client: TestClient) -> None:
    response = client.post("/api/actuators/unknown/command", json={"target": "OPEN"})
    assert response.status_code == 404

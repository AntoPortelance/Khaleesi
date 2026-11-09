import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tests.conftest import ORIGIN, add_valve


def test_connection_without_session_is_refused(anonymous: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect):
        with anonymous.websocket_connect("/ws/events", headers=ORIGIN):
            pass


@pytest.mark.parametrize("headers", [{"origin": "http://attacker.example"}, {}])
def test_connection_from_another_origin_is_refused(client: TestClient, headers: dict) -> None:
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/events", headers=headers):
            pass


def test_command_reaches_every_connected_screen(client: TestClient) -> None:
    valve = add_valve(client)
    with client.websocket_connect("/ws/events", headers=ORIGIN) as first:
        with client.websocket_connect("/ws/events", headers=ORIGIN) as second:
            response = client.post(f"/api/actuators/{valve['id']}/command", json={"target": "OPEN"})
            assert response.status_code == 200
            for screen in (first, second):
                event = screen.receive_json()
                assert event["type"] == "actuator_updated"
                assert event["actuator"]["id"] == valve["id"]
                assert event["actuator"]["state"] == "OPEN"


def test_layout_changes_are_broadcast(client: TestClient) -> None:
    with client.websocket_connect("/ws/events", headers=ORIGIN) as screen:
        valve = add_valve(client)
        assert screen.receive_json()["type"] == "actuator_added"

        client.delete(f"/api/actuators/{valve['id']}")
        assert screen.receive_json() == {"type": "actuator_removed", "id": valve["id"]}


def test_logout_closes_the_connection(client: TestClient) -> None:
    with client.websocket_connect("/ws/events", headers=ORIGIN) as screen:
        client.post("/api/auth/logout")
        with pytest.raises(WebSocketDisconnect):
            screen.receive_json()


def test_heartbeats_are_answered(client: TestClient) -> None:
    with client.websocket_connect("/ws/events", headers=ORIGIN) as screen:
        screen.send_text("ping")
        assert screen.receive_json() == {"type": "pong"}

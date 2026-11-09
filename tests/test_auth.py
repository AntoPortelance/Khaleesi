from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from khaleesi.app import create_app
from khaleesi.auth import LoginThrottle, SessionManager, hash_password
from khaleesi.config import Settings
from tests.conftest import CREDENTIALS, PASSWORD, USERNAME


def test_login_gives_access_to_protected_routes(client: TestClient) -> None:
    assert client.get("/api/auth/me").json() == {"username": USERNAME}


def test_wrong_password_and_unknown_user_get_the_same_answer(anonymous: TestClient) -> None:
    wrong_password = anonymous.post(
        "/api/auth/login", json={"username": USERNAME, "password": "wrong"}
    )
    unknown_user = anonymous.post(
        "/api/auth/login", json={"username": "nobody", "password": "wrong"}
    )
    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json() == unknown_user.json()


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/auth/me"),
        ("GET", "/api/actuators"),
        ("POST", "/api/actuators"),
        ("PATCH", "/api/actuators/some-id"),
        ("DELETE", "/api/actuators/some-id"),
        ("POST", "/api/actuators/some-id/command"),
        ("GET", "/api/bench/pid"),
        ("PUT", "/api/bench/pid"),
    ],
)
def test_protected_routes_refuse_anonymous_requests(
    anonymous: TestClient, method: str, path: str
) -> None:
    assert anonymous.request(method, path).status_code == 401


def test_pages_follow_the_session(anonymous: TestClient) -> None:
    response = anonymous.get("/")
    assert response.status_code == 303
    assert response.headers["location"] == "/login"
    assert anonymous.get("/login").status_code == 200

    anonymous.post("/api/auth/login", json=CREDENTIALS)
    assert anonymous.get("/").status_code == 200
    assert anonymous.get("/login").headers["location"] == "/"


def test_logout_ends_the_session(client: TestClient) -> None:
    token = client.cookies.get("khaleesi_session")
    assert client.post("/api/auth/logout").status_code == 204

    client.cookies.set("khaleesi_session", token)
    assert client.get("/api/auth/me").status_code == 401


def test_repeated_failures_block_even_the_right_password(anonymous: TestClient) -> None:
    for _ in range(5):
        response = anonymous.post(
            "/api/auth/login", json={"username": USERNAME, "password": "wrong"}
        )
        assert response.status_code == 401

    response = anonymous.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 429


def test_session_cookie_is_protected(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))
    app.state.db.create_user(USERNAME, hash_password(PASSWORD))
    with TestClient(app) as client:
        cookie = client.post("/api/auth/login", json=CREDENTIALS).headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=strict" in cookie


def test_session_expires() -> None:
    now = [0.0]
    sessions = SessionManager(lifetime_seconds=10, clock=lambda: now[0])
    token = sessions.create(USERNAME)
    assert sessions.get(token) == USERNAME
    now[0] = 10.0
    assert sessions.get(token) is None


def test_throttle_releases_after_the_block() -> None:
    now = [0.0]
    throttle = LoginThrottle(max_failures=2, block_seconds=60, clock=lambda: now[0])
    throttle.record_failure("key")
    assert not throttle.is_blocked("key")
    throttle.record_failure("key")
    assert throttle.is_blocked("key")
    now[0] = 60.0
    assert not throttle.is_blocked("key")

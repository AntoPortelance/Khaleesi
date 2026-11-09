from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from khaleesi.app import create_app
from khaleesi.auth import hash_password
from khaleesi.config import Settings

USERNAME = "alice"
PASSWORD = "correct horse"
CREDENTIALS = {"username": USERNAME, "password": PASSWORD}
ORIGIN = {"origin": "http://testserver"}


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(data_dir=tmp_path, cookie_secure=False, max_pid_bytes=1024)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    application = create_app(settings)
    application.state.db.create_user(USERNAME, hash_password(PASSWORD))
    return application


@pytest.fixture
def anonymous(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app, follow_redirects=False) as client:
        yield client


@pytest.fixture
def client(anonymous: TestClient) -> TestClient:
    assert anonymous.post("/api/auth/login", json=CREDENTIALS).status_code == 200
    return anonymous


def add_valve(client: TestClient, name: str = "V-101") -> dict:
    response = client.post("/api/actuators", json={"name": name, "kind": "valve"})
    assert response.status_code == 201
    return response.json()

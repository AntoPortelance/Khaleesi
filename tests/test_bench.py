import pytest
from fastapi.testclient import TestClient

from tests.conftest import ORIGIN

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32


def test_no_image_at_first(client: TestClient) -> None:
    assert client.get("/api/bench/pid").status_code == 404


@pytest.mark.parametrize(
    ("content", "media_type"),
    [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")],
)
def test_valid_image_is_stored_and_served(
    client: TestClient, content: bytes, media_type: str
) -> None:
    assert client.put("/api/bench/pid", content=content).status_code == 204

    response = client.get("/api/bench/pid")
    assert response.status_code == 200
    assert response.content == content
    assert response.headers["content-type"] == media_type


@pytest.mark.parametrize("content", [b"<svg onload='alert(1)'></svg>", b"not an image", b""])
def test_other_content_is_refused_even_with_an_image_type(
    client: TestClient, content: bytes
) -> None:
    response = client.put("/api/bench/pid", content=content, headers={"content-type": "image/png"})
    assert response.status_code == 415
    assert client.get("/api/bench/pid").status_code == 404


def test_image_over_the_limit_is_refused(client: TestClient) -> None:
    assert client.put("/api/bench/pid", content=PNG + b"\x00" * 1024).status_code == 413
    assert client.get("/api/bench/pid").status_code == 404


def test_new_image_replaces_the_old_one_and_notifies_screens(client: TestClient) -> None:
    client.put("/api/bench/pid", content=PNG)
    with client.websocket_connect("/ws/events", headers=ORIGIN) as screen:
        client.put("/api/bench/pid", content=JPEG)
        assert screen.receive_json() == {"type": "pid_changed"}
    assert client.get("/api/bench/pid").content == JPEG

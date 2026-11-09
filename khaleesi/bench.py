"""Upload and retrieval of the test stand's P&ID image."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from khaleesi.auth import CurrentUser
from khaleesi.files import write_atomically

_HEADER_BYTES = 12


def detect_image_type(header: bytes) -> str | None:
    """Identifies an accepted image from its content, never from what the client claims."""
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    return None


router = APIRouter(prefix="/api/bench")


@router.get("/pid")
def get_pid(_: CurrentUser, request: Request) -> FileResponse:
    path: Path = request.app.state.settings.pid_path
    try:
        with path.open("rb") as image:
            media_type = detect_image_type(image.read(_HEADER_BYTES))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="No P&ID has been loaded") from None
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.put("/pid", status_code=204)
async def put_pid(_: CurrentUser, request: Request) -> None:
    state = request.app.state
    limit = state.settings.max_pid_bytes
    too_large = HTTPException(status_code=413, detail="The image must not exceed 10 MB")

    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > limit:
            raise too_large

    if detect_image_type(bytes(content[:_HEADER_BYTES])) is None:
        raise HTTPException(status_code=415, detail="The image must be PNG, JPEG, or WebP")

    await run_in_threadpool(write_atomically, state.settings.pid_path, bytes(content))
    await state.hub.broadcast({"type": "pid_changed"})

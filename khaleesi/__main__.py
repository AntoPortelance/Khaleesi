"""Starts the server: python -m khaleesi."""

import uvicorn

from khaleesi.app import create_app
from khaleesi.config import Settings


def main() -> None:
    settings = Settings.from_env()
    # Sessions, the per-actuator exclusion, and WebSocket clients live in this process
    # only, so the server must never be started with several workers.
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        ssl_certfile=settings.ssl_certfile,
        ssl_keyfile=settings.ssl_keyfile,
    )


if __name__ == "__main__":
    main()

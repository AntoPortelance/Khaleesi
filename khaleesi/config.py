"""Runtime configuration, read from KHALEESI_* environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path = Path("data")
    host: str = "127.0.0.1"
    port: int = 8000
    ssl_certfile: str | None = None
    ssl_keyfile: str | None = None
    cookie_secure: bool = True
    session_hours: float = 8.0
    login_max_failures: int = 5
    login_block_seconds: float = 60.0
    max_pid_bytes: int = 10 * 1024 * 1024

    @property
    def db_path(self) -> Path:
        return self.data_dir / "khaleesi.sqlite"

    @property
    def devices_path(self) -> Path:
        return self.data_dir / "devices.json"

    @property
    def pid_path(self) -> Path:
        return self.data_dir / "pid_image"

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        return cls(
            data_dir=Path(os.environ.get("KHALEESI_DATA_DIR", defaults.data_dir)),
            host=os.environ.get("KHALEESI_HOST", defaults.host),
            port=int(os.environ.get("KHALEESI_PORT", defaults.port)),
            ssl_certfile=os.environ.get("KHALEESI_SSL_CERTFILE"),
            ssl_keyfile=os.environ.get("KHALEESI_SSL_KEYFILE"),
            cookie_secure=_env_bool("KHALEESI_COOKIE_SECURE", defaults.cookie_secure),
            session_hours=float(os.environ.get("KHALEESI_SESSION_HOURS", defaults.session_hours)),
        )

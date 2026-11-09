"""SQLite storage. Every SQL statement of the application lives in this module."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actuators (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('valve', 'cylinder')),
    state      TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    updated_by TEXT,
    updated_at TEXT
);
"""


class UserExistsError(Exception):
    """The requested username is already taken."""


class Database:
    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._transaction() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(_SCHEMA)

    def create_user(self, username: str, password_hash: str) -> None:
        try:
            with self._transaction() as connection:
                connection.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, password_hash),
                )
        except sqlite3.IntegrityError as error:
            raise UserExistsError(username) from error

    def find_password_hash(self, username: str) -> str | None:
        with self._transaction() as connection:
            row = connection.execute(
                "SELECT password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
        return row["password_hash"] if row else None

    def list_actuators(self) -> list[dict]:
        with self._transaction() as connection:
            rows = connection.execute("SELECT * FROM actuators ORDER BY name").fetchall()
        return [dict(row) for row in rows]

    def get_actuator(self, actuator_id: str) -> dict | None:
        with self._transaction() as connection:
            return self._select_actuator(connection, actuator_id)

    def add_actuator(
        self, actuator_id: str, name: str, kind: str, state: str, x: float, y: float
    ) -> dict:
        with self._transaction() as connection:
            connection.execute(
                "INSERT INTO actuators (id, name, kind, state, x, y) VALUES (?, ?, ?, ?, ?, ?)",
                (actuator_id, name, kind, state, x, y),
            )
            return self._select_actuator(connection, actuator_id)

    def update_actuator_layout(
        self, actuator_id: str, name: str | None, x: float | None, y: float | None
    ) -> dict | None:
        with self._transaction() as connection:
            connection.execute(
                "UPDATE actuators SET name = COALESCE(?, name), x = COALESCE(?, x), "
                "y = COALESCE(?, y) WHERE id = ?",
                (name, x, y, actuator_id),
            )
            return self._select_actuator(connection, actuator_id)

    def set_actuator_state(
        self, actuator_id: str, state: str, updated_by: str, updated_at: str
    ) -> dict | None:
        with self._transaction() as connection:
            connection.execute(
                "UPDATE actuators SET state = ?, updated_by = ?, updated_at = ? WHERE id = ?",
                (state, updated_by, updated_at, actuator_id),
            )
            return self._select_actuator(connection, actuator_id)

    def delete_actuator(self, actuator_id: str) -> bool:
        with self._transaction() as connection:
            cursor = connection.execute("DELETE FROM actuators WHERE id = ?", (actuator_id,))
            return cursor.rowcount > 0

    @staticmethod
    def _select_actuator(connection: sqlite3.Connection, actuator_id: str) -> dict | None:
        row = connection.execute("SELECT * FROM actuators WHERE id = ?", (actuator_id,)).fetchone()
        return dict(row) if row else None

"""SQLite storage of user accounts, test runs, and measurements.

Every SQL statement of the application lives here. Sensors and actuators are stored
elsewhere (see device_store.py), so a measurement refers to its sensor by a plain
identifier, without a foreign key. A test run refers to its operator by a real
foreign key on users.
"""

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

CREATE TABLE IF NOT EXISTS tests (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    started_at  TEXT NOT NULL,
    ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS measurements (
    test_id   TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    sensor_id TEXT NOT NULL,
    timestamp REAL NOT NULL,
    value     REAL NOT NULL,
    PRIMARY KEY (test_id, sensor_id, timestamp)
) WITHOUT ROWID;
"""

_SELECT_TEST = (
    "SELECT tests.id, tests.name, tests.operator_id, users.username AS operator, "
    "tests.started_at, tests.ended_at "
    "FROM tests JOIN users ON users.id = tests.operator_id"
)


class UserExistsError(Exception):
    """The requested username is already taken."""


class Database:
    def __init__(self, path: Path) -> None:
        self._path = path

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._path, timeout=10.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA synchronous=NORMAL")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._transaction() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(_SCHEMA)

    # --- Users ---

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

    def find_user_id(self, username: str) -> int | None:
        with self._transaction() as connection:
            row = connection.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
        return row["id"] if row else None

    # --- Tests ---

    def create_test(self, test_id: str, name: str, operator_id: int, started_at: str) -> dict:
        """An unknown operator_id raises sqlite3.IntegrityError."""
        with self._transaction() as connection:
            connection.execute(
                "INSERT INTO tests (id, name, operator_id, started_at) VALUES (?, ?, ?, ?)",
                (test_id, name, operator_id, started_at),
            )
            return self._select_test(connection, test_id)

    def end_test(self, test_id: str, ended_at: str) -> dict | None:
        """Closes a test. A test that is already closed keeps its original end time."""
        with self._transaction() as connection:
            connection.execute(
                "UPDATE tests SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
                (ended_at, test_id),
            )
            return self._select_test(connection, test_id)

    def get_test(self, test_id: str) -> dict | None:
        with self._transaction() as connection:
            return self._select_test(connection, test_id)

    def list_tests(self) -> list[dict]:
        with self._transaction() as connection:
            rows = connection.execute(
                f"{_SELECT_TEST} ORDER BY tests.started_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    # --- Measurements ---

    def insert_measurements(self, test_id: str, batch: list[dict]) -> None:
        """Stores a batch in one transaction, so it is written entirely or not at all.

        Each item is {"sensor_id": str, "timestamp": float, "value": float}. An unknown
        test or a duplicate (test, sensor, timestamp) raises sqlite3.IntegrityError.
        """
        rows = [(test_id, m["sensor_id"], m["timestamp"], m["value"]) for m in batch]
        with self._transaction() as connection:
            connection.executemany(
                "INSERT INTO measurements (test_id, sensor_id, timestamp, value) "
                "VALUES (?, ?, ?, ?)",
                rows,
            )

    def query_measurements(
        self,
        test_id: str,
        sensor_id: str | None = None,
        t_start: float | None = None,
        t_end: float | None = None,
        limit: int = 100_000,
    ) -> list[dict]:
        query = "SELECT sensor_id, timestamp, value FROM measurements WHERE test_id = ?"
        params: list = [test_id]
        if sensor_id is not None:
            query += " AND sensor_id = ?"
            params.append(sensor_id)
        if t_start is not None:
            query += " AND timestamp >= ?"
            params.append(t_start)
        if t_end is not None:
            query += " AND timestamp <= ?"
            params.append(t_end)
        query += " ORDER BY timestamp LIMIT ?"
        params.append(limit)
        with self._transaction() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def _select_test(connection: sqlite3.Connection, test_id: str) -> dict | None:
        row = connection.execute(f"{_SELECT_TEST} WHERE tests.id = ?", (test_id,)).fetchone()
        return dict(row) if row else None
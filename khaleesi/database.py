"""SQLite storage of user accounts, sensors, test runs, and measurements.

Every SQL statement of the application lives here. Sensor positions and types stay in
device_store.py (devices.json); this module only keeps the identity of each sensor so
that measurements can reference a real sensor row. A measurement may belong to a test
run, or to none.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

# Timestamps are stored as seconds since the Unix epoch (SQLite keeps them as numbers).
_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensors (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    started_at  TEXT NOT NULL,
    ended_at    TEXT
);

CREATE TABLE IF NOT EXISTS measurements (
    sensor_id INTEGER NOT NULL REFERENCES sensors(id),
    timestamp TIMESTAMP NOT NULL,
    value     REAL NOT NULL,
    test_id   INTEGER REFERENCES tests(id),
    PRIMARY KEY (sensor_id, timestamp)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_measurements_test
    ON measurements (test_id, sensor_id, timestamp);
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

    # --- Sensors ---

    def add_sensor(self, name: str) -> dict:
        """Creates a sensor and returns it with its generated integer id."""
        with self._transaction() as connection:
            cursor = connection.execute("INSERT INTO sensors (name) VALUES (?)", (name,))
            return {"id": cursor.lastrowid, "name": name}

    def rename_sensor(self, sensor_id: int, name: str) -> bool:
        with self._transaction() as connection:
            cursor = connection.execute(
                "UPDATE sensors SET name = ? WHERE id = ?", (name, sensor_id)
            )
            return cursor.rowcount > 0

    def delete_sensor(self, sensor_id: int) -> bool:
        """Refused with sqlite3.IntegrityError while measurements still use the sensor."""
        with self._transaction() as connection:
            cursor = connection.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
            return cursor.rowcount > 0

    def list_sensors(self) -> list[dict]:
        with self._transaction() as connection:
            rows = connection.execute("SELECT * FROM sensors ORDER BY name").fetchall()
        return [dict(row) for row in rows]

    # --- Tests ---

    def create_test(self, name: str, operator_id: int, started_at: str) -> dict:
        """The id is generated. An unknown operator_id raises sqlite3.IntegrityError."""
        with self._transaction() as connection:
            cursor = connection.execute(
                "INSERT INTO tests (name, operator_id, started_at) VALUES (?, ?, ?)",
                (name, operator_id, started_at),
            )
            return self._select_test(connection, cursor.lastrowid)

    def end_test(self, test_id: int, ended_at: str) -> dict | None:
        """Closes a test. A test that is already closed keeps its original end time."""
        with self._transaction() as connection:
            connection.execute(
                "UPDATE tests SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
                (ended_at, test_id),
            )
            return self._select_test(connection, test_id)

    def get_test(self, test_id: int) -> dict | None:
        with self._transaction() as connection:
            return self._select_test(connection, test_id)

    def list_tests(self) -> list[dict]:
        with self._transaction() as connection:
            rows = connection.execute(
                f"{_SELECT_TEST} ORDER BY tests.started_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    # --- Measurements ---

    def insert_measurements(self, test_id: int | None, batch: list[dict]) -> None:
        """Stores a batch in one transaction, so it is written entirely or not at all.

        Each item is {"sensor_id": int, "timestamp": float, "value": float}. Pass
        test_id=None for measurements taken outside any test. An unknown sensor or
        test, or a duplicate (sensor, timestamp), raises sqlite3.IntegrityError.
        """
        rows = [(m["sensor_id"], m["timestamp"], m["value"], test_id) for m in batch]
        with self._transaction() as connection:
            connection.executemany(
                "INSERT INTO measurements (sensor_id, timestamp, value, test_id) "
                "VALUES (?, ?, ?, ?)",
                rows,
            )

    def query_measurements(
        self,
        test_id: int | None = None,
        sensor_id: int | None = None,
        t_start: float | None = None,
        t_end: float | None = None,
        limit: int = 100_000,
    ) -> list[dict]:
        """Every filter is optional; without test_id, measurements of any test are read."""
        query = "SELECT sensor_id, timestamp, value, test_id FROM measurements WHERE 1 = 1"
        params: list = []
        if test_id is not None:
            query += " AND test_id = ?"
            params.append(test_id)
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
    def _select_test(connection: sqlite3.Connection, test_id: int) -> dict | None:
        row = connection.execute(f"{_SELECT_TEST} WHERE tests.id = ?", (test_id,)).fetchone()
        return dict(row) if row else None

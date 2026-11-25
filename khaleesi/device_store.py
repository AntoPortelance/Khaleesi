"""JSON storage of the test stand's sensors and actuators, with their positions."""

import threading
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, ValidationError

from khaleesi.files import write_atomically

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
# Positions are fractions of the P&ID size, so they hold at any screen size.
Coordinate = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
ActuatorKind = Literal["valve", "cylinder"]
SensorKind = Literal["analog", "digital"]


class Actuator(BaseModel):
    id: str
    name: Name
    kind: ActuatorKind
    state: str
    x: Coordinate
    y: Coordinate
    updated_by: str | None = None
    updated_at: str | None = None


class Sensor(BaseModel):
    id: str
    name: Name
    kind: SensorKind
    x: Coordinate
    y: Coordinate


class _DeviceFile(BaseModel):
    actuators: list[Actuator] = []
    sensors: list[Sensor] = []


class DeviceFileError(Exception):
    """The device file exists but cannot be used."""


def _layout_changes(name: str | None, x: float | None, y: float | None) -> dict:
    changes = {"name": name, "x": x, "y": y}
    return {field: value for field, value in changes.items() if value is not None}


class DeviceStore:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    def initialize(self) -> None:
        """Creates the file if needed, and refuses to replace one it cannot read."""
        if self._path.exists():
            self._read()
        else:
            self._write(_DeviceFile())

    def list_devices(self) -> dict:
        return self._read().model_dump()

    def list_actuators(self) -> list[dict]:
        return self.list_devices()["actuators"]

    def get_actuator(self, actuator_id: str) -> dict | None:
        actuator = self._find(self._read().actuators, actuator_id)
        return actuator.model_dump() if actuator else None

    def add_actuator(
        self, actuator_id: str, name: str, kind: str, state: str, x: float, y: float
    ) -> dict:
        actuator = Actuator(id=actuator_id, name=name, kind=kind, state=state, x=x, y=y)
        return self._add("actuators", actuator)

    def update_actuator_layout(
        self, actuator_id: str, name: str | None, x: float | None, y: float | None
    ) -> dict | None:
        return self._change("actuators", actuator_id, _layout_changes(name, x, y))

    def set_actuator_state(
        self, actuator_id: str, state: str, updated_by: str, updated_at: str
    ) -> dict | None:
        changes = {"state": state, "updated_by": updated_by, "updated_at": updated_at}
        return self._change("actuators", actuator_id, changes)

    def delete_actuator(self, actuator_id: str) -> bool:
        return self._delete("actuators", actuator_id)

    def add_sensor(self, sensor_id: str, name: str, kind: str, x: float, y: float) -> dict:
        return self._add("sensors", Sensor(id=sensor_id, name=name, kind=kind, x=x, y=y))

    def update_sensor_layout(
        self, sensor_id: str, name: str | None, x: float | None, y: float | None
    ) -> dict | None:
        return self._change("sensors", sensor_id, _layout_changes(name, x, y))

    def delete_sensor(self, sensor_id: str) -> bool:
        return self._delete("sensors", sensor_id)

    def _read(self) -> _DeviceFile:
        try:
            return _DeviceFile.model_validate_json(self._path.read_bytes())
        except ValidationError as error:
            raise DeviceFileError(f"{self._path} is not a valid device file: {error}") from error

    def _write(self, devices: _DeviceFile) -> None:
        write_atomically(self._path, devices.model_dump_json(indent=2).encode() + b"\n")

    @staticmethod
    def _find(devices: list, device_id: str) -> Actuator | Sensor | None:
        return next((device for device in devices if device.id == device_id), None)

    def _add(self, section: str, device: Actuator | Sensor) -> dict:
        with self._lock:
            devices = self._read()
            getattr(devices, section).append(device)
            self._write(devices)
        return device.model_dump()

    def _change(self, section: str, device_id: str, changes: dict) -> dict | None:
        with self._lock:
            devices = self._read()
            device = self._find(getattr(devices, section), device_id)
            if device is None:
                return None
            for field, value in changes.items():
                setattr(device, field, value)
            self._write(devices)
        return device.model_dump()

    def _delete(self, section: str, device_id: str) -> bool:
        with self._lock:
            devices = self._read()
            items = getattr(devices, section)
            device = self._find(items, device_id)
            if device is None:
                return False
            items.remove(device)
            self._write(devices)
        return True

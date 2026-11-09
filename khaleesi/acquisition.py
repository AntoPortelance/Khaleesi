"""Sensor acquisition interface. Not implemented yet and never started by the server.

Acquisition will run in its own process, separate from the web server so that display
traffic cannot slow down measurements, and will reach the server through a
``multiprocessing`` queue.
"""

from multiprocessing.queues import Queue
from multiprocessing.synchronize import Event

_NOT_IMPLEMENTED = "Sensor acquisition is not implemented yet"


class AcquisitionService:
    def start(self) -> None:
        """Starts the acquisition process."""
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def stop(self) -> None:
        """Stops the acquisition process and flushes pending measurements."""
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def sample_sensors(self) -> list[dict]:
        """Reads every configured sensor once and returns timestamped measurements."""
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def publish_telemetry(self, measurements: list[dict]) -> None:
        """Sends a reduced-rate copy of the measurements to connected browsers."""
        raise NotImplementedError(_NOT_IMPLEMENTED)

    def record_measurements(self, test_id: str, measurements: list[dict]) -> None:
        """Stores a batch of measurements for a test."""
        raise NotImplementedError(_NOT_IMPLEMENTED)


def run_acquisition_process(telemetry_queue: Queue, stop_event: Event) -> None:
    """Entry point of the acquisition process."""
    raise NotImplementedError(_NOT_IMPLEMENTED)

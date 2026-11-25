"""File helpers shared by the storage code."""

import os
import tempfile
from pathlib import Path


def write_atomically(path: Path, content: bytes) -> None:
    """Replaces a file in one step: a power cut leaves either the old or the new version."""
    descriptor, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(descriptor, "wb") as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        Path(temporary_name).unlink(missing_ok=True)
        raise

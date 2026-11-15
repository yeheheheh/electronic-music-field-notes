"""Library source protocol and shared file helpers."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Protocol

from djcore.contracts import TrackRef

AUDIO_EXTENSIONS = {".wav", ".aiff", ".aif", ".flac", ".mp3", ".m4a", ".ogg"}


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


class LibrarySource(Protocol):
    def list_tracks(self) -> list[TrackRef]:
        ...

    def resolve(self, track_id: str) -> Path:
        ...

    def sidecar(self, track_id: str) -> dict:
        ...


def read_sidecar(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))

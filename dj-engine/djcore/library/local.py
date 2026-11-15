"""Local folder library with optional JSON sidecars."""

from __future__ import annotations

import json
from pathlib import Path

from djcore.contracts import TrackRef
from djcore.library.base import AUDIO_EXTENSIONS, read_sidecar, sha256_file


class LocalLibrary:
    def __init__(self, root: Path, sidecars: Path | None = None):
        self.root = Path(root)
        self.sidecars = Path(sidecars) if sidecars else self.root.parent / "sidecars"
        self._tracks: list[TrackRef] | None = None
        self._by_id: dict[str, TrackRef] = {}

    def list_tracks(self) -> list[TrackRef]:
        if self._tracks is not None:
            return list(self._tracks)
        tracks: list[TrackRef] = []
        for path in sorted(self.root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            digest = sha256_file(path)
            sidecar = read_sidecar(self.sidecars / f"{path.stem}.json")
            track = TrackRef(
                id=f"sha1-{digest[:16]}",
                title=sidecar.get("title") or path.stem,
                artist=sidecar.get("artist") or "",
                path=str(path),
                duration_sec=float(sidecar.get("durationSec") or 0.0),
                sha256=digest,
                genre_id=sidecar.get("genreId"),
            )
            tracks.append(track)
            self._by_id[track.id] = track
        self._tracks = tracks
        return list(tracks)

    def resolve(self, track_id: str) -> Path:
        self.list_tracks()
        track = self._by_id.get(track_id)
        if track is None:
            raise KeyError(f"unknown track: {track_id}")
        return Path(track.path)

    def sidecar(self, track_id: str) -> dict:
        path = self.resolve(track_id)
        return read_sidecar(self.sidecars / f"{path.stem}.json")

    def write_sidecar(self, path: Path, payload: dict) -> None:
        self.sidecars.mkdir(parents=True, exist_ok=True)
        target = self.sidecars / f"{path.stem}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

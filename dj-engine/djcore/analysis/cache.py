"""Analysis cache keyed by audio hash and analysis version."""

from __future__ import annotations

import json
from pathlib import Path

from djcore.config import ANALYSIS_VERSION, CACHE
from djcore.contracts import SCHEMA_VERSION, TrackAnalysis, dump_json


def analysis_path(digest: str) -> Path:
    return CACHE / "analysis" / f"{digest[:32]}.json"


def load_analysis(digest: str) -> TrackAnalysis | None:
    path = analysis_path(digest)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("schemaVersion") != SCHEMA_VERSION or payload.get("analysisVersion") != ANALYSIS_VERSION:
            return None
        return TrackAnalysis.model_validate(payload)
    except Exception:
        return None


def save_analysis(analysis: TrackAnalysis) -> Path:
    path = analysis_path(analysis.track.sha256)
    dump_json(path, analysis)
    return path

"""Vocal activity from a Demucs vocal stem, with fixture-sidecar fallback."""

from __future__ import annotations

import numpy as np

from djcore.analysis.structure import bar_grid
from djcore.contracts import VocalSegment


def detect_vocals(stem_path: str, downbeats: list[float], bpm: float, duration: float) -> list[VocalSegment]:
    import soundfile as sf

    audio, sr = sf.read(stem_path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    grid = bar_grid(downbeats, bpm, duration)
    rms = []
    for start, end in zip(grid, grid[1:]):
        chunk = mono[int(start * sr):int(end * sr)]
        rms.append(float(np.sqrt(np.mean(chunk ** 2))) if chunk.size else 0.0)
    if not rms or max(rms) <= 1e-6:
        return []
    threshold = max(float(np.median(rms)) * 1.8, float(np.percentile(rms, 70)))
    active = [value > threshold for value in rms]
    segments: list[VocalSegment] = []
    index = 0
    while index < len(active):
        if not active[index]:
            index += 1
            continue
        start = index
        while index < len(active) and active[index]:
            index += 1
        end = index
        if end - start >= 1:
            confidence = float(np.clip(np.mean(rms[start:end]) / (max(rms) + 1e-9), 0.2, 0.9))
            segments.append(VocalSegment(
                start_sec=float(grid[start]),
                end_sec=float(grid[min(end, len(grid) - 1)]),
                confidence=confidence,
            ))
    return segments


def vocals_from_sidecar(sidecar: dict, bpm: float) -> list[VocalSegment]:
    bar_duration = 4.0 * 60.0 / max(bpm, 1e-6)
    segments: list[VocalSegment] = []
    for item in sidecar.get("vocals", []) or []:
        if "startSec" in item and "endSec" in item:
            segments.append(VocalSegment(start_sec=float(item["startSec"]), end_sec=float(item["endSec"]), confidence=0.9))
            continue
        start_bar = int(item.get("startBar", 1))
        end_bar = int(item.get("endBar", start_bar))
        segments.append(VocalSegment(
            start_sec=(start_bar - 1) * bar_duration,
            end_sec=end_bar * bar_duration,
            confidence=0.9,
        ))
    return segments

"""Analysis orchestration: decode, beat/key, stems, structure, loudness, cache."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

import numpy as np

from djcore.analysis.audio_io import load_audio
from djcore.analysis.beats import detect_beats
from djcore.analysis.cache import load_analysis, save_analysis
from djcore.analysis.key import detect_key
from djcore.analysis.stems import separate
from djcore.analysis.structure import analyze_structure, bar_grid
from djcore.analysis.vocals import detect_vocals, vocals_from_sidecar
from djcore.config import ANALYSIS_VERSION, ENGINE_ROOT, SAMPLE_RATE
from djcore.contracts import (
    BeatsInfo,
    BpmInfo,
    Build,
    Drop,
    KeyInfo,
    Loudness,
    Phrase,
    TrackAnalysis,
    TrackRef,
)
from djcore.library.base import sha256_file


def _relative(path: str | Path) -> str:
    try:
        return os.path.relpath(str(path), str(ENGINE_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def _loudness(y: np.ndarray, sr: int) -> Loudness:
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    peak_db = 20.0 * np.log10(peak + 1e-9)
    try:
        import pyloudnorm

        meter = pyloudnorm.Meter(sr)
        lufs = float(meter.integrated_loudness(y))
        if not np.isfinite(lufs):
            lufs = -23.0
    except Exception:
        lufs = -23.0
    return Loudness(integrated_lufs=round(lufs, 2), peak_db=round(peak_db, 2))


def _sidecar_truth(
    sidecar: dict,
    grid: list[float],
    bpm: BpmInfo,
    beats: BeatsInfo,
    key: KeyInfo,
) -> dict:
    truth_bpm = float(sidecar.get("bpm") or bpm.value)
    truth_key = key
    if sidecar.get("key"):
        payload = dict(sidecar["key"])
        payload.setdefault("confidence", 0.99)
        truth_key = KeyInfo.model_validate(payload)

    drops = []
    for item in sidecar.get("drops", []) or []:
        bar = int(item.get("bar", 1))
        drops.append(Drop(
            sec=float(grid[min(bar - 1, len(grid) - 1)]),
            bar=bar,
            beat=int(item.get("beat", 1)),
            confidence=float(item.get("confidence", 0.99)),
            pre_drop_start_sec=None,
        ))
    builds = []
    for item in sidecar.get("builds", []) or []:
        start_bar = int(item.get("startBar", 1))
        end_bar = int(item.get("endBar", start_bar))
        builds.append(Build(
            start_sec=float(grid[min(start_bar - 1, len(grid) - 1)]),
            end_sec=float(grid[min(end_bar, len(grid) - 1)]),
            start_bar=start_bar,
            end_bar=end_bar,
            confidence=float(item.get("confidence", 0.99)),
        ))
    phrases = []
    for item in sidecar.get("phrases", []) or []:
        start_bar = int(item.get("startBar", 1))
        end_bar = int(item.get("endBar", start_bar))
        phrases.append(Phrase(
            start_bar=start_bar,
            end_bar=end_bar,
            start_sec=float(grid[min(start_bar - 1, len(grid) - 1)]),
            end_sec=float(grid[min(end_bar, len(grid) - 1)]),
            type=item.get("type", "groove"),
            confidence=0.99,
        ))
    return {
        "bpm": BpmInfo(value=truth_bpm, confidence=0.99, octave_ambiguous=bpm.octave_ambiguous),
        "beats": beats,
        "key": truth_key,
        "drops": drops,
        "builds": builds,
        "phrases": phrases,
    }


def _rescale_energy(points, target: float):
    values = [point.value for point in points]
    current = sum(values) / len(values) if values else 0.0
    if current <= 1e-6:
        return points
    factor = target / current
    for point in points:
        point.value = min(1.0, max(0.0, point.value * factor))
    return points


def analyze_track(
    track: TrackRef,
    sidecar: dict | None = None,
    *,
    separate_stems: bool = True,
    force: bool = False,
    use_sidecar_truth: bool = False,
    log: Callable[[str], None] | None = None,
) -> TrackAnalysis:
    sidecar = sidecar or {}
    path = Path(track.path)
    digest = track.sha256 or sha256_file(path)
    if not force:
        cached = load_analysis(digest)
        if cached is not None:
            has_truth = any("sidecar 手标" in warning for warning in cached.warnings)
            truth_ok = not use_sidecar_truth or has_truth
            stems_ok = not separate_stems or bool(cached.stems)
            if truth_ok and stems_ok:
                if log:
                    log(f"cache hit: {track.title}")
                return cached

    if log:
        log(f"analyze: {track.title}")
    y, sr = load_audio(path, sr=SAMPLE_RATE, mono=True)
    duration = len(y) / sr
    bpm, beats, downbeats = detect_beats(y, sr)
    key = detect_key(y, sr)

    warnings: list[str] = []
    stems: dict[str, str] = {}
    if separate_stems:
        try:
            stems = separate(path, digest, log=log)
        except Exception as exc:
            warnings.append(f"分轨失败：{exc}")

    vocals = []
    if stems.get("vocals"):
        vocals = detect_vocals(stems["vocals"], downbeats, bpm.value, duration)
    if not vocals and sidecar.get("vocals"):
        vocals = vocals_from_sidecar(sidecar, bpm.value)
        warnings.append("人声区间来自 sidecar（合成 fixture）")

    phrases, drops, builds, energy, features, structure_warnings = analyze_structure(
        y, sr, bpm.value, downbeats, vocals, bass_path=stems.get("bass")
    )
    warnings.extend(structure_warnings)

    grid = bar_grid(downbeats, bpm.value, duration)
    if use_sidecar_truth and sidecar:
        truth = _sidecar_truth(sidecar, grid, bpm, beats, key)
        bpm = truth["bpm"]
        key = truth["key"]
        drops = truth["drops"]
        builds = truth["builds"]
        phrases = truth["phrases"]
        vocals = vocals_from_sidecar(sidecar, bpm.value)
        if sidecar.get("energy") is not None:
            energy = _rescale_energy(energy, float(sidecar["energy"]))
        warnings.append("使用 sidecar 手标作为结构真值")

    track = track.model_copy(update={
        "duration_sec": round(duration, 3),
        "sha256": digest,
        "genre_id": sidecar.get("genreId") or track.genre_id,
    })
    analysis = TrackAnalysis(
        track=track,
        bpm=bpm,
        key=key,
        beats=beats,
        downbeats_sec=[float(value) for value in downbeats],
        phrases=phrases,
        drops=drops,
        builds=builds,
        energy=energy,
        vocals=vocals,
        loudness=_loudness(y, sr),
        stems={name: _relative(path_value) for name, path_value in stems.items()},
        features=features,
        genre_id=track.genre_id,
        analysis_version=ANALYSIS_VERSION,
        warnings=warnings,
    )
    save_analysis(analysis)
    return analysis


def analyze_tracks(
    tracks: list[TrackRef],
    sidecars: dict[str, dict] | None = None,
    *,
    separate_stems: bool = True,
    force: bool = False,
    use_sidecar_truth: bool = False,
    log: Callable[[str], None] | None = None,
) -> dict[str, TrackAnalysis]:
    sidecars = sidecars or {}
    result: dict[str, TrackAnalysis] = {}
    for track in tracks:
        result[track.id] = analyze_track(
            track,
            sidecars.get(track.id, {}),
            separate_stems=separate_stems,
            force=force,
            use_sidecar_truth=use_sidecar_truth,
            log=log,
        )
    return result

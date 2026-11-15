"""Bar-level structure: phrases, drops, builds, energy and timbre features."""

from __future__ import annotations

import numpy as np

from djcore.contracts import (
    Build,
    ClassifiedFeature,
    Drop,
    EnergyPoint,
    Phrase,
    TrackFeatures,
    VocalSegment,
)


def bar_grid(downbeats: list[float], bpm: float, duration: float) -> list[float]:
    bar_duration = 4.0 * 60.0 / max(bpm, 1e-6)
    if len(downbeats) >= 3:
        grid = list(downbeats)
        while grid[-1] + bar_duration <= duration + 0.05:
            grid.append(grid[-1] + bar_duration)
        if grid[-1] < duration:
            grid.append(duration)
        return grid
    count = max(2, int(np.ceil(duration / bar_duration)) + 1)
    return [min(duration, index * bar_duration) for index in range(count)]


def _bar_features(y: np.ndarray, sr: int, grid: list[float]) -> dict:
    import librosa

    stft = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low_bins = freqs < 200
    mid_bins = (freqs >= 200) & (freqs < 4000)
    high_bins = freqs >= 4000
    hop = sr / 512
    bars = []
    for start, end in zip(grid, grid[1:]):
        f0 = max(0, int(start * sr / 512))
        f1 = max(f0 + 1, int(end * sr / 512))
        chunk = stft[:, f0:f1]
        if chunk.size == 0:
            bars.append({"energy": 0.0, "low": 0.0, "mid": 0.0, "high": 0.0, "centroid": 0.0})
            continue
        low = float(np.mean(chunk[low_bins] ** 2))
        mid = float(np.mean(chunk[mid_bins] ** 2))
        high = float(np.mean(chunk[high_bins] ** 2))
        total = low + mid + high + 1e-12
        centroid = float(np.sum(freqs[:, None] * chunk) / (np.sum(chunk) + 1e-9))
        bars.append({
            "energy": float(np.sqrt(total)),
            "low": low / total,
            "mid": mid / total,
            "high": high / total,
            "centroid": centroid,
        })
    return {"bars": bars, "bar_seconds": hop}


def _normalize(values: list[float]) -> list[float]:
    array = np.asarray(values, dtype=float)
    maximum = float(np.max(array)) if array.size else 0.0
    if maximum <= 1e-9:
        return [0.0 for _ in values]
    return [float(value / maximum) for value in array]


def _detect_drop(bars: list[dict]) -> tuple[int | None, float]:
    if len(bars) < 16:
        return None, 0.0
    energy = np.array([bar["energy"] for bar in bars])
    low = np.array([bar["low"] * bar["energy"] for bar in bars])
    candidates = []
    for index in range(8, len(bars) - 8):
        baseline = float(np.median(low[max(0, index - 8):index])) + 1e-9
        jump = float(low[index]) / baseline
        rising = float(np.mean(np.diff(energy[max(0, index - 4):index + 1]))) > 0
        if jump >= 1.45 and energy[index] > 0.55 * float(np.max(energy)) and rising:
            candidates.append((index, jump))
    if not candidates:
        # Fall back to the largest low-band jump after the first eighth.
        index = int(np.argmax(low[8:]) + 8)
        baseline = float(np.median(low[max(0, index - 8):index])) + 1e-9
        jump = float(low[index]) / baseline
        if jump < 1.2:
            return None, 0.0
        return index, float(np.clip((jump - 1.0) / 2.0, 0.2, 0.7))
    index, jump = max(candidates, key=lambda item: item[1])
    return index, float(np.clip((jump - 1.0) / 2.0, 0.25, 0.95))


def _phrase(start_bar: int, end_bar: int, grid: list[float], phrase_type: str, confidence: float) -> Phrase | None:
    if end_bar < start_bar:
        return None
    start_sec = grid[min(start_bar - 1, len(grid) - 1)]
    end_sec = grid[min(end_bar, len(grid) - 1)]
    return Phrase(
        start_bar=start_bar,
        end_bar=end_bar,
        start_sec=float(start_sec),
        end_sec=float(end_sec),
        type=phrase_type,  # type: ignore[arg-type]
        confidence=confidence,
    )


def analyze_structure(
    y: np.ndarray,
    sr: int,
    bpm: float,
    downbeats: list[float],
    vocals: list[VocalSegment],
    bass_path: str | None = None,
) -> tuple[list[Phrase], list[Drop], list[Build], list[EnergyPoint], TrackFeatures, list[str]]:
    duration = len(y) / sr
    grid = bar_grid(downbeats, bpm, duration)
    features = _bar_features(y, sr, grid)
    bars = features["bars"]
    n_bars = len(bars)
    energy_norm = _normalize([bar["energy"] for bar in bars])
    warnings: list[str] = []

    drop_index, drop_conf = _detect_drop(bars)
    phrases: list[Phrase] = []
    drops: list[Drop] = []
    builds: list[Build] = []

    if drop_index is None:
        warnings.append("未检测到明确的 drop，结构按能量分段")
        intro_end = max(1, n_bars // 8)
        outro_start = max(intro_end + 1, n_bars - n_bars // 8 + 1)
        for piece in (
            _phrase(1, intro_end, grid, "intro", 0.4),
            _phrase(intro_end + 1, outro_start - 1, grid, "groove", 0.4),
            _phrase(outro_start, n_bars, grid, "outro", 0.4),
        ):
            if piece:
                phrases.append(piece)
    else:
        drop_bar = drop_index + 1
        build_start = max(2, drop_bar - 8)
        intro_end = build_start - 1
        break_start = min(n_bars - 7, drop_bar + 16)
        outro_start = max(break_start + 1, n_bars - 7)
        for piece in (
            _phrase(1, intro_end, grid, "intro", 0.6),
            _phrase(build_start, drop_bar - 1, grid, "build", 0.7),
            _phrase(drop_bar, max(drop_bar, break_start - 1), grid, "drop", drop_conf),
            _phrase(break_start, max(break_start, outro_start - 1), grid, "break", 0.45),
            _phrase(outro_start, n_bars, grid, "outro", 0.55),
        ):
            if piece:
                phrases.append(piece)
        drops.append(Drop(
            sec=float(grid[drop_index]),
            bar=drop_bar,
            beat=1,
            confidence=drop_conf,
            pre_drop_start_sec=float(grid[min(build_start - 1, len(grid) - 1)]),
        ))
        builds.append(Build(
            start_sec=float(grid[build_start - 1]),
            end_sec=float(grid[drop_index]),
            start_bar=build_start,
            end_bar=drop_bar - 1,
            confidence=0.6,
        ))

    energy: list[EnergyPoint] = []
    for start in range(0, n_bars, 8):
        end = min(n_bars, start + 8)
        value = float(np.mean(energy_norm[start:end])) if end > start else 0.0
        energy.append(EnergyPoint(
            start_sec=float(grid[start]),
            end_sec=float(grid[end]),
            value=float(np.clip(value, 0.0, 1.0)),
        ))

    low_ratio = float(np.mean([bar["low"] for bar in bars])) if bars else 0.0
    mid_ratio = float(np.mean([bar["mid"] for bar in bars])) if bars else 0.0
    high_ratio = float(np.mean([bar["high"] for bar in bars])) if bars else 0.0
    centroid = float(np.mean([bar["centroid"] for bar in bars])) if bars else 0.0

    groove = "floor" if 105 <= bpm <= 155 else ("half" if bpm > 155 else "swing")
    low_behavior = "pulse"
    if bass_path:
        try:
            import soundfile as sf

            bass, bass_sr = sf.read(bass_path, dtype="float32", always_2d=True)
            bass_mono = bass.mean(axis=1)
            envelope = np.abs(bass_mono)
            window = max(1, int(bass_sr * 0.02))
            envelope = np.convolve(envelope, np.ones(window) / window, mode="same")
            active = envelope > (np.max(envelope) * 0.1)
            if active.any():
                sustain_ratio = float(np.mean(active))
                low_behavior = "sustain" if sustain_ratio > 0.55 else "pulse"
        except Exception:
            warnings.append("低频行为读取失败，按 pulse 处理")

    track_features = TrackFeatures(
        low_ratio=low_ratio,
        mid_ratio=mid_ratio,
        high_ratio=high_ratio,
        spectral_centroid_hz=centroid,
        groove=ClassifiedFeature(class_name=groove, confidence=0.55),
        low_behavior=ClassifiedFeature(class_name=low_behavior, confidence=0.5),
    )
    return phrases, drops, builds, energy, track_features, warnings

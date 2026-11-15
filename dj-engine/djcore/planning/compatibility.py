"""Pairwise compatibility scoring shared by set planning and transition choice."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from djcore.config import DATA
from djcore.contracts import StyleIntent, TrackAnalysis, VocalSegment
from djcore.music import camelot_score, tempo_fit

_GROOVE_COMPAT = {
    ("floor", "floor"): 1.0,
    ("floor", "half"): 0.55,
    ("floor", "break"): 0.72,
    ("floor", "swing"): 0.8,
    ("floor", "none"): 0.4,
    ("break", "break"): 1.0,
    ("break", "swing"): 0.7,
    ("break", "half"): 0.5,
    ("break", "none"): 0.3,
    ("swing", "swing"): 1.0,
    ("swing", "half"): 0.55,
    ("swing", "none"): 0.35,
    ("half", "half"): 1.0,
    ("half", "none"): 0.3,
    ("none", "none"): 0.9,
}

_LOW_COMPAT = {
    ("pulse", "pulse"): 1.0,
    ("pulse", "sustain"): 0.7,
    ("pulse", "grit"): 0.8,
    ("pulse", "sink"): 0.6,
    ("pulse", "none"): 0.4,
    ("sustain", "sustain"): 1.0,
    ("sustain", "grit"): 0.6,
    ("sustain", "sink"): 0.65,
    ("sustain", "none"): 0.4,
    ("grit", "grit"): 1.0,
    ("grit", "sink"): 0.5,
    ("grit", "none"): 0.3,
    ("sink", "sink"): 1.0,
    ("sink", "none"): 0.35,
    ("none", "none"): 0.9,
}


def _symmetric(table: dict, a: str, b: str) -> float:
    if (a, b) in table:
        return table[(a, b)]
    if (b, a) in table:
        return table[(b, a)]
    return 0.5


def _normalize_low(value: str) -> str:
    return {"wobble": "sink", "sub": "sink"}.get(value, value)


@lru_cache(maxsize=1)
def load_genres() -> dict[str, dict]:
    path = Path(DATA) / "genres.json"
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8")).get("genres", {})


def genre_model(*ids: str | None) -> dict | None:
    genres = load_genres()
    for genre_id in ids:
        if not genre_id:
            continue
        if genre_id in genres:
            return genres[genre_id]
        for model in genres.values():
            if model.get("entryId") == genre_id or model.get("id") == genre_id:
                return model
    return None


def vocal_density(segments: list[VocalSegment], start: float, end: float) -> float:
    if end <= start:
        return 0.0
    covered = 0.0
    for segment in segments:
        overlap = min(end, segment.end_sec) - max(start, segment.start_sec)
        if overlap > 0:
            covered += overlap
    return min(1.0, covered / (end - start))


def energy_in_window(analysis: TrackAnalysis, start: float, end: float) -> float:
    if end <= start or not analysis.energy:
        values = [point.value for point in analysis.energy]
        return sum(values) / len(values) if values else 0.5
    total = 0.0
    weight = 0.0
    for point in analysis.energy:
        overlap = min(end, point.end_sec) - max(start, point.start_sec)
        if overlap > 0:
            total += point.value * overlap
            weight += overlap
    if weight <= 0:
        values = [point.value for point in analysis.energy]
        return sum(values) / len(values) if values else 0.5
    return total / weight


def _tail_window(analysis: TrackAnalysis, bars: int = 16) -> tuple[float, float]:
    duration = analysis.track.duration_sec or (analysis.beats.times_sec[-1] if analysis.beats.times_sec else 0.0)
    bar_seconds = 4.0 * 60.0 / max(analysis.bpm.value, 1e-6)
    return max(0.0, duration - bars * bar_seconds), duration


def _head_window(analysis: TrackAnalysis, bars: int = 16) -> tuple[float, float]:
    bar_seconds = 4.0 * 60.0 / max(analysis.bpm.value, 1e-6)
    return 0.0, min(analysis.track.duration_sec, bars * bar_seconds)


def _timbre_similarity(a: TrackAnalysis, b: TrackAnalysis) -> float:
    va = [a.features.low_ratio, a.features.mid_ratio, a.features.high_ratio, min(1.0, a.features.spectral_centroid_hz / 10000.0)]
    vb = [b.features.low_ratio, b.features.mid_ratio, b.features.high_ratio, min(1.0, b.features.spectral_centroid_hz / 10000.0)]
    dot = sum(x * y for x, y in zip(va, vb))
    na = sum(x * x for x in va) ** 0.5
    nb = sum(y * y for y in vb) ** 0.5
    return float(dot / (na * nb)) if na and nb else 0.5


@dataclass
class EdgeScore:
    total: float
    tempo: float
    key: float
    groove: float
    low: float
    energy: float
    vocal: float
    timbre: float
    effective_ratio: float
    tempo_mode: str
    reasons: list[str] = field(default_factory=list)


def score_pair(
    a: TrackAnalysis,
    b: TrackAnalysis,
    intent: StyleIntent,
    position: float = 0.5,
    target_energy: float | None = None,
    target_bpm: float | None = None,
) -> EdgeScore:
    if target_bpm is not None:
        ratio, tempo_mode, tempo_score = 1.0, "constant", 1.0
        tempo_reason = f"统一到 {target_bpm:g} BPM（原生 {a.bpm.value:g} / {b.bpm.value:g}）"
    else:
        ratio, tempo_mode, tempo_score = tempo_fit(a.bpm.value, b.bpm.value)
        tempo_reason = f"速度 {a.bpm.value:.1f} → {b.bpm.value:.1f}（{'半速/双速' if tempo_mode != 'constant' else f'{abs(ratio - 1.0) * 100:.1f}%'}）"
    if min(a.bpm.confidence, b.bpm.confidence) < 0.45:
        tempo_score = 0.5 + (tempo_score - 0.5) * 0.6

    key_score = camelot_score(a.key.camelot, b.key.camelot)
    key_weight = min(a.key.confidence, b.key.confidence)
    key_score = 0.5 + (key_score - 0.5) * max(0.25, key_weight)

    model_a = genre_model(a.genre_id, a.track.genre_id)
    model_b = genre_model(b.genre_id, b.track.genre_id)
    groove_a = (model_a or {}).get("groove") or a.features.groove.class_name
    groove_b = (model_b or {}).get("groove") or b.features.groove.class_name
    low_a = _normalize_low((model_a or {}).get("low") or a.features.low_behavior.class_name)
    low_b = _normalize_low((model_b or {}).get("low") or b.features.low_behavior.class_name)
    groove_score = _symmetric(_GROOVE_COMPAT, groove_a, groove_b)
    low_score = _symmetric(_LOW_COMPAT, low_a, low_b)

    a_start, a_end = _tail_window(a)
    b_start, b_end = _head_window(b)
    vocal_a = vocal_density(a.vocals, a_start, a_end)
    vocal_b = vocal_density(b.vocals, b_start, b_end)
    if vocal_a > 0.25 and vocal_b > 0.25:
        vocal_score = 0.15 if intent.vocal_tolerance == "low" else 0.3
    elif vocal_a > 0.25 or vocal_b > 0.25:
        vocal_score = 0.6 if intent.vocal_tolerance == "low" else 0.8
    else:
        vocal_score = 1.0

    energy_a = energy_in_window(a, a_start, a_end)
    energy_b = energy_in_window(b, b_start, b_end)
    if target_energy is None:
        energy_score = 1.0 - abs(energy_a - energy_b) * 0.6
    else:
        energy_score = 1.0 - (abs(energy_a - target_energy) + abs(energy_b - target_energy)) * 0.5
    energy_score = max(0.0, min(1.0, energy_score))

    timbre = _timbre_similarity(a, b)

    key_weight = 0.18 + 0.16 * intent.harmonic_strictness
    vocal_weight = {"low": 0.14, "any": 0.08, "instrumental": 0.18}[intent.vocal_tolerance]
    weights = {
        "tempo": 0.28,
        "key": key_weight,
        "groove": 0.14,
        "low": 0.10,
        "energy": 0.14,
        "vocal": vocal_weight,
        "timbre": 0.06,
    }
    norm = sum(weights.values())
    total = (
        tempo_score * weights["tempo"]
        + key_score * weights["key"]
        + groove_score * weights["groove"]
        + low_score * weights["low"]
        + energy_score * weights["energy"]
        + vocal_score * weights["vocal"]
        + timbre * weights["timbre"]
    ) / norm

    reasons = [
        tempo_reason,
        f"调性 {a.key.camelot} → {b.key.camelot}",
        f"鼓型 {groove_a} / {low_a} → {groove_b} / {low_b}",
    ]
    if tempo_score == 0:
        reasons.append("速度差超过 6%，不适合直接混音")
    if key_score < 0.35:
        reasons.append("调性冲突，建议短切或加滤波")
    if vocal_a > 0.25 and vocal_b > 0.25:
        reasons.append("两首尾部/头部都有人声，混音要错开")
    if energy_score > 0.75:
        reasons.append("能量衔接自然")

    return EdgeScore(
        total=round(float(np_clip(total)), 4),
        tempo=round(float(tempo_score), 4),
        key=round(float(key_score), 4),
        groove=round(float(groove_score), 4),
        low=round(float(low_score), 4),
        energy=round(float(energy_score), 4),
        vocal=round(float(vocal_score), 4),
        timbre=round(float(timbre), 4),
        effective_ratio=round(float(ratio), 5),
        tempo_mode=tempo_mode,
        reasons=reasons,
    )


def np_clip(value: float) -> float:
    return max(0.0, min(1.0, value))

"""Turn a style preset or a short prompt into a structured StyleIntent."""

from __future__ import annotations

from djcore.contracts import EnergyCurve, GenreWeight, StyleIntent
from djcore.planning.compatibility import genre_model, load_genres

PRESETS: dict[str, dict] = {
    "melodic-techno": {
        "label": "Melodic Techno",
        "genres": [("melodic-techno", 0.8), ("progressive-house", 0.2)],
        "bpm": [118, 126],
        "energy": "build",
        "vocal": "low",
        "harmonic": 0.82,
        "density": "normal",
    },
    "tech-house": {
        "label": "Tech House",
        "genres": [("tech-house", 1.0)],
        "bpm": [122, 128],
        "energy": "peak",
        "vocal": "any",
        "harmonic": 0.7,
        "density": "dense",
    },
    "progressive-house": {
        "label": "Progressive House",
        "genres": [("progressive-house", 1.0)],
        "bpm": [120, 132],
        "energy": "build",
        "vocal": "low",
        "harmonic": 0.78,
        "density": "normal",
    },
    "deep-house": {
        "label": "Deep House",
        "genres": [("deep-house", 1.0)],
        "bpm": [110, 124],
        "energy": "warmup",
        "vocal": "any",
        "harmonic": 0.72,
        "density": "sparse",
    },
    "peak-time": {
        "label": "Peak Time",
        "genres": [("tech-house", 0.6), ("melodic-techno", 0.4)],
        "bpm": [124, 132],
        "energy": "peak",
        "vocal": "low",
        "harmonic": 0.72,
        "density": "dense",
    },
    "sunrise": {
        "label": "Sunrise",
        "genres": [("melodic-techno", 0.55), ("progressive-house", 0.45)],
        "bpm": [118, 126],
        "energy": "build",
        "vocal": "low",
        "harmonic": 0.85,
        "density": "sparse",
    },
}

ENERGY_CURVES = {
    "warmup": [[0.0, 0.2], [0.4, 0.4], [0.8, 0.6], [1.0, 0.55]],
    "build": [[0.0, 0.25], [0.5, 0.55], [0.8, 0.88], [1.0, 0.7]],
    "peak": [[0.0, 0.5], [0.3, 0.8], [0.7, 0.95], [1.0, 0.85]],
    "wave": [[0.0, 0.3], [0.25, 0.7], [0.5, 0.45], [0.75, 0.85], [1.0, 0.6]],
    "flat": [[0.0, 0.55], [1.0, 0.55]],
}

_KEYWORDS = [
    (("melodic", "旋律", "melody"), ["melodic-techno", "progressive-house"]),
    (("progressive", "渐进", "prog"), ["progressive-house"]),
    (("deep", "深邃", "深沉", "chill", "放松"), ["deep-house"]),
    (("tech house", "techhouse", "科技浩室", "律动"), ["tech-house"]),
    (("techno", "科技舞曲", "工业"), ["melodic-techno", "tech-house"]),
    (("peak", "高峰", "硬", "hard", "主时段"), ["tech-house", "melodic-techno"]),
    (("sunrise", "日出", "清晨", "morning"), ["melodic-techno", "progressive-house"]),
]

_VOCAL_LOW = ("少人声", "无人声", "instrumental", "no vocal", "less vocal", "纯音乐")
_VOCAL_ANY = ("人声", "vocal", "唱")


def _merge_genres(*groups: list[tuple[str, float]]) -> list[GenreWeight]:
    scores: dict[str, float] = {}
    for group in groups:
        for genre_id, weight in group:
            scores[genre_id] = scores.get(genre_id, 0.0) + weight
    total = sum(scores.values()) or 1.0
    known = load_genres()
    return [
        GenreWeight(id=genre_id, weight=round(weight / total, 3))
        for genre_id, weight in sorted(scores.items(), key=lambda item: -item[1])
        if genre_id in known
    ]


def parse_intent(
    prompt: str = "",
    preset: str | None = None,
    *,
    duration_min: float = 8.0,
    energy_preset: str | None = None,
    vocal_tolerance: str | None = None,
    density: str | None = None,
    seed: int = 20261027,
) -> StyleIntent:
    base = PRESETS.get(preset or "", PRESETS["melodic-techno"])
    genres = list(base["genres"])
    lowered = prompt.lower()

    for tokens, genre_ids in _KEYWORDS:
        if any(token in lowered for token in tokens):
            genres.extend((genre_id, 0.35) for genre_id in genre_ids)

    vocal = vocal_tolerance or base["vocal"]
    if any(token in lowered for token in _VOCAL_LOW):
        vocal = "instrumental" if "纯音乐" in prompt or "instrumental" in lowered else "low"
    elif any(token in lowered for token in _VOCAL_ANY):
        vocal = "any"

    energy = energy_preset or base["energy"]
    if "日出" in prompt or "sunrise" in lowered:
        energy = "build"
    if "高峰" in prompt or "peak" in lowered:
        energy = "peak"
    if "放松" in prompt or "chill" in lowered:
        energy = "warmup"

    bpm_range = list(base["bpm"])
    for genre_id, _ in genres:
        model = genre_model(genre_id)
        if model:
            bpm_range[0] = max(bpm_range[0], float(model["bpmMin"]))
            bpm_range[1] = min(bpm_range[1], float(model["bpmMax"]))
    if bpm_range[0] >= bpm_range[1]:
        bpm_range = list(base["bpm"])

    return StyleIntent(
        prompt=prompt,
        genres=_merge_genres(genres),
        bpm_range=bpm_range,
        duration_min=max(4.0, min(60.0, float(duration_min))),
        energy_curve=EnergyCurve(preset=energy, points=ENERGY_CURVES.get(energy, ENERGY_CURVES["build"])),
        vocal_tolerance=vocal,  # type: ignore[arg-type]
        harmonic_strictness=base["harmonic"],
        transition_density=(density or base["density"]),  # type: ignore[arg-type]
        seed=seed,
    )

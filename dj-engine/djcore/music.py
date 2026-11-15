"""Musical helpers: Camelot wheel, key names, tempo ratios, energy curves."""

from __future__ import annotations

import math

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Camelot numbers advance by fifths. 8A = A minor, 8B = C major.
CAMELOT_MINOR = {
    1: 8,   # Ab minor
    2: 3,   # Eb minor
    3: 10,  # Bb minor
    4: 5,   # F minor
    5: 0,   # C minor
    6: 7,   # G minor
    7: 2,   # D minor
    8: 9,   # A minor
    9: 4,   # E minor
    10: 11, # B minor
    11: 6,  # F# minor
    12: 1,  # C# minor
}

CAMELOT_MAJOR = {
    1: 11,  # B major
    2: 6,   # F# major
    3: 1,   # Db major
    4: 8,   # Ab major
    5: 3,   # Eb major
    6: 10,  # Bb major
    7: 5,   # F major
    8: 0,   # C major
    9: 7,   # G major
    10: 2,  # D major
    11: 9,  # A major
    12: 4,  # E major
}

_PITCH_TO_CAMELOT_MAJOR = {pc: f"{number}B" for number, pc in CAMELOT_MAJOR.items()}
_PITCH_TO_CAMELOT_MINOR = {pc: f"{number}A" for number, pc in CAMELOT_MINOR.items()}


def camelot_for(pitch_class: int, mode: str) -> str:
    table = _PITCH_TO_CAMELOT_MINOR if mode == "minor" else _PITCH_TO_CAMELOT_MAJOR
    return table[pitch_class % 12]


def parse_camelot(code: str) -> tuple[int, str]:
    code = code.strip().upper()
    if len(code) < 2 or code[-1] not in "AB":
        raise ValueError(f"invalid camelot code: {code}")
    number = int(code[:-1])
    if not 1 <= number <= 12:
        raise ValueError(f"invalid camelot number: {code}")
    return number, code[-1]


def camelot_distance(a: str, b: str) -> int:
    na, _ = parse_camelot(a)
    nb, _ = parse_camelot(b)
    diff = abs(na - nb)
    return min(diff, 12 - diff)


def camelot_score(a: str, b: str) -> float:
    """0..1 harmonic compatibility; wheel distance is measured in fifths."""
    _, la = parse_camelot(a)
    _, lb = parse_camelot(b)
    distance = camelot_distance(a, b)
    if distance == 0 and la == lb:
        return 1.0
    if distance == 0:
        return 0.8
    if la == lb and distance == 1:
        return 0.85
    if la == lb and distance == 2:
        return 0.55
    if la != lb and distance == 1:
        return 0.5
    if la != lb and distance == 2:
        return 0.35
    return 0.1


def key_name(pitch_class: int, mode: str) -> str:
    return f"{SHARP_NAMES[pitch_class % 12]} {mode}"


def note_frequency(pitch_class: int, octave: int = 3) -> float:
    midi = 12 * (octave + 1) + pitch_class
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def energy_at(points: list[list[float]], position: float) -> float:
    """Linear interpolation over [position 0..1, energy 0..1] points."""
    if not points:
        return 0.5
    position = min(1.0, max(0.0, position))
    ordered = sorted(points, key=lambda item: item[0])
    if position <= ordered[0][0]:
        return ordered[0][1]
    for (x0, y0), (x1, y1) in zip(ordered, ordered[1:]):
        if position <= x1:
            span = x1 - x0
            if span <= 1e-9:
                return y1
            return y0 + (y1 - y0) * (position - x0) / span
    return ordered[-1][1]


def tempo_fit(bpm_a: float, bpm_b: float, tolerance: float = 0.06) -> tuple[float, str, float]:
    """Return (effective_ratio, mode, score).

    effective_ratio is bpm_b / bpm_a after half/double-time normalization.
    mode is "double" when B runs at twice A's tempo, "half" for the reverse.
    """
    raw = bpm_b / bpm_a
    limit = math.log2(1.0 + tolerance)
    candidates = [(raw, "constant"), (raw / 2.0, "double"), (raw * 2.0, "half")]
    ratio, mode = min(candidates, key=lambda item: abs(math.log2(item[0])))
    deviation = abs(math.log2(ratio))
    if deviation > limit:
        return ratio, mode, 0.0
    return ratio, mode, max(0.0, 1.0 - (deviation / limit) ** 1.5)


def circle_distance(a: float, b: float) -> float:
    diff = abs(a - b) % 1.0
    return min(diff, 1.0 - diff)

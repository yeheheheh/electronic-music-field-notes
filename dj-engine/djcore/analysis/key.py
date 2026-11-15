"""Key detection via Krumhansl-Schmuckler chroma profiles."""

from __future__ import annotations

import numpy as np

from djcore.contracts import KeyInfo
from djcore.music import camelot_for, key_name

_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _correlation(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


def detect_key(y: np.ndarray, sr: int) -> KeyInfo:
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
    profile = chroma.mean(axis=1)
    profile = profile / (profile.sum() + 1e-9)
    best = (-1.0, 0, "major")
    for pitch_class in range(12):
        rotated = np.roll(profile, -pitch_class)
        for mode, template in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE)):
            score = _correlation(rotated, template)
            if score > best[0]:
                best = (score, pitch_class, mode)
    score, pitch_class, mode = best
    confidence = float(np.clip((score + 0.2) / 1.2, 0.05, 0.95))
    return KeyInfo(
        pitch_class=pitch_class,
        mode=mode,
        name=key_name(pitch_class, mode),
        camelot=camelot_for(pitch_class, mode),
        confidence=confidence,
    )

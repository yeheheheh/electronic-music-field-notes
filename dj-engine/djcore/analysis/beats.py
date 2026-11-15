"""Beat, downbeat and tempo estimation for 4/4 electronic music."""

from __future__ import annotations

import numpy as np

from djcore.contracts import BeatsInfo, BpmInfo


def _low_band_onset(y: np.ndarray, sr: int) -> np.ndarray:
    import librosa

    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=48, hop_length=256, fmax=sr / 2)
    low = mel[:10].sum(axis=0)
    return librosa.onset.onset_strength(
        S=librosa.power_to_db(low + 1e-9), sr=sr, hop_length=256
    )


def detect_beats(y: np.ndarray, sr: int) -> tuple[BpmInfo, BeatsInfo, list[float]]:
    import librosa

    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=256)
    tempo, frames = librosa.beat.beat_track(
        onset_envelope=onset, sr=sr, hop_length=256, tightness=100, trim=False
    )
    tempo_value = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(frames, sr=sr, hop_length=256)
    if beat_times.size < 8:
        # Fall back to a constant grid at the estimated tempo.
        beat_times = np.arange(0.0, len(y) / sr, 60.0 / max(tempo_value, 1e-3))

    intervals = np.diff(beat_times)
    median_interval = float(np.median(intervals)) if intervals.size else 60.0 / max(tempo_value, 1e-3)
    cv = float(np.std(intervals) / max(np.mean(intervals), 1e-6)) if intervals.size else 1.0

    low_onset = _low_band_onset(y, sr)
    scores = []
    for phase in range(4):
        indices = frames[phase::4]
        if indices.size == 0:
            scores.append(0.0)
            continue
        picked = low_onset[np.clip(indices, 0, low_onset.size - 1)]
        scores.append(float(np.mean(picked)))
    phase = int(np.argmax(scores)) if scores else 0
    downbeats = [float(value) for value in beat_times[phase::4]]

    confidence = float(np.clip(1.0 - cv * 6.0, 0.05, 0.98))
    bpm = BpmInfo(value=round(tempo_value, 3), confidence=confidence, octave_ambiguous=tempo_value < 90)
    beats = BeatsInfo(
        first_sec=float(beat_times[0]),
        interval_sec=median_interval,
        times_sec=[float(value) for value in beat_times],
        confidence=confidence,
    )
    return bpm, beats, downbeats

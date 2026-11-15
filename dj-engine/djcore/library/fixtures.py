"""Deterministic synthetic fixtures with known BPM, key, drops and sections.

The fixtures are not meant to sound like a specific record.  They are
structured electronic loops that give the analyzer and the transition
renderer ground truth: four-on-the-floor kicks, a known drop at bar 17,
a 8-bar build, a low-energy outro and (for three of them) a vocal-ish
formant layer.
"""

from __future__ import annotations

import json
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from djcore.music import camelot_for, note_frequency

SR = 48000
BARS = 48
BEATS_PER_BAR = 4
DROP_BAR = 17
BUILD_BARS = (9, 16)
OUTRO_BARS = (41, 48)


@dataclass(frozen=True)
class FixtureSpec:
    filename: str
    title: str
    bpm: float
    pitch_class: int
    mode: str
    genre_id: str
    vocal: bool
    energy: float


SPECS = [
    FixtureSpec("01-aurora-drift-124.wav", "Aurora Drift", 124.0, 9, "minor", "melodic-techno", True, 0.30),
    FixtureSpec("02-concrete-bloom-126.wav", "Concrete Bloom", 126.0, 0, "major", "tech-house", True, 0.48),
    FixtureSpec("03-glass-horizon-128.wav", "Glass Horizon", 128.0, 9, "minor", "progressive-house", False, 0.66),
    FixtureSpec("04-low-tide-122.wav", "Low Tide", 122.0, 6, "minor", "deep-house", True, 0.52),
]


def _env(n: int, attack: float, decay: float, sustain: float, release: float, sr: int = SR) -> np.ndarray:
    a = max(1, int(attack * sr))
    d = max(1, int(decay * sr))
    r = max(1, int(release * sr))
    s = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0.0, 1.0, a, endpoint=False),
        np.linspace(1.0, sustain, d, endpoint=False),
        np.full(s, sustain),
        np.linspace(sustain, 0.0, r),
    ])[:n]


def _lowpass(x: np.ndarray, cutoff: float, sr: int = SR) -> np.ndarray:
    """Zero-phase 4th-order low-pass; keeps fixtures free of scipy."""
    if x.size == 0:
        return x
    spectrum = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(x.size, 1.0 / sr)
    magnitude = 1.0 / np.sqrt(1.0 + (freqs / max(cutoff, 1.0)) ** 4)
    return np.fft.irfft(spectrum * magnitude, x.size)


def _highpass(x: np.ndarray, cutoff: float, sr: int = SR) -> np.ndarray:
    return x - _lowpass(x, cutoff, sr)


def _saw(freq: float, n: int, sr: int = SR) -> np.ndarray:
    t = np.arange(n) / sr
    return 2.0 * ((t * freq) % 1.0) - 1.0


def _add(buffer: np.ndarray, signal: np.ndarray, start: int, gain: float = 1.0) -> None:
    if start >= buffer.shape[-1]:
        return
    end = min(buffer.shape[-1], start + signal.shape[-1])
    buffer[..., start:end] += signal[: end - start] * gain


def _stereo(mono: np.ndarray, pan: float = 0.0, width: float = 0.0) -> np.ndarray:
    left = mono * (1.0 - max(0.0, pan))
    right = mono * (1.0 + min(0.0, pan))
    if width:
        delay = int(0.008 * SR)
        shifted = np.concatenate([np.zeros(delay), mono[:-delay]])
        left = left * (1.0 - width) + shifted * width
        right = right * (1.0 - width) + mono * width
    return np.stack([left, right])


def _kick(n: int) -> np.ndarray:
    t = np.arange(n) / SR
    freq = 48.0 + 90.0 * np.exp(-t / 0.028)
    phase = 2.0 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t / 0.16)
    click = np.random.default_rng(7).normal(0, 1, n) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.2)


def _hat(n: int, open_hat: bool = False) -> np.ndarray:
    rng = np.random.default_rng(11)
    noise = rng.normal(0, 1, n)
    decay = 0.09 if open_hat else 0.025
    return _highpass(noise, 7000) * np.exp(-np.arange(n) / SR / decay) * 0.35


def _snare(n: int) -> np.ndarray:
    rng = np.random.default_rng(13)
    noise = _highpass(rng.normal(0, 1, n), 1200) * np.exp(-np.arange(n) / SR / 0.08)
    tone = np.sin(2 * np.pi * 185 * np.arange(n) / SR) * np.exp(-np.arange(n) / SR / 0.05)
    return (noise * 0.7 + tone * 0.3) * 0.45


def _bass_note(freq: float, length: int, cutoff: float = 180.0) -> np.ndarray:
    saw = _saw(freq, length) * 0.6 + np.sin(2 * np.pi * freq * np.arange(length) / SR) * 0.5
    env = _env(length, 0.004, 0.06, 0.65, 0.03)
    return _lowpass(saw * env, cutoff)


def _chord(freqs: list[float], length: int, cutoff: float = 900.0) -> np.ndarray:
    out = np.zeros(length)
    for index, freq in enumerate(freqs):
        for detune in (-0.004, 0.0, 0.004):
            out += _saw(freq * (1.0 + detune + index * 0.0007), length) * 0.16
    env = _env(length, 0.12, 0.2, 0.75, 0.35)
    return _lowpass(out * env, cutoff)


def _pluck(freq: float, length: int) -> np.ndarray:
    t = np.arange(length) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2 * t)
    return tone * np.exp(-t / 0.09) * 0.22


def _riser(length: int) -> np.ndarray:
    rng = np.random.default_rng(17)
    noise = rng.normal(0, 1, length)
    ramp = np.linspace(0.0, 1.0, length) ** 2
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(180, 2600, length)) / SR) * 0.12
    return (noise * 0.3 + sweep) * ramp


def _vocalish(freqs: list[float], length: int) -> np.ndarray:
    """Formant-ish layer used as a stand-in for a vocal line."""
    t = np.arange(length) / SR
    out = np.zeros(length)
    for freq in freqs:
        vibrato = 1.0 + 0.006 * np.sin(2 * np.pi * 5.2 * t)
        f0 = freq * vibrato
        out += np.sin(2 * np.pi * f0 * t) * 0.5
        out += np.sin(2 * np.pi * f0 * 2.0 * t) * 0.22
        out += np.sin(2 * np.pi * 720 * t) * 0.18
        out += np.sin(2 * np.pi * 1250 * t) * 0.10
        out += np.sin(2 * np.pi * 2600 * t) * 0.05
    env = _env(length, 0.08, 0.1, 0.7, 0.2)
    return out * env * 0.22


def _progression(pitch_class: int, mode: str) -> list[int]:
    offsets = [0, 8, 3, 10] if mode == "minor" else [0, 7, 9, 5]
    return [(pitch_class + offset) % 12 for offset in offsets]


def render_fixture(spec: FixtureSpec) -> tuple[np.ndarray, dict]:
    rng = np.random.default_rng(zlib.crc32(spec.filename.encode("utf-8")))
    bar_sec = 4 * 60.0 / spec.bpm
    total_samples = int(round(BARS * bar_sec * SR))
    mix = np.zeros((2, total_samples), dtype=np.float64)
    prog = _progression(spec.pitch_class, spec.mode)
    root = spec.pitch_class

    kick_n = int(0.38 * SR)
    hat_n = int(0.06 * SR)
    open_hat_n = int(0.16 * SR)
    snare_n = int(0.18 * SR)

    for bar in range(1, BARS + 1):
        bar_start = int(round((bar - 1) * bar_sec * SR))
        chord_pc = prog[((bar - 1) // 2) % len(prog)]
        third = 4 if spec.mode == "major" else 3
        chord_freqs = [
            note_frequency(chord_pc, 3),
            note_frequency((chord_pc + third) % 12, 3),
            note_frequency((chord_pc + 7) % 12, 3),
        ]
        in_intro = bar <= 8
        in_build = BUILD_BARS[0] <= bar <= BUILD_BARS[1]
        in_drop = 17 <= bar <= 32
        in_break = 33 <= bar <= 40
        in_outro = bar >= OUTRO_BARS[0]

        if in_intro or in_build or in_drop:
            for beat in range(BEATS_PER_BAR):
                _add(mix, _stereo(_kick(kick_n)), bar_start + int(beat * bar_sec * SR / 4), 0.9 if in_drop else 0.65)
        if in_intro or in_build or in_drop or in_break:
            for eighth in range(8):
                pos = bar_start + int(eighth * bar_sec * SR / 8)
                if eighth % 2 == 1:
                    _add(mix, _stereo(_hat(open_hat_n if in_drop and eighth in (3, 7) else hat_n), 0.35), pos, 0.22)
        if in_build:
            density = 1 + (bar - BUILD_BARS[0]) // 2
            for step in range(density):
                pos = bar_start + int(step * bar_sec * SR / density)
                _add(mix, _stereo(_snare(snare_n), -0.15), pos, 0.18 + 0.03 * (bar - BUILD_BARS[0]))

        cutoff = 600.0 if in_intro else (1200.0 if in_build else 2200.0 if in_drop else 1500.0 if in_break else 700.0)
        _add(mix, _stereo(_chord(chord_freqs, int(bar_sec * SR), cutoff), 0.0, 0.35), bar_start, 0.42)

        if in_drop or in_break:
            if spec.vocal and 21 <= bar <= 28:
                note = note_frequency((root + [0, 3, 7, 10][(bar - 1) % 4]) % 12, 4)
                _add(mix, _stereo(_vocalish([note], int(bar_sec * SR * 0.8)), -0.05, 0.2), bar_start, 0.55)
            if in_drop:
                pattern = [0, 7, 3, 10, 0, 7, 10, 3]
                for step in range(8):
                    pc = (root + pattern[step]) % 12
                    _add(mix, _stereo(_pluck(note_frequency(pc, 4), int(bar_sec * SR / 8)), 0.2), bar_start + int(step * bar_sec * SR / 8), 0.5)

        if not in_intro and not in_outro and not in_break:
            if in_drop or in_build and bar >= 13:
                note = note_frequency(root, 1)
                for eighth in range(8):
                    if in_build and bar < 15 and eighth % 2 == 1:
                        continue
                    length = int(bar_sec * SR / 8 * 0.9)
                    _add(mix, _stereo(_bass_note(note, length, 160.0), 0.0), bar_start + int(eighth * bar_sec * SR / 8), 0.55)

    # 8-bar riser into the first drop.
    build_start = int(round((BUILD_BARS[0] - 1) * bar_sec * SR))
    build_len = int(round((BUILD_BARS[1] - BUILD_BARS[0] + 1) * bar_sec * SR))
    _add(mix, _stereo(_riser(build_len), 0.0, 0.2), build_start, 0.22)

    # Drop impact.
    drop_start = int(round((DROP_BAR - 1) * bar_sec * SR))
    impact_n = int(0.9 * SR)
    t = np.arange(impact_n) / SR
    boom = np.sin(2 * np.pi * (55 + 30 * np.exp(-t / 0.05)) * t) * np.exp(-t / 0.3)
    crash = _highpass(rng.normal(0, 1, impact_n), 3000) * np.exp(-t / 0.08)
    _add(mix, _stereo(boom * 0.5 + crash * 0.25), drop_start, 0.8)

    # Fade in/out and gentle stereo width.
    fade = int(0.02 * SR)
    mix[:, :fade] *= np.linspace(0, 1, fade)
    mix[:, -fade:] *= np.linspace(1, 0, fade)
    peak = float(np.max(np.abs(mix)))
    if peak > 0:
        mix *= 0.89 / peak

    sidecar = {
        "title": spec.title,
        "artist": "Automix Fixture",
        "bpm": spec.bpm,
        "key": {
            "pitchClass": spec.pitch_class,
            "mode": spec.mode,
            "name": f"{['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][spec.pitch_class]} {spec.mode}",
            "camelot": camelot_for(spec.pitch_class, spec.mode),
        },
        "genreId": spec.genre_id,
        "energy": spec.energy,
        "bars": BARS,
        "beatsPerBar": BEATS_PER_BAR,
        "durationSec": round(total_samples / SR, 3),
        "drops": [{"bar": DROP_BAR, "beat": 1, "confidence": 1.0}],
        "builds": [{"startBar": BUILD_BARS[0], "endBar": BUILD_BARS[1], "confidence": 1.0}],
        "phrases": [
            {"startBar": 1, "endBar": 8, "type": "intro"},
            {"startBar": 9, "endBar": 16, "type": "build"},
            {"startBar": 17, "endBar": 32, "type": "drop"},
            {"startBar": 33, "endBar": 40, "type": "break"},
            {"startBar": 41, "endBar": 48, "type": "outro"},
        ],
        "vocals": [{"startBar": 21, "endBar": 28}] if spec.vocal else [],
        "notes": "Synthetic fixture generated by djcore.library.fixtures",
    }
    return mix, sidecar


def generate_fixtures(audio_dir: Path, sidecar_dir: Path, force: bool = False) -> list[Path]:
    audio_dir = Path(audio_dir)
    sidecar_dir = Path(sidecar_dir)
    audio_dir.mkdir(parents=True, exist_ok=True)
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for spec in SPECS:
        audio_path = audio_dir / spec.filename
        sidecar_path = sidecar_dir / f"{audio_path.stem}.json"
        if audio_path.exists() and sidecar_path.exists() and not force:
            written.append(audio_path)
            continue
        mix, sidecar = render_fixture(spec)
        sf.write(audio_path, mix.T, SR, subtype="PCM_16")
        sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(audio_path)
    return written


if __name__ == "__main__":
    from djcore.config import FIXTURES_AUDIO, FIXTURES_SIDECARS

    for path in generate_fixtures(FIXTURES_AUDIO, FIXTURES_SIDECARS, force=True):
        print(path)

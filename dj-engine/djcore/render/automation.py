"""Stem gain / EQ / filter automation for a transition overlap."""

from __future__ import annotations

import math

import numpy as np
from scipy.signal import lfilter

from djcore.contracts import StemKeyframe

_DEFAULT = {
    "gain_db": 0.0,
    "low_eq_db": 0.0,
    "high_eq_db": 0.0,
    "low_pass_hz": None,
    "high_pass_hz": None,
}


def _interp_value(points: list[tuple[float, float | None]], bar: float) -> float | None:
    points = [(position, value) for position, value in points if value is not None]
    if not points:
        return None
    if bar <= points[0][0]:
        return float(points[0][1])
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if bar <= x1:
            span = x1 - x0
            if span <= 1e-9:
                return float(y1)
            return float(y0) + (float(y1) - float(y0)) * (bar - x0) / span
    return float(points[-1][1])


def params_at(keyframes: list[StemKeyframe], bar: float) -> dict:
    if not keyframes:
        return dict(_DEFAULT)
    ordered = sorted(keyframes, key=lambda item: item.bar)
    return {
        "gain_db": _interp_value([(item.bar, item.gain_db) for item in ordered], bar) or 0.0,
        "low_eq_db": _interp_value([(item.bar, item.low_eq_db) for item in ordered], bar) or 0.0,
        "high_eq_db": _interp_value([(item.bar, item.high_eq_db) for item in ordered], bar) or 0.0,
        "low_pass_hz": _interp_value([(item.bar, item.low_pass_hz) for item in ordered], bar),
        "high_pass_hz": _interp_value([(item.bar, item.high_pass_hz) for item in ordered], bar),
    }


def _biquad(audio: np.ndarray, b: np.ndarray, a: np.ndarray) -> np.ndarray:
    output = np.empty_like(audio)
    for channel in range(audio.shape[0]):
        output[channel] = lfilter(b, a, audio[channel])
    return output


def _low_shelf(gain_db: float, freq: float, sr: int) -> tuple[np.ndarray, np.ndarray]:
    a_gain = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * freq / sr
    alpha = math.sin(w0) / 2.0 * math.sqrt(2.0)
    cos_w0 = math.cos(w0)
    b0 = a_gain * ((a_gain + 1) - (a_gain - 1) * cos_w0 + 2 * math.sqrt(a_gain) * alpha)
    b1 = 2 * a_gain * ((a_gain - 1) - (a_gain + 1) * cos_w0)
    b2 = a_gain * ((a_gain + 1) - (a_gain - 1) * cos_w0 - 2 * math.sqrt(a_gain) * alpha)
    a0 = (a_gain + 1) + (a_gain - 1) * cos_w0 + 2 * math.sqrt(a_gain) * alpha
    a1 = -2 * ((a_gain - 1) + (a_gain + 1) * cos_w0)
    a2 = (a_gain + 1) + (a_gain - 1) * cos_w0 - 2 * math.sqrt(a_gain) * alpha
    return np.array([b0, b1, b2]) / a0, np.array([1.0, a1 / a0, a2 / a0])


def _high_shelf(gain_db: float, freq: float, sr: int) -> tuple[np.ndarray, np.ndarray]:
    a_gain = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * math.pi * freq / sr
    alpha = math.sin(w0) / 2.0 * math.sqrt(2.0)
    cos_w0 = math.cos(w0)
    b0 = a_gain * ((a_gain + 1) + (a_gain - 1) * cos_w0 + 2 * math.sqrt(a_gain) * alpha)
    b1 = -2 * a_gain * ((a_gain - 1) + (a_gain + 1) * cos_w0)
    b2 = a_gain * ((a_gain + 1) + (a_gain - 1) * cos_w0 - 2 * math.sqrt(a_gain) * alpha)
    a0 = (a_gain + 1) - (a_gain - 1) * cos_w0 + 2 * math.sqrt(a_gain) * alpha
    a1 = 2 * ((a_gain - 1) - (a_gain + 1) * cos_w0)
    a2 = (a_gain + 1) - (a_gain - 1) * cos_w0 - 2 * math.sqrt(a_gain) * alpha
    return np.array([b0, b1, b2]) / a0, np.array([1.0, a1 / a0, a2 / a0])


def _one_pole_low(audio: np.ndarray, cutoff: float, sr: int) -> np.ndarray:
    alpha = 1.0 - math.exp(-2.0 * math.pi * cutoff / sr)
    return _biquad(audio, np.array([alpha]), np.array([1.0, alpha - 1.0]))


def _one_pole_high(audio: np.ndarray, cutoff: float, sr: int) -> np.ndarray:
    return audio - _one_pole_low(audio, cutoff, sr)


def _filter_chunk(audio: np.ndarray, sr: int, params: dict) -> np.ndarray:
    output = audio
    if abs(params["low_eq_db"]) > 0.01:
        output = _biquad(output, *_low_shelf(params["low_eq_db"], 200.0, sr))
    if abs(params["high_eq_db"]) > 0.01:
        output = _biquad(output, *_high_shelf(params["high_eq_db"], 4000.0, sr))
    if params.get("low_pass_hz"):
        output = _one_pole_low(output, float(params["low_pass_hz"]), sr)
    if params.get("high_pass_hz"):
        output = _one_pole_high(output, float(params["high_pass_hz"]), sr)
    return output


def _gain_envelope(keyframes: list[StemKeyframe], bars: int, samples: int) -> np.ndarray:
    ordered = sorted(keyframes, key=lambda item: item.bar)
    positions = np.arange(samples, dtype=np.float64) / max(1, samples) * bars
    gains = np.interp(
        positions,
        [item.bar for item in ordered] or [0],
        [item.gain_db for item in ordered] or [0.0],
    )
    return 10.0 ** (gains / 20.0)


def apply_curves(
    audio: np.ndarray,
    sr: int,
    bpm: float,
    bars: int,
    keyframes: list[StemKeyframe],
) -> np.ndarray:
    """Apply automation to an overlap region; `bars` is the region length."""
    if not keyframes or bars <= 0:
        return audio
    bar_samples = int(round(4.0 * 60.0 / max(bpm, 1e-6) * sr))
    total = audio.shape[-1]
    output = np.zeros_like(audio)
    pad = int(0.01 * sr)
    for bar in range(bars):
        start = bar * bar_samples
        end = min(total, (bar + 1) * bar_samples)
        if start >= total:
            break
        source_start = max(0, start - pad)
        chunk = audio[:, source_start:end]
        processed = _filter_chunk(chunk, sr, params_at(keyframes, bar + 0.5))
        if start == 0:
            output[:, :end] = processed
            continue
        overlap = start - source_start
        if overlap > 0:
            ramp = np.linspace(0.0, 1.0, overlap)
            output[:, source_start:start] = output[:, source_start:start] * (1 - ramp) + processed[:, :overlap] * ramp
            output[:, start:end] = processed[:, overlap:]
        else:
            output[:, start:end] = processed
    if output.shape[-1] < total:
        output = np.pad(output, ((0, 0), (0, total - output.shape[-1])))
    envelope = _gain_envelope(keyframes, bars, total)
    return output * envelope

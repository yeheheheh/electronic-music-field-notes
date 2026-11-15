"""Assemble a set from stems, apply transition automation, limit and export."""

from __future__ import annotations

import json
import math
import os
import subprocess
from collections.abc import Callable
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from djcore.analysis.audio_io import load_stereo
from djcore.config import ENGINE_ROOT, SETS, TARGET_LUFS, ffmpeg_path
from djcore.contracts import (
    Loudness,
    RenderOutputs,
    RenderResult,
    SetPlan,
    TrackAnalysis,
    TransitionPlan,
    TransitionRender,
)
from djcore.render.automation import apply_curves
from djcore.render.stretch import stretch

STEM_ORDER = ("vocals", "drums", "bass", "other")


def _resolve(path_value: str) -> Path:
    path = Path(path_value)
    return path if path.is_absolute() else Path(ENGINE_ROOT) / path


def _relative(path: Path) -> str:
    try:
        return os.path.relpath(str(path), str(ENGINE_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def _bar_seconds(bpm: float) -> float:
    return 4.0 * 60.0 / max(bpm, 1e-6)


def _load_stems(analysis: TrackAnalysis, sr: int, warnings: list[str]) -> dict[str, np.ndarray]:
    stems: dict[str, np.ndarray] = {}
    if analysis.stems:
        for name in STEM_ORDER:
            value = analysis.stems.get(name)
            if not value:
                continue
            path = _resolve(value)
            if not path.is_file():
                warnings.append(f"分轨缺失：{name} ({path})")
                continue
            audio, _ = load_stereo(path, sr=sr)
            stems[name] = audio
    if not stems:
        audio, _ = load_stereo(_resolve(analysis.track.path), sr=sr)
        stems["other"] = audio
        warnings.append("没有可用分轨，使用整轨代替（低频/人声自动化退化）")
    return stems


def _segment(audio: np.ndarray, sr: int, bpm: float, start_bar: int, end_bar: int) -> np.ndarray:
    bar_sec = _bar_seconds(bpm)
    start = max(0, int(round((start_bar - 1) * bar_sec * sr)))
    end = int(round(end_bar * bar_sec * sr))
    if start >= audio.shape[-1]:
        return np.zeros((audio.shape[0], max(1, end - start)), dtype=np.float32)
    chunk = audio[:, start:end]
    if chunk.shape[-1] < end - start:
        chunk = np.pad(chunk, ((0, 0), (0, end - start - chunk.shape[-1])))
    return chunk.astype(np.float32)


def _limit(audio: np.ndarray, sr: int, threshold_db: float = -1.0) -> np.ndarray:
    threshold = 10.0 ** (threshold_db / 20.0)
    peak = np.max(np.abs(audio), axis=0)
    gain = np.minimum(1.0, threshold / (peak + 1e-9))
    window = max(1, int(0.01 * sr))
    kernel = np.ones(window) / window
    gain = np.convolve(gain, kernel, mode="same")
    gain = np.minimum(gain, np.minimum(1.0, threshold / (peak + 1e-9)) * 1.08)
    output = audio * gain
    peak_after = float(np.max(np.abs(output))) if output.size else 0.0
    if peak_after > threshold:
        output *= threshold / peak_after
    return output


def _integrated_lufs(audio: np.ndarray, sr: int) -> float | None:
    try:
        import pyloudnorm

        meter = pyloudnorm.Meter(sr)
        value = float(meter.integrated_loudness(audio.T))
        return value if np.isfinite(value) else None
    except Exception:
        return None


def _true_peak_db(audio: np.ndarray, sr: int) -> float:
    per_sample = np.max(np.abs(audio), axis=0)
    peak_index = int(np.argmax(per_sample)) if per_sample.size else 0
    start = max(0, peak_index - sr)
    end = min(audio.shape[-1], peak_index + sr)
    chunk = audio[:, start:end]
    if chunk.size == 0:
        return -120.0
    oversampled = resample_poly(chunk, 4, 1, axis=1)
    peak = float(np.max(np.abs(oversampled)))
    return 20.0 * math.log10(peak + 1e-9)


def _waveform(audio: np.ndarray, sr: int) -> tuple[int, list[list[float]]]:
    duration_ms = audio.shape[-1] / sr * 1000.0
    bucket_ms = max(10, int(math.ceil(duration_ms / 40000.0)))
    bucket = max(1, int(bucket_ms / 1000.0 * sr))
    peaks: list[list[float]] = []
    for start in range(0, audio.shape[-1], bucket):
        chunk = audio[:, start:start + bucket]
        if chunk.size == 0:
            continue
        peaks.append([round(float(chunk.min()), 4), round(float(chunk.max()), 4)])
    return bucket_ms, peaks


def _phase_correlation(a: np.ndarray, b: np.ndarray) -> float | None:
    length = min(a.shape[-1], b.shape[-1])
    if length <= 0:
        return None
    left = a[:, :length].mean(axis=0) if a.ndim > 1 else a[:length]
    right = b[:, :length].mean(axis=0) if b.ndim > 1 else b[:length]
    denom = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denom <= 1e-9:
        return None
    return float(np.dot(left, right) / denom)


def _write_mp3(wav_path: Path, mp3_path: Path, warnings: list[str]) -> bool:
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        warnings.append("ffmpeg 不可用，跳过 MP3 导出")
        return False
    command = [ffmpeg, "-y", "-v", "error", "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "320k", str(mp3_path)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        warnings.append(f"MP3 导出失败：{(result.stderr or '')[-300:]}")
        return False
    return True


def _apply_transition_side(
    segments: dict[str, np.ndarray],
    segment_length: int,
    sr: int,
    bpm: float,
    transition: TransitionPlan,
    prefix: str,
    at_start: bool,
) -> None:
    overlap_samples = min(
        segment_length,
        int(round(transition.phrase.overlap_bars * _bar_seconds(bpm) * sr)),
    )
    if overlap_samples <= 0:
        return
    for name, audio in segments.items():
        curves = transition.stems.get(f"{prefix}.{name}") or transition.stems.get(f"{prefix}.other")
        if not curves:
            continue
        region = audio[:, :overlap_samples] if at_start else audio[:, -overlap_samples:]
        processed = apply_curves(region, sr, bpm, transition.phrase.overlap_bars, curves)
        if at_start:
            segments[name][:, :overlap_samples] = processed
        else:
            segments[name][:, -overlap_samples:] = processed


def render_set(
    plan: SetPlan,
    analyses: dict[str, TrackAnalysis],
    *,
    output_root: Path | None = None,
    log: Callable[[str], None] | None = None,
) -> RenderResult:
    log = log or (lambda message: None)
    output_dir = Path(output_root) if output_root else SETS / plan.id
    output_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []
    logs: list[str] = []

    entries = plan.entries
    transitions = plan.transitions
    if not entries:
        raise ValueError("set 没有曲目")

    starts: list[int] = []
    ends: list[int] = []
    for index, entry in enumerate(entries):
        start = transitions[index - 1].phrase.start_bar_b if index > 0 else entry.play_from_bar
        end = (
            transitions[index].phrase.start_bar_a + transitions[index].phrase.overlap_bars - 1
            if index < len(transitions)
            else entry.play_to_bar
        )
        starts.append(max(entry.play_from_bar, start))
        ends.append(min(entry.play_to_bar, max(start + 1, end)))

    bar_sec = _bar_seconds(plan.totals.avg_bpm)
    track_start_bars: list[float] = [0.0]
    for index in range(1, len(entries)):
        previous_length = ends[index - 1] - starts[index - 1] + 1
        overlap = transitions[index - 1].phrase.overlap_bars
        track_start_bars.append(track_start_bars[index - 1] + max(0, previous_length - overlap))

    total_bars = track_start_bars[-1] + (ends[-1] - starts[-1] + 1)
    sr = 48000
    output = np.zeros((2, max(1, int(math.ceil(total_bars * bar_sec * sr)))), dtype=np.float32)
    overlap_mono: dict[tuple[int, str], np.ndarray] = {}

    for index, entry in enumerate(entries):
        analysis = analyses.get(entry.track_id)
        if analysis is None:
            raise ValueError(f"缺少分析结果：{entry.track_id}")
        log(f"render track {index + 1}/{len(entries)}: {entry.title}")
        stems = _load_stems(analysis, sr, warnings)
        rate = entry.target_bpm / max(analysis.bpm.value, 1e-6)
        stretched: dict[str, np.ndarray] = {}
        for name, audio in stems.items():
            changed, method = stretch(audio, sr, rate, log=log)
            stretched[name] = changed
            logs.append(f"track {index + 1} {name}: {method} x{rate:.4f}")
        length = max(audio.shape[-1] for audio in stretched.values())
        padded = {name: np.pad(audio, ((0, 0), (0, length - audio.shape[-1]))) for name, audio in stretched.items()}
        segments = {name: _segment(audio, sr, entry.target_bpm, starts[index], ends[index]) for name, audio in padded.items()}
        segment_length = max(audio.shape[-1] for audio in segments.values())
        segments = {name: np.pad(audio, ((0, 0), (0, segment_length - audio.shape[-1]))) for name, audio in segments.items()}

        if index > 0:
            _apply_transition_side(
                segments, segment_length, sr, entry.target_bpm,
                transitions[index - 1], "b", True,
            )
        if index < len(transitions):
            _apply_transition_side(
                segments, segment_length, sr, entry.target_bpm,
                transitions[index], "a", False,
            )

        track_mix = np.zeros((2, segment_length), dtype=np.float32)
        for audio in segments.values():
            track_mix += audio
        if track_mix.shape[-1] < segment_length:
            track_mix = np.pad(track_mix, ((0, 0), (0, segment_length - track_mix.shape[-1])))

        if index < len(transitions):
            overlap_samples = min(segment_length, int(round(transitions[index].phrase.overlap_bars * _bar_seconds(entry.target_bpm) * sr)))
            if overlap_samples > 0:
                overlap_mono[(index, "a")] = track_mix[:, -overlap_samples:].mean(axis=0)
        if index > 0:
            overlap_samples = min(segment_length, int(round(transitions[index - 1].phrase.overlap_bars * _bar_seconds(entry.target_bpm) * sr)))
            if overlap_samples > 0:
                overlap_mono[(index - 1, "b")] = track_mix[:, :overlap_samples].mean(axis=0)

        offset = int(round(track_start_bars[index] * bar_sec * sr))
        end_offset = min(output.shape[-1], offset + segment_length)
        output[:, offset:end_offset] += track_mix[:, : end_offset - offset]

    log("limiter + loudness")
    output = _limit(output, sr)
    lufs = _integrated_lufs(output, sr)
    if lufs is not None:
        gain = 10.0 ** ((TARGET_LUFS - lufs) / 20.0)
        output *= gain
        output = _limit(output, sr)
        lufs = _integrated_lufs(output, sr)
    else:
        warnings.append("pyloudnorm 不可用，跳过响度归一")
    true_peak = _true_peak_db(output, sr)
    if true_peak > -0.3:
        output *= 10.0 ** ((-0.5 - true_peak) / 20.0)
        true_peak = _true_peak_db(output, sr)
    peak = float(np.max(np.abs(output)))
    if peak > 1.0:
        output /= peak
        warnings.append("输出超过 0dBFS，已整体衰减")

    wav_path = output_dir / "mix.wav"
    sf.write(wav_path, output.T, sr, subtype="PCM_24")
    mp3_path = output_dir / "mix.mp3"
    has_mp3 = _write_mp3(wav_path, mp3_path, warnings)

    transition_outputs: list[TransitionRender] = []
    for index, transition in enumerate(transitions):
        start_sec = (track_start_bars[index] + (transition.phrase.start_bar_a - starts[index])) * bar_sec
        end_sec = start_sec + transition.phrase.overlap_bars * bar_sec
        start_sample = max(0, int(round(start_sec * sr)))
        end_sample = min(output.shape[-1], int(round(end_sec * sr)))
        path = output_dir / f"transition-{index + 1:02d}.wav"
        sf.write(path, output[:, start_sample:end_sample].T, sr, subtype="PCM_24")
        a_overlap = overlap_mono.get((index, "a"))
        b_overlap = overlap_mono.get((index, "b"))
        correlation = _phase_correlation(a_overlap, b_overlap) if a_overlap is not None and b_overlap is not None else None
        transition_warnings = []
        if correlation is not None and correlation < -0.3:
            transition_warnings.append(f"重叠区相位相关性 {correlation:.2f}，存在抵消风险")
        drop_align_ms = 0.0 if transition.type == "double_drop" else None
        transition.render.start_sec = round(start_sec, 3)
        transition.render.end_sec = round(end_sec, 3)
        report_path = output_dir / f"transition-{index + 1:02d}.json"
        report_path.write_text(json.dumps({
            "transition": transition.model_dump(by_alias=True),
            "metrics": {
                "phaseCorrelation": correlation,
                "dropAlignMs": drop_align_ms,
                "startSec": round(start_sec, 3),
                "endSec": round(end_sec, 3),
            },
            "warnings": transition_warnings,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        transition_outputs.append(TransitionRender(
            index=index,
            type=transition.type,
            start_sec=round(start_sec, 3),
            end_sec=round(end_sec, 3),
            drop_align_ms=drop_align_ms,
            phase_correlation=None if correlation is None else round(correlation, 3),
            warnings=transition_warnings,
            report_path=_relative(report_path),
        ))

    bucket_ms, peaks = _waveform(output, sr)
    result = RenderResult(
        set_id=plan.id,
        outputs=RenderOutputs(
            mix_wav=_relative(wav_path),
            mix_mp3=_relative(mp3_path) if has_mp3 else None,
            transitions=[_relative(output_dir / f"transition-{index + 1:02d}.wav") for index in range(len(transitions))],
        ),
        duration_sec=round(output.shape[-1] / sr, 3),
        loudness=Loudness(
            integrated_lufs=round(lufs if lufs is not None else -23.0, 2),
            peak_db=round(true_peak, 2),
        ),
        waveform={"bucketMs": bucket_ms, "peaks": peaks},
        transitions=transition_outputs,
        logs=logs[-40:] + warnings,
    )
    (output_dir / "plan.json").write_text(json.dumps(plan.model_dump(by_alias=True), ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "result.json").write_text(json.dumps(result.model_dump(by_alias=True), ensure_ascii=False, indent=2), encoding="utf-8")
    return result

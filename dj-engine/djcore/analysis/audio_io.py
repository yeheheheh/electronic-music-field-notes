"""Audio decoding with soundfile first, ffmpeg fallback."""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

from djcore.config import ffmpeg_path


def _ffmpeg_decode(path: Path, sr: int, mono: bool) -> np.ndarray:
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to decode this file")
    channels = "1" if mono else "2"
    command = [
        ffmpeg, "-v", "error", "-i", str(path),
        "-f", "f32le", "-acodec", "pcm_f32le",
        "-ac", channels, "-ar", str(sr), "-",
    ]
    result = subprocess.run(command, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace")[-800:])
    audio = np.frombuffer(result.stdout, dtype=np.float32)
    if not mono:
        audio = audio.reshape(-1, 2)
    return audio.astype(np.float32)


def load_audio(path: str | Path, sr: int = 48000, mono: bool = True) -> tuple[np.ndarray, int]:
    path = Path(path)
    try:
        audio, source_sr = sf.read(str(path), dtype="float32", always_2d=True)
        if mono:
            audio = audio.mean(axis=1)
        if source_sr != sr:
            import librosa

            if mono:
                audio = librosa.resample(audio, orig_sr=source_sr, target_sr=sr)
            else:
                audio = np.stack([
                    librosa.resample(audio[:, channel], orig_sr=source_sr, target_sr=sr)
                    for channel in range(audio.shape[1])
                ], axis=1)
        return audio.astype(np.float32), sr
    except Exception:
        audio = _ffmpeg_decode(path, sr, mono)
        return audio, sr


def load_stereo(path: str | Path, sr: int = 48000) -> tuple[np.ndarray, int]:
    audio, rate = load_audio(path, sr=sr, mono=False)
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=0)
    else:
        audio = audio.T
    return audio.astype(np.float32), rate

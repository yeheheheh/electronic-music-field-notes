"""Tempo change with rubberband first, librosa as a documented fallback."""

from __future__ import annotations

import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

import numpy as np
import soundfile as sf

from djcore.config import OUTPUTS, rubberband_path


def stretch(
    audio: np.ndarray,
    sr: int,
    rate: float,
    log: Callable[[str], None] | None = None,
) -> tuple[np.ndarray, str]:
    """Change tempo by `rate` (2.0 = twice as fast, half the duration)."""
    if abs(rate - 1.0) < 1e-4 or audio.size == 0:
        return audio, "none"

    rubberband = rubberband_path()
    if rubberband:
        try:
            return _rubberband(audio, sr, rate, rubberband), "rubberband"
        except Exception as exc:
            if log:
                log(f"rubberband 失败，回退 librosa：{exc}")

    import librosa

    channels = [librosa.effects.time_stretch(audio[channel], rate=rate) for channel in range(audio.shape[0])]
    length = min(channel.shape[-1] for channel in channels)
    if log:
        log("stretch: librosa fallback")
    return np.stack([channel[:length] for channel in channels], axis=0), "librosa"


def _rubberband(audio: np.ndarray, sr: int, rate: float, binary: str) -> np.ndarray:
    tmp = Path(OUTPUTS) / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=tmp) as folder:
        source = Path(folder) / "in.wav"
        target = Path(folder) / "out.wav"
        sf.write(source, audio.T, sr, subtype="FLOAT")
        command = [binary, "-t", f"{rate:.6f}", "--quiet", str(source), str(target)]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode != 0 or not target.is_file():
            raise RuntimeError((result.stderr or result.stdout or "rubberband failed")[-500:])
        output, output_sr = sf.read(target, dtype="float32", always_2d=True)
        if output_sr != sr:
            raise RuntimeError(f"rubberband sample rate mismatch: {output_sr}")
        return output.T

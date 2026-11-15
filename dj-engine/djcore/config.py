"""Engine paths and capability discovery."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

ENGINE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ENGINE_ROOT.parent
OUTPUTS = ENGINE_ROOT / "outputs"
CACHE = OUTPUTS / "cache"
STEMS = OUTPUTS / "stems"
SETS = OUTPUTS / "sets"
FIXTURES_AUDIO = ENGINE_ROOT / "fixtures" / "audio"
FIXTURES_SIDECARS = ENGINE_ROOT / "fixtures" / "sidecars"
TOOLS = ENGINE_ROOT / "tools"
DATA = ENGINE_ROOT / "data"

ANALYSIS_VERSION = "1"
DEMUCS_MODEL = os.environ.get("DJ_DEMUCS_MODEL", "htdemucs")
SAMPLE_RATE = 48000
TARGET_LUFS = float(os.environ.get("DJ_TARGET_LUFS", "-14"))


def ensure_dirs() -> None:
    for path in (OUTPUTS, CACHE, STEMS, SETS, FIXTURES_AUDIO, FIXTURES_SIDECARS, TOOLS, DATA):
        path.mkdir(parents=True, exist_ok=True)


def _tool_binary(name: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        for candidate in TOOLS.glob(pattern):
            if candidate.is_file():
                return str(candidate)
    found = shutil.which(name)
    return found


def ffmpeg_path() -> str | None:
    found = _tool_binary("ffmpeg", ["ffmpeg*/bin/ffmpeg.exe", "ffmpeg.exe", "ffmpeg"])
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def ffprobe_path() -> str | None:
    return _tool_binary("ffprobe", ["ffmpeg*/bin/ffprobe.exe", "ffprobe.exe", "ffprobe"])


def rubberband_path() -> str | None:
    return _tool_binary("rubberband", ["rubberband*/rubberband.exe", "rubberband.exe", "rubberband"])


def demucs_available() -> bool:
    try:
        import demucs  # noqa: F401
    except Exception:
        return False
    return True


def torch_device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def capabilities() -> dict:
    return {
        "ffmpeg": ffmpeg_path(),
        "rubberband": rubberband_path(),
        "demucs": demucs_available(),
        "device": torch_device(),
        "sampleRate": SAMPLE_RATE,
        "targetLufs": TARGET_LUFS,
    }

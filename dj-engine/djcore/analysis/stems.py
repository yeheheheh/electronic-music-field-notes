"""Demucs stem separation with a content-addressed cache."""

from __future__ import annotations

import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from djcore.config import DEMUCS_MODEL, STEMS, torch_device

STEM_NAMES = ("vocals", "drums", "bass", "other")


def _complete(target: Path) -> bool:
    return all((target / f"{name}.wav").is_file() for name in STEM_NAMES)


def separate(
    audio_path: str | Path,
    digest: str,
    *,
    device: str | None = None,
    log: Callable[[str], None] | None = None,
) -> dict[str, str]:
    audio_path = Path(audio_path)
    target = STEMS / digest[:16]
    if _complete(target):
        return {name: str(target / f"{name}.wav") for name in STEM_NAMES}

    device = device or torch_device()
    staging = target / "_staging"
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable, "-m", "demucs.separate",
        "-n", DEMUCS_MODEL,
        "-o", str(staging),
        "--device", device,
        "--shifts", "0",
        "--float32",
        str(audio_path),
    ]
    if log:
        log("demucs: " + " ".join(command))
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "")[-1200:]
        raise RuntimeError(f"demucs failed ({result.returncode}): {tail}")

    produced = staging / DEMUCS_MODEL / audio_path.stem
    if not produced.is_dir():
        candidates = list(staging.glob(f"{DEMUCS_MODEL}/*"))
        if not candidates:
            raise RuntimeError("demucs produced no output")
        produced = candidates[0]

    target.mkdir(parents=True, exist_ok=True)
    for name in STEM_NAMES:
        source = produced / f"{name}.wav"
        if not source.is_file():
            raise RuntimeError(f"demucs missing stem: {name}")
        shutil.copy2(source, target / f"{name}.wav")
    shutil.rmtree(staging, ignore_errors=True)
    return {name: str(target / f"{name}.wav") for name in STEM_NAMES}

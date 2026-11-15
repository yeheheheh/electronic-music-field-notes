"""Shared service layer used by the CLI, HTTP API and MCP adapter."""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from djcore.analysis.pipeline import analyze_track, analyze_tracks
from djcore.config import (
    ENGINE_ROOT,
    FIXTURES_AUDIO,
    FIXTURES_SIDECARS,
    REPO_ROOT,
    SETS,
    ffmpeg_path,
)
from djcore.contracts import (
    RenderResult,
    SetPlan,
    StyleIntent,
    TrackAnalysis,
    dump_json,
)
from djcore.library.fixtures import generate_fixtures
from djcore.library.local import LocalLibrary
from djcore.library.rekordbox import RekordboxBridge, RekordboxUnavailable
from djcore.planning.intent import parse_intent
from djcore.planning.set_planner import plan_set
from djcore.render.mixdown import render_set

_SET_ID = re.compile(r"^[A-Za-z0-9._-]+$")


def default_library() -> LocalLibrary:
    return LocalLibrary(FIXTURES_AUDIO, FIXTURES_SIDECARS)


def ensure_fixtures(force: bool = False) -> list[Path]:
    return generate_fixtures(FIXTURES_AUDIO, FIXTURES_SIDECARS, force=force)


def select_tracks(library: LocalLibrary, specs: list[str] | None = None) -> list:
    tracks = library.list_tracks()
    if not specs:
        return tracks
    selected = []
    for spec in specs:
        lowered = spec.lower()
        match = next(
            (
                track for track in tracks
                if track.id == spec
                or track.title.lower() == lowered
                or Path(track.path).stem.lower() == lowered
                or lowered in track.title.lower()
            ),
            None,
        )
        if match is None:
            raise ValueError(f"找不到曲目：{spec}")
        selected.append(match)
    return selected


def analyze_library(
    library: LocalLibrary | None = None,
    tracks: list | None = None,
    *,
    separate_stems: bool = True,
    force: bool = False,
    use_sidecar_truth: bool = False,
    log: Callable[[str], None] | None = None,
) -> dict[str, TrackAnalysis]:
    library = library or default_library()
    tracks = tracks or library.list_tracks()
    sidecars = {track.id: library.sidecar(track.id) for track in tracks}
    return analyze_tracks(
        tracks,
        sidecars,
        separate_stems=separate_stems,
        force=force,
        use_sidecar_truth=use_sidecar_truth,
        log=log,
    )


def build_intent(
    preset: str = "melodic-techno",
    prompt: str = "",
    duration_min: float = 8.0,
    seed: int = 20261027,
    intent_payload: dict | None = None,
    density: str | None = None,
) -> StyleIntent:
    if intent_payload:
        return StyleIntent.model_validate(intent_payload)
    return parse_intent(prompt, preset, duration_min=duration_min, seed=seed, density=density)


def build_plan(
    analyses: dict[str, TrackAnalysis],
    intent: StyleIntent,
    track_ids: list[str] | None = None,
) -> SetPlan:
    plan = plan_set(analyses, intent, track_ids)
    save_plan(plan)
    return plan


def save_plan(plan: SetPlan) -> Path:
    path = SETS / plan.id / "plan.json"
    dump_json(path, plan)
    return path


def set_dir(set_id: str) -> Path:
    if not _SET_ID.match(set_id):
        raise ValueError("invalid set id")
    return SETS / set_id


def load_plan(set_id: str) -> SetPlan:
    path = set_dir(set_id) / "plan.json"
    if not path.is_file():
        raise FileNotFoundError(f"set not found: {set_id}")
    return SetPlan.model_validate_json(path.read_text(encoding="utf-8"))


def load_result(set_id: str) -> RenderResult | None:
    path = set_dir(set_id) / "result.json"
    if not path.is_file():
        return None
    return RenderResult.model_validate_json(path.read_text(encoding="utf-8"))


def render_plan(
    plan: SetPlan,
    analyses: dict[str, TrackAnalysis] | None = None,
    *,
    log: Callable[[str], None] | None = None,
) -> RenderResult:
    library = default_library()
    if analyses is None:
        analyses = {}
        for entry in plan.entries:
            track = next((item for item in library.list_tracks() if item.id == entry.track_id), None)
            if track is None:
                raise ValueError(f"找不到曲目：{entry.track_id}")
            analysis = analyze_track(track, library.sidecar(track.id), separate_stems=True, log=log)
            analyses[track.id] = analysis
    return render_set(plan, analyses, log=log)


def run_demo(
    preset: str = "melodic-techno",
    prompt: str = "",
    duration_min: float = 8.0,
    *,
    separate_stems: bool = True,
    seed: int = 20261027,
    density: str | None = None,
    log: Callable[[str], None] | None = None,
) -> tuple[SetPlan, RenderResult]:
    ensure_fixtures()
    library = default_library()
    analyses = analyze_library(library, separate_stems=separate_stems, use_sidecar_truth=True, log=log)
    intent = build_intent(preset, prompt, duration_min, seed=seed, density=density)
    plan = build_plan(analyses, intent)
    result = render_plan(plan, analyses, log=log)
    return plan, result


def _relative_to_engine(path: Path) -> str:
    try:
        return os.path.relpath(str(path), str(ENGINE_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path)


def _select_rekordbox_tracks(bridge: RekordboxBridge, specs: list[str] | None) -> list:
    tracks = bridge.list_tracks()
    if not specs:
        return tracks
    selected = []
    for spec in specs:
        lowered = spec.lower()
        match = next(
            (
                track for track in tracks
                if track.id == spec
                or track.title.lower() == lowered
                or lowered in track.title.lower()
            ),
            None,
        )
        if match is None:
            raise ValueError(f"找不到 Rekordbox 曲目：{spec}")
        selected.append(match)
    return selected


def rekordbox_status(db_path: str | Path | None = None) -> dict:
    try:
        with RekordboxBridge(db_path) as bridge:
            return bridge.status()
    except RekordboxUnavailable as exc:
        return {"ok": False, "error": str(exc)}


def rekordbox_scan(db_path: str | Path | None = None) -> dict:
    try:
        with RekordboxBridge(db_path) as bridge:
            tracks = bridge.list_tracks()
            playlists = [
                {**item, "trackIds": bridge.playlist_track_ids(item["id"])}
                for item in bridge.list_playlists()
            ]
            return {
                "ok": True,
                "dbPath": str(bridge.db_path),
                "tracks": [
                    {
                        "id": track.id,
                        "title": track.title,
                        "artist": track.artist,
                        "path": track.path,
                        "durationSec": track.duration_sec,
                    }
                    for track in tracks
                ],
                "playlists": playlists,
                "warnings": bridge.warnings,
            }
    except RekordboxUnavailable as exc:
        return {"ok": False, "error": str(exc)}


def _limit_rekordbox_pool(
    bridge: RekordboxBridge,
    tracks: list,
    intent: StyleIntent,
    limit: int,
) -> list:
    if limit <= 0 or len(tracks) <= limit:
        return tracks
    low, high = intent.bpm_range
    center = (low + high) / 2.0
    scored = []
    for track in tracks:
        meta = bridge.sidecar(track.id).get("rekordbox", {})
        bpm = float(meta.get("bpm") or 0.0)
        if bpm > 0 and not (low * 0.94 <= bpm <= high * 1.06):
            continue
        scored.append((abs((bpm or center) - center), track))
    if len(scored) < 2:
        return tracks[:limit]
    scored.sort(key=lambda item: item[0])
    return [track for _, track in scored[:limit]]


def rekordbox_plan(
    preset: str = "melodic-techno",
    prompt: str = "",
    duration_min: float = 8.0,
    track_ids: list[str] | None = None,
    *,
    stems: bool = True,
    db_path: str | Path | None = None,
    seed: int = 20261027,
    render: bool = True,
    limit: int = 8,
    density: str | None = None,
    log: Callable[[str], None] | None = None,
) -> tuple[SetPlan, RenderResult | None]:
    intent = build_intent(preset, prompt, duration_min, seed=seed, density=density)
    with RekordboxBridge(db_path) as bridge:
        tracks = _select_rekordbox_tracks(bridge, track_ids)
        if track_ids is None:
            tracks = _limit_rekordbox_pool(bridge, tracks, intent, limit)
        if len(tracks) < 2:
            raise ValueError("Rekordbox 可排曲目不足 2 首（已过滤采样/录音素材）")
        sidecars = {track.id: bridge.sidecar(track.id) for track in tracks}
    analyses = analyze_tracks(tracks, sidecars, separate_stems=stems, log=log)
    plan = build_plan(analyses, intent, [track.id for track in tracks])
    result = render_plan(plan, analyses, log=log) if render else None
    return plan, result


def rekordbox_export(
    set_id: str,
    name: str,
    mode: str = "xml",
    *,
    db_path: str | Path | None = None,
    confirm: bool = False,
    xml_dir: str | Path | None = None,
) -> dict:
    plan = load_plan(set_id)
    track_ids = [entry.track_id for entry in plan.entries]
    if not track_ids or not all(track_id.startswith("rb-") for track_id in track_ids):
        raise ValueError("这个 set 不是 Rekordbox 曲目，不能导出到 Rekordbox")
    if mode not in ("db", "xml", "both"):
        raise ValueError("mode 必须是 db / xml / both")
    if mode in ("db", "both") and not confirm:
        raise PermissionError("写 Rekordbox 播放列表需要 confirm=true")
    payload = {"setId": set_id, "mode": mode, "name": name, "trackCount": len(track_ids)}
    with RekordboxBridge(db_path) as bridge:
        if mode in ("db", "both"):
            payload["playlist"] = bridge.write_playlist(name, track_ids)
        if mode in ("xml", "both"):
            path = bridge.export_xml(name, track_ids, out_dir=xml_dir)
            payload["xmlPath"] = _relative_to_engine(path)
    return payload


def latest_set_id() -> str:
    candidates = [
        path.parent.name
        for path in SETS.glob("*/result.json")
        if path.is_file()
    ]
    if not candidates:
        raise FileNotFoundError("还没有可导出的 set")
    return max(candidates, key=lambda name: (SETS / name / "result.json").stat().st_mtime)


def export_site_demo(set_id: str | None = None, bitrate: str = "160k") -> Path:
    set_id = set_id or latest_set_id()
    plan = load_plan(set_id)
    result = load_result(set_id)
    if result is None:
        raise FileNotFoundError(f"set 还没有渲染结果：{set_id}")

    assets = REPO_ROOT / "assets" / "dj-automix"
    assets.mkdir(parents=True, exist_ok=True)
    source_value = result.outputs.mix_mp3 or result.outputs.mix_wav
    if not source_value:
        raise FileNotFoundError("渲染结果没有音频路径")
    source = Path(ENGINE_ROOT) / source_value
    if not source.is_file():
        raise FileNotFoundError(source)
    target_audio = assets / "demo-mix.mp3"
    ffmpeg = ffmpeg_path()
    if ffmpeg:
        command = [
            ffmpeg, "-y", "-v", "error", "-i", str(source),
            "-codec:a", "libmp3lame", "-b:a", bitrate, str(target_audio),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            shutil.copy2(source, target_audio)
    else:
        shutil.copy2(source, target_audio)

    peaks = result.waveform.peaks
    step = max(1, math.ceil(len(peaks) / 4000)) if peaks else 1
    trimmed = {
        "durationSec": result.duration_sec,
        "loudness": result.loudness.model_dump(by_alias=True),
        "waveform": {
            "bucketMs": result.waveform.bucket_ms * step,
            "peaks": peaks[::step],
        },
        "transitions": [item.model_dump(by_alias=True) for item in result.transitions],
        "outputs": {"mixMp3": "assets/dj-automix/demo-mix.mp3"},
    }
    payload = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "note": "合成 fixture 渲染：double drop + bass swap + long blend",
        "audio": {"mix": "assets/dj-automix/demo-mix.mp3"},
        "plan": plan.model_dump(by_alias=True),
        "result": trimmed,
    }
    target_js = REPO_ROOT / "data" / "dj-automix-demo.js"
    target_js.write_text(
        "/* 自动接歌台演示数据。由 `djcore export-demo` 生成，不要手改。 */\n"
        "window.DJ_AUTOMIX_DEMO = "
        + json.dumps(payload, ensure_ascii=False)
        + ";\n",
        encoding="utf-8",
    )
    return target_js

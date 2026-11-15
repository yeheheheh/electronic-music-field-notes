"""MCP stdio adapter. Thin shell over the same service functions as CLI/HTTP."""

from __future__ import annotations

import json

from djcore.analysis.cache import load_analysis
from djcore.config import capabilities
from djcore.service import (
    analyze_library,
    build_intent,
    build_plan,
    default_library,
    load_plan,
    load_result,
    rekordbox_export,
    rekordbox_plan,
    rekordbox_scan,
    rekordbox_status,
    render_plan,
    select_tracks,
)

try:
    from mcp.server.fastmcp import FastMCP
except Exception:  # pragma: no cover - only executed when the optional dep is absent
    FastMCP = None


def _payload(model) -> dict:
    return json.loads(model.model_dump_json(by_alias=True))


if FastMCP is not None:
    mcp = FastMCP("djcore")

    @mcp.tool()
    def dj_health() -> dict:
        """Report ffmpeg / rubberband / Demucs / GPU capabilities."""
        return capabilities()

    @mcp.tool()
    def dj_analyze(track_ids: list[str] | None = None, stems: bool = True) -> dict:
        """Analyze local tracks. Omit track_ids to analyze the whole fixture library."""
        library = default_library()
        tracks = select_tracks(library, track_ids)
        analyses = analyze_library(library, tracks, separate_stems=stems)
        return {
            track_id: {
                "title": analysis.track.title,
                "bpm": analysis.bpm.value,
                "key": analysis.key.camelot,
                "drops": [drop.bar for drop in analysis.drops],
                "warnings": analysis.warnings,
            }
            for track_id, analysis in analyses.items()
        }

    @mcp.tool()
    def dj_plan_set(
        preset: str = "melodic-techno",
        prompt: str = "",
        duration_min: float = 8.0,
        track_ids: list[str] | None = None,
    ) -> dict:
        """Plan a set from already analyzed tracks and return the SetPlan."""
        library = default_library()
        tracks = select_tracks(library, track_ids)
        analyses = {}
        for track in tracks:
            analysis = load_analysis(track.sha256)
            if analysis is None:
                return {"ok": False, "error": f"track not analyzed: {track.title}"}
            analyses[track.id] = analysis
        intent = build_intent(preset, prompt, duration_min)
        plan = build_plan(analyses, intent, [track.id for track in tracks])
        return {"ok": True, "plan": _payload(plan)}

    @mcp.tool()
    def dj_render_set(set_id: str) -> dict:
        """Render an existing set plan to WAV/MP3 and return the RenderResult."""
        try:
            plan = load_plan(set_id)
        except FileNotFoundError:
            return {"ok": False, "error": f"set not found: {set_id}"}
        result = render_plan(plan)
        return {"ok": True, "result": _payload(result)}

    @mcp.tool()
    def dj_get_set(set_id: str) -> dict:
        """Read a stored plan and its render result."""
        try:
            plan = load_plan(set_id)
        except FileNotFoundError:
            return {"ok": False, "error": f"set not found: {set_id}"}
        result = load_result(set_id)
        return {
            "ok": True,
            "plan": _payload(plan),
            "result": _payload(result) if result else None,
        }

    @mcp.tool()
    def rb_status() -> dict:
        """Report the Rekordbox database path, playable tracks and write safety."""
        return rekordbox_status()

    @mcp.tool()
    def rb_library() -> dict:
        """List Rekordbox playable tracks and playlists."""
        return rekordbox_scan()

    @mcp.tool()
    def rb_plan_set(
        preset: str = "melodic-techno",
        prompt: str = "",
        duration_min: float = 8.0,
        track_ids: list[str] | None = None,
        stems: bool = True,
        limit: int = 8,
    ) -> dict:
        """Analyze Rekordbox tracks, plan a set and render it."""
        try:
            plan, result = rekordbox_plan(
                preset, prompt, duration_min, track_ids, stems=stems, limit=limit
            )
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        return {
            "ok": True,
            "plan": _payload(plan),
            "result": _payload(result) if result else None,
        }

    @mcp.tool()
    def rb_export_playlist(
        set_id: str,
        name: str,
        mode: str = "xml",
        confirm: bool = False,
    ) -> dict:
        """Export a set to Rekordbox. DB writes require confirm=true."""
        if mode in ("db", "both") and not confirm:
            try:
                plan = load_plan(set_id)
                count = len(plan.entries)
            except Exception as exc:
                return {"ok": False, "error": str(exc)}
            return {
                "ok": False,
                "dryRun": True,
                "setId": set_id,
                "trackCount": count,
                "message": "confirm=true 才会写 Rekordbox 数据库；写入前会自动备份",
            }
        try:
            result = rekordbox_export(set_id, name, mode, confirm=confirm)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        return {"ok": True, **result}


def main() -> int:
    if FastMCP is None:
        print("mcp package is not installed; run: uv pip install mcp")
        return 1
    mcp.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

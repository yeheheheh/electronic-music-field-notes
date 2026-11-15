"""Command line adapter for the engine."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from djcore.analysis.cache import load_analysis
from djcore.config import FIXTURES_AUDIO, FIXTURES_SIDECARS, capabilities
from djcore.contracts import SetPlan, StyleIntent, dump_json
from djcore.library.fixtures import generate_fixtures
from djcore.service import (
    analyze_library,
    build_intent,
    build_plan,
    default_library,
    export_site_demo,
    rekordbox_export,
    rekordbox_plan,
    rekordbox_scan,
    rekordbox_status,
    render_plan,
    run_demo,
    select_tracks,
)


def _print(payload) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _log(message: str) -> None:
    print(message, flush=True)


def _load_analyses(track_ids: list[str] | None = None) -> dict:
    library = default_library()
    tracks = select_tracks(library, track_ids)
    analyses = {}
    missing = []
    for track in tracks:
        analysis = load_analysis(track.sha256)
        if analysis is None:
            missing.append(track.title)
        else:
            analyses[track.id] = analysis
    if missing:
        raise SystemExit(f"以下曲目还没有分析结果，先运行 `djcore analyze`：{', '.join(missing)}")
    return analyses


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="djcore", description="Offline DJ set planner and transition renderer")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="print capability checks")

    fixtures = sub.add_parser("fixtures", help="generate deterministic fixture tracks")
    fixtures.add_argument("--force", action="store_true")

    analyze = sub.add_parser("analyze", help="analyze library tracks")
    analyze.add_argument("--tracks", default="", help="comma-separated ids, titles or file stems")
    analyze.add_argument("--no-stems", action="store_true", help="skip Demucs separation")
    analyze.add_argument("--truth", action="store_true", help="use fixture sidecars as structural truth")
    analyze.add_argument("--force", action="store_true")

    plan = sub.add_parser("plan", help="plan a set from analyzed tracks")
    plan.add_argument("--tracks", default="")
    plan.add_argument("--preset", default="melodic-techno")
    plan.add_argument("--prompt", default="")
    plan.add_argument("--duration", type=float, default=8.0)
    plan.add_argument("--density", choices=("sparse", "normal", "dense"), default="", help="transition density preset")
    plan.add_argument("--seed", type=int, default=20261027)
    plan.add_argument("--intent", default="", help="path to a StyleIntent JSON file")
    plan.add_argument("--out", default="")

    render = sub.add_parser("render", help="render an existing plan")
    render.add_argument("--plan", required=True)

    run = sub.add_parser("run", help="analyze fixtures, plan and render in one go")
    run.add_argument("--preset", default="melodic-techno")
    run.add_argument("--prompt", default="")
    run.add_argument("--duration", type=float, default=8.0)
    run.add_argument("--density", choices=("sparse", "normal", "dense"), default="", help="transition density preset")
    run.add_argument("--no-stems", action="store_true")
    run.add_argument("--seed", type=int, default=20261027)

    demo = sub.add_parser("demo", help="build the demo set and print its paths")
    demo.add_argument("--preset", default="melodic-techno")
    demo.add_argument("--prompt", default="")
    demo.add_argument("--duration", type=float, default=8.0)
    demo.add_argument("--density", choices=("sparse", "normal", "dense"), default="", help="transition density preset")
    demo.add_argument("--no-stems", action="store_true")

    export = sub.add_parser("export-demo", help="write the site demo bundle and MP3")
    export.add_argument("--set", default="", help="set id; defaults to the latest rendered set")
    export.add_argument("--bitrate", default="160k")

    rb = sub.add_parser("rekordbox", help="Rekordbox 7 bridge")
    rb_sub = rb.add_subparsers(dest="rb_command", required=True)

    rb_status = rb_sub.add_parser("status", help="show Rekordbox database status")
    rb_status.add_argument("--db-path", default="")

    rb_scan = rb_sub.add_parser("scan", help="list playable tracks and playlists")
    rb_scan.add_argument("--db-path", default="")

    rb_plan = rb_sub.add_parser("plan", help="analyze, plan and render Rekordbox tracks")
    rb_plan.add_argument("--db-path", default="")
    rb_plan.add_argument("--tracks", default="", help="comma-separated rb- ids or titles")
    rb_plan.add_argument("--preset", default="melodic-techno")
    rb_plan.add_argument("--prompt", default="")
    rb_plan.add_argument("--duration", type=float, default=6.0)
    rb_plan.add_argument("--density", choices=("sparse", "normal", "dense"), default="", help="transition density preset")
    rb_plan.add_argument("--limit", type=int, default=8, help="max Rekordbox tracks to analyze")
    rb_plan.add_argument("--no-stems", action="store_true")
    rb_plan.add_argument("--no-render", action="store_true")
    rb_plan.add_argument("--export", choices=("none", "db", "xml", "both"), default="none")
    rb_plan.add_argument("--name", default="")
    rb_plan.add_argument("--xml-dir", default="")

    rb_export = rb_sub.add_parser("export", help="export an existing set to Rekordbox")
    rb_export.add_argument("--set", required=True)
    rb_export.add_argument("--name", required=True)
    rb_export.add_argument("--mode", choices=("db", "xml", "both"), default="xml")
    rb_export.add_argument("--db-path", default="")
    rb_export.add_argument("--xml-dir", default="")
    rb_export.add_argument("--confirm", action="store_true", help="required for db/both")

    args = parser.parse_args(argv)

    if args.command == "health":
        _print(capabilities())
        return 0

    if args.command == "rekordbox":
        db_path = args.db_path or None
        if args.rb_command == "status":
            _print(rekordbox_status(db_path))
            return 0
        if args.rb_command == "scan":
            _print(rekordbox_scan(db_path))
            return 0
        if args.rb_command == "plan":
            track_ids = [item for item in args.tracks.split(",") if item] or None
            plan, result = rekordbox_plan(
                args.preset,
                args.prompt,
                args.duration,
                track_ids,
                stems=not args.no_stems,
                db_path=db_path,
                render=not args.no_render,
                limit=args.limit,
                density=args.density or None,
                log=_log,
            )
            payload = {
                "setId": plan.id,
                "plan": json.loads(plan.model_dump_json(by_alias=True)),
            }
            if result is not None:
                payload["result"] = json.loads(result.model_dump_json(by_alias=True))
            if args.export != "none":
                name = args.name or f"djcore {plan.id[-8:]}"
                payload["export"] = rekordbox_export(
                    plan.id,
                    name,
                    args.export,
                    db_path=db_path,
                    confirm=args.export in ("db", "both"),
                    xml_dir=args.xml_dir or None,
                )
            _print(payload)
            return 0
        if args.rb_command == "export":
            _print(rekordbox_export(
                args.set,
                args.name,
                args.mode,
                db_path=db_path,
                confirm=args.confirm,
                xml_dir=args.xml_dir or None,
            ))
            return 0

    if args.command == "fixtures":
        paths = generate_fixtures(FIXTURES_AUDIO, FIXTURES_SIDECARS, force=args.force)
        _print([str(path) for path in paths])
        return 0

    if args.command == "analyze":
        library = default_library()
        tracks = select_tracks(library, [item for item in args.tracks.split(",") if item] or None)
        analyses = analyze_library(
            library,
            tracks,
            separate_stems=not args.no_stems,
            force=args.force,
            use_sidecar_truth=args.truth,
            log=_log,
        )
        _print([
            {
                "id": analysis.track.id,
                "title": analysis.track.title,
                "bpm": analysis.bpm.value,
                "key": analysis.key.camelot,
                "drops": [drop.bar for drop in analysis.drops],
                "warnings": analysis.warnings,
            }
            for analysis in analyses.values()
        ])
        return 0

    if args.command == "plan":
        analyses = _load_analyses([item for item in args.tracks.split(",") if item] or None)
        if args.intent:
            intent = StyleIntent.model_validate_json(Path(args.intent).read_text(encoding="utf-8"))
        else:
            intent = build_intent(args.preset, args.prompt, args.duration, args.seed, density=args.density or None)
        plan = build_plan(analyses, intent)
        if args.out:
            dump_json(args.out, plan)
        _print(json.loads(plan.model_dump_json(by_alias=True)))
        return 0

    if args.command == "render":
        plan = SetPlan.model_validate_json(Path(args.plan).read_text(encoding="utf-8"))
        result = render_plan(plan, log=_log)
        _print(json.loads(result.model_dump_json(by_alias=True)))
        return 0

    if args.command in ("run", "demo"):
        plan, result = run_demo(
            args.preset,
            args.prompt,
            args.duration,
            separate_stems=not args.no_stems,
            density=args.density or None,
            log=_log,
        )
        _print({
            "setId": plan.id,
            "plan": json.loads(plan.model_dump_json(by_alias=True)),
            "result": json.loads(result.model_dump_json(by_alias=True)),
        })
        return 0

    if args.command == "export-demo":
        target = export_site_demo(args.set or None, args.bitrate)
        _print({"demo": str(target), "audio": "assets/dj-automix/demo-mix.mp3"})
        return 0

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

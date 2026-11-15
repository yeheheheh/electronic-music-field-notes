"""Local HTTP adapter for the site console (127.0.0.1 only)."""

from __future__ import annotations

import os
import threading
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from queue import Queue

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field

from djcore.analysis.cache import load_analysis
from djcore.config import (
    ENGINE_ROOT,
    FIXTURES_AUDIO,
    OUTPUTS,
    capabilities,
    ensure_dirs,
)
from djcore.contracts import StyleIntent
from djcore.library.local import LocalLibrary
from djcore.planning.compatibility import load_genres
from djcore.planning.intent import PRESETS
from djcore.service import (
    analyze_library,
    build_intent,
    build_plan,
    default_library,
    ensure_fixtures,
    load_plan,
    load_result,
    rekordbox_export,
    rekordbox_plan,
    rekordbox_scan,
    rekordbox_status,
    render_plan,
    select_tracks,
)

ensure_dirs()
app = FastAPI(title="djcore", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class _Cancelled(Exception):
    pass


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"
    progress: int = 0
    stage: str = "queued"
    logs: list[str] = field(default_factory=list)
    error: str | None = None
    result: dict | None = None
    cancel: bool = False

    def log(self, message: str) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        self.logs.append(f"{stamp} {message}")
        if len(self.logs) > 200:
            del self.logs[:50]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "progress": self.progress,
            "stage": self.stage,
            "logs": self.logs[-40:],
            "error": self.error,
            "result": self.result,
        }


JOBS: dict[str, Job] = {}
JOBS_LOCK = threading.Lock()
QUEUE: Queue = Queue()


def _worker() -> None:
    while True:
        job, fn = QUEUE.get()
        try:
            if job.cancel:
                job.status = "cancelled"
                continue
            job.status = "running"
            job.stage = "starting"
            fn(job)
            if job.cancel:
                job.status = "cancelled"
            else:
                job.status = "done"
                job.progress = 100
                job.stage = "done"
        except _Cancelled:
            job.status = "cancelled"
        except Exception as exc:
            job.status = "failed"
            job.error = f"{exc}"
            job.log(traceback.format_exc()[-1200:])
        finally:
            QUEUE.task_done()


threading.Thread(target=_worker, daemon=True, name="djcore-worker").start()


def _submit(kind: str, fn) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], kind=kind)
    with JOBS_LOCK:
        JOBS[job.id] = job
    QUEUE.put((job, fn))
    return job


class ScanBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    path: str | None = None


class AnalyzeBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    track_ids: list[str] | None = Field(default=None, alias="trackIds")
    stems: bool = True
    force: bool = False


class PlanBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    preset: str = "melodic-techno"
    prompt: str = ""
    duration_min: float = Field(default=8.0, alias="durationMin")
    density: str | None = None
    seed: int = 20261027
    track_ids: list[str] | None = Field(default=None, alias="trackIds")
    intent: dict | None = None


class DemoBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    preset: str = "melodic-techno"
    prompt: str = ""
    duration_min: float = Field(default=8.0, alias="durationMin")
    density: str | None = None
    stems: bool = True
    seed: int = 20261027


class RekordboxScanBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    db_path: str | None = Field(default=None, alias="dbPath")


class RekordboxPlanBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    preset: str = "melodic-techno"
    prompt: str = ""
    duration_min: float = Field(default=6.0, alias="durationMin")
    density: str | None = None
    track_ids: list[str] | None = Field(default=None, alias="trackIds")
    stems: bool = True
    db_path: str | None = Field(default=None, alias="dbPath")
    seed: int = 20261027
    limit: int = 8


class RekordboxExportBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    set_id: str = Field(alias="setId")
    name: str
    mode: str = "xml"
    db_path: str | None = Field(default=None, alias="dbPath")
    xml_dir: str | None = Field(default=None, alias="xmlDir")
    confirm: bool = False


def _library_for(path: str | None) -> LocalLibrary:
    if not path:
        return default_library()
    root = Path(path)
    return LocalLibrary(root, root.parent / "sidecars")


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "capabilities": capabilities(),
        "jobs": len(JOBS),
        "engineRoot": str(ENGINE_ROOT),
    }


@app.get("/api/presets")
def presets() -> dict:
    genres = load_genres()
    return {
        "presets": [
            {
                "id": key,
                "label": value["label"],
                "genres": [{"id": genre_id, "name": (genres.get(genre_id) or {}).get("name", genre_id)} for genre_id, _ in value["genres"]],
                "bpm": value["bpm"],
                "energy": value["energy"],
            }
            for key, value in PRESETS.items()
        ],
        "genres": genres,
        "densities": [
            {"id": "sparse", "label": "舒缓长混音", "detail": "32 小节长混音 / 不排 double drop"},
            {"id": "normal", "label": "均衡", "detail": "v1 默认曲线"},
            {"id": "dense", "label": "快速切换", "detail": "短过渡 / 优先低频交换与 double drop"},
        ],
    }


@app.post("/api/library/scan")
def scan(body: ScanBody) -> dict:
    library = _library_for(body.path)
    tracks = []
    for track in library.list_tracks():
        analysis = load_analysis(track.sha256)
        tracks.append({
            "id": track.id,
            "title": track.title,
            "artist": track.artist,
            "path": track.path,
            "durationSec": track.duration_sec,
            "genreId": track.genre_id,
            "analyzed": analysis is not None,
            "bpm": analysis.bpm.value if analysis else None,
            "key": analysis.key.camelot if analysis else None,
            "drops": [drop.bar for drop in analysis.drops] if analysis else [],
        })
    return {"tracks": tracks}


@app.post("/api/analyze")
def analyze(body: AnalyzeBody) -> dict:
    library = default_library()
    tracks = select_tracks(library, body.track_ids)

    def run(job: Job) -> None:
        total = max(1, len(tracks))
        for index, track in enumerate(tracks):
            if job.cancel:
                raise _Cancelled()
            job.stage = f"analyze {track.title}"
            job.progress = int(index / total * 100)
            job.log(f"analyze {track.title}")
            from djcore.analysis.pipeline import analyze_track

            analyze_track(
                track,
                library.sidecar(track.id),
                separate_stems=body.stems,
                force=body.force,
                log=job.log,
            )
        job.result = {"trackIds": [track.id for track in tracks]}

    return _submit("analyze", run).to_dict()


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return job.to_dict()


@app.post("/api/jobs/{job_id}/cancel")
def job_cancel(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    job.cancel = True
    if job.status == "queued":
        job.status = "cancelled"
    return job.to_dict()


@app.post("/api/sets/plan")
def plan_endpoint(body: PlanBody) -> dict:
    library = default_library()
    tracks = select_tracks(library, body.track_ids)
    analyses = {}
    missing = []
    for track in tracks:
        analysis = load_analysis(track.sha256)
        if analysis is None:
            missing.append(track.title)
        else:
            analyses[track.id] = analysis
    if missing:
        raise HTTPException(409, f"曲目尚未分析：{', '.join(missing)}")
    intent = (
        StyleIntent.model_validate(body.intent)
        if body.intent
        else build_intent(body.preset, body.prompt, body.duration_min, body.seed, density=body.density)
    )
    plan = build_plan(analyses, intent, [track.id for track in tracks])
    return {"plan": plan.model_dump(by_alias=True)}


@app.post("/api/sets/{set_id}/render")
def render_endpoint(set_id: str) -> dict:
    try:
        plan = load_plan(set_id)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "set not found")

    def run(job: Job) -> None:
        job.stage = "render"
        job.progress = 10
        result = render_plan(plan, log=job.log)
        job.result = {
            "setId": set_id,
            "mix": result.outputs.mix_mp3 or result.outputs.mix_wav,
            "durationSec": result.duration_sec,
        }
        job.progress = 100

    return _submit("render", run).to_dict()


@app.get("/api/sets/{set_id}")
def get_set(set_id: str) -> dict:
    try:
        plan = load_plan(set_id)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "set not found")
    result = load_result(set_id)
    return {
        "plan": plan.model_dump(by_alias=True),
        "result": result.model_dump(by_alias=True) if result else None,
    }


@app.get("/api/rekordbox/status")
def rekordbox_status_endpoint(db_path: str | None = Query(default=None, alias="dbPath")) -> dict:
    return rekordbox_status(db_path)


@app.post("/api/rekordbox/scan")
def rekordbox_scan_endpoint(body: RekordboxScanBody) -> dict:
    return rekordbox_scan(body.db_path)


@app.post("/api/rekordbox/plan")
def rekordbox_plan_endpoint(body: RekordboxPlanBody) -> dict:
    def run(job: Job) -> None:
        job.stage = "rekordbox scan"
        job.progress = 5
        plan, result = rekordbox_plan(
            body.preset,
            body.prompt,
            body.duration_min,
            body.track_ids,
            stems=body.stems,
            db_path=body.db_path,
            seed=body.seed,
            limit=body.limit,
            density=body.density,
            log=job.log,
        )
        job.result = {
            "setId": plan.id,
            "trackCount": len(plan.entries),
            "durationSec": result.duration_sec if result else plan.totals.duration_sec,
            "mix": (result.outputs.mix_mp3 or result.outputs.mix_wav) if result else None,
        }

    return _submit("rekordbox-plan", run).to_dict()


@app.post("/api/rekordbox/export")
def rekordbox_export_endpoint(body: RekordboxExportBody) -> dict:
    if body.mode not in ("db", "xml", "both"):
        raise HTTPException(400, "mode must be db / xml / both")
    if body.mode in ("db", "both") and not body.confirm:
        raise HTTPException(400, "confirm=true is required to write the Rekordbox database")

    def run(job: Job) -> None:
        job.stage = "rekordbox export"
        job.progress = 20
        result = rekordbox_export(
            body.set_id,
            body.name,
            body.mode,
            db_path=body.db_path,
            confirm=body.confirm,
            xml_dir=body.xml_dir,
        )
        if result.get("xmlPath"):
            result["xmlUrl"] = f"/api/files/{result['xmlPath']}"
        job.result = result
        job.progress = 100

    return _submit("rekordbox-export", run).to_dict()


@app.post("/api/demo")
def demo(body: DemoBody) -> dict:
    def run(job: Job) -> None:
        job.stage = "fixtures"
        job.progress = 2
        ensure_fixtures()
        library = default_library()
        job.stage = "analyze"
        job.progress = 8
        analyses = analyze_library(library, separate_stems=body.stems, use_sidecar_truth=True, log=job.log)
        job.stage = "plan"
        job.progress = 60
        intent = build_intent(body.preset, body.prompt, body.duration_min, body.seed, density=body.density)
        plan = build_plan(analyses, intent)
        job.stage = "render"
        job.progress = 68
        result = render_plan(plan, analyses, log=job.log)
        job.result = {
            "setId": plan.id,
            "mix": result.outputs.mix_mp3 or result.outputs.mix_wav,
            "durationSec": result.duration_sec,
        }

    return _submit("demo", run).to_dict()


@app.get("/api/files/{file_path:path}")
def files(file_path: str) -> FileResponse:
    target = (ENGINE_ROOT / file_path).resolve()
    allowed = [OUTPUTS.resolve(), FIXTURES_AUDIO.parent.resolve()]
    target_text = str(target)
    if not any(target_text == str(root) or target_text.startswith(str(root) + os.sep) for root in allowed):
        raise HTTPException(403, "path outside outputs/fixtures")
    if not target.is_file():
        raise HTTPException(404, "file not found")
    return FileResponse(target)


SITE_DIR = Path(os.environ.get("DJ_SITE_DIR", str(ENGINE_ROOT / "site")))
if SITE_DIR.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(SITE_DIR), html=True), name="site")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=5601)

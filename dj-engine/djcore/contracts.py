"""JSON contracts shared by analysis, planning, rendering and adapters."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

SCHEMA_VERSION = 1

TransitionType = Literal["long_blend", "bass_swap", "filter_out", "cut", "double_drop"]
GrooveClass = Literal["floor", "break", "swing", "half", "none"]
LowBehavior = Literal["pulse", "sustain", "grit", "sink", "none"]
EnergyPreset = Literal["warmup", "build", "peak", "wave", "flat"]
VocalTolerance = Literal["low", "any", "instrumental"]
TransitionDensity = Literal["sparse", "normal", "dense"]
PhraseType = Literal["intro", "build", "drop", "groove", "break", "outro"]

_CAMELOT_RE = re.compile(r"^(1[0-2]|[1-9])[AB]$")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class TrackRef(CamelModel):
    id: str
    title: str
    artist: str = ""
    path: str
    duration_sec: float = 0.0
    sample_rate: int = 48000
    channels: int = 2
    sha256: str = ""
    genre_id: str | None = None


class BpmInfo(CamelModel):
    value: float
    confidence: float = 0.5
    octave_ambiguous: bool = False


class KeyInfo(CamelModel):
    pitch_class: int = Field(ge=0, le=11)
    mode: Literal["major", "minor"]
    name: str
    camelot: str
    confidence: float = 0.5

    @field_validator("camelot")
    @classmethod
    def _camelot_format(cls, value: str) -> str:
        if not _CAMELOT_RE.match(value):
            raise ValueError(f"invalid camelot code: {value}")
        return value


class BeatsInfo(CamelModel):
    first_sec: float
    interval_sec: float
    times_sec: list[float]
    confidence: float = 0.5


class Phrase(CamelModel):
    start_bar: int
    end_bar: int
    start_sec: float
    end_sec: float
    type: PhraseType
    confidence: float = 0.5


class Drop(CamelModel):
    sec: float
    bar: int
    beat: int = 1
    confidence: float = 0.5
    pre_drop_start_sec: float | None = None


class Build(CamelModel):
    start_sec: float
    end_sec: float
    start_bar: int
    end_bar: int
    confidence: float = 0.5


class EnergyPoint(CamelModel):
    start_sec: float
    end_sec: float
    value: float = Field(ge=0.0, le=1.0)


class VocalSegment(CamelModel):
    start_sec: float
    end_sec: float
    confidence: float = 0.5


class Loudness(CamelModel):
    integrated_lufs: float
    peak_db: float


class ClassifiedFeature(CamelModel):
    class_name: str = Field(alias="class")
    confidence: float = 0.5


class TrackFeatures(CamelModel):
    low_ratio: float = 0.0
    mid_ratio: float = 0.0
    high_ratio: float = 0.0
    spectral_centroid_hz: float = 0.0
    groove: ClassifiedFeature = Field(default_factory=lambda: ClassifiedFeature(class_name="floor"))
    low_behavior: ClassifiedFeature = Field(default_factory=lambda: ClassifiedFeature(class_name="pulse"))


class TrackAnalysis(CamelModel):
    schema_version: int = SCHEMA_VERSION
    track: TrackRef
    bpm: BpmInfo
    key: KeyInfo
    beats: BeatsInfo
    downbeats_sec: list[float] = Field(default_factory=list)
    phrases: list[Phrase] = Field(default_factory=list)
    drops: list[Drop] = Field(default_factory=list)
    builds: list[Build] = Field(default_factory=list)
    energy: list[EnergyPoint] = Field(default_factory=list)
    vocals: list[VocalSegment] = Field(default_factory=list)
    loudness: Loudness
    stems: dict[str, str] = Field(default_factory=dict)
    features: TrackFeatures = Field(default_factory=TrackFeatures)
    genre_id: str | None = None
    analysis_version: str = "1"
    warnings: list[str] = Field(default_factory=list)


class GenreWeight(CamelModel):
    id: str
    weight: float = 1.0


class EnergyCurve(CamelModel):
    preset: EnergyPreset = "build"
    points: list[list[float]] = Field(default_factory=lambda: [[0.0, 0.3], [0.5, 0.6], [0.8, 0.9], [1.0, 0.7]])


class StyleIntent(CamelModel):
    prompt: str = ""
    genres: list[GenreWeight] = Field(default_factory=list)
    bpm_range: list[float] = Field(default_factory=lambda: [118.0, 130.0])
    duration_min: float = 8.0
    energy_curve: EnergyCurve = Field(default_factory=EnergyCurve)
    vocal_tolerance: VocalTolerance = "any"
    harmonic_strictness: float = 0.7
    transition_density: TransitionDensity = "normal"
    seed: int = 20261027

    @field_validator("bpm_range")
    @classmethod
    def _bpm_range(cls, value: list[float]) -> list[float]:
        if len(value) != 2 or value[0] <= 0 or value[1] <= value[0]:
            raise ValueError("bpmRange must be [min, max] with min < max")
        return value


class SetEntry(CamelModel):
    position: int
    track_id: str
    title: str
    native_bpm: float
    target_bpm: float
    camelot: str
    energy: float
    role: str = "groove"
    play_from_bar: int = 1
    play_to_bar: int = 1


class StemKeyframe(CamelModel):
    bar: int
    gain_db: float = 0.0
    low_eq_db: float = 0.0
    high_eq_db: float = 0.0
    low_pass_hz: float | None = None
    high_pass_hz: float | None = None


class TransitionPhrase(CamelModel):
    bars: int
    start_bar_a: int
    start_bar_b: int
    overlap_bars: int


class TransitionTempo(CamelModel):
    from_bpm: float
    to_bpm: float
    mode: Literal["constant", "ramp", "half", "double"] = "constant"
    ramp_bars: int = 0


class DropLock(CamelModel):
    a_drop_sec: float
    b_drop_sec: float
    a_drop_bar: int
    b_drop_bar: int
    build_bars: int = 16


class RenderSpan(CamelModel):
    start_sec: float | None = None
    end_sec: float | None = None


class TransitionPlan(CamelModel):
    from_position: int
    to_position: int
    type: TransitionType
    phrase: TransitionPhrase
    tempo: TransitionTempo
    stems: dict[str, list[StemKeyframe]] = Field(default_factory=dict)
    crossfader: list[dict[str, float]] = Field(default_factory=list)
    drop_lock: DropLock | None = None
    bass_owner: Literal["a", "b"] | None = None
    risk: float = 0.0
    reasons: list[str] = Field(default_factory=list)
    render: RenderSpan = Field(default_factory=RenderSpan)


class SetTotals(CamelModel):
    duration_sec: float = 0.0
    avg_bpm: float = 0.0
    key_path: list[str] = Field(default_factory=list)


class SetPlan(CamelModel):
    schema_version: int = SCHEMA_VERSION
    id: str
    created_at: str
    intent: StyleIntent
    entries: list[SetEntry]
    transitions: list[TransitionPlan]
    totals: SetTotals = Field(default_factory=SetTotals)
    warnings: list[str] = Field(default_factory=list)


class Waveform(CamelModel):
    bucket_ms: int = 10
    peaks: list[list[float]] = Field(default_factory=list)


class RenderOutputs(CamelModel):
    mix_wav: str | None = None
    mix_mp3: str | None = None
    transitions: list[str] = Field(default_factory=list)


class TransitionRender(CamelModel):
    index: int
    type: TransitionType
    start_sec: float
    end_sec: float
    drop_align_ms: float | None = None
    phase_correlation: float | None = None
    warnings: list[str] = Field(default_factory=list)
    report_path: str | None = None


class RenderResult(CamelModel):
    schema_version: int = SCHEMA_VERSION
    set_id: str
    outputs: RenderOutputs
    duration_sec: float
    loudness: Loudness
    waveform: Waveform = Field(default_factory=Waveform)
    transitions: list[TransitionRender] = Field(default_factory=list)
    logs: list[str] = Field(default_factory=list)


def dump_json(path: str | Path, model: BaseModel) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(model.model_dump(by_alias=True), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_json(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))

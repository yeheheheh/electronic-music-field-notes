import math

import numpy as np
import soundfile as sf

from djcore.contracts import (
    SetEntry,
    SetPlan,
    SetTotals,
    StemKeyframe,
    TransitionPhrase,
    TransitionPlan,
    TransitionTempo,
)
from djcore.planning.intent import parse_intent
from djcore.render.mixdown import render_set

from .helpers import make_analysis


def _write_stem(path, seconds=16.0, freq=220.0):
    t = np.arange(int(seconds * 48000)) / 48000
    signal = np.sin(2 * math.pi * freq * t) * 0.2
    stereo = np.stack([signal, signal], axis=1)
    sf.write(path, stereo, 48000, subtype="PCM_16")
    return path


def test_render_set_without_demucs(tmp_path):
    intent = parse_intent("", "melodic-techno", duration_min=4)
    a_stem = _write_stem(tmp_path / "a.wav", freq=220)
    b_stem = _write_stem(tmp_path / "b.wav", freq=330)
    a = make_analysis("a", "A", bpm=120, camelot="8A", bars=8, stems={"other": str(a_stem)})
    b = make_analysis("b", "B", bpm=120, camelot="8B", bars=8, stems={"other": str(b_stem)})
    entries = [
        SetEntry(position=1, track_id="a", title="A", native_bpm=120, target_bpm=120, camelot="8A", energy=0.4, play_from_bar=1, play_to_bar=8),
        SetEntry(position=2, track_id="b", title="B", native_bpm=120, target_bpm=120, camelot="8B", energy=0.6, play_from_bar=1, play_to_bar=8),
    ]
    transition = TransitionPlan(
        from_position=1,
        to_position=2,
        type="long_blend",
        phrase=TransitionPhrase(bars=4, start_bar_a=5, start_bar_b=1, overlap_bars=4),
        tempo=TransitionTempo(from_bpm=120, to_bpm=120, mode="constant"),
        stems={
            "a.other": [StemKeyframe(bar=0, gain_db=0), StemKeyframe(bar=4, gain_db=-60)],
            "b.other": [StemKeyframe(bar=0, gain_db=-60), StemKeyframe(bar=4, gain_db=0)],
        },
        risk=0.2,
        reasons=["test"],
    )
    plan = SetPlan(
        id="set-test",
        created_at="2026-10-27T00:00:00Z",
        intent=intent,
        entries=entries,
        transitions=[transition],
        totals=SetTotals(duration_sec=24, avg_bpm=120, key_path=["8A", "8B"]),
    )
    result = render_set(plan, {"a": a, "b": b}, output_root=tmp_path / "out")
    assert result.duration_sec > 20
    assert result.loudness.peak_db <= 0.0
    assert result.waveform.peaks
    assert result.transitions[0].start_sec < result.transitions[0].end_sec
    assert (tmp_path / "out" / "mix.wav").is_file()
    assert (tmp_path / "out" / "transition-01.wav").is_file()

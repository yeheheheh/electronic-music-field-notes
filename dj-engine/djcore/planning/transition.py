"""Transition planning: type choice, phrase alignment, automation curves."""

from __future__ import annotations

import math
from dataclasses import dataclass

from djcore.contracts import (
    DropLock,
    SetEntry,
    StemKeyframe,
    StyleIntent,
    TrackAnalysis,
    TransitionPhrase,
    TransitionPlan,
    TransitionTempo,
)
from djcore.planning.compatibility import EdgeScore, vocal_density

TYPE_LENGTHS = {
    "long_blend": 16,
    "bass_swap": 8,
    "filter_out": 8,
    "cut": 1,
}

# Overlap lengths per transition-density preset. "normal" keeps v1 behaviour.
PROFILE_LENGTHS = {
    "sparse": {"long_blend": 32, "bass_swap": 8, "filter_out": 16, "cut": 1},
    "normal": dict(TYPE_LENGTHS),
    "dense": {"long_blend": 8, "bass_swap": 4, "filter_out": 4, "cut": 1},
}

PROFILE_BIAS = {
    "sparse": {"long_blend": 0.06, "filter_out": 0.02, "cut": -0.15},
    "normal": {},
    "dense": {"bass_swap": 0.06, "cut": 0.06, "long_blend": -0.06},
}


def _bar_seconds(bpm: float) -> float:
    return 4.0 * 60.0 / max(bpm, 1e-6)


def _available_bars(entry: SetEntry) -> int:
    return max(1, entry.play_to_bar - entry.play_from_bar + 1)


def _fade_curve(bars: int, fade_in: bool) -> list[StemKeyframe]:
    points: list[StemKeyframe] = []
    for bar in range(bars + 1):
        position = bar / max(1, bars)
        if fade_in:
            gain = 20.0 * math.log10(max(1e-3, math.sin(position * math.pi / 2.0)))
        else:
            gain = 20.0 * math.log10(max(1e-3, math.cos(position * math.pi / 2.0)))
        points.append(StemKeyframe(bar=bar, gain_db=round(gain, 2)))
    return points


def _constant_curve(bars: int, gain_db: float = 0.0) -> list[StemKeyframe]:
    return [StemKeyframe(bar=0, gain_db=gain_db), StemKeyframe(bar=bars, gain_db=gain_db)]


def _shelf_curve(bars: int, start_db: float, end_db: float) -> list[StemKeyframe]:
    return [
        StemKeyframe(bar=0, high_eq_db=start_db),
        StemKeyframe(bar=bars, high_eq_db=end_db),
    ]


def _bass_swap_curves(bars: int) -> dict[str, list[StemKeyframe]]:
    return {
        "a.vocals": _fade_curve(bars, fade_in=False),
        "a.drums": _fade_curve(bars, fade_in=False),
        "a.other": _fade_curve(bars, fade_in=False),
        "a.bass": [
            StemKeyframe(bar=0, gain_db=0),
            StemKeyframe(bar=min(1, bars), gain_db=0),
            StemKeyframe(bar=min(2, bars), gain_db=-60),
            StemKeyframe(bar=bars, gain_db=-60),
        ],
        "b.vocals": _fade_curve(bars, fade_in=True),
        "b.drums": _fade_curve(bars, fade_in=True),
        "b.other": _fade_curve(bars, fade_in=True),
        "b.bass": [
            StemKeyframe(bar=0, gain_db=-60),
            StemKeyframe(bar=min(3, bars), gain_db=-60),
            StemKeyframe(bar=min(4, bars), gain_db=0),
            StemKeyframe(bar=bars, gain_db=0),
        ],
    }


def _filter_curves(bars: int) -> dict[str, list[StemKeyframe]]:
    base = {
        "a.vocals": _fade_curve(bars, fade_in=False),
        "b.vocals": _fade_curve(bars, fade_in=True),
        "a.bass": [StemKeyframe(bar=0, gain_db=0), StemKeyframe(bar=bars, gain_db=-60)],
        "b.bass": [StemKeyframe(bar=0, gain_db=-60), StemKeyframe(bar=bars, gain_db=0)],
    }
    for side, start, end in (("a", 0.0, -30.0), ("b", -30.0, 0.0)):
        for stem in ("drums", "other"):
            curve = _fade_curve(bars, fade_in=(side == "b"))
            for point in curve:
                position = point.bar / max(1, bars)
                point.high_eq_db = round(start + (end - start) * position, 2)
            base[f"{side}.{stem}"] = curve
    return base


def _cut_curves() -> dict[str, list[StemKeyframe]]:
    return {
        "a.vocals": [StemKeyframe(bar=0, gain_db=0), StemKeyframe(bar=1, gain_db=-60)],
        "a.drums": [StemKeyframe(bar=0, gain_db=0), StemKeyframe(bar=1, gain_db=-60)],
        "a.bass": [StemKeyframe(bar=0, gain_db=0), StemKeyframe(bar=1, gain_db=-60)],
        "a.other": [StemKeyframe(bar=0, gain_db=0), StemKeyframe(bar=1, gain_db=-60)],
        "b.vocals": [StemKeyframe(bar=0, gain_db=-60), StemKeyframe(bar=1, gain_db=0)],
        "b.drums": [StemKeyframe(bar=0, gain_db=-60), StemKeyframe(bar=1, gain_db=0)],
        "b.bass": [StemKeyframe(bar=0, gain_db=-60), StemKeyframe(bar=1, gain_db=0)],
        "b.other": [StemKeyframe(bar=0, gain_db=-60), StemKeyframe(bar=1, gain_db=0)],
    }


def _long_blend_curves(bars: int) -> dict[str, list[StemKeyframe]]:
    curves = {}
    for stem in ("vocals", "drums", "bass", "other"):
        curves[f"a.{stem}"] = _fade_curve(bars, fade_in=False)
        curves[f"b.{stem}"] = _fade_curve(bars, fade_in=True)
    return curves


def _double_drop_curves(build_bars: int, post_bars: int) -> dict[str, list[StemKeyframe]]:
    total = build_bars + post_bars
    drop = build_bars
    return {
        "a.vocals": [
            StemKeyframe(bar=0, gain_db=0),
            StemKeyframe(bar=drop, gain_db=0),
            StemKeyframe(bar=min(total, drop + 2), gain_db=-60),
            StemKeyframe(bar=total, gain_db=-60),
        ],
        "a.drums": [
            StemKeyframe(bar=0, gain_db=0),
            StemKeyframe(bar=min(total, drop + 8), gain_db=0),
            StemKeyframe(bar=total, gain_db=-60),
        ],
        "a.bass": [
            StemKeyframe(bar=0, gain_db=0),
            StemKeyframe(bar=min(total, drop + 1), gain_db=0),
            StemKeyframe(bar=min(total, drop + 2), gain_db=-9),
            StemKeyframe(bar=min(total, drop + 4), gain_db=-60),
            StemKeyframe(bar=total, gain_db=-60),
        ],
        "a.other": [
            StemKeyframe(bar=0, gain_db=0),
            StemKeyframe(bar=min(total, drop + 8), gain_db=0),
            StemKeyframe(bar=total, gain_db=-60),
        ],
        "b.vocals": _constant_curve(total),
        "b.drums": _constant_curve(total),
        "b.bass": _constant_curve(total),
        "b.other": _constant_curve(total),
    }


def _risk(edge: EdgeScore, drop_confidence: float | None = None, low_confidence: bool = False) -> float:
    risk = (
        (1.0 - edge.tempo) * 0.25
        + (1.0 - edge.key) * 0.25
        + (1.0 - edge.vocal) * 0.15
        + (1.0 - edge.energy) * 0.15
    )
    if drop_confidence is not None:
        risk += (1.0 - drop_confidence) * 0.2
    if low_confidence:
        risk += 0.08
    return round(min(1.0, max(0.0, risk)), 3)


@dataclass
class DoubleDropCheck:
    ok: bool
    reason: str = ""
    build_bars: int = 16
    post_bars: int = 16
    drop_a: object | None = None
    drop_b: object | None = None
    risk: float = 1.0


def _check_double_drop(
    a: TrackAnalysis,
    b: TrackAnalysis,
    entry_a: SetEntry,
    entry_b: SetEntry,
    edge: EdgeScore,
) -> DoubleDropCheck:
    if not a.drops or not b.drops:
        return DoubleDropCheck(ok=False, reason="缺少可用的 drop 检测")
    drop_a, drop_b = a.drops[0], b.drops[0]
    if drop_a.confidence < 0.6 or drop_b.confidence < 0.6:
        return DoubleDropCheck(ok=False, reason="drop 置信度不足")
    if edge.tempo < 0.55:
        return DoubleDropCheck(ok=False, reason="速度差过大")
    if edge.key < 0.65:
        return DoubleDropCheck(ok=False, reason="调性不够近")

    build = min(16, drop_a.bar - entry_a.play_from_bar, drop_b.bar - entry_b.play_from_bar)
    if build < 8:
        return DoubleDropCheck(ok=False, reason="build 窗口不足 8 小节")
    post = min(16, entry_a.play_to_bar - drop_a.bar, entry_b.play_to_bar - drop_b.bar)
    if post < 8:
        return DoubleDropCheck(ok=False, reason="drop 后空间不足 8 小节")

    bar_sec = _bar_seconds(min(entry_a.target_bpm, entry_b.target_bpm))
    vocal_after_drop = vocal_density(b.vocals, drop_b.sec, drop_b.sec + 4 * bar_sec)
    if vocal_after_drop > 0.25:
        return DoubleDropCheck(ok=False, reason="B 的 drop 后 4 小节有人声")

    risk = _risk(
        edge,
        drop_confidence=min(drop_a.confidence, drop_b.confidence),
        low_confidence=min(a.bpm.confidence, b.bpm.confidence) < 0.5,
    )
    if risk > 0.55:
        return DoubleDropCheck(ok=False, reason=f"double drop 风险过高（{risk:.2f}）", risk=risk)
    return DoubleDropCheck(
        ok=True,
        build_bars=build,
        post_bars=post,
        drop_a=drop_a,
        drop_b=drop_b,
        risk=risk,
    )


def plan_transition(
    a: TrackAnalysis,
    b: TrackAnalysis,
    entry_a: SetEntry,
    entry_b: SetEntry,
    edge: EdgeScore,
    intent: StyleIntent,
    *,
    allow_double_drop: bool = True,
    profile: str = "normal",
) -> TransitionPlan:
    lengths = PROFILE_LENGTHS.get(profile, PROFILE_LENGTHS["normal"])
    bias = PROFILE_BIAS.get(profile, {})

    if not allow_double_drop:
        double = DoubleDropCheck(ok=False, reason="本场已使用过一次 double drop，v1 每场最多一次")
    elif profile == "sparse":
        double = DoubleDropCheck(ok=False, reason="稀疏过渡预设不采用 double drop")
    else:
        double = _check_double_drop(a, b, entry_a, entry_b, edge)
    low_confidence = min(a.bpm.confidence, b.bpm.confidence) < 0.5

    if double.ok:
        drop_a, drop_b = double.drop_a, double.drop_b
        total = double.build_bars + double.post_bars
        entry_a.play_to_bar = min(entry_a.play_to_bar, drop_a.bar + double.post_bars - 1)
        return TransitionPlan(
            from_position=entry_a.position,
            to_position=entry_b.position,
            type="double_drop",
            phrase=TransitionPhrase(
                bars=double.post_bars,
                start_bar_a=drop_a.bar - double.build_bars,
                start_bar_b=drop_b.bar - double.build_bars,
                overlap_bars=total,
            ),
            tempo=TransitionTempo(
                from_bpm=entry_a.target_bpm,
                to_bpm=entry_b.target_bpm,
                mode="constant",
                ramp_bars=0,
            ),
            stems=_double_drop_curves(double.build_bars, double.post_bars),
            crossfader=[
                {"bar": 0, "value": 1.0},
                {"bar": double.build_bars, "value": 1.0},
                {"bar": total, "value": 0.0},
            ],
            drop_lock=DropLock(
                a_drop_sec=drop_a.sec,
                b_drop_sec=drop_b.sec,
                a_drop_bar=drop_a.bar,
                b_drop_bar=drop_b.bar,
                build_bars=double.build_bars,
            ),
            bass_owner="b",
            risk=double.risk,
            reasons=[
                *edge.reasons,
                f"双 drop 对齐：A 第 {drop_a.bar} 小节 / B 第 {drop_b.bar} 小节",
                "B 占低频，A 的 bass 在 drop 后第 2 小节让位",
            ],
        )

    # Pick the best non-double transition.
    candidates: list[tuple[str, float, int]] = []
    available = min(_available_bars(entry_a), _available_bars(entry_b))
    long_bars = min(lengths["long_blend"], available)
    bass_bars = min(lengths["bass_swap"], available)
    filter_bars = min(lengths["filter_out"], available)

    if long_bars >= 8 and edge.vocal >= 0.5:
        candidates.append(("long_blend", edge.total + (0.04 if edge.vocal > 0.7 else -0.02) + bias.get("long_blend", 0.0), long_bars))
    if bass_bars >= 4 and edge.low >= 0.7 and edge.tempo >= 0.7:
        candidates.append(("bass_swap", edge.total + 0.05 + bias.get("bass_swap", 0.0), bass_bars))
    if filter_bars >= 4 and (edge.key < 0.65 or edge.tempo < 0.8):
        candidates.append(("filter_out", edge.total + 0.04 + bias.get("filter_out", 0.0), filter_bars))
    candidates.append(("cut", edge.total - 0.08 + bias.get("cut", 0.0), 1))
    transition_type, _, overlap = max(candidates, key=lambda item: item[1])

    start_bar_a = max(entry_a.play_from_bar, entry_a.play_to_bar - overlap + 1)
    start_bar_b = entry_b.play_from_bar
    overlap = min(overlap, entry_a.play_to_bar - start_bar_a + 1, entry_b.play_to_bar - start_bar_b + 1)

    if transition_type == "long_blend":
        stems = _long_blend_curves(overlap)
    elif transition_type == "bass_swap":
        stems = _bass_swap_curves(overlap)
    elif transition_type == "filter_out":
        stems = _filter_curves(overlap)
    else:
        stems = _cut_curves()

    risk = _risk(edge, low_confidence=low_confidence)
    reasons = list(edge.reasons)
    if not double.ok:
        reasons.append(f"未采用 double drop：{double.reason}")

    return TransitionPlan(
        from_position=entry_a.position,
        to_position=entry_b.position,
        type=transition_type,  # type: ignore[arg-type]
        phrase=TransitionPhrase(
            bars=overlap,
            start_bar_a=start_bar_a,
            start_bar_b=start_bar_b,
            overlap_bars=overlap,
        ),
        tempo=TransitionTempo(
            from_bpm=entry_a.target_bpm,
            to_bpm=entry_b.target_bpm,
            mode="constant",
            ramp_bars=0,
        ),
        stems=stems,
        crossfader=[
            {"bar": 0, "value": 1.0},
            {"bar": overlap, "value": 0.0},
        ],
        drop_lock=None,
        bass_owner="b" if transition_type == "bass_swap" else None,
        risk=risk,
        reasons=reasons,
    )

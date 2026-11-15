"""Beam-search set planner over the compatibility graph."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime

from djcore.contracts import SetEntry, SetPlan, SetTotals, StyleIntent, TrackAnalysis
from djcore.music import energy_at
from djcore.planning.compatibility import score_pair
from djcore.planning.transition import plan_transition

BEAM_WIDTH = 50
MAX_TRACKS = 6


@dataclass
class _State:
    path: tuple[int, ...]
    used: frozenset[int]
    score: float


def _bar_seconds(bpm: float) -> float:
    return 4.0 * 60.0 / max(bpm, 1e-6)


def _last_bar(analysis: TrackAnalysis) -> int:
    if analysis.phrases:
        return max(2, analysis.phrases[-1].end_bar)
    bar_seconds = _bar_seconds(analysis.bpm.value)
    return max(2, int(round((analysis.track.duration_sec or bar_seconds * 32) / bar_seconds)))


def _target_bpm(analyses: list[TrackAnalysis], intent: StyleIntent) -> tuple[float, list[TrackAnalysis], list[str]]:
    warnings: list[str] = []
    bpms = sorted(analysis.bpm.value for analysis in analyses)
    candidate = bpms[len(bpms) // 2]
    low, high = intent.bpm_range
    target = min(high, max(low, candidate))
    usable = []
    for analysis in analyses:
        ratio = max(analysis.bpm.value, target) / max(1e-6, min(analysis.bpm.value, target))
        if abs(math_log2(ratio)) <= 0.09:
            usable.append(analysis)
    if len(usable) < 2:
        usable = analyses
        warnings.append("曲目速度跨度较大，v1 仍统一到同一 targetBpm，可能出现明显变速")
    if abs(target - candidate) > 0.01:
        warnings.append(f"目标 BPM 从 {candidate:.1f} 调整到 {target:.1f}（风格区间 {low:g}–{high:g}）")
    return float(target), usable, warnings


def math_log2(value: float) -> float:
    import math

    return math.log2(max(value, 1e-9))


def _genre_bonus(analysis: TrackAnalysis, intent: StyleIntent) -> float:
    if not intent.genres:
        return 0.0
    for item in intent.genres:
        if analysis.genre_id == item.id or analysis.track.genre_id == item.id:
            return 0.08 * item.weight
    return 0.0


def _energy_error(analysis: TrackAnalysis, target: float) -> float:
    values = [point.value for point in analysis.energy]
    current = sum(values) / len(values) if values else 0.5
    return abs(current - target)


def _mean_energy(analysis: TrackAnalysis) -> float:
    values = [point.value for point in analysis.energy]
    return sum(values) / len(values) if values else 0.5


def _role(position: int, total: int, energy: float) -> str:
    if position == 0:
        return "opener"
    if position == total - 1:
        return "closer"
    if energy >= 0.72:
        return "peak"
    if energy >= 0.5:
        return "build"
    return "groove"


def plan_set(
    analyses: dict[str, TrackAnalysis],
    intent: StyleIntent,
    track_ids: list[str] | None = None,
) -> SetPlan:
    pool = [analyses[track_id] for track_id in (track_ids or list(analyses)) if track_id in analyses]
    if len(pool) < 2:
        raise ValueError("排 set 至少需要 2 首已分析曲目")

    target_bpm, usable, warnings = _target_bpm(pool, intent)
    max_tracks = min(len(usable), MAX_TRACKS)
    if max_tracks < 2:
        raise ValueError("速度兼容的曲目不足 2 首")

    starts = [
        _State(
            path=(index,),
            used=frozenset({index}),
            score=_genre_bonus(item, intent) - 0.6 * _energy_error(item, energy_at(intent.energy_curve.points, 0.0)),
        )
        for index, item in enumerate(usable)
    ]
    beam = starts

    for _ in range(1, max_tracks):
        expanded: list[_State] = []
        for state in beam:
            last = state.path[-1]
            position = len(state.path) / max(1, max_tracks - 1)
            target_energy = energy_at(intent.energy_curve.points, position)
            for index, candidate in enumerate(usable):
                if index in state.used:
                    continue
                edge = score_pair(
                    usable[last], candidate, intent, position, target_energy,
                    target_bpm=target_bpm,
                )
                if edge.total < 0.24:
                    continue
                candidate_energy = _mean_energy(candidate)
                previous_energy = _mean_energy(usable[last])
                dip_penalty = 0.28 * max(0.0, previous_energy - candidate_energy) if position < 1.0 else 0.0
                score = (
                    state.score
                    + edge.total
                    + 0.32 * (1.0 - _energy_error(candidate, target_energy))
                    - dip_penalty
                    + _genre_bonus(candidate, intent)
                )
                expanded.append(_State(
                    path=state.path + (index,),
                    used=state.used | {index},
                    score=score,
                ))
        if not expanded:
            break
        expanded.sort(key=lambda item: item.score, reverse=True)
        beam = expanded[:BEAM_WIDTH]

    if not beam:
        raise ValueError("没有足够兼容的曲目组成 set")
    best = max(beam, key=lambda item: (len(item.path), item.score))
    entries: list[SetEntry] = []
    for position, index in enumerate(best.path):
        analysis = usable[index]
        values = [point.value for point in analysis.energy]
        average_energy = sum(values) / len(values) if values else 0.5
        entries.append(SetEntry(
            position=position + 1,
            track_id=analysis.track.id,
            title=analysis.track.title,
            native_bpm=analysis.bpm.value,
            target_bpm=target_bpm,
            camelot=analysis.key.camelot,
            energy=round(average_energy, 3),
            role=_role(position, len(best.path), average_energy),
            play_from_bar=1,
            play_to_bar=_last_bar(analysis),
        ))

    transitions = []
    used_double_drop = False
    for index in range(len(entries) - 1):
        previous = usable[best.path[index]]
        following = usable[best.path[index + 1]]
        position = (index + 1) / max(1, len(entries) - 1)
        target_energy = energy_at(intent.energy_curve.points, position)
        edge = score_pair(
            previous, following, intent, position, target_energy,
            target_bpm=target_bpm,
        )
        transition = plan_transition(
            previous,
            following,
            entries[index],
            entries[index + 1],
            edge,
            intent,
            allow_double_drop=not used_double_drop,
            profile=intent.transition_density,
        )
        used_double_drop = used_double_drop or transition.type == "double_drop"
        transitions.append(transition)

    bar_seconds = _bar_seconds(target_bpm)
    total_seconds = sum((entry.play_to_bar - entry.play_from_bar + 1) * bar_seconds for entry in entries)
    total_seconds -= sum(transition.phrase.overlap_bars * bar_seconds for transition in transitions)
    if total_seconds < intent.duration_min * 60.0 * 0.75:
        warnings.append(
            f"曲目总时长约 {total_seconds / 60:.1f} 分钟，低于目标 {intent.duration_min:g} 分钟；v1 不重复播放同一首"
        )

    stamp = datetime.now(UTC).isoformat(timespec="seconds")
    stamp_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha1(f"{intent.seed}:{best.path}:{stamp}".encode()).hexdigest()[:8]
    return SetPlan(
        id=f"set-{stamp_id}-{digest}",
        created_at=stamp,
        intent=intent,
        entries=entries,
        transitions=transitions,
        totals=SetTotals(
            duration_sec=round(total_seconds, 2),
            avg_bpm=round(target_bpm, 2),
            key_path=[entry.camelot for entry in entries],
        ),
        warnings=warnings + [warning for analysis in usable for warning in analysis.warnings],
    )

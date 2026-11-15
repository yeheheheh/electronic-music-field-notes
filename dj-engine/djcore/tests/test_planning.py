from djcore.contracts import SetEntry
from djcore.planning.compatibility import score_pair
from djcore.planning.intent import parse_intent
from djcore.planning.set_planner import plan_set
from djcore.planning.transition import plan_transition

from .helpers import make_analysis


def _entry(analysis, position=1, target=125.0):
    return SetEntry(
        position=position,
        track_id=analysis.track.id,
        title=analysis.track.title,
        native_bpm=analysis.bpm.value,
        target_bpm=target,
        camelot=analysis.key.camelot,
        energy=0.5,
        play_from_bar=1,
        play_to_bar=48,
    )


def test_double_drop_is_selected_when_conditions_hold():
    intent = parse_intent("", "melodic-techno")
    a = make_analysis("a", bpm=124, camelot="8A")
    b = make_analysis("b", bpm=126, camelot="8B")
    edge = score_pair(a, b, intent)
    transition = plan_transition(a, b, _entry(a), _entry(b, 2), edge, intent)
    assert transition.type == "double_drop"
    assert transition.drop_lock is not None
    assert transition.drop_lock.a_drop_bar == 17
    assert transition.drop_lock.b_drop_bar == 17
    assert transition.phrase.overlap_bars == 32
    assert transition.bass_owner == "b"
    assert transition.stems["a.bass"]
    assert transition.stems["b.other"]
    assert transition.risk <= 0.55


def test_double_drop_downgrades_when_b_has_vocals_after_drop():
    intent = parse_intent("少人声", "melodic-techno")
    a = make_analysis("a", bpm=124, camelot="8A")
    b = make_analysis("b", bpm=126, camelot="8B", vocal=True)
    bar_sec = 4 * 60 / b.bpm.value
    b.vocals[0].start_sec = 17 * bar_sec
    b.vocals[0].end_sec = 21 * bar_sec
    edge = score_pair(a, b, intent)
    transition = plan_transition(a, b, _entry(a), _entry(b, 2), edge, intent)
    assert transition.type != "double_drop"
    assert any("未采用 double drop" in reason for reason in transition.reasons)


def test_double_drop_can_be_disabled():
    intent = parse_intent("", "melodic-techno")
    a = make_analysis("a", bpm=124, camelot="8A")
    b = make_analysis("b", bpm=126, camelot="8B")
    edge = score_pair(a, b, intent)
    transition = plan_transition(a, b, _entry(a), _entry(b, 2), edge, intent, allow_double_drop=False)
    assert transition.type != "double_drop"
    assert any("每场最多一次" in reason for reason in transition.reasons)


def test_sparse_profile_disables_double_drop_and_lengthens_blend():
    intent = parse_intent("", "melodic-techno", density="sparse")
    a = make_analysis("a", bpm=124, camelot="8A")
    b = make_analysis("b", bpm=126, camelot="8B")
    edge = score_pair(a, b, intent)
    transition = plan_transition(
        a, b, _entry(a), _entry(b, 2), edge, intent, profile=intent.transition_density,
    )
    assert transition.type != "double_drop"
    assert transition.phrase.overlap_bars >= 16
    assert any("稀疏过渡预设" in reason for reason in transition.reasons)


def test_dense_profile_shortens_transitions():
    normal_intent = parse_intent("", "melodic-techno")
    dense_intent = parse_intent("", "melodic-techno", density="dense")
    a = make_analysis("a", bpm=124, camelot="8A")
    b = make_analysis("b", bpm=126, camelot="8B")
    normal = plan_transition(
        a, b, _entry(a), _entry(b, 2), score_pair(a, b, normal_intent), normal_intent,
        allow_double_drop=False,
    )
    dense = plan_transition(
        a, b, _entry(a), _entry(b, 2), score_pair(a, b, dense_intent), dense_intent,
        allow_double_drop=False, profile=dense_intent.transition_density,
    )
    assert dense.phrase.overlap_bars < normal.phrase.overlap_bars


def test_set_planner_uses_all_tracks_and_one_target_bpm():
    intent = parse_intent("", "melodic-techno", duration_min=8)
    analyses = {
        "a": make_analysis("a", "Aurora", 124, "8A", 9, "minor", 0.3),
        "b": make_analysis("b", "Concrete", 126, "8B", 0, "major", 0.5, genre_id="tech-house"),
        "c": make_analysis("c", "Glass", 128, "8A", 9, "minor", 0.7, genre_id="progressive-house", vocal=False),
        "d": make_analysis("d", "Tide", 122, "11A", 6, "minor", 0.55, genre_id="deep-house"),
    }
    plan = plan_set(analyses, intent)
    assert len(plan.entries) == 4
    assert len(plan.transitions) == 3
    assert len({entry.target_bpm for entry in plan.entries}) == 1
    assert sum(1 for transition in plan.transitions if transition.type == "double_drop") <= 1
    assert plan.totals.duration_sec > 0
    assert all(transition.stems for transition in plan.transitions)

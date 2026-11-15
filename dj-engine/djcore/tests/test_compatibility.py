from djcore.planning.compatibility import score_pair, vocal_density
from djcore.planning.intent import parse_intent

from .helpers import make_analysis


def test_close_tempo_and_key_scores_high():
    intent = parse_intent("", "melodic-techno")
    a = make_analysis("a", bpm=124, camelot="8A")
    b = make_analysis("b", bpm=126, camelot="8B")
    edge = score_pair(a, b, intent)
    assert edge.total > 0.7
    assert edge.tempo > 0.8
    assert edge.key > 0.7


def test_tempo_clash_scores_zero():
    intent = parse_intent("", "melodic-techno")
    a = make_analysis("a", bpm=124)
    b = make_analysis("b", bpm=170)
    edge = score_pair(a, b, intent)
    assert edge.tempo == 0.0
    assert any("速度差" in reason for reason in edge.reasons)


def test_vocal_overlap_penalty():
    intent = parse_intent("少人声", "melodic-techno")
    a = make_analysis("a", vocal=True, energy=0.7)
    b = make_analysis("b", vocal=True, energy=0.7)
    # Put vocals in both tail and head windows.
    a.vocals[0].start_sec = a.track.duration_sec - 10
    a.vocals[0].end_sec = a.track.duration_sec
    b.vocals[0].start_sec = 0
    b.vocals[0].end_sec = 10
    edge = score_pair(a, b, intent)
    assert edge.vocal < 0.3


def test_vocal_density_clips_to_window():
    a = make_analysis("a", vocal=True)
    assert vocal_density(a.vocals, 0, 10) == 0.0
    assert vocal_density(a.vocals, a.vocals[0].start_sec, a.vocals[0].end_sec) == 1.0

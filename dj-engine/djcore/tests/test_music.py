from djcore.music import (
    camelot_distance,
    camelot_for,
    camelot_score,
    energy_at,
    key_name,
    tempo_fit,
)


def test_camelot_mapping():
    assert camelot_for(9, "minor") == "8A"
    assert camelot_for(0, "major") == "8B"
    assert camelot_for(6, "minor") == "11A"
    assert camelot_for(9, "major") == "11B"


def test_camelot_distance_is_circular():
    assert camelot_distance("8A", "8A") == 0
    assert camelot_distance("1A", "12A") == 1
    assert camelot_distance("8A", "2A") == 6


def test_camelot_score_relationships():
    assert camelot_score("8A", "8A") == 1.0
    assert camelot_score("8A", "8B") == 0.8
    assert camelot_score("8A", "9A") == 0.85
    assert camelot_score("8A", "10A") == 0.55
    assert camelot_score("8A", "2A") == 0.1


def test_tempo_fit_normal_and_half_time():
    ratio, mode, score = tempo_fit(124, 126)
    assert ratio > 1
    assert mode == "constant"
    assert score > 0.8

    ratio, mode, score = tempo_fit(87, 174)
    assert mode == "double"
    assert score > 0.9

    _, _, score = tempo_fit(124, 170)
    assert score == 0.0


def test_key_name_and_energy_curve():
    assert key_name(9, "minor") == "A minor"
    assert energy_at([[0, 0.2], [1, 0.8]], 0.5) == 0.5
    assert energy_at([[0, 0.2], [1, 0.8]], -1) == 0.2
    assert energy_at([[0, 0.2], [1, 0.8]], 2) == 0.8

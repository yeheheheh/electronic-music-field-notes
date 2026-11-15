from djcore.analysis.cache import load_analysis, save_analysis

from .helpers import make_analysis


def test_analysis_roundtrip_via_cache():
    analysis = make_analysis("roundtrip")
    save_analysis(analysis)
    loaded = load_analysis("roundtrip")
    assert loaded is not None
    assert loaded.track.id == "roundtrip"
    assert loaded.key.camelot == "8A"
    assert loaded.drops[0].bar == 17

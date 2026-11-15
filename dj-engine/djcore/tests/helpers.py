"""Shared test factories (no audio files needed)."""

from __future__ import annotations

from djcore.contracts import (
    BeatsInfo,
    BpmInfo,
    Build,
    ClassifiedFeature,
    Drop,
    EnergyPoint,
    KeyInfo,
    Loudness,
    Phrase,
    TrackAnalysis,
    TrackFeatures,
    TrackRef,
    VocalSegment,
)


def make_analysis(
    track_id: str = "sha1-a",
    title: str = "A",
    bpm: float = 124.0,
    camelot: str = "8A",
    pitch_class: int = 9,
    mode: str = "minor",
    energy: float = 0.4,
    bars: int = 48,
    drop_bar: int = 17,
    vocal: bool = False,
    genre_id: str = "melodic-techno",
    stems: dict[str, str] | None = None,
) -> TrackAnalysis:
    bar_sec = 4.0 * 60.0 / bpm
    duration = bars * bar_sec
    beats = [index * bar_sec / 4 for index in range(bars * 4)]
    downbeats = [index * bar_sec for index in range(bars)]
    phrases = [
        Phrase(start_bar=1, end_bar=8, start_sec=0, end_sec=8 * bar_sec, type="intro"),
        Phrase(start_bar=9, end_bar=16, start_sec=8 * bar_sec, end_sec=16 * bar_sec, type="build"),
        Phrase(start_bar=17, end_bar=32, start_sec=16 * bar_sec, end_sec=32 * bar_sec, type="drop"),
        Phrase(start_bar=33, end_bar=40, start_sec=32 * bar_sec, end_sec=40 * bar_sec, type="break"),
        Phrase(start_bar=41, end_bar=48, start_sec=40 * bar_sec, end_sec=48 * bar_sec, type="outro"),
    ]
    energy_points = [
        EnergyPoint(start_sec=start * bar_sec, end_sec=min(duration, (start + 8) * bar_sec), value=energy)
        for start in range(0, bars, 8)
    ]
    vocals = []
    if vocal:
        vocals = [VocalSegment(start_sec=20 * bar_sec, end_sec=28 * bar_sec, confidence=0.8)]
    return TrackAnalysis(
        track=TrackRef(
            id=track_id,
            title=title,
            artist="Test",
            path=f"fixtures/audio/{track_id}.wav",
            duration_sec=duration,
            sha256=track_id,
            genre_id=genre_id,
        ),
        bpm=BpmInfo(value=bpm, confidence=0.92),
        key=KeyInfo(pitch_class=pitch_class, mode=mode, name=f"{pitch_class} {mode}", camelot=camelot, confidence=0.85),
        beats=BeatsInfo(first_sec=0, interval_sec=60.0 / bpm, times_sec=beats, confidence=0.9),
        downbeats_sec=downbeats,
        phrases=phrases,
        drops=[Drop(sec=(drop_bar - 1) * bar_sec, bar=drop_bar, beat=1, confidence=0.9, pre_drop_start_sec=8 * bar_sec)],
        builds=[Build(start_sec=8 * bar_sec, end_sec=16 * bar_sec, start_bar=9, end_bar=16, confidence=0.9)],
        energy=energy_points,
        vocals=vocals,
        loudness=Loudness(integrated_lufs=-10.0, peak_db=-1.0),
        stems=stems or {},
        features=TrackFeatures(
            low_ratio=0.34,
            mid_ratio=0.41,
            high_ratio=0.25,
            spectral_centroid_hz=2400,
            groove=ClassifiedFeature(class_name="floor", confidence=0.8),
            low_behavior=ClassifiedFeature(class_name="pulse", confidence=0.7),
        ),
        genre_id=genre_id,
    )

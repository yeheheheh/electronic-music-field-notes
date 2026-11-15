import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from djcore.library.base import sha256_file
from djcore.library.rekordbox import RekordboxBridge, default_rekordbox_db


def test_playable_filter_rejects_sampler_and_one_shots():
    sampler = SimpleNamespace(FolderPath="C:/Music/rekordbox/Sampler/x.wav", Title="x", Length=30)
    short = SimpleNamespace(FolderPath="C:/Music/a.mp3", Title="a", Length=5)
    normal = SimpleNamespace(FolderPath="C:/Music/a.mp3", Title="a", Length=180)
    assert not RekordboxBridge._playable(None, sampler)
    assert not RekordboxBridge._playable(None, short)
    assert RekordboxBridge._playable(None, normal)


@pytest.mark.skipif(default_rekordbox_db() is None, reason="no Rekordbox database")
def test_copy_playlist_and_xml_do_not_touch_live_db(tmp_path):
    live = default_rekordbox_db()
    if RekordboxBridge.is_running():
        pytest.skip("Rekordbox is running")
    before = sha256_file(live)

    for suffix in ("", "-wal", "-shm"):
        source = Path(f"{live}{suffix}")
        if source.is_file():
            shutil.copy2(source, tmp_path / f"master.db{suffix}")
    playlists_xml = live.parent / "masterPlaylists6.xml"
    if playlists_xml.is_file():
        shutil.copy2(playlists_xml, tmp_path / playlists_xml.name)

    bridge = RekordboxBridge(tmp_path / "master.db")
    try:
        tracks = bridge.list_tracks()
        if len(tracks) < 2:
            pytest.skip("not enough playable tracks in the Rekordbox library")
        xml_path = bridge.export_xml("bridge test", [track.id for track in tracks], out_dir=tmp_path)
        text = xml_path.read_text(encoding="utf-8")
        assert "<DJ_PLAYLISTS" in text
        assert "Demo Track 1.mp3/Demo Track 1.mp3" not in text
        result = bridge.write_playlist("bridge test playlist", [track.id for track in tracks])
        assert bridge.playlist_track_ids(result["playlistId"]) == [track.id for track in tracks]
        shutil.rmtree(result["backupDir"], ignore_errors=True)
    finally:
        bridge.close()

    assert sha256_file(live) == before

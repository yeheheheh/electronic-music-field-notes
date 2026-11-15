"""Rekordbox 7 bridge: read library/playlists, write playlists, export XML.

Rekordbox has no public plugin SDK, so this is an external companion.  The
database is opened through pyrekordbox; every write is backed up first and is
refused while Rekordbox is running.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from djcore.config import DATA, OUTPUTS, ensure_dirs
from djcore.contracts import TrackRef


class RekordboxError(RuntimeError):
    pass


class RekordboxUnavailable(RekordboxError):
    pass


def default_rekordbox_db() -> Path | None:
    env = os.environ.get("DJ_REKORDBOX_DB")
    candidates: list[Path] = []
    if env:
        candidates.append(Path(env))
    roaming = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    candidates.extend([
        roaming / "Pioneer" / "rekordbox" / "master.db",
        roaming / "Pioneer" / "rekordbox6" / "master.db",
    ])
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _genre_map() -> dict[str, str]:
    path = Path(DATA) / "genres.json"
    if not path.is_file():
        return {}
    genres = json.loads(path.read_text(encoding="utf-8")).get("genres", {})
    mapping: dict[str, str] = {}
    for slug, model in genres.items():
        name = str(model.get("name") or "").strip().lower()
        if name:
            mapping[name] = slug
    return mapping


def _slug(value: str) -> str:
    text = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", value.strip().lower())
    return text.strip("-") or "playlist"


class RekordboxBridge:
    def __init__(self, db_path: str | Path | None = None):
        ensure_dirs()
        discovered = Path(db_path) if db_path else default_rekordbox_db()
        if discovered is None or not discovered.is_file():
            raise RekordboxUnavailable(
                "找不到 Rekordbox master.db；设置 DJ_REKORDBOX_DB 或传 --db-path"
            )
        self.db_path = discovered
        self._db = None
        self.warnings: list[str] = []
        self._genres = _genre_map()

    def _open(self):
        if self._db is not None:
            return self._db
        try:
            from pyrekordbox import MasterDatabase
        except ImportError as exc:  # pragma: no cover
            raise RekordboxUnavailable("pyrekordbox 未安装：uv pip install pyrekordbox") from exc
        try:
            self._db = MasterDatabase(path=self.db_path, autocommit=True)
        except Exception as exc:
            raise RekordboxUnavailable(f"无法打开 Rekordbox 数据库：{exc}") from exc
        return self._db

    def close(self) -> None:
        if self._db is not None:
            try:
                self._db.session.close()
                self._db.engine.dispose()
            except Exception as exc:  # pragma: no cover
                self.warnings.append(f"关闭 Rekordbox 数据库失败：{exc}")
            self._db = None

    def __enter__(self):
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    @staticmethod
    def is_running() -> bool:
        try:
            from pyrekordbox.utils import get_rekordbox_pid

            return bool(get_rekordbox_pid())
        except Exception:
            return False

    def _content_query(self):
        return self._open().get_content()

    def _playable(self, content) -> bool:
        path = str(getattr(content, "FolderPath", "") or "").replace("\\", "/").lower()
        if not path or not getattr(content, "Title", None):
            return False
        if any(token in path for token in ("/rekordbox/sampler/", "/rekordbox/recording/", "/osc_sampler/")):
            return False
        if float(getattr(content, "Length", 0) or 0) < 20:
            return False
        return True

    def _content_by_id(self, content_id: int):
        result = self._open().get_content(ID=int(content_id))
        content = result.first() if hasattr(result, "first") else result
        if content is None:
            raise KeyError(f"Rekordbox 内容不存在：{content_id}")
        return content

    @staticmethod
    def _content_id(track_id: str) -> int:
        if not track_id.startswith("rb-"):
            raise ValueError(f"不是 Rekordbox 曲目 ID：{track_id}")
        return int(track_id[3:])

    def list_tracks(self) -> list[TrackRef]:
        tracks: list[TrackRef] = []
        for content in self._content_query().all():
            if not self._playable(content):
                continue
            path = Path(content.FolderPath)
            if not path.is_file():
                self.warnings.append(f"文件缺失：{content.Title} ({path})")
                continue
            genre_name = str(getattr(content, "GenreName", "") or "").strip().lower()
            genre_id = self._genres.get(genre_name)
            tracks.append(TrackRef(
                id=f"rb-{content.ID}",
                title=str(content.Title),
                artist=str(getattr(content, "ArtistName", "") or ""),
                path=str(path),
                duration_sec=float(getattr(content, "Length", 0) or 0),
                genre_id=genre_id,
            ))
        return tracks

    def resolve(self, track_id: str) -> Path:
        content = self._content_by_id(self._content_id(track_id))
        path = Path(content.FolderPath)
        if not path.is_file():
            raise FileNotFoundError(path)
        return path

    def sidecar(self, track_id: str) -> dict:
        content = self._content_by_id(self._content_id(track_id))
        playlist_names = []
        for link in getattr(content, "PlaylistContent", []) or []:
            playlist = getattr(link, "Playlist", None)
            if playlist is not None:
                playlist_names.append(playlist.Name)
        return {
            "rekordbox": {
                "contentId": int(content.ID),
                "bpm": round(float(content.BPM or 0) / 100.0, 3),
                "key": str(getattr(content, "KeyName", "") or ""),
                "genre": str(getattr(content, "GenreName", "") or ""),
                "myTags": str(getattr(content, "MyTagNames", "") or ""),
                "playlists": playlist_names,
            }
        }

    def list_playlists(self) -> list[dict]:
        return [
            {
                "id": item.ID,
                "name": item.Name,
                "attribute": getattr(item, "Attribute", None),
                "parentId": getattr(item, "ParentID", None),
            }
            for item in self._open().get_playlist().all()
        ]

    def playlist_track_ids(self, playlist_id: int | str) -> list[str]:
        from pyrekordbox.masterdb import models

        songs = (
            self._open()
            .get_playlist_songs()
            .filter_by(PlaylistID=playlist_id)
            .order_by(models.DjmdSongPlaylist.TrackNo)
            .all()
        )
        return [f"rb-{song.ContentID}" for song in songs]

    def status(self) -> dict:
        running = self.is_running()
        try:
            contents = self._content_query().all()
            tracks = self.list_tracks()
            playlists = self.list_playlists()
            return {
                "ok": True,
                "dbPath": str(self.db_path),
                "trackCount": len(contents),
                "playableCount": len(tracks),
                "playlistCount": len(playlists),
                "playlists": playlists,
                "running": running,
                "writable": not running,
                "tracks": [
                    {"id": track.id, "title": track.title, "artist": track.artist}
                    for track in tracks[:50]
                ],
                "tracksTotal": len(tracks),
                "warnings": self.warnings[:10],
            }
        except Exception as exc:
            return {
                "ok": False,
                "dbPath": str(self.db_path),
                "running": running,
                "writable": False,
                "error": str(exc),
            }

    def backup(self) -> Path:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target = OUTPUTS / "rekordbox-backups" / stamp
        target.mkdir(parents=True, exist_ok=True)
        base = self.db_path
        for suffix in ("", "-wal", "-shm"):
            source = Path(f"{base}{suffix}")
            if source.is_file():
                shutil.copy2(source, target / source.name)
        for name in ("masterPlaylists6.xml", "automixPlaylist6.xml"):
            source = base.parent / name
            if source.is_file():
                shutil.copy2(source, target / name)
        return target

    def write_playlist(self, name: str, track_ids: list[str]) -> dict:
        name = name.strip()
        if not name:
            raise ValueError("播放列表名不能为空")
        if self.is_running():
            raise RekordboxError("Rekordbox 正在运行；关闭后再写库")
        content_ids = [self._content_id(track_id) for track_id in track_ids]
        if not content_ids:
            raise ValueError("播放列表不能为空")
        for content_id in content_ids:
            self._content_by_id(content_id)

        self.close()
        backup_dir = self.backup()
        db = self._open()
        if db.get_playlist(Name=name).first() is not None:
            raise ValueError(f"播放列表已存在：{name}")
        playlist = db.create_playlist(name)
        try:
            for content_id in content_ids:
                db.add_to_playlist(playlist, content_id)
            db.session.commit()
            from pyrekordbox.masterdb import models

            songs = (
                db.get_playlist_songs()
                .filter_by(PlaylistID=playlist.ID)
                .order_by(models.DjmdSongPlaylist.TrackNo)
                .all()
            )
            actual = [int(song.ContentID) for song in songs]
            if actual != content_ids:
                raise RekordboxError("播放列表顺序校验失败")
        except Exception:
            try:
                db.delete_playlist(playlist)
                db.session.commit()
            except Exception:
                pass
            raise
        return {
            "playlistId": playlist.ID,
            "name": name,
            "count": len(content_ids),
            "backupDir": str(backup_dir),
            "dbPath": str(self.db_path),
        }

    def export_xml(self, name: str, track_ids: list[str], out_dir: str | Path | None = None) -> Path:
        from pyrekordbox.rbxml import RekordboxXml

        name = name.strip() or "djcore set"
        xml = RekordboxXml(name="djcore", version="1.0.0", company="djcore")
        included: list[int] = []
        for track_id in track_ids:
            content = self._content_by_id(self._content_id(track_id))
            path = Path(content.FolderPath)
            if not path.is_file():
                self.warnings.append(f"XML 跳过缺失文件：{content.Title}")
                continue
            xml.add_track(
                path,
                TrackID=int(content.ID),
                Name=str(content.Title),
                Artist=str(getattr(content, "ArtistName", "") or ""),
                AverageBpm=round(float(content.BPM or 0) / 100.0, 2),
                TotalTime=int(float(content.Length or 0)),
                Tonality=str(getattr(content, "KeyName", "") or ""),
            )
            included.append(int(content.ID))
        node = xml.add_playlist(name)
        for content_id in included:
            node.add_track(content_id)
        target_dir = Path(out_dir) if out_dir else OUTPUTS / "rekordbox"
        target_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        target = target_dir / f"{_slug(name)}-{stamp}.xml"
        xml.save(target)
        return target

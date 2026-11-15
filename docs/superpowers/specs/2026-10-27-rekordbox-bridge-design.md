# Rekordbox 桥接器设计（外部插件）

- 日期：2026-10-27
- 状态：已确认写库策略（DB 直写 + XML 兜底），进入实现
- 关联：`docs/superpowers/specs/2026-10-27-dj-automix-design.md`
- 目标环境：Rekordbox 7.2.14（RB6 兼容读取），Windows

## 1. 目标与非目标

**目标**：把 Rekordbox 曲库接入现有 `dj-engine`，让用户从 Rekordbox 选曲、排 set、渲染，并把结果写回 Rekordbox 播放列表或导出 `rekordbox.xml`。

**不是**：Rekordbox 原生插件。Rekordbox 没有公开插件 SDK，不能把界面嵌进 Rekordbox；本方案是外部伴生程序 + MCP + 站点控制台。

**v1 不做**：写 Cue / Hot Cue / 内存点、USB 设备导出、Smart Playlist、RB6 写入、实时播放控制。

## 2. Rekordbox 数据映射

DB 发现顺序：

1. `DJ_REKORDBOX_DB` 环境变量。
2. `%APPDATA%\Pioneer\rekordbox\master.db`（RB7）。
3. `%APPDATA%\Pioneer\rekordbox6\master.db`（RB6）。
4. 显式传入的 `db_path`（CLI/API/测试副本优先）。

打开：`pyrekordbox.MasterDatabase(path=db_path, autocommit=True)`。RB 正在运行时只读，不允许写。

`DjmdContent` 映射：

| Rekordbox 字段 | 映射 |
|---|---|
| `ID` | `TrackRef.id = "rb-<ID>"` |
| `Title` / `ArtistName` | `title` / `artist` |
| `FolderPath` | 音频完整路径（已含文件名，**不要再拼 FileNameL**） |
| `Length` | `durationSec`（秒） |
| `BPM` | 只读元数据，`BPM / 100` |
| `KeyName` | 只读元数据；音频分析仍以 librosa 为准 |
| `GenreName` / `MyTagNames` | 只读元数据，可作为后续 genre 映射 |
| `Cues` | v1 只读展示，不参与渲染 |

可排曲目过滤：

- `FolderPath` 不包含 `/rekordbox/Sampler/`、`/rekordbox/Recording/`、`/OSC_SAMPLER/`。
- `Length >= 20` 秒。
- `Title` 非空。
- 文件存在；缺失写入 `warnings`，不参与分析。

播放列表：

- `db.get_playlist().all()`：ID / Name / Attribute / ParentID。
- 顺序必须用 `DjmdSongPlaylist` 的 `TrackNo`：`db.get_playlist_songs().filter_by(PlaylistID=...).order_by(TrackNo)`；不要用 `get_playlist_contents` 的返回顺序。
- 写入用 `create_playlist(name)` + `add_to_playlist(playlist, content_id)`，按 set 顺序调用。

## 3. 写库安全

写真实库的前置：

1. `get_rekordbox_pid()` 必须为空；Rekordbox 运行中直接拒绝。
2. 先备份到 `dj-engine/outputs/rekordbox-backups/<UTC 时间戳>/`：
   - `master.db`
   - `master.db-wal`
   - `master.db-shm`
   - `masterPlaylists6.xml`（存在时）
3. 只创建普通播放列表，不碰 folder / smart playlist。
4. 写完后重开 DB，按 `TrackNo` 校验顺序；失败则报告备份路径。
5. API 要求 `confirm: true`；UI 二次确认；CLI 只有显式 `--export db` 才写。
6. 开发/验收只写 DB 副本（`--db-path outputs/rekordbox-test/master.db`），不写 live DB。

## 4. XML 兜底

使用 `pyrekordbox.rbxml.RekordboxXml(name="djcore", version="1.0.0", company="djcore")`：

- `add_track(FolderPath, TrackID=ID, Name=..., Artist=..., AverageBpm=BPM/100, TotalTime=Length, Tonality=KeyName)`
- `playlist = add_playlist(name)`；`playlist.add_track(content_id)` 按 set 顺序。
- `save(outputs/rekordbox/<slug>-<timestamp>.xml)`。
- 只包含文件存在的曲目。
- 不修改 `master.db`，可在 Rekordbox 里手动导入。

## 5. 服务接口

`djcore/library/rekordbox.py`：

- `RekordboxBridge(db_path=None)`
- `status() -> {dbPath, trackCount, playableCount, playlists, running, writable, version?}`
- `list_tracks() -> list[TrackRef]`
- `resolve(track_id) -> Path`
- `sidecar(track_id) -> {"rekordbox": {...}}`
- `list_playlists() -> list[dict]`
- `playlist_track_ids(playlist_id) -> list[str]`
- `backup() -> Path`
- `write_playlist(name, track_ids) -> {playlistId, name, count, backupDir}`
- `export_xml(name, track_ids, out_dir=None) -> Path`
- `close()`

`djcore/service.py`：

- `rekordbox_status(db_path=None)`
- `rekordbox_scan(db_path=None)`
- `rekordbox_plan(preset, prompt, duration_min, track_ids, stems, db_path, log) -> (plan, result)`
- `rekordbox_export(set_id, name, mode, db_path, confirm) -> dict`

## 6. CLI

```bat
djcore rekordbox status
djcore rekordbox scan
djcore rekordbox plan --preset melodic-techno --duration 6 --render
djcore rekordbox export --set <setId> --name "djcore 2026-10-27" --mode both
```

- `--db-path` 指定副本；省略则自动发现 live DB。
- `--export db|xml|both` 在 plan 后直接导出；`db` 会备份。
- 写 live DB 前打印目标路径与备份目录。

## 7. HTTP API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/rekordbox/status` | DB 路径、曲目数、播放列表、运行状态、可写性 |
| POST | `/api/rekordbox/scan` | 曲目 + 播放列表；`dbPath` 可选 |
| POST | `/api/rekordbox/plan` | 分析 + 排 set + 渲染，返回 job；`dbPath` 可选 |
| POST | `/api/rekordbox/export` | 写播放列表或 XML；DB 模式必须 `confirm:true` |
| GET | `/api/files/{path}` | 下载生成的 XML |

`/api/rekordbox/status` 不可用时返回 `{ok:false, error}`，页面隐藏 Rekordbox 来源，不影响 demo。

## 8. MCP

工具：

- `rb_status()`
- `rb_library()`（曲目 + 播放列表）
- `rb_plan_set(preset, prompt, duration_min, track_ids, stems)`
- `rb_export_playlist(set_id, name, mode, confirm=False)`；未 confirm 时只返回 dry-run（曲目数、目标 DB、是否运行），不写。

## 9. 站点 UI

`#/dj/automix` 左侧新增：

- `SOURCE / 曲库`：`示例曲` / `Rekordbox`；Rekordbox 不可用则禁用并提示。
- 状态行：`Rekordbox 7 · 2 首可排 · 播放列表 1 · 已关闭（可写）` 或 `Rekordbox 正在运行（只读）`。
- 选择 Rekordbox 后，“生成接歌”改调 `/api/rekordbox/plan`。

详情区新增导出面板（仅当 set 的 trackId 全部以 `rb-` 开头）：

- 播放列表名输入。
- `写入 Rekordbox`：二次确认；DB 运行中禁用；成功后显示 playlist ID + 备份目录。
- `导出 rekordbox.xml`：生成并给出 `/api/files/...` 下载链接。
- 失败显示错误与备份路径。

## 10. 验收

1. `rekordbox status` 读到 `master.db`，识别 2 首 Demo Track，过滤采样素材。
2. `rekordbox plan` 用 2 首 Demo 完成分析、排 set、渲染。
3. 在 **DB 副本** 写播放列表：按 set 顺序、TrackNo 1..N，重开可读。
4. XML 导出的 `Location` 等于 `FolderPath`，不重复文件名；顺序正确。
5. live `master.db` 的哈希在验收前后不变。
6. 站点 Rekordbox 来源可生成 set；导出面板对 demo set 隐藏。
7. `pytest` 与 `check-dj-automix.mjs` 继续通过。

## 11. 风险

- Rekordbox 版本升级可能改变 DB 结构；pyrekordbox 需同步升级。
- SQLCipher 密钥由 pyrekordbox 处理；换机器/换版本可能失败，需明确报错。
- 写库是高风险操作：强制备份、强制关闭 RB、开发只写副本。
- 曲目 BPM=0 或 key 未知：保留分析结果，标记 warning。
- 播放列表顺序依赖 `TrackNo`，不依赖 SQLAlchemy 返回顺序。
- Demo Track 只有 2 首，足够验证链路，不代表真实曲库规模。

## 12. 实施结果（2026-10-27）

- RB7.2.14 live 库识别 14 条内容，过滤后 2 首可排（Demo Track 1/2）；采样器素材被过滤。
- 2 首 Demo 完成 Demucs 分析、排 set、渲染：约 4:44，−14.39 LUFS，真峰值 −0.46 dBTP。
- 在 `outputs/rekordbox-test/master.db` 副本写入播放列表，`TrackNo` 顺序正确；live `master.db` 哈希前后一致。
- XML 导出 `Location` 等于 `FolderPath`，没有重复文件名。
- API `confirm=false` 拒绝 DB 写入；`confirm=true` 只写副本成功。
- 站点 E2E：切到 Rekordbox → 生成 → setlist 显示 Demo Track 1/2 → 导出面板出现 → XML 下载 200（未点击写 live DB 的按钮）。
- `pytest` 17 passed（含 RB 副本写测试）；`check-dj-automix.mjs` 17 passed。

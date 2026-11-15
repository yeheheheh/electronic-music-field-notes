# djcore — 离线 DJ 排 set / 自动接歌引擎

v1 垂直切片。把「排 set」和「接歌」串成一条可复现的流水线：

```
分析（BPM / 调性 / 拍网格 / 乐句 / 能量 / 人声 / Demucs 分轨）
  → 选风格排 set（兼容性图 + 束搜索）
  → 规划过渡（长混音 / 低频交换 / 滤波 / 硬切 / 双 drop）
  → 分轨自动化 + 变速 + 限幅 + 响度归一
  → 一条 mix + 每段过渡 + JSON 报告
```

站点页面：`http://127.0.0.1:5501/#/dj/automix`（`node scripts/serve.mjs` 启动）。

## 目录

```
dj-engine/
  djcore/
    contracts.py        # TrackAnalysis / SetPlan / RenderResult
    analysis/           # 解码、节拍、调性、结构、人声、Demucs、缓存
    planning/           # intent、兼容性、束搜索、过渡曲线
    render/             # rubberband / librosa、自动化、混音、报告
    adapters/           # CLI、FastAPI、MCP stdio、桌面启动器
    service.py          # 三个适配器共用的服务层
  fixtures/
    audio/              # 合成示例曲（gitignore，可重新生成）
    sidecars/           # 手标 BPM / 调性 / drop / 段落
  data/genres.json      # 由 scripts/export-genre-models.mjs 从站点导出
  packaging/            # Windows 便携包构建脚本与许可证
  tools/                # 便携 ffmpeg / rubberband（gitignore）
  outputs/              # 分析缓存、分轨、渲染产物（gitignore）
```

## 安装（Windows）

前提：Python 3.12、`uv`、NVIDIA GPU（可选，Demucs 会快很多）。

```bat
uv venv dj-engine\.venv --python 3.12
uv pip install --python dj-engine\.venv\Scripts\python.exe ^
  torch torchaudio --index-url https://download.pytorch.org/whl/cu128
uv pip install --python dj-engine\.venv\Scripts\python.exe -e dj-engine
```

- 50 系显卡（sm_120）需要 cu128 或更新；cu126 的 wheel 在 5070 Ti 上会报 `no kernel image is available`。
- 官方源慢时可以把 wheel 先下载到本地再 `uv pip install --no-deps`（本机实测 NJU 镜像约 14MB/s）。
- `imageio-ffmpeg` 会带一个 ffmpeg 二进制；也可以把便携 ffmpeg 放到 `dj-engine/tools/`。
- rubberband 不是必需：把 `rubberband.exe` 和 `sndfile.dll` 放到 `dj-engine/tools/rubberband/` 即可优先使用；缺失时自动回退 librosa，报告里会注明。
- 首次 Demucs 运行会下载模型（约 80MB）。可用 `TORCH_HOME=dj-engine/models` 固定位置。

## 跑一遍

```bat
cd dj-engine
.venv\Scripts\python -m djcore.adapters.cli fixtures
.venv\Scripts\python -m djcore.adapters.cli analyze
.venv\Scripts\python -m djcore.adapters.cli run --preset melodic-techno
```

`run` 会输出 setId、plan 和 result。也可以拆开：

```bat
.venv\Scripts\python -m djcore.adapters.cli plan --preset sunrise --prompt "少一点人声"
.venv\Scripts\python -m djcore.adapters.cli render --plan outputs\sets\<setId>\plan.json
.venv\Scripts\python -m djcore.adapters.cli export-demo
```

## 过渡密度

`--density` 控制每段过渡的长度与 double drop 策略，默认跟随风格预设：

| 预设 | 长混音 | 低频交换 | 滤波 | double drop |
|---|---|---|---|---|
| `sparse` | 32 小节 | 8 | 16 | 不排 |
| `normal` | 16 | 8 | 8 | 允许（每场一次） |
| `dense` | 8 | 4 | 4 | 优先 |

```bat
.venv\Scripts\python -m djcore.adapters.cli run --preset melodic-techno --density sparse
.venv\Scripts\python -m djcore.adapters.cli rekordbox plan --density dense --duration 4
```

API 对应 `density` 字段；`GET /api/presets` 会返回三套预设的说明。

## 桌面启动与静态站

`djcore.adapters.desktop` 会启动本地 API，等健康检查通过后自动打开控制台：

```bat
.venv\Scripts\python -m djcore.adapters.desktop
```

如果设置 `DJ_SITE_DIR` 指向一个静态站目录（例如 `dist-site`），同一个端口会直接托管站点，控制台与 `/api` 同源，不需要另起静态服务器。

## 便携包

`packaging/build-portable.mjs` 生成 Windows 免安装包：复制 `.venv` 的 Python 运行时与依赖、Demucs 模型、rubberband、ffmpeg、站点，并写 `start.bat`。

```bat
node packaging\build-portable.mjs                 :: 完整包 + zip
node packaging\build-portable.mjs --slim --no-zip :: 不含 torch/demucs，只验结构
```

输出在 `packaging/dist/`。需要本机已有 `dj-engine/.venv` 和 7-Zip；完整包约 3.1 GB（压缩后）。

## Rekordbox 7 桥接

Rekordbox 没有公开插件 SDK；这里是外部桥接器：读它的库、排 set、渲染，再写播放列表或导出 XML。

- 自动发现 `%APPDATA%\Pioneer\rekordbox\master.db`；也可用 `DJ_REKORDBOX_DB` 或 `--db-path` 指定（RB6 的 `rekordbox6/master.db` 也会尝试）。
- 过滤采样器/录音素材与不足 20 秒的片段；只保留可播放的曲目。
- 写库必须关闭 Rekordbox；写入前自动备份 `master.db`、WAL/SHM 与 `masterPlaylists6.xml`。
- 开发/验收请先写 DB 副本，不要直接写 live 库。

```bat
cd dj-engine
.venv\Scripts\python -m djcore.adapters.cli rekordbox status
.venv\Scripts\python -m djcore.adapters.cli rekordbox scan
.venv\Scripts\python -m djcore.adapters.cli rekordbox plan --preset melodic-techno --duration 4 --export both --db-path outputs\rekordbox-test\master.db --name "djcore rb demo"
.venv\Scripts\python -m djcore.adapters.cli rekordbox export --set <setId> --name "djcore set" --mode xml
```

- `plan --export db|xml|both`：渲染后直接导出；`db` 会备份并写播放列表。
- `export --mode db` 需要 `--confirm`；不确认只导出 XML。
- `--limit 8` 控制一次最多分析多少首 Rekordbox 曲目，避免整库跑 Demucs；也可用 `--tracks` 指定具体曲目。
- MCP 工具：`rb_status`、`rb_library`、`rb_plan_set`、`rb_export_playlist`。
- 站点 `#/dj/automix` 的 `SOURCE / 曲库` 可切到 Rekordbox；导出面板只在 set 全为 `rb-` 曲目时出现。

## 本地 API

```bat
cd dj-engine
.venv\Scripts\python -m djcore.adapters.api
```

只绑定 `127.0.0.1:5601`。端点：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | ffmpeg / rubberband / Demucs / GPU |
| GET | `/api/presets` | 风格预设 + 92 条风格模型 |
| POST | `/api/library/scan` | 扫描目录 |
| POST | `/api/analyze` | 分析任务（返回 jobId） |
| GET | `/api/jobs/{id}` | 状态 / 进度 / 日志 |
| POST | `/api/sets/plan` | 已分析曲目 → SetPlan |
| POST | `/api/sets/{id}/render` | 渲染任务 |
| GET | `/api/sets/{id}` | plan + result |
| POST | `/api/demo` | 一键跑示例：分析 4 首 → 排 set → 渲染 |
| GET | `/api/files/{path}` | 播放产物，支持 Range |

站点开发服务器会把 `/api/*` 代理到 5601；线上没有引擎时，页面只读 `data/dj-automix-demo.js`。

## MCP

```json
{
  "mcpServers": {
    "djcore": {
      "command": "D:/项目/Electronic Music/dj-engine/.venv/Scripts/python.exe",
      "args": ["-m", "djcore.adapters.mcp_server"],
      "env": { "PYTHONPATH": "D:/项目/Electronic Music/dj-engine" }
    }
  }
}
```

工具：`dj_health`、`dj_analyze`、`dj_plan_set`、`dj_render_set`、`dj_get_set`。v1 不包含 Rekordbox / Mixxx；它们会作为独立适配器接在 `SetPlan` 上。

## 约定

- `SetPlan.transitions[i].stems` 的键是 `a.vocals` / `b.bass` 这种形式，前缀表示 A 或 B。
- 关键帧的 `bar` 相对于过渡重叠区起点；`double_drop` 的 drop 在 `buildBars` 处。
- v1 全场使用同一个 `targetBpm`（intent 区间中位数，曲目落在 ±6% 内），所以重叠区不做逐样本 tempo ramp。
- `double_drop` 每场最多一次，避免同一首曲目的唯一 drop 被重复占用。

## 测试

```bat
cd dj-engine
.venv\Scripts\python -m pytest
```

站点回归：

```bat
node scripts/regression/check-dj-automix.mjs
```

## 示例曲

`fixtures/audio/` 是 `djcore.library.fixtures` 生成的合成曲：48 小节、固定 BPM / 调性 / 第 17 小节 drop，专门用来给分析器和渲染器提供 ground truth。它们不是商业唱片，不涉及版权；站点 demo 会把渲染结果转成 MP3 放进 `assets/dj-automix/`。

## v1 不包含

- Mixxx 实时控制（OSC / MCP）。
- Rekordbox 写库与 playlist 导出。
- 整库扫描、60 分钟整场、并发渲染。
- `loop_roll`、`trade` 低频轮换、自动翻极性。
- 人声识别模型；人声活动来自 Demucs vocal 轨能量。

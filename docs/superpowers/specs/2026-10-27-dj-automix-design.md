# DJ 自动接歌台（Automix Lab）设计

- 日期：2026-10-27
- 状态：已通过设计评审，进入 v1 实施
- 适用范围：`dj-engine/` 本地引擎 + 站点 `#/dj/automix` 页面
- 关联：站点现有 `analyzePair()` 三条规则、60 条风格模型、DJ 课程 41 集

## 1. 目标

把「排 set」和「接歌」合成一条可复现的流水线：

1. 从本地曲库（或 Rekordbox 库）读曲目。
2. 分析 BPM、调性、拍网格、8 小节乐句、结构、能量、人声活动、分轨。
3. 用风格预设或一句 prompt 排出一场 set，含速度路径、调性路径、能量曲线。
4. 为每对相邻曲目选过渡类型，生成逐轨增益 / EQ 自动化曲线。
5. 离线渲染成一条连续音频 + 每段过渡单独导出 + JSON 报告。
6. 站点页面浏览 set、波形、过渡细节、风险原因，并播放渲染结果。
7. 同一份 `SetPlan` 可供后续 Rekordbox 导出与 Mixxx 实时执行，不重复排 set。

## 2. 非目标（v1）

- Mixxx 实时控制（OSC / MCP）。
- Rekordbox 写库（读取和 playlist 导出在 v2）。
- 整库扫描与 60 分钟整场渲染（v1 只跑 3–4 首、6–10 分钟）。
- 在线多人使用、云端渲染、账号体系。
- `loop_roll` / `trade` 低频轮换 / 自动翻极性。
- 用深度学习做人声识别；v1 用 Demucs vocal 轨能量。

## 3. 架构

引擎核心 + 多适配器。核心只依赖三份 JSON 契约，不知道 Rekordbox、Mixxx、站点是否存在。

```
                 ┌────────────── djcore.contracts ──────────────┐
                 │ TrackAnalysis / SetPlan / RenderResult        │
                 └───────┬───────────────┬───────────────┬──────┘
                         │               │               │
  LibrarySource ──> analysis ──> planning ──> render ──> outputs
   LocalSource                     │                        │
   FixtureSource                   ├── CLI                  ├── HTTP API ──> 站点 #/dj/automix
   RekordboxSource (v2)            ├── MCP (stdio)           └── demo bundle
                                   └── PlaybackTarget (v3: Mixxx OSC)
```

进程边界：

- 引擎：`python -m djcore.adapters.api`，只绑 `127.0.0.1:5601`。
- 站点：保持静态；开发期 `scripts/serve.mjs` 把 `/api/*` 代理到 5601；线上检测不到 API 就用 demo bundle。
- MCP：`stdio` 薄壳，调用同一批 Python 函数，不是第二套实现。

## 4. 目录

```
dj-engine/
  pyproject.toml
  .venv/                     # gitignore
  djcore/
    contracts.py
    config.py
    library/
      base.py                # LibrarySource 协议
      local.py               # 目录扫描 + sidecar
      fixtures.py            # 合成曲生成/读取
      rekordbox.py           # v2 占位，不 import 第三方
    analysis/
      pipeline.py            # 编排 + 缓存
      beats.py
      key.py
      structure.py
      vocals.py
      stems.py
      cache.py
    planning/
      intent.py
      compatibility.py
      set_planner.py
      transition.py
    render/
      stretch.py
      automation.py
      mixdown.py
      waveform.py
      report.py
    adapters/
      cli.py
      api.py
      mcp_server.py
    tests/
  data/genres.json           # 由 scripts/export-genre-models.mjs 生成
  fixtures/
    audio/                   # 合成/下载的示例曲
    sidecars/                # 手标 BPM/key/drop/genre
    licenses.md
  tools/                     # 便携 ffmpeg / rubberband，gitignore
  outputs/                   # 渲染产物，gitignore
```

站点侧新增/修改：

- `app.js`：新增 `#/dj/automix` 路由与页面。
- `styles-dj.css`：只新增类，不覆盖现有规则。
- `scripts/serve.mjs`：开发期 `/api` 代理。
- `data/dj-automix-demo.js`：demo plan + report。
- `assets/dj-automix/`：demo 音频。
- `scripts/export-genre-models.mjs`：导出 60 条风格模型。
- `scripts/regression/check-dj-automix.mjs`：站点回归。

## 5. 契约

所有时间单位：秒（float）或毫秒（int）在字段名中显式标注；拍位置用 `bar`（1-based）和 `beat`（1-based）。

### 5.1 TrackAnalysis

```json
{
  "schema": 1,
  "track": {
    "id": "sha1-...",
    "title": "Example",
    "artist": "Fixture",
    "path": "fixtures/audio/example.wav",
    "durationSec": 60.0,
    "sampleRate": 48000,
    "channels": 2,
    "sha256": "..."
  },
  "bpm": { "value": 128.0, "confidence": 0.92, "octaveAmbiguous": false },
  "key": {
    "pitchClass": 9, "mode": "minor", "name": "A minor",
    "camelot": "8A", "confidence": 0.71
  },
  "beats": { "firstSec": 0.42, "intervalSec": 0.46875, "timesSec": [0.42, 0.89], "confidence": 0.9 },
  "downbeatsSec": [0.42, 2.29],
  "phrases": [
    { "startBar": 1, "endBar": 16, "startSec": 0.42, "endSec": 7.9, "type": "intro", "confidence": 0.8 }
  ],
  "drops": [
    { "sec": 30.1, "bar": 33, "beat": 1, "confidence": 0.86, "preDropStartSec": 22.0 }
  ],
  "builds": [
    { "startSec": 22.0, "endSec": 30.1, "startBar": 25, "endBar": 32, "confidence": 0.8 }
  ],
  "energy": [
    { "startSec": 0.0, "endSec": 3.75, "value": 0.22 }
  ],
  "vocals": [
    { "startSec": 12.0, "endSec": 20.0, "confidence": 0.7 }
  ],
  "loudness": { "integratedLufs": -9.4, "peakDb": -0.8 },
  "stems": {
    "vocals": "outputs/stems/<hash>/vocals.wav",
    "drums": "outputs/stems/<hash>/drums.wav",
    "bass": "outputs/stems/<hash>/bass.wav",
    "other": "outputs/stems/<hash>/other.wav"
  },
  "features": {
    "lowRatio": 0.34, "midRatio": 0.41, "highRatio": 0.25,
    "spectralCentroidHz": 2400,
    "groove": { "class": "floor", "confidence": 0.72 },
    "lowBehavior": { "class": "pulse", "confidence": 0.66 }
  },
  "genreId": "melodic-techno",
  "warnings": []
}
```

`genreId` 可来自 sidecar / Rekordbox tag；缺失时由 `features` 推断，置信度写入 `warnings`。

### 5.2 StyleIntent

```json
{
  "prompt": "日出时段的 melodic techno，少一点人声",
  "genres": [{ "id": "melodic-techno", "weight": 0.8 }, { "id": "progressive-house", "weight": 0.2 }],
  "bpmRange": [118, 126],
  "durationMin": 8,
  "energyCurve": { "preset": "build", "points": [[0, 0.25], [0.5, 0.55], [0.8, 0.85], [1, 0.7]] },
  "vocalTolerance": "low",
  "harmonicStrictness": 0.75,
  "transitionDensity": "normal",
  "seed": 20261027
}
```

### 5.3 SetPlan

```json
{
  "schema": 1,
  "id": "set-...",
  "createdAt": "2026-10-27T08:00:00Z",
  "intent": { "...": "StyleIntent" },
  "entries": [
    {
      "position": 1, "trackId": "sha1-...", "title": "A",
      "nativeBpm": 126.0, "targetBpm": 126.0,
      "camelot": "8A", "energy": 0.3, "role": "opener",
      "playFromBar": 1, "playToBar": 64
    }
  ],
  "transitions": [
    {
      "fromPosition": 1, "toPosition": 2,
      "type": "long_blend",
      "phrase": { "bars": 16, "startBarA": 49, "startBarB": 1, "overlapBars": 16 },
      "tempo": { "fromBpm": 126.0, "toBpm": 124.0, "mode": "ramp", "rampBars": 16 },
      "stems": {
        "a.vocals": [{ "bar": 0, "gainDb": 0, "lowEqDb": 0, "highEqDb": 0 }],
        "a.bass": [{ "bar": 0, "gainDb": 0, "lowEqDb": 0, "highEqDb": 0 }],
        "b.vocals": [{ "bar": 0, "gainDb": -60, "lowEqDb": 0, "highEqDb": 0 }]
      },
      "crossfader": [{ "bar": 0, "value": 0.0 }, { "bar": 16, "value": 1.0 }],
      "dropLock": null,
      "bassOwner": null,
      "risk": 0.32,
      "reasons": ["速度差 1.6%", "同调性", "A 尾部人声低"],
      "render": { "startSec": null, "endSec": null }
    }
  ],
  "totals": { "durationSec": 480, "avgBpm": 125.2, "keyPath": ["8A", "9A"] },
  "warnings": []
}
```

`trackId` 引用 `TrackAnalysis`；`render.startSec/endSec` 在渲染后回填。

### 5.4 RenderResult

```json
{
  "schema": 1,
  "setId": "set-...",
  "outputs": {
    "mixWav": "outputs/sets/<id>/mix.wav",
    "mixMp3": "outputs/sets/<id>/mix.mp3",
    "transitions": [{ "index": 0, "path": "outputs/sets/<id>/transition-01.wav" }]
  },
  "durationSec": 486.2,
  "loudness": { "integratedLufs": -14.0, "truePeakDb": -0.4 },
  "waveform": { "bucketMs": 10, "peaks": [[-0.3, 0.4]] },
  "transitions": [
    {
      "index": 0, "type": "long_blend",
      "startSec": 120.0, "endSec": 150.0,
      "dropAlignMs": null,
      "phaseCorrelation": 0.12,
      "warnings": [],
      "reportPath": "outputs/sets/<id>/transition-01.json"
    }
  ],
  "logs": ["demucs: htdemucs", "stretch: rubberband"]
}
```

## 6. 分析

- 解码：分析用 48kHz mono；渲染用 48kHz stereo。优先 soundfile，失败回退 ffmpeg。
- BPM/拍：librosa `beat.beat_track` + onset envelope 精修；下拍按 4/4 与低频起音周期性判定；输出 `beatTimesSec`。
- 八度歧义：85/170、70/140；按 `StyleIntent.bpmRange` 和相邻曲目归一到最近八度，或在过渡中允许半速/双速。
- 调性：CQT chroma → Krumhansl 模板 → pitch class + mode → Camelot；置信度 <0.5 时规划器不强约束。
- 结构：8 小节窗；特征为 RMS、低频占比、高频占比、chroma 新颖度、人声 RMS；用能量突变 + 重复相似度切段。
- drop：低频 RMS 突增 + 频谱通量峰值 + 前 8–16 小节存在 build；要求落在 downbeat；输出置信度。
- 人声：Demucs vocal 轨按 1 小节 RMS，相对中位数阈值；高置信区间写入 `vocals`。
- 能量：短时 LUFS + 低频 + 高频加权，归一到 0–1；保留绝对 LUFS。
- 分轨：`htdemucs`，GPU；按 `sha256` 缓存；同时输出 `stems` 路径。
- 风格/鼓型/低频：有 `genreId` 用站点模型；否则从分轨提取，置信度写入。
- 缓存：`sha256 + analysisVersion`；schema 变化直接失效重算。

## 7. 兼容性与排 set

边分（0–1 加权）：

| 维度 | 规则 |
|---|---|
| 速度 | `|log2(bpmB/bpmA)|`；≤6% 或 0.5/2 倍；越接近 1 越高。set 规划阶段按统一 `targetBpm` 计分，原生 BPM 只用于入选与显示 |
| 调性 | 同调 1.0、±1（四度/五度）0.85、关系大小调 0.8、±2 0.55、其余 0.1；低置信度向 0.5 收 |
| 鼓型 | 同族高；floor↔half、break↔swing 降分 |
| 低频 | pulse/sustain/grit/sink 兼容表；同族最高 |
| 能量 | 与目标曲线差值 |
| 人声 | 过渡窗内双方都有人声时重罚 |
| 音色 | 三频段 + 频谱质心余弦相似度 |

权重由 intent 控制：`harmonicStrictness`、`vocalTolerance`、`transitionDensity`。

束搜索：

- 状态 =（最后曲目、已用时长、累计能量误差、调性路径）。
- beam 宽 50；seed 固定。
- 目标函数 = 过渡总分 − 能量曲线误差 − 时长偏差 − 风格漂移。
- 每首分配 `targetBpm`（原生 ±6% 内），形成分段平滑速度路径。
- 输出 `warnings`：低置信度、速度跳变、调性冲突。

## 8. 过渡

### 8.1 类型

| 类型 | 条件 | 长度 |
|---|---|---|
| `long_blend` | A 尾 + B 头低人声、≥16 小节、速度差 ≤3% | 16–32 小节 |
| `bass_swap` | 两边低频强、速度差 ≤2% | 8–16 小节 |
| `filter_out` | 速度差 3–6%、调性冲突或能量跳变 | 4–8 小节 |
| `cut` | 冲突大、需要冲击 | 1 小节，落 downbeat |
| `double_drop` | 见 8.2 | 8–16 小节 |

### 8.2 double_drop 准入与执行

准入（全部满足）：

1. 两首 `drops[0].confidence ≥ 0.6`，且 drop 落在 downbeat、8/16 小节乐句边界。
2. 速度比 ≤4%，映射到同一 `targetBpm`。
3. 调性分 ≥0.65。
4. A、B 的 drop 前都至少留 16 小节（build 窗口），且 B 的 drop 前 4 小节人声低于阈值；A 的 drop 后至少 8 小节。
5. A、B 的 playFrom/playTo 留出足够 build 与 overlap。

执行：

- `dropLock = { aDropSec, bDropSec, aDropBar, bDropBar }`；按拍对齐，输出样本误差 <10ms。
- 过渡区 = build（默认 16 小节）+ post-drop（默认 16 小节）；`phrase.overlapBars` 记录总长度，`phrase.bars` 记录 drop 后的重叠长度。
- 默认 `bassOwner = "b"`：第 1 小节两首全频，第 2 小节起 A 的 bass −9dB 或 120Hz 高通；A 在第 8/16 小节边界退出，留 1 小节滤波/延迟尾。
- `bassOwner = "a"` 仅在 B 的 drop 更短、A 继续时启用。
- 不做长时间双 bass，不做 `trade`。
- v1 每场最多一次 double drop，避免同一首曲目的唯一 drop 被相邻两段过渡重复占用。

风险与降级：

- 风险 = drop 置信度、调性、低频掩蔽、相位相关性加权。
- 风险 >0.55 或对齐误差 >10ms → 自动降级为 `bass_swap` / `cut`，写入 `warnings` 与 UI；不静默替换。
- 重叠区计算 A/B 单声道信号的零延迟归一化互相关；< −0.3 视为相位抵消风险并警告；v1 不自动翻极性。

### 8.3 乐句对齐

- 在 A 最后 32 小节、B 前 32 小节枚举 8/16 小节边界。
- 评分 = 边界位置 + 人声安全 + 重叠长度 + 调性 − 与结构段落的冲突。
- 所有进出点吸附到 downbeat。
- double_drop 时以两个 drop 为锚点，向前取 build 长度，向后取 8/16 小节。

### 8.4 自动化曲线

- 增益等功率交叉；关键帧按小节，`bar` 相对于过渡重叠区起点。
- 关键帧字段 `{bar, gainDb, lowEqDb, highEqDb, lowPassHz?, highPassHz?}`；滤波字段用于 `filter_out` 的低通/高通下扫。
- `bass_swap`：第 2/4 小节交换低频。
- `filter_out`：A 的 drums/other 低通下扫，B 高通渐入。
- `cut`：1 小节内完成，A 留延迟尾。
- `double_drop`：第 2 小节 A bass 让位；A 退出时 1 小节滤波尾。

## 9. 渲染

- 时间线：A 独立段 → 重叠段 → B 独立段；相邻过渡复用重叠段。
- v1 全场统一 `targetBpm`（intent 区间内取中位数，所有曲目落在 ±6% 内）；速度跨度更大的曲目不入选或标注警告。这样重叠区不需要逐样本变速 ramp，drop 对齐是样本级精确的。
- 每首按 `targetBpm` 整体变速；重叠区按 `tempo.mode` 做 ramp（v1 实际只产生 `constant`）。
- 变速：优先 rubberband CLI；缺失回退 librosa 相位声码器；报告注明降级。
- 分轨自动化后求和：bass 单独增益；drums/other 高低架滤波；vocals 独立增益；不在总线做三段 EQ。
- 母线：前瞻限幅 + 目标响度归一（网页 −14 LUFS，可配 −9）；真峰值 > −0.3dBTP 判失败。
- 输出：WAV 24-bit、MP3 320、每段过渡 WAV、波形峰值（10ms min/max）、JSON 报告。
- 报告含：决策、指标、风险、降级原因、对应课程集数。

## 10. API 与 MCP

### 10.1 HTTP（127.0.0.1:5601）

| 端点 | 说明 |
|---|---|
| `GET /api/health` | ffmpeg / rubberband / Demucs / GPU 能力 |
| `POST /api/library/scan` | 扫描目录，返回曲目 |
| `POST /api/analyze` | 分析任务 |
| `GET /api/jobs/{id}` | 状态、进度、日志尾 |
| `POST /api/sets/plan` | intent + trackIds → SetPlan |
| `POST /api/sets/{id}/render` | 渲染任务 |
| `GET /api/sets/{id}` | plan + result |
| `GET /api/files/{path}` | Range 播放 |
| `POST /api/jobs/{id}/cancel` | 取消 |

任务单 worker 串行；v1 不并发渲染。`GET /api/files/{path}` 只允许 `outputs/` 与 `fixtures/` 下的文件，解析后必须校验绝对路径前缀，禁止 `..` 穿越。

### 10.2 MCP（stdio）

v1：`dj_health`、`dj_analyze`、`dj_plan_set`、`dj_render_set`、`dj_get_set`。
v2：`dj_export_rekordbox`、`dj_mixxx_load`、`dj_mixxx_transition`，通过配置发现外部 MCP，不在 import 时硬依赖。

## 11. 站点 UI

- 路由 `#/dj/automix`，标题「自动接歌台 / AUTOMIX LAB」。
- 顶部：6 个风格预设 + prompt + 时长 + 能量曲线 + 人声容忍度 + 生成。
- setlist 卡片：BPM / Camelot / 能量条 / 角色；卡片间过渡徽章（类型 + 风险色）。
- 详情抽屉：双波形、拍网格、乐句线、过渡区、drop 标记与对齐线；四轨开关与曲线；`bassOwner`；播过渡 / 播整场；风险原因 + 课程链接。
- 进度：分析 → 分轨 → 渲染三段；失败给可操作提示。
- Demo：health 800ms 超时切 `data/dj-automix-demo.js` + `assets/dj-automix/`，顶部明示「演示数据 · 本地引擎未连接」，隐藏生成。
- 样式只进 `styles-dj.css`；键盘、`aria-live`、reduced motion。

## 12. 错误处理

- 启动能力自检；缺失依赖在 health 返回，UI 禁用渲染并给安装命令。
- 低置信度分析写 `warnings`，规划器降级使用。
- 无 drop / 无乐句：`double_drop` 不可用，自动选次优。
- 渲染失败：记录 stage + 日志尾，清理半成品；磁盘不足在分轨前拦截。
- 不支持/DRM/缺失文件：跳过并给原因，不中断整库。
- schema 不匹配：缓存失效重算。
- 削波：判失败或归一重渲染，不发布削波产物。
- 任务超时/取消：清理临时文件，状态置 `cancelled`。

## 13. 测试与验收

单元：

- Camelot 映射、兼容性评分、乐句/drop 对齐、曲线生成、变速比、响度归一。
- Node 跑 60×60 组合与 Python 兼容性分数逐对比对。

合成 fixture（v1 决策）：

- 用 `numpy/soundfile` 生成 4 首 60 秒电子曲，已知 BPM、调性、drop 在第 33 小节、build 在第 25–32 小节；含 kick/bass/chords/lead 与「人声状」共振峰音色。
- 理由：ground truth 可断言、无版权与下载不确定性；站点 demo 可直接用，后续可替换 CC0 真曲。
- 每首附 sidecar 手标，分析器可用它做校准对照。

集成：

- 分析 → 排 set → 渲染；断言时长、无削波、−14±1 LUFS、边界落乐句、double_drop 对齐 <10ms、降级路径可复现。
- 真实曲目冒烟：若 `fixtures/audio/real/` 存在，跑同一套断言（阈值放宽）。

站点回归：

- `check-dj-automix.mjs`：路由渲染、demo 回退、播放器、无控制台报错、窄屏无横向溢出。
- 并入 `scripts/regression/run.sh`。

## 14. 性能目标（RTX 5070 Ti Laptop）

- 分析：<10 秒/首。
- Demucs：<60 秒/首（首次模型下载不计）。
- 4 首 6 分钟 set 渲染：<60 秒。
- 站点首屏（demo）：<2 秒。

## 15. 阶段

- v1（本 spec）：离线垂直切片 + 最小 MCP 薄壳 + 站点页面。
- v2：Rekordbox 读取 / playlist 导出；完整 MCP 集成。
- v3：Mixxx OSC 实时执行（单独 spec）。
- v4：实时 AI DJ（可选，不承诺）。

## 16. 风险与开放决策

- 调性检测准确率有限；低置信度不强约束，报告标注。
- 合成 fixture 的 Demucs 分轨与真实曲目有差异；保留真实曲目冒烟入口。
- rubberband 在 Windows 的二进制分发；缺失时回退 librosa，质量下降但流程可跑。
- double_drop 依赖 drop 检测；准入失败自动降级，不硬上。
- 站点线上无本地引擎，只能展示 demo；这是静态站的取舍，已在 UI 明示。

## 17. 依赖与运行

- Python 3.12（uv 管理的 3.12.12）。
- 必需：`numpy`、`scipy`、`librosa`、`soundfile`、`torch`（cu128，50 系显卡需要）、`torchaudio`、`demucs`、`pydantic`、`fastapi`、`uvicorn`、`pyloudnorm`、`httpx`、`imageio-ffmpeg`、`pytest`、`mcp`。
- 外部二进制：`ffmpeg`、`rubberband`（可选）。便携版放 `dj-engine/tools/`，启动时优先使用；不修改系统 PATH。
- 运行：
  - `python -m djcore.adapters.api`（本地 API）
  - `python -m djcore.adapters.cli plan --intent intent.json --tracks a,b,c`（CLI）
  - `python -m djcore.adapters.mcp_server`（MCP stdio）
- 首次运行会下载 Demucs 模型（约 80MB）；可用 `TORCH_HOME` 指向 `dj-engine/models/`。
- 站点开发：`node scripts/serve.mjs`，自动把 `/api` 代理到 `127.0.0.1:5601`。

# 电音档案知识库模块 / Electronic Music KB Module

一个零依赖、可独立生成的电子音乐知识库模块。它把分类库、精编内容和转写资料构建为结构化产物，并通过 **CLI、MCP stdio、HTTP API** 提供给 Agent 直接调用。

模块不依赖原有网页、数据库或向量服务；只要 Node.js >= 18，即可在一台干净机器上构建和运行。

---

## 1. 快速开始

```bash
cd kb-module

# 1) 构建产物（读取 config/kb.config.json）
node bin/kb.mjs build

# 2) 验证
node bin/kb.mjs verify

# 3) 检索
node bin/kb.mjs search "uplifting trance" --limit 3

# 4) 生成 prompt 上下文
node bin/kb.mjs context "七组音色怎么分工" --max-chars 4000

# 5) 启动 MCP（给 Agent 用）
node bin/mcp-server.mjs

# 6) 或启动 HTTP API
node bin/kb.mjs serve --port 8787

# 7) 跑测试
npm test
```

默认产物目录：`kb-module/dist/`。构建完成后即可脱离本仓库的网页代码独立使用。

---

## 2. 模块边界

本模块负责：

- 从 Markdown 分类库解析风格条目、大族、上下位关系、别名、例曲、BPM。
- 从精编 JSON 生成听辨、制作、历史、现场、术语、来源等文档。
- 生成检索分块、BM25 索引元数据、manifest 与 CSV。
- 提供统一的检索、详情、大族列表、上下文拼装能力。
- 通过 MCP / CLI / HTTP 暴露给 Agent。

本模块不负责：

- 生成最终自然语言回答（由 Agent/LLM 完成）。
- 提供音频播放或下载；网页里的学习试听由前端 `audio.js` 实时合成，不进入知识库产物。
- 自动抓取飞书或 B 站内容；输入必须是本地文件。
- 向量检索或外部 embedding 服务；当前是可移植的词法检索。

---

## 3. 输入契约

### 3.1 配置文件

`config/kb.config.json`，所有相对路径都**相对于 config 文件所在目录**解析。

```json
{
  "module": {
    "id": "electronic-music-kb",
    "name": "电音档案知识库",
    "version": "1.0.0",
    "language": "zh-CN"
  },
  "inputs": {
    "taxonomy": "../inputs/taxonomy.md",
    "curated": "../inputs/curated.json",
    "transcripts": "../inputs/transcripts",
    "sourceMap": "../inputs/source-map.json"
  },
  "output": "../dist",
  "build": {
    "chunkMaxChars": 2200,
    "chunkOverlap": 200,
    "includeTranscripts": false
  },
  "retrieval": {
    "defaultLimit": 6,
    "maxLimit": 20,
    "bm25": { "k1": 1.2, "b": 0.75 }
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `module.id` | 是 | 稳定模块 ID，出现在 MCP serverInfo 与 manifest 中 |
| `module.version` | 是 | 语义化版本 |
| `inputs.taxonomy` | 是 | 分类库 Markdown；标题层级 + `上位/下位` + `A.K.A.` + `例曲` |
| `inputs.curated` | 是 | 精编内容 JSON；见 `inputs/curated.json` |
| `inputs.transcripts` | 否 | 转写目录；默认只登记来源，不索引 |
| `inputs.sourceMap` | 否 | 来源元数据；用于 manifest 与来源文档 |
| `output` | 是 | 产物目录；构建时会覆盖同名产物文件 |
| `build.chunkMaxChars` | 否 | 单块最大字符数，默认 2200 |
| `build.chunkOverlap` | 否 | 长文切块重叠字符数，默认 200 |
| `build.includeTranscripts` | 否 | 是否把转写原文也加入检索；默认 false，避免噪声 |
| `retrieval.defaultLimit` | 否 | 默认返回条数 |
| `retrieval.maxLimit` | 否 | 单次最大返回条数 |
| `retrieval.bm25` | 否 | BM25 参数 |

JSON Schema：`schema/config.schema.json`。

### 3.2 分类库 Markdown

兼容《电音风格项目》的写法：

```markdown
## Bigroom House

上位：EDM Electro House

下位：Dutch House、EDM Techno、Future Rave等

A.K.A. Bigroom、Big Room House

解释正文……

例曲：Tremor - Dimitri Vegas / Martin Garrix / Like Mike
```

解析规则：

- `#` 为一级大族，`##` 及以下为条目或分组；`前言`/`大纲` 不计入条目。
- `上位/上` = 影响来源；`下位/下` = 衍生方向；`Related To` = 相似；`A.K.A./AKA` = 别名。
- 正文中明确写出的 BPM 会被提取；没有数字则保留为空。
- 原始 `待完善`、`交叉引用`、`已合并` 等状态会保留，不会补写。
- 条目的 `id` 由原文行号生成（如 `g-1581`），重新排版原文会让 ID 变化；建议保留原文件结构。

### 3.3 精编内容 JSON

`inputs/curated.json` 的顶层字段：

```json
{
  "hero": {},
  "entryPoints": [],
  "coordinates": [],
  "tenStyles": [],
  "timeline": [],
  "listen": { "practice": [], "confusions": [] },
  "historyDrivers": [],
  "production": { "sections": [], "instrumentGroups": [], "soundChain": {}, "frequency": {}, "practice": [] },
  "live": { "sections": [], "quote": {}, "checklist": [] },
  "glossary": [{ "group": "曲式", "intro": "", "terms": [] }],
  "atlasGuide": { "sections": [] },
  "sources": [],
  "corrections": [],
  "usage": []
}
```

构建器会把每个风格、时间线、乐器组、术语、现场章节拆成独立检索文档；字段缺失时跳过对应文档，不会报错。

### 3.4 来源映射

`inputs/source-map.json` 记录来源的标题、作者、URL、许可说明和文件路径。构建时会计算每个来源文件的 SHA-256，并写入 `manifest.json` 与 `sources.json`。

---

## 4. 输出产物

构建后的 `dist/`：

| 文件 | 内容 | Schema |
| --- | --- | --- |
| `manifest.json` | 模块版本、构建时间、统计、工具、来源哈希、文件清单 | `schema/manifest.schema.json` |
| `kb.json` | 全量条目、大族、meta；与网页数据兼容 | `schema/entry.schema.json` |
| `chunks.jsonl` | 供检索/RAG 的分块，一行一个 JSON | `schema/chunk.schema.json` |
| `docs.json` | 精编文档（风格、指南、术语、来源等） | — |
| `families.json` | 大族列表与简介 | — |
| `curated.json` | 构建时使用的精编内容快照 | — |
| `sources.json` | 来源清单、字节数、哈希、许可说明 | — |
| `index.meta.json` | 分块元数据、tokenizer、文档长度；不含 postings | — |
| `web.js` | 浏览器适配 bundle：`window.KB_WEB = { manifest, docs, chunks }` | — |
| `entries.csv` | 条目表，方便 Excel/表格工具 | — |

`web.js` 只用于浏览器适配层；Agent 直接使用 `kb.json` / `chunks.jsonl`，或通过 MCP/HTTP 调用即可，不需要加载这个 bundle。
| `unresolved.json` | 未解析关系、同名条目清单 | — |
| `schema/` | JSON Schema 副本 | — |

### 4.1 关键字段

**Entry（`kb.json`）**

```json
{
  "id": "g-1581",
  "name": "Bigroom House",
  "familyId": "f-165",
  "familyName": "House",
  "pathNames": ["Electro House", "EDM Electro House", "Bigroom House"],
  "aliases": ["Bigroom", "Big Room House"],
  "description": "……",
  "summary": "……",
  "bpm": { "min": 126, "max": 132, "label": "126–132" },
  "examples": [{ "title": "Tremor", "artist": "Dimitri Vegas / Martin Garrix / Like Mike", "url": null }],
  "relations": {
    "up": [{ "name": "EDM Electro House", "id": "g-1551" }],
    "down": [{ "name": "Dutch House", "id": "g-1599" }],
    "related": []
  },
  "sourceLine": 1581,
  "line": 1581
}
```

**Chunk（`chunks.jsonl`）**

```json
{
  "id": "g-1581",
  "docId": "g-1581",
  "type": "entry",
  "title": "Bigroom House",
  "text": "……",
  "family": "House",
  "familyId": "f-165",
  "path": "Electro House > EDM Electro House > Bigroom House",
  "bpm": null,
  "aliases": ["Bigroom", "Big Room House"],
  "examples": ["Follow Me - Maddix / SaberZ"],
  "source": { "id": "feishu-taxonomy", "title": "电音风格项目丨第四期", "line": 1581 },
  "metadata": { "familyName": "House", "stub": false }
}
```

`type` 可能为：`entry`、`family`、`guide`、`style`、`instrument`、`glossary`、`timeline`、`live`、`source`、`transcript`（仅当开启转写索引）。

---

## 5. 检索与调用机制

### 5.1 检索流程

1. 加载 `chunks.jsonl`、`kb.json`、`docs.json`、`manifest.json`。
2. 对每个分块做字段加权分词：
   - 标题 6×、别名 4×、大族/路径 2×、例曲 2×、正文 1×。
   - 中文：单字 + 双字 + 短 full-run；英文：小写词；过滤停用词。
3. 在内存中构建倒排索引（postings / document frequency / doc length）。
4. 查询时：
   - 中文/英文统一 tokenizer；对“七组”“bass”“结构”等做轻量查询扩展。
   - BM25 打分；长词权重更高。
   - 标题/别名/大族 phrase 命中加分；大族概览文档对大族名查询额外加分。
   - 多词覆盖率修正；来源元数据文档降权。
   - 按 `docId` 去重。
5. 返回 `score`、`snippet`、`source`、`metadata`。

### 5.2 过滤

| 参数 | 说明 |
| --- | --- |
| `family` | 大族名或 ID，如 `House`、`f-165` |
| `type` | `entry` / `family` / `guide` / `style` / `instrument` / `glossary` / `timeline` / `live` / `source` |
| `bpm_min` / `bpm_max` | 仅对有明确 BPM 的分块生效 |
| `limit` | 1–20（模块配置可调） |

### 5.3 结果对象

```json
{
  "query": "uplifting trance",
  "count": 169,
  "results": [
    {
      "id": "g-2999",
      "chunk_id": "g-2999",
      "type": "entry",
      "title": "Uplifting Trance",
      "family": "Trance",
      "bpm": { "min": 135, "max": 142, "label": "135–142" },
      "score": 100.195,
      "snippet": "……",
      "source": { "id": "feishu-taxonomy", "title": "电音风格项目丨第四期", "line": 2999 }
    }
  ],
  "meta": { "limit": 6, "totalMatched": 169 }
}
```

`count` 是去重后的候选数；`results` 只返回 `limit` 条。长文档可能被拆成多个 chunk，但结果按 `docId` 去重。

### 5.4 上下文拼装

`kb_context` 会取前 N 条结果，拼成：

```markdown
# 知识库检索上下文

查询：七组音色怎么分工
命中：1326 条；以下是前 3 条。
使用说明：回答时请用 [ID] 引用来源；资料不足时明确说明，不要补造。

## 1. [guide:production-instrument-summary] 七大乐器组：七组音色怎么分工
- 类型：guide
- 来源：电音档案精编内容

……
```

适合在 LLM 回答前作为 system/user 上下文注入。`max_chars` 控制总长度。

---

## 6. 接口一：CLI

所有命令都支持 `--dist <dir>` 或环境变量 `KB_DIST` 指定产物目录。

```bash
node bin/kb.mjs build [--config path] [--out dir]
node bin/kb.mjs search "query" [--limit 6] [--family House] [--type entry] [--bpm-min 120] [--bpm-max 135] [--json]
node bin/kb.mjs context "query" [--limit 5] [--max-chars 6000] [--json]
node bin/kb.mjs get g-1581 [--json]
node bin/kb.mjs families [--json]
node bin/kb.mjs manifest
node bin/kb.mjs verify
node bin/kb.mjs serve [--port 8787] [--host 127.0.0.1]
node bin/kb.mjs mcp [--dist dir]
```

CLI 输出到 stdout；错误输出到 stderr，退出码非零。适合被 Agent 作为 shell 工具调用。

---

## 7. 接口二：MCP stdio

启动：

```bash
node bin/mcp-server.mjs --dist ./dist
```

- 传输：newline-delimited JSON-RPC 2.0 over stdio。
- 协议：`2024-11-05`（也接受 `2025-03-26` / `2025-06-18` 的初始化声明）。
- stdout 只输出 JSON-RPC；诊断信息走 stderr。
- 启动时加载一次索引。

### 工具列表

| 工具 | 输入 | 输出 |
| --- | --- | --- |
| `kb_search` | `query` 必填；`limit`、`family`、`type`、`bpm_min`、`bpm_max` | JSON 检索结果 |
| `kb_context` | `query` 必填；`limit`、`max_chars`、`family`、`type`、`bpm_min`、`bpm_max` | Markdown 上下文 |
| `kb_get` | `id` | 条目/文档完整 JSON |
| `kb_families` | 无 | 大族列表 JSON |
| `kb_manifest` | 无 | 版本/统计/来源 JSON |

### 示例

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"agent","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"kb_search","arguments":{"query":"uplifting trance","limit":3}}}
```

响应：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "{\n  \"query\": \"uplifting trance\",\n  \"results\": [...]\n}" }
    ]
  }
}
```

`kb_context` 的 `content[0].text` 是 Markdown，可直接拼入提示词。

---

## 8. 接口三：HTTP API

启动：

```bash
node bin/kb.mjs serve --port 8787 --host 127.0.0.1
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查、版本、统计 |
| GET | `/manifest` | 完整 manifest |
| GET | `/families` | 大族列表 |
| GET | `/search?q=...` | 检索；支持 `limit/family/type/bpm_min/bpm_max` |
| POST | `/search` | JSON body：`{ "query": "...", "limit": 5 }` |
| GET | `/context?q=...` | 上下文 JSON；`format=text` 返回 Markdown |
| GET | `/get?id=g-1581` | 条目/文档详情 |
| GET | `/entry/g-1581` | 同上，路径形式 |

示例：

```bash
curl "http://127.0.0.1:8787/search?q=uplifting%20trance&limit=3"
curl "http://127.0.0.1:8787/context?q=808%20bass&format=text"
```

默认只绑定 `127.0.0.1`。**不要无鉴权地暴露到公网**；如确需远程访问，应在前面加认证反向代理。

---

## 9. 与 Agent 对接

### 9.1 MCP（推荐）

把 `agent/mcp.config.example.json` 里的占位符替换为绝对路径，然后合并进客户端的 MCP 配置（Claude Desktop / Qoder 等通常使用 `mcpServers` 字段）：

```json
{
  "mcpServers": {
    "electronic-music-kb": {
      "command": "node",
      "args": [
        "D:/项目/Electronic Music/kb-module/bin/mcp-server.mjs",
        "--dist",
        "D:/项目/Electronic Music/kb-module/dist"
      ]
    }
  }
}
```

如果 GUI 客户端找不到 `node`，把 `command` 改成 `node` 的绝对路径（Windows 常见为 `C:/Program Files/nodejs/node.exe`）。

配置后用 `kb_manifest` 测通；再让 Agent 按 `agent/system-prompt.md` 的流程调用 `kb_search` / `kb_context` / `kb_get`。

### 9.2 OpenAI / 支持 function calling 的 Agent

- 工具定义：`agent/openai-tools.json`。
- 系统提示：`agent/system-prompt.md`。
- 执行层可以三选一：
  1. 如果运行时支持 MCP，直接把 MCP 工具暴露给模型；
  2. 不支持 MCP 时，把 `kb_search` 等函数实现为调用 CLI（`node bin/kb.mjs search ... --json`）；
  3. 或调用 HTTP API（`/search`、`/context`、`/get`）。

### 9.3 LangChain / 自研 Agent

最简单的方式是启动 HTTP API，把 `/context` 包装成一个 retriever/tool：

```js
const response = await fetch('http://127.0.0.1:8787/context?q=' + encodeURIComponent(query) + '&max_chars=5000');
const { markdown, citations } = await response.json();
```

`citations` 是用于引用/校验的 ID 列表。

### 9.4 推荐调用顺序

1. `kb_manifest`：确认版本与数据规模。
2. `kb_families`：确定范围（可选）。
3. `kb_context`：拿回答所需上下文。
4. `kb_get`：需要完整条目/关系/例曲时再取。
5. 最终回答中使用 `[ID]` 引用。

---

## 10. 独立运行与移植

模块所需文件：

```
kb-module/
  bin/           CLI + MCP server
  lib/           构建、解析、检索、HTTP
  schema/        JSON Schema
  config/        kb.config.json
  inputs/        taxonomy.md + curated.json + transcripts/ + source-map.json
  agent/         MCP/OpenAI 配置与系统提示
  package.json
  README.md
```

移植步骤：

1. 复制整个 `kb-module/` 到目标机器。
2. 确保 Node.js >= 18。
3. `node bin/kb.mjs build`。
4. `node bin/kb.mjs verify`。
5. 配置 MCP 或 HTTP。

无 npm 依赖、无数据库、无网络请求（构建时只读本地文件）。`dist/` 可以随模块一起复制，接收方甚至可以不重新构建。

### 数据更新流程

1. 更新 `inputs/taxonomy.md` 或 `inputs/curated.json`（或 `source-map.json`）。
2. `node bin/kb.mjs build`。
3. `node bin/kb.mjs verify`。
4. 如果 Agent 使用 MCP，重启 MCP 进程（或在客户端重连）以加载新索引。

`manifest.json` 中有每个输入文件的 SHA-256，可用于判断产物是否过期。

---

## 11. 存储与版本

- 格式：JSON + JSONL，UTF-8；无二进制数据库。
- 索引：运行时在内存构建，构建产物只保存分块元数据（`index.meta.json`），因此搬运简单、可 diff。
- 版本：
  - `manifest.schemaVersion`：产物结构版本。
  - `module.version`：知识库模块版本。
  - `manifest.builtAt`、`sourceHashes`：构建时间与来源快照。
- `dist/` 是生成物，不要手改；输入在 `inputs/`，构建逻辑在 `lib/`。

当前规模（构建示例）：1205 个条目、144 个精编文档、1356 个分块、7 个来源文件；索引构建约 200ms。

---

## 12. 测试

```bash
npm test
```

测试覆盖：

- 独立构建与产物加载。
- 英文/中文检索、族优先排序、查询扩展、BPM/大族/类型过滤。
- 条目详情、上下文拼装与引用。
- CLI JSON 输出。
- MCP 初始化、工具列表、工具调用。
- HTTP 健康检查与检索。

---

## 13. 已知限制

- 词法检索不是语义检索：同义词、跨语言表达需要查询扩展；当前只内置了少量扩展（七组、bass、drum、结构）。
- 中文分词采用单字+双字+短 full-run，不是词典分词；对超短查询可能召回偏宽。
- BPM 只覆盖原分类库明确写出数字的 134 条；不要用 BPM 筛选判断“有没有这个风格”。
- 原分类库有 90 条待完善/交叉引用、72 组同名条目；详情页/返回结果中的 `family` 与 `path` 用于消歧。
- 转写资料默认不进检索；开启 `includeTranscripts` 会引入 ASR 噪声。
- 例曲只是文字索引，不提供音频；版权归原作者。
- HTTP API 无鉴权，默认只监听 localhost。

---

## 14. 来源与许可

输入来源与许可见 `inputs/source-map.json` 和构建后的 `sources.json`。这是二次整理模块，不是原始文档/视频的替代品；公开分发或商用前请确认原始资料授权。

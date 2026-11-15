# 冷启动发帖稿

原则：先给价值，再提付费版；每个社区只发一次，按各自规则来；所有帖子明确说明「源码免费，便携版收费」。

## 发布顺序（两周）

| 天 | 动作 | 目的 |
|---|---|---|
| D1 | GitHub 发 v0.1.2 release，README 加漏斗，Gumroad 上架 | 让所有链接有落点 |
| D2 | r/beatmatch + V2EX 分享创造 | 第一批真实用户反馈 |
| D3 | Show HN（周二到周四，美东 8–10 点） | 国际曝光，GitHub star |
| D4 | 小红书 / B站 发 48 秒片 | 中文流量，主页简介导入站点 |
| D5 | 少数派 Matrix 投稿 | 长尾搜索 |
| D8 | 汇总反馈，修一个最痛的问题，发 changelog | 二次曝光理由 |

## Reddit（r/beatmatch / r/Rekordbox）

先看版规：有的子版只允许每周固定 promo 帖，违反会被删。优先发 r/beatmatch 的 tool 帖；r/DJs 走每周自荐帖。

**Title**

I built an offline set planner that reads your Rekordbox library (free/open source, optional prebuilt Windows bundle)

**Body**

I've been mixing as a hobby for a few years and kept running into the same problem: I can plan a set in my head, but checking whether two tracks actually work together means loading them, beatmatching, and guessing where the phrases line up.

So I built a local tool that does the boring part:

- reads a Rekordbox 7 library (or any folder of audio files)
- analyzes BPM, key, 8-bar phrases, drops, energy and vocals
- plans a set with a compatibility graph + beam search, one target BPM, an energy curve
- separates stems with Demucs and renders the transitions (long blend, bass swap, filter out, hard cut, double drop)
- writes a mix + JSON report + a normal Rekordbox playlist (backs up the DB first)

It's not a live controller tool — it renders files offline.

Source is MIT and free: https://github.com/yeheheheh/rekordbox-automix
48-second demo: https://github.com/yeheheheh/rekordbox-automix (video link in README)

I also made a portable Windows build because the #1 blocker for friends was installing PyTorch/CUDA. That one is paid ($19 launch) and funds the project. The free source install still works exactly the same — no features are held back.

I'd especially love feedback on:
- transitions that sound wrong or unnatural
- the risk score (it decides when to avoid a double drop)
- Rekordbox export behavior on a copy of your DB

If you try it on your own library, tell me what breaks. I'll fix what I can.

## Hacker News (Show HN)

**Title**

Show HN: Offline DJ set planner and stem-based automix with a Rekordbox bridge

**Body**

I built a local pipeline that turns a folder of tracks (or a Rekordbox 7 library) into a planned set and a rendered mix.

Pipeline: decode → beat/downbeat grid → key detection → 8-bar phrase segmentation → drop/build detection → energy and vocal density → compatibility graph + beam search → transition planning → Demucs stem separation → rubberband time-stretch → per-stem gain/EQ automation → limiter and −14 LUFS normalization.

A few implementation details that were interesting:

- Phrase alignment is the whole game. The planner only starts transitions on 8-bar boundaries and checks the drop windows on both tracks before allowing a double drop.
- The transition risk score combines tempo/key/vocal/energy compatibility; double drop is skipped when the score is too high or when the incoming track has vocals right after the drop.
- Rekordbox has no plugin SDK, so the bridge reads `master.db` directly and writes a normal playlist after backing up the DB. It refuses to write while Rekordbox is running.
- The whole thing exposes CLI, FastAPI and MCP stdio adapters over the same service layer.

Source (MIT): https://github.com/yeheheheh/rekordbox-automix

There is also a paid portable Windows bundle (pre-installed PyTorch/CUDA + model) that funds development. The source path is unchanged and free.

Happy to answer questions about the DSP/planning parts.

## V2EX（分享创造）

**标题**

分享创造：给自己写了一个离线自动接歌引擎，支持 Rekordbox 7

**正文**

做这个的起点很朴素：歌单越存越多，但真要排一个 8 分钟的 set，还是得一首首试。于是把「分析 → 排 set → 规划过渡 → 分轨渲染」串成了一条本地流水线。

- 分析：BPM、调性、拍网格、8 小节乐句、Drop/Build、能量、人声
- 排 set：兼容性图 + 束搜索，统一 target BPM，按能量曲线选曲
- 过渡：长混音 / 低频交换 / 滤波退出 / 硬切 / 双 Drop，按风险分决定用哪种
- 渲染：Demucs 四轨 + rubberband 逐拍变速 + 分轨增益/EQ + 限幅 + −14 LUFS
- 出口：Rekordbox 7 播放列表（写前备份）或 rekordbox.xml
- 入口：CLI / 本地 FastAPI / MCP

源码 MIT，免费：https://github.com/yeheheheh/rekordbox-automix

另外做了一个 Windows 便携版（免装 Python/CUDA，模型和依赖都打包好），收费 $19 起，用来养这个项目。源码路径功能完全一样，没有藏功能。

想听两类反馈：一是过渡听起来不自然的地方，二是 Rekordbox 写库在 DB 副本上的表现。

## 小红书 / B站

直接用 `films/electronic-field-notes/distribution-copy.md` 里的文案和 48 秒片。补充两点：

- 主页简介放新域名，不要放裸 IP。
- 评论区置顶加一句：「想要免安装的 Windows 便携版可以私信，源码在 GitHub 免费。」

## 即刻 / 朋友圈（短版）

给自己写了一个离线自动接歌引擎：读 Rekordbox 曲库，分析 BPM/调性/乐句/Drop，排 set，用 Demucs 分轨渲染过渡。源码 MIT 免费，另做了个免装 Python/CUDA 的 Windows 便携版养项目。48 秒演示：<链接>

## 回复模板

**「为什么收费？」**

源码是 MIT，免费路径一直可用。便携版卖的是把 PyTorch/CUDA/模型都装好、解压即用的时间，以及后续支持。没有功能阉割。

**「能接 Serato / Traktor 吗？」**

目前只做了 Rekordbox 7 的桥接。引擎本身吃本地音频，其他软件可以先导出 XML/文件夹再用。

**「音质怎么样？」**

分轨用 htdemucs，变速用 rubberband，输出 −14 LUFS。会有分轨伪影，尤其是人声密集的曲子；这是流程的取舍，不是无损编辑。

## 不要做的事

- 不要在同一周往多个 subreddit 复制粘贴同一段话。
- 不要在别人求推荐的帖子里硬塞链接。
- 不要承诺「实时接歌」「支持流媒体」「三天学会」。
- 不要拿别人的曲库或未授权音频做演示。

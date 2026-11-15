# Gumroad 上架文案

> 价格：$29，首发用折扣码 `LAUNCH` 打到 $19。Gumroad 抽 10% + $0.50。
> 文件：`dj-engine/packaging/dist/电音档案-Automix-portable-v0.1.2.zip`（3.6 GB，Gumroad 单文件上限 20 GB）。

## 标题

Automix Portable — offline DJ set planner for Rekordbox (Windows)

## 副标题 / 一句话

Plan a set, align phrases, and render stem-based transitions on your own machine. No Python, no CUDA setup, no cloud upload.

## 封面

先用 `films/electronic-field-notes/cover-4x3.jpg`，上架后再做一张带产品名的封面。

## 描述（可直接粘贴）

**Your library stays on your machine.**

Automix Portable is a one-click Windows build of the open-source djcore engine. It reads your Rekordbox 7 library (or any local folder), analyzes BPM / key / phrases / drops / energy, plans a set, and renders the transitions with Demucs stems — all offline.

No Python. No CUDA setup. No uploading your tracks to a server.

### What it does

- **Set planning** — compatibility graph + beam search, one target BPM, energy curve across the set.
- **Phrase-aligned transitions** — long blend, bass swap, filter out, hard cut, double drop.
- **Stem-based rendering** — vocals / drums / bass / other separated with Demucs, automated per transition, limited and normalized to −14 LUFS.
- **Rekordbox 7 bridge** — reads `master.db`, writes a normal playlist or `rekordbox.xml`. Backs up the database first and refuses to write while Rekordbox is running.
- **Three transition profiles** — `sparse` (32-bar blends, no double drop), `normal` (engine default), `dense` (short transitions, bass swaps first).
- **Local API, CLI and MCP** — automate it or wire it into an agent.
- **Bundled learning site** — the full 电音档案 site: 92 styles, 1,376 entries, 22 production lessons, offline.

### What you get

- Portable Windows x64 build (~3.6 GB zip). Unzip, double-click `start.bat`, browser opens the console.
- PyTorch 2.9 + CUDA 12.8, Demucs `htdemucs` model, rubberband and ffmpeg bundled.
- Free updates for all v0.x releases.
- The engine source is MIT-licensed and stays free on GitHub: https://github.com/yeheheheh/rekordbox-automix

### Requirements

- Windows 10/11 x64
- 8 GB RAM minimum, 16 GB recommended
- ~6 GB free disk after unzip
- NVIDIA GPU optional. With a CUDA 12.8 driver, stem separation is much faster; without one it falls back to CPU.

### What it does not do

- It is not a live controller / DVS tool. It renders files, it does not perform in real time.
- It does not download music or connect to Spotify / Apple Music / Beatport.
- It does not include any copyrighted tracks. You bring your own library.
- It is not affiliated with AlphaTheta / Pioneer DJ / Rekordbox. The bridge is an external tool that writes a backed-up copy of the database.

### Who it is for

- DJs who want a first draft of a set and a rendered mix to check transitions.
- Rekordbox users who want phrase-aligned automix without a subscription.
- Producers who want to hear stem-level transitions on their own tracks.

### FAQ

**Is this a subscription?**
No. One-time purchase, free updates for v0.x.

**Why is the download so large?**
PyTorch with CUDA and the Demucs model are bundled so it works offline on a clean Windows machine. The source-only install is free if you prefer to manage Python yourself.

**Can I try it first?**
Yes. The engine is MIT and free. The site has a browser demo of the console. The paid build is the convenience package: pre-installed runtime, model, presets and support.

**Refunds?**
14 days, no questions asked. Email me your order ID.

**Does it work with Rekordbox 6?**
The bridge targets Rekordbox 7. It will try the RB6 database path, but only RB7 has been tested. Writing to a copy first is recommended.

**Does it upload my music anywhere?**
No. Everything runs on `127.0.0.1`. The only network access is the optional first-run model download if you use the source install; the portable build ships the model.

## Tags

dj, rekordbox, automix, electronic music, music production, offline, windows, stems, demucs

## 截图顺序

1. `films/electronic-field-notes/assets/automix.png` — 过渡详情 + 分轨自动化曲线
2. 控制台总览：左侧曲库 / 右侧 set 计划（需新截）
3. Rekordbox 导出面板（需新截）
4. `films/electronic-field-notes/assets/home.png` — 随包学习站
5. `start.bat` 双击后的浏览器窗口（可选）

## 中文版（爱发电 / 闲鱼备用）

**电音档案 · Automix 便携版**

解压即用，不用装 Python、不用配 CUDA。本地分析 BPM / 调性 / 乐句 / Drop，排 set，用 Demucs 分轨渲染过渡，支持 Rekordbox 7 曲库与播放列表导出。

包含：便携运行时 + Demucs 模型 + rubberband + ffmpeg + 3 套过渡预设 + 随包学习站。源码 MIT 免费，便携版卖的是省事和离线。

¥99 / 首发 ¥69。14 天无理由。

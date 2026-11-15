# 公开仓库 README 漏斗改造

把下面这段插到 `yeheheheh/rekordbox-automix` 的 README 顶部（标题之后、简介之前），然后把 `<GUMROAD_URL>` 换成实际链接。

## 插入内容

```md
> **不想装 Python / CUDA？** 有打包好的 Windows 便携版：解压、双击、浏览器打开。
> [便携版 →](<GUMROAD_URL>) · 源码仍然 MIT 免费，功能一致。

## 免费源码 / 付费便携版

这个仓库是 MIT 源码，自己装环境完全免费。便携版卖的是省事，不是功能：

| | 源码（本仓库） | 便携版（Gumroad） |
|---|---|---|
| 价格 | 免费 | $29，首发 $19 |
| 安装 | Python 3.12 + PyTorch + Demucs | 解压，双击 `start.bat` |
| 体积 | 约 100 KB | 约 3.6 GB（含 CUDA 运行时、Demucs 模型、ffmpeg、rubberband） |
| 功能 | 全部 | 全部，另含一键启动器和随包学习站 |
| 更新 | `git pull` | v0.x 免费更新 |

[便携版下载 →](<GUMROAD_URL>)

功能没有阉割。如果你已经有 Python 环境，继续用源码就好。
```

## 同步修改的位置

1. 顶部现有「**一键安装包：** [GitHub Releases](...)]」改成「**源码安装：** [GitHub Releases](...) / `install.bat`」。
2. 文末加一行：

```md
## 支持这个项目

- 源码免费，Star 就是最大的支持。
- 不想折腾环境：买[便携版](<GUMROAD_URL>)。
- 或者 [GitHub Sponsors](<SPONSORS_URL>)。
```

## 发布 release

Tag：`v0.1.2`

Release 标题：`v0.1.2 — portable build + transition profiles`

Release 说明：

```md
## 新增

- 三套过渡密度预设：`sparse`（32 小节长混音 / 不排 double drop）、`normal`（默认）、`dense`（短过渡 / 优先低频交换）。
  CLI：`--density sparse|normal|dense`；API：`density` 字段。
- 桌面启动器 `djcore.adapters.desktop`：启动 API 后自动打开控制台。
- API 可选同源托管静态站：设置 `DJ_SITE_DIR` 即可在 `127.0.0.1:5601` 直接打开完整站点。
- `packaging/build-portable.mjs`：Windows 便携包构建脚本（Python 运行时 + 依赖 + 模型 + 站点 + 一键启动）。

## 验证

- 19 项 pytest 全通过。
- 便携包在 RTX 5070 Ti / cu128 下完成 4 首 fixture 的分轨、排 set、渲染，输出 259 秒 mix。

## 便携版

不想装环境可以用打包好的 Windows 便携版：<GUMROAD_URL>
源码功能一致，MIT 不变。
```

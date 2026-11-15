#!/usr/bin/env node
/**
 * 下载 Ishkur 介绍页里引用的图片，落到 assets/ishkur/。
 *
 * 只下正文配图，跳过 UI 图标（uc/icon/divider/closex/loader 等）。
 * 已存在的文件跳过，可反复运行。
 *
 * 输出 .workbuddy/ishkur-images.json：图片 → 被哪些风格引用
 *
 * 用法：node scripts/fetch-ishkur-images.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, '.workbuddy', 'ishkur-raw');
const DEST = path.join(ROOT, 'assets', 'ishkur');
const OUT = path.join(ROOT, '.workbuddy', 'ishkur-images.json');

const BASE = 'https://music.ishkur.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// UI 图标，不是正文配图
const UI_ICON = /^images\/(uc|icon|divider|closex|loader|carrot|spinner|social|close|arrow|bg)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 从 content HTML 里挑出正文配图 */
function imagesIn(html) {
  const box = html.match(/<div class="contentbox">([\s\S]*)$/);
  const scope = box ? box[1] : html;
  const out = [];
  const re = /<img[^>]*src="(images\/[^"]+)"/g;
  let m;
  while ((m = re.exec(scope))) {
    const src = m[1];
    if (UI_ICON.test(src)) continue;
    if (!out.includes(src)) out.push(src);
  }
  return out;
}

async function download(src, tries = 3) {
  const name = path.basename(src);
  const dest = path.join(DEST, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return { name, skipped: true, bytes: fs.statSync(dest).size };

  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + src, {
        headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8', Referer: BASE },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) throw new Error(`文件过小 ${buf.length}B`);
      fs.writeFileSync(dest, buf);
      return { name, skipped: false, bytes: buf.length };
    } catch (err) {
      lastErr = err;
      await sleep(1000 * (i + 1));
    }
  }
  return { name, error: lastErr.message };
}

async function main() {
  fs.mkdirSync(DEST, { recursive: true });

  const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.content.html'));
  const usage = new Map(); // 图片 → 引用它的 slug 列表
  const all = new Set();

  for (const f of files) {
    const slug = f.replace('.content.html', '');
    const html = fs.readFileSync(path.join(RAW, f), 'utf8');
    for (const src of imagesIn(html)) {
      all.add(src);
      if (!usage.has(src)) usage.set(src, []);
      usage.get(src).push(slug);
    }
  }

  console.log(`待下载图片：${all.size} 张（来自 ${files.length} 篇介绍）`);

  let ok = 0;
  let skip = 0;
  const failed = [];
  let i = 0;
  for (const src of all) {
    i++;
    const r = await download(src);
    if (r.error) {
      failed.push({ src, error: r.error });
      console.log(`[${i}/${all.size}] ✗ ${r.name}  ${r.error}`);
    } else if (r.skipped) {
      skip++;
    } else {
      ok++;
      if (i % 20 === 0 || i === all.size) console.log(`[${i}/${all.size}] 已下载 ${ok} · 跳过 ${skip}`);
    }
    if (!r.skipped) await sleep(280);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: all.size,
    downloaded: ok,
    skipped: skip,
    failed,
    usage: Object.fromEntries([...usage].map(([k, v]) => [path.basename(k), [...new Set(v)]])),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

  console.log('');
  console.log(`完成：新下载 ${ok} · 已存在 ${skip} · 失败 ${failed.length}`);
  if (failed.length) failed.forEach((f) => console.log(`  ✗ ${f.src}  ${f.error}`));
  console.log(`图片目录：${path.relative(ROOT, DEST)}`);
  console.log(`清单：${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

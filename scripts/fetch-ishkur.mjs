#!/usr/bin/env node
/**
 * 抓取 Ishkur's Guide to Electronic Music 的风格资源。
 *
 * 三份产物，都落在 .workbuddy/ishkur-raw/：
 *   <slug>.musicbox.html  —— 例曲列表（<source src> 带年份/艺人/曲名）
 *   <slug>.content.html   —— 介绍文案与图片
 *   fetch-report.json     —— 逐条的校验结果（回显名是否与预期一致）
 *
 * 关键：musicbox.php 只认地图坐标，不认风格名。坐标从 main.js 的 switch 里
 * 解析出来，但坐标与风格的对应关系并不总是可靠 —— 所以每抓一条都读回
 * <div id='showgenre'> 的回显名，与预期名归一化比对，不一致就记进报告，
 * 绝不静默挂到错的风格上。
 *
 * 用法：
 *   node scripts/fetch-ishkur.mjs            # 抓全部
 *   node scripts/fetch-ishkur.mjs --only=acid-house,techno
 *   node scripts/fetch-ishkur.mjs --resume   # 跳过已存在且非空的产物
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, '.workbuddy', 'ishkur-raw');
const GENRES = path.join(ROOT, '.workbuddy', 'ishkur-genres.json');
const REPORT = path.join(ROOT, '.workbuddy', 'fetch-report.json');

const BASE = 'https://music.ishkur.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',').map((s) => s.trim()) : null;
const RESUME = args.includes('--resume');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 归一化：去掉大小写、标点、空格差异，用于名称比对 */
const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

async function fetchText(url, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

/** 从 musicbox HTML 里读回显的风格名 */
function readShowGenre(html) {
  const m = html.match(/id='showgenre'>([^<]*)/);
  return m ? m[1].trim() : '';
}

/** 从 musicbox HTML 里解析例曲：文件名形如 "Acid House - (1987) Phuture - Acid Tracks.mp3" */
function parseTracks(html, genreName) {
  const out = [];
  const re = /<source src='([^']+)' type='audio\/mpeg' title="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    const title = m[2];
    // 个别曲目名里有残缺的百分号转义（如 "%27" 被截断），decode 会抛错，
    // 这里退化成原文，不能让一条坏数据打断整批抓取。
    let file;
    try {
      file = decodeURIComponent(src.replace(/^music\//, ''));
    } catch {
      file = src.replace(/^music\//, '');
    }
    // 年份：文件名里的 (1987)
    const ym = file.match(/\((\d{4})\)/);
    const year = ym ? Number(ym[1]) : null;
    // 艺人 / 曲名：优先用 title（它已经清理过引号），否则从文件名切
    let artist = '';
    let song = '';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      song = parts.slice(1).join(' - ').trim();
    } else {
      const stripped = file.replace(/^.*?\(\d{4}\)\s*/, '').replace(/\.mp3$/, '');
      const parts = stripped.split(' - ');
      artist = (parts[0] || '').trim();
      song = parts.slice(1).join(' - ').trim() || stripped;
    }
    out.push({ artist, song, year, file, src, title });
  }
  return out;
}

/** 从 content HTML 里解析介绍段落与图片 */
function parseContent(html) {
  const box = html.match(/<div class="contentbox">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/);
  const scope = box ? box[1] : html;

  // 段落：<p>...</p>，保留内部 <a> 的文本
  const paras = [];
  const reP = /<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = reP.exec(scope))) {
    const text = m[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&rsquo;|&apos;/g, "'")
      .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) paras.push(text);
  }

  // 图片：<div class="image"><img class="img" src="images/xxx.png"><br>caption</div>
  const images = [];
  const reImg = /<div class="image">\s*<img[^>]*src="([^"]+)"[^>]*>(?:\s*<br>([\s\S]*?))?<\/div>/g;
  while ((m = reImg.exec(scope))) {
    const caption = (m[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    images.push({ src: m[1], caption });
  }
  // 正文里其它裸图（非社交图标）
  const reImg2 = /<img[^>]*src="(images\/[^"]+)"[^>]*>/g;
  while ((m = reImg2.exec(scope))) {
    if (!images.some((i) => i.src === m[1])) images.push({ src: m[1], caption: '' });
  }

  // 外部链接（Discogs / YouTube 等），保留来源
  const links = [];
  const reA = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = reA.exec(scope))) {
    const label = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (label) links.push({ url: m[1], label });
  }

  return { paras, images, links };
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const genres = JSON.parse(fs.readFileSync(GENRES, 'utf8'));
  const list = ONLY ? genres.filter((g) => ONLY.includes(g.slug)) : genres;

  const report = { fetchedAt: new Date().toISOString(), total: list.length, rows: [] };
  let i = 0;

  for (const g of list) {
    i++;
    const mbFile = path.join(RAW, `${g.slug}.musicbox.html`);
    const ctFile = path.join(RAW, `${g.slug}.content.html`);
    const tag = `[${String(i).padStart(3)}/${list.length}] ${g.name}`;

    // 例曲
    let mbHtml = '';
    if (RESUME && fs.existsSync(mbFile) && fs.statSync(mbFile).size > 2000) {
      mbHtml = fs.readFileSync(mbFile, 'utf8');
    } else {
      try {
        mbHtml = await fetchText(`${BASE}/musicbox.php?x=${g.lon}&y=${g.lat}&match=genre`);
        fs.writeFileSync(mbFile, mbHtml);
      } catch (err) {
        console.log(`${tag}  例曲抓取失败：${err.message}`);
        report.rows.push({ ...g, ok: false, error: `musicbox: ${err.message}` });
        continue;
      }
      await sleep(700);
    }

    const echoed = readShowGenre(mbHtml);
    const tracks = parseTracks(mbHtml, g.name);
    const nameOk = norm(echoed) === norm(g.name);

    // 介绍
    let ctHtml = '';
    let content = { paras: [], images: [], links: [] };
    if (RESUME && fs.existsSync(ctFile) && fs.statSync(ctFile).size > 2000) {
      ctHtml = fs.readFileSync(ctFile, 'utf8');
      content = parseContent(ctHtml);
    } else {
      try {
        ctHtml = await fetchText(`${BASE}/content.php?g=${encodeURIComponent(echoed || g.name)}`);
        fs.writeFileSync(ctFile, ctHtml);
        content = parseContent(ctHtml);
      } catch (err) {
        console.log(`${tag}  介绍抓取失败：${err.message}`);
      }
      await sleep(700);
    }

    const row = {
      slug: g.slug,
      name: g.name,
      scene: g.scene,
      emerged: g.emerged,
      aka: g.aka,
      lon: g.lon,
      lat: g.lat,
      echoed,
      nameOk,
      trackCount: tracks.length,
      paraCount: content.paras.length,
      imageCount: content.images.length,
      ok: nameOk && tracks.length > 0 && content.paras.length > 0,
    };
    report.rows.push(row);

    const flag = row.ok ? 'OK ' : '⚠  ';
    const warn = nameOk ? '' : `  回显=${echoed}`;
    console.log(`${flag}${tag}  例曲 ${tracks.length} · 段 ${content.paras.length} · 图 ${content.images.length}${warn}`);
  }

  const okCount = report.rows.filter((r) => r.ok).length;
  const nameBad = report.rows.filter((r) => r.nameOk === false);
  report.summary = {
    total: report.rows.length,
    ok: okCount,
    nameMismatch: nameBad.length,
    noTracks: report.rows.filter((r) => r.trackCount === 0).length,
    noContent: report.rows.filter((r) => r.paraCount === 0).length,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));

  console.log('');
  console.log(`完成：${okCount}/${report.rows.length} 条完整`);
  console.log(`回显名不一致：${nameBad.length}${nameBad.length ? ' → ' + nameBad.map((r) => `${r.name}(得${r.echoed})`).join(' | ') : ''}`);
  console.log(`无例曲：${report.summary.noTracks} · 无文案：${report.summary.noContent}`);
  console.log(`报告：${path.relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * 把抓取结果 + 译文合成 data/ishkur.js（站点运行时数据）。
 *
 * 输入：
 *   .workbuddy/ishkur-extract.json   原文、例曲、图片、映射（由 extract-ishkur-content.mjs 产出）
 *   .workbuddy/ishkur-zh/batch-*.json 译文（人工翻译，按批分文件）
 *   .workbuddy/ishkur-images.json     已下载图片清单
 *
 * 输出：data/ishkur.js —— 挂到 window.ISHKUR
 *
 * 设计取舍：
 *   - 译文缺的段落留空字符串，前端据此显示「译文待补」而不是显示英文，
 *     免得中英混排看着像半成品；英文原文始终保留在 en 字段里可回查。
 *   - 一个树节点可能被多个 Ishkur 风格指向（如 Progressive Trance 对应
 *     McProg / 8th Note Prog），合并成该节点下的多个 source。
 *
 * 用法：node scripts/build-ishkur.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTRACT = path.join(ROOT, '.workbuddy', 'ishkur-extract.json');
const ZH_DIR = path.join(ROOT, '.workbuddy', 'ishkur-zh');
const IMG_JSON = path.join(ROOT, '.workbuddy', 'ishkur-images.json');
const OUT = path.join(ROOT, 'data', 'ishkur.js');

function loadTranslations() {
  if (!fs.existsSync(ZH_DIR)) return new Map();
  const files = fs.readdirSync(ZH_DIR).filter((f) => /^batch-\d+\.json$/.test(f)).sort();
  const map = new Map();
  const dupes = [];
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(ZH_DIR, f), 'utf8'));
    for (const [slug, entry] of Object.entries(data.genres || {})) {
      if (map.has(slug)) dupes.push(`${slug} 在 ${f} 里重复出现`);
      map.set(slug, entry);
    }
  }
  if (dupes.length) {
    console.log('警告：译文重复定义');
    dupes.forEach((d) => console.log('  ' + d));
  }
  return map;
}

function main() {
  const extract = JSON.parse(fs.readFileSync(EXTRACT, 'utf8'));
  const zh = loadTranslations();
  const images = fs.existsSync(IMG_JSON) ? JSON.parse(fs.readFileSync(IMG_JSON, 'utf8')) : { usage: {} };

  // 只保留真正下载成功的图片名，避免前端引用到不存在的文件
  const imgDir = path.join(ROOT, 'assets', 'ishkur');
  const available = new Set(fs.existsSync(imgDir) ? fs.readdirSync(imgDir) : []);

  const genres = [];
  const byNode = new Map(); // nodeKey → { node 信息, sources: [] }
  let paraTotal = 0;
  let paraTranslated = 0;
  let trackTotal = 0;
  const missingZh = [];

  for (const g of extract.genres) {
    const t = zh.get(g.slug) || null;
    const paras = g.paras.map((p, i) => {
      const z = t && Array.isArray(t.paras) ? t.paras[i] : '';
      const out = { en: p.en, zh: String(z || '').trim() };
      if (out.zh) paraTranslated++;
      return out;
    });
    paraTotal += paras.length;

    const hasZh = paras.some((p) => p.zh);
    if (!hasZh) missingZh.push(g.name);

    // 配图：只留已下载成功的
    const imgs = g.images
      .filter((im) => available.has(im.file))
      .map((im) => ({ file: im.file, caption: im.caption || '' }));

    const tracks = g.tracks.map((tr) => ({
      artist: tr.artist,
      song: tr.song,
      year: tr.year,
    }));
    trackTotal += tracks.length;

    const entry = {
      slug: g.slug,
      name: g.name,
      zh: (t && t.zh) || '',
      scene: g.scene,
      emerged: g.emerged,
      aka: g.aka,
      paras,
      tracks,
      images: imgs,
      links: g.links.map((l) => ({ url: l.url, label: l.label })),
      translated: hasZh,
    };
    genres.push(entry);

    if (g.nodeKey) {
      if (!byNode.has(g.nodeKey)) {
        byNode.set(g.nodeKey, {
          nodeKey: g.nodeKey,
          nodeId: g.nodeId,
          nodeName: g.nodeName,
          familyName: g.familyName,
          familyZh: g.familyZh,
          sources: [],
        });
      }
      byNode.get(g.nodeKey).sources.push(g.slug);
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Ishkur\u2019s Guide to Electronic Music',
      url: 'https://music.ishkur.com/',
      note: '介绍文案、例曲清单与配图取自该站，译文由本项目整理。',
    },
    counts: {
      genres: genres.length,
      translated: genres.filter((g) => g.translated).length,
      paras: paraTotal,
      parasTranslated: paraTranslated,
      tracks: trackTotal,
      nodes: byNode.size,
    },
    genres,
    byNode: Object.fromEntries(byNode),
  };

  const js = `/* ==========================================================================
   Ishkur 资料层 / ISHKUR REFERENCE  —— 生成物，请勿手改

   由 scripts/build-ishkur.mjs 合成。重新生成：node scripts/build-ishkur.mjs
   数据源：Ishkur's Guide to Electronic Music (https://music.ishkur.com/)
     · 抓取：scripts/fetch-ishkur.mjs
     · 抽取：scripts/extract-ishkur-content.mjs
     · 翻译：.workbuddy/ishkur-zh/batch-*.json

   结构：
     window.ISHKUR.genres[]  每个风格：原文 + 译文 + 例曲 + 配图
     window.ISHKUR.byNode{}  树节点 key → 该节点可用的 Ishkur 资料
   ========================================================================== */
window.ISHKUR = ${JSON.stringify(payload, null, 1)};
`;
  fs.writeFileSync(OUT, js);

  console.log(`合成完成：${genres.length} 个风格 → ${path.relative(ROOT, OUT)}`);
  console.log(`  已翻译 ${payload.counts.translated}/${genres.length} 篇`);
  console.log(`  段落 ${paraTranslated}/${paraTotal} 段有译文`);
  console.log(`  例曲 ${trackTotal.toLocaleString()} 首 · 覆盖树节点 ${byNode.size} 个`);
  console.log(`  文件大小 ${(Buffer.byteLength(js) / 1024 / 1024).toFixed(2)} MB`);
  if (missingZh.length) {
    console.log('');
    console.log(`  尚无译文的 ${missingZh.length} 篇：`);
    const show = missingZh.slice(0, 20);
    console.log('    ' + show.join(' · ') + (missingZh.length > show.length ? ` …（还有 ${missingZh.length - show.length} 篇）` : ''));
  }
}

main();

#!/usr/bin/env node
/**
 * 把抓下来的 Ishkur HTML 抽成结构化的中间文件，供翻译与建库使用。
 *
 * 输入：.workbuddy/ishkur-raw/*.musicbox.html + *.content.html + .workbuddy/ishkur-map.json
 * 输出：.workbuddy/ishkur-extract.json
 *
 * 结构：
 *   {
 *     genres: [{
 *       slug, name, scene, emerged, aka,
 *       nodeKey, nodeName, familyName, familyZh,     // 映射结果
 *       tracks: [{ artist, song, year, file }],      // 例曲
 *       paras:  [{ i, en }],                         // 英文段落（按顺序）
 *       images: [{ file, caption }],                 // 配图
 *       links:  [{ url, label }],                    // 外部链接
 *     }]
 *   }
 *
 * 只做抽取与清洗，不翻译、不改写。翻译在下一步单独进行，
 * 这样原文永远可回溯，翻译质量出问题时不必重新抓取。
 *
 * 用法：node scripts/extract-ishkur-content.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, '.workbuddy', 'ishkur-raw');
const MAP = path.join(ROOT, '.workbuddy', 'ishkur-map.json');
const OUT = path.join(ROOT, '.workbuddy', 'ishkur-extract.json');

/** HTML 实体与标签清理 */
function cleanText(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function parseTracks(html) {
  const out = [];
  const re = /<source src='([^']+)' type='audio\/mpeg' title="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    const title = m[2];
    let file;
    try {
      file = decodeURIComponent(src.replace(/^music\//, ''));
    } catch {
      file = src.replace(/^music\//, '');
    }
    const ym = file.match(/\((\d{4})\)/);
    const year = ym ? Number(ym[1]) : null;
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
    out.push({ artist, song, year, file });
  }
  return out;
}

function parseContent(html) {
  const box = html.match(/<div class="contentbox">([\s\S]*)$/);
  const scope = box ? box[1] : html;

  // 正文里嵌着 <div class="image">…</div>（配图 + 说明）。说明文字不该混进
  // 段落正文 —— 它属于图，已经单独抽到 images 里了。先把整块挖掉再取段落，
  // 否则会出现「…合成器主音。这张图里是一台 Roland D-50。Spacesynth 还…」
  // 这种把图注当句子的情况。
  const textScope = scope.replace(/<div class="image">[\s\S]*?<\/div>/g, ' ');

  // 源 HTML 里有段落忘了写 </p>（如 frenchhouse：两段之间只隔空行，前一段没闭合）。
  // 不补的话正则会把两段吞成一段，译文段数对不上，原文也被揉在一起。
  // 判据：<p> 之前若不是 </p> 或正文起点，说明上一段漏了闭合，就地补一个。
  const fixedScope = textScope.replace(
    /([^\s])(\s*)<p>/g,
    (full, lastCh, gap) => (lastCh === '>' && gap.includes('\n\n') ? `${lastCh}${gap}</p><p>` : full),
  );

  const paras = [];
  const reP = /<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = reP.exec(fixedScope))) {
    const en = cleanText(m[1]);
    if (en) paras.push({ i: paras.length, en });
  }

  const images = [];
  const reImg = /<div class="image">\s*<img[^>]*src="([^"]+)"[^>]*>(?:\s*<br>([\s\S]*?))?<\/div>/g;
  while ((m = reImg.exec(scope))) {
    const caption = cleanText(m[2] || '');
    images.push({ file: path.basename(m[1]), caption });
  }

  const links = [];
  const seen = new Set();
  const reA = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  while ((m = reA.exec(scope))) {
    const url = m[1];
    const label = cleanText(m[2]);
    if (!label || seen.has(url)) continue;
    // 跳过分享按钮和站点自身的链接
    if (/twitter\.com\/intent|facebook\.com\/sharer|plus\.google|linkedin\.com\/share/i.test(url)) continue;
    seen.add(url);
    links.push({ url, label });
  }

  return { paras, images, links };
}

function main() {
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const genres = [];

  for (const r of map.rows) {
    // 抓取时文件名沿用 URL 里的原始写法，slug 里带斜杠的（如 amiga/tracker）
    // 在磁盘上是 %2f。两种都试，避免改过 slug 之后找不到产物。
    const stem = fs.existsSync(path.join(RAW, `${r.slug}.content.html`))
      ? r.slug
      : r.slug.replace(/\//g, '%2f');
    const mbFile = path.join(RAW, `${stem}.musicbox.html`);
    const ctFile = path.join(RAW, `${stem}.content.html`);
    if (!fs.existsSync(mbFile) || !fs.existsSync(ctFile)) {
      console.log(`跳过 ${r.name}（缺抓取产物）`);
      continue;
    }
    const mb = fs.readFileSync(mbFile, 'utf8');
    const ct = fs.readFileSync(ctFile, 'utf8');
    const { paras, images, links } = parseContent(ct);

    genres.push({
      slug: r.slug,
      name: r.name,
      scene: r.scene,
      emerged: r.emerged,
      aka: r.aka,
      nodeKey: r.nodeKey,
      nodeId: r.nodeId,
      nodeName: r.nodeName,
      familyName: r.familyName,
      familyZh: r.familyZh,
      via: r.via,
      tracks: parseTracks(mb),
      paras,
      images,
      links,
    });
  }

  const totalParas = genres.reduce((s, g) => s + g.paras.length, 0);
  const totalChars = genres.reduce((s, g) => s + g.paras.reduce((a, p) => a + p.en.length, 0), 0);
  const totalTracks = genres.reduce((s, g) => s + g.tracks.length, 0);
  const totalImages = genres.reduce((s, g) => s + g.images.length, 0);

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'https://music.ishkur.com/',
    counts: {
      genres: genres.length,
      paras: totalParas,
      chars: totalChars,
      tracks: totalTracks,
      images: totalImages,
    },
    genres,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

  console.log(`抽取完成：${genres.length} 个风格`);
  console.log(`  段落 ${totalParas} · 字符 ${totalChars.toLocaleString()}`);
  console.log(`  例曲 ${totalTracks.toLocaleString()} · 配图 ${totalImages}`);
  console.log(`输出：${path.relative(ROOT, OUT)}`);
  console.log('');
  console.log('各篇段落数分布:');
  const dist = {};
  for (const g of genres) {
    const k = g.paras.length;
    dist[k] = (dist[k] || 0) + 1;
  }
  const keys = Object.keys(dist).map(Number).sort((a, b) => a - b);
  console.log('  ' + keys.map((k) => `${k}段×${dist[k]}`).join(' · '));
}

main();

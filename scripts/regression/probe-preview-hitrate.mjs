// 探针：实测「清理批注 + 逐级放宽候选词」对 Apple 曲库命中率的提升。
// 对比旧策略（艺人+原始曲名 / 去括号）与新策略（清理后再拆艺人、单曲名兜底）。
// 只读，不写任何文件。
import { readFileSync } from 'node:fs';

const sandbox = { window: {} };
const load = (f) => new Function('window', readFileSync(f, 'utf8'))(sandbox.window);
load('data/kb.js');
load('data/listen.js');
const KB = sandbox.window.KB_DATA;
const L = sandbox.window.KB_LISTEN;

// 与 app.js 的 cleanForSearch / previewCandidates 保持同一套规则
function cleanForSearch(value) {
  const s = String(value || '')
    .replace(/[\u3010][^\u3011]*[\u3011]/g, ' ')
    .replace(/[\uFF08(][^\uFF09)]*[\uFF09)]/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/^[^\u2014]*\u2014\u2014/, '')
    .replace(/\s*\d{1,2}:\d{2}\s*/g, ' ')
    .replace(/[\u2122\u00AE]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || String(value || '').trim();
}
function previewCandidates(artist, title) {
  const ct = cleanForSearch(title);
  const ca = cleanForSearch(artist);
  const out = [];
  const push = (v) => { const s = String(v || '').trim(); if (s && !out.includes(s)) out.push(s); };
  push([ca, ct].filter(Boolean).join(' '));
  push(ct);
  push([artist, title].filter(Boolean).join(' ').trim());
  return out;
}
function oldCandidates(artist, title) {
  const term = [artist, title].filter(Boolean).join(' ').trim();
  const bare = String(title || '').replace(/[（(\[].*?[)）\]]/g, '').trim();
  const alt = bare && bare !== title ? [artist, bare].filter(Boolean).join(' ').trim() : '';
  return [...new Set([term, alt].filter(Boolean))];
}

const covered = Object.keys(L.entries).map((id) => KB.entries.find((e) => e.id === id)).filter(Boolean);
const withEx = covered.filter((e) => e.examples && e.examples.length);

const step = Math.max(1, Math.floor(withEx.length / 60));
const sample = withEx.filter((_, i) => i % step === 0).slice(0, 60);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const search = async (term) => {
  try {
    const r = await fetch('https://itunes.apple.com/search?term=' + encodeURIComponent(term) + '&entity=song&limit=1', { signal: AbortSignal.timeout(12000) });
    const j = await r.json();
    return Boolean(j.results && j.results[0] && j.results[0].previewUrl);
  } catch { return false; }
};

let oldHit = 0;
let newHit = 0;
const gained = [];
const stillMiss = [];

for (const e of sample) {
  const ex = e.examples[0];
  let o = false;
  for (const t of oldCandidates(ex.artist, ex.title)) {
    if (await search(t)) { o = true; break; }
    await sleep(150);
  }
  let n = false;
  let via = '';
  for (const t of previewCandidates(ex.artist, ex.title)) {
    if (await search(t)) { n = true; via = t; break; }
    await sleep(150);
  }
  if (o) oldHit += 1;
  if (n) newHit += 1;
  if (n && !o) gained.push(e.name + ' → 「' + via.slice(0, 46) + '」');
  if (!n) stillMiss.push(e.name + ' — ' + [ex.artist, ex.title].filter(Boolean).join(' ').slice(0, 46));
  await sleep(150);
}

console.log('样本 ' + sample.length + ' 条');
console.log('旧策略命中 ' + oldHit + '  (' + (oldHit / sample.length * 100).toFixed(0) + '%)');
console.log('新策略命中 ' + newHit + '  (' + (newHit / sample.length * 100).toFixed(0) + '%)');
console.log('');
console.log('=== 新策略救回来的 ' + gained.length + ' 条 ===');
gained.forEach((g) => console.log('  ' + g));
console.log('');
console.log('=== 两版都搜不到的 ' + stillMiss.length + ' 条 ===');
stillMiss.forEach((m) => console.log('  ' + m));

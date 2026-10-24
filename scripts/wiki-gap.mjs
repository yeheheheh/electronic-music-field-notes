// 对比 electronicmusic.fandom.com 的分类体系与本地 taxonomy.md，输出缺口清单。
// 用法：node scripts/wiki-gap.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIKI_GENRES } from './wiki-genres.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kb = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'kb.json'), 'utf8'));

// 归一化：小写、去符号、统一 and/&、去空格
function norm(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

const localNames = new Set();
for (const entry of kb.entries) {
  localNames.add(norm(entry.name));
  for (const alias of entry.aliases || []) localNames.add(norm(alias));
}
// 大族名也算覆盖
for (const family of kb.families) {
  localNames.add(norm(family.name));
  if (family.zh) localNames.add(norm(family.zh));
}

let totalMissing = 0;
const report = [];
for (const [group, genres] of Object.entries(WIKI_GENRES)) {
  const missing = genres.filter((name) => !localNames.has(norm(name)));
  const present = genres.filter((name) => localNames.has(norm(name)));
  report.push({ group, total: genres.length, missing, present });
  totalMissing += missing.length;
}

console.log(`Wiki 分组数：${report.length}；Wiki 条目名总数：${report.reduce((n, r) => n + r.total, 0)}`);
console.log(`本地条目：${kb.entries.length}；本地大族：${kb.families.length}`);
console.log(`本地未覆盖的名称：${totalMissing}\n`);
for (const row of report.sort((a, b) => b.missing.length - a.missing.length)) {
  const rate = (((row.total - row.missing.length) / row.total) * 100).toFixed(0);
  console.log(`[${row.group}] 覆盖 ${row.total - row.missing.length}/${row.total} (${rate}%)`);
  if (row.missing.length) console.log(`  缺：${row.missing.join('、')}`);
}

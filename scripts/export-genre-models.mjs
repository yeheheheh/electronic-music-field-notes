// 把站点 60 条听感风格模型导出给 dj-engine，避免两边各写一份。
// 用法：node scripts/export-genre-models.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('data/kb.js'), context);
vm.runInNewContext(read('data/listen.js'), context);

const kb = context.window.KB_DATA;
const listen = context.window.KB_LISTEN;
const byId = new Map((kb.entries || []).map((entry) => [entry.id, entry]));

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const genres = {};
for (const [entryId, model] of Object.entries(listen.entries || {})) {
  const entry = byId.get(entryId);
  if (!entry || !model.bpm) continue;
  let slug = slugify(entry.name);
  if (!slug) slug = entryId;
  if (genres[slug]) slug = `${slug}-${entryId}`;
  genres[slug] = {
    id: entryId,
    entryId,
    name: entry.name,
    bpmMin: model.bpm.min,
    bpmMax: model.bpm.max,
    band: model.band,
    groove: model.groove,
    low: model.low,
    fingerprint: model.fp || null,
  };
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'data/listen.js + data/kb.js',
  count: Object.keys(genres).length,
  genres,
};
const target = path.join(ROOT, 'dj-engine', 'data', 'genres.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`wrote ${payload.count} genres -> ${target}`);

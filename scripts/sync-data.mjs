// 从 kb-module/dist 同步产物到 data/（网页数据层）。
// 与 scripts/build-data.mjs 的区别：本脚本不重新构建，只做同步。
// 用法：node scripts/sync-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'kb-module', 'dist');
const DATA = path.join(ROOT, 'data');

fs.mkdirSync(DATA, { recursive: true });

const kb = fs.readFileSync(path.join(DIST, 'kb.json'), 'utf8');
const curated = fs.readFileSync(path.join(DIST, 'curated.json'), 'utf8');
const csv = fs.readFileSync(path.join(DIST, 'entries.csv'), 'utf8');
const web = fs.readFileSync(path.join(DIST, 'web.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));

fs.writeFileSync(path.join(DATA, 'kb.json'), kb, 'utf8');
fs.writeFileSync(path.join(DATA, 'kb.js'), `window.KB_DATA = ${kb.replace(/<\//g, '<\\/')};\n`, 'utf8');
fs.writeFileSync(path.join(DATA, 'curated.js'), `window.KB_CURATED = ${curated.trim()};\n`, 'utf8');
fs.writeFileSync(path.join(DATA, 'web.js'), web, 'utf8');
fs.writeFileSync(path.join(DATA, 'genres.csv'), csv, 'utf8');

const stats = manifest.stats || {};
console.log('网页数据已同步');
console.log(`条目 ${stats.entries} · 大族 ${stats.families} · 精编文档 ${stats.curatedDocs} · 分块 ${stats.chunks}`);

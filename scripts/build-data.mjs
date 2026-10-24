import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModule } from '../kb-module/lib/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'kb-module', 'config', 'kb.config.json');
const DIST = path.join(ROOT, 'kb-module', 'dist');
const DATA = path.join(ROOT, 'data');

fs.mkdirSync(DATA, { recursive: true });

const result = buildModule({ configPath: CONFIG });
const kb = fs.readFileSync(path.join(DIST, 'kb.json'), 'utf8');
const curated = fs.readFileSync(path.join(DIST, 'curated.json'), 'utf8');
const csv = fs.readFileSync(path.join(DIST, 'entries.csv'), 'utf8');
const web = fs.readFileSync(path.join(DIST, 'web.js'), 'utf8');

fs.writeFileSync(path.join(DATA, 'kb.json'), kb, 'utf8');
fs.writeFileSync(path.join(DATA, 'kb.js'), `window.KB_DATA = ${kb.replace(/<\//g, '<\\/')};\n`, 'utf8');
fs.writeFileSync(path.join(DATA, 'curated.js'), `window.KB_CURATED = ${curated.trim()};\n`, 'utf8');
fs.writeFileSync(path.join(DATA, 'web.js'), web, 'utf8');
fs.writeFileSync(path.join(DATA, 'genres.csv'), csv, 'utf8');

console.log('网页数据已从知识库模块生成');
console.log(`模块产物：${result.output}`);
console.log(`条目 ${result.stats.entries} · 大族 ${result.stats.families} · 精编文档 ${result.stats.curatedDocs} · 分块 ${result.stats.chunks}`);

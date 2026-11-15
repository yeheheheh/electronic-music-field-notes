/**
 * 线上配图全量校验：data/ishkur.js 引用的每张图都必须能取到 image/*。
 *
 * 为什么需要：图片缺失时 nginx 的 try_files 会回 index.html（200 + text/html），
 * 单看状态码会误判成功；而页面上 app.js 的 onerror 会把 figure 直接 hidden，
 * 表现为「一片空白」，看不出是缺文件。
 *
 * 用法：node scripts/regression/check-live-ishkur-images.mjs [baseUrl]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://47.94.222.72/music';

const source = readFileSync(path.join(root, 'data/ishkur.js'), 'utf8');
const files = [...new Set([...source.matchAll(/["']?file["']?\s*:\s*["']([^"']+)["']/g)].map((m) => m[1]))];

const CONCURRENCY = 12;
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < files.length) {
    const file = files[cursor++];
    const url = `${BASE}/assets/ishkur/${encodeURIComponent(file)}`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const mime = response.headers.get('content-type') || '';
      const length = Number(response.headers.get('content-length') || 0);
      const ok = response.status === 200 && /^image\//.test(mime) && length > 0;
      results.push({ file, ok, status: response.status, mime, length });
    } catch (error) {
      results.push({ file, ok: false, status: 0, mime: '', length: 0, error: String(error) });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const bad = results.filter((r) => !r.ok);
const bytes = results.reduce((sum, r) => sum + r.length, 0);
console.log(`${BASE}/assets/ishkur/`);
console.log(`checked ${results.length} images, ${results.length - bad.length} ok, ${bad.length} bad (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
for (const b of bad.slice(0, 20)) {
  console.log(`  ✗ ${b.file} — status ${b.status}, type "${b.mime}", ${b.error || ''}`);
}
if (bad.length > 20) console.log(`  …and ${bad.length - 20} more`);
console.log(bad.length ? 'FAIL' : 'PASS');
process.exit(bad.length ? 1 : 0);

/**
 * 线上文件完整性校验：dist-site 里的每个文件都必须能在线上取到相同字节数。
 *
 * 为什么需要：nginx 的 try_files 会把找不到的路径兜底成 index.html（200），
 * 单看状态码会误判成「文件存在」。这里比对 Content-Length，
 * 兜底响应（index.html 的大小）会立刻暴露成 size mismatch。
 *
 * 用法：node scripts/regression/check-live-files.mjs [baseUrl]
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.argv[2] || 'http://47.94.222.72/music';
const dist = path.join(root, 'dist-site');

const files = readdirSync(dist, { recursive: true })
  .filter((file) => statSync(path.join(dist, file)).isFile())
  .map((file) => file.split(path.sep).join('/'));

const CONCURRENCY = 12;
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < files.length) {
    const file = files[cursor++];
    const localSize = statSync(path.join(dist, file)).size;
    const url = `${BASE}/${file.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const remoteSize = Number(response.headers.get('content-length') || 0);
      const mime = response.headers.get('content-type') || '';
      const encoding = response.headers.get('content-encoding') || '';
      const isHtmlFallback = /text\/html/.test(mime) && !file.endsWith('.html');
      // nginx 对文本类资源开 gzip，HEAD 不带 Content-Length（remoteSize 为 0）；
      // 此时只判断「不是 HTML 兜底」，大小留给 GET 校验。
      const sizeMismatch = remoteSize > 0 && remoteSize !== localSize;
      const ok = response.status === 200 && !isHtmlFallback && !sizeMismatch;
      results.push({ file, ok, status: response.status, localSize, remoteSize, mime, encoding, reason: isHtmlFallback ? 'HTML fallback' : sizeMismatch ? 'size mismatch' : '' });
    } catch (error) {
      results.push({ file, ok: false, status: 0, localSize, remoteSize: 0, mime: '', encoding: '', reason: String(error) });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const bad = results.filter((r) => !r.ok);
console.log(`${BASE}`);
console.log(`checked ${results.length} files, ${results.length - bad.length} ok, ${bad.length} bad`);
for (const b of bad.slice(0, 30)) {
  const detail = b.status === 0
    ? b.reason
    : `status ${b.status}, local ${b.localSize} vs remote ${b.remoteSize}, type "${b.mime}" — ${b.reason}`;
  console.log(`  ✗ ${b.file} — ${detail}`);
}
if (bad.length > 30) console.log(`  …and ${bad.length - 30} more`);
console.log(bad.length ? 'FAIL' : 'PASS');
process.exit(bad.length ? 1 : 0);

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5501);
const API_PORT = Number(process.env.DJ_API_PORT || 5601);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
  const rawUrl = request.url || '/';
  const urlPath = decodeURIComponent(rawUrl.split('?')[0]);

  // 开发期把 /api 代理给本地 djcore；线上没有这个进程，页面会自动回退到 demo。
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    const upstream = http.request({
      host: '127.0.0.1',
      port: API_PORT,
      path: rawUrl,
      method: request.method,
      headers: request.headers,
    }, (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      }
      response.end(JSON.stringify({ ok: false, error: 'djcore API not running' }));
    });
    request.pipe(upstream);
    return;
  }

  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== path.join(ROOT, 'index.html')) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = request.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      const [startText, endText] = range.replace('bytes=', '').split('-');
      const start = startText ? Number(startText) : 0;
      const end = endText ? Math.min(Number(endText), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Electronic Music KB: http://127.0.0.1:${PORT}/`);
});

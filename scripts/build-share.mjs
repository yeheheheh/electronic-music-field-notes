// 分享壳页生成器：给 60 条听感风格各生成
//   g/<slug>/index.html   ← 带 og: 标签，微信/iMessage 抓这个
//   s/<slug>/index.html   ← 短链，纯跳转
//   og/<slug>.png         ← 卡片图（需要 --images，用无头 Chrome 导出）
//
// 用法：
//   node scripts/build-share.mjs --origin http://47.94.222.72 --path /music/
//   node scripts/build-share.mjs --origin https://example.com --path /music/ --images
//
// 说明：
// · 壳页不复制内容，只负责「被抓取 + 跳到唯一地址」，所以不会出现两份正文。
// · 没有任何后端依赖：g/ 和 s/ 都是普通静态目录，nginx 不用改配置。
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const ORIGIN = arg('origin', 'http://47.94.222.72').replace(/\/$/, '');

// Git Bash 会把 `/music/` 自动改写成 `D:/…/PortableGit/music/`，
// 所以这里统一洗一遍：接受 `music/`、`/music/`，也接受被改写过的绝对路径。
function normalizeBase(raw) {
  let value = String(raw || '/music/').replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(value)) {
    const tail = value.split('/').filter(Boolean).pop() || 'music';
    value = `/${tail}/`;
  }
  if (!value.startsWith('/')) value = `/${value}`;
  if (!value.endsWith('/')) value += '/';
  return value;
}

const BASE_PATH = normalizeBase(arg('base', arg('path', '/music/')));
const OUT = arg('out', 'dist-share');
const WITH_IMAGES = args.includes('--images');
const LOCAL = arg('local', 'http://127.0.0.1:5501/');

console.log(`站点前缀：${ORIGIN}${BASE_PATH}　输出：${OUT}/`);

// 读数据（与网页同一份，避免壳页和页面说法不一致）
const sandbox = { window: {} };
const run = (file) => new Function('window', readFileSync(file, 'utf8'))(sandbox.window);
run('data/kb.js');
run('data/listen.js');
const KB = sandbox.window.KB_DATA;
const LISTEN = sandbox.window.KB_LISTEN;
const entryById = new Map(KB.entries.map((entry) => [entry.id, entry]));
const familyById = new Map(KB.families.map((family) => [family.id, family]));

const slugify = (text) => String(text)
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'style';

const styles = Object.entries(LISTEN.entries).map(([id, data]) => {
  const entry = entryById.get(id);
  if (!entry) return null;
  const family = familyById.get(entry.familyId);
  return {
    id,
    slug: slugify(entry.name),
    name: entry.name,
    zh: family ? (family.zh && family.zh.length <= 9 ? `${family.name} · ${family.zh}` : family.name) : entry.familyName,
    oneLine: data.oneLine,
    bpm: Math.round((data.bpm.min + data.bpm.max) / 2),
    band: data.band,
  };
}).filter(Boolean);

if (!styles.length) {
  console.error('没有找到听感数据：先确认 data/listen.js 存在且能加载。');
  process.exit(1);
}

const pageUrl = (slug) => `${ORIGIN}${BASE_PATH}g/${slug}/`;
const imageUrl = (slug) => `${ORIGIN}${BASE_PATH}og/${slug}.png`;
const target = (id) => `${BASE_PATH}#/genre/${id}`;

const escapeHtml = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function shell(style) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(`${style.name} · ${style.bpm} BPM`)}</title>
<meta name="description" content="${escapeHtml(style.oneLine)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="电音档案 / FIELD NOTES">
<meta property="og:title" content="${escapeHtml(`${style.name} · ${style.bpm} BPM`)}">
<meta property="og:description" content="${escapeHtml(style.oneLine)}">
<meta property="og:image" content="${escapeHtml(imageUrl(style.slug))}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1440">
<meta property="og:url" content="${escapeHtml(pageUrl(style.slug))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${escapeHtml(`${ORIGIN}${BASE_PATH}#/genre/${style.id}`)}">
<script>location.replace(${JSON.stringify(target(style.id))});</script>
<style>html,body{margin:0;background:#060607;color:#f2ede3;font:15px/1.7 "Segoe UI","Microsoft YaHei",sans-serif}
main{padding:32px}strong{color:#ffb000}a{color:#2fd8ff}</style>
</head>
<body>
<main>
<strong>${escapeHtml(style.name)}</strong>
<p>${escapeHtml(style.oneLine)}</p>
<p>正在打开… 如果没有自动跳转，<a href="${escapeHtml(target(style.id))}">点这里</a>。</p>
</main>
</body>
</html>
`;
}

function shortShell(style) {
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(style.name)} · 电音档案</title>
<meta name="robots" content="noindex">
<script>location.replace(${JSON.stringify(target(style.id))});</script>
</head><body style="margin:0;background:#060607;color:#f2ede3;font:15px/1.7 sans-serif;padding:32px">
<p>正在打开 ${escapeHtml(style.name)}…</p>
</body></html>
`;
}

mkdirSync(join(OUT, 'og'), { recursive: true });
for (const style of styles) {
  const dirG = join(OUT, 'g', style.slug);
  const dirS = join(OUT, 's', style.slug);
  mkdirSync(dirG, { recursive: true });
  mkdirSync(dirS, { recursive: true });
  writeFileSync(join(dirG, 'index.html'), shell(style));
  writeFileSync(join(dirS, 'index.html'), shortShell(style));
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  origin: ORIGIN,
  basePath: BASE_PATH,
  count: styles.length,
  styles: styles.map((style) => ({ id: style.id, slug: style.slug, name: style.name })),
}, null, 2));

// 没有 --images 时也要有一张兜底图，否则 og:image 404 会让预览变灰
if (!WITH_IMAGES) {
  const first = styles[0];
  console.log(`壳页已生成：${styles.length} 组（${OUT}/g、${OUT}/s）`);
  console.log(`og:image 指向 ${imageUrl(first.slug)} 等 ${styles.length} 张图；加 --images 生成。`);
  process.exit(0);
}

/* ---------------------------------------------------------------- 出图 */

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9455;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 等浏览器 */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

const profile = mkdtempSync(join(tmpdir(), 'cdp-og-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1200,1400', 'about:blank',
], { stdio: 'ignore' });

try {
  const ws = new WebSocket(await findTarget());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`超时: ${method}`));
      }
    }, 20000);
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await send('Page.enable');
  let done = 0;
  for (const style of styles) {
    const hostParam = encodeURIComponent(`${ORIGIN.replace(/^https?:\/\//, '')}${BASE_PATH}`);
    await send('Page.navigate', { url: `${LOCAL}#/card/${style.id}?h=${hostParam}` });
    await sleep(900);
    const data = await evaluate("document.getElementById('cardPageCanvas')?.toDataURL('image/png') || ''");
    if (!data.startsWith('data:image/png')) {
      console.warn(`跳过 ${style.slug}：画布没有渲染出来`);
      continue;
    }
    writeFileSync(join(OUT, 'og', `${style.slug}.png`), Buffer.from(data.split(',')[1], 'base64'));
    done += 1;
    if (done % 10 === 0) console.log(`  已出图 ${done}/${styles.length}`);
  }
  console.log(`og 图已生成：${done}/${styles.length}，输出在 ${OUT}/og/`);
} finally {
  chrome.kill();
}

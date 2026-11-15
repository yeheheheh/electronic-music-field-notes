/**
 * 线上配图渲染实测：打开真实条目页，查 DOM 里图片是否解码成功。
 *
 * 与 check-live-ishkur-images.mjs 的区别：那个只查 URL 可达性（HTTP 层），
 * 这个查浏览器里图片是否真的显示（渲染层）—— 覆盖 onerror 隐藏、
 * 路径拼接错误、CSP 拦截等只在浏览器里才暴露的问题。
 *
 * 用法：node scripts/regression/check-live-ishkur-render.mjs
 */

import { launchChrome } from './cdp-launch.mjs';

const ORIGIN = process.env.LIVE_ORIGIN || 'http://47.94.222.72';
const PATH_PREFIX = '/music';
// 带配图的条目（nodeId 取自 data/ishkur.js 的 byNode 映射）：
// Electroclash 2 张、Synthwave 2 张、Asian Pop 4 张、Eurotrance 6 张
const TARGETS = ['g-19608', 'g-12730', 'g-18624'];

const { wsUrl, close } = await launchChrome({ allow: [new RegExp('^' + ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/')] });
const ws = new WebSocket(wsUrl);

let id = 0;
const pending = new Map();
const errors = [];
const imageResponses = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text));
  }
  if (msg.method === 'Network.responseReceived') {
    const r = msg.params.response;
    if (/assets\/ishkur\//.test(r.url)) imageResponses.push({ url: r.url, status: r.status, mime: r.mimeType });
  }
});

await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

let failures = 0;

for (const nodeId of TARGETS) {
  imageResponses.length = 0;
  const url = `${ORIGIN}${PATH_PREFIX}/?t=${Date.now()}#/genre/${nodeId}`;
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 6000));

  const probe = await send('Runtime.evaluate', {
    expression: `(async () => {
      const figures = [...document.querySelectorAll('.ishkur-figure')];
      const rows = [];
      for (const fig of figures) {
        const img = fig.querySelector('img');
        if (!img) continue;
        // img 带 loading="lazy"：不滚进视口浏览器根本不会发起请求，
        // 直接查 naturalWidth 会得到 0，误判成「图挂了」。
        fig.scrollIntoView({ block: 'center' });
        if (!img.complete) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 5000);
            img.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
            img.addEventListener('error', () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        }
        rows.push({
          src: img.getAttribute('src'),
          hidden: fig.hidden,
          complete: img.complete,
          w: img.naturalWidth,
          h: img.naturalHeight,
          caption: (fig.querySelector('figcaption') || {}).textContent || '',
        });
      }
      const group = document.querySelector('.ishkur-figures');
      return JSON.stringify({
        figures: rows.length,
        groupHidden: group ? group.hidden : null,
        rows,
        hasSection: !!document.querySelector('.ishkur-section'),
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  const parsed = JSON.parse(probe.result?.result?.value || '{}');
  console.log(`\n=== #/genre/${nodeId} ===`);
  console.log('Ishkur 区块存在:', parsed.hasSection, '| figure 数:', parsed.figures, '| 容器 hidden:', parsed.groupHidden);
  for (const row of parsed.rows || []) {
    const ok = row.complete && row.w > 0 && !row.hidden;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${row.src} ${row.w}x${row.h} hidden=${row.hidden} ${row.caption ? '“' + row.caption.slice(0, 30) + '”' : ''}`);
  }
  const badNet = imageResponses.filter((r) => r.status !== 200 || !/^image\//.test(r.mime));
  failures += badNet.length;
  console.log(`  网络: ${imageResponses.length} 个图片请求, ${badNet.length} 异常`);
  for (const b of badNet.slice(0, 5)) console.log(`    ✗ ${b.status} ${b.mime} ${b.url}`);
}

if (errors.length) {
  console.log('\n=== 控制台异常 ===');
  errors.slice(0, 8).forEach((e) => console.log(' ', e));
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
await close();
process.exit(failures === 0 ? 0 : 1);

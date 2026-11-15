/**
 * 内容快照：把树页渲染出来的结构打印成文本，用来在没有视觉通道时核对内容。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-render-snapshot.mjs
 */

import { launchChrome } from './cdp-launch.mjs';

const BASE = 'http://127.0.0.1:5501/';

const L = await launchChrome({
  allow: [/^http:\/\/127\.0\.0\.1:5501\//, /^about:blank$/],
});

const ws = new WebSocket(L.wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const p = pend.get(m.id);
    pend.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
};
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => {
    pend.set(i, { res, rej });
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + ' 超时')); } }, 20000);
  });
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || '运行时异常');
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });
L.assertNavigable(BASE + '#/tree');
await send('Page.navigate', { url: BASE + '#/tree' });
await sleep(2800);

const snap = await ev(`(() => {
  const t = (sel) => (document.querySelector(sel) || {}).textContent || '';
  const cols = [...document.querySelectorAll('.tree-col')].map((col, i) => ({
    level: i,
    head: (col.querySelector('.tree-col-head .mono-label') || {}).textContent || '',
    count: (col.querySelector('.tree-col-head b') || {}).textContent || '',
    groups: [...col.querySelectorAll('.tree-group-label span')].map((g) => g.textContent),
    rows: [...col.querySelectorAll('.tree-row')].slice(0, 8).map((r) => ({
      name: (r.querySelector('.tree-row-name') || {}).textContent || '',
      meta: (r.querySelector('.tree-row-count, .tree-row-tag') || {}).textContent || '',
      hasKids: r.classList.contains('has-kids'),
      playing: r.classList.contains('is-playing'),
      playable: !r.querySelector('.tree-row-play')?.disabled,
    })),
    total: col.querySelectorAll('.tree-row').length,
  }));
  return {
    title: t('.page-head h1'),
    lead: t('.page-head-copy p'),
    stats: [...document.querySelectorAll('.page-head-stats > *')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()).slice(0, 6),
    crumbs: [...document.querySelectorAll('.tree-crumb')].map((c) => c.textContent.trim()),
    cols,
    detail: {
      kicker: t('.tree-detail-head .mono-label'),
      name: t('.tree-detail-head h2'),
      zh: t('.tree-detail-zh'),
      body: t('.tree-detail-body').replace(/\\s+/g, ' ').slice(0, 240),
      relBlocks: [...document.querySelectorAll('.tree-rel h3')].map((h) => h.textContent.slice(0, 24)),
      examples: [...document.querySelectorAll('.tree-example-title')].map((e) => e.textContent).slice(0, 3),
    },
    undefinedLeak: (document.body.innerText.includes('undefined') || document.body.innerText.includes('NaN')),
  };
})()`);

console.log('标题：' + snap.title);
console.log('导语：' + snap.lead);
console.log('统计：' + snap.stats.join(' | '));
console.log('面包屑：' + snap.crumbs.join(' › '));
console.log('');
for (const c of snap.cols) {
  console.log(`【第 ${c.level + 1} 列】${c.head}  共 ${c.total} 行（表头计数 ${c.count}）`);
  if (c.groups.length) console.log('  分组：' + c.groups.join(' / '));
  for (const r of c.rows) {
    const flags = [r.hasKids ? '有下级' : '叶子', r.playable ? '可播' : '无声', r.playing ? '播放中' : ''].filter(Boolean).join(',');
    console.log(`   ${r.name.padEnd(22)} ${String(r.meta).padEnd(6)} ${flags}`);
  }
  if (c.total > c.rows.length) console.log(`   …另有 ${c.total - c.rows.length} 行`);
  console.log('');
}
console.log('【详情卡】' + snap.detail.kicker);
console.log('  ' + snap.detail.name + '  ' + snap.detail.zh);
console.log('  正文：' + snap.detail.body);
console.log('  关系块：' + (snap.detail.relBlocks.join(' / ') || '（无）'));
console.log('  例曲：' + (snap.detail.examples.join(' / ') || '（无）'));
console.log('');
console.log('undefined/NaN 泄漏：' + (snap.undefinedLeak ? '有 ✗' : '无 ✓'));

await L.close();

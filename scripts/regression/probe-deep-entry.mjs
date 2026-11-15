/**
 * 深层条目快照：跳到 House › Chicago House，核对详情卡的例曲与派生关系。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-deep-entry.mjs
 */

import { launchChrome } from './cdp-launch.mjs';

const BASE = 'http://127.0.0.1:5501/';
const TARGET = BASE + '#/tree?path=f-165,g-383&sel=g-383';

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

const PROBE = `(() => {
  const t = (sel) => (document.querySelector(sel) || {}).textContent || '';
  return {
    cols: [...document.querySelectorAll('.tree-col')].map((c) => ({
      label: (c.querySelector('.tree-col-head .mono-label') || {}).textContent,
      n: c.querySelectorAll('.tree-row').length,
    })),
    crumbs: [...document.querySelectorAll('.tree-crumb')].map((c) => c.textContent.trim()),
    kicker: t('.tree-detail-head .mono-label'),
    name: t('.tree-detail-head h2'),
    zh: t('.tree-detail-zh'),
    bpm: t('.tree-detail-bpm').replace(/\\s+/g, ' '),
    rels: [...document.querySelectorAll('.tree-rel h3')].map((h) => h.textContent.replace(/\\s+/g, ' ').trim().slice(0, 32)),
    relChips: [...document.querySelectorAll('.tree-rel .chip')].map((c) => c.textContent.trim()).slice(0, 10),
    crossChips: [...document.querySelectorAll('.tree-rel .chip.is-cross')].map((c) => c.textContent.trim()),
    examples: [...document.querySelectorAll('.tree-example-title')].map((e) => e.textContent).slice(0, 3),
    actions: [...document.querySelectorAll('.tree-detail-actions a, .tree-detail-actions button')].map((a) => a.textContent.trim()),
    selectedRow: (document.querySelector('.tree-row.is-selected .tree-row-name') || {}).textContent,
    pathRows: [...document.querySelectorAll('.tree-row.is-path .tree-row-name')].map((e) => e.textContent),
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });
L.assertNavigable(TARGET);
await send('Page.navigate', { url: TARGET });
await sleep(2800);

const d = await ev(PROBE);

console.log('列：' + d.cols.map((c) => `${c.label}(${c.n}行)`).join(' → '));
console.log('面包屑：' + d.crumbs.join(' › '));
console.log('路径行：' + d.pathRows.join(' › '));
console.log('选中：' + d.selectedRow);
console.log('类型：' + d.kicker);
console.log('标题：' + d.name + '   ' + d.zh);
console.log('BPM：' + d.bpm);
console.log('关系块：' + (d.rels.join(' | ') || '（无）'));
console.log('  跨族：' + (d.crossChips.join(' / ') || '（无）'));
console.log('  全部：' + (d.relChips.join(' / ') || '（无）'));
console.log('例曲：' + (d.examples.join(' / ') || '（无）'));
console.log('操作：' + d.actions.join('  |  '));

await L.close();

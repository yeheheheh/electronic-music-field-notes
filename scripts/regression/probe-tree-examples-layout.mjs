/**
 * 树例曲布局几何探针：截图看不清时用坐标说话。
 * 检查项：按钮不压曲名、链接与按钮不重叠、面板不溢出、序号不压文字。
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-tree-examples-layout.mjs
 */
import { launchChrome } from './cdp-launch.mjs';

const BASE = 'http://127.0.0.1:5501/';

const L = await launchChrome({
  allow: [/^http:\/\/127\.0\.0\.1:5501\//, /^about:blank$/],
  args: ['--window-size=1440,1200'],
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
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + ' timeout')); } }, 30000);
  });
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || '异常');
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `(() => {
  const box = document.querySelector('.tree-examples-block');
  if (!box) return { missing: true };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const items = [...box.querySelectorAll('.tree-example-item')];
  const overlaps = [];
  items.forEach((item, i) => {
    const meta = item.querySelector('.tree-example-meta');
    const acts = item.querySelector('.tree-example-actions');
    if (!meta || !acts) return;
    const m = rect(meta), a = rect(acts);
    // 按钮块必须整体落在曲名块下方（窄面板里是上下排，不是左右排）
    if (a.t < m.b - 1) overlaps.push('第 ' + (i + 1) + ' 项按钮压住曲名: meta.b=' + m.b + ' acts.t=' + a.t);
    // 序号不能压到曲名
    const t = item.querySelector('.tree-example-title');
    if (t) {
      const tr = rect(t), ir = rect(item);
      if (tr.l < ir.l + 16) overlaps.push('第 ' + (i + 1) + ' 项序号压住曲名: title.l=' + tr.l + ' item.l=' + ir.l);
    }
  });
  // 按钮之间不能互相重叠
  const btns = [...box.querySelectorAll('.example-preview')].map(rect);
  for (let i = 1; i < btns.length; i++) {
    if (btns[i].t < btns[i - 1].b - 1 && btns[i].l < btns[i - 1].r - 1) overlaps.push('按钮 ' + i + ' 与上一个重叠');
  }
  const de = document.documentElement;
  const wrap = document.querySelector('.tree-detail');
  return {
    box: rect(box),
    items: items.length,
    itemRects: items.map(rect),
    btnRects: btns,
    btnTexts: [...box.querySelectorAll('.example-preview')].map((b) => b.textContent.trim()),
    noteH: (box.querySelector('.tree-examples-note') || {}).getBoundingClientRect ? rect(box.querySelector('.tree-examples-note')) : null,
    overlaps,
    docOverflow: de.scrollWidth - de.clientWidth,
    boxOverflow: box.scrollWidth - box.clientWidth,
    wrapOverflow: wrap ? wrap.scrollWidth - wrap.clientWidth : 0,
  };
})()`;

for (const [w, h, mobile] of [[1440, 1200, false], [390, 1400, true], [320, 1400, true]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  L.assertNavigable(BASE + '#/tree?path=f-165,g-383&sel=g-413');
  await send('Page.navigate', { url: BASE + '#/tree?path=f-165,g-383&sel=g-413' });
  await sleep(3000);
  const r = await ev(PROBE);
  console.log(`\n===== ${w}px =====`);
  if (r.missing) { console.log('  未找到 .tree-examples-block'); continue; }
  console.log(`区块: ${r.box.w}×${r.box.h} @ (${r.box.l},${r.box.t})`);
  console.log(`例曲项: ${r.items} 个 · 按钮: ${r.btnTexts.join(' / ')}`);
  r.btnRects.forEach((b, i) => console.log(`  按钮 ${i + 1}: ${b.w}×${b.h} @ (${b.l},${b.t})`));
  console.log(`文档横向溢出: ${r.docOverflow} · 区块: ${r.boxOverflow} · 详情面板: ${r.wrapOverflow}`);
  console.log(`重叠问题: ${r.overlaps.length ? r.overlaps.join(' | ') : '无'}`);
}

await L.close();
process.exit(0);

/**
 * 分支树布局探针：查列宽、溢出与详情面板的实际计算值。
 * 截图只能看出「像不像」，看不出「为什么第二列不在视口里」。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-tree-layout.mjs
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

const PROBE = `(() => {
  const host = document.getElementById('treeColumns');
  const cols = [...document.querySelectorAll('.tree-col')];
  const page = document.querySelector('.tree-page');
  const hostCs = host ? getComputedStyle(host) : null;
  const c0 = cols[0] ? getComputedStyle(cols[0]) : null;
  const r0 = cols[0] ? cols[0].getBoundingClientRect() : null;
  const r1 = cols[1] ? cols[1].getBoundingClientRect() : null;
  return {
    colCount: cols.length,
    hostWidth: host ? Math.round(host.getBoundingClientRect().width) : null,
    hostScrollWidth: host ? host.scrollWidth : null,
    hostDisplay: hostCs ? hostCs.display : null,
    hostOverflowX: hostCs ? hostCs.overflowX : null,
    colWVar: page ? getComputedStyle(page).getPropertyValue('--col-w').trim() : null,
    col0Width: r0 ? Math.round(r0.width) : null,
    col0Left: r0 ? Math.round(r0.left) : null,
    col0Flex: c0 ? c0.flex : null,
    col0FlexBasis: c0 ? c0.flexBasis : null,
    col0Rows: cols[0] ? cols[0].querySelectorAll('.tree-row').length : 0,
    col1Width: r1 ? Math.round(r1.width) : null,
    col1Left: r1 ? Math.round(r1.left) : null,
    col1Rows: cols[1] ? cols[1].querySelectorAll('.tree-row').length : 0,
    viewportW: window.innerWidth,
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');

for (const w of [1440, 1024, 390]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: w < 768 });
  L.assertNavigable(BASE + '#/tree');
  await send('Page.navigate', { url: BASE + '#/tree' });
  await sleep(2400);
  console.log(`--- ${w}px ---`);
  console.log(JSON.stringify(await ev(PROBE), null, 1));
}

await L.close();

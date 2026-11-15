/**
 * 移动端导语截断探针：对比 #/tree 与 #/atlas 的 .page-head 文案，
 * 判断截断是不是树页引入的。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-mobile-text.mjs
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
  const p = document.querySelector('.page-head-copy p');
  const copy = document.querySelector('.page-head-copy');
  const head = document.querySelector('.page-head');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width),
      left: Math.round(r.left),
      right: Math.round(r.right),
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      overflowX: cs.overflowX,
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
    };
  };
  return {
    vw: window.innerWidth,
    p: box(p),
    copy: box(copy),
    head: box(head),
    textLen: p ? p.textContent.length : 0,
    text: p ? p.textContent.slice(0, 60) : '',
  };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

for (const route of ['#/atlas', '#/tree', '#/listen']) {
  L.assertNavigable(BASE + route);
  await send('Page.navigate', { url: BASE + route });
  await sleep(2400);
  console.log(`--- ${route} ---`);
  console.log(JSON.stringify(await ev(PROBE), null, 1));
}

await L.close();

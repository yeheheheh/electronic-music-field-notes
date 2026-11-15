// 探针：例曲区块在条目页里的几何与文本状态。
// 用法： node scripts/serve.mjs &  然后 node scripts/regression/probe-listen-examples.mjs
// 只读，不修改任何东西；出问题时打印计算值，避免靠截图猜。
import { launchChrome } from './cdp-launch.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const L = await launchChrome({
  allow: [/^http:\/\/127\.0\.0\.1:5501\//, /^about:blank$/],
  chrome: CHROME,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

const ws = new WebSocket(L.wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
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
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + ' timeout')); } }, 20000);
  });
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'ex');
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable');
await send('Page.enable');

const widths = [1440, 1024, 768, 390, 320];
for (const w of widths) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: w <= 768 });
  L.assertNavigable(BASE + '#/genre/g-1525');
  await send('Page.navigate', { url: BASE + '#/genre/g-1525' });
  await sleep(2600);

  const info = await ev(`(() => {
    const box = document.querySelector('.lc-examples');
    const head = document.querySelector('.lc-examples-head');
    const toggle = document.querySelector('.lc-autoplay');
    const items = [...document.querySelectorAll('.lc-example-item')];
    const btn = document.querySelector('.lc-examples .example-preview');
    const label = toggle ? toggle.querySelector('span') : null;
    const r = (el) => el ? el.getBoundingClientRect() : null;
    const br = r(box), hr = r(head), tr = r(toggle), lr = r(label), fr = r(items[0]);
    return {
      items: items.length,
      titles: [...document.querySelectorAll('.lc-example-title')].map((e) => e.textContent.trim()).slice(0, 3),
      btnText: btn ? btn.textContent.trim() : '',
      toggleText: label ? label.textContent.trim() : '',
      toggleClipped: label ? (label.scrollWidth > label.clientWidth + 1) : null,
      toggleWrap: lr && hr ? (lr.bottom > hr.bottom + 1 || lr.right > hr.right + 1) : null,
      headOverflow: hr ? (hr.scrollWidth - hr.clientWidth) : null,
      firstItemOverflow: items[0] ? (items[0].scrollWidth - items[0].clientWidth) : null,
      headToToggleGap: (hr && tr) ? Math.round(tr.left - hr.left) : null,
      // 按钮是否被容器裁切
      btnOverflow: btn ? (btn.scrollWidth - btn.clientWidth) : null,
      btnH: btn ? Math.round(btn.getBoundingClientRect().height) : null,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // 文本里是否混入 undefined / NaN
      leaks: (document.querySelector('.lc-examples')?.textContent || '').match(/undefined|NaN/g)?.length || 0,
    };
  })()`);

  console.log(`--- ${w}px ---`);
  console.log(`  例曲 ${info.items} 条：${info.titles.join(' / ')}`);
  console.log(`  按钮「${info.btnText}」高 ${info.btnH}px  溢出 ${info.btnOverflow}`);
  console.log(`  开关「${info.toggleText}」被裁=${info.toggleClipped}  换行=${info.toggleWrap}`);
  console.log(`  头部溢出 ${info.headOverflow}  首项溢出 ${info.firstItemOverflow}  页面溢出 ${info.docOverflow}`);
  console.log(`  undefined/NaN 泄漏 ${info.leaks}`);
}

await L.close();

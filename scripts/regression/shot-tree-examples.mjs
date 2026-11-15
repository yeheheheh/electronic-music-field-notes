/**
 * 树详情例曲截图：人眼过一遍布局（按钮位置、序号、窄面板换行）。
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/shot-tree-examples.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { launchChrome } from './cdp-launch.mjs';

const BASE = 'http://127.0.0.1:5501/';
const OUT = 'docs';
mkdirSync(OUT, { recursive: true });

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable');
await send('Page.enable');

const shots = [
  { hash: '#/tree?path=f-165,g-383&sel=g-413', w: 1440, h: 1200, name: 'tree-examples-desktop.png', mobile: false },
  { hash: '#/tree?path=f-165,g-383&sel=g-413', w: 390, h: 1400, name: 'tree-examples-mobile.png', mobile: true },
];

for (const s of shots) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.mobile });
  L.assertNavigable(BASE + s.hash);
  await send('Page.navigate', { url: BASE + s.hash });
  await sleep(3200);
  // 详情面板单独截一张，看得清按钮排布
  const clip = await send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('.tree-examples-block');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20, scale: 2 };
    })()`,
    returnByValue: true,
  });
  const shot = await send('Page.captureScreenshot', clip.result?.value ? { clip: clip.result.value } : {});
  writeFileSync(`${OUT}/${s.name}`, Buffer.from(shot.data, 'base64'));
  console.log(`已保存 ${OUT}/${s.name}`);
}

await L.close();
process.exit(0);

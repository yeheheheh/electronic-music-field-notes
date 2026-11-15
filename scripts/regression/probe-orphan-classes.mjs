/**
 * 孤立类名探针：找出「HTML 里在用、但没有任何 CSS 规则」的类。
 *
 * 这类问题不会报错，只会让元素退回默认样式——比如 .tree-columns 少了
 * display:flex，两列就会垂直堆叠，测试照样数到 2 个 .tree-col 通过。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-orphan-classes.mjs
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

// 只查树页范围内、以 tree- 开头的类，避免被全站几万条规则淹没
const PROBE = `(() => {
  // 扫全页：树页的底部播放条在 .tree-page 外面，只扫容器会漏掉它
  const scope = document.body;
  const used = new Set();
  scope.querySelectorAll('*').forEach((el) => {
    el.classList.forEach((c) => { if (c.startsWith('tree-')) used.add(c); });
  });
  // 把样式表里所有选择器拍平，找出包含这个类的规则
  const defined = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.selectorText) {
          for (const m of rule.selectorText.matchAll(/\\.([a-zA-Z0-9_-]+)/g)) defined.add(m[1]);
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(rules);
  }
  const orphan = [...used].filter((c) => !defined.has(c)).sort();
  return { usedCount: used.size, definedCount: defined.size, orphan };
})()`;

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
L.assertNavigable(BASE + '#/tree');
await send('Page.navigate', { url: BASE + '#/tree' });
await sleep(2600);

const r = await ev(PROBE);
console.log(`树页用到的 tree- 类：${r.usedCount} 个`);
console.log(`样式表里定义的类：${r.definedCount} 个`);
console.log(`没有对应 CSS 规则的类：${r.orphan.length} 个`);
if (r.orphan.length) {
  console.log('');
  for (const c of r.orphan) console.log('  - .' + c);
}

await L.close();
process.exit(r.orphan.length ? 1 : 0);

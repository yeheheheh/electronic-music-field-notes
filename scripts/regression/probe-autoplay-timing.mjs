/**
 * 自动播放耗时探针：在 Acid House 页（前三首里只有第三首有预览）
 * 连续采样，看自动播放到底要多久才响、中间卡在哪一步。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/probe-autoplay-timing.mjs
 */

import { launchChrome } from './cdp-launch.mjs';

const BASE = 'http://127.0.0.1:5501/';

const L = await launchChrome({
  allow: [/^http:\/\/127\.0\.0\.1:5501\//, /^about:blank$/],
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
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
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + ' 超时')); } }, 40000);
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

// 先开自动播放偏好
L.assertNavigable(BASE + '#/');
await send('Page.navigate', { url: BASE + '#/' });
await sleep(2500);
await ev(`(() => { try { localStorage.setItem('em.listen.autoplay', '1'); } catch {} })()`);

L.assertNavigable(BASE + '#/genre/g-413');
await send('Page.navigate', { url: BASE + '#/genre/g-413' });
console.log('已进入 Acid House 页，开始按秒采样：');

for (let i = 1; i <= 24; i += 1) {
  await sleep(1000);
  const s = await ev(`(() => {
    const btns = [...document.querySelectorAll('.lc-examples .example-preview')];
    return {
      texts: btns.map((b) => b.textContent.trim()),
      playing: btns.map((b) => b.classList.contains('is-playing')),
      loading: btns.map((b) => b.classList.contains('is-loading')),
      titles: [...document.querySelectorAll('.lc-example-title')].map((e) => e.textContent.slice(0, 26)),
    };
  })()`);
  const flag = s.playing.includes(true) ? '▶ 在播' : (s.loading.includes(true) ? '…查询中' : '  静默');
  console.log(`${String(i).padStart(2)}s  ${flag}  [${s.texts.join(' | ')}]`);
  if (s.playing.includes(true)) {
    console.log('→ 自动播放成功，用时约 ' + i + ' 秒');
    break;
  }
}

const detail = await ev(`(() => {
  const btns = [...document.querySelectorAll('.lc-examples .example-preview')];
  return btns.map((b) => ({
    term: b.dataset.preview,
    alt: b.dataset.previewAlt || null,
    text: b.textContent.trim(),
    playing: b.classList.contains('is-playing'),
  }));
})()`);
console.log('\n按钮最终状态：');
detail.forEach((d, i) => console.log(`  ${i + 1}. ${d.text}  term="${d.term}"  alt="${d.alt || '—'}"`));

await L.close();

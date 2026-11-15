// 探针：打印条目页例曲区块的实际渲染文本。
// 用法： node scripts/serve.mjs &  然后 node scripts/regression/probe-example-text.mjs
// 只读。用来确认清理规则在真实页面上的效果，而不是靠截图猜。
import { launchChrome } from './cdp-launch.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// 挑几条有代表性的：含批注的、含 feat. 的、含版本说明的
const CASES = [
  ['g-2961', 'Tech Trance（早期——/现代——）'],
  ['g-571', 'Amapiano（feat. 长后缀）'],
  ['g-8578', 'Nu Hardstyle（[1:06起始]）'],
  ['g-1525', 'Ghosts n Stuff（版本后缀）'],
  ['g-413', 'Acid House'],
];

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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

for (const [gid, label] of CASES) {
  L.assertNavigable(BASE + '#/genre/' + gid);
  await send('Page.navigate', { url: BASE + '#/genre/' + gid });
  await sleep(2800);

  const info = await ev(`(() => {
    const items = [...document.querySelectorAll('.lc-example-item')];
    return {
      title: (document.querySelector('.detail-head h1, .entry-title, h1') || {}).textContent?.trim() || '',
      rows: items.map((li) => {
        const btn = li.querySelector('.example-preview');
        return {
          shown: (li.querySelector('.lc-example-title') || {}).textContent?.trim() || '',
          artist: (li.querySelector('.lc-example-artist') || {}).textContent?.trim() || '',
          term: btn ? (btn.dataset.preview || '') : '',
          alt: btn ? (btn.dataset.previewAlt || '').split('\\u0001').filter(Boolean) : [],
          btnText: btn ? btn.textContent.trim() : '',
        };
      }),
    };
  })()`);

  console.log('=== ' + label + '  (' + gid + ') ===');
  console.log('  页面标题: ' + info.title);
  if (!info.rows.length) console.log('  （无例曲区块）');
  info.rows.forEach((r, i) => {
    console.log(`  [${i + 1}] 显示: ${r.shown}  —  ${r.artist}`);
    console.log(`      查询: ${r.term}`);
    if (r.alt.length) console.log(`      备用: ${r.alt.join('  |  ')}`);
    console.log(`      按钮: ${r.btnText}`);
  });
  console.log('');
}

await L.close();

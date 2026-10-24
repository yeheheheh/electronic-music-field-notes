// 内嵌模式窄屏验证：320/390 下课时页内嵌工作室是否正常挂载且不溢出。
// 关键：每轮迭代必须先清 localStorage。否则上一轮展开工作室留下的状态
// 会让这一轮的「在这里动手」按钮变成「收起」，点击反而把面板关掉 ——
// 这个坑第一次跑的时候就踩到了，看起来像产品缺陷，其实是探针脏了。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const profile = mkdtempSync(join(tmpdir(), 'cdp-emb-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1600,1200', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let url;
for (let i = 0; i < 40; i += 1) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const p = l.find((t) => t.type === 'page');
    if (p?.webSocketDebuggerUrl) { url = p.webSocketDebuggerUrl; break; }
  } catch { /* 等浏览器 */ }
  await sleep(250);
}
const ws = new WebSocket(url);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pend = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { resolve } = pend.get(m.id); pend.delete(m.id); resolve(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR: ' + m.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
};
const send = (m, p = {}) => new Promise((resolve) => { id += 1; pend.set(id, { resolve }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
  return r.result.value;
};

await send('Runtime.enable');

for (const W of [390, 320]) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 1000, deviceScaleFactor: 1, mobile: true });
  // 先到首页清干净，再进课时页
  await send('Page.navigate', { url: 'http://127.0.0.1:5501/' });
  await sleep(1500);
  await ev('localStorage.clear()');
  await send('Page.navigate', { url: 'http://127.0.0.1:5501/#/learn/kick-and-bass' });
  await sleep(2600);

  const r = await ev(`(async () => {
    const btn = document.querySelector('[data-lesson-studio-open]');
    if (!btn) return { fail: 'no-button' };
    const collapsedLabel = btn.textContent.trim();
    btn.click();
    await new Promise(r => setTimeout(r, 1600));
    const stage = document.querySelector('[data-lesson-studio]');
    const vw = window.innerWidth;
    const over = [...document.querySelectorAll('body *')].filter(el => {
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || b.width < 2) return false;
      if (el.closest('.st-grid,.route,.structure-blocks')) return false;
      return b.right > vw + 1.5;
    }).slice(0, 3).map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
    const btns = [...document.querySelectorAll('.st-stepnav-btn')].map(b => Math.round(b.getBoundingClientRect().width));
    return {
      collapsedLabel, hidden: stage.hasAttribute('hidden'), len: stage.innerHTML.length,
      cells: document.querySelectorAll('.st-cell').length, stepnav: btns.length, btnW: btns,
      docW: document.documentElement.scrollWidth, vw, over,
      embedLink: (document.querySelector('.st-embed-link') || {}).getAttribute ? document.querySelector('.st-embed-link').getAttribute('href') : null,
    };
  })()`);

  const ok = !r.fail && r.hidden === false && r.len > 2000 && r.docW <= r.vw && r.over.length === 0 && r.stepnav === 2;
  console.log(`${ok ? 'OK  ' : 'BAD '} w=${W} 挂载=${r.len || 0}B 格子=${r.cells || 0} 走带按钮=${r.stepnav || 0}个${r.btnW ? '(' + r.btnW.join('/') + 'px)' : ''} docW=${r.docW} 溢出=${JSON.stringify(r.over || [])} 出口=${r.embedLink}${r.fail ? ' FAIL=' + r.fail : ''}`);
}
console.log('日志:', logs.slice(0, 4).join(' | ') || '无');
chrome.kill();

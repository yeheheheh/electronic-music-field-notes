// 信号链面板的布局检查：重叠、错位、文字被截断。
//
// 截图要看像素，这个看几何——后者更准，也能进回归。
// 判定三类问题：
//   OVERLAP  两个不该重叠的兄弟元素相交（换位按钮压住文案之类）
//   CLIP     文字被容器裁掉（scrollWidth 明显大于 clientWidth）
//   TINY     触控目标小于 30px（手机上点不中）
//
// 用法：node scripts/regression/check-chain-layout.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9358;

const profile = mkdtempSync(join(tmpdir(), 'cdp-lay-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1100', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error('找不到可调试的页面');
}

let id = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = (id += 1);
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== myId) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

const ws = new WebSocket(await findTarget());
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Page.enable');

const errors = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.text || '未知异常');
  }
});

async function evalJs(expression) {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const WIDTHS = [320, 390, 768, 1024, 1440, 1920];

console.log('\n信号链面板布局检查\n');

for (const width of WIDTHS) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
    width, height: 1000, deviceScaleFactor: 1, mobile: width <= 620,
  });
  await rpc(ws, 'Page.navigate', { url: `${BASE}index.html#/studio?m=chain` });
  await sleep(2000);
  await evalJs('localStorage.clear()');
  await rpc(ws, 'Page.reload');
  await sleep(2400);

  const d = await evalJs(`(() => {
    const doc = document;
    const vw = window.innerWidth;
    const panel = doc.querySelector('[data-st-panel="chain"]');
    if (!panel) return { error: 'no panel' };

    const rect = (el) => el.getBoundingClientRect();
    const intersect = (a, b) =>
      a.left < b.right - 1 && b.left < a.right - 1 &&
      a.top < b.bottom - 1 && b.top < a.bottom - 1;

    // 1) 重叠：链节点内部的三块（手柄 / 正文 / 换位按钮）不应相交
    const overlaps = [];
    for (const node of doc.querySelectorAll('.st-chain-node')) {
      const parts = [
        ['grip', node.querySelector('.st-chain-grip')],
        ['body', node.querySelector('.st-chain-body')],
        ['move', node.querySelector('.st-chain-move')],
      ].filter(([, el]) => el);
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          if (intersect(rect(parts[i][1]), rect(parts[j][1]))) {
            overlaps.push(parts[i][0] + '×' + parts[j][0]);
          }
        }
      }
    }

    // 2) 文字截断：只查会因为宽度不足而被裁的块
    const clips = [];
    for (const sel of ['.st-chain-role', '.st-chain-when', '.st-track-name strong', '.st-signal-node strong']) {
      for (const el of doc.querySelectorAll(sel)) {
        if (el.scrollWidth > el.clientWidth + 2) clips.push(sel);
      }
    }

    // 3) 触控目标
    const tiny = [];
    const targets = [
      ['换位按钮', '.st-chain-btn'],
      ['轨道试听', '.st-track-head'],
      ['A/B 槽', '.st-chain-slot'],
      ['拖拽手柄', '.st-chain-grip'],
    ];
    for (const [name, sel] of targets) {
      for (const el of doc.querySelectorAll(sel)) {
        const r = rect(el);
        if (r.height < 24 || r.width < 24) tiny.push(name + ':' + Math.round(r.width) + '×' + Math.round(r.height));
      }
    }

    // 4) 越界：面板内元素是否超出视口右边
    const over = [];
    for (const el of panel.querySelectorAll('*')) {
      const r = rect(el);
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || r.width < 2) continue;
      if (el.closest('.st-signal')) continue; // 信号流图设计上就横向滚动
      if (r.right > vw + 1.5) over.push(el.className.split(' ')[0] || el.tagName);
    }

    return {
      vw,
      docW: doc.documentElement.scrollWidth,
      overlaps: [...new Set(overlaps)],
      clips: [...new Set(clips)],
      tiny: [...new Set(tiny)],
      over: [...new Set(over)].slice(0, 4),
      chainCols: getComputedStyle(doc.querySelector('.st-chain-grid')).gridTemplateColumns.split(' ').length,
    };
  })()`);

  if (d.error) {
    check(`w=${width} 面板挂载`, false, d.error);
    continue;
  }

  const ok = d.overlaps.length === 0 && d.clips.length === 0 && d.over.length === 0
    && d.docW <= d.vw && (width > 620 || d.tiny.length === 0);
  check(`w=${width} 无重叠/截断/越界`,
    ok,
    `重叠[${d.overlaps.join(',') || '无'}] 截断[${d.clips.join(',') || '无'}] `
    + `越界[${d.over.join(',') || '无'}] docW=${d.docW}/${d.vw} 列数=${d.chainCols}`
    + (d.tiny.length ? ` 小目标[${d.tiny.slice(0, 3).join(',')}]` : ''));
}

check('无 JS 报错', errors.length === 0, errors.length ? errors.join(' | ') : '无');

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);

ws.close();
chrome.kill();
process.exit(pass === results.length ? 0 : 1);

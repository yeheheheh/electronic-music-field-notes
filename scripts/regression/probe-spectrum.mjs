// 首页频谱条的几何测量。
//
// 背景：知识库扩充后大族从 16 涨到 29，频谱条是单行 flex，在 320px 下撑破视口。
// 修之前先把真实几何量出来——尤其是 .bar-code 标签（bottom:-17px）到底在
// .spectrum-bars 的盒内还是盒外，这决定了能不能直接给容器加 overflow-x:auto。
//
// 用法：node scripts/regression/probe-spectrum.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9344;

const profile = mkdtempSync(join(tmpdir(), 'cdp-spec-'));
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
    } catch { /* 还没起来 */ }
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
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

const wsUrl = await findTarget();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});
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
  const result = await rpc(ws, 'Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const WIDTHS = [320, 390, 620, 900, 1440];
const report = [];

for (const width of WIDTHS) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: 1, mobile: width <= 620,
  });
  await rpc(ws, 'Page.navigate', { url: `${BASE}index.html#/` });
  await sleep(2200);
  await evalJs('localStorage.clear()');
  await rpc(ws, 'Page.reload');
  await sleep(2200);

  const data = await evalJs(`(() => {
    const d = document;
    const vw = window.innerWidth;
    const bars = d.querySelector('.spectrum-bars');
    if (!bars) return { error: 'no .spectrum-bars' };
    const items = [...d.querySelectorAll('.spectrum-bar')];
    const codes = [...d.querySelectorAll('.spectrum-bar .bar-code')];
    const r = bars.getBoundingClientRect();
    const cs = getComputedStyle(bars);
    const last = items[items.length - 1].getBoundingClientRect();
    const code = codes[0].getBoundingClientRect();
    const legend = d.querySelector('.spectrum-legend');
    const lg = legend ? legend.getBoundingClientRect() : null;
    return {
      vw,
      docW: d.documentElement.scrollWidth,
      count: items.length,
      // 容器自身
      barsW: +r.width.toFixed(1),
      barsH: +r.height.toFixed(1),
      paddingBottom: cs.paddingBottom,
      borderBottom: cs.borderBottomWidth,
      overflowX: cs.overflowX,
      // 子项
      barW: +items[0].getBoundingClientRect().width.toFixed(1),
      lastRight: +last.right.toFixed(1),
      // 标签：是否超出容器底边（决定能否直接 overflow:auto）
      codeTop: +code.top.toFixed(1),
      codeBottom: +code.bottom.toFixed(1),
      barsBottom: +r.bottom.toFixed(1),
      codeOutsidePx: +(code.bottom - r.bottom).toFixed(1),
      // 图例与后续元素
      legendTop: lg ? +lg.top.toFixed(1) : null,
      legendGap: lg ? +(lg.top - r.bottom).toFixed(1) : null,
      legendH: lg ? +lg.height.toFixed(1) : null,
      legendRows: lg ? Math.round(lg.height / 20) : null,
      // 是否溢出
      overflows: d.documentElement.scrollWidth > vw,
    };
  })()`);

  report.push({ width, ...data });
}

console.log('\n首页频谱条几何测量\n');
console.log('宽  大族 条宽   容器宽  内容右缘  docW  溢出  标签外溢  图例高');
for (const r of report) {
  if (r.error) { console.log(`${r.width}  ${r.error}`); continue; }
  console.log([
    String(r.width).padStart(4),
    String(r.count).padStart(4),
    String(r.barW).padStart(6),
    String(r.barsW).padStart(7),
    String(r.lastRight).padStart(8),
    String(r.docW).padStart(6),
    (r.overflows ? '是' : '否').padStart(5),
    String(r.codeOutsidePx).padStart(9),
    String(r.legendH).padStart(7),
  ].join(' '));
}

console.log('\n细节：');
for (const r of report) {
  if (r.error) continue;
  console.log(`  ${r.width}px  容器高=${r.barsH} padding-bottom=${r.paddingBottom} border-bottom=${r.borderBottom} overflow-x=${r.overflowX}`);
  console.log(`         标签底=${r.codeBottom} 容器底=${r.barsBottom} 外溢=${r.codeOutsidePx}px  图例距容器=${r.legendGap}px`);
}

console.log(`\nJS 报错: ${errors.length ? errors.join(' | ') : '无'}`);
ws.close();
chrome.kill();
process.exit(0);

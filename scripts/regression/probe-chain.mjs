// 信号链面板的窄屏几何检查。
//
// 新增的 chain 面板是站内第一个「两列 + 可拖拽列表」的模块，窄屏最容易出问题：
// 拖拽手柄 + 换位按钮列会挤压文案，信号流图是横向 flex 也可能撑破视口。
// 这个脚本在若干宽度下量它的实际几何。
//
// 用法：node scripts/regression/probe-chain.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9354;

const profile = mkdtempSync(join(tmpdir(), 'cdp-chain-'));
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

async function evalJs(expression) {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

const WIDTHS = [320, 390, 620, 768, 1000, 1440, 1920];
console.log('\n信号链面板几何\n');
console.log('宽    docW  溢出  信号流溢出  轨道行高  链节点宽  换位按钮  手柄');
for (const width of WIDTHS) {
  await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: 1, mobile: width <= 620,
  });
  await rpc(ws, 'Page.navigate', { url: `${BASE}index.html#/studio?m=chain` });
  await sleep(2200);
  await evalJs('localStorage.clear()');
  await rpc(ws, 'Page.reload');
  await sleep(2400);

  const d = await evalJs(`(() => {
    const doc = document;
    const vw = window.innerWidth;
    const signal = doc.querySelector('.st-signal');
    const node = doc.querySelector('.st-chain-node');
    const moveBtn = doc.querySelector('.st-chain-btn');
    const grip = doc.querySelector('.st-chain-grip');
    const track = doc.querySelector('.st-track');
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const sr = r(signal);
    // 信号流图内部的子节点是否超出容器
    const overflowInside = signal
      ? [...signal.querySelectorAll('.st-signal-node')].some((el) => el.getBoundingClientRect().right > sr.right + 1)
      : false;
    return {
      vw,
      docW: doc.documentElement.scrollWidth,
      hasPanel: Boolean(doc.querySelector('[data-st-panel="chain"]')),
      signalOverflow: overflowInside,
      signalScroll: signal ? signal.scrollWidth > signal.clientWidth + 1 : null,
      trackH: track ? +r(track).height.toFixed(1) : null,
      nodeW: node ? +r(node).width.toFixed(1) : null,
      nodeH: node ? +r(node).height.toFixed(1) : null,
      moveW: moveBtn ? +r(moveBtn).width.toFixed(1) : null,
      moveH: moveBtn ? +r(moveBtn).height.toFixed(1) : null,
      gripW: grip ? +r(grip).width.toFixed(1) : null,
    };
  })()`);

  console.log([
    String(width).padStart(4),
    String(d.docW).padStart(6),
    (d.docW > d.vw ? '是' : '否').padStart(5),
    (d.signalOverflow ? '是' : '否').padStart(10),
    String(d.trackH).padStart(9),
    String(d.nodeW).padStart(9),
    `${d.moveW}×${d.moveH}`.padStart(9),
    String(d.gripW).padStart(6),
  ].join(' '));
}

ws.close();
chrome.kill();
process.exit(0);

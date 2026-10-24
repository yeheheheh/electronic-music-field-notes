// 频谱条代号渲染检查。
//
// 背景：知识库扩充后大族数量增加，FAMILY_CODES 没跟着长，其余走
// `name.slice(0,3).toUpperCase()` 兜底，切出 `R&B`（含 &）、
// `实验电` / `风格补` / `摇滚与`（中文截断），并让 ELE、CHI 各重复一次。
//
// 现在的约定：频谱条只画正式大族（`!archive && !supplement`），
// 每个可见代号都必须是三个 ASCII 字母且互不重复；补遗收纳桶不在条上出现。
//
// 用法：node scripts/regression/check-spectrum-codes.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;

const profile = mkdtempSync(join(tmpdir(), 'cdp-codes-'));
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

const ws = new WebSocket(await findTarget());
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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// 桌面端：代号可见，必须规范
await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
});
await rpc(ws, 'Page.navigate', { url: `${BASE}index.html#/` });
await sleep(2500);
await evalJs('localStorage.clear()');
await rpc(ws, 'Page.reload');
await sleep(2500);

const desktop = await evalJs(`(() => {
  const items = [...document.querySelectorAll('.spectrum-bar')];
  const meta = window.KB_DATA ? window.KB_DATA.meta.stats : {};
  return {
    count: items.length,
    officialCount: meta.families || null,
    supplementCount: meta.supplementFamilies || null,
    codes: items.map((el) => {
      const c = el.querySelector('.bar-code');
      const cs = getComputedStyle(c);
      return { code: c.textContent.trim(), display: cs.display };
    }),
  };
})()`);

console.log('\n频谱代号验证\n');
console.log(`共 ${desktop.count} 条柱子（桌面端 1440px）`);
if (desktop.officialCount !== null) {
  console.log(`数据侧：${desktop.officialCount} 个正式大族 + ${desktop.supplementCount} 个补遗收纳桶`);
}

// 频谱条只画正式大族，条数应与数据侧的正式大族数一致。
// 这条断言防的是「补遗桶漏进频谱条」——那样柱子会变多，窄屏更容易撑破。
check('条数等于正式大族数', desktop.officialCount === null || desktop.count === desktop.officialCount,
  `条=${desktop.count} 正式大族=${desktop.officialCount}`);

const visible = desktop.codes.filter((c) => c.display !== 'none');
check('桌面端代号可见', visible.length === desktop.count,
  `可见 ${visible.length}/${desktop.count}`);

const bad = visible.filter((c) => !/^[A-Z]{3}$/.test(c.code));
check('全部为三个 ASCII 字母', bad.length === 0,
  bad.length ? `异常：${bad.map((c) => `"${c.code}"`).join(', ')}` : '无中文截断、无标点');

const codes = visible.map((c) => c.code);
const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
check('代号互不重复', dupes.length === 0,
  dupes.length ? `重复：${[...new Set(dupes)].join(', ')}` : `${new Set(codes).size} 个唯一代号`);

// 窄屏：代号应隐藏（柱子太窄放不下），但柱子本身不能溢出
await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
  width: 320, height: 900, deviceScaleFactor: 1, mobile: true,
});
await rpc(ws, 'Page.reload');
await sleep(2500);

const narrow = await evalJs(`(() => {
  const items = [...document.querySelectorAll('.spectrum-bar')];
  const shown = items.filter((el) => getComputedStyle(el.querySelector('.bar-code')).display !== 'none');
  return {
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    shown: shown.length,
    count: items.length,
  };
})()`);

check('窄屏隐藏代号', narrow.shown === 0, `隐藏 ${narrow.count - narrow.shown}/${narrow.count}`);
check('窄屏无横向溢出', narrow.docW <= narrow.vw, `docW=${narrow.docW} vw=${narrow.vw}`);

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);
console.log(`JS 报错: ${errors.length ? errors.join(' | ') : '无'}`);

ws.close();
chrome.kill();
process.exit(pass === results.length ? 0 : 1);

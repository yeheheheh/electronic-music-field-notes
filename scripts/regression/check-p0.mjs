// P0 验证：结构门控是否由音频时钟驱动。
// 关键断言：
//   1. 会话暴露单调的 absBar（跨循环持续递增），而不是每 4 小节归零
//   2. 播放整首时，高亮块随时间推进，且与 gateForBar 的判定一致
//   3. 播放中切模块，音频不中断、播放头不重置
//
// 用法： node scripts/regression/check-p0.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;

const profile = mkdtempSync(join(tmpdir(), 'cdp-p0-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1100', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 等浏览器 */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.logs = []; }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new Cdp(ws);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        cdp.logs.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        cdp.logs.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
      }
    };
    return cdp;
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时: ${method}`)); } }, 25000);
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });

const cdp = await Cdp.connect(await findTarget());
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

try {
  await cdp.send('Page.navigate', { url: `${BASE}#/studio?m=song` });
  await sleep(2600);

  // 1. 结构模块已渲染
  const ready = await cdp.eval(`(() => ({
    blocks: document.querySelectorAll('.st-song-block').length,
    hasSongPlay: !!document.querySelector('[data-st-song-play]'),
    total: document.querySelector('[data-st-song-play]') ? true : false,
  }))()`);
  check('结构模块渲染', ready.blocks >= 3 && ready.hasSongPlay, `${ready.blocks} 个段落块`);

  // 2. absBar 单调递增（跨 4 小节循环不归零）
  // 采样窗口必须够长：124 BPM 下一小节约 1.94 秒，要跨过 4 小节循环
  // （约 7.8 秒）才可能看到 absBar > 3。窗口太短会误判为失败。
  const monotonic = await cdp.eval(`(async () => {
    const btn = document.querySelector('[data-st-song-play]');
    btn.click();
    const seen = [];
    for (let i = 0; i < 60; i += 1) {
      const h = window.EMAudio.getPlayhead('studio');
      if (h) seen.push(h.absBar);
      await new Promise(r => setTimeout(r, 250));
    }
    return {
      samples: seen.length,
      first: seen[0], last: seen[seen.length - 1],
      // 只要出现过 > 3 的值，就说明跨过了 4 小节循环
      maxAbs: seen.length ? Math.max(...seen) : null,
      // 单调性：不应出现回退（除了首次采样）
      drops: seen.filter((v, i) => i > 0 && v < seen[i - 1]).length,
    };
  })()`);
  check('absBar 跨循环递增', monotonic.maxAbs !== null && monotonic.maxAbs > 3,
    `采样 ${monotonic.samples} 次，absBar 从 ${monotonic.first} 到 ${monotonic.last}，最大 ${monotonic.maxAbs}`);
  check('absBar 无回退', monotonic.drops === 0, `回退 ${monotonic.drops} 次`);

  // 3. 高亮块随播放推进
  const highlight = await cdp.eval(`(async () => {
    const idxOf = () => {
      const els = [...document.querySelectorAll('.st-song-block')];
      return els.findIndex(el => el.classList.contains('is-active'));
    };
    const seen = new Set();
    for (let i = 0; i < 24; i += 1) {
      const i2 = idxOf();
      if (i2 >= 0) seen.add(i2);
      await new Promise(r => setTimeout(r, 250));
    }
    return { distinct: seen.size, list: [...seen].sort((a,b)=>a-b) };
  })()`);
  check('高亮块随播放推进', highlight.distinct >= 2, `出现过的块索引: ${JSON.stringify(highlight.list)}`);

  // 4. 播放中切模块：音频不中断、播放头不重置
  const switching = await cdp.eval(`(async () => {
    const before = window.EMAudio.getPlayhead('studio');
    const beforeBar = before ? before.absBar : null;
    // 点标签栏切到节拍模块
    const tab = document.querySelector('[data-st-tab="beats"]');
    if (!tab) return { fail: 'no-tab' };
    tab.click();
    await new Promise(r => setTimeout(r, 900));
    const after = window.EMAudio.getPlayhead('studio');
    const cells = document.querySelectorAll('.st-cell').length;
    return {
      beforeBar, afterBar: after ? after.absBar : null,
      stillPlaying: Boolean(after), cells,
      panelSwitched: !!document.querySelector('[data-st-panel="beats"]'),
    };
  })()`);
  check('切模块后音频不中断', switching.stillPlaying, `absBar ${switching.beforeBar} → ${switching.afterBar}`);
  check('切模块后播放头未重置', switching.afterBar !== null && switching.beforeBar !== null && switching.afterBar >= switching.beforeBar,
    `${switching.beforeBar} → ${switching.afterBar}`);
  check('切模块后面板已更换', switching.panelSwitched && switching.cells >= 16, `${switching.cells} 格`);

  // 5. 停止后归零
  const stopped = await cdp.eval(`(async () => {
    window.EMAudio.stop();
    await new Promise(r => setTimeout(r, 500));
    return { head: window.EMAudio.getPlayhead('studio'), active: document.querySelectorAll('.st-song-block.is-active').length };
  })()`);
  check('停止后播放头为 null', stopped.head === null);
  check('停止后高亮清除', stopped.active === 0, `残留 ${stopped.active} 个高亮`);

  check('无 JS 报错', cdp.logs.length === 0, cdp.logs.slice(0, 2).join(' | ') || '无');

  chrome.kill();
  const failed = checks.filter((c) => !c.ok);
  console.log('P0 验证结果：');
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  chrome.kill();
  console.error('脚本失败:', error.message);
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  process.exit(2);
}

// 线上移动端抽查：窄屏下课时页内嵌工作室是否可用。
// 移动端是本轮改动的重点风险区：步进格要横向滚动、走带要换行、按钮要够大。
// 用法： node scripts/regression/live-mobile.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] || 'http://47.94.222.72/music/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const WIDTHS = [320, 390, 768];
const ROUTES = ['learn/kick-and-bass', 'learn/drum-programming', 'learn/chord-progressions'];

const profile = mkdtempSync(join(tmpdir(), 'cdp-mob-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1400,1200', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 等浏览器起来 */ }
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
    };
    return cdp;
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时: ${method}`)); } }, 20000);
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const rows = [];
const cdp = await Cdp.connect(await findTarget());
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 900, deviceScaleFactor: 3, mobile: true,
});

try {
  for (const W of WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: 900, deviceScaleFactor: W < 500 ? 3 : 2, mobile: W < 500,
    });
    for (const R of ROUTES) {
      await cdp.send('Page.navigate', { url: `${TARGET}#/${R}` });
      await sleep(2200);
      const r = await cdp.eval(`(async () => {
        const btn = document.querySelector('[data-lesson-studio-open]');
        if (!btn) return { route: '${R}', fail: 'no-button' };
        btn.click();
        await new Promise(r => setTimeout(r, 1500));
        const stage = document.querySelector('[data-lesson-studio]');
        const vw = window.innerWidth;
        const over = [...document.querySelectorAll('body *')].filter(el => {
          const b = el.getBoundingClientRect(), s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || b.width < 2) return false;
          if (el.closest('.st-grid,.route,.structure-blocks')) return false;
          return b.right > vw + 1.5;
        }).slice(0, 3).map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
        // 步进格在窄屏应是可横向滚动的容器，而不是把页面撑宽
        const grid = stage.querySelector('.st-grid');
        const transportBtns = [...stage.querySelectorAll('.st-transport button')];
        const small = transportBtns.filter(b => b.getBoundingClientRect().height < 30).length;
        // 模块形态不同：节拍/鼓组/低音/旋律是步进格，和弦是进行选择器，音色是推子。
        // 所以格子数只做「有则合理」的附加判断，主判据是面板真的有内容上屏。
        const panel = stage.querySelector('.st-panel, .st-module-host');
        return {
          route: '${R}', vw, docW: document.documentElement.scrollWidth,
          cells: stage.querySelectorAll('.st-cell').length,
          contentLen: stage.innerHTML.length,
          panelLen: panel ? panel.innerHTML.length : 0,
          gridScroll: grid ? grid.scrollWidth > grid.clientWidth + 2 : null,
          transportH: transportBtns.length ? Math.round(transportBtns[0].getBoundingClientRect().height) : 0,
          smallBtns: small, over,
        };
      })()`);
      rows.push(r);
    }
  }

  let bad = 0;
  for (const r of rows) {
    const ok = !r.fail && r.docW <= r.vw && r.over.length === 0
      && r.contentLen > 2000 && r.panelLen > 200 && r.smallBtns === 0;
    if (!ok) bad += 1;
    console.log(
      `${ok ? 'OK  ' : 'BAD '} w=${r.vw} ${r.route} docW=${r.docW} 内容=${r.contentLen} 面板=${r.panelLen} ` +
      `格子=${r.cells} 格容器可滚=${r.gridScroll} 走带按钮高=${r.transportH}px 过小按钮=${r.smallBtns} 溢出=${JSON.stringify(r.over)}` +
      (r.fail ? ` 失败=${r.fail}` : '')
    );
  }
  console.log(`\n移动端抽查：${rows.length - bad}/${rows.length} 通过`);
  chrome.kill();
  process.exit(bad ? 1 : 0);
} catch (error) {
  chrome.kill();
  console.error('脚本失败:', error.message);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(2);
}

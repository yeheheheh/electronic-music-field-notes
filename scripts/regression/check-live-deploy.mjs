// 部署后专项验证：确认本轮改动的四项新特性在线上真的生效。
// 与 live-check.mjs 的分工：那个验证「站点还能不能用」，这个验证「新东西上没上线」。
// 用法： node .deploy-tmp/verify-live.mjs [线上地址]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] || 'http://47.94.222.72/music/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;

const profile = mkdtempSync(join(tmpdir(), 'cdp-verify-'));
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
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
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
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
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
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`超时: ${method}`)); }
      }, 20000);
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const check = (name, ok, detail) => console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`);

const cdp = await Cdp.connect(await findTarget());
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

// 1. 首页：信号条只画正式大族，另有补充桶提示
await cdp.send('Page.navigate', { url: TARGET });
await sleep(3800);
const home = await cdp.eval(`(() => ({
  bars: document.querySelectorAll('.spectrum-bar').length,
  foot: (document.querySelector('.spectrum-foot') || {}).textContent || '',
  index: [...document.querySelectorAll('.hero-index span')].map(s => s.textContent.trim()),
  signal: (document.querySelector('.spectrum-head .mono-label') || {}).textContent || '',
}))()`);
check('首页信号条 = 正式大族 24 根', home.bars === 24, `${home.bars} 根`);
check('信号条标题写明 24 个大族', /24 个大族/.test(home.signal), home.signal.trim());
check('首页有补充桶提示', /补充收纳桶/.test(home.foot), home.foot.trim().slice(0, 40));
check('首页规模显示 1,376 条知识', home.index.some((t) => t.includes('1,376')), home.index.join(' | '));
check('首页规模显示 24 个大族', home.index.some((t) => /^24\s*个大族$/.test(t)), home.index.join(' | '));

// 2. 图谱页：正式大族与补充桶分区
await cdp.eval(`location.hash = '#/atlas'`);
await sleep(2000);
const atlas = await cdp.eval(`(() => ({
  cards: document.querySelectorAll('.family-card').length,
  supplementTags: [...document.querySelectorAll('.family-card-top .mono-label')].filter(e => e.textContent.trim() === 'SUPPLEMENT').length,
  familyTags: [...document.querySelectorAll('.family-card-top .mono-label')].filter(e => e.textContent.trim() === 'FAMILY').length,
  headText: [...document.querySelectorAll('.results-title')].map(e => e.textContent.trim()),
  bucketTitle: [...document.querySelectorAll('.results-title')].some(e => /补充收纳桶/.test(e.textContent)),
  treeLabel: (document.querySelector('.tree-group-label') || {}).textContent || '',
}))()`);
check('图谱卡片共 30 张（24+5+1）', atlas.cards === 30, `${atlas.cards} 张`);
check('正式大族卡片 24 张', atlas.familyTags === 24, `${atlas.familyTags} 张标 FAMILY`);
check('补充桶卡片 5 张', atlas.supplementTags === 5, `${atlas.supplementTags} 张标 SUPPLEMENT`);
check('图谱有「补充收纳桶」分区', atlas.bucketTitle, atlas.headText.join(' / '));
check('分类树有分组标签', atlas.treeLabel.includes('补充收纳桶'), atlas.treeLabel);

// 3. 知识库页：三个数字
await cdp.eval(`location.hash = '#/library'`);
await sleep(1600);
const lib = await cdp.eval(`(() => ({
  stats: [...document.querySelectorAll('.page-head-stats div')].map(d => d.textContent.replace(/\\s+/g,' ').trim()),
  families: document.querySelectorAll('.family-card').length,
}))()`);
check('知识库页显示 1,376 / 158 / 1,541', /1,376/.test(lib.stats.join(' ')) && /158/.test(lib.stats.join(' ')) && /1,541/.test(lib.stats.join(' ')), lib.stats.join(' | '));

// 4. 工作室：九模块
await cdp.eval(`location.hash = '#/studio'`);
await sleep(2600);
const studio = await cdp.eval(`(() => ({
  tabs: document.querySelectorAll('[data-st-tab]').length,
  ids: [...document.querySelectorAll('[data-st-tab]')].map(t => t.dataset.stTab),
}))()`);
check('工作室 9 个模块标签', studio.tabs === 9, `${studio.tabs} 个: ${studio.ids.join(',')}`);
check('包含 chain / mix / bounce 三个新模块',
  ['chain', 'mix', 'bounce'].every((id) => studio.ids.includes(id)), studio.ids.join(','));
const chainPanel = await cdp.eval(`(async () => {
  document.querySelector('[data-st-tab="chain"]').click();
  await new Promise(r => setTimeout(r, 500));
  const p = document.querySelector('[data-st-panel="chain"]');
  return {
    board: !!p.querySelector('[data-st-chain-board]'),
    nodes: p.querySelectorAll('[data-st-chain-node]').length,
    slots: p.querySelectorAll('[data-st-chain-slot]').length,
  };
})()`);
check('信号链模块已上线（A/B 双槽 + 4 效果器）',
  chainPanel.board && chainPanel.nodes === 4 && chainPanel.slots === 2,
  `board=${chainPanel.board} nodes=${chainPanel.nodes} slots=${chainPanel.slots}`);

check('无 JS 运行时报错', cdp.logs.length === 0, cdp.logs.length ? cdp.logs.slice(0, 3).join(' | ') : '无');

chrome.kill();
process.exit(0);

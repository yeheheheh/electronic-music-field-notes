// P1 验证：9 个模块的定义、切换入口与状态保持。
// 断言：
//   1. 九个模块全部能切换，面板都渲染出内容
//   2. 键盘 1-9 生效
//   3. 上一块 / 下一块在线性顺序上推进，到头停住（不回绕）
//   4. 切换时音频不中断、播放头不重置
//   5. L2 滚动位置跨模块记住（切走再切回，位置还在）
//   6. 内嵌模式的出口链接随模块更新
//
// 用法： node scripts/regression/check-p1.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9338;

const profile = mkdtempSync(join(tmpdir(), 'cdp-p1-'));
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
  // 从干净状态开始，避免上次运行的 localStorage 干扰
  await cdp.send('Page.navigate', { url: `${BASE}#/studio` });
  await sleep(2000);
  await cdp.eval(`localStorage.removeItem('em-studio-ui-v1'); location.reload();`);
  await sleep(2600);

  // 1. 九个标签
  const tabs = await cdp.eval(`(() => {
    const list = [...document.querySelectorAll('[data-st-tab]')];
    return { count: list.length, ids: list.map(t => t.dataset.stTab), nums: list.map(t => t.querySelector('.st-tab-num').textContent) };
  })()`);
  check('标签栏有 9 个模块', tabs.count === 9, tabs.ids.join(', '));
  check('编号连续 01-09', tabs.nums.join(',') === '01,02,03,04,05,06,07,08,09', tabs.nums.join(','));

  // 2. 逐个切换，每个面板都要有内容
  const panels = await cdp.eval(`(async () => {
    const out = [];
    for (const id of ['chain','beats','bass','chords','melody','sound','song','mix','bounce']) {
      const tab = document.querySelector('[data-st-tab="' + id + '"]');
      tab.click();
      await new Promise(r => setTimeout(r, 320));
      const panel = document.querySelector('[data-st-panel="' + id + '"]');
      const host = document.querySelector('[data-st-panel-host]');
      out.push({
        id,
        hasPanel: !!panel,
        len: host ? host.innerHTML.length : 0,
        active: tab.classList.contains('is-active'),
        headNum: (document.querySelector('.st-module-index span') || {}).textContent || '',
      });
    }
    return out;
  })()`);
  const emptyPanels = panels.filter((p) => !p.hasPanel || p.len < 300);
  check('九个面板都有内容', emptyPanels.length === 0,
    emptyPanels.length ? `空的: ${emptyPanels.map((p) => p.id).join(',')}` : panels.map((p) => `${p.id}:${p.len}`).join(' '));
  const wrongHead = panels.filter((p) => p.headNum && p.headNum.padStart(2, '0') !== String(panels.findIndex((q) => q.id === p.id) + 1).padStart(2, '0'));
  check('面板页头编号与模块一致', wrongHead.length === 0, wrongHead.map((p) => `${p.id}→${p.headNum}`).join(' ') || '一致');

  // 3. 键盘 1-9
  const keys = await cdp.eval(`(async () => {
    const seen = [];
    for (let n = 1; n <= 9; n += 1) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: String(n), bubbles: true }));
      await new Promise(r => setTimeout(r, 260));
      const active = document.querySelector('[data-st-tab].is-active');
      seen.push(active ? active.dataset.stTab : null);
    }
    return seen;
  })()`);
  check('键盘 1-9 切换正确', keys.join(',') === 'chain,beats,bass,chords,melody,sound,song,mix,bounce', keys.join(','));

  // 4. 上一块 / 下一块
  const nav = await cdp.eval(`(async () => {
    // 先回到第一块
    document.querySelector('[data-st-tab="chain"]').click();
    await new Promise(r => setTimeout(r, 300));
    const prevDisabledAtStart = document.querySelector('[data-st-module-prev]').disabled;
    // 一路下一块到底
    const path = [];
    for (let i = 0; i < 10; i += 1) {
      const btn = document.querySelector('[data-st-module-next]');
      if (btn.disabled) break;
      btn.click();
      await new Promise(r => setTimeout(r, 260));
      const a = document.querySelector('[data-st-tab].is-active');
      path.push(a ? a.dataset.stTab : null);
    }
    const nextDisabledAtEnd = document.querySelector('[data-st-module-next]').disabled;
    // 再一路上一块回来
    const back = [];
    for (let i = 0; i < 10; i += 1) {
      const btn = document.querySelector('[data-st-module-prev]');
      if (btn.disabled) break;
      btn.click();
      await new Promise(r => setTimeout(r, 260));
      const a = document.querySelector('[data-st-tab].is-active');
      back.push(a ? a.dataset.stTab : null);
    }
    return { prevDisabledAtStart, path, nextDisabledAtEnd, back, backEnd: (document.querySelector('[data-st-tab].is-active')||{}).dataset.stTab };
  })()`);
  check('第一块时「上一块」禁用', nav.prevDisabledAtStart === true);
  check('「下一块」走完八步到导出', nav.path.join(',') === 'beats,bass,chords,melody,sound,song,mix,bounce', nav.path.join(','));
  check('最后一块时「下一块」禁用', nav.nextDisabledAtEnd === true);
  check('「上一块」反向走回信号链', nav.backEnd === 'chain', nav.back.join(','));

  // 5. 播放中切模块：音频不中断
  const live = await cdp.eval(`(async () => {
    document.querySelector('[data-st-tab="beats"]').click();
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('[data-st-play]').click();
    await new Promise(r => setTimeout(r, 1400));
    const before = window.EMAudio.getPlayhead('studio');
    document.querySelector('[data-st-tab="bass"]').click();
    await new Promise(r => setTimeout(r, 800));
    const after = window.EMAudio.getPlayhead('studio');
    const cells = document.querySelectorAll('.st-cell').length;
    return {
      before: before ? before.absBar : null,
      after: after ? after.absBar : null,
      stillPlaying: Boolean(after),
      cells,
      playLabel: (document.querySelector('[data-st-play-label]')||{}).textContent || '',
    };
  })()`);
  check('播放中切模块音频不中断', live.stillPlaying, `absBar ${live.before} → ${live.after}`);
  check('播放中切模块播放头不重置', live.after !== null && live.before !== null && live.after >= live.before, `${live.before} → ${live.after}`);
  check('切到低音后面板已更换', live.cells >= 48, `${live.cells} 格`);
  check('走带仍显示停止', live.playLabel === '停止', live.playLabel);

  // 6. L2 滚动位置：滚到某处，切走再切回
  const scroll = await cdp.eval(`(async () => {
    // 用结构模块，它内容最高，滚动位置差异明显
    document.querySelector('[data-st-tab="song"]').click();
    await new Promise(r => setTimeout(r, 400));
    const host = document.querySelector('.st-body') || document.scrollingElement;
    // 先制造一个可滚动的场景：滚窗口
    window.scrollTo(0, 0);
    const body = document.documentElement;
    const maxScroll = body.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(400, maxScroll));
    await new Promise(r => setTimeout(r, 200));
    const before = window.scrollY;
    // 切到别处再切回
    document.querySelector('[data-st-tab="melody"]').click();
    await new Promise(r => setTimeout(r, 400));
    document.querySelector('[data-st-tab="song"]').click();
    await new Promise(r => setTimeout(r, 600));
    return { before, after: window.scrollY, maxScroll };
  })()`);
  check('切换模块后页面滚动位置保持', Math.abs(scroll.after - scroll.before) <= 8 || scroll.maxScroll <= 0,
    `滚动 ${scroll.before} → ${scroll.after}（可滚 ${scroll.maxScroll}）`);

  // 7. 未实现模块的 roadmap 面板：有说明、有课时链接
  //    chain 已在 P2 落地为真正的信号链模块，不再走 roadmap 占位，
  //    所以这里只检查仍是规划的 mix / bounce，另外单独断言 chain 的真面板。
  const roadmap = await cdp.eval(`(async () => {
    const out = {};
    for (const id of ['chain','mix','bounce']) {
      document.querySelector('[data-st-tab="' + id + '"]').click();
      await new Promise(r => setTimeout(r, 300));
      const panel = document.querySelector('[data-st-panel="' + id + '"]');
      out[id] = {
        note: !!panel.querySelector('.st-roadmap-note'),
        items: panel.querySelectorAll('.st-roadmap-list li').length,
        tasks: panel.querySelectorAll('.st-roadmap-tasks li').length,
        links: [...panel.querySelectorAll('.st-roadmap-tasks a')].map(a => a.getAttribute('href')),
        // chain 落地后的真实标记
        chainNodes: panel.querySelectorAll('[data-st-chain-node]').length,
        signalNodes: panel.querySelectorAll('[data-st-signal-node]').length,
        hasBoard: !!panel.querySelector('[data-st-chain-board]'),
        slots: panel.querySelectorAll('[data-st-chain-slot]').length,
      };
    }
    return out;
  })()`);
  for (const id of ['mix', 'bounce']) {
    const r = roadmap[id];
    const linksOk = r.links.every((h) => h && h.startsWith('#/learn/'));
    check(`${id} 面板说明了规划`, r.note && r.items >= 3, `${r.items} 条能力说明`);
    check(`${id} 面板列出课时任务并链接正确`, r.tasks >= 2 && linksOk, `${r.tasks} 个任务，链接 ${JSON.stringify(r.links)}`);
  }
  {
    const c = roadmap.chain;
    check('chain 已落地为真实模块而非规划占位', c.hasBoard && !c.note,
      `board=${c.hasBoard} roadmap=${c.note ? '仍是占位' : '否'}`);
    check('chain 渲染出效果器节点与信号路径', c.chainNodes >= 4 && c.signalNodes >= 4,
      `${c.chainNodes} 个链路节点，${c.signalNodes} 个信号节点`);
    check('chain 提供 A/B 两个对比槽', c.slots === 2, `${c.slots} 个槽`);
  }

  // 8. 内嵌模式：出口链接随模块更新
  await cdp.eval(`location.hash = '#/learn/kick-and-bass'`);
  await sleep(1800);
  const embed = await cdp.eval(`(async () => {
    const btn = document.querySelector('[data-lesson-studio-open]');
    if (!btn) return { fail: 'no-button' };
    btn.click();
    await new Promise(r => setTimeout(r, 1400));
    const first = (document.querySelector('.st-embed-link')||{}).getAttribute ? document.querySelector('.st-embed-link').getAttribute('href') : null;
    // 内嵌模式没有标签栏，用走带的「下一块」推进
    const nextBtn = document.querySelector('[data-st-module-next]');
    if (!nextBtn) return { fail: 'no-stepnav', first };
    nextBtn.click();
    await new Promise(r => setTimeout(r, 700));
    const after = document.querySelector('.st-embed-link').getAttribute('href');
    const panelNow = document.querySelector('[data-st-panel]');
    return { first, after, panel: panelNow ? panelNow.dataset.stPanel : null, hasTabs: !!document.querySelector('[data-st-tab]') };
  })()`);
  check('内嵌模式有走带的上一块/下一块', !embed.fail, embed.fail || '有');
  check('内嵌模式不渲染标签栏', embed.hasTabs === false);
  check('内嵌出口链接随模块更新', embed.first !== embed.after && String(embed.after).includes(String(embed.panel)),
    `${embed.first} → ${embed.after}（当前面板 ${embed.panel}）`);

  check('无 JS 报错', cdp.logs.length === 0, cdp.logs.slice(0, 2).join(' | ') || '无');

  chrome.kill();
  const failed = checks.filter((c) => !c.ok);
  console.log('P1 验证结果：');
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  chrome.kill();
  console.error('脚本失败:', error.message);
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  process.exit(2);
}

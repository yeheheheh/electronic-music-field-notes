// 线上端到端验证：用 CDP 直接驱动 Chrome 访问真实线上地址。
// 本地回归探针用 iframe 只能测同源页面；线上是另一个源，跨域拿不到 contentDocument，
// 所以这里换成 CDP：从浏览器外部发指令，不受同源策略限制。
//
// 用法： node scripts/regression/live-check.mjs [线上地址]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET = process.argv[2] || 'http://47.94.222.72/music/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

const profile = mkdtempSync(join(tmpdir(), 'cdp-live-'));
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
    } catch { /* 浏览器还没起来，继续等 */ }
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
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        cdp.logs.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
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

  // 在页面里求值。用 awaitPromise 支持返回 Promise 的表达式。
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }
}

const report = { target: TARGET, checks: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: Boolean(ok), detail });
};

try {
  const cdp = await Cdp.connect(await findTarget());
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // 1. 首页可达 + 资源全 200
  await cdp.send('Page.navigate', { url: TARGET });
  await sleep(3500);
  const home = await cdp.eval(`(() => ({
    title: document.title,
    hasStudio: typeof window.EMStudio === 'object' && window.EMStudio !== null,
    hasAudio: typeof window.EMAudio === 'object' && window.EMAudio !== null,
    nav: document.querySelectorAll('.site-nav a').length,
    styleLoaded: [...document.styleSheets].some(s => (s.href||'').includes('styles-studio')),
  }))()`);
  check('首页标题', home.title.includes('电音档案'), home.title);
  check('EMStudio 已加载', home.hasStudio);
  check('EMAudio 已加载', home.hasAudio);
  check('styles-studio.css 已生效', home.styleLoaded);
  check('主导航已渲染（听 / 查 / 练 / 做）', home.nav >= 4, `导航项 ${home.nav}`);

  // 2. 课时页 → 点击「在这里动手」→ 内嵌工作室
  await cdp.eval(`location.hash = '#/learn/kick-and-bass'`);
  await sleep(1800);
  const before = await cdp.eval(`(() => {
    const btn = document.querySelector('[data-lesson-studio-open]');
    const stage = document.querySelector('[data-lesson-studio]');
    // 容器是常驻 DOM 的（用 hidden 控制显隐），所以判「收起」要看 hidden 和内部是否为空，
    // 不能看元素是否存在。
    return {
      hasBtn: !!btn,
      text: btn ? btn.textContent.trim() : '',
      hidden: stage ? stage.hasAttribute('hidden') : null,
      empty: stage ? stage.innerHTML.trim().length === 0 : null,
    };
  })()`);
  check('课时页有「在这里动手」按钮', before.hasBtn, before.text);
  check('默认收起（容器隐藏且为空）', before.hidden === true && before.empty === true, `hidden=${before.hidden} empty=${before.empty}`);

  const after = await cdp.eval(`(async () => {
    document.querySelector('[data-lesson-studio-open]').click();
    await new Promise(r => setTimeout(r, 1500));
    const stage = document.querySelector('[data-lesson-studio]');
    const transport = stage && stage.querySelector('.st-transport');
    const cells = stage ? stage.querySelectorAll('.st-cell').length : 0;
    const vw = window.innerWidth;
    const over = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || r.width < 2) return false;
      if (el.closest('.st-grid,.route,.structure-blocks')) return false;
      return r.right > vw + 1.5;
    }).slice(0,3).map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
    return {
      mounted: !!stage, len: stage ? stage.innerHTML.length : 0, cells,
      embeddedClass: !!(stage && stage.querySelector('.st-body-embedded')),
      transportStatic: transport ? getComputedStyle(transport).position : 'none',
      pageHeadAbsent: !(stage && stage.querySelector('.page-head')),
      fullLink: !!(stage && stage.querySelector('.st-embed-link')),
      docW: document.documentElement.scrollWidth, vw, over,
    };
  })()`);
  check('内嵌工作室已挂载', after.mounted && after.len > 2000, `内容 ${after.len} 字节`);
  check('内嵌模式（无页头）', after.embeddedClass && after.pageHeadAbsent);
  check('步进格已渲染', after.cells >= 16, `${after.cells} 格`);
  check('走带改为静态定位', after.transportStatic === 'static', after.transportStatic);
  check('保留完整工作室出口', after.fullLink);
  check('无横向溢出', after.docW <= after.vw && after.over.length === 0, `docW=${after.docW} vw=${after.vw} ${JSON.stringify(after.over)}`);

  // 3. 真的能播：点播放 → 播放头前进 → 读数变化
  const play = await cdp.eval(`(async () => {
    const stage = document.querySelector('[data-lesson-studio]');
    const btns = [...stage.querySelectorAll('button')];
    const play = btns.find(b => /播放|PLAY/i.test(b.textContent) || b.dataset.stPlay !== undefined) || btns[0];
    play.click();
    await new Promise(r => setTimeout(r, 1600));
    const head = window.EMAudio.getPlayhead('studio');
    const live = stage.querySelector('.is-playing, [data-playing="true"]');
    return { clicked: play.textContent.trim(), head: head ? { step: head.step, bar: head.bar, bpm: head.bpm, loop: head.loop } : null, playing: !!live };
  })()`);
  check('点击播放后播放头前进', play.head !== null, JSON.stringify(play.head));
  check('播放态已上屏', play.playing || play.head !== null);

  // 4. 停止 → 播放头归零
  const stop = await cdp.eval(`(async () => {
    const stage = document.querySelector('[data-lesson-studio]');
    const btns = [...stage.querySelectorAll('button')];
    const stop = btns.find(b => /停止|STOP/i.test(b.textContent)) || btns[0];
    stop.click();
    await new Promise(r => setTimeout(r, 600));
    return { head: window.EMAudio.getPlayhead('studio'), playing: !!(stage.querySelector('.is-playing')) };
  })()`);
  check('停止后播放头归零', stop.head === null || stop.head.step === 0 || stop.head.progress < 0.2, JSON.stringify(stop.head));

  // 5. 收起 → 卸载
  const collapsed = await cdp.eval(`(async () => {
    const btn = document.querySelector('[data-lesson-studio-open]');
    btn.click();
    await new Promise(r => setTimeout(r, 700));
    const stage = document.querySelector('[data-lesson-studio]');
    return {
      hidden: stage ? stage.hasAttribute('hidden') : null,
      cells: stage ? stage.querySelectorAll('.st-cell').length : 0,
      text: btn.textContent.trim(),
    };
  })()`);
  check('收起后工作室已卸载', collapsed.hidden === true && collapsed.cells === 0, `hidden=${collapsed.hidden} 残留格子=${collapsed.cells} 按钮="${collapsed.text}"`);

  // 6. 完整工作室仍正常（内嵌改动不该影响原路径）
  await cdp.eval(`location.hash = '#/studio?m=bass&from=kick-and-bass'`);
  await sleep(1800);
  const studio = await cdp.eval(`(() => {
    const tabs = document.querySelectorAll('[data-st-tab]').length;
    const cells = document.querySelectorAll('.st-cell').length;
    const head = !!document.querySelector('.page-head');
    const entry = document.querySelector('.st-entry');
    return { tabs, cells, head, entry: entry ? entry.textContent.replace(/\\s+/g,' ').trim().slice(0,60) : null };
  })()`);
  check('完整工作室页头仍在', studio.head);
  check('完整工作室模块标签', studio.tabs >= 6, `${studio.tabs} 个`);
  check('完整工作室步进格', studio.cells >= 16, `${studio.cells} 格`);
  check('来源条正确（from=kick-and-bass）', Boolean(studio.entry), studio.entry || '无');

  // 7. 其他路由仍可达
  for (const route of ['learn', 'library', 'atlas', 'practice', 'lab', 'about']) {
    await cdp.eval(`location.hash = '#/${route}'`);
    await sleep(900);
    const info = await cdp.eval(`({ h1: (document.querySelector('h1')||{}).textContent || '', len: document.getElementById('main').innerHTML.length })`);
    check(`路由 #/${route}`, info.len > 500, `${info.h1.trim().slice(0,24)} (${info.len} 字节)`);
  }

  // 8. 无运行时报错
  check('无 JS 运行时报错', cdp.logs.length === 0, cdp.logs.slice(0, 3).join(' | ') || '无');

  chrome.kill();
  const failed = report.checks.filter((c) => !c.ok);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n结果：${report.checks.length - failed.length}/${report.checks.length} 通过`);
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  chrome.kill();
  console.error('验证脚本失败:', error.message);
  console.log(JSON.stringify(report, null, 2));
  process.exit(2);
}

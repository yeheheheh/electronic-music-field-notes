// 部署后专项验证：确认本轮改动的 DJ 课程、章节导读与既有特性在线上真的生效。
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

// 1. 首页：四轨入口、规模与「今天听这条」
await cdp.send('Page.navigate', { url: TARGET });
for (let i = 0; i < 20; i += 1) {
  const ready = await cdp.eval(`document.querySelectorAll('.track').length === 4`);
  if (ready) break;
  await sleep(400);
}
await sleep(400);
const home = await cdp.eval(`(() => ({
  tracks: document.querySelectorAll('.track').length,
  codes: [...document.querySelectorAll('.track-code')].map(e => e.textContent.trim()).join(','),
  links: [...document.querySelectorAll('.track-links')].map(e => e.querySelectorAll('a').length).join('/'),
  scale: (document.querySelector('.hero-scale') || {}).innerText || '',
  daily: (document.querySelector('[data-daily-name]') || {}).textContent || '',
}))()`);
check('首页有四个入口', home.tracks === 4, `${home.tracks} 个`);
check('四个入口指向 听 / 查 / 练 / 做', home.codes === 'LISTEN,SEARCH,TRAIN,MAKE', home.codes);
check('每条入口至少三个链接', home.links.split('/').every((n) => Number(n) >= 3), home.links);
check('首页规模显示 1,376 条资料', /1,376/.test(home.scale), home.scale.replace(/\s+/g, ' ').trim());
check('首页规模显示 24 个大族', /24/.test(home.scale), home.scale.replace(/\s+/g, ' ').trim());
check('首页有「今天听这条」', home.daily.length > 0, home.daily);

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
check('知识库页显示 1,376 / 187 / 1,628', /1,376/.test(lib.stats.join(' ')) && /187/.test(lib.stats.join(' ')) && /1,628/.test(lib.stats.join(' ')), lib.stats.join(' | '));

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

// 5. DJ 课程页：41 集、8 章、转写与导读入口
await cdp.eval(`location.hash = '#/dj/course?ep=18'`);
await sleep(1800);
const dj = await cdp.eval(`(() => ({
  title: document.title,
  h1: (document.querySelector('.djc-reader-head h1') || {}).textContent || '',
  episodes: document.querySelectorAll('.djc-index .djc-episode').length,
  chapters: document.querySelectorAll('.djc-index .djc-chapter').length,
  transcript: ((document.querySelector('.djc-transcript') || {}).innerText || '').length,
  headings: document.querySelectorAll('.djc-transcript h2, .djc-transcript h3, .djc-transcript h4').length,
  persona: /小东|大家好|我是/.test((document.querySelector('.djc-transcript') || {}).innerText || ''),
  guideLinks: document.querySelectorAll('.djc-index .djc-chapter-guide').length,
}))()`);
check('DJ 课程页 41 集 / 8 章', dj.episodes === 41 && dj.chapters === 8, `${dj.episodes} 集 / ${dj.chapters} 章`);
check('DJ 课程笔记已上线', dj.transcript > 800 && dj.headings >= 1, `${dj.transcript} 字符 / ${dj.headings} 个标题`);
check('DJ 课程笔记已去除口播人格', !dj.persona, dj.persona ? '仍含小东/大家好/我是' : '无');
check('DJ 章节导读入口 8 个', dj.guideLinks === 8, `${dj.guideLinks} 个`);
check('DJ 课程页标题正确', dj.title.includes('DJ 修炼手册') && dj.h1.includes('CUE'), `${dj.title} | ${dj.h1}`);

// 6. 章节导读页：入库、标题、回链剧集
await cdp.eval(`location.hash = '#/doc/guide:dj-04'`);
await sleep(1600);
const guide = await cdp.eval(`(() => ({
  h1: (document.querySelector('.doc-title') || {}).textContent || '',
  chips: document.querySelectorAll('.dj-guide-panel .chip').length,
  source: (document.querySelector('.doc-aside a[target="_blank"]') || {}).href || '',
  practice: ((document.querySelector('.doc-body') || {}).innerText || '').includes('练习与验收'),
}))()`);
check('章节导读已入库', guide.h1.includes('对拍') && guide.practice, guide.h1);
check('导读回链 3 集', guide.chips === 3, `${guide.chips} 个`);
check('导读来源指向课程', guide.source.includes('BV1DK4y1g7QM'), guide.source);

// 7. 课程检索过滤器
await cdp.eval(`location.hash = '#/search?q=CUE%20%E7%82%B9&type=course'`);
await sleep(1600);
const courseSearch = await cdp.eval(`(() => ({
  active: (document.querySelector('.search-filter.is-active') || {}).textContent || '',
  count: document.querySelectorAll('.search-result').length,
  first: document.querySelector('.search-result')?.getAttribute('href') || '',
}))()`);
check('课程检索过滤器可用', courseSearch.active.trim() === '课程' && courseSearch.count > 0, `${courseSearch.active.trim()} / ${courseSearch.count} 条`);
check('课程结果链回课程页', decodeURIComponent(courseSearch.first || '').startsWith('#/dj/course?ep='), courseSearch.first);

// 13. 拼写修正与 AI 复制
await cdp.eval(`location.hash = '#/search?q=beatmach'`);
await sleep(1400);
const aiSearch = await cdp.eval(`(() => ({ meta: (document.querySelector('.results-meta') || {}).textContent || '', copy: !!document.querySelector('[data-copy-ai-search]') }))()`);
check('搜索拼写修正 + AI 复制', aiSearch.meta.includes('beatmatch') && aiSearch.copy, aiSearch.meta.trim().slice(0, 80));
await cdp.eval(`location.hash = '#/doc/bilibili-dj-18'`);
await sleep(1400);
const aiDoc = await cdp.eval(`!!document.querySelector('[data-copy-ai-doc]')`);
check('文档页 AI 复制', aiDoc, aiDoc ? '有' : '缺少');

// 14. 自动接歌台 demo
await cdp.eval(`location.hash = '#/dj/automix'`);
await sleep(2300);
const automix = await cdp.eval(`(() => ({
  shell: !!document.querySelector('.dja-shell'),
  cards: document.querySelectorAll('.dja-card').length,
  transitions: document.querySelectorAll('.dja-transition').length,
  demo: /演示数据|本地引擎/.test((document.querySelector('#djaEngine') || {}).textContent || ''),
  overflow: document.documentElement.scrollWidth - window.innerWidth,
}))()`);
check('自动接歌台 demo 在线', automix.shell && automix.cards === 4 && automix.transitions === 3, `${automix.cards} 首 / ${automix.transitions} 段`);
check('自动接歌台有引擎状态', automix.demo, automix.demo ? '有' : '缺少');
check('自动接歌台无横向溢出', automix.overflow <= 1, `${automix.overflow}px`);


// 8. 新手起步
await cdp.eval(`location.hash = '#/start'`);
await sleep(1600);
const start = await cdp.eval(`(() => ({
  paths: document.querySelectorAll('.start-path').length,
  tasks: document.querySelectorAll('[data-start-task]').length,
  stats: document.querySelectorAll('.start-stat').length,
  faqs: document.querySelectorAll('.start-faq details').length,
}))()`);
check('新手起步 3 条路径 / 21 任务', start.paths === 3 && start.tasks === 21, `${start.paths} 路径 / ${start.tasks} 任务`);
check('新手起步 4 格进度 + FAQ', start.stats === 4 && start.faqs >= 4, `${start.stats} 格 / ${start.faqs} 条 FAQ`);

// 9. DJ 现场手册
await cdp.eval(`location.hash = '#/dj/field-guide'`);
await sleep(1400);
const field = await cdp.eval(`(() => ({
  sections: document.querySelectorAll('.djfg-section').length,
  items: document.querySelectorAll('[data-field-item]').length,
  print: !!document.querySelector('[data-field-print]'),
  next: !!document.querySelector('.djfg-next'),
}))()`);
check('DJ 现场手册 3 章 / 24 项', field.sections === 3 && field.items === 24, `${field.sections} 章 / ${field.items} 项`);
check('现场手册可打印', field.print, field.print ? '有打印入口' : '缺少');
check('现场手册有下一步引导', !!field.next, field.next ? '有' : '缺少');

// 10. 乐句计数练习
await cdp.eval(`location.hash = '#/practice?mode=phrase'`);
await sleep(1400);
const phrase = await cdp.eval(`(() => ({
  panel: !!document.querySelector('.phrase-panel'),
  modes: document.querySelectorAll('[data-practice-mode]').length,
  bars: document.querySelectorAll('[data-phrase-bar]').length,
  phrases: document.querySelectorAll('[data-phrase-index]').length,
  next: !!document.querySelector('.phrase-next'),
}))()`);
check('乐句计数面板已上线', phrase.panel && phrase.modes === 3, `${phrase.modes} 个模式`);
check('乐句计数 8 小节 / 8 乐句', phrase.bars === 8 && phrase.phrases === 8, `${phrase.bars} 小节 / ${phrase.phrases} 乐句`);
check('乐句练习有下一步引导', phrase.next, phrase.next ? '有' : '缺少');

// 11. FAQ 与 DJ 术语
await cdp.eval(`location.hash = '#/doc/guide:dj-faq'`);
await sleep(1400);
const faq = await cdp.eval(`(() => ({
  title: (document.querySelector('.doc-title') || {}).textContent || '',
  body: (document.querySelector('.doc-body') || {}).innerText || '',
}))()`);
check('新手 FAQ 已入库', faq.title.includes('FAQ') && faq.body.includes('没有设备能学 DJ 吗'), faq.title);
await cdp.eval(`location.hash = '#/guide/glossary'`);
await sleep(1400);
const glossary = await cdp.eval(`(() => ({
  groups: document.querySelectorAll('[data-glossary-group]').length,
  text: (document.querySelector('#glossaryList') || {}).innerText || '',
}))()`);
check('DJ 术语组已上线', glossary.groups >= 8 && glossary.text.includes('Hot CUE') && glossary.text.includes('Beat Sync'), `${glossary.groups} 组`);

// 12. DJ 课程进度
await cdp.eval(`location.hash = '#/dj/course?ep=24'`);
await sleep(1400);
const beforeDj = await cdp.eval(`(() => ({ progress: (document.querySelector('.djc-progress span') || {}).textContent || '', btn: !!document.querySelector('[data-dj-complete]'), next: !!document.querySelector('.djc-next') }))()`);
await cdp.eval(`document.querySelector('[data-dj-complete]').click()`);
await sleep(500);
const afterDj = await cdp.eval(`(() => ({
  progress: (document.querySelector('.djc-progress span') || {}).textContent || '',
  stored: localStorage.getItem('em-dj-progress-v1') || '',
}))()`);
check('DJ 课程可标记完成', beforeDj.btn && afterDj.progress.includes('1 / 41') && afterDj.stored.includes('24'), `${beforeDj.progress.trim()} → ${afterDj.progress.trim()}`);
const header = await cdp.eval(`(() => { const el = document.querySelector('#headerProgress'); return { visible: !!el && !el.hidden, href: el?.getAttribute('href') || '', label: el?.getAttribute('aria-label') || '' }; })()`);
check('顶部继续学习入口', header.visible && header.href === '#/start', `${header.href} / ${header.label}`);
check('DJ 课程有下一步引导', beforeDj.next, beforeDj.next ? '有' : '缺少');

check('无 JS 运行时报错', cdp.logs.length === 0, cdp.logs.length ? cdp.logs.slice(0, 3).join(' | ') : '无');

chrome.kill();
process.exit(0);

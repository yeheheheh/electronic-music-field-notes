// 听感层验收：数据完整性 + 页面行为 + 音频真的在响 + 卡片真的画出来了。
// 用法： node scripts/regression/check-listen.mjs [http://127.0.0.1:5501/]
// 前置： node scripts/serve.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9450;

let pass = 0;
let fail = 0;
let skipped = 0;
const rows = [];

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  rows.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
}

// 跳过不等于通过：打印 SKIP 且不计入分数线，避免用「环境不支持」掩盖真实缺陷。
function skip(name, detail = '') {
  skipped += 1;
  rows.push(`SKIP ${name}${detail ? `  — ${detail}` : ''}`);
}

/* ---------------------------------------------------------------- 数据层 */

const sandbox = { window: {} };
const load = (file) => {
  const code = readFileSync(file, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', code)(sandbox.window);
};
load('data/kb.js');
load('data/fingerprints.js');
load('data/listen.js');

const KB = sandbox.window.KB_DATA;
const LISTEN = sandbox.window.KB_LISTEN;
const FP = sandbox.window.EM_FINGERPRINTS;
const entryIds = new Set(KB.entries.map((entry) => entry.id));
const familyIds = new Set(KB.families.map((family) => family.id));
const recipes = new Set(Object.keys(FP.recipes));

const entries = Object.entries(LISTEN.entries);
check('听感层覆盖 ≥ 90 条高频风格', entries.length >= 90, `${entries.length} 条`);
check('配方数 ≥ 50', recipes.size >= 50, `${recipes.size} 个`);
check('大族默认值覆盖 29 个族', Object.keys(LISTEN.families).length === 29, `${Object.keys(LISTEN.families).length} 个`);

let missingEntry = [];
let missingFp = [];
let badHear = [];
let longLine = [];
let badBpm = [];
let badDim = [];
for (const [id, data] of entries) {
  if (!entryIds.has(id)) missingEntry.push(id);
  if (!recipes.has(data.fp)) missingFp.push(`${id}→${data.fp}`);
  if (!Array.isArray(data.hear) || data.hear.length !== 3) badHear.push(id);
  if ([...data.oneLine].length > 18) longLine.push(`${id}(${[...data.oneLine].length})`);
  if (!data.bpm || !data.bpm.source || data.bpm.min > data.bpm.max) badBpm.push(id);
  if (!['slow', 'mid', 'fast', 'xfast'].includes(data.band) || !['floor', 'half', 'break', 'swing', 'none'].includes(data.groove)) badDim.push(id);
}
check('所有 entryId 在知识库里存在', missingEntry.length === 0, missingEntry.join(', '));
check('所有 fp 引用都能找到配方', missingFp.length === 0, missingFp.join(', '));
check('每条都有三个听点', badHear.length === 0, badHear.join(', '));
check('L1 一句人话 ≤ 18 字', longLine.length === 0, longLine.join(', '));
check('BPM 区间与来源齐全', badBpm.length === 0, badBpm.join(', '));
check('速度带 / 落地方式取值合法', badDim.length === 0, badDim.join(', '));

const badFamily = Object.entries(LISTEN.families).filter(([id, data]) => !familyIds.has(id) || !recipes.has(data.fp));
check('大族默认值指向真实大族与配方', badFamily.length === 0, badFamily.map(([id]) => id).join(', '));

// 每个格子的分布：不能有整行整列是空的
const cells = {};
for (const data of Object.values(LISTEN.entries)) {
  const key = `${data.band}/${data.groove}`;
  cells[key] = (cells[key] || 0) + 1;
}
const emptyCells = [];
for (const band of ['slow', 'mid', 'fast', 'xfast']) {
  for (const groove of ['floor', 'half', 'break', 'swing', 'none']) {
    if (!cells[`${band}/${groove}`]) emptyCells.push(`${band}/${groove}`);
  }
}
check('矩阵不超过 8 个空格', emptyCells.length <= 8, `空 ${emptyCells.length} 格：${emptyCells.join(' ')}`);

/* -------------------------------------------------------------- 浏览器层 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(join(tmpdir(), 'cdp-listen-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1200', 'about:blank',
], { stdio: 'ignore' });

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((target) => target.type === 'page');
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
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
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
        const detail = msg.params.exceptionDetails;
        cdp.logs.push(detail.exception?.description || detail.text);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        cdp.logs.push(msg.params.args.map((arg) => arg.value ?? arg.description).join(' '));
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
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`超时: ${method}`));
        }
      }, 20000);
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
}

const cdp = await Cdp.connect(await findTarget());
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

const goto = async (hash, wait = 900) => {
  await cdp.send('Page.navigate', { url: `${BASE}${hash}` });
  await sleep(wait);
};

try {
  /* 首页四轨 */
  await goto('#/', 3000);
  // 本脚本测的是「手动点试听」。自动播放默认开启，进条目页时第一首已在播，
  // 再点它等于按「停止」，文本会回到「试听 30 秒」而误判为失败。
  // 这里显式关掉；自动播放本身由 check-listen-examples.mjs 专门覆盖。
  await cdp.eval(`localStorage.setItem('em.listen.autoplay', '0')`);
  const homeRack = await cdp.eval(`({
    tracks: [...document.querySelectorAll('.track')].map(t => ({
      title: t.querySelector('.track-title')?.textContent.trim() || '',
      code: t.querySelector('.track-code')?.textContent.trim() || '',
      links: t.querySelectorAll('.track-links a').length,
      href: t.querySelector('.track-title a')?.getAttribute('href') || '',
    })),
    scale: !!document.querySelector('.hero-scale'),
    daily: document.querySelector('[data-daily-name]')?.textContent || '',
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  })`);
  check('首页有四个入口', homeRack.tracks.length === 4, homeRack.tracks.map((t) => t.title).join(' / '));
  check('四条轨分别指向 听 / 查 / 练 / 做', homeRack.tracks.map((t) => t.code).join(',') === 'LISTEN,SEARCH,TRAIN,MAKE', homeRack.tracks.map((t) => t.href).join(' '));
  check('每条轨至少三个入口链接', homeRack.tracks.every((t) => t.links >= 3), homeRack.tracks.map((t) => t.links).join('/'));
  check('首页有「今天听这条」', homeRack.daily.length > 0, homeRack.daily);

  const daily = await cdp.eval(`(async () => {
    const before = document.querySelector('[data-daily-name]').textContent;
    document.querySelector('[data-daily-play]').click();
    await new Promise(r => setTimeout(r, 700));
    const state = window.EMAudio.getState();
    document.querySelector('[data-daily-shuffle]').click();
    await new Promise(r => setTimeout(r, 250));
    const after = document.querySelector('[data-daily-name]').textContent;
    window.EMAudio.stop();
    return { playing: state.playing, demoId: state.demoId, before, after };
  })()`);
  check('首页「今天听这条」能直接出声', daily.playing === true, daily.demoId);
  check('「换一条」真的换了一条', daily.before !== daily.after, `${daily.before} → ${daily.after}`);

  const searchJump = await cdp.eval(`(async () => {
    const form = document.getElementById('homeKbSearch');
    form.querySelector('input').value = 'Sidechain';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 600));
    return location.hash;
  })()`);
  check('首页搜索框跳到全库检索', String(searchJump).startsWith('#/search?q='), searchJump);

  await goto('#/');
  const archiveJump = await cdp.eval(`(async () => {
    document.querySelector('[data-archive-entry]')?.click();
    await new Promise(r => setTimeout(r, 300));
    return { hash: location.hash, title: document.querySelector('h1')?.textContent };
  })()`);
  check('首页可以进入独立档案总览', archiveJump.hash === '#/archive' && archiveJump.title?.includes('电音档案'));

  await goto('#/archive');
  const archive = await cdp.eval(`({
    families: document.querySelectorAll('[data-archive-family]').length,
    sections: document.querySelectorAll('.archive-nav a').length,
    current: document.querySelector('.archive-nav [aria-current="page"]')?.textContent,
    title: document.title,
  })`);
  check('档案总览展示全部 24 个主大族', archive.families === 24, String(archive.families));
  check('档案站提供四个可导航分区', archive.sections === 4 && archive.current?.includes('风格档案'));
  check('档案页面使用独立标题', archive.title.includes('档案总览'));
  const archiveSupplement = await cdp.eval(`(async () => {
    document.querySelector('.archive-note a')?.click();
    await new Promise(r => setTimeout(r, 300));
    return { hash: location.hash, supplement: document.querySelector('#main')?.textContent.includes('补充收纳桶'), archive: document.querySelector('#main')?.textContent.includes('待归档') };
  })()`);
  check('补遗与归档入口显示补充收纳桶和待归档资料', archiveSupplement.hash === '#/atlas' && archiveSupplement.supplement && archiveSupplement.archive);
  await goto('#/archive');
  const archiveSearch = await cdp.eval(`(async () => {
    const form = document.getElementById('archiveSearch');
    if (!form) return '';
    form.querySelector('input').value = 'House & Techno';
    form.requestSubmit();
    await new Promise(r => setTimeout(r, 300));
    return new URLSearchParams(location.hash.split('?')[1]).get('q');
  })()`);
  check('档案检索完整保留输入中的特殊字符', archiveSearch === 'House & Techno');
  for (const [section, href] of [['learn', '#/learn'], ['tools', '#/dj/automix'], ['sources', '#/about']]) {
    await goto('#/archive');
    const sectionResult = await cdp.eval(`(async () => {
      document.querySelector('.archive-nav a[href="#/archive?section=${section}"]')?.click();
      await new Promise(r => setTimeout(r, 300));
      const active = document.querySelector('.archive-nav [aria-current="page"]')?.getAttribute('href');
      document.querySelector('.archive-content a[href="${href}"]')?.click();
      await new Promise(r => setTimeout(r, 400));
      return {
        active,
        destination: location.hash,
        heading: !!document.querySelector('#main h1'),
      };
    })()`);
    check('档案分区可切换并进入核心模块：' + section, sectionResult.active === '#/archive?section=' + section && sectionResult.destination === href && sectionResult.heading);
  }
  await goto('#/archive?section=unknown');
  check('未知档案分区回到风格总览', await cdp.eval(`document.querySelectorAll('[data-archive-family]').length === 24`));
  for (const width of [320, 390, 768, 1440]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const hash of ['#/', '#/archive', '#/archive?section=learn', '#/archive?section=tools', '#/archive?section=sources']) {
      await goto(hash, 300);
      check(width + ' 下无横向溢出：' + hash, await cdp.eval(`document.documentElement.scrollWidth <= innerWidth`));
      if (process.env.CAPTURE_ARCHIVE && [390, 1440].includes(width) && ['#/', '#/archive'].includes(hash)) {
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`.ui-audit/${hash === '#/' ? 'home-refresh' : 'archive'}-${width}.png`, Buffer.from(screenshot.data, 'base64'));
      }
    }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

  /* 入口页：矩阵页已下线，能力并入风格树。
     老链接（含 ?s= 深链）必须重定向到树，而不是 404 —— 那些地址
     可能已经发进群里、存进收藏夹，是外部依赖，不能随手作废。 */
  await goto('#/listen', 1800);
  const home = await cdp.eval(`({
    hash: location.hash,
    onTree: !!document.querySelector('.tree-page'),
    cols: document.querySelectorAll('.tree-col').length,
    rows: document.querySelectorAll('[data-tree-key]').length,
    crumbs: !!document.querySelector('.tree-crumbs'),
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  })`);
  check('#/listen 重定向到风格树', home.hash.includes('/tree'), home.hash);
  check('重定向后确实渲染了树', home.onTree === true);
  check('树首屏有列与行', home.cols >= 1 && home.rows >= 20, `cols=${home.cols} rows=${home.rows}`);
  check('树有路径提示（面包屑）', home.crumbs === true);
  check('1440 下无横向溢出', home.docW <= home.vw, `${home.docW}/${home.vw}`);

  /* 带 s= 的老链接要精确落到那一条，而不是丢到树根 */
  await goto('#/', 900);
  await goto('#/listen?s=g-2183', 1800);
  const deep = await cdp.eval(`(() => {
    const sel = document.querySelector('.tree-row.is-selected, .tree-flat-row.is-selected');
    return { hash: location.hash, key: sel ? sel.dataset.treeKey : '' };
  })()`);
  check('带 s= 的老链接落到对应风格', /g-2183/.test(deep.key || ''), `key=${deep.key}`);
  check('深链把祖先路径一起展开', /path=/.test(deep.hash), deep.hash);

  /* 点树里的一行：试听 + 展开下级，一次完成 */
  const picked = await cdp.eval(`(async () => {
    // 选一个有下级的行：点它应该既开始播、又展开出子列
    const row = [...document.querySelectorAll('[data-tree-key]')].find(r => r.classList.contains('has-kids'));
    const before = document.querySelectorAll('.tree-col').length;
    row.click();
    await new Promise(r => setTimeout(r, 700));
    const state = window.EMAudio.getState();
    return {
      name: row.querySelector('.tree-row-name')?.textContent || '',
      playing: state.playing,
      demoId: state.demoId,
      after: document.querySelectorAll('.tree-col').length,
      before,
      selected: document.querySelector('.tree-row.is-selected') ? true : false,
    };
  })()`);
  check('点行后音频真的在播', picked.playing === true, `demoId=${picked.demoId}`);
  check('播放的是配方会话', String(picked.demoId).startsWith('fp:'), picked.demoId);
  check('点行同时展开下一列', picked.after > picked.before, `${picked.before} → ${picked.after} 列`);
  check('点行后该行被选中', picked.selected === true, picked.name);

  /* 折叠：收起父级时，它右侧的列要一起消失，不能留下断链 */
  const fold = await cdp.eval(`(async () => {
    const before = document.querySelectorAll('.tree-col').length;
    const btn = document.querySelector('.tree-row.is-selected .tree-row-chev.is-toggle')
      || document.querySelector('.tree-row-chev.is-toggle');
    const wasPlaying = window.EMAudio.getState().playing;
    btn.click();
    await new Promise(r => setTimeout(r, 400));
    return {
      before,
      after: document.querySelectorAll('.tree-col').length,
      playing: window.EMAudio.getState().playing,
      wasPlaying,
    };
  })()`);
  check('点折叠钮收起该列及右侧', fold.after < fold.before, `${fold.before} → ${fold.after} 列`);
  check('折叠动作不触发播放', fold.playing === fold.wasPlaying, `playing=${fold.playing}`);
  await cdp.eval(`window.EMAudio.stop()`);

  /* 分享卡：弹层里必须是 <img> */
  const share = await cdp.eval(`(async () => {
    document.querySelector('[data-tree-play]').click();
    await new Promise(r => setTimeout(r, 200));
    window.EMShare.open({ name: 'Techno', bpm: 130, bpmLabel: '125–135', bandName: '快', bandFeel: '推进', grooveName: '落地', lowName: '厚', oneLine: '测试', hear: ['a', 'b', 'c'], when: '测试', fpLabel: 'test', id: 'g-2183', zh: 'Techno' });
    await new Promise(r => setTimeout(r, 400));
    const img = document.querySelector('[data-card-img]');
    return {
      layer: !document.getElementById('cardLayer').hidden,
      isImg: img?.tagName === 'IMG',
      isPng: (img?.src || '').startsWith('data:image/png'),
      bytes: (img?.src || '').length,
    };
  })()`);
  check('分享弹层打开', share.layer === true);
  check('预览是 <img> 而不是 canvas（iOS 长按才有保存）', share.isImg && share.isPng, `${Math.round(share.bytes / 1024)} KB`);
  await cdp.eval(`window.EMShare.close()`);

  /* 条目页：有专属文案 */
  await goto('#/genre/g-2183', 1100);
  const genre = await cdp.eval(`(() => {
    const canvas = document.getElementById('genreListenCanvas');
    let non = 0;
    if (canvas) {
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < d.length; i += 400) if (d[i] > 24 || d[i + 1] > 24 || d[i + 2] > 24) non += 1;
    }
    return {
      card: !!document.querySelector('.listen-card'),
      ref: !!document.querySelector('.listen-ref'),
      canvas: !!canvas,
      non,
      line: document.querySelector('.lc-line')?.textContent || '',
      play: !!document.querySelector('[data-genre-play]'),
    };
  })()`);
  check('条目页顶部有听感卡', genre.card === true);
  check('听感卡有预览图且不是空白', genre.canvas && genre.non > 500, `非背景像素 ${genre.non}`);
  check('听感卡有 L1 与播放入口', genre.line.length > 0 && genre.play);

  /* 条目页：没有专属文案 → 同族参考 */
  await goto('#/genre/g-823', 900);
  const ref = await cdp.eval(`({
    ref: !!document.querySelector('.listen-ref'),
    card: !!document.querySelector('.listen-card'),
    hasPlay: !!document.querySelector('[data-ref-play]'),
  })`);
  check('没有文案的条目显示「同族参考」而不是假装有', ref.ref === true && ref.card === false && ref.hasPlay === true);

  /* 树 ↔ 条目：位置要能带过去、带回来 */
  await goto('#/tree?path=f-2077&sel=g-2529', 1300);
  const deepTree = await cdp.eval(`({
    cols: document.querySelectorAll('.tree-col').length,
    selected: document.querySelector('.tree-detail h2')?.textContent || '',
    crumbs: document.querySelector('.tree-crumbs')?.textContent?.trim() || '',
    hash: location.hash,
  })`);
  check('深链进树：路径与选中都还原', deepTree.cols >= 2 && /techno/i.test(deepTree.selected), `${deepTree.cols} 列 · ${deepTree.selected}`);
  check('面包屑显示当前位置', deepTree.crumbs.includes('Techno'), deepTree.crumbs.slice(0, 60));

  const swap = await cdp.eval(`(async () => {
    const row = [...document.querySelectorAll('[data-tree-key]')].find(r => r.dataset.treeKey === 'e:g-2183');
    row?.click();
    await new Promise(r => setTimeout(r, 600));
    return { hash: location.hash, sel: document.querySelector('.tree-detail h2')?.textContent || '' };
  })()`);
  check('点另一个节点后地址栏跟着走', swap.hash.includes('sel=g-2183'), swap.hash);
  check('详情切到新节点', swap.sel.length > 0, swap.sel);
  await cdp.eval(`window.EMAudio.stop()`);

  const roundTrip = await cdp.eval(`(async () => {
    location.hash = '#/genre/g-1525';
    await new Promise(r => setTimeout(r, 900));
    const onGenre = {
      card: !!document.querySelector('.listen-card'),
      back: document.querySelector('a[href*="#/tree?sel="]')?.getAttribute('href') || '',
      preview: document.querySelectorAll('.example-preview').length,
      bili: document.querySelector('.example-actions a[href*="bilibili"]')?.getAttribute('href') || '',
      netease: document.querySelector('.example-actions a[href*="music.163.com"]')?.getAttribute('href') || '',
    };
    const button = document.querySelector('.example-preview');
    if (button) {
      button.click();
      await new Promise(r => setTimeout(r, 150));
      onGenre.started = button.textContent.trim() !== '试听 30 秒';
      onGenre.label = button.textContent.trim();
    }
    location.hash = '#/tree?sel=g-1525';
    await new Promise(r => setTimeout(r, 900));
    return {
      onGenre,
      onTree: !!document.querySelector('.tree-page'),
      selected: document.querySelector('.tree-detail h2')?.textContent || '',
      hash: location.hash,
    };
  })()`);
  check('条目页能回到树，且带着自己的位置', roundTrip.onGenre.card && roundTrip.onGenre.back.includes('g-1525'), roundTrip.onGenre.back);
  check('树 → 条目 → 树：位置还在', roundTrip.onTree === true && roundTrip.selected.length > 0, roundTrip.selected);
  check('例曲有试听按钮', roundTrip.onGenre.preview > 0, `${roundTrip.onGenre.preview} 条`);
  check('例曲有 B 站 / 网易云 兜底外链', roundTrip.onGenre.bili.includes('search.bilibili.com') && roundTrip.onGenre.netease.includes('music.163.com'));
  check('点「试听」会去查预览而不是没反应', roundTrip.onGenre.started === true, roundTrip.onGenre.label || '');

  /* DJ 页 */
  await goto('#/dj', 900);
  const dj = await cdp.eval(`(async () => {
    const a = document.getElementById('djA'), b = document.getElementById('djB');
    a.value = 'g-10159'; b.value = 'g-8566';
    b.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return {
      delta: document.querySelector('.dj-delta')?.textContent || '',
      tag: document.querySelector('.dj-tag')?.textContent || '',
      moves: document.querySelectorAll('.dj-moves li').length,
      links: document.querySelectorAll('.dj-moves a').length,
      near: document.querySelectorAll('[data-nb]').length,
      hash: location.hash,
    };
  })()`);
  check('过渡检查算出 +7（Trap 145 → Early Hardstyle 152）', dj.delta.replace(/\s/g, '') === '+7BPM', dj.delta.replace(/\s/g, ''));
  check('给出三条可执行动作', dj.moves === 3, `${dj.moves} 条`);
  check('每条动作都回链课程与词条', dj.links === 6, `${dj.links} 个链接`);
  check('BPM 邻接表有候选', dj.near > 0, `${dj.near} 个`);
  check('DJ 页参数写进地址栏', dj.hash.includes('a=') && dj.hash.includes('b='), dj.hash);

  /* 单独卡片页 */
  await goto('#/card/g-10159', 900);
  const cardPage = await cdp.eval(`(() => {
    const c = document.getElementById('cardPageCanvas');
    if (!c) return { ok: false };
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let non = 0;
    for (let i = 0; i < d.length; i += 400) if (d[i] > 24 || d[i + 1] > 24 || d[i + 2] > 24) non += 1;
    return { ok: true, non, w: c.width, h: c.height };
  })()`);
  check('卡片页画布 1080×1440', cardPage.w === 1080 && cardPage.h === 1440, `${cardPage.w}×${cardPage.h}`);
  check('卡片页不是空白', cardPage.non > 800, `${cardPage.non}`);

  /* 现场速查 + 离线 */
  await goto('#/quick', 1200);
  const quick = await cdp.eval(`(() => {
    const deck = document.getElementById('quickDeck');
    return {
      slides: document.querySelectorAll('.quick-slide').length,
      snap: getComputedStyle(deck).scrollSnapType,
      bars: document.querySelectorAll('.quick-hear').length,
      offlineBadge: !!document.getElementById('quickOffline'),
    };
  })()`);
  check('速查页与听感层同数量（92 张）', quick.slides === 92, `${quick.slides} 张`);
  check('速查页按屏幕吸附（可以滑动换风格）', String(quick.snap).includes('mandatory'), quick.snap);

  const quickNav = await cdp.eval(`(async () => {
    const deck = document.getElementById('quickDeck');
    deck.scrollLeft = deck.clientWidth * 3;
    deck.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 300));
    return { hash: location.hash, pos: document.getElementById('quickPos').textContent };
  })()`);
  check('滑到第 4 张时地址栏跟着变', quickNav.hash.includes('s='), `${quickNav.hash} · ${quickNav.pos}`);

  // Service Worker 只在安全上下文可用：https 或 localhost。
  // 线上现在是 http://IP，浏览器直接不提供 navigator.serviceWorker，
  // 这时「断网还能开」会是普通 HTTP 缓存造成的假通过 —— 必须显式跳过。
  const secureContext = await cdp.eval("window.isSecureContext && 'serviceWorker' in navigator");
  if (!secureContext) {
    skip('Service Worker 注册（需要 HTTPS 或 localhost）', '当前是 http，浏览器不提供 SW');
    skip('断网后速查页可用', '同一原因，不测，避免 HTTP 缓存造成假通过');
  } else {
    const sw = await cdp.eval(`(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise(r => setTimeout(() => r(null), 4000)),
      ]);
      const keys = await caches.keys();
      let count = 0;
      if (keys.length) {
        const cache = await caches.open(keys[0]);
        count = (await cache.keys()).length;
      }
      return { supported: true, active: !!reg?.active, keys, count };
    })()`);
    check('Service Worker 已注册并激活', sw.supported && sw.active === true, JSON.stringify(sw.keys || []));
    check('核心资源已进缓存（≥ 15 个）', sw.count >= 15, `${sw.count} 个`);

    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
    });
    await cdp.send('Page.navigate', { url: `${BASE}#/quick` });
    await sleep(1200);
    const offline = await cdp.eval(`({
      slides: document.querySelectorAll('.quick-slide').length,
      online: navigator.onLine,
      badge: document.getElementById('quickOffline')?.hidden === false,
    })`);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    check('断网后速查页仍能打开', offline.slides === 92, `${offline.slides} 张 · online=${offline.online}`);
    check('离线时显示「离线可用」标记', offline.badge === true);
  }

  /* DJ 现场判定 */
  await goto('#/dj', 900);
  const djQuick = await cdp.eval(`(async () => {
    const g = document.getElementById('dqGroove');
    g.value = 'break';
    g.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const first = document.querySelector('[data-quick-play]');
    const before = document.querySelectorAll('[data-quick-play]').length;
    first?.click();
    await new Promise(r => setTimeout(r, 500));
    return {
      count: before,
      playing: window.EMAudio.getState().playing,
      demoId: window.EMAudio.getState().demoId,
    };
  })()`);
  check('现场判定能给出候选', djQuick.count > 0, `${djQuick.count} 个`);
  check('点候选直接出声', djQuick.playing === true, djQuick.demoId);
  await cdp.eval(`window.EMAudio.stop()`);

  /* 大族页：别让「Techno」这种搜索词落进一条哑页 */
  await goto('#/family/f-2077', 1000);
  const family = await cdp.eval(`(async () => {
    const btn = document.querySelector('[data-family-play]');
    const strip = !!document.querySelector('.listen-ref');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 600));
    const state = window.EMAudio.getState();
    return { strip, playing: state.playing, demoId: state.demoId, link: document.querySelector('a[href*="#/tree"]')?.getAttribute('href') || '' };
  })()`);
  check('大族页有「这一族的声音」', family.strip === true);
  check('大族页能直接出声', family.playing === true, family.demoId);
  check('大族页能跳到风格树', family.link.includes('#/tree'), family.link);
  await cdp.eval('window.EMAudio.stop()');

  /* 宽度扫描 */
  const widths = [320, 360, 390, 414, 768, 1024, 1280, 1440, 1920];
  let overflow = [];
  for (const width of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    for (const hash of ['#/', '#/listen', '#/dj', '#/quick']) {
      await goto(hash, 700);
      const doc = await cdp.eval('({ docW: document.documentElement.scrollWidth, vw: window.innerWidth })');
      if (doc.docW > doc.vw) overflow.push(`${width}${hash}`);
    }
  }
  check('9 档宽度 × 4 个入口零横向溢出', overflow.length === 0, overflow.join(' '));

  check('全程无运行时报错', cdp.logs.length === 0, cdp.logs.slice(0, 2).join(' | '));
} catch (error) {
  check('验收脚本自身没有崩', false, error.message);
} finally {
  chrome.kill();
}

console.log(rows.join('\n'));
console.log(`\n听感层验收：${pass}/${pass + fail} 通过${skipped ? `，${skipped} 项跳过` : ''}${fail ? `，${fail} 项失败` : ''}`);
process.exit(fail ? 1 : 0);

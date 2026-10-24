// 听感层验收：数据完整性 + 页面行为 + 音频真的在响 + 卡片真的画出来了。
// 用法： node scripts/regression/check-listen.mjs [http://127.0.0.1:5601/]
// 前置： node scripts/serve.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5601/';
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
  await goto('#/', 1500);
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

  /* 入口页 */
  await goto('#/listen', 1600);
  const home = await cdp.eval(`({
    cells: document.querySelectorAll('.lm-cell').length,
    chips: document.querySelectorAll('.lm-chip').length,
    rows: document.querySelectorAll('.lm-row').length,
    heads: document.querySelectorAll('.lm-head').length,
    panel: !!document.querySelector('.lp-name'),
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  })`);
  check('矩阵渲染 20 个格子（4 速度 × 5 律动）', home.cells === 20, `${home.cells} 格`);
  check('矩阵有 5 行律动', home.rows === 5, `${home.rows} 行`);
  check('首屏可见风格数 ≥ 16', home.chips >= 16, `${home.chips} 个`);
  check('默认选中一个风格并出卡', home.panel === true);
  check('1440 下无横向溢出', home.docW <= home.vw, `${home.docW}/${home.vw}`);

  /* 点一个风格：出卡 + 真的开始播 */
  const picked = await cdp.eval(`(async () => {
    const chips = [...document.querySelectorAll('.lm-chip')];
    const target = chips.find(b => b.dataset.style === 'g-2183') || chips[0];
    target.click();
    await new Promise(r => setTimeout(r, 700));
    const state = window.EMAudio.getState();
    return {
      id: target.dataset.style,
      name: document.querySelector('.lp-name')?.textContent || '',
      playing: state.playing,
      demoId: state.demoId,
      hash: location.hash,
      muted: window.EMAudio.setFingerprintLayers([]),
    };
  })()`);
  check('点风格后卡片切到该风格', picked.name.length > 0, picked.name);
  check('点风格后音频真的在播', picked.playing === true, `demoId=${picked.demoId}`);
  check('播放的是配方会话', String(picked.demoId).startsWith('fp:'), picked.demoId);
  check('地址栏记住选中的风格', picked.hash.includes('s='), picked.hash);

  /* 分层 solo：鼓 */
  const solo = await cdp.eval(`(async () => {
    const btn = [...document.querySelectorAll('[data-solo]')].find(b => b.dataset.solo === 'drums');
    btn.click();
    await new Promise(r => setTimeout(r, 250));
    return { muted: window.EMAudio.setFingerprintLayers(['drums']), state: window.EMAudio.getState().playing };
  })()`);
  check('可以只留鼓（分层是操作不是形容词）', solo.muted.includes('drums'), JSON.stringify(solo.muted));
  check('切层不打断播放', solo.state === true);
  await cdp.eval(`window.EMAudio.stop()`);

  /* 分享卡：弹层里必须是 <img> */
  const share = await cdp.eval(`(async () => {
    document.querySelector('[data-lp-share]').click();
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

  /* 听 ↔ 查：状态要能带过去、带回来 */
  await goto('#/listen?band=fast&groove=floor&s=g-2529', 1300);
  const deep = await cdp.eval(`({
    onChips: document.querySelectorAll('.lf-chip.is-on').length,
    selected: document.querySelector('.lp-name')?.textContent || '',
    hash: location.hash,
  })`);
  check('深链进「听」：筛选与选中都还原', deep.onChips === 2 && /hard techno/i.test(deep.selected), `${deep.onChips} 个条件 · ${deep.selected}`);

  const swap = await cdp.eval(`(async () => {
    // 用格子首屏可见的条目（快/每拍一脚里 128 BPM 的那几个）
    document.querySelector('.lm-chip[data-style="g-1525"]')?.click();
    await new Promise(r => setTimeout(r, 400));
    return { hash: location.hash };
  })()`);
  check('切风格时筛选条件不丢', swap.hash.includes('band=fast') && swap.hash.includes('groove=floor') && swap.hash.includes('s=g-1525'), swap.hash);

  const roundTrip = await cdp.eval(`(async () => {
    location.hash = '#/genre/g-1525';
    await new Promise(r => setTimeout(r, 900));
    const onGenre = {
      card: !!document.querySelector('.listen-card'),
      back: document.querySelector('a[href*="#/listen?band="]')?.getAttribute('href') || '',
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
    location.hash = '#/listen';
    await new Promise(r => setTimeout(r, 900));
    return {
      onGenre,
      chips: document.querySelectorAll('.lf-chip.is-on').length,
      selected: document.querySelector('.lp-name')?.textContent || '',
      hash: location.hash,
    };
  })()`);
  check('条目页能回到矩阵，且带着自己的位置', roundTrip.onGenre.card && roundTrip.onGenre.back.includes('s=g-1525'), roundTrip.onGenre.back);
  check('听 → 条目 → 听：筛选与选中都还在', roundTrip.chips === 2 && /electro/i.test(roundTrip.selected), `${roundTrip.chips} 个条件 · ${roundTrip.selected}`);
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
    return { strip, playing: state.playing, demoId: state.demoId, link: document.querySelector('a[href*="#/listen"]')?.getAttribute('href') || '' };
  })()`);
  check('大族页有「这一族的声音」', family.strip === true);
  check('大族页能直接出声', family.playing === true, family.demoId);
  check('大族页能跳回矩阵', family.link.includes('#/listen'), family.link);
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

/**
 * 线上验收：确认分支树在真实服务器上可用。
 *
 * 为什么不复用 check-live-deploy.mjs：那个脚本硬编码调试端口 9361 且用
 * 「抓第一个页面目标」的写法 —— 正是 2026-11-12 劫持 WorkBuddy 主窗口的模式。
 * 这里统一走 cdp-launch.mjs（随机端口 + 目标白名单 + 退出清理）。
 *
 * 用法：
 *   node scripts/regression/check-live-tree.mjs
 *   node scripts/regression/check-live-tree.mjs http://47.94.222.72/music/
 */

import { launchChrome } from './cdp-launch.mjs';

const TARGET = (process.argv[2] || 'http://47.94.222.72/music/').replace(/\/?$/, '/');
const ORIGIN = new URL(TARGET).origin;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* ---------------------------------------------------------------- HTTP 层
   先查静态资源。SPA 的 fallback 会让缺失文件也返回 200 + HTML，
   所以必须看 Content-Type，不能只看状态码。                                */

async function head(url) {
  const res = await fetch(url, { method: 'GET', headers: { 'Accept-Encoding': 'identity' } });
  const buf = await res.arrayBuffer();
  return {
    status: res.status,
    type: res.headers.get('content-type') || '',
    length: buf.byteLength,
    head: new TextDecoder().decode(buf.slice(0, 900)),
  };
}

console.log('目标：' + TARGET);
console.log('');

const treeJs = await head(TARGET + 'data/tree.js');
check('data/tree.js 是 JS 而非 HTML 回退', /javascript/.test(treeJs.type), `${treeJs.type} · ${treeJs.length}B`);
check('data/tree.js 内容正确', treeJs.head.includes('KB_TREE'), treeJs.head.split('\n')[0].slice(0, 40));

const treeCss = await head(TARGET + 'styles-tree.css');
check('styles-tree.css 是 CSS', /text\/css/.test(treeCss.type), `${treeCss.type} · ${treeCss.length}B`);

const swJs = await head(TARGET + 'sw.js');
const swVer = (swJs.head + '').match(/em-[a-z]+-v(\d+)/);
// 断言「不低于」而不是等号：每次改前端都要升版，
// 写死版本号会让这条断言每轮部署都要跟着改一次。
const swNum = swVer ? Number(swVer[1]) : 0;
check('sw.js 版本 ≥ v13', swNum >= 13, swVer ? swVer[0] : '未识别');

// gzip：tree.js 1.37MB，不压缩在手机上很慢
{
  const res = await fetch(TARGET + 'data/tree.js', { headers: { 'Accept-Encoding': 'gzip' } });
  const enc = res.headers.get('content-encoding') || '';
  await res.arrayBuffer();
  check('tree.js 走 gzip', /gzip|br/.test(enc), enc || '未压缩');
}

/* ---------------------------------------------------------------- 页面层 */

const launched = await launchChrome({
  allow: [new RegExp('^' + ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), /^about:blank$/],
});

const ws = new WebSocket(launched.wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pend = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const p = pend.get(m.id);
    pend.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params?.exceptionDetails?.exception?.description || '异常');
  }
};
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => {
    pend.set(i, { res, rej });
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + ' 超时')); } }, 30000);
  });
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || '运行时异常');
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await send('Runtime.enable');
  await send('Page.enable');

  // 必须显式定成桌面尺寸。树的布局按断点分流（≤767px 走纵向树），
  // 不设的话就取决于无头窗口默认宽度 —— 窄了会渲染纵向树，
  // 下面的列式断言全都会失败，看起来像线上坏了。
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

  // 线上是首次访问，没有 SW 缓存，给足加载时间（kb.js 3.4MB）
  await send('Page.navigate', { url: TARGET + '#/tree' });
  await sleep(6000);

  const boot = await ev(`(() => {
    const T = window.KB_TREE;
    return {
      hasTree: !!T,
      nodes: T ? Object.keys(T.nodes).length : 0,
      cols: document.querySelectorAll('.tree-col').length,
      rows: document.querySelectorAll('.tree-row').length,
      h1: (document.querySelector('.page-head h1') || {}).textContent || '',
      stats: (document.querySelector('.page-head-stats') || {}).textContent || '',
    };
  })()`);
  check('线上已加载树索引', boot.hasTree && boot.nodes === 1406, `${boot.nodes} 个节点`);
  check('树页渲染正常', boot.h1.trim() === '风格树', `h1=${boot.h1.trim()}`);
  check('首屏两列', boot.cols === 2, `${boot.cols} 列 / ${boot.rows} 行`);

  // 两列必须横向并排（不是垂直堆叠）
  const side = await ev(`(() => {
    const c = [...document.querySelectorAll('.tree-col')];
    if (c.length < 2) return { ok: false };
    const a = c[0].getBoundingClientRect(), b = c[1].getBoundingClientRect();
    return { ok: b.left >= a.right - 2, a: Math.round(a.right), b: Math.round(b.left) };
  })()`);
  check('两列横向并排', side.ok, `${side.a} ≤ ${side.b}`);

  // 下钻
  const drill = await ev(`(() => {
    const cols = document.querySelectorAll('.tree-col');
    const row = cols[1] ? cols[1].querySelector('.tree-row.has-kids') : null;
    if (!row) return { ok: false };
    row.click();
    return { ok: true, name: row.querySelector('.tree-row-name').textContent.trim() };
  })()`);
  await sleep(1200);
  const after = await ev(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    crumbs: [...document.querySelectorAll('.tree-crumb')].map(c => c.textContent.trim()),
  }))()`);
  check('下钻新增一列', after.cols === 3, `${drill.name} → ${after.cols} 列`);
  check('面包屑反映路径', after.crumbs.length >= 3, after.crumbs.join(' › '));

  // 播放
  await ev(`(() => { const b = document.querySelector('.tree-row-play:not([disabled])'); if (b) b.click(); })()`);
  await sleep(1500);
  const play = await ev(`(() => {
    const st = window.EMAudio ? window.EMAudio.getState() : {};
    return { playing: st.playing, demoId: st.demoId, rows: document.querySelectorAll('.tree-row.is-playing').length };
  })()`);
  check('线上点节点能出声', play.playing === true, `demoId=${play.demoId}`);
  check('播放行高亮', play.rows === 1, `${play.rows} 行`);

  await ev(`(() => { const b = document.querySelector('.tree-row.is-playing .tree-row-play'); if (b) b.click(); })()`);
  await sleep(1200);
  const stop = await ev(`(() => ({
    playing: window.EMAudio.getState().playing,
    rows: document.querySelectorAll('.tree-row.is-playing').length,
  }))()`);
  check('再点停止并清高亮', stop.playing === false && stop.rows === 0, `playing=${stop.playing} rows=${stop.rows}`);

  // 搜索
  await ev(`(() => {
    const q = document.getElementById('treeSearch');
    q.value = 'acid house';
    q.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(900);
  const search = await ev(`(() => {
    const box = document.getElementById('treeResults');
    return { n: box ? box.querySelectorAll('[data-tree-reveal]').length : 0 };
  })()`);
  check('线上搜索可用', search.n > 0, `${search.n} 条命中`);

  // undefined 泄漏
  const leak = await ev(`(() => {
    const t = document.body.innerText || '';
    return ['undefined', 'NaN'].filter((x) => t.includes(x));
  })()`);
  check('无 undefined/NaN 泄漏', leak.length === 0, leak.length ? leak.join(',') : '干净');

  // 移动端
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(900);
  const mobile = await ev(`(() => {
    const de = document.documentElement;
    // 窄屏渲染的是纵向树，行类是 .tree-flat-*，不是 .tree-row-*
    const play = document.querySelector('.tree-flat-play, .tree-row-play');
    const r = play ? play.getBoundingClientRect() : null;
    return {
      overflow: de.scrollWidth - de.clientWidth,
      tap: r ? Math.min(Math.round(r.width), Math.round(r.height)) : 0,
      flat: document.querySelectorAll('.tree-flat-row').length,
    };
  })()`);
  check('390px 零横向溢出', mobile.overflow <= 0, `overflow=${mobile.overflow}`);
  check('390px 走纵向树而非横向列', mobile.flat > 20, `${mobile.flat} 行`);
  check('移动端触控目标 ≥24px', mobile.tap >= 24, `${mobile.tap}px`);
  // 回到桌面尺寸再做后续检查（不要 clearDeviceMetricsOverride：
  // 那会退回无头窗口的默认宽度，窄了会让树渲染成纵向版）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

  // 既有页面没被这次部署弄坏。
  // #/listen 现在应当重定向到风格树 —— 老链接是外部依赖（群里发过、收藏夹存过），
  // 只验「页面没白屏」不够，得确认它确实落到了树上。
  for (const [path, probe] of [
    ['#/atlas', `document.querySelectorAll('.atlas-toolbar, .atlas-layout').length > 0`],
    ['#/listen', `location.hash.includes('#/tree') && document.querySelectorAll('.tree-col, .tree-flat-row').length > 0`],
    ['#/', `document.querySelectorAll('.hero-home').length > 0`],
  ]) {
    await send('Page.navigate', { url: TARGET + path });
    await sleep(3200);
    const ok = await ev(`(() => { try { return ${probe}; } catch { return false; } })()`);
    check(`${path === '#/' ? '首页' : path} 仍可用`, ok === true, ok ? '正常' : '结构缺失');
  }

  check('零运行时异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '无');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 线上验收 ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} (${f.detail})`));
  await launched.close();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error('验收脚本出错：' + error.message);
  await launched.close();
  process.exit(2);
}

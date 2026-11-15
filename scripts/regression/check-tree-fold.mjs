/**
 * 风格树折叠与移动端纵向树回归。
 *
 * 覆盖：
 *   1. 桌面端：点行 = 试听 + 展开；三角 = 只折叠不播放
 *   2. 桌面端：收起父级时右侧所有列连带消失（不留断链视图）
 *   3. 窄屏：渲染纵向树，缩进随层级递增，三角控制折叠
 *   4. 窄屏：点行展开下级且行数增加
 *   5. 两种布局的视觉层级（缩进几何、路径高亮、播放态）
 *   6. 老链接 #/listen 重定向到树（含 ?s= 精确落点）
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/check-tree-fold.mjs
 */

import { launchChrome } from './cdp-launch.mjs';

const BASE = 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const launched = await launchChrome({
  allow: [/^http:\/\/127\.0\.0\.1:5501\//, /^about:blank$/],
  chrome: CHROME,
  // 无头里 click() 不算用户手势，不关这条策略测的只是浏览器策略而不是代码
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
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
    errors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || '异常');
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
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
const goto = async (hash, wait = 2600) => {
  launched.assertNavigable(BASE + hash);
  await send('Page.navigate', { url: BASE + hash });
  await sleep(wait);
};

const desktop = { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false };
const mobile = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

try {
  await send('Runtime.enable');
  await send('Page.enable');

  /* ---------------------------------------------------- 桌面端：点行行为 */
  await send('Emulation.setDeviceMetricsOverride', desktop);
  await goto('#/tree?sel=f-165', 3000);

  const desktopBase = await ev(`(() => {
    const cols = document.querySelectorAll('.tree-col');
    const rows = document.querySelectorAll('.tree-row');
    const toggle = document.querySelector('.tree-row-chev.is-toggle');
    return {
      isFlat: !!document.querySelector('.tree-flat'),
      cols: cols.length,
      rows: rows.length,
      // 折叠钮必须是真按钮，不是装饰性的 span
      toggleTag: toggle ? toggle.tagName : '',
      toggleCount: document.querySelectorAll('[data-tree-toggle]').length,
    };
  })()`);
  check('桌面端渲染横向列式（非纵向树）', !desktopBase.isFlat);
  check('桌面端有折叠钮且是真按钮', desktopBase.toggleTag === 'BUTTON' && desktopBase.toggleCount > 0,
    `${desktopBase.toggleTag} × ${desktopBase.toggleCount}`);

  // 点一个「有下级」的行：应当同时试听 + 展开下一列
  const beforeClick = await ev(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    playing: !!document.querySelector('.tree-row.is-playing'),
  }))()`);

  const clicked = await ev(`(() => {
    // 找第一列里带下级的行
    const row = [...document.querySelectorAll('.tree-row')].find((r) => r.classList.contains('has-kids'));
    if (!row) return { ok: false };
    const key = row.dataset.treeKey;
    row.click();
    return { ok: true, key };
  })()`);
  await sleep(900);

  const afterClick = await ev(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    playing: !!document.querySelector('.tree-row.is-playing'),
    selected: (document.querySelector('.tree-row.is-selected') || {}).dataset ? document.querySelector('.tree-row.is-selected').dataset.treeKey : '',
    pathRows: document.querySelectorAll('.tree-row.is-path').length,
  }))()`);

  check('点行展开下一列', clicked.ok && afterClick.cols > beforeClick.cols,
    `${beforeClick.cols} → ${afterClick.cols} 列`);
  check('点行同时开始试听', afterClick.playing === true);
  check('点行后该行被选中', afterClick.selected === clicked.key, `${afterClick.selected} vs ${clicked.key}`);
  check('路径行有高亮标记', afterClick.pathRows > 0, `${afterClick.pathRows} 行`);

  /* ------------------------------------------- 桌面端：三角只折叠不播放 */
  const toggleResult = await ev(`(() => {
    // 先停掉正在响的，避免把「上一个还在响」误判成本次播放
    const play = document.querySelector('.tree-row.is-playing [data-tree-play]');
    if (play) play.click();
    return true;
  })()`);
  await sleep(600);

  const beforeToggle = await ev(`document.querySelectorAll('.tree-col').length`);
  const toggleInfo = await ev(`(() => {
    // 找一个「已展开」的行的三角
    const btn = document.querySelector('.tree-row.is-open [data-tree-toggle]');
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true, key: btn.dataset.treeToggle };
  })()`);
  await sleep(700);
  const afterToggle = await ev(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    playing: !!document.querySelector('.tree-row.is-playing'),
  }))()`);

  check('收起父级时右侧列连带消失', toggleInfo.ok && afterToggle.cols < beforeToggle,
    `${beforeToggle} → ${afterToggle.cols} 列`);
  check('点三角不触发播放', afterToggle.playing === false);

  /* ------------------------------------------------- 窄屏：纵向折叠树 */
  await send('Emulation.setDeviceMetricsOverride', mobile);
  // 必须真重载：Page.navigate 到当前已相同的 URL 不触发 hashchange，
  // renderTree 不会重跑，测到的还是按桌面尺寸渲染的那一棵树。
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await goto('#/tree?sel=f-165', 3200);

  const mobileBase = await ev(`(() => {
    const flat = document.querySelector('.tree-flat');
    const rows = [...document.querySelectorAll('.tree-flat-row')];
    const cols = document.querySelectorAll('.tree-col');
    return {
      hasFlat: !!flat,
      cols: cols.length,
      rows: rows.length,
      role: flat ? flat.getAttribute('role') : '',
      // 缩进必须真的递增，否则层级只是名义上的
      indents: rows.slice(0, 6).map((r) => Math.round(parseFloat(getComputedStyle(r).paddingLeft))),
      depths: rows.slice(0, 6).map((r) => r.dataset.depth),
    };
  })()`);

  check('窄屏渲染纵向树', mobileBase.hasFlat === true);
  check('窄屏不渲染横向列', mobileBase.cols === 0);
  check('纵向树有 tree role', mobileBase.role === 'tree', mobileBase.role);
  check('纵向树有行', mobileBase.rows > 5, `${mobileBase.rows} 行`);

  // 缩进随 depth 递增
  const indentOk = (() => {
    const pairs = mobileBase.indents.map((px, i) => [Number(mobileBase.depths[i]), px]);
    for (let i = 1; i < pairs.length; i += 1) {
      if (pairs[i][0] > pairs[i - 1][0] && pairs[i][1] <= pairs[i - 1][1]) return false;
    }
    return true;
  })();
  check('缩进随层级递增', indentOk, `depth ${mobileBase.depths.join(',')} → pad ${mobileBase.indents.join(',')}`);

  // 点行：展开下级，行数增加
  const beforeExpand = await ev(`document.querySelectorAll('.tree-flat-row').length`);
  const expandInfo = await ev(`(() => {
    const row = [...document.querySelectorAll('.tree-flat-row')].find((r) => r.classList.contains('has-kids') && !r.classList.contains('is-open'));
    if (!row) return { ok: false };
    const key = row.dataset.treeKey;
    row.click();
    return { ok: true, key };
  })()`);
  await sleep(900);
  const afterExpand = await ev(`(() => ({
    rows: document.querySelectorAll('.tree-flat-row').length,
    open: document.querySelectorAll('.tree-flat-row.is-open').length,
    playing: !!document.querySelector('.tree-flat-row.is-playing'),
    selected: (document.querySelector('.tree-flat-row.is-selected') || {}).dataset ? document.querySelector('.tree-flat-row.is-selected').dataset.treeKey : '',
  }))()`);

  check('窄屏点行展开下级（行数增加）', expandInfo.ok && afterExpand.rows > beforeExpand,
    `${beforeExpand} → ${afterExpand.rows} 行`);
  check('窄屏点行后标记为已展开', afterExpand.open > 0, `${afterExpand.open} 个展开`);
  check('窄屏点行同时试听', afterExpand.playing === true);
  check('窄屏点行后该行选中', afterExpand.selected === expandInfo.key);

  // 三角：收起，行数减少
  const beforeCollapse = await ev(`document.querySelectorAll('.tree-flat-row').length`);
  const collapseInfo = await ev(`(() => {
    const btn = document.querySelector('.tree-flat-row.is-open .tree-flat-toggle');
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true };
  })()`);
  await sleep(700);
  const afterCollapse = await ev(`document.querySelectorAll('.tree-flat-row').length`);
  check('窄屏点三角收起下级（行数减少）', collapseInfo.ok && afterCollapse < beforeCollapse,
    `${beforeCollapse} → ${afterCollapse} 行`);

  // 折叠后不应残留「已展开但没有子行」的错位状态
  const orphan = await ev(`(() => {
    const rows = [...document.querySelectorAll('.tree-flat-row')];
    let bad = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (!r.classList.contains('is-open')) continue;
      const d = Number(r.dataset.depth);
      const next = rows[i + 1];
      if (!next || Number(next.dataset.depth) <= d) bad += 1;
    }
    return bad;
  })()`);
  check('展开标记与实际子行一致（无孤立展开态）', orphan === 0, `${orphan} 处不一致`);

  /* ------------------------------------------------ 老链接重定向 */
  await send('Emulation.setDeviceMetricsOverride', desktop);
  // 先离开树页：留在树页上改 hash 时，renderTree 会把地址写回 #/tree，
  // 测到的就不是重定向行为，而是树的自我同步。
  await goto('#/', 1400);
  await goto('#/listen?s=g-413', 3000);
  const redirect = await ev(`(() => {
    // 两种布局的行类名不同，取选中项时都要认
    const sel = document.querySelector('.tree-row.is-selected, .tree-flat-row.is-selected');
    return {
      hash: location.hash,
      hasTree: !!document.querySelector('.tree-columns, .tree-flat'),
      selected: sel ? (sel.dataset.treeKey || '') : '',
    };
  })()`);
  check('#/listen 重定向到树', String(redirect.hash).includes('#/tree'), redirect.hash);
  check('重定向后树渲染成功', redirect.hasTree === true);
  check('带 s= 的老链接精确落到该风格', /g-413/.test(redirect.selected || ''),
    `selected=${redirect.selected}`);

  // 不带参数的裸链接也要能落地
  await goto('#/listen', 2600);
  const bare = await ev(`(() => ({ hash: location.hash, hasTree: !!document.querySelector('.tree-columns, .tree-flat') }))()`);
  check('#/listen 裸链接重定向到树根', String(bare.hash).includes('#/tree') && bare.hasTree, bare.hash);

  /* ---------------------------- 深链：sel 比 path 深
     外部链接（别人发来的、从条目页跳来的）常常只带目标节点、
     或者 path 只到它的父级。补祖先链是必须的 —— 否则选中项落在
     没渲染的列里，详情卡显示着它、列表上却一处高亮都没有。 */
  await goto('#/', 900);
  await goto('#/tree?path=f-165&sel=g-413', 2800);
  const deepChain = await ev(`(() => {
    const sel = document.querySelector('.tree-row.is-selected, .tree-flat-row.is-selected');
    const pathRows = [...document.querySelectorAll('.is-path')];
    return {
      selCount: sel ? 1 : 0,
      selIsPath: sel ? sel.classList.contains('is-path') : false,
      pathNames: pathRows.map((r) => (r.querySelector('.tree-row-name, .tree-flat-name') || {}).textContent || ''),
      cols: document.querySelectorAll('.tree-col').length,
    };
  })()`);
  check('深链：sel 比 path 深时也能选中', deepChain.selCount === 1, `选中 ${deepChain.selCount} 项`);
  check('深链：选中项自身也在路径上（有色条）', deepChain.selIsPath === true);
  check('深链：祖先链被补全（根→…→选中）', deepChain.pathNames.length >= 3, deepChain.pathNames.join(' › '));
  check('深链：选中项所在列已渲染', deepChain.cols >= 3, `${deepChain.cols} 列`);

  /* ------------------------------------------------ 无 JS 报错 */
  const realErrors = errors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
  check('运行期无 JS 异常', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

} finally {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n${pass} / ${results.length} 通过${fail ? ` · ${fail} 失败` : ''}`);
  try { ws.close(); } catch { /* 已关闭 */ }
  try { await launched.close(); } catch { /* 已退出 */ }
  process.exit(fail ? 1 : 0);
}

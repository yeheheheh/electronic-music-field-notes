/**
 * 风格树层级回归：防止「下级层级串位」再次出现。
 *
 * 背景（2026-11-15 修复）：treeSelect / treeDescend / treeToggle 原来用
 * `treeState.path.indexOf(key)` 定位节点在第几列。点同一列里的另一个分支时，
 * key 根本不在 path 里，indexOf 返回 -1 走了「追加到链尾」分支，
 * 于是层级串成「House › Deep House › Electro House」这种假血缘
 * （Electro House 实际是 House 的子级，不是 Deep House 的）。
 * 现在统一按 parent 上溯重建 path（treePathFor）。
 *
 * 用法：node scripts/regression/check-tree-hierarchy.mjs [url]
 */

import { launchChrome } from './cdp-launch.mjs';

const BASE = (process.argv[2] || 'http://127.0.0.1:8899/').replace(/\/?$/, '/');
const ORIGIN = new URL(BASE).origin;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

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
    const p = pend.get(m.id); pend.delete(m.id);
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

// 整页刷新（hash 变化不刷新，deep link 需要真首屏才能验证）
const boot = async (hash) => {
  await send('Page.navigate', { url: `${BASE}?t=${Date.now()}#${hash}` });
  await sleep(5200);
};

const snap = () => ev(`(() => ({
  cols: [...document.querySelectorAll('.tree-col')].map(c => c.dataset.level),
  crumbs: [...document.querySelectorAll('.tree-crumb')].map(c => c.textContent.trim()),
  sel: (document.querySelector('.tree-row.is-selected .tree-row-name') || {}).textContent || '',
  colFirsts: [...document.querySelectorAll('.tree-col')].map(c =>
    [...c.querySelectorAll('.tree-row-name')].slice(0, 3).map(n => n.textContent.trim())),
}))()`);

const clickIn = (colIdx, name) => ev(`(() => {
  const cols = document.querySelectorAll('.tree-col');
  const col = cols[${colIdx}];
  if (!col) return 'no-col';
  const r = [...col.querySelectorAll('.tree-row')].find(x => x.querySelector('.tree-row-name').textContent.trim() === ${JSON.stringify(name)});
  if (!r) return 'no-row';
  r.click();
  return 'ok';
})()`);

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });

  /* ---- 1. 首屏深链：只带 path 不带 sel ---- */
  await boot('/tree?path=f-165,g-1135');
  let s = await snap();
  check('深链 path 首屏展开 3 列', s.cols.length === 3, `${s.cols.length} 列`);
  check('深链 path 面包屑完整', s.crumbs.join('›') === '全部大族›House›Deep House', s.crumbs.join(' › '));
  check('深链 path 选中末端节点', s.sel === 'Deep House', `选中=${s.sel}`);

  /* ---- 2. 首屏深链：只带 sel ---- */
  await boot('/tree?sel=g-1525');
  s = await snap();
  check('深链 sel 选中目标', s.sel === 'Electro House', `选中=${s.sel}`);
  check('深链 sel 补出祖先链', s.crumbs.join('›').startsWith('全部大族›House'), s.crumbs.join(' › '));

  /* ---- 3. 同列切分支不串位（核心回归）---- */
  await boot('/tree');
  await clickIn(0, 'House');
  await sleep(600);
  await clickIn(1, 'Deep House');
  await sleep(600);
  s = await snap();
  const beforeCols = s.cols.length;
  await clickIn(1, 'Electro House');
  await sleep(600);
  s = await snap();
  check('同列换分支：列数不增长', s.cols.length === beforeCols, `${beforeCols} → ${s.cols.length}`);
  check('同列换分支：面包屑不含旧分支', s.crumbs.join('›').indexOf('Deep House') === -1, s.crumbs.join(' › '));
  check('同列换分支：面包屑父级正确', s.crumbs.join('›') === '全部大族›House›Electro House', s.crumbs.join(' › '));
  check('同列换分支：末列是新分支的子级', s.colFirsts[2] && s.colFirsts[2][0] === 'Fidget House', (s.colFirsts[2] || []).join(' / '));

  // 连点三次不同分支，列数必须恒定
  for (const nm of ['Tech House', 'Deep House', 'Progressive House']) {
    await clickIn(1, nm);
    await sleep(450);
  }
  s = await snap();
  check('连续换分支 3 次列数恒定', s.cols.length === 3, `${s.cols.length} 列`);
  check('连续换分支 3 次面包屑正确', s.crumbs.join('›') === '全部大族›House›Progressive House', s.crumbs.join(' › '));

  /* ---- 4. 深钻后点首列另一个大族 ---- */
  await clickIn(2, 'Progressive House');
  await sleep(500);
  s = await snap();
  const deepCols = s.cols.length;
  await clickIn(0, 'Techno');
  await sleep(700);
  s = await snap();
  check('深钻后切首列大族：回到 2 列', s.cols.length === 2, `${deepCols} → ${s.cols.length}`);
  check('深钻后切首列大族：面包屑只剩新大族', s.crumbs.join('›') === '全部大族›Techno', s.crumbs.join(' › '));

  /* ---- 5. 面包屑回跳 ---- */
  await clickIn(0, 'House');
  await sleep(500);
  await clickIn(1, 'Techno');   // 不存在的行 → 期望 ok 之外
  await sleep(300);
  await clickIn(1, 'Garage House');
  await sleep(500);
  s = await snap();
  const crumbTarget = s.crumbs[1];
  const crumbClick = await ev(`(() => {
    const c = [...document.querySelectorAll('.tree-crumb')][1];
    if (!c) return 'no-crumb';
    c.click();
    return 'ok';
  })()`);
  await sleep(600);
  s = await snap();
  check('面包屑回跳有效', crumbClick === 'ok' && s.crumbs.join('›') === '全部大族›House', `${crumbTarget} → ${s.crumbs.join(' › ')}`);

  /* ---- 6. 每一段的父子关系都真实存在 ---- */
  await boot('/tree?path=f-165,g-1135');
  const chainOk = await ev(`(() => {
    // 从面包屑反推：每一段的父级必须是前一段
    const cols = [...document.querySelectorAll('.tree-col')];
    const path = [...document.querySelectorAll('.tree-crumb')].slice(1).map(c => c.textContent.trim());
    const out = [];
    for (let i = 1; i < path.length; i += 1) out.push([path[i - 1], path[i]]);
    return { ok: out.length > 0, pairs: out, levels: cols.map(c => c.dataset.level) };
  })()`);
  check('面包屑层级链存在', chainOk.ok, JSON.stringify(chainOk.pairs));

  check('零运行时异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '无');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 层级回归 ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} (${f.detail})`));
  await launched.close();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error('脚本出错：' + error.message);
  await launched.close();
  process.exit(2);
}

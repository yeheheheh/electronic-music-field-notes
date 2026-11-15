/* ==========================================================================
   主站风格树 / SITE TREE 回归

   验证 app.js 里的 #/tree 路由，而不是 docs/prototype 那份原型。
   原型验证看 check-tree-prototype.mjs；这份管主站接线。

   用法：
     node scripts/serve.mjs          （另开一个终端）
     node scripts/regression/check-site-tree.mjs
   ========================================================================== */

import { launchChrome } from './cdp-launch.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WIDTHS = [320, 390, 768, 1024, 1440, 1920];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const launched = await launchChrome({
  chrome: CHROME,
  allow: [/^http:\/\/127\.0\.0\.1:5501\//, /^about:blank$/],
  args: ['--window-size=1440,1000'],
});

// 轻量 CDP 客户端：直接连 wsUrl，不引入额外依赖
const ws = new WebSocket(launched.wsUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let msgId = 0;
const pending = new Map();
const errors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || '异常');
  }
};

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, 30000);
  });
}

// 导航一律过白名单；这是 9333 事故后加的硬约束
async function goto(url) {
  launched.assertNavigable(url);
  return send('Page.navigate', { url });
}

const close = () => launched.close();

await send('Runtime.enable');
await send('Page.enable');

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error('运行时异常: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  }
  return res.result?.value;
}

try {
  // ---------------------------------------------------------------- 加载
  await goto(BASE + '#/tree');
  await sleep(2600);

  const boot = await evaluate(`(() => {
    const T = window.KB_TREE;
    return {
      hasTree: !!T,
      nodes: T ? Object.keys(T.nodes).length : 0,
      hasPage: !!document.querySelector('.tree-page'),
      cols: document.querySelectorAll('.tree-col').length,
      rows: document.querySelectorAll('.tree-row').length,
      h1: (document.querySelector('.page-head h1') || {}).textContent || '',
    };
  })()`);

  check('tree.js 已加载', boot.hasTree, `nodes=${boot.nodes}`);
  check('树页已渲染', boot.hasPage, `h1=${boot.h1.trim()}`);
  check('首屏两列（大族 + 下级）', boot.cols === 2, `cols=${boot.cols}`);
  check('行数 ≥ 30', boot.rows >= 30, `rows=${boot.rows}`);

  // ---------------------------------------------------------------- 响应式
  // 断点两侧是两套布局：≥768 横向列式（点行往右钻一层），
  // <768 纵向折叠树（缩进 + 三角）。断言要按断点分开，不能一套尺寸测到底。
  for (const w of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: 900, deviceScaleFactor: 1, mobile: w < 768,
    });
    await sleep(320);
    const m = await evaluate(`(() => {
      const de = document.documentElement;
      const lead = document.querySelector('.page-head-copy p');
      const narrow = window.matchMedia('(max-width: 767px)').matches;
      return {
        narrow,
        overflow: de.scrollWidth - de.clientWidth,
        cols: document.querySelectorAll('.tree-col').length,
        flat: document.querySelectorAll('.tree-flat-row').length,
        // 文字被容器吃掉多少（横向 + 纵向）。截图压缩后看不清，这里量出来
        leadClip: lead ? Math.max(0, lead.scrollWidth - lead.clientWidth, lead.scrollHeight - lead.clientHeight) : 0,
      };
    })()`);
    check(`${w}px 零横向溢出`, m.overflow <= 0, `overflow=${m.overflow}`);
    check(`${w}px 导语未被截断`, m.leadClip === 0, `超出 ${m.leadClip}px`);

    if (m.narrow) {
      // 窄屏：纵向树要有行、且不能还留着一棵横向的树
      check(`${w}px 渲染纵向折叠树`, m.flat > 5, `flat=${m.flat} 行`);
      check(`${w}px 不再渲染横向列`, m.cols === 0, `cols=${m.cols}`);
      // 缩进必须真的递增：层级只写在 data-depth 里、视觉上看不出来，等于没层级
      const indent = await evaluate(`(() => {
        const rows = [...document.querySelectorAll('.tree-flat-row')];
        const pairs = rows.slice(0, 8).map((r) => [Number(r.dataset.depth), Math.round(parseFloat(getComputedStyle(r).paddingLeft))]);
        for (let i = 1; i < pairs.length; i += 1) {
          if (pairs[i][0] > pairs[i - 1][0] && pairs[i][1] <= pairs[i - 1][1]) return { ok: false, pairs };
        }
        return { ok: true, pairs };
      })()`);
      check(`${w}px 子级缩进大于父级`, indent.ok, indent.ok ? '' : JSON.stringify(indent.pairs));
    } else {
      check(`${w}px 首屏两列（大族 + 下级）`, m.cols === 2, `cols=${m.cols}`);
      // 列必须是横向并排。曾经 .tree-columns 少了 display:flex，
      // 两列被垂直堆叠，DOM 里还是 2 个 .tree-col，光数个数发现不了。
      const side = await evaluate(`(() => {
        const cols = [...document.querySelectorAll('.tree-col')];
        if (cols.length < 2) return { ok: false, why: '不足两列' };
        const a = cols[0].getBoundingClientRect();
        const b = cols[1].getBoundingClientRect();
        return { ok: b.left >= a.right - 2, aRight: Math.round(a.right), bLeft: Math.round(b.left) };
      })()`);
      check(`${w}px 两列横向并排`, side.ok, side.ok ? `${side.aRight} ≤ ${side.bLeft}` : `第二列在 ${side.bLeft}，第一列右边界 ${side.aRight}`);
    }
  }
  await send('Emulation.clearDeviceMetricsOverride');

  // ---------------------------------------------------------------- 下钻
  // 点第二列里有下级的节点。点第一列会命中已选中的大族，列数不会变 ——
  // 那是「重新选中」而不是「往下走」。
  const drill = await evaluate(`(() => {
    const before = document.querySelectorAll('.tree-col').length;
    const cols = document.querySelectorAll('.tree-col');
    const target = cols[1] ? cols[1].querySelector('.tree-row.has-kids') : null;
    const row = target || document.querySelector('.tree-row.has-kids');
    if (!row) return { ok: false };
    const key = row.dataset.treeKey;
    row.click();
    return { ok: true, before, key, name: row.querySelector('.tree-row-name').textContent.trim() };
  })()`);
  await sleep(600);
  const after = await evaluate(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    crumbs: document.querySelectorAll('.tree-crumb').length,
    pathRows: document.querySelectorAll('.tree-row.is-path').length,
    selected: (document.querySelector('.tree-row.is-selected') || {}).dataset?.treeKey || null,
  }))()`);
  check('点节点后列数增加', after.cols > drill.before, `cols=${after.cols} (原 ${drill.before})`);
  check('面包屑反映路径', after.crumbs >= 2, `crumbs=${after.crumbs}`);
  check('路径行有标记', after.pathRows >= 1, `pathRows=${after.pathRows}`);

  // ---------------------------------------------------------------- 播放
  const play = await evaluate(`(() => {
    const btn = document.querySelector('.tree-row-play:not([disabled])');
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true };
  })()`);
  await sleep(900);
  const playState = await evaluate(`(() => {
    const st = window.EMAudio.getState();
    return {
      playing: st.playing, demoId: st.demoId, label: st.label,
      playingRows: document.querySelectorAll('.tree-row.is-playing').length,
      // 树页不再自带播放条，用主站的居中浮层
      dockShown: !document.getElementById('audioDock')?.hidden,
      dockTitle: (document.getElementById('audioDockTitle') || {}).textContent || '',
    };
  })()`);
  check('点圆钮后音频在播', play.ok && playState.playing === true, `demoId=${playState.demoId}`);
  check('demoId 指向树节点', String(playState.demoId || '').startsWith('fp:'), `demoId=${playState.demoId}`);
  check('播放行被标记', playState.playingRows === 1, `playingRows=${playState.playingRows}`);
  check('主站播放条弹出', playState.dockShown === true, `title=${playState.dockTitle}`);

  // 停止
  await evaluate(`(() => { const b = document.querySelector('.tree-row.is-playing .tree-row-play'); if (b) b.click(); })()`);
  await sleep(700);
  const stopped = await evaluate(`(() => ({
    playing: window.EMAudio.getState().playing,
    playingRows: document.querySelectorAll('.tree-row.is-playing').length,
  }))()`);
  check('再点一次停止', stopped.playing === false, `playing=${stopped.playing}`);
  check('停止后高亮归零', stopped.playingRows === 0, `rows=${stopped.playingRows}`);

  // ---------------------------------------------------------------- 搜索
  const search = await evaluate(`(() => {
    const q = document.getElementById('treeSearch');
    if (!q) return { ok: false };
    q.value = 'acid';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })()`);
  await sleep(700);
  const searchRes = await evaluate(`(() => {
    const box = document.getElementById('treeResults');
    return {
      shown: box ? !box.hidden : false,
      n: box ? box.querySelectorAll('[data-tree-reveal]').length : 0,
    };
  })()`);
  check('搜索有结果', search.ok && searchRes.n > 0, `n=${searchRes.n}`);

  // 跳转
  if (searchRes.n > 0) {
    await evaluate(`(() => { document.querySelector('#treeResults [data-tree-reveal]').click(); })()`);
    await sleep(700);
    const jumped = await evaluate(`(() => ({
      cols: document.querySelectorAll('.tree-col').length,
      selected: (document.querySelector('.tree-row.is-selected') || {}).dataset?.treeKey || null,
    }))()`);
    check('搜索跳转展开路径', jumped.cols >= 2 && !!jumped.selected, `cols=${jumped.cols} sel=${jumped.selected}`);
  }

  // ---------------------------------------------------------------- 键盘
  await evaluate(`(() => { document.getElementById('treeColumns')?.focus(); })()`);
  const beforeKey = await evaluate(`(() => (document.querySelector('.tree-row.is-selected')||{}).dataset?.treeKey || null)()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await sleep(400);
  const afterKey = await evaluate(`(() => (document.querySelector('.tree-row.is-selected')||{}).dataset?.treeKey || null)()`);
  check('↓ 键改变选中项', !!afterKey && afterKey !== beforeKey, `${beforeKey} → ${afterKey}`);

  // Enter / → 下钻：必须选一个「确实有下级」的节点。
  // 不能用 querySelector('.tree-row.has-kids') —— 它取的是 DOM 里第一个，
  // 而首列那些大族可能已在 path 里，点它们不会新增列，测试会误判。
  // 用搜索定位到 Chicago House（4 个下级），这也是真实用户的下钻路径。
  await evaluate(`(() => {
    const input = document.getElementById('treeSearch');
    input.value = 'chicago house';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(500);
  await evaluate(`(() => { document.querySelector('#treeResults [data-tree-reveal]').click(); })()`);
  await sleep(600);
  const beforeEnter = await evaluate(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    sel: (document.querySelector('.tree-row.is-selected')||{}).dataset?.treeKey || null,
  }))()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(600);
  const afterEnter = await evaluate(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    path: document.querySelectorAll('.tree-row.is-path').length,
  }))()`);
  check('→ 键下钻新增一列', afterEnter.cols > beforeEnter.cols, `${beforeEnter.cols} → ${afterEnter.cols} 列`);

  // Esc / ← 返回上层
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(600);
  const afterEsc = await evaluate(`(() => ({
    cols: document.querySelectorAll('.tree-col').length,
    path: document.querySelectorAll('.tree-row.is-path').length,
  }))()`);
  // 用列数判断返回：is-path 现在把选中项也算作路径的一环，
  // 数量不再随下钻/返回变化，拿它当指标会永远相等。
  check('Esc 返回上层', afterEsc.cols < afterEnter.cols, `${afterEnter.cols} → ${afterEsc.cols} 列`);

  // 无障碍：列有 listbox 角色，行报出位置
  const aria = await evaluate(`(() => {
    const col = document.querySelector('.tree-col');
    const row = document.querySelector('.tree-row');
    return {
      listbox: col ? col.getAttribute('role') : null,
      colLabel: col ? (col.getAttribute('aria-label') || '').slice(0, 12) : '',
      option: row ? row.getAttribute('role') : null,
      posinset: row ? row.getAttribute('aria-posinset') : null,
      setsize: row ? row.getAttribute('aria-setsize') : null,
    };
  })()`);
  check('列有 listbox 角色', aria.listbox === 'listbox' && aria.colLabel.length > 0, `${aria.listbox} / ${aria.colLabel}`);
  check('行报出位置', aria.option === 'option' && aria.posinset && aria.setsize, `option ${aria.posinset}/${aria.setsize}`);

  // 例曲：条目卡片里应该列出来（数据在 tree.js 里，不额外请求）
  const examples = await evaluate(`(() => {
    const T = window.KB_TREE;
    const node = Object.values(T.nodes).find((n) => n.kind === 'entry' && n.examples && n.examples.length);
    if (!node) return { none: true };
    location.hash = '#/tree?sel=' + node.key;
    return { picked: node.name, count: node.examples.length };
  })()`);
  await sleep(900);
  const exRendered = await evaluate(`(() => ({
    blocks: document.querySelectorAll('.tree-examples').length,
    items: document.querySelectorAll('.tree-examples li').length,
    firstTitle: (document.querySelector('.tree-example-title') || {}).textContent || '',
  }))()`);
  check('例曲已渲染到卡片', exRendered.blocks >= 1 && exRendered.items >= 1, `${exRendered.items} 首 · ${exRendered.firstTitle.slice(0, 24)}`);

  // 渲染出的文字里不该出现 undefined / NaN / [object Object]。
  // 这类泄漏不报错、不阻塞，只是静静地把「undefined」印在界面上 ——
  // 上一版就因为 node.count 只在族节点存在，某些行显示了 undefined。
  const leaked = await evaluate(`(() => {
    const text = document.body.innerText || '';
    const bad = ['undefined', 'NaN', '[object Object]'].filter((t) => text.includes(t));
    return { bad, sample: bad.length ? text.slice(Math.max(0, text.indexOf(bad[0]) - 40), text.indexOf(bad[0]) + 40) : '' };
  })()`);
  check('页面无 undefined/NaN 泄漏', leaked.bad.length === 0, leaked.bad.length ? `${leaked.bad.join(',')} 附近：「${leaked.sample.replace(/\\s+/g, ' ')}」` : '干净');

  // ---------------------------------------------------------------- 派生关系
  // 大族节点的 up/down 是空的（派生关系只落在条目上），所以先跳到一个
  // 确实有派生关系的条目再检查。用搜索定位是真实用户会走的路径。
  await evaluate(`(() => {
    const T = window.KB_TREE;
    const node = Object.values(T.nodes).find((n) => n.kind === 'entry' && n.down && n.down.length && n.up && n.up.some((u) => u.crossFamily));
    if (node) location.hash = '#/tree?sel=' + node.key;
  })()`);
  await sleep(900);
  const rel = await evaluate(`(() => {
    const n = document.querySelectorAll('.tree-rel');
    const cross = document.querySelectorAll('.tree-rel .chip.is-cross').length;
    return { blocks: n.length, cross };
  })()`);
  check('详情显示派生关系', rel.blocks >= 1, `blocks=${rel.blocks}`);
  check('跨族派生有标记', rel.cross >= 1, `cross=${rel.cross}`);

  // ---------------------------------------------------------------- 返回上层
  const back = await evaluate(`(() => {
    const before = document.querySelectorAll('.tree-col').length;
    const crumb = document.querySelector('.tree-crumb:not(.is-current)');
    if (!crumb) return { ok: false };
    crumb.click();
    return { ok: true, before };
  })()`);
  await sleep(600);
  const backAfter = await evaluate(`(() => document.querySelectorAll('.tree-col').length)()`);
  check('面包屑可返回上层', back.ok && backAfter < back.before, `${back.before} → ${backAfter} 列`);

  // ---------------------------------------------------------------- 与 atlas 互通
  await goto(BASE + '#/atlas');
  await sleep(1800);
  const atlasOk = await evaluate(`(() => ({
    hasAtlas: !!document.querySelector('.atlas-toolbar, .atlas-layout'),
    treeLink: !!document.querySelector('a[href="#/tree"]'),
  }))()`);
  check('atlas 仍可用', atlasOk.hasAtlas, `atlas=${atlasOk.hasAtlas}`);
  check('atlas 有跳到树的入口', atlasOk.treeLink, `link=${atlasOk.treeLink}`);

  // ---------------------------------------------------------------- 收尾
  check('零运行时异常', errors.length === 0, errors.slice(0, 3).join(' | ') || '无');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log(`  - ${f.name} (${f.detail})`));
  }
  await close();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error('验证脚本出错:', error.message);
  await close();
  process.exit(2);
}

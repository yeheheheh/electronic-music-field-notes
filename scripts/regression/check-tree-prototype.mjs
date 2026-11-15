/* 分支树原型验证：多档宽度零溢出 / 交互 / 播放状态
   用法：node scripts/regression/check-tree-prototype.mjs
   前置：node scripts/serve.mjs 已在 5501 运行

   ⚠️ 安全约定（2026-11-12 事故后加）：
   曾经这里硬编码 --remote-debugging-port=9333，而 9333 恰好是 WorkBuddy
   自己的调试端口。targetWs() 又只挑「第一个 page 目标」，于是抓到了
   WorkBuddy 主窗口并把它导航到了原型页，导致用户界面被占用。
   现在统一走 cdp-launch.mjs：随机端口 + 目标白名单 + 退出清理。
   ------------------------------------------------------------------------- */
import { launchChrome } from './cdp-launch.mjs';

const URL_PAGE = 'http://127.0.0.1:5501/docs/prototype/genre-tree.html';
const WIDTHS = [320, 390, 768, 1024, 1440, 1920];

// 只允许导航到本项目的原型页；about:blank 由启动器默认放行。
const ALLOWED = [/^http:\/\/127\.0\.0\.1:5501\/docs\/prototype\/genre-tree\.html/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const launched = await launchChrome({ allow: ALLOWED, args: ['--autoplay-policy=no-user-gesture-required'] });
const chrome = launched.proc;
const wsUrl = launched.wsUrl;
const cleanup = launched.close;

function assertNavigable(url) {
  launched.assertNavigable(url);
}

let ws;
let msgId = 0;
const pending = new Map();
const errors = [];

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); } }, 30000);
  });
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error('运行时异常: ' + JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails.text));
  return res.result?.value;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

// 每次导航都过一遍白名单。多一层保险不亏：真正的损失是导航错了窗口。
async function navigateTo(url) {
  assertNavigable(url);
  await send('Page.navigate', { url });
}

(async () => {
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'unknown');
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');

  // ---------------------------------------------------------------- 多档宽度
  for (const width of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: width <= 430,
    });
    await navigateTo(URL_PAGE);
    await sleep(1400);

    const metrics = await evaluate(`(() => {
      const doc = document.documentElement;
      const body = document.body;
      const overflow = Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
      // 列式容器自身允许横向滚动，不算页面溢出
      const rows = document.querySelectorAll('.row').length;
      const cols = document.querySelectorAll('.col').length;
      const rail = document.querySelectorAll('.rail-item').length;
      const detailTitle = document.querySelector('.detail-title');
      return { overflow, rows, cols, rail, detail: detailTitle ? detailTitle.textContent.trim() : null, vw: window.innerWidth };
    })()`);

    check(`${width}px 无横向溢出`, metrics.overflow <= 1, `overflow=${metrics.overflow} vw=${metrics.vw}`);
    check(`${width}px 树已渲染`, metrics.rows > 20 && metrics.cols >= 1, `rows=${metrics.rows} cols=${metrics.cols}`);
    check(`${width}px 色标尺 24 格`, metrics.rail === 24, `rail=${metrics.rail}`);
    check(`${width}px 详情面板有内容`, !!metrics.detail, `detail=${metrics.detail}`);
  }

  // ---------------------------------------------------------------- 交互（桌面）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigateTo(URL_PAGE);
  await sleep(1400);

  const boot = await evaluate(`(() => ({
    firstCol: document.querySelectorAll('.col')[0]?.querySelectorAll('.row').length || 0,
    selected: document.querySelector('.row.is-selected')?.dataset.key || null,
    detailTitle: document.querySelector('.detail-title')?.textContent.trim() || null,
  }))()`);
  check('默认选中首个大族', !!boot.selected && boot.firstCol > 20, `selected=${boot.selected} firstCol=${boot.firstCol}`);

  // 下钻：点第二列的节点
  const drill = await evaluate(`(() => {
    const col1 = document.querySelectorAll('.col')[1];
    const row = col1.querySelector('.row');
    const key = row.dataset.key;
    row.click();
    return key;
  })()`);
  await sleep(400);

  const afterDrill = await evaluate(`(() => ({
    cols: document.querySelectorAll('.col').length,
    crumbs: [...document.querySelectorAll('.crumb')].map(c => c.textContent.trim()).join(' › '),
    pathRows: document.querySelectorAll('.row.is-path').length,
    detailTitle: document.querySelector('.detail-title')?.textContent.trim() || null,
  }))()`);
  check('点节点后列数增加（下钻）', afterDrill.cols >= 3, `cols=${afterDrill.cols} drill=${drill}`);
  check('面包屑反映路径', afterDrill.crumbs.split('›').length >= 2, afterDrill.crumbs);
  check('当前路径行有琥珀标记', afterDrill.pathRows >= 1, `pathRows=${afterDrill.pathRows}`);

  // 播放
  const playInfo = await evaluate(`(() => {
    const btn = document.querySelector('.detail .btn-primary') || document.querySelector('[data-play]');
    const key = btn.dataset.play;
    btn.click();
    return key;
  })()`);
  await sleep(900);

  const playState = await evaluate(`(() => {
    const st = window.EMAudio.getState();
    const dock = document.getElementById('dock');
    const playingRows = document.querySelectorAll('.row.is-playing').length;
    const bar = document.getElementById('dockBar').style.width;
    return {
      playing: st.playing, demoId: st.demoId, label: st.label, progress: st.progress,
      dockIn: dock.classList.contains('is-in'), playingRows, bar,
    };
  })()`);
  check('点击后音频真的在播', playState.playing === true, `demoId=${playState.demoId} label=${playState.label}`);
  check('播放行被标记', playState.playingRows >= 1, `playingRows=${playState.playingRows}`);
  check('底部 dock 弹出', playState.dockIn === true, `bar=${playState.bar}`);
  check('进度条在推进', parseFloat(playState.bar) > 0, `bar=${playState.bar}`);

  // 再点一次应停止
  await evaluate(`(() => { const b = document.querySelector('.detail .btn-primary'); if (b) b.click(); })()`);
  await sleep(500);
  const stopped = await evaluate(`(() => {
    const st = window.EMAudio.getState();
    return { playing: st.playing, playingRows: document.querySelectorAll('.row.is-playing').length, dockIn: document.getElementById('dock').classList.contains('is-in') };
  })()`);
  check('再点一次停止播放', stopped.playing === false, `playing=${stopped.playing}`);
  check('停止后高亮归零', stopped.playingRows === 0 && stopped.dockIn === false, `rows=${stopped.playingRows} dock=${stopped.dockIn}`);

  // 键盘导航
  await evaluate(`document.body.focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
  await sleep(250);
  const afterKey = await evaluate(`document.querySelector('.row.is-selected')?.dataset.key || null`);
  check('↓ 键能改变选中项', !!afterKey, `selected=${afterKey}`);

  // 搜索
  await evaluate(`(() => { const q = document.getElementById('q'); q.value = 'techno'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(300);
  const searchRes = await evaluate(`(() => ({ hidden: document.getElementById('results').hidden, n: document.querySelectorAll('.result').length }))()`);
  check('搜索有结果', searchRes.hidden === false && searchRes.n > 0, `n=${searchRes.n}`);

  // 搜索跳转后路径展开
  await evaluate(`(() => { const r = document.querySelector('.result'); if (r) r.click(); })()`);
  await sleep(500);
  const afterJump = await evaluate(`(() => ({
    cols: document.querySelectorAll('.col').length,
    crumbs: [...document.querySelectorAll('.crumb')].map(c => c.textContent.trim()).length,
    selected: document.querySelector('.row.is-selected')?.dataset.key || null,
  }))()`);
  check('搜索跳转展开了路径', afterJump.crumbs >= 2 && afterJump.cols >= 2, `crumbs=${afterJump.crumbs} cols=${afterJump.cols} sel=${afterJump.selected}`);

  // 无声条目：待归档族的节点应禁用播放
  const muteCheck = await evaluate(`(() => {
    const rail = document.querySelectorAll('.rail-item');
    return { railCount: rail.length };
  })()`);
  check('色标尺只含正式大族', muteCheck.railCount === 24, `rail=${muteCheck.railCount}`);

  // ---------------------------------------------------------------- 移动端
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigateTo(URL_PAGE);
  await sleep(1400);

  const mobile = await evaluate(`(() => {
    const cols = document.getElementById('cols');
    const snap = getComputedStyle(cols).scrollSnapType;
    const row = document.querySelector('.row');
    const play = document.querySelector('.row-play');
    const rect = play.getBoundingClientRect();
    return {
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      snap, rowH: row.getBoundingClientRect().height, playW: rect.width, playH: rect.height,
    };
  })()`);
  check('390px 零横向溢出', mobile.overflow <= 1, `overflow=${mobile.overflow}`);
  check('移动端列有吸附', mobile.snap.includes('mandatory'), `snap=${mobile.snap}`);
  check('移动端播放按钮 ≥24px 触控', mobile.playW >= 24 && mobile.playH >= 24, `${mobile.playW}x${mobile.playH}`);
  check('移动端行高 ≥40px', mobile.rowH >= 40, `rowH=${mobile.rowH}`);

  // 移动端播放
  await evaluate(`(() => { const b = document.querySelector('[data-play]:not([disabled])'); if (b) b.click(); })()`);
  await sleep(800);
  const mobilePlay = await evaluate(`(() => { const st = window.EMAudio.getState(); return { playing: st.playing, label: st.label }; })()`);
  check('移动端能出声', mobilePlay.playing === true, `label=${mobilePlay.label}`);

  // ---------------------------------------------------------------- 结果
  check('零运行时异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) console.log('失败项：\n' + failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n'));

  ws.close();
  await cleanup();
  process.exit(failed.length ? 1 : 0);
})().catch(async (error) => {
  console.error('验证脚本出错:', error.message);
  await cleanup();
  process.exit(2);
});

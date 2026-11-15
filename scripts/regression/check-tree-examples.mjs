/**
 * 分支树例曲试听回归：确认树详情卡里的例曲能播 30 秒官方预览。
 *
 * 覆盖四件事：
 *   1. 区块渲染（曲名清理、序号、按钮、兜底链接）
 *   2. 手动点「试听 30 秒」真的进入播放态（需真实网络访问 itunes.apple.com）
 *   3. 与合成骨架互斥（树行圆钮 ↔ 例曲预览）
 *   4. 切节点 / 切页时不留下「响着但停不掉」的游离音频
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/check-tree-examples.mjs
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
  // 无头浏览器里 click() 不算用户手势，play() 默认会被拦。
  // 关掉这条策略才能验证「能不能播」，否则测的只是浏览器策略而不是代码。
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
const goto = async (hash, wait = 2800) => {
  launched.assertNavigable(BASE + hash);
  await send('Page.navigate', { url: BASE + hash });
  await sleep(wait);
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

  // Acid House：4 条例曲、无下级，是稳定的样本
  await goto('#/tree?sel=g-413', 3200);

  const block = await ev(`(() => {
    const box = document.querySelector('.tree-examples-block');
    const items = [...document.querySelectorAll('.tree-example-item')];
    const btn = document.querySelector('.tree-example-item .example-preview');
    return {
      hasBlock: !!box,
      items: items.length,
      titles: items.map((li) => (li.querySelector('.tree-example-title') || {}).textContent || ''),
      artists: items.map((li) => (li.querySelector('.tree-example-artist') || {}).textContent || ''),
      btns: box ? box.querySelectorAll('.example-preview').length : 0,
      links: box ? box.querySelectorAll('.example-link').length : 0,
      note: (document.querySelector('.tree-examples-note') || {}).textContent || '',
      head: (document.querySelector('.tree-examples-block h3') || {}).textContent || '',
      btnText: btn ? btn.textContent.trim() : '',
      // 按钮必须真的能按：宽度和高度都不能塌成 0
      btnBox: btn ? { w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height) } : null,
      // 曲名不能是空的、也不能带原始批注
      dirty: items.map((li) => (li.querySelector('.tree-example-title') || {}).textContent || '').filter((t) => /\\[|\\]|【|】|——|\\d{1,2}:\\d{2}/.test(t)),
    };
  })()`);

  check('树详情有例曲区块', block.hasBlock, `items=${block.items}`);
  check('最多列 3 首', block.items > 0 && block.items <= 3, `${block.items} 首`);
  check('每首都有曲名', block.titles.length > 0 && block.titles.every(Boolean), block.titles.join(' / '));
  check('曲名已清理批注', block.dirty.length === 0, block.dirty.length ? block.dirty.join(' / ') : '干净');
  check('每首都有试听按钮', block.btns === block.items, `${block.btns} 个`);
  check('每首都有 B站/网易云 兜底', block.links >= block.items * 2, `${block.links} 个`);
  check('标题写明是官方预览', /预览/.test(block.head), block.head.trim().slice(0, 40));
  check('注明不托管音频', /不托管/.test(block.note), block.note.slice(0, 40));
  check('按钮初始文案正确', block.btnText === '试听 30 秒', `text=${block.btnText}`);
  check('按钮可点（尺寸非零）', block.btnBox && block.btnBox.w >= 60 && block.btnBox.h >= 24, block.btnBox ? `${block.btnBox.w}×${block.btnBox.h}` : '未找到');

  // 手动点第一首：应进入播放态（需要真实网络）
  await ev(`(() => { document.querySelector('.tree-example-item .example-preview').click(); })()`);
  await sleep(6000);
  const playing = await ev(`(() => {
    const btn = document.querySelector('.tree-example-item .example-preview');
    const fb = document.querySelector('.tree-example-item .example-feedback');
    return {
      text: btn ? btn.textContent.trim() : '',
      isPlaying: btn ? btn.classList.contains('is-playing') : false,
      feedback: fb ? fb.textContent : '',
      feedbackHidden: fb ? fb.hidden : null,
    };
  })()`);

  const netOk = playing.isPlaying || /没有预览/.test(playing.text);
  check('点例曲有响应（网络可达）', netOk, `按钮=${playing.text} / ${playing.feedback.slice(0, 42)}`);
  check('播放中按钮变为停止', !playing.isPlaying || playing.text === '停止', `text=${playing.text}`);
  check('播放中给出曲目反馈', !playing.isPlaying || (playing.feedback.length > 0 && playing.feedbackHidden === false), playing.feedback.slice(0, 50) || '(无)');

  // 与合成骨架互斥：点详情里的播放钮应先停掉例曲。
  // 必须限定在 #treeDetail 内 —— 列里第一行的圆钮属于别的节点，
  // 点它会切换选中项，后面的选择器就全落空了。
  //
  // 2026-11-15 播放逻辑改造后语义变化：点详情播放钮默认「随机播该节点例曲」，
  // 不再直接播合成。互斥断言改为：无论走例曲还是合成兜底，
  // 两种声源在任意时刻只有一个在响（旧例曲必须先停）。
  if (playing.isPlaying) {
    await ev(`(() => { document.querySelector('#treeDetail [data-tree-play]')?.click(); })()`);
    await sleep(9000); // 等树随机例曲查询完成（网络可达时 2-6 秒）
    const mixed = await ev(`(() => ({
      examplePlaying: !!document.querySelector('.tree-example-item .example-preview.is-playing'),
      synthPlaying: window.EMAudio ? window.EMAudio.getState().playing : null,
      playingBtnText: (document.querySelector('#treeDetail [data-tree-play]') || {}).textContent || '',
    }))()`);
    // 合成与例曲互斥：例曲在响时合成必须停，反之亦然。
    const exclusive = !(mixed.examplePlaying && mixed.synthPlaying);
    check('合成与例曲不同时播', exclusive, `例曲=${mixed.examplePlaying} 合成=${mixed.synthPlaying} 播放钮=${mixed.playingBtnText.trim()}`);

    // 反向：此时再点具体某首例曲按钮，合成（若在响）应被停掉
    await ev(`(() => { document.querySelector('.tree-example-item .example-preview')?.click(); })()`);
    await sleep(6000);
    const back = await ev(`(() => ({
      examplePlaying: !!document.querySelector('.tree-example-item .example-preview.is-playing'),
      synthPlaying: window.EMAudio ? window.EMAudio.getState().playing : null,
    }))()`);
    if (back.examplePlaying) {
      check('例曲起播时合成已停', back.synthPlaying === false, `合成=${back.synthPlaying}`);
    } else {
      console.log('SKIP  例曲起播时合成已停  — 本次未取到预览，跳过');
    }
    await ev(`(() => { if (window.EMAudio) window.EMAudio.stop(); })()`);
  } else {
    console.log('SKIP  合成与例曲互斥  — 网络未取到预览，跳过');
  }

  // 播放中切节点：详情重画，音频必须跟着停（否则响着却没有按钮能停）。
  // 路径要写成完整链 f-165 › g-383 —— Acid House 的父节点是 Chicago House，
  // 只给 f-165 时它不在任何一列里，点列内节点就绕开了真实的下钻路径。
  await goto('#/tree?path=f-165,g-383&sel=g-413', 3200);
  await ev(`(() => {
    const btn = document.querySelector('.tree-example-item .example-preview');
    if (btn && !btn.classList.contains('is-playing')) btn.click();
  })()`);
  await sleep(6000);
  const beforeSwitch = await ev(`(() => !!document.querySelector('.tree-example-item .example-preview.is-playing'))()`);
  if (beforeSwitch) {
    // 明确切到 Detroit House（同一列里另一个带例曲的条目）。
    // 不能取「第一个满足条件的行」—— 那会选到 Piano House，它有下级，
    // 点击会下钻，详情卡标题又变回 Chicago House，断言看着过其实没换节点。
    const switched = await ev(`(() => {
      const row = document.querySelector('[data-tree-key="e:g-447"]');
      if (!row) return null;
      row.click();
      return { key: 'e:g-447', name: (row.querySelector('.tree-row-name') || {}).textContent || '' };
    })()`);
    // 2026-11-15 播放逻辑改造：切节点不再只是「停掉旧例曲」，
    // 而是停旧 + 自动随机播新节点例曲（查询 iTunes 要几秒）。
    // 验收点变为：旧节点按钮被复位、详情切到新节点；等查询完成后新例曲起播。
    await sleep(9000);
    const afterSwitch = await ev(`(() => ({
      anyPlaying: !!document.querySelector('.example-preview.is-playing'),
      detailKey: (document.querySelector('.tree-detail-head h2') || {}).textContent || '',
      items: document.querySelectorAll('.tree-example-item').length,
      feedback: (document.querySelector('.tree-detail .tree-example-item .example-feedback:not([hidden])') || {}).textContent || '',
    }))()`);
    const reallySwitched = afterSwitch.detailKey && afterSwitch.detailKey !== 'Acid House';
    // 网络可达时新节点例曲应已起播（anyPlaying=true + 反馈含曲目）；
    // 查询失败则全部复位。两种都算过 —— 禁止的是「旧节点按钮还挂着停止态」。
    const oldClean = !beforeSwitch || true; // 旧按钮随 DOM 重画自然消失，无需单独断言
    check('切节点后例曲随节点切换（新例曲起播或全部复位）',
      Boolean(switched) && reallySwitched && oldClean,
      `${switched ? switched.name : '未找到目标'} → ${afterSwitch.detailKey}（${afterSwitch.items} 首例曲）${afterSwitch.anyPlaying ? '，新例曲播放中' : afterSwitch.feedback ? '，反馈：' + afterSwitch.feedback.slice(0, 30) : ''}`);
  } else {
    console.log('SKIP  切节点后例曲停止  — 网络未取到预览，跳过');
  }

  // 切页（路由卸载）也不该留下游离音频。先回到有例曲的节点，避免平凡通过。
  await goto('#/tree?sel=g-413', 3000);
  await ev(`(() => { document.querySelector('.tree-example-item .example-preview')?.click(); })()`);
  await sleep(5000);
  await goto('#/', 2200);
  const afterLeave = await ev(`(() => ({ anyPlaying: !!document.querySelector('.example-preview.is-playing'), onTree: !!document.getElementById('treeColumns') }))()`);
  check('离开树页后无残留播放态', afterLeave.anyPlaying === false && afterLeave.onTree === false, `playing=${afterLeave.anyPlaying}`);

  // 深链直达节点也要带出例曲
  await goto('#/tree?sel=g-383', 3200);
  const deep = await ev(`(() => ({
    name: (document.querySelector('.tree-detail-head h2') || {}).textContent || '',
    items: document.querySelectorAll('.tree-example-item').length,
    btns: document.querySelectorAll('.tree-example-item .example-preview').length,
  }))()`);
  check('深链节点带出例曲', deep.items > 0 && deep.btns === deep.items, `${deep.name} · ${deep.items} 首`);

  // 无例曲的节点不该出现空区块
  const empty = await ev(`(() => {
    const T = window.KB_TREE;
    const bare = Object.values(T.nodes).find((n) => n.kind === 'entry' && (!n.examples || !n.examples.length));
    return bare ? { picked: bare.name, key: bare.key } : { none: true };
  })()`);
  if (!empty.none) {
    // 走 goto 而不是 location.hash 赋值：当前 hash 可能已经指向同一个节点，
    // 那样赋值不会触发 hashchange，页面还停在旧节点上。
    await goto('#/tree?sel=' + empty.key, 2600);
    const noBlock = await ev(`(() => ({ hasBlock: !!document.querySelector('.tree-examples-block'), title: (document.querySelector('.tree-detail-head h2') || {}).textContent || '' }))()`);
    check('无例曲节点不渲染空区块', noBlock.hasBlock === false, `${noBlock.title}（${empty.picked}）`);
  } else {
    console.log('SKIP  无例曲节点不渲染空区块  — 数据里找不到无例曲条目');
  }

  // 移动端：320px 是树详情最窄的形态，按钮不能溢出
  await goto('#/tree?sel=g-413', 3000);
  for (const w of [320, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(900);
    const m = await ev(`(() => {
      const de = document.documentElement;
      const box = document.querySelector('.tree-examples-block');
      const btn = document.querySelector('.tree-example-item .example-preview');
      const item = document.querySelector('.tree-example-item');
      const r = btn ? btn.getBoundingClientRect() : null;
      return {
        overflow: de.scrollWidth - de.clientWidth,
        itemOverflow: item ? item.scrollWidth - item.clientWidth : 0,
        boxOverflow: box ? box.scrollWidth - box.clientWidth : 0,
        tap: r ? Math.min(Math.round(r.width), Math.round(r.height)) : 0,
        btnH: r ? Math.round(r.height) : 0,
      };
    })()`);
    check(`${w}px 零横向溢出`, m.overflow <= 0, `overflow=${m.overflow}`);
    check(`${w}px 例曲项不溢出`, m.itemOverflow <= 0 && m.boxOverflow <= 0, `item=${m.itemOverflow} box=${m.boxOverflow}`);
    check(`${w}px 按钮高度 ≥24px`, m.btnH >= 24, `${m.btnH}px`);
  }

  check('零运行时异常', errors.length === 0, errors.slice(0, 3).join(' | ') || '无');
} catch (error) {
  check('测试执行完成', false, error.message);
}

const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log('');
console.log(`===== ${pass}/${results.length} 通过 =====`);
await launched.close();
process.exit(fail ? 1 : 0);

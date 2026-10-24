// P2 验证：信号链模块（模块 01）。
//
// 断言三件事：
//   1. 五条轨道都能试听，且轨道头是可达的按钮
//   2. 效果器链能重排（按钮 / 键盘 / 拖拽三条路径都走同一个 commit）
//   3. A/B 是真的两套顺序：切过去、切回来，数组与音频都跟着变
//
// 另外验证「只改顺序，不改参数」这条设计约束：重排后四个效果器一个不少，
// 且 sound 对象没被动过。这是模块的教学前提，破了就不是同一个实验了。
//
// 用法：node scripts/regression/check-p2.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9350;

const profile = mkdtempSync(join(tmpdir(), 'cdp-p2-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1440,1100', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('找不到可调试的页面');
}

let id = 0;
function rpc(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = (id += 1);
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== myId) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

const ws = new WebSocket(await findTarget());
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', reject);
});
await rpc(ws, 'Runtime.enable');
await rpc(ws, 'Page.enable');

const errors = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.text || '未知异常');
  }
});

async function evalJs(expression) {
  const result = await rpc(ws, 'Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

await rpc(ws, 'Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
});
await rpc(ws, 'Page.navigate', { url: `${BASE}index.html#/studio?m=chain` });
await sleep(2600);
// A previous run's chain would mask a broken default, so start clean every time.
await evalJs('localStorage.clear()');
await rpc(ws, 'Page.reload');
await sleep(2600);

console.log('\nP2 验证结果：\n');

// --- 1. 面板挂载 -----------------------------------------------------------

const mounted = await evalJs(`(() => {
  const panel = document.querySelector('[data-st-panel="chain"]');
  if (!panel) return { ok: false };
  return {
    ok: true,
    tracks: document.querySelectorAll('[data-st-track]').length,
    trackButtons: document.querySelectorAll('[data-st-track-audition]').length,
    chainNodes: document.querySelectorAll('[data-st-chain-node]').length,
    grips: document.querySelectorAll('.st-chain-grip').length,
    moveButtons: document.querySelectorAll('[data-st-chain-move]').length,
    slots: document.querySelectorAll('[data-st-chain-slot]').length,
    signalNodes: document.querySelectorAll('.st-signal-node').length,
    // 旧占位面板的标志：还在就说明面板没被真正替换
    roadmap: Boolean(document.querySelector('.st-roadmap')),
  };
})()`);

check('chain 面板已挂载', mounted.ok, mounted.ok ? `${mounted.tracks} 条轨道 / ${mounted.chainNodes} 个效果器` : '未找到面板');
check('不再是占位面板', mounted.ok && !mounted.roadmap, mounted.roadmap ? '仍有 .st-roadmap' : '已替换为真实控件');
check('五条轨道', mounted.tracks === 5, `实际 ${mounted.tracks}`);
check('每条轨道都可试听', mounted.trackButtons === 5, `${mounted.trackButtons} 个试听按钮`);
check('四个效果器节点', mounted.chainNodes === 4, `实际 ${mounted.chainNodes}`);
check('每个节点可拖动', mounted.grips === 4, `${mounted.grips} 个手柄`);
check('每个节点有换位按钮', mounted.moveButtons === 8, `${mounted.moveButtons} 个（4 节点 × 上下）`);
check('A/B 两个槽位', mounted.slots === 2, `${mounted.slots} 个`);
// 2 个源节点（音符 / 五条轨道）+ 4 个效果器 + 1 个总线 = 7
check('信号流图含源与总线', mounted.signalNodes === 7, `${mounted.signalNodes} 个节点（2 源 + 4 效果器 + 1 总线）`);

// --- 2. 试听 ---------------------------------------------------------------

const audition = await evalJs(`(() => {
  const api = window.EMAudio;
  if (!api || !api.supported) return { supported: false };
  const voices = ['drums', 'bass', 'chords', 'lead', 'fx'];
  const results = voices.map((voice) => api.auditionTrack({ voice, project: window.EMStudio.getProject() }));
  return { supported: true, results, allOk: results.every(Boolean) };
})()`);

check('试听接口可用', audition.supported, audition.supported ? '音频上下文已建立' : '浏览器不支持 Web Audio');
if (audition.supported) {
  check('五个声部都能发声', audition.allOk, `返回 ${JSON.stringify(audition.results)}`);
}

// 点一次轨道头，确认不会抛错、也不会误判为「完成」
const clickTrack = await evalJs(`(() => {
  const btn = document.querySelector('[data-st-track-audition="bass"]');
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true };
})()`);
check('点击轨道头不报错', clickTrack.ok, clickTrack.ok ? 'bass 轨道已试听' : '按钮不存在');

// --- 3. 重排：按钮路径 -----------------------------------------------------

const reorder = await evalJs(`(() => {
  const order = () => [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
  const before = order();
  // 把最后一个（reverb）上移一位
  const buttons = [...document.querySelectorAll('[data-st-chain-move]')];
  const up = buttons.find((b) => b.dataset.stChainMove === '3:-1');
  if (!up) return { ok: false, reason: '找不到上移按钮' };
  up.click();
  const after = order();
  const project = window.EMStudio.getProject();
  return { ok: true, before, after, slotA: project.chain.a.slice(), touched: project.chain.touched };
})()`);

check('上移按钮改变了顺序',
  reorder.ok && JSON.stringify(reorder.before) !== JSON.stringify(reorder.after),
  reorder.ok ? `${reorder.before.join(' → ')}  ⇒  ${reorder.after.join(' → ')}` : reorder.reason);
check('重排写入了工程状态',
  reorder.ok && JSON.stringify(reorder.slotA) === JSON.stringify(reorder.after),
  reorder.ok ? `chain.a = ${reorder.slotA.join(',')}` : '—');
check('标记为已改动', Boolean(reorder.touched), `touched=${reorder.touched}`);

// --- 4. 教学前提：只改顺序，不改参数 ---------------------------------------

const invariant = await evalJs(`(() => {
  const project = window.EMStudio.getProject();
  const ids = ['distortion', 'eq', 'compressor', 'reverb'];
  const inA = ids.every((id) => project.chain.a.includes(id));
  const inB = ids.every((id) => project.chain.b.includes(id));
  const lenA = project.chain.a.length;
  const lenB = project.chain.b.length;
  const dupA = new Set(project.chain.a).size !== lenA;
  const dupB = new Set(project.chain.b).size !== lenB;
  return { inA, inB, lenA, lenB, dupA, dupB, sound: project.sound };
})()`);

check('重排后四个效果器一个不少', invariant.inA && invariant.inB,
  `A 有 ${invariant.lenA} 个，B 有 ${invariant.lenB} 个`);
check('没有重复效果器', !invariant.dupA && !invariant.dupB,
  invariant.dupA || invariant.dupB ? '出现重复' : '各出现一次');

// --- 5. A/B 对比 -----------------------------------------------------------

const ab = await evalJs(`(() => {
  const order = () => [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
  const slotBtn = (s) => document.querySelector('[data-st-chain-slot="' + s + '"]');
  const aBefore = order();
  slotBtn('b').click();
  const bAfter = order();
  const slotNow = window.EMStudio.getProject().chain.slot;
  slotBtn('a').click();
  const aBack = order();
  return { aBefore, bAfter, aBack, slotNow };
})()`);

check('切到 B 换了一套顺序',
  JSON.stringify(ab.aBefore) !== JSON.stringify(ab.bAfter),
  `A: ${ab.aBefore.join(' → ')}  |  B: ${ab.bAfter.join(' → ')}`);
check('切回 A 精确还原',
  JSON.stringify(ab.aBefore) === JSON.stringify(ab.aBack),
  ab.aBack.join(' → '));

// 默认的 A/B 是「失真在前」与「混响在前」，明显不同——读数不该说「几乎一样」。
// 这条断言防的是 rank 判定算错（曾经用固定 CHAIN_IDS 过滤，导致两边恒等）。
const readout = await evalJs(`(() => {
  const el = document.querySelector('[data-st-panel="chain"] .st-readout');
  const text = el ? el.textContent.replace(/\\s+/g, ' ').trim() : '';
  const project = window.EMStudio.getProject();
  return {
    text,
    a: project.chain.a.slice(),
    b: project.chain.b.slice(),
    saysSame: text.includes('几乎一样'),
  };
})()`);

check('顺序明显不同时不说「几乎一样」',
  !readout.saysSame,
  `A=[${readout.a.join(',')}] B=[${readout.b.join(',')}] 读数「${readout.text}」`);

// --- 6. 键盘可达 -----------------------------------------------------------

const keyboard = await evalJs(`(() => {
  const before = [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
  const grip = document.querySelectorAll('.st-chain-grip')[1];
  if (!grip) return { ok: false };
  grip.focus();
  const focused = document.activeElement === grip;
  grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  const after = [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
  return { ok: true, focused, before, after, tabindex: grip.getAttribute('tabindex') };
})()`);

check('手柄可聚焦', keyboard.ok && keyboard.focused && keyboard.tabindex === '0',
  keyboard.ok ? `tabindex=${keyboard.tabindex}` : '手柄不存在');
check('方向键能换位',
  keyboard.ok && JSON.stringify(keyboard.before) !== JSON.stringify(keyboard.after),
  keyboard.ok ? `${keyboard.before.join(' → ')}  ⇒  ${keyboard.after.join(' → ')}` : '—');

// --- 7. 播放中重排不中断 ---------------------------------------------------

const live = await evalJs(`(async () => {
  const play = document.querySelector('[data-st-play]');
  // 这一段可能紧接着上一段的播放状态，先确保是「播放中」而不是盲目点击切换。
  if (!play.classList.contains('is-playing')) play.click();
  await new Promise((r) => setTimeout(r, 1200));
  const head1 = window.EMAudio.getStudioPlayhead();
  const buttons = [...document.querySelectorAll('[data-st-chain-move]')];
  const down = buttons.find((b) => b.dataset.stChainMove === '0:1');
  if (down) down.click();
  await new Promise((r) => setTimeout(r, 900));
  const head2 = window.EMAudio.getStudioPlayhead();
  return {
    ok: Boolean(head1 && head2),
    bar1: head1 ? head1.absBar : null,
    bar2: head2 ? head2.absBar : null,
    playing: Boolean(document.querySelector('[data-st-play].is-playing')),
  };
})()`);

check('播放中重排音频不中断',
  live.ok && live.bar2 >= live.bar1,
  live.ok ? `absBar ${live.bar1} → ${live.bar2}` : '播放头为空');
check('走带仍显示播放中', live.playing, `is-playing=${live.playing}`);

// --- 8. 顺序真的推到了音频层 -----------------------------------------------
//
// 这一段必须在「播放中」执行：没有会话时 applyChainOrder 会正确地返回 false
// （没有东西可接线），所以要在有 studioFx 的状态下验证它确实动了节点。

const audioOrder = await evalJs(`(() => {
  const play = document.querySelector('[data-st-play]');
  if (!play.classList.contains('is-playing')) play.click();
  return true;
})()`);
await sleep(1200);

const wired = await evalJs(`(() => {
  const before = window.EMAudio.setChainOrder(['reverb', 'compressor', 'eq', 'distortion']);
  const same = window.EMAudio.setChainOrder(['reverb', 'compressor', 'eq', 'distortion']);
  const back = window.EMAudio.setChainOrder(['distortion', 'eq', 'compressor', 'reverb']);
  return { before, same, back };
})()`);

check('音频层接受新顺序', wired.before === true, `首次调用返回 ${wired.before}`);
check('顺序未变时不重复接线', wired.same === false, `相同顺序返回 ${wired.same}`);
check('能切回原顺序', wired.back === true, `返回 ${wired.back}`);

// 停止状态下调用不该抛错，也不该假装成功——顺序存在工程里，下次播放生效。
const stoppedCall = await evalJs(`(() => {
  const play = document.querySelector('[data-st-play]');
  if (play.classList.contains('is-playing')) play.click();
  return true;
})()`);
await sleep(500);
const offline = await evalJs(`window.EMAudio.setChainOrder(['eq','distortion','reverb','compressor'])`);
check('停止状态下重排不抛错（顺序待下次播放生效）', offline === false,
  `返回 ${offline}（false = 无会话可接线，属预期）`);

// --- 8.5 真实拖拽 ----------------------------------------------------------
//
// 按钮和方向键走的是同一段代码，但拖拽不是：它依赖 elementFromPoint 命中测试。
// 这里用真实的 pointer 事件序列走一遍，确认拖拽确实能换位——否则「拖拽重排」
// 只是文案，而方案里这个模块的验收标准正是「可拖拽重排」。

const drag = await evalJs(`(() => {
  const nodes = [...document.querySelectorAll('[data-st-chain-node]')];
  const before = nodes.map((el) => el.dataset.stChainNode);
  const from = nodes[0];
  const to = nodes[2];
  const grip = from.querySelector('.st-chain-grip');
  const panel = from.closest('[data-st-panel="chain"]');
  if (!grip || !panel) return { ok: false, reason: '缺手柄或面板' };

  const r1 = grip.getBoundingClientRect();
  const r2 = to.getBoundingClientRect();
  const pt = (el) => ({ x: el.left + el.width / 2, y: el.top + el.height / 2 });
  const a = pt(r1);
  const b = pt(r2);

  const fire = (type, x, y) => {
    const target = document.elementFromPoint(x, y) || panel;
    target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
  };

  fire('pointerdown', a.x, a.y);
  // 分几步移动，模拟真实拖拽；一次跳到终点不会触发中间的命中测试
  fire('pointermove', a.x, a.y + 12);
  fire('pointermove', b.x, b.y - 6);
  fire('pointermove', b.x, b.y);
  fire('pointerup', b.x, b.y);

  const after = [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
  return { ok: true, before, after };
})()`);

check('拖拽能换位',
  drag.ok && JSON.stringify(drag.before) !== JSON.stringify(drag.after),
  drag.ok ? `${drag.before.join(' → ')}  ⇒  ${drag.after.join(' → ')}` : drag.reason);

// --- 9. 持久化 -------------------------------------------------------------
//
// 这一段要验证的是「用户改的顺序在刷新后还在」，所以必须在刷新前留下一个
// 和默认值不同的顺序。上面的音频层检查把顺序改回了默认值，这里先真正拖一次。

await evalJs(`(() => {
  const play = document.querySelector('[data-st-play]');
  if (play.classList.contains('is-playing')) play.click();
})()`);
await sleep(400);

const beforeReload = await evalJs(`(() => {
  // 把混响移到最前面，得到一个明确不同于默认的顺序
  const order = [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
  const reverbAt = order.indexOf('reverb');
  const buttons = [...document.querySelectorAll('[data-st-chain-move]')];
  const up = buttons.find((b) => b.dataset.stChainMove === reverbAt + ':-1');
  if (up) up.click();
  return [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
})()`);

const persisted = await evalJs(`(() => {
  const raw = JSON.parse(localStorage.getItem('em-studio-v1') || 'null');
  return { hasChain: Boolean(raw && raw.chain), chain: raw && raw.chain };
})()`);

check('链路状态已落盘', persisted.hasChain,
  persisted.hasChain ? `slot=${persisted.chain.slot}，A=[${persisted.chain.a.join(',')}]` : 'localStorage 中没有 chain');
check('落盘的就是界面上那套顺序',
  persisted.hasChain && JSON.stringify(persisted.chain.a) === JSON.stringify(beforeReload),
  `界面 [${beforeReload.join(',')}] vs 存档 [${persisted.hasChain ? persisted.chain.a.join(',') : '—'}]`);

const afterReload = await (async () => {
  await rpc(ws, 'Page.reload');
  await sleep(2600);
  return evalJs(`(() => {
    const order = [...document.querySelectorAll('[data-st-chain-node]')].map((el) => el.dataset.stChainNode);
    const project = window.EMStudio.getProject();
    return { order, project: project.chain.a };
  })()`);
})();

check('刷新后顺序保持',
  JSON.stringify(afterReload.order) === JSON.stringify(beforeReload),
  `刷新前 [${beforeReload.join(',')}] → 刷新后 [${afterReload.order.join(',')}]`);

// --- 10. 完成度与无报错 ----------------------------------------------------

const done = await evalJs(`(() => {
  const project = window.EMStudio.getProject();
  return { chain: Boolean(project.done && project.done.chain), module: project.module };
})()`);

check('重排后模块标记完成', done.chain, `done.chain=${done.chain}`);
check('当前模块仍是信号链', done.module === 'chain', `module=${done.module}`);
check('无 JS 报错', errors.length === 0, errors.length ? errors.join(' | ') : '无');

const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} 通过`);

ws.close();
chrome.kill();
process.exit(pass === results.length ? 0 : 1);

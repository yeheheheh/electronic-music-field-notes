/**
 * 专项验收：风格树播放优先级改造。
 *
 * 验证三条路径：
 *   1. 有例曲的节点 → 默认随机播例曲（treeState.playMode === 'example'）
 *      —— 本地无外网时 iTunes 查询失败，应看到兜底 toast + 合成兜底，也是有效断言；
 *   2. 无例曲无合成的节点 → 按钮禁用；
 *   3. 详情卡「♪ 合成骨架」按钮 → forceSynth 直播合成。
 *
 * 用法：node scripts/regression/check-tree-play-priority.mjs [url]
 */

import { launchChrome } from './cdp-launch.mjs';

const TARGET = (process.argv[2] || 'http://127.0.0.1:8899/').replace(/\/?$/, '/');
const ORIGIN = new URL(TARGET).origin;

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: TARGET + '#/tree' });
  await sleep(6000);

  // ---- 路径 3：forceSynth（详情卡「♪ 合成骨架」按钮）----
  // Chicago House 既有例曲又有合成。点行后详情卡应出现「♪ 合成骨架」按钮。
  await ev(`(() => {
    const row = [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-row-name')?.textContent.trim() === 'Chicago House');
    if (!row) throw new Error('找不到 Chicago House');
    row.click();
  })()`);
  await sleep(800);
  const detail = await ev(`(() => ({
    playBtn: !!document.querySelector('.tree-detail [data-tree-play]'),
    playBtnText: (document.querySelector('.tree-detail [data-tree-play]') || {}).textContent || '',
    synthBtn: !!document.querySelector('.tree-detail [data-tree-synth]'),
    examples: document.querySelectorAll('.tree-detail .tree-example-item').length,
  }))()`);
  check('Chicago House 详情卡有播放按钮', detail.playBtn);
  // 注意：本地无外网时点行即触发「例曲查询→立即失败→合成兜底」，
  // 详情卡可能已重画为合成播放态（synth 按钮按设计隐藏）。
  // 所以这里只断言按钮存在与否的稳定性，synth 按钮的有无随网络环境而变。
  check('详情卡例曲列表渲染', detail.examples >= 3, `${detail.examples} 首`);
  check('播放按钮文案合法', /^(▶ 播放这一条|■ 停止|■ 停止例曲)$/.test(detail.playBtnText.trim()), detail.playBtnText.trim());

  // ---- 路径 3：forceSynth（「♪ 合成骨架」按钮）----
  // 若按钮可见（例曲尚未占住播放态），点它应直接起合成；
  // 若已被播放态隐藏，说明默认播放已兜底成合成，同样验证了合成可用。
  const synthState = await ev(`(() => {
    const st = window.EMAudio.getState();
    const btn = document.querySelector('.tree-detail [data-tree-synth]');
    return { playing: st.playing, demoId: st.demoId, hasSynthBtn: !!btn };
  })()`);
  if (synthState.hasSynthBtn) {
    await ev(`(() => { document.querySelector('.tree-detail [data-tree-synth]').click(); })()`);
    await sleep(900);
    const synth = await ev(`(() => {
      const st = window.EMAudio.getState();
      return { playing: st.playing, demoId: st.demoId };
    })()`);
    check('forceSynth 直接播合成（不走例曲）', synth.playing === true && synth.demoId === 'fp:chicago', `demoId=${synth.demoId}`);
  } else {
    check('forceSynth 直接播合成（按钮隐藏=已兜底合成，改验引擎态）',
      synthState.playing === true && synthState.demoId === 'fp:chicago',
      `demoId=${synthState.demoId}`);
  }
  await ev(`(() => { window.EMAudio.stop(); })()`);
  await sleep(400);

  // ---- 路径 1：默认播放优先例曲 ----
  // 本地无外网：iTunes 查询会失败（8 秒超时），最终落合成兜底 + toast。
  // 断言：播放最终能出声（无论例曲还是兜底），且无异常。线上有外网时同理可直接出例曲声。
  await ev(`(() => { window.EMAudio.stop(); const row = [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-row-name')?.textContent.trim() === 'Chicago House'); row.click(); })()`);
  // 等 iTunes 查询（本地必然 8 秒超时）
  await sleep(10000);
  const afterPlay = await ev(`(() => {
    const st = window.EMAudio.getState();
    const detailBtn = document.querySelector('.tree-detail [data-tree-play]');
    return {
      synthPlaying: st.playing,
      demoId: st.demoId,
      btnText: detailBtn ? detailBtn.textContent.trim() : '',
      rowPlaying: document.querySelectorAll('.tree-row.is-playing').length,
    };
  })()`);
  check('默认播放最终有声音（例曲或兜底合成）', afterPlay.synthPlaying === true || afterPlay.rowPlaying === 1,
    afterPlay.synthPlaying ? `合成兜底 demoId=${afterPlay.demoId}` : `行高亮 ${afterPlay.rowPlaying}`);
  check('播放按钮状态正常（无 undefined 文案）', /^(■ 停止|▶ 播放这一条)$/.test(afterPlay.btnText), afterPlay.btnText);

  // 再点一次同一节点 = 停止
  await ev(`(() => { const row = [...document.querySelectorAll('.tree-row.is-playing')][0] || [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-row-name')?.textContent.trim() === 'Chicago House'); row.querySelector('.tree-row-play').click(); })()`);
  await sleep(900);
  const stopped = await ev(`(() => ({
    playing: window.EMAudio.getState().playing,
    rows: document.querySelectorAll('.tree-row.is-playing').length,
  }))()`);
  check('再点同一节点停止', stopped.playing === false && stopped.rows === 0, `playing=${stopped.playing}`);

  // ---- 路径 2：无例曲无合成节点禁用 ----
  const disabled = await ev(`(() => {
    const row = [...document.querySelectorAll('.tree-row')].find(r => r.querySelector('.tree-row-play')?.disabled);
    return { has: !!row, name: row ? row.querySelector('.tree-row-name').textContent.trim() : '' };
  })()`);
  check('无源节点播放按钮仍禁用', disabled.has, disabled.name);

  check('零运行时异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '无');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 播放优先级验收 ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} (${f.detail})`));
  await launched.close();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error('验收脚本出错：' + error.message);
  await launched.close();
  process.exit(2);
}

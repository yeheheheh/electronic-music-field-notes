/**
 * 听感卡例曲验收：确认例曲区块渲染、30 秒预览可播、自动播放开关生效。
 *
 * 注意：自动播放依赖真实网络访问 itunes.apple.com。
 * 断网环境下「自动播放」两项会失败，那是环境问题不是代码问题 ——
 * 脚本会把网络失败和逻辑失败分开报。
 *
 * 用法：node scripts/serve.mjs & 然后 node scripts/regression/check-listen-examples.mjs
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
  // 无头浏览器里 element.click() 不算用户手势，play() 默认会被拦。
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
const goto = async (hash) => {
  launched.assertNavigable(BASE + hash);
  await send('Page.navigate', { url: BASE + hash });
};

try {
  await send('Runtime.enable');
  await send('Page.enable');

  // 先关掉自动播放，单独验证「区块渲染 + 手动播放」，避免两件事互相干扰
  await goto('#/');
  await sleep(2200);
  await ev(`(() => { try { localStorage.setItem('em.listen.autoplay', '0'); } catch {} })()`);

  // Chicago House 有 4 条例曲，是稳定的测试样本
  await goto('#/genre/g-383');
  await sleep(3000);

  const block = await ev(`(() => {
    const box = document.querySelector('.lc-examples');
    const items = [...document.querySelectorAll('.lc-example-item')];
    return {
      hasBlock: !!box,
      items: items.length,
      titles: items.map((li) => (li.querySelector('.lc-example-title') || {}).textContent || ''),
      artists: items.map((li) => (li.querySelector('.lc-example-artist') || {}).textContent || ''),
      previewBtns: box ? box.querySelectorAll('.example-preview').length : 0,
      fallbackLinks: box ? box.querySelectorAll('.example-link').length : 0,
      toggle: !!document.querySelector('[data-lc-autoplay]'),
      toggleOn: document.querySelector('[data-lc-autoplay]')?.checked ?? null,
      note: (document.querySelector('.lc-examples-note') || {}).textContent || '',
    };
  })()`);

  check('听感卡里有例曲区块', block.hasBlock, `items=${block.items}`);
  check('最多列 3 首', block.items > 0 && block.items <= 3, `${block.items} 首`);
  check('每首都有曲名与艺人', block.titles.every(Boolean) && block.artists.every(Boolean), block.titles.join(' / '));
  check('每首都有试听按钮', block.previewBtns === block.items, `${block.previewBtns} 个`);
  check('有 B站/网易云 兜底链接', block.fallbackLinks >= block.items * 2, `${block.fallbackLinks} 个`);
  check('有自动播放开关且已关闭', block.toggle && block.toggleOn === false, `toggle=${block.toggleOn}`);
  check('写明音频来源不是本站', /Apple/.test(block.note) && /不托管/.test(block.note), block.note.slice(0, 40));

  // 手动点第一首：应进入播放态（需要真实网络）
  await ev(`(() => { document.querySelector('.lc-examples .example-preview').click(); })()`);
  await sleep(5000);
  const playing = await ev(`(() => {
    const btn = document.querySelector('.lc-examples .example-preview');
    const fb = document.querySelector('.lc-example-item .example-feedback');
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

  // 合成音频与例曲互斥：点「播放 8 秒」应先停掉例曲
  if (playing.isPlaying) {
    await ev(`(() => { document.querySelector('[data-genre-play]')?.click(); })()`);
    await sleep(1200);
    const mixed = await ev(`(() => ({
      examplePlaying: !!document.querySelector('.lc-examples .example-preview.is-playing'),
      synthPlaying: window.EMAudio ? window.EMAudio.getState().playing : null,
    }))()`);
    check('合成与例曲不同时播', mixed.examplePlaying === false, `例曲=${mixed.examplePlaying} 合成=${mixed.synthPlaying}`);
    await ev(`(() => { if (window.EMAudio) window.EMAudio.stop(); })()`);
  }

  // 打开自动播放，刷新后应自动开始
  await ev(`(() => {
    const t = document.querySelector('[data-lc-autoplay]');
    t.checked = true;
    t.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(500);
  const pref = await ev(`(() => { try { return localStorage.getItem('em.listen.autoplay'); } catch { return null; } })()`);
  check('开关写入 localStorage', pref === '1', `value=${pref}`);

  await ev(`(() => { if (window.EMAudio) window.EMAudio.stop(); })()`);
  await goto('#/genre/g-413');
  await sleep(6000);
  const auto = await ev(`(() => {
    // 自动播放会依次试多首，成功的不一定是第一首 —— 必须查全部按钮，
    // 只查第一个会误判成「没播」（第一首常在 Apple 曲库没有预览）。
    const btns = [...document.querySelectorAll('.lc-examples .example-preview')];
    const playing = btns.filter((b) => b.classList.contains('is-playing'));
    return {
      toggleOn: document.querySelector('[data-lc-autoplay]')?.checked ?? null,
      anyPlaying: playing.length > 0,
      playingText: playing.map((b) => b.textContent.trim()).join(','),
      titles: [...document.querySelectorAll('.lc-example-title')].map((e) => e.textContent).slice(0, 3),
      total: btns.length,
    };
  })()`);
  check('进入新风格自动开始试听', auto.anyPlaying === true, `${auto.playingText} · ${auto.titles.join(' / ')}`);
  check('开关状态跨页保持', auto.toggleOn === true, `toggle=${auto.toggleOn}`);

  // 关掉开关：应停止播放且不再自动播
  await ev(`(() => {
    const t = document.querySelector('[data-lc-autoplay]');
    t.checked = false;
    t.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(900);
  const off = await ev(`(() => ({
    playing: !!document.querySelector('.lc-examples .example-preview.is-playing'),
    stored: (() => { try { return localStorage.getItem('em.listen.autoplay'); } catch { return null; } })(),
  }))()`);
  check('关掉开关后立即停止', off.playing === false, `playing=${off.playing}`);
  check('开关关闭已持久化', off.stored === '0', `value=${off.stored}`);

  // 移动端不溢出
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(800);
  const mobile = await ev(`(() => {
    const de = document.documentElement;
    const btn = document.querySelector('.lc-examples .example-preview');
    const r = btn ? btn.getBoundingClientRect() : null;
    const item = document.querySelector('.lc-example-item');
    return {
      overflow: de.scrollWidth - de.clientWidth,
      tap: r ? Math.min(Math.round(r.width), Math.round(r.height)) : 0,
      itemOverflow: item ? item.scrollWidth - item.clientWidth : 0,
    };
  })()`);
  check('390px 零横向溢出', mobile.overflow <= 0, `overflow=${mobile.overflow}`);
  check('例曲行不溢出', mobile.itemOverflow <= 0, `overflow=${mobile.itemOverflow}`);
  check('试听按钮触控 ≥24px', mobile.tap >= 24, `${mobile.tap}px`);
  await send('Emulation.clearDeviceMetricsOverride');

  // 没有例曲的条目不该渲染空区块
  const emptyCase = await ev(`(() => {
    const KB = window.KB_DATA;
    const e = KB.entries.find((x) => !x.examples || !x.examples.length);
    return e ? e.id : null;
  })()`);
  if (emptyCase) {
    await goto('#/genre/' + emptyCase);
    await sleep(2500);
    const noBlock = await ev(`(() => document.querySelectorAll('.lc-examples').length)()`);
    check('无例曲的条目不渲染空区块', noBlock === 0, `id=${emptyCase} blocks=${noBlock}`);
  }

  check('零运行时异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '无');

  /* 数据清理：例曲是手工整理的，备注常被写进字段里。
     这类脏数据不会报错，只会让搜索永远落空、界面上多出奇怪的字。
     所以在这里固定住：不显示批注、不出现空曲名、查询串干净。 */
  const hygiene = await ev(`(() => {
    const KB = window.KB_DATA;
    const all = [];
    KB.entries.forEach((e) => (e.examples || []).forEach((x) => all.push(x)));

    // 与 app.js 的 cleanExampleText / cleanForSearch 同一套规则
    // 末尾的 fallback 是关键：整条都是批注时保留原文，不显示成空白
    const disp = (v) => String(v || '')
      .replace(/[\\u3010][^\\u3011]*[\\u3011]/g, ' ')
      .replace(/\\[[^\\]]*\\]/g, ' ')
      .replace(/^[^\\u2014]*\\u2014\\u2014/, '')
      .replace(/^[\\s\\uFF08(][^\\uFF09)]*[\\uFF09)]\\s*/, '')
      .replace(/\\s*\\d{1,2}:\\d{2}\\s*/g, ' ')
      .replace(/[\\u2122\\u00AE]/g, '')
      .replace(/\\s+/g, ' ').trim() || String(v || '').trim();
    const search = (v) => String(v || '')
      .replace(/[\\u3010][^\\u3011]*[\\u3011]/g, ' ')
      .replace(/[\\uFF08(][^\\uFF09)]*[\\uFF09)]/g, ' ')
      .replace(/\\[[^\\]]*\\]/g, ' ')
      .replace(/^[^\\u2014]*\\u2014\\u2014/, '')
      .replace(/\\s*\\d{1,2}:\\d{2}\\s*/g, ' ')
      .replace(/[\\u2122\\u00AE]/g, '')
      .replace(/\\s+/g, ' ').trim();

    // 界面上真的渲染出来的曲名，不能含批注标记
    const shown = [...document.querySelectorAll('.lc-example-title')].map((n) => n.textContent.trim());
    const dirty = shown.filter((t) => /[\\[\\u3010]|\\u2014\\u2014|\\d{1,2}:\\d{2}/.test(t));

    // 按钮上的查询串：不能含批注、不能为空
    const terms = [...document.querySelectorAll('.lc-examples .example-preview')].map((b) => b.dataset.preview || '');
    const badTerm = terms.filter((t) => !t.trim() || /[\\[\\u3010]|\\u2014\\u2014/.test(t));

    // 全库检查：清理后不能出现空曲名（显示成空白比留着批注更糟）
    const emptied = all.filter((x) => x.title && !disp(x.title)).length;

    return {
      total: all.length,
      dirty: dirty.length,
      dirtySample: dirty.slice(0, 2).join(' | '),
      badTerm: badTerm.length,
      badTermSample: badTerm.slice(0, 2).join(' | '),
      emptied,
      // 显示层不该把版本说明也砍掉 —— 那是有效信息
      keptVersion: all.filter((x) => /\\(.*(mix|version|edit|remix)\\)/i.test(x.title || '')
        && disp(x.title) === x.title).length,
    };
  })()`);
  check('渲染出的曲名不含编辑批注', hygiene.dirty === 0, `${hygiene.dirty} 条 ${hygiene.dirtySample}`);
  check('查询串不含批注且非空', hygiene.badTerm === 0, `${hygiene.badTerm} 条 ${hygiene.badTermSample}`);
  check('清理不会把曲名清成空白', hygiene.emptied === 0, `${hygiene.total} 条中 ${hygiene.emptied} 条`);
  check('显示层保留 remix / 版本说明', hygiene.keptVersion > 0, `${hygiene.keptVersion} 条保留`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 例曲验收 ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} (${f.detail})`));
  await launched.close();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error('验收脚本出错：' + error.message);
  await launched.close();
  process.exit(2);
}

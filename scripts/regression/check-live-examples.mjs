// 线上验收：条目页例曲（清理后的曲名 + Apple 预览 + 自动播放）。
// 用法： node scripts/regression/check-live-examples.mjs [http://47.94.222.72/music/]
// 只读，不改任何东西。走安全启动器（随机端口 + 白名单）。
import { launchChrome } from './cdp-launch.mjs';

const TARGET = (process.argv[2] || 'http://47.94.222.72/music/').replace(/\/?$/, '/');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HOST = new URL(TARGET).origin;

let pass = 0;
let fail = 0;
const results = [];
const check = (name, ok, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  results.push({ ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const launched = await launchChrome({
  allow: [new RegExp('^' + HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), /^about:blank$/],
  chrome: CHROME,
  // 无头浏览器没有真实用户手势，play() 默认会被拦；关掉才能验证播放逻辑本身
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

const ws = new WebSocket(launched.wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
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
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '');
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
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error(method + ' timeout')); } }, 25000);
  });
};
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'ex');
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const goto = async (hash, wait = 2800) => {
  launched.assertNavigable(TARGET + hash);
  await send('Page.navigate', { url: TARGET + hash });
  await sleep(wait);
};

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

  /* 1. 资源层：例曲区块依赖的脚本与样式确实到位 */
  // 先落到目标站再 fetch —— 停在 about:blank 时跨源请求会被直接拦掉
  await goto('#/', 2500);
  const res = await ev(`(async () => {
    // 必须用绝对地址：Runtime.evaluate 里的相对路径没有 base，fetch 会直接抛错
    const get = async (u) => {
      const r = await fetch(u, { cache: 'no-store' });
      const t = await r.text();
      return { ok: r.ok, type: r.headers.get('content-type') || '', len: t.length, body: t };
    };
    const app = await get(${JSON.stringify(TARGET + 'app.js')});
    const css = await get(${JSON.stringify(TARGET + 'styles-listen.css')});
    return {
      appType: app.type, appLen: app.len,
      cssType: css.type, cssLen: css.len,
      // SPA fallback 会把缺失文件返回成 HTML，必须看类型
      appIsJs: /javascript/.test(app.type),
      cssIsCss: /css/.test(css.type),
      hasClean: /cleanForSearch/.test(app.body),
      hasCand: /previewCandidates/.test(app.body),
      hasStyles: /lc-example-item/.test(css.body),
    };
  })()`);
  check('app.js 以 JS 类型送达（非 HTML 回退）', res.appIsJs, `${res.appType} ${res.appLen}B`);
  check('styles-listen.css 以 CSS 类型送达', res.cssIsCss, `${res.cssType} ${res.cssLen}B`);
  check('线上 app.js 含清理与候选词逻辑', res.hasClean && res.hasCand, `clean=${res.hasClean} cand=${res.hasCand}`);
  check('线上样式含例曲区块规则', res.hasStyles);

  /* 2. 渲染层：批注不该出现在界面上 */
  await ev(`localStorage.setItem('em.listen.autoplay', '0')`); // 先关自动播放，单独测手动
  await goto('#/genre/g-2961', 3200);
  const dirty = await ev(`(() => {
    const titles = [...document.querySelectorAll('.lc-example-title')].map((n) => n.textContent.trim());
    const all = [...document.querySelectorAll('.example-title')].map((n) => n.textContent.trim());
    const bad = (s) => /[\\[\\u3010]|\\u2014\\u2014|\\d{1,2}:\\d{2}/.test(s);
    return {
      lcTitles: titles,
      allTitles: all,
      dirtyLc: titles.filter(bad).length,
      dirtyAll: all.filter(bad).length,
      hasBlock: !!document.querySelector('.lc-examples'),
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      leaks: (document.body.innerText.match(/undefined|NaN/g) || []).length,
    };
  })()`);
  check('线上条目页渲染例曲区块', dirty.hasBlock === true, dirty.lcTitles.join(' / ').slice(0, 60));
  check('线上曲名不含编辑批注', dirty.dirtyLc === 0 && dirty.dirtyAll === 0, `听感卡 ${dirty.dirtyLc} · 索引 ${dirty.dirtyAll}`);
  check('线上无 undefined/NaN 泄漏', dirty.leaks === 0, `${dirty.leaks} 处`);
  check('线上条目页零横向溢出', dirty.docOverflow <= 0, `overflow=${dirty.docOverflow}`);

  /* 3. 功能层：手动点试听，真的能从 Apple 拿到预览并播放 */
  const play = await ev(`(async () => {
    const btn = document.querySelector('.lc-examples .example-preview');
    if (!btn) return { ok: false, why: 'no-button' };
    const term = btn.dataset.preview || '';
    btn.click();
    // 搜索 + 加载最多给它 9 秒
    for (let i = 0; i < 45; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      if (btn.classList.contains('is-playing')) {
        return { ok: true, term, text: btn.textContent.trim(), waited: i * 200 };
      }
      if (/没有预览|播放失败/.test(btn.textContent)) {
        return { ok: false, why: btn.textContent.trim(), term };
      }
    }
    return { ok: false, why: 'timeout', term, text: btn.textContent.trim() };
  })()`);
  check('线上手动试听能播（真拿到 Apple 预览）', play.ok === true, `「${play.term}」${play.ok ? play.waited + 'ms' : play.why}`);

  const stop = await ev(`(async () => {
    const btn = document.querySelector('.lc-examples .example-preview.is-playing');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 500));
    const any = document.querySelector('.lc-examples .example-preview.is-playing');
    return { playing: !!any, text: document.querySelector('.lc-examples .example-preview')?.textContent.trim() || '' };
  })()`);
  check('线上再点一次能停止', stop.playing === false, `text=${stop.text}`);

  /* 4. 自动播放：换一个条目，开着开关进入应自动播 */
  await ev(`localStorage.setItem('em.listen.autoplay', '1')`);
  await goto('#/genre/g-413', 6500);
  const auto = await ev(`(() => {
    const btns = [...document.querySelectorAll('.lc-examples .example-preview')];
    const playing = btns.filter((b) => b.classList.contains('is-playing'));
    return {
      anyPlaying: playing.length > 0,
      text: playing.map((b) => b.textContent.trim()).join(','),
      titles: [...document.querySelectorAll('.lc-example-title')].map((n) => n.textContent.trim()),
      toggle: document.querySelector('[data-lc-autoplay]')?.checked ?? null,
    };
  })()`);
  check('线上进入风格自动试听', auto.anyPlaying === true, `${auto.text} · ${auto.titles.join(' / ').slice(0, 50)}`);
  check('线上开关状态正确', auto.toggle === true, `checked=${auto.toggle}`);

  /* 4.5 分支树：详情卡的例曲也要能播（同一套预览，另一处入口） */
  await ev(`localStorage.setItem('em.listen.autoplay', '0')`);
  await goto('#/tree?path=f-165,g-383&sel=g-413', 3600);
  const treeBlock = await ev(`(() => {
    const box = document.querySelector('.tree-examples-block');
    const items = [...document.querySelectorAll('.tree-example-item')];
    const btn = box ? box.querySelector('.example-preview') : null;
    return {
      hasBlock: !!box,
      items: items.length,
      btns: box ? box.querySelectorAll('.example-preview').length : 0,
      links: box ? box.querySelectorAll('.example-link').length : 0,
      note: (document.querySelector('.tree-examples-note') || {}).textContent || '',
      titles: items.map((li) => (li.querySelector('.tree-example-title') || {}).textContent || ''),
      dirty: items.map((li) => (li.querySelector('.tree-example-title') || {}).textContent || '')
        .filter((t) => /[\\[\\u3010]|\\u2014\\u2014|\\d{1,2}:\\d{2}/.test(t)),
      btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
    };
  })()`);
  check('线上树详情有例曲区块', treeBlock.hasBlock === true, `${treeBlock.items} 首 · ${treeBlock.titles.join(' / ').slice(0, 40)}`);
  check('线上树例曲每首都有试听按钮', treeBlock.btns === treeBlock.items && treeBlock.items > 0, `${treeBlock.btns}/${treeBlock.items}`);
  check('线上树例曲有兜底链接', treeBlock.links >= treeBlock.items * 2, `${treeBlock.links} 个`);
  check('线上树例曲曲名不含批注', treeBlock.dirty.length === 0, treeBlock.dirty.join(' / ') || '干净');
  check('线上树例曲注明来源', /Apple/.test(treeBlock.note) && /不托管/.test(treeBlock.note), treeBlock.note.slice(0, 36));
  check('线上树例曲按钮高度 ≥24px', treeBlock.btnH >= 24, `${treeBlock.btnH}px`);

  const treePlay = await ev(`(async () => {
    const btn = document.querySelector('.tree-examples-block .example-preview');
    if (!btn) return { ok: false, why: 'no-button' };
    const term = btn.dataset.preview || '';
    btn.click();
    for (let i = 0; i < 45; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      if (btn.classList.contains('is-playing')) return { ok: true, term, waited: i * 200 };
      if (/没有预览|播放失败/.test(btn.textContent)) return { ok: false, why: btn.textContent.trim(), term };
    }
    return { ok: false, why: 'timeout', term };
  })()`);
  check('线上树例曲能播（真拿到 Apple 预览）', treePlay.ok === true, `「${treePlay.term}」${treePlay.ok ? treePlay.waited + 'ms' : treePlay.why}`);

  // 树行圆钮与例曲互斥：点合成播放要先停掉例曲
  if (treePlay.ok) {
    const treeMix = await ev(`(async () => {
      document.querySelector('#treeDetail [data-tree-play]')?.click();
      await new Promise((r) => setTimeout(r, 1200));
      return {
        examplePlaying: !!document.querySelector('.tree-example-item .example-preview.is-playing'),
        synthPlaying: window.EMAudio ? window.EMAudio.getState().playing : null,
      };
    })()`);
    check('线上树例曲与合成不同时播', treeMix.examplePlaying === false, `例曲=${treeMix.examplePlaying} 合成=${treeMix.synthPlaying}`);
    await ev(`window.EMAudio && window.EMAudio.stop()`);
  } else {
    console.log('SKIP  线上树例曲与合成不同时播  — 未取到预览');
  }

  /* 5. 移动端：当前停在树页，量的是树例曲按钮 */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(1200);
  const mobile = await ev(`(() => {
    const de = document.documentElement;
    const btn = document.querySelector('.tree-examples-block .example-preview');
    const r = btn ? btn.getBoundingClientRect() : null;
    const item = document.querySelector('.tree-example-item');
    return {
      overflow: de.scrollWidth - de.clientWidth,
      tap: r ? Math.min(Math.round(r.width), Math.round(r.height)) : 0,
      itemOverflow: item ? item.scrollWidth - item.clientWidth : 0,
    };
  })()`);
  check('线上移动端零横向溢出', mobile.overflow <= 0, `overflow=${mobile.overflow}`);
  check('线上移动端例曲项不溢出', mobile.itemOverflow <= 0, `item=${mobile.itemOverflow}`);
  check('线上移动端触控目标 ≥24px', mobile.tap >= 24, `${mobile.tap}px`);

  check('零运行时异常', errors.length === 0, errors.slice(0, 2).join(' | ') || '无');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== 线上例曲验收 ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} (${f.detail})`));
  await launched.close();
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error('验收脚本出错：' + error.message);
  await launched.close();
  process.exit(2);
}

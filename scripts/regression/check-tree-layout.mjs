/**
 * 分支树原型 · 布局体检
 *
 * 截图能看出「好不好看」，看不出「有没有压在一起」。这个脚本用
 * getBoundingClientRect 把可疑的重叠、截断、过小点击区找出来，
 * 顺便把关键元素的计算样式打印出来，方便和 Club Rig 令牌对齐。
 *
 * 用法：先起本地服务，再 node scripts/regression/check-tree-layout.mjs
 *
 * ⚠️ 2026-11-12：本脚本的兄弟 check-tree-prototype.mjs 曾因写死调试端口
 * 而劫持了 WorkBuddy 主窗口。这里统一走 cdp-launch.mjs：随机端口 +
 * 目标白名单 + 退出清理，不再自己 spawn Chrome。
 */

import { launchChrome } from './cdp-launch.mjs';

// 默认测主站 #/tree；加 --prototype 参数可改测原型页。
// 主站是交付目标，原型只是参考实现，所以默认值给主站。
const PROTOTYPE = process.argv.includes('--prototype');
const URL = PROTOTYPE
  ? 'http://127.0.0.1:5501/docs/prototype/genre-tree.html'
  : 'http://127.0.0.1:5501/#/tree';

const VIEWPORTS = [
  { w: 390, h: 844, name: '手机 390' },
  { w: 768, h: 1024, name: '平板 768' },
  { w: 1440, h: 900, name: '桌面 1440' },
];

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const p = cdp.pending.get(msg.id);
      if (p) { cdp.pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
    };
    return cdp;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error(method + ' 超时')); } }, 30000);
    });
  }
}

const results = [];
function check(ok, name, detail = '') { results.push({ ok, name, detail }); }

const LAYOUT_PROBE = `(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  const out = { overlaps: [], trunc: [], small: [], styles: {}, blank: [] };

  const seen = (a, b) => a.r > b.x + 2 && b.r > a.x + 2 && a.b > b.y + 2 && b.b > a.y + 2;

  // 1) 关键区块之间不该互相压
  const zones = [
    ['顶部栏', document.querySelector('.topbar')],
    ['色标尺', document.querySelector('.rail')],
    ['面包屑', document.querySelector('.crumbs')],
    ['列区', document.querySelector('.cols')],
    ['详情面板', document.querySelector('.detail')],
  ].filter(([, el]) => el);
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const [na, ea] = zones[i], [nb, eb] = zones[j];
      const ra = rect(ea), rb = rect(eb);
      if (ra.w > 0 && rb.w > 0 && seen(ra, rb)) out.overlaps.push(na + ' × ' + nb);
    }
  }

  // 2) 行内文字不该溢出容器（省略号是设计，溢出才是 bug）
  document.querySelectorAll('.row-name').forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis') {
      out.trunc.push(el.textContent.trim().slice(0, 20));
    }
  });

  // 3) 触控目标
  document.querySelectorAll('.row-play, .dock-stop, .crumb, .search-input').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && (r.width < 24 || r.height < 24)) {
      out.small.push((el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  });

  // 4) 设计令牌是否和 Club Rig 对齐
  const cs = getComputedStyle(document.body);
  const root = getComputedStyle(document.documentElement);
  out.styles = {
    bodyBg: cs.backgroundColor,
    bodyColor: cs.color,
    ink: root.getPropertyValue('--ink').trim(),
    sodium: root.getPropertyValue('--sodium').trim(),
    fontBody: cs.fontFamily.split(',')[0].replace(/"/g, ''),
  };

  // 5) 大块空白：列区里不该出现整列没内容
  document.querySelectorAll('.col').forEach((col, i) => {
    const rows = col.querySelectorAll('.row').length;
    if (rows === 0) out.blank.push('第 ' + (i + 1) + ' 列没有行');
  });

  return out;
})()`;

async function main() {
  const launched = await launchChrome({
    allow: [/^http:\/\/127\.0\.0\.1:5501\/docs\/prototype\/genre-tree\.html/],
    args: ['--window-size=1440,900'],
  });
  const { wsUrl, close } = launched;

  const cdp = await CDP.connect(await wsUrl);
  const { targetInfos } = await cdp.send('Target.getTargets');

  // 只认自己启动的 about:blank。Target.getTargets 会列出该实例下的所有目标，
  // 万一端口被别的程序占用（或连到了宿主程序的调试端口），取第一个页面目标
  // 就可能操作到别人的窗口——这正是 2026-11-12 那次事故的成因。
  const page = targetInfos.find((t) => t.type === 'page' && /^about:blank$/.test(t.url || ''));
  if (!page) {
    await close();
    throw new Error(
      '没有找到自己启动的 about:blank 目标，拒绝继续。\n' +
      '已发现的目标：' + targetInfos.map((t) => `${t.type}:${t.url}`).join(', ')
    );
  }
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });

  await cdp.send('Page.enable', {}, sessionId);

  for (const vp of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 768,
    }, sessionId);

    // 导航前再确认一次当前页确实是空白页或本项目的原型页
    const cur = await cdp.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId);
    const here = cur?.result?.value || '';
    if (!(/^about:blank$/.test(here) || here.startsWith(URL))) {
      await close();
      throw new Error(`拒绝导航：当前页是 ${here}，不属于本次测试。已中止。`);
    }

    await cdp.send('Page.navigate', { url: URL }, sessionId);
    await new Promise((r) => setTimeout(r, 2600));

    const { result } = await cdp.send('Runtime.evaluate', {
      expression: LAYOUT_PROBE, returnByValue: true, awaitPromise: false,
    }, sessionId);

    const d = result.value;
    check(d.overlaps.length === 0, `${vp.name} 关键区块无重叠`, d.overlaps.join(', '));
    check(d.trunc.length === 0, `${vp.name} 行名不溢出`, d.trunc.slice(0, 3).join(', '));
    check(d.small.length === 0, `${vp.name} 触控目标 ≥24px`, d.small.slice(0, 4).join(', '));
    check(d.blank.length === 0, `${vp.name} 无空列`, d.blank.join(', '));

    if (vp.w === 1440) {
      console.log('--- Club Rig 令牌核对 ---');
      console.log(JSON.stringify(d.styles, null, 2));
      const inkOk = d.styles.ink === '#060607';
      const sodiumOk = d.styles.sodium === '#ffb000';
      check(inkOk, '沿用 --ink #060607', d.styles.ink);
      check(sodiumOk, '沿用 --sodium #ffb000', d.styles.sodium);
      console.log('---');
    }
  }

  await close();

  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.ok) { pass++; console.log(`PASS  ${r.name}${r.detail ? '  — ' + r.detail : ''}`); }
    else { fail++; console.log(`FAIL  ${r.name}${r.detail ? '  — ' + r.detail : ''}`); }
  }
  console.log(`\n===== ${pass}/${pass + fail} 通过 =====`);
  if (fail) {
    console.log('失败项：');
    results.filter((r) => !r.ok).forEach((r) => console.log('  - ' + r.name + (r.detail ? ' (' + r.detail + ')' : '')));
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('布局体检出错:', e.message); process.exit(2); });

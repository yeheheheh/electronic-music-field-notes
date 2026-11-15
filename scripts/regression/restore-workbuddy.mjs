/**
 * 恢复 WorkBuddy 窗口：把被测试脚本导航走的页面送回原始地址，并清除设备尺寸覆盖。
 *
 * 背景：check-tree-prototype.mjs 硬编码了 --remote-debugging-port=9333，
 * 而这个端口恰好是 WorkBuddy 自己的调试端口。脚本的 targetWs() 用
 * `list.find(t => t.type === 'page')` 取第一个页面目标，于是抓到了
 * WorkBuddy 的主窗口，对它执行了 Page.navigate 与 setDeviceMetricsOverride。
 *
 * 本脚本只做两件事：读导航历史 → 回到最初那条；再清掉尺寸覆盖。
 * 用法：node scripts/regression/restore-workbuddy.mjs [--apply]
 *       不带 --apply 时只打印，不做任何修改。
 */

const PORT = Number(process.env.CDP_PORT || 9333);
const APPLY = process.argv.includes('--apply');
const ENDPOINT = `http://127.0.0.1:${PORT}/json/list`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pickTarget() {
  const res = await fetch(ENDPOINT);
  const list = await res.json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('9333 上没有可用的页面目标');
  return page;
}

let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' 超时')); }
    }, 15000);
  });
}

(async () => {
  const target = await pickTarget();
  console.log('目标窗口：');
  console.log('  title =', target.title);
  console.log('  url   =', target.url);
  console.log('');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  };

  await send('Page.enable');

  const hist = await send('Page.getNavigationHistory');
  const entries = hist.entries || [];
  const current = hist.currentIndex;

  console.log(`导航历史（共 ${entries.length} 条，当前第 ${current + 1} 条）：`);
  entries.forEach((e, i) => {
    const mark = i === current ? ' ← 当前' : '';
    let u = e.url;
    if (u.length > 110) u = u.slice(0, 110) + '…';
    console.log(`  [${i}] ${e.title || '(无标题)'}`);
    console.log(`      ${u}${mark}`);
  });
  console.log('');

  // 找最初那条：从 0 开始扫，第一条不是我的原型页的就是原始入口
  const isMine = (u) => /127\.0\.0\.1:5501|genre-tree\.html/.test(u || '');
  const original = entries.find((e) => !isMine(e.url));

  if (!original) {
    console.log('历史里没找到非原型页的记录。');
    console.log('这种情况需要手动恢复：在 WorkBuddy 里重新打开一个会话窗口即可。');
    if (APPLY) {
      console.log('');
      console.log('仍将清除设备尺寸覆盖（这一步是安全的）…');
      await send('Emulation.clearDeviceMetricsOverride');
      console.log('已清除。');
    }
    ws.close();
    return;
  }

  console.log('拟恢复的目标：');
  console.log('  title =', original.title || '(无标题)');
  console.log('  url   =', original.url);
  console.log('');

  if (!APPLY) {
    console.log('这是预演。加 --apply 才会真正执行恢复。');
    ws.close();
    return;
  }

  // 先清尺寸覆盖，否则即使导航回去布局仍被锁在测试宽度
  try {
    await send('Emulation.clearDeviceMetricsOverride');
    console.log('已清除设备尺寸覆盖。');
  } catch (e) {
    console.log('清除尺寸覆盖失败（可忽略）：', e.message);
  }

  const idx = entries.indexOf(original);
  await send('Page.navigateToHistoryEntry', { entryId: original.id });
  await sleep(600);

  const after = await send('Page.getNavigationHistory');
  const now = after.entries[after.currentIndex];
  console.log('');
  console.log('当前页面已恢复为：');
  console.log('  title =', now.title || '(无标题)');
  console.log('  url   =', now.url);

  ws.close();
})().catch((err) => {
  console.error('恢复失败：', err.message);
  process.exitCode = 1;
});

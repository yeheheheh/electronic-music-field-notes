/**
 * 探针：Ishkur 资料层是否正常加载、是否影响既有数据层。
 *
 * 背景：接入 data/ishkur.js 后，站点树整片渲染不出来。
 * 需要先分清是「新脚本报错拖垮后续」还是「本来就有问题」。
 *
 * 用法：node scripts/regression/probe-ishkur-load.mjs
 */

import { launchChrome } from './cdp-launch.mjs';

const PORT = Number(process.env.PORT || 5501);

const { wsUrl, close } = await launchChrome({ allow: [/^http:\/\/127\.0\.0\.1:5501\//] });
const ws = new WebSocket(wsUrl);

let id = 0;
const pending = new Map();
const errors = [];
const logs = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (msg.params.type === 'error') errors.push(text);
    else logs.push(`[${msg.params.type}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text));
  }
});

await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await new Promise((r) => setTimeout(r, 5000));

const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    ishkur: typeof window.ISHKUR,
    ishkurGenres: window.ISHKUR ? (window.ISHKUR.genres || []).length : -1,
    ishkurNodes: window.ISHKUR && window.ISHKUR.byNode ? Object.keys(window.ISHKUR.byNode).length : -1,
    tree: typeof window.KB_TREE,
    treeNodes: window.KB_TREE ? Object.keys(window.KB_TREE.nodes || {}).length : -1,
    kb: typeof window.KB,
    kbEntries: window.KB ? (window.KB.entries || []).length : -1,
    hash: location.hash
  })`,
  returnByValue: true,
});
console.log('首页状态：', probe.result?.result?.value);

// 再直接进风格树路由，检查树本体与 Ishkur 紧凑块
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/tree` });
await new Promise((r) => setTimeout(r, 3500));
const treeProbe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    columns: document.querySelectorAll('#treeColumns .tree-column').length,
    rows: document.querySelectorAll('#treeColumns [data-tree-key]').length,
    detail: !!document.querySelector('#treeDetail .tree-detail-head'),
    ishkurCompact: document.querySelectorAll('#treeDetail .ishkur-compact').length,
    compactParas: document.querySelectorAll('#treeDetail .ishkur-compact .ishkur-p').length,
    compactTracks: document.querySelectorAll('#treeDetail .ishkur-compact .ishkur-track-item').length,
    selected: (document.querySelector('#treeDetail h2')?.textContent || '').slice(0, 40)
  })`,
  returnByValue: true,
});
console.log('风格树状态：', treeProbe.result?.result?.value);

// 再进一个确定有 Ishkur 资料、且已有中文译文的条目页（Synth-Pop）
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/genre/g-19412` });
await new Promise((r) => setTimeout(r, 3000));
const genreProbe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: (document.querySelector('.detail-title')?.textContent || '').slice(0, 40),
    ishkurSection: document.querySelectorAll('.ishkur-section').length,
    ishkurEntries: document.querySelectorAll('.ishkur-entry').length,
    paras: document.querySelectorAll('.ishkur-p').length,
    zhParas: document.querySelectorAll('.ishkur-p:not(.is-en)').length,
    tracks: document.querySelectorAll('.ishkur-track-item').length,
    figures: document.querySelectorAll('.ishkur-figure').length,
    firstPara: (document.querySelector('.ishkur-p')?.textContent || '').slice(0, 90)
  })`,
  returnByValue: true,
});
console.log('条目页状态：', genreProbe.result?.result?.value);

// 风格树里选中一个有 Ishkur 资料的条目节点（Acid House = e:g-413）
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/tree?sel=e:g-413` });
await new Promise((r) => setTimeout(r, 4000));
const compactProbe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    selected: (document.querySelector('#treeDetail h2')?.textContent || '').slice(0, 30),
    compact: document.querySelectorAll('.ishkur-compact').length,
    paras: document.querySelectorAll('.ishkur-compact .ishkur-p').length,
    zhParas: document.querySelectorAll('.ishkur-compact .ishkur-p:not(.is-en)').length,
    tracks: document.querySelectorAll('.ishkur-compact .ishkur-track-item').length,
    link: (document.querySelector('.ishkur-compact-note a')?.textContent || '').slice(0, 40)
  })`,
  returnByValue: true,
});
console.log('树内条目节点：', compactProbe.result?.result?.value);

// 大族页（House = f-165）
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/family/f-165` });
await new Promise((r) => setTimeout(r, 3000));
const famProbe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    title: (document.querySelector('h1')?.textContent || '').slice(0, 30),
    summary: document.querySelectorAll('.ishkur-family-section').length,
    cards: document.querySelectorAll('.ishkur-family-card').length,
    firstCard: (document.querySelector('.ishkur-family-card')?.textContent || '').replace(/\\s+/g, ' ').slice(0, 80)
  })`,
  returnByValue: true,
});
console.log('大族页状态：', famProbe.result?.result?.value);

// 配图降级：少数原站图抓不到，加载失败时必须整块收起，不能留破图占位。
// Jumpstyle（e:g-8518）整篇只有 1 张图且正好缺失，是最干净的用例。
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#/tree?sel=e:g-8518` });
await new Promise((r) => setTimeout(r, 3500));
const imgProbe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    figures: document.querySelectorAll('.ishkur-figure').length,
    hiddenFigures: [...document.querySelectorAll('.ishkur-figure')].filter((f) => f.hidden).length,
    brokenVisible: [...document.querySelectorAll('.ishkur-figure img')].filter((i) => !i.complete || i.naturalWidth === 0).filter((i) => !i.closest('figure').hidden).length
  })`,
  returnByValue: true,
});
console.log('配图降级：', imgProbe.result?.result?.value);

console.log('');
console.log(`控制台错误 ${errors.length} 条：`);
errors.slice(0, 15).forEach((e) => console.log('  ' + String(e).slice(0, 400)));

await close();

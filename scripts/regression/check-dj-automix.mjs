// 自动接歌台回归：demo 数据完整性 + 页面 DOM + 窄屏/桌面横向溢出。
// 用法： node scripts/regression/check-dj-automix.mjs [http://127.0.0.1:5501/]
// 前置： node scripts/serve.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const BASE = process.argv[2] || 'http://127.0.0.1:5501/';
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(BASE);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const rows = [];
let pass = 0;
let fail = 0;
let skipped = 0;

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  rows.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
}

function skip(name, detail = '') {
  skipped += 1;
  rows.push(`SKIP ${name}${detail ? `  — ${detail}` : ''}`);
}

function dump(url, budget = 7000) {
  const profile = mkdtempSync(join(tmpdir(), 'dja-reg-'));
  const result = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${profile}`, `--virtual-time-budget=${budget}`,
    '--window-size=1600,1200', '--dump-dom', url,
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 30 * 1024 * 1024 });
  return { ok: result.status === 0 && Boolean(result.stdout), html: result.stdout || '', error: result.stderr || '' };
}

/* ---------------------------------------------------------------- demo 数据 */

const sandbox = { window: {} };
try {
  vm.runInNewContext(readFileSync('data/dj-automix-demo.js', 'utf8'), sandbox);
} catch (error) {
  fail += 1;
  rows.push(`FAIL demo data parse — ${error}`);
}
const demo = sandbox.window.DJ_AUTOMIX_DEMO;
if (!demo) {
  skip('demo bundle', 'window.DJ_AUTOMIX_DEMO 为 null；先运行 djcore demo');
} else {
  check('demo 有 plan', Boolean(demo.plan));
  check('demo plan 至少 4 首', (demo.plan?.entries || []).length >= 4, `${(demo.plan?.entries || []).length} 首`);
  check('demo 过渡数 = 曲目数 - 1', (demo.plan?.transitions || []).length === (demo.plan?.entries || []).length - 1);
  check('demo 有渲染结果', Boolean(demo.result));
  check('demo 音频路径存在', Boolean(demo.audio?.mix), demo.audio?.mix || '');
  check('demo 至少一段 double drop 或 bass swap', (demo.plan?.transitions || []).some((item) => ['double_drop', 'bass_swap'].includes(item.type)));
  check('demo 波形峰值非空', (demo.result?.waveform?.peaks || []).length > 1000);
}

/* ---------------------------------------------------------------- 页面 DOM */

const page = dump(`${BASE}#/dj/automix`);
if (!page.ok) {
  fail += 1;
  rows.push(`FAIL 页面无法加载 — ${page.error.slice(-200)}`);
} else {
  check('路由渲染出 dja-shell', page.html.includes('dja-shell'));
  check('渲染出控制条', page.html.includes('dja-controls'));
  check('渲染出详情面板', page.html.includes('dja-detail'));
  check('没有停在 loading', !page.html.includes('page-loading'));
  const classTokens = [...page.html.matchAll(/class="([^"]*)"/g)]
    .flatMap((match) => match[1].split(/\s+/))
    .filter(Boolean);
  const cards = classTokens.filter((token) => token === 'dja-card').length;
  const transitions = classTokens.filter((token) => token === 'dja-transition').length;
  if (demo) {
    check('曲目卡数量 = demo 曲目数', cards === demo.plan.entries.length, `${cards} / ${demo.plan.entries.length}`);
    check('过渡徽章数量 = demo 过渡数', transitions === demo.plan.transitions.length, `${transitions} / ${demo.plan.transitions.length}`);
    check('展示引擎/演示状态', /本地引擎|演示数据/.test(page.html));
  } else {
    check('无 demo 时显示空状态', page.html.includes('dja-empty'));
  }
}

/* ---------------------------------------------------------------- 横向溢出 */

for (const width of [320, 390, 1440]) {
  const probe = dump(`${BASE}scripts/regression/probe.html?w=${width}&r=dj%2Fautomix&open=0`, 8000);
  const match = (probe.html || '').match(/RG::(\{.*?\})::END/s);
  if (!probe.ok || !match) {
    if (!IS_LOCAL) {
      skip(`溢出探针 w=${width}`, '线上不部署 probe.html；用 check-live-deploy 验证');
      continue;
    }
    fail += 1;
    rows.push(`FAIL 溢出探针 w=${width} — 无返回`);
    continue;
  }
  const data = JSON.parse(match[1]);
  check(`w=${width} 无横向溢出`, data.docW <= data.vw + 1 && data.over.length === 0, `docW=${data.docW} vw=${data.vw} over=${data.over.join(',')}`);
}

/* ---------------------------------------------------------------- 输出 */

for (const row of rows) console.log(row);
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail ? 1 : 0);

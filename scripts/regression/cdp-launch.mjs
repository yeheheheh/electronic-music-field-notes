/**
 * CDP 启动器 · 安全版
 *
 * 为什么需要这个模块
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-11-12 事故：check-tree-prototype.mjs 硬编码 --remote-debugging-port=9333，
 * 而 9333 是 WorkBuddy 自己的调试端口。脚本随后用
 * `list.find(t => t.type === 'page')` 抓「第一个页面目标」，
 * 抓到的是 WorkBuddy 主窗口，于是 Page.navigate 把用户界面导航到了测试页，
 * 窗口被占用、退不回首页。
 *
 * 三个必要条件，缺一不可
 * ─────────────────────────────────────────────────────────────────────────
 * 1. 端口不能写死 —— 用 --remote-debugging-port=0，由系统分配，从 stderr 读回真实端口；
 * 2. 目标必须校验 —— 只接受 about:blank 或白名单内的地址，别的一律拒绝；
 * 3. 退出必须清理 —— 杀进程 + 删临时 profile，否则目录越积越多。
 *
 * 用法
 * ─────────────────────────────────────────────────────────────────────────
 *   import { launchChrome } from './cdp-launch.mjs';
 *
 *   const { wsUrl, close } = await launchChrome({
 *     allow: [/^http:\/\/127\.0\.0\.1:5501\//],   // 允许导航到的地址
 *   });
 *   // ... 用 wsUrl 连 CDP，导航前调 assertNavigable(url)
 *   await close();
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 启动一个受控的 headless Chrome，返回可安全使用的 CDP WebSocket 地址。
 *
 * @param {object}   opts
 * @param {RegExp[]} opts.allow     允许导航到的地址白名单（about:blank 始终允许）
 * @param {string}   [opts.chrome]  Chrome 可执行文件路径
 * @param {string[]} [opts.args]    额外的 Chrome 启动参数
 * @param {number}   [opts.timeout] 等待 DevTools 就绪的超时毫秒数
 * @returns {Promise<{wsUrl: string, port: number, proc: import('node:child_process').ChildProcess, profile: string, close: () => Promise<void>}>}
 */
export async function launchChrome(opts = {}) {
  const {
    allow = [],
    chrome = DEFAULT_CHROME,
    args: extraArgs = [],
    timeout = 20000,
  } = opts;

  const profile = mkdtempSync(join(tmpdir(), 'cdp-safe-'));

  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    // 关键：端口交给系统分配。写死端口一旦和宿主程序（WorkBuddy / 编辑器等）
    // 撞上，就会连到对方的调试端口，把别人的窗口当成自己的测试目标。
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    ...extraArgs,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  // 从 Chrome 自己打印的 DevTools 地址里读回真实端口
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) resolve(Number(m[1]));
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error(`Chrome DevTools 未就绪（${timeout}ms）`)), timeout);
  });

  const allowed = [/^about:blank$/, ...allow];

  /** 校验一个地址是否允许被导航。不允许就抛错，绝不「先试试看」。 */
  function assertNavigable(url) {
    if (!allowed.some((re) => re.test(url || ''))) {
      throw new Error(
        `拒绝导航到未授权地址：${url}\n` +
        '这通常意味着抓到了别的程序的调试目标（例如 WorkBuddy 主窗口）。已中止，未做任何修改。'
      );
    }
  }

  // 找到自己那个 about:blank 页面目标。找不到就拒绝继续——
  // 宁可不跑测试，也不能操作到别人的窗口。
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /^about:blank$/.test(t.url || ''));
      if (page?.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* 还没起来，继续等 */ }
    if (!wsUrl) await sleep(250);
  }

  if (!wsUrl) {
    try { proc.kill(); } catch { /* 已退出 */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 锁住就算了 */ }
    throw new Error('没有找到自己启动的 about:blank 目标，拒绝继续（可能端口被占用）');
  }

  async function close() {
    try { proc.kill(); } catch { /* 已退出 */ }
    await sleep(120);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 锁住就算了 */ }
  }

  return { wsUrl, port, proc, profile, close, assertNavigable };
}

export { sleep };

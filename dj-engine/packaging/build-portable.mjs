import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, '..');
const repoRoot = path.resolve(engineRoot, '..');

const args = process.argv.slice(2);
const slim = args.includes('--slim');
const noZip = args.includes('--no-zip');
const labelIndex = args.indexOf('--label');
const label = labelIndex >= 0 ? args[labelIndex + 1] : 'v0.1.2';
const stageRoot = path.join(here, 'build', 'djcore-automix');
const distDir = path.join(here, 'dist');
const outZip = path.join(distDir, `电音档案-Automix-portable-${label}${slim ? '-slim' : ''}.zip`);

const skipDirs = new Set(['__pycache__', '.pytest_cache', '.ruff_cache']);
const slimPackages = new Set([
  'torch', 'torchaudio', 'torchgen', 'functorch', 'demucs', 'hf_xet', 'sympy', 'sklearn',
]);
const skipPackages = new Set(['pip', 'setuptools', 'wheel', 'pkg_resources', '_distutils_hack', '_virtualenv']);

function pythonHome() {
  const cfg = path.join(engineRoot, '.venv', 'pyvenv.cfg');
  if (!existsSync(cfg)) throw new Error(`找不到 ${cfg}，先按 README 创建 dj-engine/.venv`);
  const line = readFileSync(cfg, 'utf8').split(/\r?\n/).find((item) => item.startsWith('home'));
  if (!line) throw new Error('pyvenv.cfg 缺少 home');
  return line.split('=')[1].trim();
}

function copyFilter(source) {
  const name = path.basename(source);
  if (skipDirs.has(name)) return false;
  if (name.endsWith('.pyc')) return false;
  if (path.basename(path.dirname(source)) === 'site-packages') {
    if (skipPackages.has(name) || name.startsWith('_virtualenv')) return false;
    if (slim && slimPackages.has(name)) return false;
  }
  return true;
}

function copy(source, target) {
  if (!existsSync(source)) throw new Error(`缺少 ${source}`);
  cpSync(source, target, { recursive: true, filter: copyFilter, dereference: true });
}

function dirSize(target) {
  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

function sevenZip() {
  const candidates = [
    process.env.SEVEN_ZIP,
    'C:/Program Files/7-Zip/7z.exe',
    'C:/Program Files (x86)/7-Zip/7z.exe',
    '7z',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['i'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

console.log(`[1/7] 清理 ${stageRoot}`);
rmSync(path.join(here, 'build'), { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
mkdirSync(stageRoot, { recursive: true });

console.log('[2/7] 复制 Python 运行时');
const home = pythonHome();
console.log(`      base: ${home}`);
copy(home, path.join(stageRoot, 'runtime'));
for (const removed of [
  'Lib/site-packages', 'Lib/test', 'Lib/idlelib', 'Lib/tkinter', 'Lib/ensurepip',
  'Lib/lib2to3', 'tcl', 'Scripts', 'include', 'libs',
]) {
  rmSync(path.join(stageRoot, 'runtime', removed), { recursive: true, force: true });
}

console.log('[3/7] 复制依赖');
copy(
  path.join(engineRoot, '.venv', 'Lib', 'site-packages'),
  path.join(stageRoot, 'runtime', 'Lib', 'site-packages'),
);
rmSync(path.join(stageRoot, 'runtime', 'Lib', 'site-packages', 'torch', 'include'), {
  recursive: true, force: true,
});
for (const stale of ['distutils-precedence.pth', 'pywin32.pth']) {
  rmSync(path.join(stageRoot, 'runtime', 'Lib', 'site-packages', stale), { force: true });
}

console.log('[4/7] 复制引擎与站点');
const engineStage = path.join(stageRoot, 'engine');
mkdirSync(path.join(engineStage, 'data'), { recursive: true });
copy(path.join(engineRoot, 'djcore'), path.join(engineStage, 'djcore'));
cpSync(path.join(engineRoot, 'data', 'genres.json'), path.join(engineStage, 'data', 'genres.json'));
copy(path.join(engineRoot, 'fixtures', 'sidecars'), path.join(engineStage, 'fixtures', 'sidecars'));
copy(path.join(engineRoot, 'tools'), path.join(engineStage, 'tools'));
for (const whl of readdirSync(path.join(engineStage, 'tools')).filter((name) => name.endsWith('.whl'))) {
  rmSync(path.join(engineStage, 'tools', whl), { force: true });
}
const siteDir = path.join(repoRoot, 'dist-site');
if (existsSync(siteDir)) {
  copy(siteDir, path.join(stageRoot, 'site'));
} else {
  console.log('      未找到 dist-site，跳过随包站点');
}

console.log('[5/7] 复制 Demucs 模型');
const torchHome = process.env.TORCH_HOME || path.join(os.homedir(), '.cache', 'torch');
const checkpointDir = path.join(torchHome, 'hub', 'checkpoints');
if (!slim && existsSync(checkpointDir)) {
  mkdirSync(path.join(stageRoot, 'runtime', 'models', 'hub', 'checkpoints'), { recursive: true });
  for (const file of readdirSync(checkpointDir).filter((name) => name.endsWith('.th') || name.endsWith('.pt'))) {
    cpSync(path.join(checkpointDir, file), path.join(stageRoot, 'runtime', 'models', 'hub', 'checkpoints', file));
  }
} else if (!slim) {
  console.log('      未找到 Demucs 模型，首次运行会联网下载');
}

console.log('[6/7] 写入启动脚本');
writeFileSync(path.join(stageRoot, 'start.bat'), [
  '@echo off',
  'setlocal',
  'cd /d "%~dp0engine"',
  'set "PYTHONPATH=%~dp0engine"',
  'set "DJ_SITE_DIR=%~dp0site"',
  'set "TORCH_HOME=%~dp0runtime\\models"',
  'set "DJ_PORT=5601"',
  '"%~dp0runtime\\python.exe" -m djcore.adapters.desktop',
  'if errorlevel 1 pause',
  '',
].join('\r\n'));
writeFileSync(path.join(stageRoot, '启动.bat'), '@echo off\r\ncd /d "%~dp0"\r\ncall start.bat\r\n');
writeFileSync(path.join(stageRoot, 'README.txt'), [
  '电音档案 · Automix 便携版',
  '=========================',
  '',
  '1. 双击 start.bat（或 启动.bat）。',
  '2. 浏览器会自动打开 http://127.0.0.1:5601/#/dj/automix',
  '3. 关闭黑色命令行窗口即退出。',
  '',
  '目录说明',
  '- engine\\outputs：分析缓存、分轨与渲染结果',
  '- runtime\\models：Demucs 模型（离线可用）',
  '- site：随包的中文电音学习站',
  '- licenses：第三方许可证与来源',
  '',
  'Rekordbox',
  '- 默认自动查找 %APPDATA%\\Pioneer\\rekordbox\\master.db',
  '- 写库前会先备份；请在 Rekordbox 关闭时操作。',
  '',
  '硬件',
  '- 有 NVIDIA 显卡时自动用 GPU 分轨；没有则回退 CPU（更慢）。',
  '',
].join('\r\n'));
copy(path.join(here, 'licenses'), path.join(stageRoot, 'licenses'));

console.log(`[7/7] 打包（${(dirSize(stageRoot) / 1024 / 1024 / 1024).toFixed(2)} GiB${slim ? '，slim' : ''}）`);
if (noZip) {
  console.log(`已跳过压缩：${stageRoot}`);
} else {
  const zipper = sevenZip();
  if (!zipper) throw new Error('找不到 7-Zip，请安装或设置 SEVEN_ZIP 环境变量');
  mkdirSync(distDir, { recursive: true });
  rmSync(outZip, { force: true, maxRetries: 10, retryDelay: 500 });
  const zip = spawnSync(zipper, ['a', '-tzip', '-mx=3', '-mmt=on', '-bso0', '-bsp0', outZip, `${stageRoot}\\*`], {
    stdio: 'inherit',
  });
  if (zip.status !== 0) throw new Error(`7-Zip 失败：${zip.status}`);
  console.log(`完成：${outZip}（${(statSync(outZip).size / 1024 / 1024 / 1024).toFixed(2)} GiB）`);
}

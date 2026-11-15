import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist-site');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const references = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:[a-z]+:|\/\/|#)/i.test(reference));

/* 需要整目录发布的静态资源。
   Ishkur 配图有 200 多张，逐个列举不现实，这里按目录递归收集；
   新增资源目录时只改这一行，别再手工补单文件。 */
const assetDirs = [
  'assets/ishkur',
  'assets/dj-automix',
  'vendor/floating-ui-1.8.0-umd',
];

function walk(dir) {
  const base = path.join(root, dir);
  // 目录缺失不算致命：真正的防线是下面的「数据引用校验」，
  // 数据里引用了却没发布才让构建失败。这里只提醒一声。
  if (!existsSync(base)) {
    console.warn(`  ! asset directory not found, skipped: ${dir}`);
    return [];
  }
  const out = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out;
}

const files = [...new Set([
  'index.html', 'sw.js', ...references,
  ...assetDirs.flatMap(walk),
])];

/* 一致性校验：data/ishkur.js 里引用的配图必须真的在发布清单里。
   缺图时线上是一片空白 —— app.js 的 onerror 会把 figure 直接 hidden，
   连破图图标都看不到，肉眼排查不出来。这里直接让构建失败。 */
const ishkurData = path.join(root, 'data/ishkur.js');
let imageReport = '';
if (existsSync(ishkurData)) {
  const source = readFileSync(ishkurData, 'utf8');
  // 兼容 "file": "x.jpg" 与 file: "x.jpg" 两种写法；数据由 build-ishkur.mjs 生成，格式变动不该让校验静默失效
  const referenced = new Set([...source.matchAll(/["']?file["']?\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]));
  const published = new Set(files.filter((file) => file.startsWith('assets/ishkur/')));
  const missing = [...referenced].filter((name) => !published.has(`assets/ishkur/${name}`));
  if (missing.length) {
    console.error(`✗ ${missing.length} image(s) referenced by data/ishkur.js are missing from the publish list:`);
    for (const name of missing.slice(0, 20)) console.error(`    assets/ishkur/${name}`);
    if (missing.length > 20) console.error(`    …and ${missing.length - 20} more`);
    process.exit(1);
  }
  const unused = [...published].filter((file) => !referenced.has(path.posix.basename(file)));
  imageReport = `\n  ishkur images: ${published.size} published, ${referenced.size} referenced by data, ${unused.length} unreferenced`;
}

rmSync(output, { recursive: true, force: true });
let bytes = 0;
for (const file of files) {
  const source = path.resolve(root, file);
  if (!source.startsWith(root + path.sep)) throw new Error(`Asset outside project: ${file}`);
  const destination = path.join(output, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  bytes += statSync(destination).size;
}
console.log(`Built ${files.length} public files (${(bytes / 1024 / 1024).toFixed(2)} MiB) in ${output}${imageReport}`);

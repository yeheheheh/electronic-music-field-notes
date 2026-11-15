import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../build-site.mjs', import.meta.url));

test('rebuilding publishes only current public files and removes retired assets', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'em-site-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write('scripts/build-site.mjs', '');
  copyFileSync(script, path.join(root, 'scripts/build-site.mjs'));
  write('index.html', '<link href="styles.css" rel="stylesheet"><script src="app.js"></script><script src="retired.js"></script><script src="data/ishkur.js"></script>');
  write('styles.css', 'body { color: white; }');
  write('app.js', 'window.version = 1;');
  write('retired.js', 'window.retired = true;');
  write('sw.js', 'self.version = 1;');
  write('assets/dj-automix/demo-mix.mp3', 'demo fixture');
  write('assets/ishkur/ladytron.jpg', 'image fixture');
  write('assets/ishkur/nested/deep.png', 'nested image fixture');
  write('data/ishkur.js', 'window.ISHKUR = { entries: [{ images: [{ file: "ladytron.jpg" }, { file: "nested/deep.png" }] }] };');
  write('vendor/floating-ui-1.8.0-umd/LICENSE', 'license fixture');
  write('.env', 'LOCAL_ONLY=fixture');
  const build = () => execFileSync(process.execPath, [path.join(root, 'scripts/build-site.mjs')], { cwd: root, encoding: 'utf8' });
  build();
  assert.equal(existsSync(path.join(root, 'dist-site/retired.js')), true);

  write('index.html', '<link href="styles.css" rel="stylesheet"><script src="app.js"></script><script src="data/ishkur.js"></script>');
  write('app.js', 'window.version = 2;');
  rmSync(path.join(root, 'retired.js'));
  build();
  assert.equal(existsSync(path.join(root, 'dist-site/retired.js')), false, 'retired public assets must not survive a rebuild');
  assert.equal(readFileSync(path.join(root, 'dist-site/app.js'), 'utf8'), 'window.version = 2;');
  const output = path.join(root, 'dist-site');
  const files = readdirSync(output, { recursive: true }).filter((file) => statSync(path.join(output, file)).isFile()).map((file) => file.split(path.sep).join('/')).sort();
  assert.deepEqual(files, [
    'app.js',
    'assets/dj-automix/demo-mix.mp3',
    'assets/ishkur/ladytron.jpg',
    'assets/ishkur/nested/deep.png',
    'data/ishkur.js',
    'index.html',
    'styles.css',
    'sw.js',
    'vendor/floating-ui-1.8.0-umd/LICENSE',
  ]);
  assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'LOCAL_ONLY=fixture');
});

test('the whole assets/ishkur tree is published, not just the files somebody remembered to list', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'em-site-images-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write('scripts/build-site.mjs', '');
  copyFileSync(script, path.join(root, 'scripts/build-site.mjs'));
  write('index.html', '<link href="styles.css" rel="stylesheet">');
  write('styles.css', 'body {}');
  write('sw.js', 'self.version = 1;');
  // 故意不建 assets/dj-automix 与 vendor：目录缺失只应警告，不应中断构建
  write('assets/ishkur/a.jpg', 'a');
  write('assets/ishkur/b.png', 'b');
  write('assets/ishkur/deep/c.gif', 'c');
  write('data/ishkur.js', 'window.ISHKUR = { entries: [{ images: [{ file: "a.jpg" }, { file: "b.png" }, { file: "deep/c.gif" }] }] };');
  execFileSync(process.execPath, [path.join(root, 'scripts/build-site.mjs')], { cwd: root, encoding: 'utf8' });
  for (const image of ['a.jpg', 'b.png', 'deep/c.gif']) {
    assert.equal(existsSync(path.join(root, 'dist-site/assets/ishkur', image)), true, `${image} must be published`);
  }
});

test('a referenced image that is not on disk fails the build instead of shipping a blank gallery', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'em-site-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, content) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  write('scripts/build-site.mjs', '');
  copyFileSync(script, path.join(root, 'scripts/build-site.mjs'));
  write('index.html', '<link href="styles.css" rel="stylesheet">');
  write('styles.css', 'body {}');
  write('sw.js', 'self.version = 1;');
  write('assets/ishkur/present.jpg', 'present');
  write('data/ishkur.js', 'window.ISHKUR = { entries: [{ images: [{ file: "present.jpg" }, { file: "vanished.jpg" }] }] };');
  assert.throws(
    () => execFileSync(process.execPath, [path.join(root, 'scripts/build-site.mjs')], { cwd: root, encoding: 'utf8', stdio: 'pipe' }),
    /vanished\.jpg/,
    'build must fail loudly when data references an image that is not published',
  );
});

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
  write('index.html', '<link href="styles.css" rel="stylesheet"><script src="app.js"></script><script src="retired.js"></script>');
  write('styles.css', 'body { color: white; }');
  write('app.js', 'window.version = 1;');
  write('retired.js', 'window.retired = true;');
  write('sw.js', 'self.version = 1;');
  write('assets/dj-automix/demo-mix.mp3', 'demo fixture');
  write('vendor/floating-ui-1.8.0-umd/LICENSE', 'license fixture');
  write('.env', 'LOCAL_ONLY=fixture');
  const build = () => execFileSync(process.execPath, [path.join(root, 'scripts/build-site.mjs')], { cwd: root, encoding: 'utf8' });
  build();
  assert.equal(existsSync(path.join(root, 'dist-site/retired.js')), true);

  write('index.html', '<link href="styles.css" rel="stylesheet"><script src="app.js"></script>');
  write('app.js', 'window.version = 2;');
  rmSync(path.join(root, 'retired.js'));
  build();
  assert.equal(existsSync(path.join(root, 'dist-site/retired.js')), false, 'retired public assets must not survive a rebuild');
  assert.equal(readFileSync(path.join(root, 'dist-site/app.js'), 'utf8'), 'window.version = 2;');
  const output = path.join(root, 'dist-site');
  const files = readdirSync(output, { recursive: true }).filter((file) => statSync(path.join(output, file)).isFile()).map((file) => file.split(path.sep).join('/')).sort();
  assert.deepEqual(files, ['app.js', 'assets/dj-automix/demo-mix.mp3', 'index.html', 'styles.css', 'sw.js', 'vendor/floating-ui-1.8.0-umd/LICENSE']);
  assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'LOCAL_ONLY=fixture');
});

import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist-site');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const references = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:[a-z]+:|\/\/|#)/i.test(reference));
const files = [...new Set([
  'index.html', 'sw.js', ...references,
  'assets/dj-automix/demo-mix.mp3',
  'vendor/floating-ui-1.8.0-umd/LICENSE',
])];
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
console.log(`Built ${files.length} public files (${(bytes / 1024 / 1024).toFixed(2)} MiB) in ${output}`);

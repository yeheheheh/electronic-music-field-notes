import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildModule } from '../lib/build.mjs';
import { loadKnowledgeBase } from '../lib/retrieval.mjs';
import { startHttpServer } from '../lib/http-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config', 'kb.config.json');
const CLI = path.join(ROOT, 'bin', 'kb.mjs');
const MCP = path.join(ROOT, 'bin', 'mcp-server.mjs');

let tempDir;
let kb;
let server;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-kb-test-'));
  const result = buildModule({ configPath: CONFIG, outputDir: tempDir });
  assert.equal(result.ok, true);
  kb = loadKnowledgeBase(tempDir);
});

after(async () => {
  if (server) await server.close().catch(() => {});
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows may keep a transient handle; the temp directory is disposable.
    }
  }
});

test('build produces the expected module artifacts', () => {
  assert.ok(fs.existsSync(path.join(tempDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(tempDir, 'chunks.jsonl')));
  assert.ok(fs.existsSync(path.join(tempDir, 'web.js')));
  // 断言下限而非绝对值：分类库会持续补充条目与大族，写死数字会让每次扩写都误报失败。
  assert.ok(kb.stats().entries >= 1205, `entries=${kb.stats().entries} 应不少于 1205`);
  assert.ok(kb.stats().families >= 16, `families=${kb.stats().families} 应不少于 16`);
  assert.ok(kb.stats().chunks >= 1200, `chunks=${kb.stats().chunks} 应不少于 1200`);
  assert.ok(kb.stats().curatedDocs >= 140, `curatedDocs=${kb.stats().curatedDocs} 应不少于 140`);

  // 「补遗」收纳桶不能计入正式大族，否则 House、Techno 会和「风格补遗」并列，
  // 看上去像「补遗」也是一种风格。统计口径必须保持拆开。
  const supplementFamilies = kb.families().filter((family) => family.supplement);
  assert.ok(supplementFamilies.length >= 1, 'supplementFamilies 应不少于 1');
  assert.equal(
    kb.stats().families + supplementFamilies.length + kb.stats().archivedFamilies,
    kb.families().length,
    '正式大族 + 补充收纳桶 + 待归档 应等于大族总数'
  );
});

test('english search ranks the exact style first', () => {
  const result = kb.search('uplifting trance', { limit: 3 });
  assert.ok(result.count > 0);
  assert.equal(result.results[0].id, 'g-2999');
  assert.equal(result.results[0].type, 'entry');
});

test('chinese family query ranks the family overview first', () => {
  const result = kb.search('迷幻舞曲', { limit: 3 });
  assert.equal(result.results[0].id, 'family:trance');
  assert.equal(result.results[0].type, 'family');
});

test('natural-language query expands to the seven instrument groups', () => {
  const result = kb.search('七组音色怎么分工', { limit: 3 });
  assert.equal(result.results[0].id, 'guide:production-instrument-summary');
});

test('family, type and BPM filters work', () => {
  const familyResult = kb.search('house', { family: 'House', limit: 10 });
  assert.ok(familyResult.count > 0);
  assert.ok(familyResult.results.every((item) => item.family === 'House'));

  const glossaryResult = kb.search('ADSR', { type: 'glossary', limit: 5 });
  assert.ok(glossaryResult.count > 0);
  assert.ok(glossaryResult.results.every((item) => item.type === 'glossary'));

  const bpmResult = kb.search('techno', { bpmMin: 130, bpmMax: 140, limit: 10 });
  assert.ok(bpmResult.count > 0);
  assert.ok(bpmResult.results.every((item) => item.bpm && item.bpm.max >= 130 && item.bpm.min <= 140));
});

test('get returns a complete entry with relations and examples', () => {
  const entry = kb.get('g-1581');
  assert.equal(entry.name, 'Bigroom House');
  assert.equal(entry.family.name, 'House');
  assert.ok(entry.examples.length >= 3);
  assert.ok(entry.relations.up.length >= 1);
  assert.ok(entry.source.line);
});

test('context is prompt-ready and includes citations', () => {
  const context = kb.context('七组音色怎么分工', { limit: 3, maxChars: 4000 });
  assert.ok(context.markdown.startsWith('# 知识库检索上下文'));
  assert.ok(context.citations.length > 0);
  assert.ok(context.markdown.includes('[guide:production-instrument-summary]'));
  assert.ok(context.markdown.length <= 4000);
});

test('manifest exposes tools and source hashes', () => {
  const manifest = kb.manifestInfo();
  assert.ok(manifest.tools.includes('kb_search'));
  assert.ok(manifest.tools.includes('kb_context'));
  assert.ok(Object.keys(manifest.sourceHashes).length >= 5);
  assert.equal(manifest.module.id, 'electronic-music-kb');
});

test('CLI returns JSON search results', () => {
  const output = execFileSync(process.execPath, [CLI, 'search', 'uplifting trance', '--limit', '1', '--json', '--dist', tempDir], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  const result = JSON.parse(output);
  assert.equal(result.results[0].id, 'g-2999');
});

test('MCP server supports initialize, tools/list and tools/call', async () => {
  const child = spawn(process.execPath, [MCP, '--dist', tempDir], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  const responses = [];
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (line.trim()) responses.push(JSON.parse(line));
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'kb_search', arguments: { query: 'uplifting trance', limit: 1 } } });
  setTimeout(() => child.stdin.end(), 600);
  await new Promise((resolve) => child.on('close', resolve));
  const initialize = responses.find((item) => item.id === 1);
  const tools = responses.find((item) => item.id === 2);
  const call = responses.find((item) => item.id === 3);
  assert.equal(initialize.result.serverInfo.name, 'electronic-music-kb');
  assert.ok(tools.result.tools.some((tool) => tool.name === 'kb_context'));
  assert.ok(call.result.content[0].text.includes('Uplifting Trance'));
});

test('HTTP API serves health and search', async () => {
  server = await startHttpServer({ kb, port: 0, host: '127.0.0.1' });
  const base = `http://${server.host}:${server.port}`;
  const health = await fetch(`${base}/health`).then((response) => response.json());
  const result = await fetch(`${base}/search?q=uplifting%20trance&limit=1`).then((response) => response.json());
  const context = await fetch(`${base}/context?q=808%20bass&limit=1&format=text`).then((response) => response.text());
  assert.equal(health.status, 'ok');
  assert.equal(result.results[0].id, 'g-2999');
  assert.ok(context.includes('# 知识库检索上下文'));
});

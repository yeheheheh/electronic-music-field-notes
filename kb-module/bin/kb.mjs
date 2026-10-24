#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModule, loadConfig } from '../lib/build.mjs';
import { loadKnowledgeBase, formatSearch } from '../lib/retrieval.mjs';
import { startHttpServer } from '../lib/http-server.mjs';
import { startMcpServer } from './mcp-server.mjs';

const BIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = path.resolve(BIN_DIR, '..');
const DEFAULT_CONFIG = path.join(MODULE_ROOT, 'config', 'kb.config.json');

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'help';
  const flags = { _: [] };
  while (args.length) {
    const value = args.shift();
    if (!value.startsWith('--')) {
      flags._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (key === 'json' || key === 'quiet' || key === 'help') {
      flags[key] = true;
      continue;
    }
    const next = args[0];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = args.shift();
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

function distDirFromFlags(flags) {
  if (flags.dist) return path.resolve(String(flags.dist));
  if (process.env.KB_DIST) return path.resolve(process.env.KB_DIST);
  try {
    const config = loadConfig(flags.config || DEFAULT_CONFIG);
    return config.output;
  } catch {
    return path.join(MODULE_ROOT, 'dist');
  }
}

function requireKb(flags) {
  const distDir = distDirFromFlags(flags);
  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
    throw new Error(`未找到构建产物：${distDir}\n先运行：node bin/kb.mjs build`);
  }
  return loadKnowledgeBase(distDir);
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printError(error) {
  process.stderr.write(`错误：${error.message}\n`);
  process.exitCode = 1;
}

function help() {
  process.stdout.write(`电子音乐知识库模块

用法：
  node bin/kb.mjs build [--config <path>] [--out <dir>]
  node bin/kb.mjs search <query> [--limit 6] [--family <name|id>] [--type <type>] [--bpm-min N] [--bpm-max N] [--json]
  node bin/kb.mjs context <query> [--limit 5] [--max-chars 6000] [--json]
  node bin/kb.mjs get <id> [--json]
  node bin/kb.mjs families [--json]
  node bin/kb.mjs manifest [--json]
  node bin/kb.mjs verify [--dist <dir>]
  node bin/kb.mjs serve [--port 8787] [--host 127.0.0.1] [--dist <dir>]
  node bin/kb.mjs mcp [--dist <dir>]

环境变量：
  KB_DIST   构建产物目录，默认从 config/kb.config.json 的 output 解析。

示例：
  node bin/kb.mjs search "uplifting trance" --limit 3
  node bin/kb.mjs context "七组音色怎么分工" --max-chars 4000
  node bin/kb.mjs get g-1581 --json
`);
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || flags.help) {
    help();
    return;
  }

  if (command === 'build') {
    const result = buildModule({ configPath: flags.config || DEFAULT_CONFIG, outputDir: flags.out });
    if (flags['json']) printJson(result);
    else {
      process.stdout.write(`构建完成：${result.output}\n`);
      process.stdout.write(`条目 ${result.stats.entries} · 大族 ${result.stats.families} · 文档 ${result.stats.curatedDocs} · 分块 ${result.stats.chunks}\n`);
      process.stdout.write(`耗时 ${result.elapsedMs}ms\n`);
    }
    return;
  }

  if (command === 'mcp') {
    await startMcpServer({ distDir: distDirFromFlags(flags) });
    return;
  }

  if (command === 'serve') {
    const kb = requireKb(flags);
    const server = await startHttpServer({
      kb,
      port: Number(flags.port || 8787),
      host: String(flags.host || '127.0.0.1'),
    });
    process.stdout.write(`知识库 HTTP API：http://${server.host}:${server.port}\n`);
    process.stdout.write('按 Ctrl+C 停止。\n');
    return;
  }

  if (command === 'search') {
    const query = flags._.join(' ').trim();
    if (!query) throw new Error('search 需要一个查询词');
    const kb = requireKb(flags);
    const result = kb.search(query, {
      limit: flags.limit,
      family: flags.family,
      type: flags.type,
      sourceId: flags['source-id'],
      bpmMin: flags['bpm-min'],
      bpmMax: flags['bpm-max'],
    });
    if (flags['json']) printJson(result);
    else process.stdout.write(`${formatSearch(result)}\n`);
    return;
  }

  if (command === 'context') {
    const query = flags._.join(' ').trim();
    if (!query) throw new Error('context 需要一个查询词');
    const kb = requireKb(flags);
    const result = kb.context(query, {
      limit: flags.limit,
      maxChars: flags['max-chars'],
      family: flags.family,
      type: flags.type,
      bpmMin: flags['bpm-min'],
      bpmMax: flags['bpm-max'],
    });
    if (flags['json']) printJson(result);
    else process.stdout.write(`${result.markdown}\n`);
    return;
  }

  if (command === 'get') {
    const id = flags._[0];
    if (!id) throw new Error('get 需要一个条目 ID');
    const kb = requireKb(flags);
    const item = kb.get(id);
    if (!item) throw new Error(`没有找到条目：${id}`);
    if (flags['json']) printJson(item);
    else {
      process.stdout.write(`${item.title || item.name} [${item.id}]\n`);
      if (item.family) process.stdout.write(`大族：${item.family.name || item.family}\n`);
      if (item.bpm) process.stdout.write(`BPM：${item.bpm.label}\n`);
      process.stdout.write(`\n${item.description || item.text || ''}\n`);
    }
    return;
  }

  if (command === 'families') {
    const kb = requireKb(flags);
    const families = kb.families();
    if (flags['json']) printJson(families);
    else families.forEach((family) => process.stdout.write(`${family.name}${family.zh ? ` / ${family.zh}` : ''}  ${family.count}\n`));
    return;
  }

  if (command === 'manifest') {
    const kb = requireKb(flags);
    printJson(kb.manifestInfo());
    return;
  }

  if (command === 'verify') {
    const kb = requireKb(flags);
    const result = {
      ok: true,
      manifest: kb.manifestInfo().module,
      stats: kb.stats(),
      artifacts: distDirFromFlags(flags),
    };
    if (flags['json']) printJson(result);
    else process.stdout.write(`OK  ${result.manifest.name} v${result.manifest.version}\n条目 ${result.stats.entries} · 分块 ${result.stats.chunks} · 索引构建 ${result.stats.indexBuildMs}ms\n`);
    return;
  }

  throw new Error(`未知命令：${command}\n运行 node bin/kb.mjs help 查看用法`);
}

main().catch(printError);

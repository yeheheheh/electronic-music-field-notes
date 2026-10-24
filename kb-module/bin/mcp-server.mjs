#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadKnowledgeBase } from '../lib/retrieval.mjs';

const BIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = path.resolve(BIN_DIR, '..');
const DEFAULT_DIST = path.join(MODULE_ROOT, 'dist');

const TOOLS = [
  {
    name: 'kb_search',
    description: '在电子音乐知识库中检索风格、大族、术语、结构、音色、历史与现场内容。返回带 ID 的结果，可用 kb_get 读取详情。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词，例如 "uplifting trance"、"808 bass"、"七组音色"。' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 6 },
        family: { type: 'string', description: '按大族过滤：大族名或 ID，如 House、Trance、f-165。' },
        type: {
          type: 'string',
          enum: ['entry', 'family', 'guide', 'style', 'instrument', 'glossary', 'timeline', 'live', 'source'],
          description: '按文档类型过滤。',
        },
        bpm_min: { type: 'number', description: '最低 BPM；仅对原文明确标注 BPM 的条目生效。' },
        bpm_max: { type: 'number', description: '最高 BPM；仅对原文明确标注 BPM 的条目生效。' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'kb_context',
    description: '检索并拼装一段可直接放入 prompt 的知识库上下文，带 [ID] 引用。适合在回答前调用。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '要回答的问题或检索主题。' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        max_chars: { type: 'integer', minimum: 800, maximum: 24000, default: 6000 },
        family: { type: 'string' },
        type: {
          type: 'string',
          enum: ['entry', 'family', 'guide', 'style', 'instrument', 'glossary', 'timeline', 'live', 'source'],
        },
        bpm_min: { type: 'number' },
        bpm_max: { type: 'number' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'kb_get',
    description: '按 ID 读取一个风格条目或精编文档的完整内容、关系、例曲与来源。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '条目 ID（如 g-1581）或文档 ID（如 style:bigroom-house、guide:production-structure）。' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'kb_families',
    description: '列出知识库的全部大族与条目数量，用于选择检索范围。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'kb_manifest',
    description: '返回知识库版本、构建时间、数据规模、来源与能力信息。',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

const PROTOCOL_VERSION = '2024-11-05';

function toolText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function normalizeArgs(args) {
  return {
    ...args,
    bpmMin: args.bpm_min ?? args.bpmMin,
    bpmMax: args.bpm_max ?? args.bpmMax,
    maxChars: args.max_chars ?? args.maxChars,
    sourceId: args.source_id ?? args.sourceId,
    limit: args.limit,
    family: args.family,
    type: args.type,
  };
}

function callTool(kb, name, rawArgs) {
  const args = normalizeArgs(rawArgs || {});
  if (name === 'kb_search') {
    if (!args.query || !String(args.query).trim()) throw new Error('query 不能为空');
    return toolText(kb.search(String(args.query), args));
  }
  if (name === 'kb_context') {
    if (!args.query || !String(args.query).trim()) throw new Error('query 不能为空');
    return kb.context(String(args.query), args).markdown;
  }
  if (name === 'kb_get') {
    if (!args.id) throw new Error('id 不能为空');
    const item = kb.get(String(args.id));
    if (!item) throw new Error(`没有找到：${args.id}`);
    return toolText(item);
  }
  if (name === 'kb_families') return toolText(kb.families());
  if (name === 'kb_manifest') return toolText(kb.manifestInfo());
  throw new Error(`未知工具：${name}`);
}

function safeProtocolVersion(requested) {
  const supported = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
  return supported.has(requested) ? requested : PROTOCOL_VERSION;
}

export async function startMcpServer({ distDir = DEFAULT_DIST, input = process.stdin, output = process.stdout } = {}) {
  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
    throw new Error(`未找到构建产物：${distDir}。先运行 node bin/kb.mjs build`);
  }
  const kb = loadKnowledgeBase(distDir);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let closed = false;

  const send = (message) => {
    if (closed) return;
    output.write(`${JSON.stringify(message)}\n`);
  };

  const sendResult = (id, result) => send({ jsonrpc: '2.0', id, result });
  const sendError = (id, code, message, data) => send({
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  });

  const handle = async (message) => {
    if (!message || message.jsonrpc !== '2.0') {
      if (message?.id !== undefined) sendError(message.id, -32600, 'Invalid Request');
      return;
    }
    const { id, method, params } = message;
    const isNotification = id === undefined;

    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;

    if (method === 'initialize') {
      if (isNotification) return;
      const requested = params?.protocolVersion;
      sendResult(id, {
        protocolVersion: safeProtocolVersion(requested),
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: kb.manifestInfo().module.id,
          version: kb.manifestInfo().module.version,
        },
      });
      return;
    }

    if (method === 'ping') {
      if (!isNotification) sendResult(id, {});
      return;
    }

    if (method === 'tools/list') {
      if (!isNotification) sendResult(id, { tools: TOOLS });
      return;
    }

    if (method === 'tools/call') {
      if (isNotification) return;
      const toolName = params?.name;
      const args = params?.arguments || {};
      if (!toolName) {
        sendError(id, -32602, 'params.name is required');
        return;
      }
      try {
        const text = callTool(kb, toolName, args);
        sendResult(id, { content: [{ type: 'text', text }] });
      } catch (error) {
        sendResult(id, {
          content: [{ type: 'text', text: `工具错误：${error.message}` }],
          isError: true,
        });
      }
      return;
    }

    if (method === 'resources/list') {
      if (!isNotification) sendResult(id, { resources: [] });
      return;
    }

    if (method === 'prompts/list') {
      if (!isNotification) sendResult(id, { prompts: [] });
      return;
    }

    if (!isNotification) sendError(id, -32601, `Method not found: ${method}`);
  };

  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      sendError(null, -32700, 'Parse error');
      return;
    }
    handle(message).catch((error) => {
      if (message?.id !== undefined) sendError(message.id, -32603, error.message);
    });
  });

  await new Promise((resolve) => {
    rl.on('close', () => {
      closed = true;
      resolve();
    });
    if (input === process.stdin) {
      process.on('SIGINT', () => {
        closed = true;
        rl.close();
      });
    }
  });
  return { kb };
}

async function main() {
  const args = process.argv.slice(2);
  let distDir = process.env.KB_DIST || DEFAULT_DIST;
  const distIndex = args.indexOf('--dist');
  if (distIndex >= 0 && args[distIndex + 1]) distDir = args[distIndex + 1];
  if (args.includes('--help')) {
    process.stdout.write('Usage: node bin/mcp-server.mjs [--dist <dir>]\n');
    return;
  }
  try {
    await startMcpServer({ distDir });
  } catch (error) {
    process.stderr.write(`MCP server error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

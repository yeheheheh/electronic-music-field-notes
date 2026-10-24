import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildTaxonomy } from './taxonomy.mjs';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = path.join(MODULE_ROOT, 'config', 'kb.config.json');
const SCHEMA_VERSION = '1.0.0';
const TOKENIZER_VERSION = 'cjk-unigram-bigram-bm25-v1';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeJsonl(filePath, values) {
  fs.writeFileSync(filePath, values.map((value) => JSON.stringify(value)).join('\n') + (values.length ? '\n' : ''), 'utf8');
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, 'utf8');
}

function slug(value) {
  const ascii = String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii.slice(0, 80);
  return `zh-${sha256(String(value || '')).slice(0, 8)}`;
}

function uniqueId(base, used) {
  let candidate = base;
  let count = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${count}`;
    count += 1;
  }
  used.add(candidate);
  return candidate;
}

function parseBpm(value) {
  if (!value) return null;
  const numbers = String(value).match(/\d{2,3}/g);
  if (!numbers) return null;
  const min = Number(numbers[0]);
  const max = numbers[1] ? Number(numbers[1]) : min;
  return { min: Math.min(min, max), max: Math.max(min, max), label: String(value) };
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

function joinParts(...parts) {
  return parts.flat().filter((part) => part !== null && part !== undefined && String(part).trim()).map((part) => cleanText(part)).join('\n\n');
}

function bulletList(items, prefix = '- ') {
  return (items || []).filter(Boolean).map((item) => `${prefix}${item}`).join('\n');
}

function resolvePath(baseDir, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function loadConfig(configPath = DEFAULT_CONFIG, overrides = {}) {
  const absoluteConfig = path.resolve(configPath);
  const config = readJson(absoluteConfig);
  const configDir = path.dirname(absoluteConfig);
  const inputs = config.inputs || {};
  const resolved = {
    configPath: absoluteConfig,
    configDir,
    module: {
      id: 'electronic-music-kb',
      name: '电子音乐知识库',
      version: '0.0.0',
      language: 'zh-CN',
      ...(config.module || {}),
      ...(overrides.module || {}),
    },
    inputs: {
      taxonomy: resolvePath(configDir, inputs.taxonomy),
      curated: resolvePath(configDir, inputs.curated),
      transcripts: resolvePath(configDir, inputs.transcripts),
      sourceMap: resolvePath(configDir, inputs.sourceMap),
    },
    output: path.resolve(overrides.outputDir || resolvePath(configDir, config.output || '../dist')),
    build: {
      chunkMaxChars: 2200,
      chunkOverlap: 200,
      includeTranscripts: false,
      ...(config.build || {}),
      ...(overrides.build || {}),
    },
    retrieval: {
      defaultLimit: 6,
      maxLimit: 20,
      bm25: { k1: 1.2, b: 0.75 },
      ...(config.retrieval || {}),
      ...(overrides.retrieval || {}),
    },
  };
  if (!resolved.inputs.taxonomy) throw new Error('config.inputs.taxonomy is required');
  if (!resolved.inputs.curated) throw new Error('config.inputs.curated is required');
  return resolved;
}

function loadSources(config) {
  if (!config.inputs.sourceMap || !fs.existsSync(config.inputs.sourceMap)) {
    return [];
  }
  const sourceMapPath = config.inputs.sourceMap;
  const sourceMapDir = path.dirname(sourceMapPath);
  const sourceMap = readJson(sourceMapPath);
  const sources = (sourceMap.sources || []).map((source) => {
    const absolutePath = source.path ? resolvePath(sourceMapDir, source.path) : null;
    let exists = false;
    let bytes = 0;
    let hash = null;
    if (absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      const content = fs.readFileSync(absolutePath);
      exists = true;
      bytes = content.length;
      hash = sha256(content);
    }
    return {
      ...source,
      path: absolutePath,
      relativePath: source.path || null,
      exists,
      bytes,
      sha256: hash,
    };
  });
  return sources;
}

function sourceMapById(sources) {
  return new Map(sources.map((source) => [source.id, source]));
}

function fileStats(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return { bytes: stat.size, sha256: sha256(fs.readFileSync(filePath)) };
}

function familyDocs(taxonomy) {
  const entryById = new Map(taxonomy.entries.map((entry) => [entry.id, entry]));
  const docs = [];
  for (const family of taxonomy.families) {
    const children = (family.childIds || []).map((id) => entryById.get(id)).filter(Boolean);
    const text = joinParts(
      `# ${family.name}${family.zh ? ` / ${family.zh}` : ''}`,
      `本族收录 ${family.count} 个条目，${children.length} 个直接下级。`,
      family.intro || family.introSummary,
      '## 直接下级',
      bulletList(children.slice(0, 24).map((child) => child.name))
    );
    if (!text) continue;
    docs.push({
      id: `family:${slug(family.name)}`,
      type: 'family',
      title: `${family.name}${family.zh ? ` / ${family.zh}` : ''}`,
      text,
      family: family.name,
      familyId: family.id,
      path: null,
      bpm: null,
      aliases: [family.zh].filter(Boolean),
      examples: [],
      source: {
        id: 'feishu-taxonomy',
        title: '电音风格项目丨第四期',
        url: 'https://my.feishu.cn/docx/doxcnC2Rbwa2saGhRoFxh1aq4Gc',
      },
      metadata: {
        kind: 'family',
        familyId: family.id,
        count: family.count,
        archive: family.archive,
        childIds: family.childIds,
      },
    });
  }
  return docs;
}

function curatedDocs(curated, sources) {
  const docs = [];
  const used = new Set();
  const sourceById = sourceMapById(sources);
  const add = (idBase, type, title, text, extra = {}) => {
    const textValue = cleanText(text);
    if (!textValue) return;
    docs.push({
      id: uniqueId(idBase, used),
      type,
      title,
      text: textValue,
      family: extra.family || null,
      familyId: extra.familyId || null,
      path: extra.path || null,
      bpm: extra.bpm || null,
      aliases: extra.aliases || [],
      examples: extra.examples || [],
      source: { id: 'curated-notes', title: '电音档案精编内容' },
      metadata: { kind: 'curated', ...(extra.metadata || {}) },
    });
  };

  add(
    'guide:overview',
    'guide',
    '电音档案：使用导览',
    joinParts(
      curated.hero?.title?.replace(/\n/g, ''),
      curated.hero?.lead,
      curated.hero?.note,
      '## 三个入口',
      bulletList(curated.entryPoints?.map((item) => `${item.label}：${item.title}——${item.text}`)),
      '## 怎么用',
      bulletList(curated.usage)
    )
  );

  add(
    'guide:entry-points',
    'guide',
    '三个入口：听辨、查风格、理解现场',
    bulletList(curated.entryPoints?.map((item) => `${item.title}：${item.text}`))
  );

  add(
    'guide:coordinates',
    'guide',
    '听辨的三个坐标：BPM、鼓组、音色',
    joinParts(
      ...(curated.coordinates || []).map((item) => `## ${item.label}：${item.title}\n${item.body}`)
    )
  );

  add(
    'guide:listen-practice',
    'guide',
    '听辨练习：先找 Drop、只听鼓、换一首同 BPM',
    joinParts(...(curated.listen?.practice || []).map((item, index) => `## ${index + 1}. ${item.title}\n${item.body}`))
  );

  add(
    'guide:listen-confusions',
    'guide',
    '听辨的两个易混点：EDM 与 Dubstep',
    joinParts(...(curated.listen?.confusions || []).map((item) => `## ${item.title}\n${item.body}`))
  );

  for (const [index, style] of (curated.tenStyles || []).entries()) {
    add(
      `style:${slug(style.name)}`,
      'style',
      `${style.name} / ${style.zh}`,
      joinParts(
        style.signature,
        `- BPM：${style.bpm || '资料未给出统一值'}${style.bpmNote ? `（${style.bpmNote}）` : ''}`,
        `- 大族：${style.family}`,
        `## 识别特征\n${bulletList(style.tips)}`,
        `## 代表艺人\n${(style.artists || []).join('、')}`,
        `## 例曲\n${bulletList(style.tracks)}`,
        `## 注意\n${style.caveat}`
      ),
      {
        family: style.family,
        bpm: parseBpm(style.bpm),
        aliases: [style.zh].filter(Boolean),
        examples: style.tracks || [],
        metadata: { entryId: style.id, bpmNote: style.bpmNote, index },
      }
    );
  }

  for (const era of curated.timeline || []) {
    add(
      `timeline:${slug(era.years)}`,
      'timeline',
      `${era.years} · ${era.title}`,
      joinParts(`时间：${era.years}`, era.body, `相关大族：${(era.families || []).join('、')}`),
      { metadata: { years: era.years, families: era.families } }
    );
  }

  add(
    'guide:history-drivers',
    'guide',
    '风格为什么会分叉：技术、场景、地理、媒介',
    joinParts(...(curated.historyDrivers || []).map((item) => `## ${item.title}\n${item.body}`))
  );

  const production = curated.production || {};
  add(
    'guide:production-structure',
    'guide',
    'EDM 结构：拍、小节、乐句、乐段与八段结构',
    joinParts(
      `# ${String(production.title || '').replace(/<[^>]+>/g, '')}`,
      production.lead,
      '## 时间单位',
      bulletList((production.units || []).map((unit) => `${unit.name}（${unit.zh}）：${unit.body}`)),
      '## 八段结构',
      ...(production.sections || []).map((section) => `### ${section.name} / ${section.zh}（${section.bars} 小节）\n${section.body}`),
      production.structureNote
    )
  );

  for (const [index, group] of (production.instrumentGroups || []).entries()) {
    add(
      `instrument:${slug(group.en || group.name)}`,
      'instrument',
      `${group.name} / ${group.en}`,
      joinParts(
        `功能：${group.role}`,
        `频段：${group.freq}`,
        group.body,
        `常见音色：${(group.examples || []).join('、')}`,
        `## 怎么听\n${group.listen}`
      ),
      { metadata: { index, examples: group.examples, role: group.role, freq: group.freq } }
    );
  }

  add(
    'guide:production-instrument-summary',
    'guide',
    '七大乐器组：七组音色怎么分工',
    joinParts(
      '## 七组音色',
      ...(production.instrumentGroups || []).map((group) => `- ${group.name}（${group.en}）：${group.role}；${group.body}`),
      '## 一条规则',
      '同一个音色可以在不同段落扮演不同角色：Pad 可以变成 Lead，Vocal 可以被切成 FX。真正决定“像不像”的，是它在频段和段落里占了什么位置。先让每个组在自己的频段里清楚，再谈“响不响”。'
    )
  );

  const chain = production.soundChain || {};
  add(
    'guide:production-signal-chain',
    'guide',
    '音色是怎么来的：MIDI → 音源 → 效果器 → 总线',
    joinParts(
      '## 信号链',
      ...(chain.steps || []).map((step) => `${step.step}. ${step.name}：${step.body}`),
      '## 合成器',
      chain.synth,
      chain.synthTypes,
      '## 采样器',
      chain.sampler,
      '## 四类效果器',
      ...(chain.effects || []).map((effect) => `### ${effect.name}（${effect.examples}）\n${effect.body}`),
      chain.orderNote
    )
  );

  add(
    'guide:production-frequency',
    'guide',
    '频谱：七个乐器组不要挤在同一条线上',
    joinParts(
      ...(production.frequency?.bands || []).map((band) => `## ${band.name}（${band.range}）\n${band.body}`),
      production.frequency?.body
    )
  );

  add(
    'guide:production-practice',
    'guide',
    '拆歌练习：画结构、数层次、找频段、改一个参数',
    joinParts(...(production.practice || []).map((item, index) => `## ${index + 1}. ${item.title}\n${item.body}`))
  );

  add('guide:production-caveat', 'guide', '结构不是公式', production.caveat);

  for (const section of curated.live?.sections || []) {
    add(
      `live:${slug(section.title)}`,
      'live',
      `现场：${section.title}`,
      section.body,
      { metadata: { section: section.title } }
    );
  }

  add(
    'live:quote-and-checklist',
    'live',
    '现场笔记：金句与实用清单',
    joinParts(
      `“${curated.live?.quote?.text || ''}”`,
      curated.live?.quote?.note,
      `## ${curated.live?.checklistTitle || '实用清单'}`,
      bulletList(curated.live?.checklist),
      curated.live?.checklistNote
    )
  );

  for (const group of curated.glossary || []) {
    add(
      `glossary:${slug(group.group)}:intro`,
      'glossary',
      `${group.group}术语导言`,
      joinParts(group.intro, bulletList((group.terms || []).map((term) => `${term.term} / ${term.zh}：${term.def}`)))
    );
    for (const term of group.terms || []) {
      add(
        `glossary:${slug(term.term)}`,
        'glossary',
        `${term.term} / ${term.zh}`,
        `${term.term}（${term.zh}）：${term.def}`,
        { aliases: [term.zh].filter(Boolean), metadata: { group: group.group, term: term.term, zh: term.zh } }
      );
    }
  }

  for (const section of curated.atlasGuide?.sections || []) {
    add(
      `guide:atlas:${slug(section.title)}`,
      'guide',
      `图谱说明：${section.title}`,
      section.body
    );
  }

  for (const source of curated.sources || []) {
    const sourceId = sources.find((item) => item.title === source.title)?.id;
    add(
      `source:${sourceId || slug(source.title)}`,
      'source',
      `来源：${source.title}`,
      joinParts(
        `类型：${source.type}`,
        `作者：${source.author}`,
        source.note,
        source.url ? `链接：${source.url}` : ''
      ),
      { metadata: { aboutSourceId: sourceId || null, url: source.url || null } }
    );
  }

  add(
    'guide:corrections',
    'guide',
    '转写校正：自动语音识别常见误差',
    joinParts(
      '两期节目使用自动转写，术语和人名存在明显误差。精编页按分类库与上下文校正；图谱条目以原文为准。',
      ...(curated.corrections || []).map((item) => `- ${item.from} → ${item.to}（${item.note}）`)
    )
  );

  add(
    'guide:usage',
    'guide',
    '知识库使用与版权说明',
    bulletList(curated.usage)
  );

  for (const doc of docs) {
    if (doc.metadata?.entryId) {
      const source = sources.find((item) => item.id === 'feishu-taxonomy');
      if (source) {
        doc.source = { id: source.id, title: source.title, url: source.url || null };
      }
    }
  }

  return docs;
}

function splitText(text, maxChars, overlap) {
  const normalized = cleanText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
    } else if (current.length + paragraph.length + 2 <= maxChars) {
      current += `\n\n${paragraph}`;
    } else {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      current = tail ? `${tail}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars * 1.3) return [chunk];
    const parts = [];
    for (let index = 0; index < chunk.length; index += maxChars - overlap) {
      parts.push(chunk.slice(index, index + maxChars));
    }
    return parts;
  });
}

function entryChunks(entries, options) {
  const chunks = [];
  for (const entry of entries) {
    const examplesText = (entry.examples || []).map((item) => `${item.title}${item.artist ? ` — ${item.artist}` : ''}`).join('\n');
    const text = joinParts(
      entry.name,
      entry.aliases?.length ? `A.K.A. ${entry.aliases.join(' / ')}` : '',
      entry.familyName ? `大族：${entry.familyName}${entry.familyZh ? ` / ${entry.familyZh}` : ''}` : '',
      entry.pathNames?.length ? `路径：${entry.pathNames.join(' > ')}` : '',
      entry.bpm ? `BPM：${entry.bpm.label}` : '',
      entry.description || entry.summary || '原始资料暂未展开这一条目。',
      examplesText ? `例曲：\n${examplesText}` : ''
    );
    const parts = splitText(text, options.chunkMaxChars, options.chunkOverlap);
    parts.forEach((part, index) => {
      chunks.push({
        id: parts.length === 1 ? entry.id : `${entry.id}#${index + 1}`,
        docId: entry.id,
        type: 'entry',
        title: entry.name,
        text: part,
        family: entry.familyName || null,
        familyId: entry.familyId || null,
        path: entry.pathNames?.join(' > ') || null,
        bpm: entry.bpm || null,
        aliases: entry.aliases || [],
        examples: (entry.examples || []).map((item) => `${item.title}${item.artist ? ` - ${item.artist}` : ''}`),
        source: { id: 'feishu-taxonomy', title: '电音风格项目丨第四期', line: entry.line, url: 'https://my.feishu.cn/docx/doxcnC2Rbwa2saGhRoFxh1aq4Gc' },
        metadata: {
          familyId: entry.familyId,
          familyName: entry.familyName,
          familyZh: entry.familyZh,
          level: entry.level,
          status: entry.status,
          stub: entry.stub,
          stubReason: entry.stubReason,
          traits: entry.traits,
          parentId: entry.parentId,
          pathNames: entry.pathNames,
          group: entry.group,
          sourceLine: entry.line,
          chunkIndex: index,
        },
      });
    });
  }
  return chunks;
}

function docChunks(docs, options) {
  const chunks = [];
  for (const doc of docs) {
    const parts = splitText(doc.text, options.chunkMaxChars, options.chunkOverlap);
    parts.forEach((part, index) => {
      chunks.push({
        id: parts.length === 1 ? doc.id : `${doc.id}#${index + 1}`,
        docId: doc.id,
        type: doc.type,
        title: doc.title,
        text: part,
        family: doc.family || null,
        familyId: doc.familyId || null,
        path: doc.path || null,
        bpm: doc.bpm || null,
        aliases: doc.aliases || [],
        examples: doc.examples || [],
        source: doc.source,
        metadata: { ...(doc.metadata || {}), chunkIndex: index },
      });
    });
  }
  return chunks;
}

function transcriptChunks(sources, options) {
  if (!options.includeTranscripts) return [];
  const chunks = [];
  for (const source of sources) {
    if (!source.exists || !/\.(json|txt)$/i.test(source.path)) continue;
    const raw = readText(source.path);
    let text = raw;
    if (/\.json$/i.test(source.path)) {
      try {
        const segments = JSON.parse(raw);
        if (Array.isArray(segments)) {
          const paragraphs = [];
          let current = '';
          let start = null;
          let end = null;
          for (const segment of segments) {
            const content = String(segment.content || '').trim();
            if (!content) continue;
            if (start === null) start = segment.from;
            end = segment.to;
            current += `${content} `;
            if (current.length > 900) {
              paragraphs.push(current.trim());
              current = '';
              start = null;
            }
          }
          if (current.trim()) paragraphs.push(current.trim());
          text = paragraphs.join('\n\n');
        }
      } catch {
        // Keep raw text when the transcript is not JSON.
      }
    }
    const parts = splitText(text, Math.max(1200, options.chunkMaxChars), options.chunkOverlap);
    parts.forEach((part, index) => {
      chunks.push({
        id: `${source.id}#${index + 1}`,
        docId: source.id,
        type: 'transcript',
        title: source.title,
        text: part,
        family: null,
        familyId: null,
        path: null,
        bpm: null,
        aliases: [],
        examples: [],
        source: { id: source.id, title: source.title, url: source.url || null },
        metadata: { author: source.author, licenseNote: source.licenseNote },
      });
    });
  }
  return chunks;
}

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function makeCsv(entries) {
  const header = ['id', 'name', 'family', 'family_zh', 'path', 'parent', 'aliases', 'bpm', 'traits', 'summary', 'examples', 'source_line'];
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const rows = entries.map((entry) => [
    entry.id,
    entry.name,
    entry.familyName,
    entry.familyZh,
    (entry.pathNames || []).join(' > '),
    byId.get(entry.parentId)?.name || entry.familyName,
    (entry.aliases || []).join('; '),
    entry.bpm?.label || '',
    (entry.traits || []).join('; '),
    entry.summary,
    (entry.examples || []).map((item) => `${item.title}${item.artist ? ` - ${item.artist}` : ''}`).join('; '),
    entry.line,
  ]);
  return `\ufeff${header.map(escapeCsv).join(',')}\r\n${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}\r\n`;
}

function makeManifest({ config, sources, taxonomy, chunks, docs, outputDir, files }) {
  const sourceHashes = Object.fromEntries(
    sources.filter((source) => source.exists).map((source) => [source.id, source.sha256])
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    module: config.module,
    builtAt: new Date().toISOString(),
    tokenizer: TOKENIZER_VERSION,
    stats: {
      ...taxonomy.meta.stats,
      curatedDocs: docs.length,
      docs: docs.length,
      chunks: chunks.length,
      sourceFiles: sources.length,
    },
    retrieval: {
      method: 'bm25',
      implementation: 'in-memory',
      tokenizer: TOKENIZER_VERSION,
      defaultLimit: config.retrieval.defaultLimit,
      maxLimit: config.retrieval.maxLimit,
      bm25: config.retrieval.bm25,
      filters: ['family', 'familyId', 'bpmMin', 'bpmMax', 'type'],
    },
    storage: {
      artifacts: outputDir,
      entryFile: 'kb.json',
      chunkFile: 'chunks.jsonl',
      docFile: 'docs.json',
      indexFile: 'index.meta.json',
      format: 'json+jsonl',
      indexPersistence: 'metadata-only; postings rebuilt in memory at load',
    },
    capabilities: ['search', 'get', 'families', 'context', 'manifest', 'cli', 'mcp', 'http'],
    tools: ['kb_search', 'kb_get', 'kb_families', 'kb_context', 'kb_manifest'],
    sourceHashes,
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      author: source.author,
      url: source.url || null,
      exists: source.exists,
      bytes: source.bytes,
      sha256: source.sha256,
      licenseNote: source.licenseNote,
      note: source.note,
    })),
    files,
    counts: {
      entries: taxonomy.entries.length,
      families: taxonomy.families.length,
      docs: docs.length,
      chunks: chunks.length,
      transcriptChunks: chunks.filter((chunk) => chunk.type === 'transcript').length,
    },
  };
}

export function buildModule({ configPath = DEFAULT_CONFIG, outputDir } = {}) {
  const started = Date.now();
  const config = loadConfig(configPath, { outputDir });
  if (!fs.existsSync(config.inputs.taxonomy)) throw new Error(`taxonomy input not found: ${config.inputs.taxonomy}`);
  if (!fs.existsSync(config.inputs.curated)) throw new Error(`curated input not found: ${config.inputs.curated}`);

  const taxonomyText = readText(config.inputs.taxonomy);
  const curated = readJson(config.inputs.curated);
  const sources = loadSources(config);
  const taxonomy = buildTaxonomy({ markdown: taxonomyText, sourceName: 'feishu-taxonomy' });
  const docs = [...familyDocs(taxonomy), ...curatedDocs(curated, sources)];
  const chunks = [
    ...entryChunks(taxonomy.entries, config.build),
    ...docChunks(docs, config.build),
    ...transcriptChunks(sources, config.build),
  ];

  const outputParent = path.dirname(config.output);
  ensureDir(outputParent);
  const tempDir = path.join(outputParent, `.kb-build-${process.pid}-${Date.now()}`);
  ensureDir(tempDir);
  ensureDir(path.join(tempDir, 'schema'));

  writeJson(path.join(tempDir, 'kb.json'), {
    schemaVersion: SCHEMA_VERSION,
    meta: taxonomy.meta,
    families: taxonomy.families,
    entries: taxonomy.entries,
  });
  writeJson(path.join(tempDir, 'families.json'), taxonomy.families);
  writeJson(path.join(tempDir, 'docs.json'), docs);
  writeJsonl(path.join(tempDir, 'chunks.jsonl'), chunks);
  writeJson(path.join(tempDir, 'curated.json'), curated);
  writeJson(path.join(tempDir, 'sources.json'), {
    schemaVersion: SCHEMA_VERSION,
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      path: source.relativePath,
      author: source.author,
      url: source.url || null,
      licenseNote: source.licenseNote,
      note: source.note,
      exists: source.exists,
      bytes: source.bytes,
      sha256: source.sha256,
    })),
  });
  writeJson(path.join(tempDir, 'index.meta.json'), {
    schemaVersion: SCHEMA_VERSION,
    tokenizer: TOKENIZER_VERSION,
    builtAt: new Date().toISOString(),
    docCount: chunks.length,
    docs: chunks.map((chunk) => ({
      id: chunk.id,
      docId: chunk.docId,
      type: chunk.type,
      title: chunk.title,
      family: chunk.family,
      familyId: chunk.familyId,
      bpm: chunk.bpm,
      sourceId: chunk.source?.id || null,
      length: chunk.text.length,
    })),
    note: 'Postings are rebuilt in memory by lib/retrieval.mjs to keep the artifact portable and small.',
  });
  writeText(path.join(tempDir, 'entries.csv'), makeCsv(taxonomy.entries));
  writeJson(path.join(tempDir, 'unresolved.json'), {
    schemaVersion: SCHEMA_VERSION,
    unresolvedRelationNames: taxonomy.unresolved,
    duplicateNames: taxonomy.duplicates.map((items) => items.map((item) => ({ id: item.id, name: item.name, family: item.familyName }))),
  });

  const schemaDir = path.join(MODULE_ROOT, 'schema');
  if (fs.existsSync(schemaDir)) {
    for (const file of fs.readdirSync(schemaDir)) {
      if (file.endsWith('.json')) {
        fs.copyFileSync(path.join(schemaDir, file), path.join(tempDir, 'schema', file));
      }
    }
  }

  const files = {};
  for (const file of fs.readdirSync(tempDir)) {
    const fullPath = path.join(tempDir, file);
    if (fs.statSync(fullPath).isFile()) files[file] = fileStats(fullPath);
  }
  const manifest = makeManifest({ config, sources, taxonomy, chunks, docs, outputDir: config.output, files });
  writeJson(path.join(tempDir, 'manifest.json'), manifest);
  files['manifest.json'] = fileStats(path.join(tempDir, 'manifest.json'));

  const webPayload = {
    manifest: { ...manifest, files: undefined },
    docs,
    chunks,
  };
  writeText(
    path.join(tempDir, 'web.js'),
    `window.KB_WEB = ${JSON.stringify(webPayload).replace(/<\//g, '<\\/')};\n`
  );
  files['web.js'] = fileStats(path.join(tempDir, 'web.js'));
  manifest.files = files;
  writeJson(path.join(tempDir, 'manifest.json'), manifest);

  ensureDir(config.output);
  for (const entry of fs.readdirSync(tempDir, { withFileTypes: true })) {
    const sourcePath = path.join(tempDir, entry.name);
    const destinationPath = path.join(config.output, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  return {
    ok: true,
    output: config.output,
    module: config.module,
    stats: manifest.stats,
    sources: manifest.sources,
    files: manifest.files,
    elapsedMs: Date.now() - started,
  };
}

export { DEFAULT_CONFIG, MODULE_ROOT, TOKENIZER_VERSION, loadConfig, parseBpm };

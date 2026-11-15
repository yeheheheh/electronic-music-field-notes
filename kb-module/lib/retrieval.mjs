import fs from 'node:fs';
import path from 'node:path';

const TOKENIZER = 'cjk-unigram-bigram-bm25-v1';
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'and', 'in', 'on', 'for', 'with', 'is', 'are', 'be', 'by',
  'as', 'at', 'from', 'or', 'this', 'that', 'these', 'those', 'it', 'its', 'into', 'than',
]);
const CHINESE_STOPCHARS = new Set('的了是在有和与就都而及或一个种这那为以于之其把被让给很更最又也很吗呢吧啊'.split(''));

export function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase();
}

export function normalizePhrase(value) {
  return normalize(value).replace(/[\s\-_/·.,，。:：;；!！?？'"“”‘’()（）[\]【】]/g, '');
}

export function tokenize(value) {
  const text = normalize(value);
  const runs = text.match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [];
  const tokens = [];
  for (const run of runs) {
    if (/^[a-z0-9]+$/.test(run)) {
      if (run.length > 1 && !ENGLISH_STOPWORDS.has(run)) tokens.push(run);
      continue;
    }
    if (run.length === 1) {
      if (!CHINESE_STOPCHARS.has(run)) tokens.push(run);
      continue;
    }
    for (let index = 0; index < run.length; index += 1) {
      const char = run[index];
      if (!CHINESE_STOPCHARS.has(char)) tokens.push(char);
      if (index < run.length - 1) tokens.push(run.slice(index, index + 2));
    }
    if (run.length <= 6) tokens.push(run);
  }
  return tokens;
}

export function uniqueQueryTokens(value) {
  return [...new Set(tokenize(value))];
}

function fixQuery(value) {
  return String(value ?? '')
    .replace(/beat\s*mach(?:ing|ed)?/gi, 'beatmatch')
    .replace(/rekord\s*box/gi, 'rekordbox')
    .replace(/hot\s*cues?/gi, 'hot cue')
    .replace(/memor(?:y|ies)\s*cues?/gi, 'memory cue')
    .replace(/q\s*点/gi, 'cue 点')
    .replace(/q\s*键/gi, 'cue 键')
    .replace(/接割|接构|皆割/g, '接歌')
    .replace(/对排|对派/g, '对拍')
    .replace(/碟姬|打碟姬/g, '碟机')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandQuery(query) {
  const additions = [];
  if (/七组|七件/.test(query)) additions.push('七大乐器组');
  if (/bass/i.test(query)) additions.push('贝斯');
  if (/drum/i.test(query)) additions.push('鼓组');
  if (/结构/.test(query)) additions.push('段落');
  if (/音色组/.test(query)) additions.push('乐器组');
  const rules = [
    [/cue|q点|cue点/i, ['CUE 点', 'Hot CUE', 'Memory CUE']],
    [/对拍|beatmatch|跑马|跑拍/i, ['对拍', 'Beatmatch']],
    [/接歌|过渡|切歌|transition/i, ['接歌', 'Transition', '乐句']],
    [/碟机|cdj|xdj|ddj|打碟机/i, ['打碟机', 'CDJ', 'XDJ', 'DDJ']],
    [/u盘|usb|导出|rekordbox/i, ['U 盘', 'Rekordbox', '导出']],
    [/调性|camelot|harmonic|mix in key/i, ['Camelot Wheel', '调性混音', '关系大小调']],
    [/上台|演出|现场|gig|set/i, ['现场', 'Set', '演出']],
    [/设备|耳机|音箱|监听/i, ['设备', '监听耳机', '音箱']],
    [/没有设备|没设备|零基础|新手/i, ['新手', '入门', '设备']],
    [/quantize|量化/i, ['Quantize', '量化']],
  ];
  for (const [pattern, terms] of rules) {
    if (pattern.test(query)) additions.push(...terms);
  }
  return [...new Set(additions)];
}

const INTENT_RE = /怎么|如何|是什么|为什么|区别|推荐|入门|新手|多久|哪里|能不能|要不要|怎么练/;

const TYPE_WEIGHT = {
  source: 0.5,
  transcript: 0.7,
  entry: 1,
  family: 1,
  guide: 1,
  style: 1,
  instrument: 1,
  glossary: 1,
  timeline: 1,
  live: 1,
};

function diverseResults(results, limit) {
  const picked = [];
  const types = new Set();
  for (const item of results) {
    if (picked.length >= limit) break;
    if (picked.length < 2 || !types.has(item.type)) {
      picked.push(item);
      types.add(item.type);
    }
  }
  if (picked.length < limit) {
    for (const item of results) {
      if (picked.includes(item)) continue;
      picked.push(item);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readJsonl(filePath) {
  return readText(filePath)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function plainText(text) {
  return String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function snippet(text, query, maxLength = 220) {
  const source = plainText(text).replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const lower = source.toLowerCase();
  const candidates = uniqueQueryTokens(query).map((token) => token.toLowerCase());
  let position = -1;
  for (const token of candidates) {
    const found = lower.indexOf(token);
    if (found >= 0 && (position < 0 || found < position)) position = found;
  }
  if (position < 0) return source.length > maxLength ? `${source.slice(0, maxLength - 1)}…` : source;
  const start = Math.max(0, position - Math.floor(maxLength * 0.35));
  const end = Math.min(source.length, start + maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < source.length ? '…' : '';
  return `${prefix}${source.slice(start, end)}${suffix}`;
}

function normalizeFamily(value) {
  return normalize(value).replace(/\s+/g, ' ').trim();
}

class KnowledgeBase {
  constructor(artifacts) {
    this.artifacts = artifacts;
    this.manifest = artifacts.manifest;
    this.kb = artifacts.kb;
    this.docs = artifacts.docs;
    this.chunks = artifacts.chunks;
    this.sources = artifacts.sources;
    this.entriesById = new Map((this.kb.entries || []).map((entry) => [entry.id, entry]));
    this.familiesById = new Map((this.kb.families || []).map((family) => [family.id, family]));
    this.docsById = new Map((this.docs || []).map((doc) => [doc.id, doc]));
    this.chunksById = new Map(this.chunks.map((chunk) => [chunk.id, chunk]));
    this.chunksByDoc = new Map();
    for (const chunk of this.chunks) {
      if (!this.chunksByDoc.has(chunk.docId)) this.chunksByDoc.set(chunk.docId, []);
      this.chunksByDoc.get(chunk.docId).push(chunk);
    }
    this.defaultLimit = this.manifest.retrieval?.defaultLimit || 6;
    this.maxLimit = this.manifest.retrieval?.maxLimit || 20;
    this.k1 = this.manifest.retrieval?.bm25?.k1 ?? 1.2;
    this.b = this.manifest.retrieval?.bm25?.b ?? 0.75;
    this.records = [];
    this.postings = new Map();
    this.documentFrequency = new Map();
    this.docLengths = [];
    this.averageLength = 0;
    this._buildIndex();
  }

  _buildIndex() {
    const started = Date.now();
    let totalLength = 0;
    for (let index = 0; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index];
      const frequencies = new Map();
      const add = (text, weight) => {
        if (!text) return;
        for (const token of tokenize(text)) {
          frequencies.set(token, (frequencies.get(token) || 0) + weight);
        }
      };
      add(chunk.title, 6);
      add((chunk.aliases || []).join(' '), 4);
      add([chunk.family, chunk.path].filter(Boolean).join(' '), 2);
      add((chunk.examples || []).join(' '), 2);
      add(chunk.text, 1);
      const length = [...frequencies.values()].reduce((sum, value) => sum + value, 0);
      this.docLengths[index] = length;
      totalLength += length;
      this.records[index] = { chunk, frequencies, length };
      for (const [token, frequency] of frequencies) {
        if (!this.postings.has(token)) this.postings.set(token, []);
        this.postings.get(token).push([index, frequency]);
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      }
    }
    this.averageLength = this.chunks.length ? totalLength / this.chunks.length : 0;
    this.indexBuildMs = Date.now() - started;
  }

  _matchesFilters(chunk, options = {}) {
    if (options.type) {
      const types = new Set(String(options.type).split(',').map((value) => value.trim()).filter(Boolean));
      if (types.size && !types.has(chunk.type)) return false;
    }
    if (options.sourceId && chunk.source?.id !== options.sourceId) return false;
    if (options.family) {
      const family = normalizeFamily(options.family);
      const familyId = String(options.family).trim();
      const chunkFamily = normalizeFamily(chunk.family || '');
      const chunkFamilyId = chunk.familyId || '';
      if (chunkFamilyId !== familyId && chunkFamily !== family) return false;
    }
    if (options.bpmMin !== undefined || options.bpmMax !== undefined) {
      if (!chunk.bpm) return false;
      const low = Number(options.bpmMin);
      const high = Number(options.bpmMax);
      if (Number.isFinite(low) && chunk.bpm.max < low) return false;
      if (Number.isFinite(high) && chunk.bpm.min > high) return false;
    }
    return true;
  }

  _result(chunk, score) {
    return {
      id: chunk.docId,
      chunk_id: chunk.id,
      type: chunk.type,
      title: chunk.title,
      family: chunk.family || null,
      familyId: chunk.familyId || null,
      path: chunk.path || null,
      bpm: chunk.bpm || null,
      score: round(score),
      snippet: snippet(chunk.text, this._lastQuery || ''),
      source: chunk.source,
      metadata: chunk.metadata || {},
    };
  }

  search(query, options = {}) {
    const q = String(query ?? '').trim();
    const limit = clamp(Number(options.limit) || this.defaultLimit, 1, this.maxLimit);
    const fixedQuery = fixQuery(q);
    this._lastQuery = fixedQuery || q;
    if (!q) {
      return { query: q, count: 0, results: [], meta: { limit, filters: {}, normalizedQuery: null } };
    }
    const tokens = uniqueQueryTokens([fixedQuery, ...expandQuery(fixedQuery)].join(' '));
    if (!tokens.length) {
      return { query: q, count: 0, results: [], meta: { limit, filters: {}, normalizedQuery: fixedQuery !== q ? fixedQuery : null } };
    }
    const scores = new Map();
    for (const token of tokens) {
      const postings = this.postings.get(token);
      if (!postings) continue;
      const df = this.documentFrequency.get(token) || 0;
      const idf = Math.log(1 + (this.chunks.length - df + 0.5) / (df + 0.5));
      const tokenWeight = Math.max(1, Math.min(8, token.length));
      for (const [index, frequency] of postings) {
        const length = this.docLengths[index] || 1;
        const denominator = frequency + this.k1 * (1 - this.b + (this.b * length) / (this.averageLength || 1));
        const score = idf * ((frequency * (this.k1 + 1)) / denominator) * tokenWeight;
        scores.set(index, (scores.get(index) || 0) + score);
      }
    }
    const phrase = normalizePhrase(fixedQuery);
    const intentQuery = INTENT_RE.test(fixedQuery);
    const candidates = [];
    for (const [index, baseScore] of scores) {
      const record = this.records[index];
      if (!record || !this._matchesFilters(record.chunk, options)) continue;
      const chunk = record.chunk;
      let score = baseScore;
      if (phrase) {
        const title = normalizePhrase(chunk.title);
        const aliases = (chunk.aliases || []).map(normalizePhrase);
        const text = normalizePhrase(chunk.text);
        if (title === phrase) score += 8;
        else if (title.includes(phrase)) score += 4;
        if (aliases.some((alias) => alias === phrase)) score += 5;
        else if (aliases.some((alias) => alias.includes(phrase))) score += 2;
        const familyText = normalizePhrase(chunk.family || '');
        if (familyText === phrase) score += 5;
        else if (familyText.includes(phrase)) score += 2.5;
        if (chunk.type === 'family' && (familyText.includes(phrase) || title.includes(phrase))) score += 15;
        if (text.includes(phrase)) score += 2.5;
      }
      let coverage = 0;
      for (const token of tokens) {
        if (record.frequencies.has(token)) coverage += 1;
      }
      score *= 0.55 + (0.45 * coverage) / tokens.length;
      score *= TYPE_WEIGHT[chunk.type] ?? 1;
      if (intentQuery) {
        if (chunk.type === 'guide' || chunk.type === 'glossary') score *= 1.12;
        if (chunk.type === 'transcript') score *= 0.96;
      }
      candidates.push({ record, score });
    }
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.record.chunk.title.length !== b.record.chunk.title.length) {
        return a.record.chunk.title.length - b.record.chunk.title.length;
      }
      return a.record.chunk.id.localeCompare(b.record.chunk.id);
    });
    const seenDocs = new Set();
    const deduped = candidates.filter(({ record }) => {
      if (seenDocs.has(record.chunk.docId)) return false;
      seenDocs.add(record.chunk.docId);
      return true;
    });
    const results = deduped.slice(0, limit).map(({ record, score }) => this._result(record.chunk, score));
    return {
      query: q,
      count: deduped.length,
      results,
      meta: {
        limit,
        totalMatched: deduped.length,
        tokens,
        normalizedQuery: fixedQuery !== q ? fixedQuery : null,
        filters: {
          family: options.family || null,
          type: options.type || null,
          sourceId: options.sourceId || null,
          bpmMin: options.bpmMin ?? null,
          bpmMax: options.bpmMax ?? null,
        },
      },
    };
  }

  _resolveEntry(entry) {
    if (!entry) return null;
    const relatedFor = (relations) => (relations || []).map((relation) => ({
      ...relation,
      entry: relation.id ? this.entriesById.get(relation.id) || null : null,
    }));
    return {
      ...entry,
      type: 'entry',
      relations: {
        up: relatedFor(entry.relations?.up),
        down: relatedFor(entry.relations?.down),
        related: relatedFor(entry.relations?.related),
      },
      backlinks: (entry.backlinks || []).map((link) => ({
        ...link,
        entry: this.entriesById.get(link.fromId) || null,
      })),
      family: this.familiesById.get(entry.familyId) || null,
      source: {
        id: 'feishu-taxonomy',
        title: '电音风格项目丨第四期',
        url: 'https://my.feishu.cn/docx/doxcnC2Rbwa2saGhRoFxh1aq4Gc',
        line: entry.line,
      },
    };
  }

  get(id) {
    const raw = String(id || '').trim();
    if (!raw) return null;
    const normalized = raw.replace(/#\d+$/, '');
    if (this.entriesById.has(normalized)) {
      return this._resolveEntry(this.entriesById.get(normalized));
    }
    if (this.docsById.has(normalized)) {
      const doc = this.docsById.get(normalized);
      return {
        ...doc,
        type: doc.type,
        chunks: (this.chunksByDoc.get(normalized) || []).map((chunk) => chunk.id),
      };
    }
    if (this.chunksById.has(raw)) {
      return this.get(this.chunksById.get(raw).docId);
    }
    const lower = normalized.toLowerCase();
    for (const [docId, doc] of this.docsById) {
      if (docId.toLowerCase() === lower) return this.get(docId);
    }
    return null;
  }

  families() {
    return (this.kb.families || []).map((family) => ({
      id: family.id,
      name: family.name,
      zh: family.zh,
      count: family.count,
      archive: family.archive,
      // 「补遗」收纳桶：为补齐覆盖度而追加的编辑性分组，不是音乐分类。
      supplement: Boolean(family.supplement),
      introSummary: family.introSummary,
      childCount: (family.childIds || []).length,
    }));
  }

  manifestInfo() {
    return this.manifest;
  }

  stats() {
    return {
      ...this.manifest.stats,
      indexBuildMs: this.indexBuildMs,
      avgDocumentLength: round(this.averageLength),
      chunks: this.chunks.length,
    };
  }

  context(query, options = {}) {
    const limit = clamp(Number(options.limit) || 5, 1, this.maxLimit);
    const maxChars = clamp(Number(options.maxChars) || 6000, 800, 24000);
    const result = this.search(query, { ...options, limit: Math.min(this.maxLimit, Math.max(limit * 3, limit)) });
    const picked = diverseResults(result.results, limit);
    if (!picked.length) {
      return {
        query,
        markdown: `# 知识库检索上下文\n\n查询：${query}\n\n未找到相关条目。请换一个关键词，或先调用 kb_families / kb_list 浏览分类。`,
        citations: [],
        results: [],
      };
    }
    const sections = [];
    const citations = [];
    let used = 0;
    for (const [index, item] of picked.entries()) {
      const full = this.get(item.id);
      const body = full?.description || full?.text || item.snippet;
      const examples = (full?.examples || []).map((example) => typeof example === 'string' ? example : `${example.title}${example.artist ? ` - ${example.artist}` : ''}`);
      const family = full?.family?.name || full?.family || item.family;
      const bpm = full?.bpm?.label || item.bpm?.label || '未标注';
      const source = full?.source || item.source;
      const header = `## ${index + 1}. [${item.id}] ${item.title}`;
      const meta = [
        `- 类型：${item.type}`,
        family ? `- 大族：${family}` : null,
        `- BPM：${bpm}`,
        source?.title ? `- 来源：${source.title}${source.line ? ` 第 ${source.line} 行` : ''}` : null,
        source?.url ? `- 链接：${source.url}` : null,
        item.path ? `- 路径：${item.path}` : null,
      ].filter(Boolean).join('\n');
      const excerpt = String(body || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
      const examplesBlock = examples.length ? `\n\n例曲：${examples.slice(0, 6).join('；')}` : '';
      const section = `${header}\n${meta}\n\n${excerpt}${examplesBlock}`;
      if (used + section.length > maxChars && sections.length) break;
      sections.push(section);
      citations.push(item.id);
      used += section.length;
    }
    const markdown = [
      '# 知识库检索上下文',
      '',
      `查询：${query}`,
      `命中：${result.count} 条；以下是 ${sections.length} 条（已做类型去重）。`,
      '使用说明：回答时请用 [ID] 引用来源；资料不足时明确说明，不要补造。',
      '',
      sections.join('\n\n---\n\n'),
    ].join('\n');
    return { query, markdown, citations, results: picked };
  }
}

export function loadKnowledgeBase(distDir) {
  const root = path.resolve(distDir || path.join(process.cwd(), 'dist'));
  const required = ['manifest.json', 'kb.json', 'chunks.jsonl', 'docs.json', 'sources.json'];
  for (const file of required) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) throw new Error(`Missing artifact: ${full}. Run the build command first.`);
  }
  const manifest = readJson(path.join(root, 'manifest.json'));
  const kb = readJson(path.join(root, 'kb.json'));
  const docs = readJson(path.join(root, 'docs.json'));
  const chunks = readJsonl(path.join(root, 'chunks.jsonl'));
  const sources = readJson(path.join(root, 'sources.json'));
  return new KnowledgeBase({ manifest, kb, docs, chunks, sources, root });
}

export function formatSearch(result) {
  if (!result.results.length) return `没有找到与“${result.query}”相关的内容。`;
  return result.results.map((item, index) => {
    const meta = [item.family, item.bpm?.label ? `${item.bpm.label} BPM` : null, item.type].filter(Boolean).join(' · ');
    return `${index + 1}. [${item.id}] ${item.title}${meta ? ` (${meta})` : ''}\n   ${item.snippet}`;
  }).join('\n\n');
}

export { TOKENIZER };

export function buildTaxonomy({ markdown, sourceName = 'taxonomy.md' }) {
  const raw = String(markdown || '');
  const lines = raw.split(/\r?\n/);


const FAMILY_META = {
  'House': { zh: '浩室', color: 'violet' },
  'Techno': { zh: '科技舞曲', color: 'ice' },
  'Trance': { zh: '迷幻舞曲', color: 'phosphor' },
  'Breakbeat': { zh: '碎拍', color: 'heat' },
  'UK Bass': { zh: '英式低音', color: 'violet' },
  'US Bass': { zh: '美式低音', color: 'heat' },
  'HDM': { zh: '硬舞曲', color: 'phosphor' },
  'Hip-Hop / Trap / Future Bass': { zh: '嘻哈 / Trap / 未来贝斯', color: 'ice' },
  'Disco / Hi-NRG': { zh: '迪斯科 / Hi-NRG', color: 'heat' },
  'Ambient': { zh: '氛围', color: 'ice' },
  'Indie': { zh: '独立 / 合成器流行', color: 'phosphor' },
  'Post-Internet': { zh: '后互联网', color: 'violet' },
  'Industrial': { zh: '工业', color: 'heat' },
  '早期流派 / 手法 / 理念': { zh: '史前与技法', color: 'ice' },
  'Ethnic': { zh: '地域 / 民族', color: 'phosphor' },
  'Fusion': { zh: '融合', color: 'violet' },
  '待归档': { zh: '待归档', color: 'muted' },
};

const TRAIT_RULES = [
  { tag: '4/4', re: /(4\s*\/\s*4|44\s*拍|四四拍)/i },
  { tag: '碎拍', re: /(breakbeat|break\s*beat|碎拍|切分|syncopat)/i },
  { tag: 'Half-time', re: /(half[\s-]?time|半拍|半速)/i },
  { tag: '三连音', re: /(三连音|triplet)/i },
  { tag: '暗色', re: /(黑暗|阴沉|忧郁|恐怖|压抑|doom|dark|melanchol)/i },
  { tag: '明亮', re: /(明亮|愉悦|欢快|uplifting|euphoric|happy|bright)/i },
  { tag: '旋律', re: /(旋律|melodic|情感|emotional|anthem)/i },
  { tag: '失真', re: /(失真|distort|aggress|侵略|撕裂|硬)/i },
  { tag: '氛围', re: /(氛围|ambient|空灵|空间感|atmospher)/i },
  { tag: '极简', re: /(极简|minimal|重复|hypnotic)/i },
  { tag: '人声', re: /(人声|vocal|唱腔|choir)/i },
  { tag: '酸性', re: /(acid|303|酸性)/i },
  { tag: '工业', re: /(工业|industrial|机械)/i },
  { tag: '低音', re: /(sub\s*bass|bassline|低音|808)/i },
];

function unescapeMd(value) {
  return String(value)
    .replace(/\\/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function cleanInline(value) {
  return unescapeMd(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/<https?:\/\/[^>]+>/g, '')
    .replace(/【\s*https?:\/\/[^】]+】/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanFamilyName(value) {
  let name = unescapeMd(value)
    .replace(/[（(]\s*已完成\s*[）)]/g, '')
    .replace(/[（(]\s*待完善\s*[）)]/g, '')
    .replace(/\s*\[Beat Scene\]\s*/gi, '')
    .replace(/\s*[（(]US Dubstep[）)]\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^Hip-Hop/i.test(name)) return 'Hip-Hop / Trap / Future Bass';
  if (/^Industrial Music/i.test(name)) return 'Industrial';
  if (/^早期流派/.test(name)) return '早期流派 / 手法 / 理念';
  if (/^暂时移走/.test(name)) return '待归档';
  return name.replace(/\s*\/\s*/g, ' / ');
}

function parseEntryTitle(value) {
  let title = unescapeMd(value).replace(/\s+/g, ' ').trim();
  let status = null;
  const rules = [
    [/[（(]\s*待完善\s*[）)]/g, '待完善'],
    [/[（(]\s*已合并\s*[）)]/g, '已合并'],
    [/[（(]\s*不选入视频\s*[）)]/g, '资料备注'],
    [/[（(]\s*未选入视频\s*[）)]/g, '资料备注'],
    [/\s*\[存疑\]/g, '存疑'],
    [/\s*\[Tag\]/gi, '标签'],
  ];
  for (const [re, label] of rules) {
    if (re.test(title)) {
      status = status || label;
      title = title.replace(re, '');
    }
  }
  return { title: title.replace(/\s+/g, ' ').trim(), status };
}

function parseHeading(line) {
  const match = line.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return null;
  const level = match[1].length;
  let title = unescapeMd(match[2]);
  let group = null;
  const piece = title.match(/^(.+?)\s*篇\s*[丨|]\s*(.+)$/);
  if (piece) {
    group = unescapeMd(piece[1]).replace(/（/g, '(').replace(/）/g, ')');
    title = unescapeMd(piece[2]);
  }
  return { level, title, group };
}

function matchRelation(line) {
  const value = cleanInline(line);
  if (!value) return null;
  let match = value.match(/^(上位|上)\s*[：:]\s*(.*)$/);
  if (match) return { type: 'up', value: match[2] };
  match = value.match(/^(下位|下)\s*[：:]\s*(.*)$/);
  if (match) return { type: 'down', value: match[2] };
  match = value.match(/^(Related\s*To)(?:\s*[：:]\s*|\s+)(.*)$/i);
  if (match) return { type: 'related', value: match[2] };
  if (/^(A\.K\.A\.?|AKA|又名|别名)\b/i.test(value)) {
    return {
      type: 'aliases',
      value: value.replace(/^(A\.K\.A\.?|AKA|又名|别名)\s*[：:]?\s*/i, ''),
    };
  }
  return null;
}

function splitNames(value) {
  return [
    ...new Set(
      value
        .split(/\s*(?:、|，|,|；|;)\s*/)
        .map((item) =>
          item
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\s*(?:etc\.?|等)\s*$/i, '')
            .trim()
        )
        .filter((item) => item && !/^(etc\.?|等)$/i.test(item))
    ),
  ];
}

function looksLikeExample(line) {
  if (!line) return false;
  if (/【\s*https?:/.test(line)) return true;
  if (/\s[-–—]\s/.test(line)) return true;
  if (/^https?:\/\//.test(line)) return false;
  if (line.length <= 90 && !/[。！？]$/.test(line) && !/^(注|参考|歌单|BGM)/.test(line)) return true;
  return false;
}

function parseExample(value) {
  let line = cleanInline(value).replace(/^[-*•]\s*/, '').trim();
  if (!line) return null;
  let url = null;
  const bracketUrl = line.match(/【\s*(https?:\/\/[^】]+)\s*】/);
  const parenUrl = line.match(/\((https?:\/\/[^)]+)\)/);
  if (bracketUrl) {
    url = bracketUrl[1].trim();
    line = line.replace(bracketUrl[0], '').trim();
  } else if (parenUrl) {
    url = parenUrl[1].trim();
    line = line.replace(parenUrl[0], '').trim();
  }
  line = line
    .replace(/[（(]\s*(经典|现代|早期|晚期|代表)\s*[）)]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!line) return null;
  let title = line;
  let artist = '';
  const parts = line.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    title = parts[0].trim();
    artist = parts.slice(1).join(' - ').trim();
  }
  if (!title) return null;
  return { title, artist, url: url || null };
}

function parseBody(bodyLines) {
  const relations = { up: [], down: [], related: [], aliases: [] };
  const descriptionLines = [];
  const exampleLines = [];
  let inExamples = false;

  for (const bodyLine of bodyLines) {
    const line = cleanInline(bodyLine);
    if (!line) {
      if (!inExamples) descriptionLines.push('');
      continue;
    }
    const relation = matchRelation(bodyLine);
    if (relation) {
      if (relation.value) relations[relation.type].push(...splitNames(relation.value));
      continue;
    }
    const exampleMarker = line.match(/^例曲\s*[：:]?\s*(.*)$/);
    if (exampleMarker) {
      inExamples = true;
      if (exampleMarker[1]) exampleLines.push(exampleMarker[1]);
      continue;
    }
    if (inExamples) {
      if (looksLikeExample(line)) exampleLines.push(line);
      continue;
    }
    descriptionLines.push(line);
  }

  for (const key of Object.keys(relations)) {
    relations[key] = [...new Set(relations[key])];
  }

  let description = descriptionLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '')
    .split('\n')
    .filter((line) => line && !/^(歌单|BGM|试听|参考)\s*[：:]/i.test(line))
    .filter((line) => !/^[*\-—_]{3,}$/.test(line))
    .join('\n')
    .trim();

  description = description
    .replace(/^A\.K\.A\.?\s*/i, '')
    .replace(/【\s*】/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const examples = exampleLines
    .map(parseExample)
    .filter(Boolean)
    .slice(0, 10);

  return { relations, description, examples };
}

function summarize(description) {
  const flat = description.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const sentences = flat.split(/(?<=[。！？!?])\s*/);
  let summary = sentences[0] || flat;
  if (summary.length < 42 && sentences[1]) summary += sentences[1];
  if (summary.length > 150) summary = `${summary.slice(0, 148).replace(/[，、；,:;]$/, '')}…`;
  return summary;
}

function extractBpm(text) {
  const normalized = text.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
  const patterns = [
    /BPM[^。；;!\n]{0,45}?(\d{2,3})(?:\s*[-~～—–至到]\s*(\d{2,3}))?/i,
    /(\d{2,3})\s*[-~～—–至到]\s*(\d{2,3})[^。；;!\n]{0,8}?(?:BPM|拍)/i,
    /(\d{2,3})[^。；;!\n]{0,12}?(?:BPM|拍)/i,
    /速度[^。；;!\n]{0,30}?(\d{2,3})(?:\s*[-~～—–至到]\s*(\d{2,3}))?/i,
    /(?:^|[^\d])(\d{2,3})\s*(?:BPM|拍)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    let min = Number(match[1]);
    let max = match[2] ? Number(match[2]) : min;
    if (min > max) [min, max] = [max, min];
    if (min >= 60 && max <= 350) {
      return { min, max, label: min === max ? String(min) : `${min}–${max}` };
    }
  }
  return null;
}

function extractTraits(text) {
  return TRAIT_RULES.filter((rule) => rule.re.test(text))
    .map((rule) => rule.tag)
    .slice(0, 6);
}

function normKey(value) {
  return cleanInline(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\s\-_/·.,，。:：;；!！?？'"“”‘’()（）[\]【】]/g, '')
    .trim();
}

const metaRoots = new Set([
  '电音风格项目丨第四期',
  '编写注意事项（给编辑人员看的）',
  '查阅指南（给各位读者看的）',
]);

const headings = [];
for (let index = 0; index < lines.length; index += 1) {
  const parsed = parseHeading(lines[index]);
  if (parsed) headings.push({ ...parsed, line: index, rawTitle: unescapeMd(lines[index].replace(/^#{1,6}\s+/, '')) });
}

const families = [];
const entries = [];
let currentFamily = null;
let stack = [];

for (let index = 0; index < headings.length; index += 1) {
  const heading = headings[index];
  const nextLine = index + 1 < headings.length ? headings[index + 1].line : lines.length;
  const bodyLines = lines.slice(heading.line + 1, nextLine);

  if (heading.level === 1) {
    stack = [];
    const familyName = cleanFamilyName(heading.rawTitle);
    if (metaRoots.has(heading.rawTitle) || metaRoots.has(familyName)) {
      currentFamily = null;
      continue;
    }
    const familyMeta = FAMILY_META[familyName] || { zh: '', color: 'muted' };
    currentFamily = {
      id: `f-${heading.line + 1}`,
      name: familyName,
      rawName: heading.rawTitle,
      zh: familyMeta.zh,
      color: familyMeta.color,
      line: heading.line + 1,
      intro: '',
      introSummary: '',
      outline: '',
      entryIds: [],
      childIds: [],
      archive: familyName === '待归档',
    };
    families.push(currentFamily);
    continue;
  }

  if (!currentFamily) continue;

  if (heading.title === '前言') {
    if (!currentFamily.intro) {
      const intro = cleanInline(bodyLines.join('\n'))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      currentFamily.intro = intro;
      currentFamily.introSummary = summarize(intro);
    }
    continue;
  }
  if (heading.title === '大纲') {
    currentFamily.outline = bodyLines.map((line) => cleanInline(line)).filter(Boolean).join('\n');
    continue;
  }

  while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
  const parent = stack.length ? stack[stack.length - 1] : null;
  const parsedTitle = parseEntryTitle(heading.title);
  if (!parsedTitle.title) continue;

  const parsedBody = parseBody(bodyLines);
  const bpm = extractBpm(parsedBody.description);
  const traits = extractTraits(`${parsedTitle.title} ${parsedBody.description}`);
  const stub = parsedBody.description.length < 30 || parsedTitle.status === '待完善';
  const stubReason = stub
    ? /^\(?见/.test(parsedBody.description) && parsedBody.description.length < 60
      ? 'crossref'
      : parsedTitle.status === '待完善'
        ? 'pending'
        : 'empty'
    : null;

  const entry = {
    id: `g-${heading.line + 1}`,
    name: parsedTitle.title,
    rawTitle: heading.rawTitle,
    status: parsedTitle.status,
    group: heading.group,
    familyId: currentFamily.id,
    familyName: currentFamily.name,
    familyZh: currentFamily.zh,
    familyColor: currentFamily.color,
    level: heading.level,
    line: heading.line + 1,
    sourceLine: heading.line + 1,
    parentId: parent ? parent.id : currentFamily.id,
    pathIds: [...stack.map((item) => item.id), `g-${heading.line + 1}`],
    pathNames: [...stack.map((item) => item.name), parsedTitle.title],
    aliases: parsedBody.relations.aliases,
    relations: {
      up: parsedBody.relations.up,
      down: parsedBody.relations.down,
      related: parsedBody.relations.related,
    },
    description: parsedBody.description,
    summary: summarize(parsedBody.description),
    examples: parsedBody.examples,
    bpm,
    traits,
    stub,
    stubReason,
    childrenIds: [],
    backlinks: [],
  };
  entries.push(entry);
  currentFamily.entryIds.push(entry.id);
  if (parent) parent.childrenIds.push(entry.id);
  else currentFamily.childIds.push(entry.id);
  stack.push(entry);
}

const byId = new Map(entries.map((entry) => [entry.id, entry]));
const nameIndex = new Map();
function addName(name, entry) {
  const key = normKey(name);
  if (!key) return;
  if (!nameIndex.has(key)) nameIndex.set(key, []);
  nameIndex.get(key).push(entry);
}
for (const entry of entries) {
  addName(entry.name, entry);
  for (const alias of entry.aliases) addName(alias, entry);
}

function resolveRelation(name, source) {
  const keys = [normKey(name), normKey(name.replace(/[（(].*?[)）]/g, ''))].filter(Boolean);
  const candidates = [];
  for (const key of keys) {
    if (nameIndex.has(key)) candidates.push(...nameIndex.get(key));
  }
  const unique = [...new Map(candidates.map((item) => [item.id, item])).values()].filter(
    (item) => item.id !== source.id
  );
  if (!unique.length) return { name, id: null };
  unique.sort((a, b) => {
    const aFamily = a.familyId === source.familyId ? 1 : 0;
    const bFamily = b.familyId === source.familyId ? 1 : 0;
    return bFamily - aFamily || a.level - b.level || a.line - b.line;
  });
  return { name: unique[0].name, id: unique[0].id };
}

for (const entry of entries) {
  for (const type of ['up', 'down', 'related']) {
    entry.relations[type] = entry.relations[type].map((name) => resolveRelation(name, entry));
  }
}

const backlinkKeys = new Set();
for (const entry of entries) {
  for (const type of ['up', 'down', 'related']) {
    for (const relation of entry.relations[type]) {
      if (!relation.id || !byId.has(relation.id)) continue;
      const key = `${relation.id}|${entry.id}|${type}`;
      if (backlinkKeys.has(key)) continue;
      backlinkKeys.add(key);
      byId.get(relation.id).backlinks.push({
        fromId: entry.id,
        fromName: entry.name,
        type,
      });
    }
  }
}

const uniqueNames = new Map();
for (const entry of entries) {
  const key = normKey(entry.name);
  if (!uniqueNames.has(key)) uniqueNames.set(key, []);
  uniqueNames.get(key).push(entry);
}
const duplicateNames = [...uniqueNames.values()].filter((items) => items.length > 1);

const totalExamples = entries.reduce((sum, entry) => sum + entry.examples.length, 0);
const bpmEntries = entries.filter((entry) => entry.bpm).length;
const relationLinks = entries.reduce(
  (sum, entry) =>
    sum +
    entry.relations.up.length +
    entry.relations.down.length +
    entry.relations.related.length,
  0
);
const unresolvedRelations = entries.flatMap((entry) =>
  ['up', 'down', 'related'].flatMap((type) =>
    entry.relations[type].filter((relation) => !relation.id).map((relation) => relation.name)
  )
);
const activeFamilies = families.filter((family) => !family.archive);

const meta = {
  title: '电音知识库',
  subtitle: 'ELECTRONIC MUSIC FIELD NOTES',
  generatedAt: new Date().toISOString(),
  source: sourceName,
  stats: {
    families: activeFamilies.length,
    archivedFamilies: families.length - activeFamilies.length,
    entries: entries.length,
    activeEntries: entries.filter((entry) => entry.familyName !== '待归档').length,
    archiveEntries: entries.filter((entry) => entry.familyName === '待归档').length,
    stubs: entries.filter((entry) => entry.stub).length,
    examples: totalExamples,
    bpmEntries,
    relationLinks,
  },
  families: families.map((family) => ({
    id: family.id,
    name: family.name,
    zh: family.zh,
    color: family.color,
    archive: family.archive,
    count: family.entryIds.length,
    line: family.line,
    intro: family.intro,
    introSummary: family.introSummary,
    childIds: family.childIds,
  })),
};

const payloadFamilies = families.map((family) => ({
    ...family,
    count: family.entryIds.length,
    intro: family.intro,
    introSummary: family.introSummary,
    outline: undefined,
    entryIds: undefined,
    childIds: family.childIds,
  }));

  return {
    meta,
    families: payloadFamilies,
    entries,
    duplicates: duplicateNames,
    unresolved: [...new Set(unresolvedRelations)],
  };
}

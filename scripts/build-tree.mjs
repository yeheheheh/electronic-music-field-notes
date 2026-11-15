/* ==========================================================================
   生成分支树索引 / BUILD BRANCH TREE INDEX

   输入：data/kb.js（childIds 树）+ data/listen.js（听感）+ data/fingerprints.js（配方）
   输出：data/tree.js

   为什么单独构建而不是运行时算：
   - 树的每次点击下钻都要重渲染，运行时递归 1376 条会拖慢交互
   - 声音解析要查三层（专属 → 同族 → 无声），预解析后渲染只读一个字段
   - 构建期可以把「数据不自洽」变成构建失败，而不是线上空白

   用法：node scripts/build-tree.mjs
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

/* --------------------------------------------------------------------------
   载入数据源
   -------------------------------------------------------------------------- */

function loadWindowGlobal(file, key) {
  const src = fs.readFileSync(path.join(DATA, file), 'utf8');
  const sandbox = { window: {} };
  // 这些数据文件都是 `window.X = {...}` 形式，在隔离的 sandbox 里跑一遍即可，
  // 不必 require（require 会污染真实 global）。
  new Function('window', src)(sandbox.window);
  const value = sandbox.window[key];
  if (!value) throw new Error(`${file} 未导出 ${key}`);
  return value;
}

const KB = loadWindowGlobal('kb.js', 'KB_DATA');
const LISTEN = loadWindowGlobal('listen.js', 'KB_LISTEN');
const FPRINT = loadWindowGlobal('fingerprints.js', 'EM_FINGERPRINTS');

const recipes = FPRINT.recipes || {};
const listenFamilies = LISTEN.families || {};
const listenEntries = LISTEN.entries || {};

/* 速度带中点：把「慢/中/快/极快」换成试听用的 BPM */
const BAND_MID = { slow: 95, mid: 120, fast: 134, xfast: 155 };

const familyById = new Map(KB.families.map((f) => [f.id, f]));
const entryById = new Map(KB.entries.map((e) => [e.id, e]));

/* --------------------------------------------------------------------------
   声音解析：三档覆盖

   1. 专属配方   —— LISTEN.entries[id].fp，92 条被编辑过的风格
   2. 同族回退   —— LISTEN.families[familyId].fp，让其余 1266 条也有声音
   3. 无声       —— 都没有（集中在「待归档」族），前端置灰按钮

   为什么回退按大族而不是按最近的祖先：大族是这个知识库里唯一有编辑保证的
   声音单位。按祖先回退会出现「同一族的两个兄弟听起来完全不同」，反而误导。
   -------------------------------------------------------------------------- */

function resolveSound(entry) {
  const own = listenEntries[entry.id];
  if (own && recipes[own.fp]) {
    return {
      fp: own.fp,
      bpm: Math.round((own.bpm.min + own.bpm.max) / 2),
      scope: 'own',
    };
  }
  const fam = listenFamilies[entry.familyId];
  if (fam && recipes[fam.fp]) {
    return {
      fp: fam.fp,
      bpm: BAND_MID[fam.band] || 120,
      scope: 'fallback',
    };
  }
  return null;
}

function resolveFamilySound(family) {
  const fam = listenFamilies[family.id];
  if (fam && recipes[fam.fp]) {
    return { fp: fam.fp, bpm: BAND_MID[fam.band] || 120, scope: 'family' };
  }
  return null;
}

/* --------------------------------------------------------------------------
   建索引
   -------------------------------------------------------------------------- */

const nodes = {};
const parentOf = new Map();
const problems = [];

function keyOf(kind, id) { return kind + ':' + id; }

/* 子树规模：一次后序遍历算完，避免渲染时反复递归 */
function subtreeSize(id, guard) {
  const entry = entryById.get(id);
  if (!entry) return 0;
  const bag = guard || new Set();
  let total = 0;
  for (const childId of entry.childrenIds) {
    if (bag.has(childId)) {
      problems.push(`环引用：${id} → ${childId}`);
      continue;
    }
    bag.add(childId);
    total += 1 + subtreeSize(childId, bag);
  }
  return total;
}

/* 深度：从大族往下数，大族的直接下级是第 1 层 */
function depthOf(id) {
  let depth = 0;
  let cursor = id;
  const guard = new Set();
  while (cursor) {
    if (guard.has(cursor)) { problems.push(`深度计算遇到环：${id}`); break; }
    guard.add(cursor);
    const parent = parentOf.get(cursor);
    if (!parent) break;
    depth += 1;
    cursor = parent.split(':')[1];
  }
  return depth;
}

let maxDepth = 0;

/* 搜索串规范化 —— 必须和 app.js 的 norm() 完全一致。
   两边不一致的后果：运行期把 "acid house" 压成 "acidhouse"，
   而这里存的是 "acid house"，多词搜索永远命中不了。
   所以这段逻辑是「同一个函数的第二份拷贝」，改动要同步。 */
function normSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\s\-_/·.,，。:：;；!！?？'"“”‘’()（）[\]【】]/g, '')
    .trim();
}

/* 大族节点 */
for (const family of KB.families) {
  const key = keyOf('f', family.id);
  family.childIds.forEach((c) => parentOf.set(c, key));

  const sound = resolveFamilySound(family);
  const children = family.childIds.map((id) => keyOf('e', id));
  const subtree = family.childIds.reduce((sum, id) => sum + 1 + subtreeSize(id), 0);

  nodes[key] = {
    key,
    kind: 'family',
    id: family.id,
    name: family.name,
    zh: family.zh || '',
    color: family.color || 'muted',
    line: family.line,
    group: family.archive ? 'archive' : (family.supplement ? 'supplement' : 'active'),
    intro: family.intro || '',
    count: family.count || 0,
    subtree,
    depth: 0,
    children,
    parent: null,
    sound,
    // 搜索串：名字 + 中文名 + 别名，构建期拼好，运行时只做 includes
    search: normSearch([family.name, family.zh || ''].filter(Boolean).join(' ')),
    // 大族的 relations 是空的，派生关系只落在条目上
    up: [],
    down: [],
    related: [],
  };
}

/* 条目节点 */
for (const entry of KB.entries) {
  const key = keyOf('e', entry.id);
  entry.childrenIds.forEach((c) => parentOf.set(c, key));

  const children = entry.childrenIds.map((id) => keyOf('e', id));
  const depth = depthOf(entry.id);
  if (depth > maxDepth) maxDepth = depth;

  const rel = entry.relations || { up: [], down: [], related: [] };
  /* 派生关系只保留指向本知识库内存在的节点，外部引用会让详情页出现死链 */
  const clean = (list) => (Array.isArray(list) ? list : [])
    .filter((r) => r && r.id && (entryById.has(r.id) || familyById.has(r.id)))
    .map((r) => ({
      id: r.id,
      name: r.name || (entryById.get(r.id) || familyById.get(r.id) || {}).name || r.id,
      key: entryById.has(r.id) ? keyOf('e', r.id) : keyOf('f', r.id),
      /* 跨族标记：详情页要区分「同族内」和「跨族」的派生 */
      crossFamily: entryById.has(r.id)
        ? entryById.get(r.id).familyId !== entry.familyId
        : true,
    }));

  nodes[key] = {
    key,
    kind: 'entry',
    id: entry.id,
    name: entry.name,
    zh: '',
    color: entry.familyColor || 'muted',
    line: entry.line,
    familyId: entry.familyId,
    familyName: entry.familyName,
    familyZh: entry.familyZh || '',
    // 搜索结果里显示的来路。pathNames 是 kb 里现成的祖先名链，
    // 有它才能区分「House 下的 Deep House」和别处同名的条目。
    pathLabel: (entry.pathNames && entry.pathNames.length > 1
      ? entry.pathNames.slice(1).join(' › ')
      : (entry.familyName || '')),
    group: 'entry',
    // description 不收：它占整份索引的 24%，而树页只读 summary，
    // 完整正文在条目页（#/genre/:id）那边有。重复一份等于让首屏多下 380KB。
    summary: entry.summary || '',
    examples: (entry.examples || []).slice(0, 6).map((x) => ({
      title: x.title || '', artist: x.artist || '', year: x.year || '',
    })),
    bpm: entry.bpm || null,
    traits: entry.traits || [],
    stub: Boolean(entry.stub),
    // 搜索串：名字 + 别名 + 大族名。别名必须进搜索 ——
    // 「Chicago House」有「芝加哥浩室」这类叫法，搜不到就等于资料白存。
    search: normSearch([entry.name, ...(entry.aliases || []), entry.familyName || '']
      .filter(Boolean).join(' ')),
    children,
    parent: parentOf.get(entry.id) || null,
    subtree: subtreeSize(entry.id),
    depth,
    sound: resolveSound(entry),
    up: clean(rel.up),
    down: clean(rel.down),
    related: clean(rel.related),
  };
}

/* --------------------------------------------------------------------------
   自检：数据不自洽就在构建期失败，不要留到线上
   -------------------------------------------------------------------------- */

const entryKeys = Object.keys(nodes);
let branches = 0; let leaves = 0;
let withOwn = 0; let withFallback = 0; let silent = 0;

for (const key of entryKeys) {
  const node = nodes[key];
  if (node.children.length) branches += 1; else leaves += 1;
  if (node.sound) {
    if (node.sound.scope === 'own' || node.sound.scope === 'family') withOwn += 1;
    else withFallback += 1;
  } else silent += 1;

  /* 每个子节点都必须能被父节点找到，否则列式树会断链 */
  for (const childKey of node.children) {
    if (!nodes[childKey]) problems.push(`断链：${key} 的子节点 ${childKey} 不存在`);
  }
  /* 父指针必须能回到根，否则面包屑拼不出路径 */
  if (node.kind === 'entry' && !node.parent) problems.push(`孤儿条目：${key}`);
}

if (problems.length) {
  console.error('构建失败，数据不自洽：');
  for (const p of problems.slice(0, 20)) console.error('  - ' + p);
  if (problems.length > 20) console.error(`  ...另有 ${problems.length - 20} 条`);
  process.exit(1);
}

/* --------------------------------------------------------------------------
   输出
   -------------------------------------------------------------------------- */

const groups = [];
const activeFamilies = KB.families.filter((f) => !f.archive && !f.supplement);
const supplementFamilies = KB.families.filter((f) => f.supplement);
const archiveFamilies = KB.families.filter((f) => f.archive);

groups.push({ id: 'active', label: '正式大族', roots: activeFamilies.map((f) => keyOf('f', f.id)) });
if (supplementFamilies.length) {
  groups.push({ id: 'supplement', label: '补充收纳桶', roots: supplementFamilies.map((f) => keyOf('f', f.id)) });
}
if (archiveFamilies.length) {
  groups.push({ id: 'archive', label: '待归档', roots: archiveFamilies.map((f) => keyOf('f', f.id)) });
}

const out = {
  version: 1,
  builtAt: KB.meta?.generatedAt || new Date().toISOString(),
  groups,
  roots: groups.flatMap((g) => g.roots),
  nodes,
  stats: {
    nodes: entryKeys.length,
    branches,
    leaves,
    withOwnSound: withOwn,
    withFallback,
    silent,
    maxDepth,
  },
};

const banner = `/* ==========================================================================
   分支树索引 / BRANCH TREE INDEX  —— 生成物，请勿手改

   由 scripts/build-tree.mjs 从 kb.js + listen.js + fingerprints.js 生成。
   重新生成：node scripts/build-tree.mjs

   结构：nodes[key] 里每个节点自带 children / parent / subtree / sound / 派生关系，
   前端渲染一列只读一层，不需要递归整棵树。
   ========================================================================== */

window.KB_TREE = `;

fs.writeFileSync(path.join(DATA, 'tree.js'), banner + JSON.stringify(out) + ';\n', 'utf8');

console.log('分支树索引已生成 data/tree.js');
console.log(`  节点 ${out.stats.nodes}（分支 ${branches} / 叶子 ${leaves}）`);
console.log(`  声音：专属+同族 ${withOwn} · 回退 ${withFallback} · 无声 ${silent}`);
console.log(`  最大深度 ${maxDepth} · 分组 ${groups.length}（${groups.map((g) => g.label + ' ' + g.roots.length).join(' / ')}）`);

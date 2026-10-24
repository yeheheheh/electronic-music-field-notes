// 一次性脚本：为 curated.json 补充新大族配套的精编内容。
// 用法：node scripts/expand-curated.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'kb-module', 'inputs', 'curated.json');
const c = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// 1) 新增来源：Electronic Music Wiki
if (!c.sources.some((s) => /Electronic Music Wiki/i.test(s.title))) {
  c.sources.push({
    title: 'Electronic Music Wiki / List of Genres',
    type: 'Wiki 分类体系 / 外部参照',
    author: 'Fandom 社区协作编辑',
    url: 'https://electronicmusic.fandom.com/wiki/List_of_Genres',
    note: '2026-10 参照。用于校对本知识库在顶层分类上的覆盖度（26 个分类、约 500 个风格名），以及补齐本地此前未展开的分支。该 Wiki 条目多为短条目，且大量参考 RYM 与 Wikipedia；本地只采用其中可交叉验证的听辨特征，不直接搬运原文。',
    licenseNote: 'Wiki 内容多为 CC-BY-SA；本知识库只作分类参照与覆盖度校对，不复制原文段落。',
  });
}

// 2) 听辨练习
const newPractice = [
  {
    title: '先听低频属于哪一族',
    body: 'Bass / Club、Funk、R&B 三族的区别不在速度，而在低频的动作。Funk 的低音是短促的、带切分的、和人声互相咬合的；Bass / Club 的低音是持续的、占满整拍的、几乎不给人声留空间；R&B 的低音通常托住人声，力度柔和不抢戏。选三首同 BPM 的歌，只听低频，判断它在说话还是在推人。',
  },
  {
    title: '用有没有副歌区分电子流行与舞曲',
    body: 'Electronic Pop 与 EDM 的分界线是高潮在哪里。电子流行的最高点通常是一段歌手唱出来的副歌；EDM 的最高点通常是一段没有人声的器乐 Drop。拿一首 House-Pop 和一首 Bigroom 对比，注意人声在最高点的位置——前者仍在唱，后者通常已经退出。',
  },
  {
    title: '在 Chiptune 里数通道',
    body: 'Chiptune 的编配受硬件通道数限制（如 NES 的 2A03 只有五个通道）。听的时候试着数：同时最多有几条声部在响？如果和弦听起来是快速抖动的单音而不是同时发声，那就是琶音器在模拟和弦——这是芯片音乐最明确的指纹。',
  },
  {
    title: 'Remix 与 Edit 听改动幅度',
    body: '同一首歌找三个版本：原曲、Edit、Remix。Edit 只改动结构与低频，原曲的身份完全保留；Remix 通常替换掉鼓组、低音与和声，只留人声；Bootleg 在技术上与 Remix 相同，区别只在是否获得授权。用如果去掉人声还剩多少原曲来判断改动幅度。',
  },
];
for (const item of newPractice) {
  if (!c.listen.practice.some((p) => p.title === item.title)) c.listen.practice.push(item);
}

// 3) 易混点
const newConfusions = [
  {
    title: 'Hyperpop 不是一种音色，是一种处理强度。',
    body: 'Hyperpop 的定义不在用哪些音色，而在每个元素都被推到失真。同样使用合成器与鼓机，Hyperpop 会把人声极端升调、把鼓组爆音当打击乐、把副歌压缩到几秒；而 Electropop 只是把电子音色放进流行歌。判断标准是有没有哪个元素被故意做得过分。',
  },
  {
    title: 'Funk 与 Disco 的低频分工不同。',
    body: '两者都是四四拍、都强调舞池，但 Funk 的贝斯是旋律性的打击乐——大量十六分音符、断奏、与人声互答；Disco 的贝斯更连续、更少切分，通常配合弦乐与 Hi-hat 的四分音符推进。听的时候注意贝斯是在说话还是在铺底。',
  },
  {
    title: 'Chiptune 与 Bit Music 不是同义词。',
    body: 'Bit Music 是上位概念，涵盖所有由声音芯片或音序器创作的音乐（含 FM Synthesis、Tracker Music、Game Boy Music）；Chiptune 特指其中以方波与噪声通道为核心的 8-bit 形态。所有 Chiptune 都属于 Bit Music，但 FM Synthesis 与 Tracker Music 不属于 Chiptune。',
  },
  {
    title: 'Nightcore 是手法，不是风格。',
    body: 'Nightcore 只描述加速加升调这一处理，原曲可以是 Eurodance、Trance、流行甚至摇滚。因此一首歌是不是 Nightcore 取决于有没有被这样处理，而不取决于它原本是什么风格。同理，Daycore 是反向处理。',
  },
  {
    title: '同名不同族是常态，不是资料错误。',
    body: '本地分类库里有 70 多组同名条目，例如 Hard House 在英式 Hard Dance 与芝加哥 House 中是两种音乐，Deep Trance 与 Dark Ambient 各自出现在多个大族下。判断时永远先看大族与路径，再看条目名——条目名只在本族内有意义。',
  },
];
for (const item of newConfusions) {
  if (!c.listen.confusions.some((p) => p.title === item.title)) c.listen.confusions.push(item);
}

// 4) 听辨坐标
const newCoords = [
  {
    label: 'LOW-END',
    title: '低频怎么动，决定了这一族怎么听',
    body: 'Funk 的低频是短促、切分、带休止的，像打击乐；House 的低频是稳定推进的四分音符，托着整个律动；Trap 的 808 是一条长长的滑音，占满整拍；Drum & Bass 的低频是持续的低沉嗡鸣，速度感来自鼓组而非低音。先判断低频是点还是线，能一下子缩小范围。',
  },
  {
    label: 'VOCAL',
    title: '人声被怎么处理，比唱了什么更有信息',
    body: 'R&B 的人声是主角，被多层叠加、精细压缩、放在混音最前；Chillwave 的人声被埋进混响深处，歌词几乎听不清；Hyperpop 的人声被升调、切片、失真到失去自然感；Chiptune 的人声常被做成极短采样或干脆没有。听人声的存在方式，比听旋律更快分辨风格。',
  },
  {
    label: 'SPEED',
    title: '同一速度可以完全不像同一首歌',
    body: '140 BPM 可以是 Trap（Half-time，听感像70）、Psytrance（全速推进），也可以是 Bigroom（每拍一击）。速度只是网格，真正决定听感的是 Kick 落在哪里、Hi-hat 做什么、以及低频是点还是线。判断速度时永远要问我数的是 Kick 还是 Hi-hat。',
  },
];
for (const item of newCoords) {
  if (!c.coordinates.some((p) => p.label === item.label)) c.coordinates.push(item);
}

// 5) 使用说明补一条（新增来源与覆盖度）
const usageNote = '本知识库在 2026-10 参照 Electronic Music Wiki 的分类体系做了覆盖度校对：顶层分类从 16 个活跃大族扩展到 29 个，条目从 1205 增至 1376。新增内容按本地既有格式书写，不搬运外部原文。';
if (!c.usage.some((u) => u.includes('Electronic Music Wiki'))) c.usage.push(usageNote);

c.updated = '2026-10-24';
fs.writeFileSync(FILE, `${JSON.stringify(c, null, 2)}\n`, 'utf8');

console.log('已更新 curated.json');
console.log(`sources ${c.sources.length} · practice ${c.listen.practice.length} · confusions ${c.listen.confusions.length} · coordinates ${c.coordinates.length} · usage ${c.usage.length}`);

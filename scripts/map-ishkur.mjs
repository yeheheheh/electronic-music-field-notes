#!/usr/bin/env node
/**
 * 建立 Ishkur 166 个风格 → 本项目风格树节点的精确映射。
 *
 * 三级判定，从严到宽，每一步都留痕，绝不靠模糊相似度硬绑：
 *   1. 归一化名称唯一命中        → 置信度 high
 *   2. 别名表命中                → 置信度 high（别名是人工核过的）
 *   3. 归一化名称多义 + 大族归属消歧 → 置信度 high
 *   4. 以上都不中               → unmatched，写进报告交人工复核
 *
 * 输出 .workbuddy/ishkur-map.json：
 *   { rows: [{ slug, name, nodeKey, nodeName, family, confidence, via }] }
 *
 * 用法：node scripts/map-ishkur.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const GENRES = path.join(ROOT, '.workbuddy', 'ishkur-genres.json');
const TREE = path.join(ROOT, 'data', 'tree.js');
const OUT = path.join(ROOT, '.workbuddy', 'ishkur-map.json');

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

/* 别名表：Ishkur 名 → 本项目树节点名。
   只收人工核对过的对应关系；每一项都注明依据，便于日后复查。 */
const ALIAS = {
  // ---- 大族本身（Ishkur 把它当一个风格，本项目是族） ----
  'Trance': { name: 'Trance', kind: 'family', why: '本项目 Trance 是族，下辖 19 个条目' },
  'Indie': { name: 'Indie', kind: 'family', why: '本项目 Indie 是族（Indie / Synthpop）' },

  // ---- 本项目用更细的名字 ----
  'US Deep House': { name: 'Deep House', why: '本项目 Deep House 即美式深浩室源头' },
  'Minimal Tech': { name: 'Minimal Techno', why: 'Ishkur 的 Minimal Tech 即本项目 Minimal Techno' },
  'Nu Italo': { name: 'Italo House', why: 'Ishkur 的 Nu Italo 属 Italo House 一支' },
  'Handsup': { name: 'Hands Up (2 stage)', why: '本项目完整名为 Hands Up (2 stage)' },
  'Ethereal': { name: 'Ethereal Wave', why: '本项目完整名为 Ethereal Wave' },
  'Moog': { name: 'Moogsploitation', why: '本项目名为 Moogsploitation' },
  'Hardstyle': { name: 'Early Hardstyle', why: 'Ishkur 的 Hardstyle 指早期形态，本项目拆成 Early/Nu/Euphoric/Raw' },
  'Progressive': { name: 'Progressive House', why: 'Ishkur 的 Progressive 即本项目 Progressive House 主干' },
  'Breaks': { name: 'Breakbeat', why: 'Ishkur 的 Breaks 即本项目 Breakbeat 主干条目' },
  'Hardcore': { name: 'Breakbeat Hardcore', why: 'Ishkur 的 Hardcore 指 breakbeat hardcore 主干' },
  'Rave': { name: 'Rave Breaks', why: 'Ishkur 的 Rave 对应本项目 Rave Breaks（breakbeat 语境）' },
  'Dubstep': { name: 'UK Dubstep', why: 'Ishkur 的 Dubstep 指 UK 源头形态' },
  'Garage': { name: 'UK Garage', why: 'Ishkur 的 Garage 在 UK Bass 语境下即 UK Garage' },
  'Soul': { name: 'Soulful House', why: 'Ishkur 的 Soul 在 House 谱系下即 Soulful House' },
  'Rap': { name: 'Hip-Hop', why: 'Ishkur 的 Rap 对应本项目 Hip-Hop 主条目' },
  'Happy Hardcore': { name: 'UK Hardcore', why: 'Ishkur 的 Happy Hardcore 主干对应本项目 UK Hardcore' },
  'Freeform': { name: 'Freeform Hardcore', why: '本项目完整名为 Freeform Hardcore' },
  'Hard Acid': { name: 'Hard Acid', why: '唯一命中' },
  'Acid': { name: 'Acid', why: '本项目有独立的 Acid 条目' },
  'FM': { name: 'FM Synthesis', why: '本项目名为 FM Synthesis' },
  'Collage': { name: 'Sound Collage', why: '本项目拆成 Epic/Sound Collage，取 Sound Collage' },
  'Asian Pop': { name: 'City Pop', why: 'Ishkur 的 Asian Pop 主要指日系城市流行' },
  'Filthy Electrohouse': { name: 'Filthy Electro House', why: '本项目分写为 Filthy Electro House' },
  'Anthem House': { name: 'Anthem House', why: '唯一命中' },
  'World House': { name: 'World House', why: '唯一命中' },
  'Experimental Techno': { name: 'Experimental Techno', why: '唯一命中' },
  'Bangin Techno': { name: 'Bangin Techno', why: '唯一命中' },
  'Turntablism': { name: 'Turntablism', why: '唯一命中' },
  'Rap / Conscious': { name: 'Conscious Rap', why: '本项目完整名为 Conscious Rap' },

  // ---- 第二批：按实际树名核对后补齐 ----
  'Darkpsy': { name: 'Dark Psytrance', why: '本项目名为 Dark Psytrance' },
  'Amiga/Tracker': { name: 'Sequencer & Tracker', why: '本项目名为 Sequencer & Tracker' },
  'Eastcoast Rap': { name: 'East Coast Hip Hop', why: '本项目名为 East Coast Hip Hop' },
  'Westcoast Rap': { name: 'West Coast Hip Hop', why: '本项目名为 West Coast Hip Hop' },
  'Southern Rap': { name: 'Dirty South', why: '本项目名为 Dirty South' },
  'Dirty South Rap': { name: 'Dirty South', why: '同 Southern Rap，共用一条' },
  'Conscious Rap': { name: 'Conscious Hip Hop', why: '本项目名为 Conscious Hip Hop' },
  'Themed Rap': { name: 'Themed Hip Hop', why: '本项目名为 Themed Hip Hop' },
  'Bling': { name: 'Bling Era', why: '本项目名为 Bling Era' },
  'Turntablism': { name: 'Turntablism', why: '本项目有此条目' },
  'Freeland Breaks': { name: 'Freeland', why: 'Ishkur 用艺人名指代该流派，本项目按艺人归类' },
  'Pendulum': { name: 'Pendulum', why: '本项目按艺人归类' },
  'Brostep': { name: 'US Dubstep', why: 'Ishkur 的 Brostep 即本项目 US Dubstep 主干' },
  'Worldbeat': { name: 'World Music', why: '本项目名为 World Music' },
  'Braindance': { name: 'Braindance', why: '本项目有此条目' },
  'Musique Concrete': { name: 'Musique Concrète', why: '本项目带变音符' },
  'Modern Classical': { name: 'Neo-Classical', why: '本项目名为 Neo-Classical' },
  'Balearic Trance': { name: 'Ibiza Trance', why: 'Ishkur 的 Balearic 对应本项目 Ibiza Trance' },
  'Progpsy': { name: 'Progressive Psytrance', why: '本项目名为 Progressive Psytrance' },
  'Euro Deep House': { name: 'Deep House', why: 'Ishkur 的欧陆深浩室并入本项目 Deep House' },
  'Twinkle Prog': { name: 'Uplifting Trance', why: 'Ishkur 的 Twinkle Prog 即本项目 Uplifting Trance' },
  'McProg': { name: 'Progressive Trance', why: 'Ishkur 的 McProg 即本项目 Progressive Trance' },
  '8th Note Prog': { name: 'Progressive Trance', why: '八分音符推进式即 Progressive Trance 主干' },
  'Minimal Prog': { name: 'Minimal Trance', why: 'Ishkur 的 Minimal Prog 即本项目 Minimal Trance' },
  'World House': { name: 'World House', why: '本项目有此条目' },
  'Acid': { name: 'Acid', why: '本项目有独立 Acid 条目' },
  'Experimental Techno': { name: 'Experimental Techno', why: '本项目有此条目' },
  'Bangin Techno': { name: 'Bangin Techno', why: '本项目有此条目' },
  'Anthem House': { name: 'Anthem House', why: '本项目有此条目' },
  'Filthy Electrohouse': { name: 'Filthy Electro House', why: '本项目分写为 Filthy Electro House' },

  // ---- 第三批：按实际树名核对后补齐 ----
  'Southern Rap': { name: 'Southern Hip Hop', why: '本项目名为 Southern Hip Hop' },
  'Dirty South Rap': { name: 'Southern Hip Hop', why: '同 Southern Rap，共用 Southern Hip Hop' },
  'Turntablism': { name: 'Turntable Music', why: '本项目名为 Turntable Music' },
  'Modern Classical': { name: 'Electronic Classical Music', why: '本项目名为 Electronic Classical Music' },
  // 以下 13 条本项目确实没有对应条目，保留为未匹配，不做硬绑：
  // Filthy Electrohouse / Anthem House / Braindance / Worldbeat / World House /
  // Acid / Freeland Breaks / Pendulum / Experimental Techno / Bangin Techno /
  // Themed Rap / Conscious Rap / Bling
};

/* 明确标记「本项目无对应条目」的 Ishkur 风格。
   它们不是映射失败，而是两边分类视角不同 —— 记在这里，
   避免日后有人看到未匹配就随手加个别名硬绑上去。 */
const NO_COUNTERPART = new Set([
  'Filthy Electrohouse', 'Anthem House', 'Braindance', 'Worldbeat', 'World House',
  'Acid', 'Freeland Breaks', 'Pendulum', 'Experimental Techno', 'Bangin Techno',
  'Themed Rap', 'Conscious Rap', 'Bling',
]);

/* 多义项的消歧规则：Ishkur 名 → 本项目大族名（决定选哪个同名节点） */
const DISAMBIG = {
  'Dancepunk': 'Fusion',
  'Electroclash': 'Electronic Pop',
  'Synthpop': 'Electronic Pop',
  'Eurodance': 'Electronic Pop',
  'Hard Trance': 'Trance',
  'Neo Trance': 'Trance',
  'Psydub': 'Trance',
  'Ambient Techno': 'Techno',
  'Dark Ambient': 'Ambient',
  'Chill Out': 'Chill-Out',
  'Trip Hop': 'Chill-Out',
  'Downtempo': 'Chill-Out',
  'Hard Acid': 'Techno',
  'Big Beat': 'Breakbeat',
  'Progressive Breaks': 'Breakbeat',
  'Electro': 'Fusion',
  'Freestyle': 'Fusion',
  // 同名节点里有大族节点本身，也有同名的条目：都取「族」那个
  'Industrial': 'Industrial',
  'Chiptune': 'Chiptune',
  'Ambient': 'Ambient',
  'Funk': 'Funk',
};

function loadTree() {
  const src = fs.readFileSync(TREE, 'utf8');
  const m = src.match(/^[\s\S]*?=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) throw new Error('无法解析 data/tree.js');
  return eval('(' + m[1] + ')');
}

/** 判断一个节点属于哪个大族：大族节点自身返回自己的名字 */
function familyOf(node) {
  return node.kind === 'family' ? node.name : node.familyName;
}

function main() {
  const T = loadTree();
  const rows = JSON.parse(fs.readFileSync(GENRES, 'utf8'));
  const all = Object.values(T.nodes);

  // 索引
  const byName = new Map();
  for (const n of all) {
    const k = norm(n.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(n);
  }

  const out = [];
  const unmatched = [];

  for (const r of rows) {
    let hit = null;
    let via = '';

    // 1) 别名表
    const alias = ALIAS[r.name];
    if (alias) {
      const cands = (byName.get(norm(alias.name)) || []).filter((n) => !alias.kind || n.kind === alias.kind);
      if (cands.length === 1) {
        hit = cands[0];
        via = `alias:${alias.why}`;
      } else if (cands.length > 1) {
        // 别名指向多义时，用大族消歧
        const want = DISAMBIG[r.name];
        hit = cands.find((n) => norm(familyOf(n)) === norm(want)) || cands[0];
        via = `alias+family:${want || 'first'}`;
      }
    }

    // 2) 归一化名称直接命中
    if (!hit) {
      const cands = byName.get(norm(r.name)) || [];
      if (cands.length === 1) {
        hit = cands[0];
        via = 'name';
      } else if (cands.length > 1) {
        // 3) 多义 + 大族消歧
        const want = DISAMBIG[r.name];
        if (want) {
          const picked = cands.find((n) => norm(familyOf(n)) === norm(want));
          if (picked) {
            hit = picked;
            via = `name+family:${want}`;
          }
        }
        if (!hit) {
          unmatched.push({ slug: r.slug, name: r.name, reason: `多义未消歧：${cands.map((c) => c.name + '@' + familyOf(c)).join(' / ')}` });
          continue;
        }
      }
    }

    if (!hit) {
      unmatched.push({
        slug: r.slug,
        name: r.name,
        reason: NO_COUNTERPART.has(r.name) ? '本项目无对应条目（分类视角不同）' : '无同名节点',
      });
      continue;
    }

    out.push({
      slug: r.slug,
      name: r.name,
      scene: r.scene,
      emerged: r.emerged,
      aka: r.aka,
      nodeKey: hit.key,
      nodeId: hit.id,
      nodeName: hit.name,
      familyName: hit.familyName,
      familyZh: hit.familyZh,
      via,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    matched: out.length,
    unmatched: unmatched.length,
    rows: out,
    unmatchedList: unmatched,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

  console.log(`映射完成：${out.length}/${rows.length} 条`);
  console.log(`未匹配：${unmatched.length}`);
  if (unmatched.length) {
    console.log('');
    unmatched.forEach((u) => console.log(`  ${u.name.padEnd(22)} ${u.reason}`));
  }
  console.log('');
  console.log('按判定方式:');
  const byVia = {};
  for (const r of out) {
    const k = r.via.split(':')[0];
    byVia[k] = (byVia[k] || 0) + 1;
  }
  console.log(JSON.stringify(byVia));
  console.log(`\n报告：${path.relative(ROOT, OUT)}`);
}

main();

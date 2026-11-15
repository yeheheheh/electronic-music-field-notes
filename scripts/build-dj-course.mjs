// 生成网页层的 DJ 课程元数据。
// 正文不复制到前端：课程页直接读取 data/web.js 里 type=transcript 的分块。
// 用法：node scripts/build-dj-course.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = path.join(ROOT, 'sources', 'dj-course', 'episodes.json');
const NOTES_DIR = path.join(ROOT, 'sources', 'dj-course', 'notes');
const OUTPUT = path.join(ROOT, 'data', 'dj-course.js');

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
function displayTitle(value) {
  let text = String(value || '')
    .replace(/^\s*\d+(?:\.\d+)?[.、．]?\s*/, '')
    .replace(/^[-—–\s]+/, '');
  text = text.replace(/-/, '：');
  text = text.replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
  text = text.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2');
  return text.replace(/\s+/g, ' ').trim();
}

const chapters = new Map((data.chapters || []).map((chapter) => [chapter.id, chapter]));
const episodes = (data.episodes || []).map((episode) => {
  const id = String(episode.page).padStart(2, '0');
  const sourceId = `bilibili-dj-${id}`;
  const chapter = chapters.get(episode.chapter);
  if (!chapter) throw new Error(`episode ${id} has unknown chapter ${episode.chapter}`);
  const notePath = path.join(NOTES_DIR, `ep${id}.md`);
  const hasNote = fs.existsSync(notePath) && fs.statSync(notePath).size > 40;
  return {
    id,
    page: episode.page,
    cid: episode.cid,
    title: episode.title,
    displayTitle: displayTitle(episode.title),
    summary: episode.summary,
    duration: episode.duration,
    chapterId: episode.chapter,
    chapterIndex: chapter.index,
    sourceId,
    url: `${data.url}?p=${episode.page}`,
    hasNote,
  };
});

const payload = {
  version: '1.0.0',
  id: data.id,
  title: data.title,
  subtitle: data.subtitle,
  author: data.author,
  bvid: data.bvid,
  url: data.url,
  licenseNote: data.licenseNote,
  asrNote: data.asrNote,
  builtAt: data.builtAt,
  episodeCount: episodes.length,
  totalDuration: episodes.reduce((sum, episode) => sum + episode.duration, 0),
  chapters: (data.chapters || []).map((chapter) => ({
    id: chapter.id,
    index: chapter.index,
    title: chapter.title,
    subtitle: chapter.subtitle,
    guideId: chapter.guideId || null,
    keywords: chapter.keywords || [],
    episodeIds: episodes.filter((episode) => episode.chapterId === chapter.id).map((episode) => episode.id),
  })),
  episodes,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `window.EM_DJ_COURSE = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');

const missing = episodes.filter((episode) => !episode.hasNote);
console.log(`DJ 课程数据：${episodes.length} 集 · ${payload.chapters.length} 章 · ${Math.round(payload.totalDuration / 60)} 分钟`);
if (missing.length) console.warn(`缺少知识笔记：${missing.map((episode) => episode.id).join(', ')}`);

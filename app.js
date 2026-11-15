(() => {
  const KB = window.KB_DATA;
  const CUR = window.KB_CURATED;
  const DJ_COURSE = window.EM_DJ_COURSE || null;
  const START = window.EM_START || { paths: [], plan: [], fieldGuide: { sections: [] } };

  // 留空则不渲染，避免上线前出现死链。
  const SUPPORT_LINKS = {
    afdian: '',
    github: '',
    gumroad: '',
  };

  if (!KB || !CUR) {
    document.getElementById('main').innerHTML = '<p style="padding:48px 0">数据未加载。请确认 data/kb.js 与 data/curated.js 存在。</p>';
    return;
  }

  const familyById = new Map(KB.families.map((family) => [family.id, family]));
  const entryById = new Map(KB.entries.map((entry) => [entry.id, entry]));
  const curatedById = new Map(CUR.tenStyles.map((style) => [style.id, style]));
  const familyEntries = new Map();
  for (const family of KB.families) familyEntries.set(family.id, []);
  for (const entry of KB.entries) {
    if (!familyEntries.has(entry.familyId)) familyEntries.set(entry.familyId, []);
    familyEntries.get(entry.familyId).push(entry);
  }
  for (const list of familyEntries.values()) list.sort((a, b) => a.line - b.line);

  const familyByName = new Map();
  for (const family of KB.families) {
    familyByName.set(norm(family.name), family);
    if (family.zh) familyByName.set(norm(family.zh), family);
  }

  const familyAliases = new Map([
    ['techno', 'Techno'],
    ['house', 'House'],
    ['trance', 'Trance'],
    ['disco', 'Disco / Hi-NRG'],
    ['disco house', 'House'],
    ['industrial music', 'Industrial'],
    ['ambient', 'Ambient'],
    ['breakbeat', 'Breakbeat'],
    ['dubstep', 'US Bass'],
    ['uk dubstep', 'UK Bass'],
    ['hardcore', 'HDM'],
    ['hard dance', 'HDM'],
  ]);

  // 三个字母的代号。兜底逻辑是 `name.slice(0, 3).toUpperCase()`，对中文名会切出
  // 「实验电」这种半个词，对带斜杠或 & 的名字还会切出标点，所以每个会出现在界面上的
  // 大族都必须显式登记。代号只在柱子够宽时才画出来，但窄屏隐藏不等于可以不写
  // ——桌面端它是可见的，图谱页的大族卡片也会用到。
  //
  // 覆盖范围：全部正式大族（`!archive && !supplement`，当前 24 个）必须齐全；
  // 补遗收纳桶（`supplement`，当前 5 个）用 X 前缀，与正式大族区分开。
  const FAMILY_CODES = {
    House: 'HOU',
    Techno: 'TEC',
    Trance: 'TRA',
    Breakbeat: 'BRK',
    'UK Bass': 'UKB',
    'US Bass': 'USB',
    HDM: 'HDM',
    'Hip-Hop / Trap / Future Bass': 'HHT',
    'Disco / Hi-NRG': 'DIS',
    Ambient: 'AMB',
    Indie: 'IND',
    'Post-Internet': 'PST',
    Industrial: 'IDU',
    '早期流派 / 手法 / 理念': 'EAR',
    Ethnic: 'ETH',
    Fusion: 'FUS',
    '待归档': 'ARC',
    // 2026-10 扩充新增的正式大族
    'Electronic Pop': 'EPO',
    'R&B / Rhythm and Blues': 'RNB',
    'Electronic Rock': 'ERK',
    Funk: 'FNK',
    'Chill-Out': 'CHL',
    'Bass / Club': 'BCL',
    Chiptune: 'CHP',
    'Remix & Edit': 'RMX',
    // 补遗收纳桶：编辑性分组，不是音乐分类，故与正式大族在命名上区分
    实验电子补遗: 'XEL',
    风格补遗: 'XGN',
    'Hard Dance 补遗': 'XHD',
    摇滚与极端风格补遗: 'XRK',
    'Reggae 补遗': 'XRG',
  };

  const NAV = [
    {
      href: '#/archive',
      label: '档案',
      icon: 'library',
      desc: '完整目录：风格、学习、工具与来源',
      match: (path) => path === '/archive',
    },
    {
      href: '#/tree',
      label: '树',
      icon: 'atlas',
      desc: '按风格分类逐级展开，点开就听',
      // /listen 与 /quick 仍算在「树」下：老链接会重定向过来，
      // 高亮不该在跳转途中闪一下再落到别的 tab 上。
      match: (path) => path === '/tree' || path === '/listen' || path === '/quick' || path.startsWith('/card/'),
    },
    {
      href: '#/library',
      label: '查',
      icon: 'library',
      desc: '知识库、图谱、全库检索',
      match: (path) =>
        path === '/library' ||
        path === '/search' ||
        path === '/atlas' ||
        path.startsWith('/doc/') ||
        path.startsWith('/family/') ||
        path.startsWith('/genre/') ||
        path.startsWith('/guide/'),
    },
    {
      href: '#/practice',
      label: '练',
      icon: 'practice',
      desc: '听辨、BPM 估速、识曲',
      match: (path) => path === '/practice' || path === '/identify',
    },
    {
      href: '#/learn',
      label: '做',
      icon: 'course',
      desc: '22 节制作课与九个工作室模块',
      match: (path) => path === '/learn' || path.startsWith('/learn/') || path === '/studio' || path === '/lab' || path === '/start',
    },
    {
      href: '#/dj',
      label: 'DJ',
      icon: 'lab',
      desc: '过渡检查、自动接歌与现场手册',
      match: (path) => path === '/dj' || path.startsWith('/dj/'),
    },
  ];

  // Icons are drawn from hardware, not from a generic UI set:
  // step sequences, a record, a patch graph, a waveform, and a fader bank.
  const ICONS = {
    listen: '<path d="M4 12h2.4M9 7.4v9.2M13.6 4.6v14.8M18.2 9.2v5.6M22 11.2v1.6"/>',
    course: '<path d="M3 9.4h3.3V19H3zM8.2 5.2h3.3V19H8.2zM13.4 11.6h3.3V19h-3.4zM18.6 7.8H21V19h-2.4z" fill="currentColor" stroke="none"/>',
    library: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M12 3.6a8.4 8.4 0 0 1 8.4 8.4"/>',
    atlas: '<circle cx="6" cy="7" r="2.5" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="2.5" fill="currentColor" stroke="none"/><path d="M8.2 8.3 10.7 15.3M15.7 8.1 13.3 15.3M8.5 7h7"/>',
    practice: '<path d="M3 12h2.2M7 8.4v7.2M10.4 5.2v13.6M13.8 9v6M17.2 6.2v11.6M20.8 10.4v3.2"/>',
    lab: '<path d="M6 3.6v16.8M12 3.6v16.8M18 3.6v16.8"/><rect x="3.5" y="9" width="5" height="3.4" fill="currentColor" stroke="none"/><rect x="9.5" y="14.2" width="5" height="3.4" fill="currentColor" stroke="none"/><rect x="15.5" y="6.4" width="5" height="3.4" fill="currentColor" stroke="none"/>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="7" y="7" width="10" height="10" fill="currentColor" stroke="none"/>',
    check: '<path d="m5 12.4 4.4 4.4L19 6.8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M6 18 18 6M9 6h9v9"/>',
    arrowLeft: '<path d="M18 6 6 18M15 18H6V9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    source: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h4"/>',
    wave: '<path d="M2.5 12h2M7 7v10M11 4v16M15 8.5v7M19 10.5v3M21.5 12h0"/>',
    solo: '<path d="M12 3.5 5 9v5.5L12 20l7-5.5V9z"/><circle cx="12" cy="11.5" r="2.4" fill="currentColor" stroke="none"/>',
    reset: '<path d="M4 10a8 8 0 1 1 2.6 7.4"/><path d="M4 4.5V10h5.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    studio: '<rect x="3.4" y="3.8" width="4.3" height="4.3" fill="currentColor" stroke="none"/><rect x="9.85" y="3.8" width="4.3" height="4.3"/><rect x="16.3" y="3.8" width="4.3" height="4.3" fill="currentColor" stroke="none"/><rect x="3.4" y="10.25" width="4.3" height="4.3"/><rect x="9.85" y="10.25" width="4.3" height="4.3" fill="currentColor" stroke="none"/><rect x="16.3" y="10.25" width="4.3" height="4.3"/><rect x="3.4" y="16.7" width="4.3" height="4.3" fill="currentColor" stroke="none"/><rect x="9.85" y="16.7" width="4.3" height="4.3"/><rect x="16.3" y="16.7" width="4.3" height="4.3" fill="currentColor" stroke="none"/>',
  };

  const main = document.getElementById('main');
  const siteNav = document.getElementById('siteNav');
  const mobileNav = document.getElementById('mobileNav');
  const footer = document.getElementById('siteFooter');
  const headerProgress = document.getElementById('headerProgress');
  const toastStack = document.getElementById('toastStack');
  let heroPattern = null;

  function uiIcon(name, className = '') {
    const path = ICONS[name];
    if (!path) return '';
    return `<svg class="ui-icon${className ? ` ${className}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
  }

  function showToast(message, options = {}) {
    if (!toastStack) return;
    const toast = document.createElement('div');
    toast.className = `toast${options.tone ? ` is-${options.tone}` : ''}`;
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);
    if (options.action) {
      const link = document.createElement('a');
      link.href = options.action.href;
      link.textContent = options.action.label;
      toast.append(link);
    }
    toastStack.append(toast);
    requestAnimationFrame(() => toast.classList.add('is-in'));
    setTimeout(() => {
      toast.classList.remove('is-in');
      setTimeout(() => toast.remove(), 220);
    }, options.duration || 3800);
  }
  const searchLayer = document.getElementById('searchLayer');
  const searchLayerInput = document.getElementById('searchLayerInput');
  const searchLayerForm = document.getElementById('searchLayerForm');
  const searchLayerClose = document.getElementById('searchLayerClose');
  const searchOpen = document.getElementById('searchOpen');
  const menuToggle = document.getElementById('menuToggle');
  const headerSearch = document.getElementById('headerSearch');
  const headerSearchInput = document.getElementById('headerSearchInput');
  const Audio = window.EMAudio || null;
  const soundToggle = document.getElementById('soundToggle');
  const audioDock = document.getElementById('audioDock');
  const audioDockTitle = document.getElementById('audioDockTitle');
  const audioDockProgress = document.getElementById('audioDockProgress');
  const audioDockStop = document.getElementById('audioDockStop');
  const audioDockVolume = document.getElementById('audioDockVolume');
  const transport = document.getElementById('transport');
  const transportHead = document.getElementById('transportHead');
  const headerMeter = document.getElementById('headerMeter');
  const headerMeterBars = headerMeter ? [...headerMeter.querySelectorAll('i')] : [];
  const audioDockWave = document.getElementById('audioDockWave');
  const audioDockWaveBars = [];

  // Static peak shapes give the dock a readable waveform without shipping audio files.
  (function buildDockWave() {
    if (!audioDockWave) return;
    let seed = 17;
    const next = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const frag = document.createDocumentFragment();
    for (let index = 0; index < 68; index += 1) {
      const bar = document.createElement('i');
      const shape = Math.pow(next(), 0.72);
      const envelope = 0.55 + 0.45 * Math.sin((index / 68) * Math.PI * 3.2);
      bar.style.height = `${Math.round(14 + shape * envelope * 86)}%`;
      frag.append(bar);
      audioDockWaveBars.push(bar);
    }
    audioDockWave.append(frag);
  })();

  function paintDockWave(progress) {
    if (!audioDockWaveBars.length) return;
    const cut = Math.round(progress * audioDockWaveBars.length);
    audioDockWaveBars.forEach((bar, index) => {
      bar.classList.toggle('is-past', index < cut);
      bar.classList.toggle('is-hot', index === cut);
    });
  }
  const Floating = window.FloatingUIDOM || null;
  const uiTooltip = document.getElementById('uiTooltip');
  const uiTooltipText = document.getElementById('uiTooltipText');
  const uiTooltipArrow = uiTooltip?.querySelector('[data-floating-arrow]') || null;
  const headerSearchPopover = document.getElementById('headerSearchPopover');

  let expandedTree = new Set();
  let atlas = null;
  let lastRoutePath = '';
  let tooltipTarget = null;
  let tooltipCleanup = null;
  let tooltipHideTimer = null;
  let headerSearchCleanup = null;
  let headerSearchTimer = null;
  let floatingReady = false;
  let audioProgressRaf = null;
  let labBpm = 124;
  let labGroups = {
    drums: true,
    bass: true,
    chords: true,
    vocal: false,
    lead: true,
    ambient: true,
    fx: false,
  };
  let practiceMode = 'style';
  let courseFilter = 'all';
  let practiceKeyHandler = null;
  let labKeyHandler = null;
  let labSolo = null;
  let styleQuiz = null;
  let bpmQuiz = null;
  const practiceStats = { score: 0, total: 0, streak: 0, bestStreak: 0 };
  const phraseStats = { attempts: 0, hits: 0, best: null };
  let phraseTimer = null;
  let phraseState = { phrase: 1, bar: 1, beat: 1, running: false };

  const descCount = new Map();
  function countDescendants(entry) {
    if (descCount.has(entry.id)) return descCount.get(entry.id);
    let total = 0;
    for (const childId of entry.childrenIds || []) {
      const child = entryById.get(childId);
      if (!child) continue;
      total += 1 + countDescendants(child);
    }
    descCount.set(entry.id, total);
    return total;
  }

  const searchIndex = KB.entries.map((entry) => ({
    entry,
    name: norm(entry.name),
    aliases: norm((entry.aliases || []).join(' ')),
    family: norm(`${entry.familyName} ${entry.familyZh || ''}`),
    summary: norm(entry.summary),
    desc: norm(entry.description),
    examples: norm(entry.examples.map((item) => `${item.title} ${item.artist}`).join(' ')),
    rel: norm(
      [...entry.relations.up, ...entry.relations.down, ...entry.relations.related]
        .map((item) => item.name)
        .join(' ')
    ),
  }));

  // Utilities

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightLimited(text, query, maxMarks = 2) {
    const safe = escapeHtml(text || '');
    const raw = (query || '').trim();
    if (!raw) return safe;
    const tokens = [...new Set(raw.split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
    let output = safe;
    let marks = 0;
    for (const token of tokens) {
      if (marks >= maxMarks) break;
      const needle = escapeHtml(token);
      if (!needle) continue;
      let done = false;
      output = output.replace(new RegExp(escapeRegExp(needle), 'gi'), (match) => {
        if (done || marks >= maxMarks) return match;
        done = true;
        marks += 1;
        return `<mark>${match}</mark>`;
      });
    }
    return output;
  }

  function norm(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[\s\-_/·.,，。:：;；!！?？'"“”‘’()（）[\]【】]/g, '')
      .trim();
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  function highlight(text, query) {
    const safe = escapeHtml(text || '');
    const raw = (query || '').trim();
    if (!raw) return safe;
    const tokens = [...new Set(raw.split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
    let output = safe;
    for (const token of tokens) {
      const needle = escapeHtml(token);
      if (!needle) continue;
      output = output.replace(new RegExp(escapeRegExp(needle), 'gi'), (match) => `<mark>${match}</mark>`);
    }
    return output;
  }

  const WEB = window.KB_WEB || { manifest: null, docs: [], chunks: [] };
  const webDocsById = new Map((WEB.docs || []).map((doc) => [doc.id, doc]));
  const webChunksByDoc = new Map();
  for (const chunk of WEB.chunks || []) {
    if (!webChunksByDoc.has(chunk.docId)) webChunksByDoc.set(chunk.docId, []);
    webChunksByDoc.get(chunk.docId).push(chunk);
  }

  // 长转写会被构建器切成带重叠的分块；直接 join 会在页面上重复一小段。
  // 这里找最长后缀/前缀重叠，合并成连续正文。
  function mergeChunkTexts(chunks) {
    let text = '';
    for (const chunk of chunks) {
      const part = String(chunk.text || '');
      if (!part) continue;
      if (!text) {
        text = part;
        continue;
      }
      const maxOverlap = Math.min(300, text.length, part.length);
      let overlap = 0;
      for (let size = maxOverlap; size >= 20; size -= 1) {
        if (text.slice(-size) === part.slice(0, size)) {
          overlap = size;
          break;
        }
      }
      text += overlap ? part.slice(overlap) : `\n\n${part}`;
    }
    return text;
  }

  const COURSE = window.EM_COURSE || { chapters: [] };
  const COURSE_CHAPTERS = COURSE.chapters || [];
  const COURSE_LESSONS = COURSE_CHAPTERS.flatMap((chapter) =>
    (chapter.lessons || []).map((lesson, index) => ({
      ...lesson,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterIndex: chapter.index,
      chapterColor: chapter.color,
      chapterOrder: index,
    }))
  );
  const LESSON_BY_ID = new Map(COURSE_LESSONS.map((lesson) => [lesson.id, lesson]));
  const CHAPTER_BY_ID = new Map(COURSE_CHAPTERS.map((chapter) => [chapter.id, chapter]));

  // Group consecutive stages into the three difficulty bands used by the route ladder.
  const TIER_CAPTIONS = {
    基础: '做出能循环的 Loop',
    进阶: '让 Loop 变成一首歌',
    完成: '混音、导出与复盘',
  };
  const courseTiers = [];
  for (const chapter of COURSE_CHAPTERS) {
    const name = chapter.tier || '阶段';
    const last = courseTiers[courseTiers.length - 1];
    if (last && last.name === name) last.chapters.push(chapter);
    else courseTiers.push({ name, caption: TIER_CAPTIONS[name] || '', chapters: [chapter] });
  }
  const COURSE_KB_LINKS = new Map();
  for (const lesson of COURSE_LESSONS) {
    for (const kbId of lesson.kbLinks || []) {
      if (!COURSE_KB_LINKS.has(kbId)) COURSE_KB_LINKS.set(kbId, []);
      COURSE_KB_LINKS.get(kbId).push(lesson);
    }
  }
  const COURSE_KB_ALIASES = new Map();
  for (const doc of WEB.docs || []) {
    const aliases = [doc.metadata?.entryId, doc.metadata?.familyId].filter(Boolean);
    const linked = COURSE_KB_LINKS.get(doc.id) || [];
    for (const alias of aliases) {
      if (!COURSE_KB_ALIASES.has(alias)) COURSE_KB_ALIASES.set(alias, []);
      for (const lesson of linked) {
        if (!COURSE_KB_ALIASES.get(alias).some((item) => item.id === lesson.id)) {
          COURSE_KB_ALIASES.get(alias).push(lesson);
        }
      }
    }
  }
  const COURSE_STORAGE_KEY = 'em-course-progress-v1';
  let courseCompleted = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) {
      courseCompleted = new Set(stored.filter((id) => LESSON_BY_ID.has(id)));
    }
  } catch {
    // Progress is optional; ignore storage restrictions.
  }

  function saveCourseProgress() {
    try {
      localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify([...courseCompleted]));
    } catch {
      // Ignore storage restrictions.
    }
  }

  // Self-check ticks are a private checklist, stored apart from completion so that
  // re-opening a finished lesson still shows which criteria were verified.
  const CHECKS_STORAGE_KEY = 'em-lesson-checks-v1';
  let lessonChecks = {};
  try {
    const storedChecks = JSON.parse(localStorage.getItem(CHECKS_STORAGE_KEY) || '{}');
    if (storedChecks && typeof storedChecks === 'object') lessonChecks = storedChecks;
  } catch {
    // Optional; ignore storage restrictions.
  }

  function saveLessonChecks() {
    try {
      localStorage.setItem(CHECKS_STORAGE_KEY, JSON.stringify(lessonChecks));
    } catch {
      // Ignore storage restrictions.
    }
  }

  const DJ_PROGRESS_KEY = 'em-dj-progress-v1';
  let djCompleted = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(DJ_PROGRESS_KEY) || '[]');
    const valid = new Set((DJ_COURSE?.episodes || []).map((episode) => episode.id));
    if (Array.isArray(stored)) djCompleted = new Set(stored.filter((id) => valid.has(id)));
  } catch {
    // Optional progress; ignore storage restrictions.
  }

  function saveDjProgress() {
    try {
      localStorage.setItem(DJ_PROGRESS_KEY, JSON.stringify([...djCompleted]));
    } catch {
      // Ignore storage restrictions.
    }
  }

  function djCompletedCount() {
    return (DJ_COURSE?.episodes || []).filter((episode) => djCompleted.has(episode.id)).length;
  }

  function firstIncompleteDjEpisode() {
    return (DJ_COURSE?.episodes || []).find((episode) => !djCompleted.has(episode.id)) || null;
  }

  function djProgressPercent() {
    const total = DJ_COURSE?.episodeCount || 0;
    return total ? Math.round((djCompletedCount() / total) * 100) : 0;
  }

  const START_PLAN_KEY = 'em-start-plan-v1';
  let startPlanDone = {};
  try {
    const stored = JSON.parse(localStorage.getItem(START_PLAN_KEY) || '{}');
    if (stored && typeof stored === 'object') startPlanDone = stored;
  } catch {
    // Optional.
  }

  function saveStartPlan() {
    try {
      localStorage.setItem(START_PLAN_KEY, JSON.stringify(startPlanDone));
    } catch {
      // Ignore.
    }
  }

  const START_TASK_IDS = (START.plan || []).flatMap((day) => (day.tasks || []).map((task) => task.id));
  const START_TASK_TOTAL = START_TASK_IDS.length;
  const START_TASK_DONE = () => START_TASK_IDS.filter((id) => startPlanDone[id]).length;

  const FIELD_GUIDE_KEY = 'em-dj-field-guide-v1';
  let fieldGuideDone = {};
  try {
    const stored = JSON.parse(localStorage.getItem(FIELD_GUIDE_KEY) || '{}');
    if (stored && typeof stored === 'object') fieldGuideDone = stored;
  } catch {
    // Optional.
  }

  function saveFieldGuide() {
    try {
      localStorage.setItem(FIELD_GUIDE_KEY, JSON.stringify(fieldGuideDone));
    } catch {
      // Ignore.
    }
  }

  const FIELD_GUIDE_IDS = (START.fieldGuide?.sections || []).flatMap((section) => (section.items || []).map((item) => item.id));
  const FIELD_GUIDE_TOTAL = FIELD_GUIDE_IDS.length;
  const FIELD_GUIDE_DONE = () => FIELD_GUIDE_IDS.filter((id) => fieldGuideDone[id]).length;

  const RECENT_SEARCH_KEY = 'em-recent-searches-v1';
  let recentSearches = [];
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
    if (Array.isArray(stored)) recentSearches = stored.filter((item) => typeof item === 'string').slice(0, 6);
  } catch {
    // Optional.
  }

  function saveRecentSearch(query) {
    const value = String(query || '').trim();
    if (!value) return;
    recentSearches = [value, ...recentSearches.filter((item) => item !== value)].slice(0, 6);
    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recentSearches));
    } catch {
      // Ignore.
    }
  }

  const BEGINNER_QUERIES = ['没有设备能学 DJ 吗', '先学 DJ 还是先学制作', '对拍怎么练', 'CUE 点怎么设', '第一次上台要带什么', '怎么准备 Rekordbox U 盘'];

  function lessonCheckState(lessonId, total) {
    const stored = Array.isArray(lessonChecks[lessonId]) ? lessonChecks[lessonId] : [];
    return Array.from({ length: total }, (_, index) => stored.includes(index));
  }

  function isLessonComplete(id) {
    return courseCompleted.has(id);
  }

  function firstIncompleteLesson() {
    return COURSE_LESSONS.find((lesson) => !courseCompleted.has(lesson.id)) || null;
  }

  function courseProgressPercent() {
    if (!COURSE_LESSONS.length) return 0;
    return Math.round((courseCompleted.size / COURSE_LESSONS.length) * 100);
  }

  function courseKbHref(id) {
    if (entryById.has(id)) return `#/genre/${id}`;
    if (familyById.has(id)) return `#/family/${id}`;
    if (webDocsById.has(id)) return `#/doc/${encodeURIComponent(id)}`;
    return `#/search?q=${encodeURIComponent(id)}`;
  }

  function courseKbLabel(id) {
    if (entryById.has(id)) return entryById.get(id).name;
    if (familyById.has(id)) return familyById.get(id).name;
    if (webDocsById.has(id)) return webDocsById.get(id).title;
    return id;
  }

  function lessonsForKb(id) {
    const merged = [...(COURSE_KB_LINKS.get(id) || []), ...(COURSE_KB_ALIASES.get(id) || [])];
    return [...new Map(merged.map((lesson) => [lesson.id, lesson])).values()];
  }

  function searchLessons(query) {
    const terms = String(query || '')
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/[\s\-_/·.,，。:：;；!！?？'"“”‘’()（）[\]【】]/g, ''))
      .filter(Boolean);
    if (!terms.length) return [];
    return COURSE_LESSONS.map((lesson) => {
      const text = [
        lesson.title,
        lesson.subtitle,
        lesson.outcome,
        lesson.deliverable,
        lesson.task,
        (lesson.concept || []).join(' '),
        (lesson.goals || []).join(' '),
        (lesson.keyTerms || []).join(' '),
        (lesson.kbLinks || []).map(courseKbLabel).join(' '),
      ].join(' ').toLowerCase();
      const score = terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
      return { lesson, score };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.lesson);
  }

  const SEARCH_TYPE_GROUPS = [
    { id: 'all', label: '全部', types: null },
    { id: 'style', label: '风格', types: ['entry', 'style'] },
    { id: 'family', label: '大族', types: ['family'] },
    { id: 'guide', label: '指南', types: ['guide', 'instrument', 'timeline', 'live'] },
    { id: 'glossary', label: '术语', types: ['glossary'] },
    { id: 'course', label: '课程', types: ['transcript'] },
    { id: 'source', label: '来源', types: ['source'] },
  ];

  const LAB_GROUPS = [
    { id: 'drums', name: '打击乐', en: 'Percussion', role: '骨架', desc: 'Kick、Clap、Hi-hat；决定身体怎么动。' },
    { id: 'bass', name: '贝斯', en: 'Bass', role: '肌肉', desc: '给舞池推力；注意它与 Kick 的让位。' },
    { id: 'chords', name: '和弦', en: 'Chord Melody', role: '表情', desc: '铺和声、定情绪；Drop 里也常出现。' },
    { id: 'vocal', name: '人声', en: 'Vocal', role: '记忆点', desc: '这里用合成器模拟一个元音人声。' },
    { id: 'lead', name: '主奏', en: 'Lead', role: '钩子', desc: 'Drop 里最显眼、最容易被哼住的声音。' },
    { id: 'ambient', name: '氛围', en: 'Ambient', role: '气息', desc: 'Pad 与背景层；填补频段，制造空间。' },
    { id: 'fx', name: '音效', en: 'FX', role: '转场', desc: 'Riser、Impact；把情绪推向下一段。' },
  ];

  // One tone per layer, ordered from low to high register — warm at the bottom, cool on top.
  const LAB_TONES = ['phosphor', 'heat', 'phosphor', 'violet', 'violet', 'ice', 'ice'];

  const KB_TYPE_LABELS = {
    entry: '分类条目',
    family: '大族概览',
    guide: '指南',
    style: '精编风格',
    instrument: '乐器组',
    glossary: '术语',
    timeline: '历史',
    live: '现场',
    source: '来源',
    transcript: '课程笔记',
  };

  const KB_EN_STOPWORDS = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'in', 'on', 'for', 'with', 'is', 'are', 'be', 'by', 'as', 'at', 'from', 'or', 'this', 'that', 'it', 'its']);
  const KB_CN_STOPCHARS = new Set('的了是在有和与就都而及或一个种这那为以于之其把被让给很更最又也很吗呢吧啊'.split(''));
  const KB_TYPE_WEIGHT = { source: 0.5, transcript: 0.7 };

  let webSearchState = null;

  function kbTokenize(value) {
    const text = String(value ?? '').normalize('NFKC').toLowerCase();
    const runs = text.match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [];
    const tokens = [];
    for (const run of runs) {
      if (/^[a-z0-9]+$/.test(run)) {
        if (run.length > 1 && !KB_EN_STOPWORDS.has(run)) tokens.push(run);
        continue;
      }
      if (run.length === 1) {
        if (!KB_CN_STOPCHARS.has(run)) tokens.push(run);
        continue;
      }
      for (let index = 0; index < run.length; index += 1) {
        if (!KB_CN_STOPCHARS.has(run[index])) tokens.push(run[index]);
        if (index < run.length - 1) tokens.push(run.slice(index, index + 2));
      }
      if (run.length <= 6) tokens.push(run);
    }
    return tokens;
  }

  function kbFixQuery(value) {
    return String(value || '')
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

  function kbExpandQuery(query) {
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

  const KB_INTENT_RE = /怎么|如何|是什么|为什么|区别|推荐|入门|新手|多久|哪里|能不能|要不要|怎么练/;

  function kbBuildIndex() {
    if (webSearchState) return webSearchState;
    const chunks = WEB.chunks || [];
    const records = [];
    const postings = new Map();
    const documentFrequency = new Map();
    const lengths = [];
    let totalLength = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const frequencies = new Map();
      const add = (text, weight) => {
        if (!text) return;
        for (const token of kbTokenize(text)) frequencies.set(token, (frequencies.get(token) || 0) + weight);
      };
      add(chunk.title, 6);
      add((chunk.aliases || []).join(' '), 4);
      add([chunk.family, chunk.path].filter(Boolean).join(' '), 2);
      add((chunk.examples || []).join(' '), 2);
      add(chunk.text, 1);
      const length = [...frequencies.values()].reduce((sum, value) => sum + value, 0);
      lengths[index] = length;
      totalLength += length;
      records[index] = { chunk, frequencies, length };
      for (const [token, frequency] of frequencies) {
        if (!postings.has(token)) postings.set(token, []);
        postings.get(token).push([index, frequency]);
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      }
    }
    webSearchState = {
      chunks,
      records,
      postings,
      documentFrequency,
      lengths,
      averageLength: chunks.length ? totalLength / chunks.length : 0,
    };
    return webSearchState;
  }

  function kbPlain(text) {
    return String(text || '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[-*]\s+/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function kbSnippet(text, query, maxLength = 220) {
    const source = kbPlain(text).replace(/\s+/g, ' ').trim();
    if (!source) return '';
    const lower = source.toLowerCase();
    let position = -1;
    for (const token of [...new Set(kbTokenize(query))]) {
      const found = lower.indexOf(token.toLowerCase());
      if (found >= 0 && (position < 0 || found < position)) position = found;
    }
    if (position < 0) return source.length > maxLength ? `${source.slice(0, maxLength - 1)}…` : source;
    const start = Math.max(0, position - Math.floor(maxLength * 0.35));
    const end = Math.min(source.length, start + maxLength);
    return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
  }

  function kbSearchAll(query, options = {}) {
    const q = String(query || '').trim();
    const limit = Math.max(1, Math.min(Number(options.limit) || 8, 80));
    if (!q || !(WEB.chunks || []).length) return { query: q, count: 0, results: [] };
    const state = kbBuildIndex();
    const group = SEARCH_TYPE_GROUPS.find((item) => item.id === options.type);
    const allowedTypes = options.types || (group && group.types) || null;
    const fixedQuery = kbFixQuery(q);
    const tokens = [...new Set(kbTokenize([fixedQuery, ...kbExpandQuery(fixedQuery)].join(' ')))];
    if (!tokens.length) return { query: q, count: 0, results: [], meta: { normalizedQuery: fixedQuery !== q ? fixedQuery : null } };
    const k1 = 1.2;
    const b = 0.75;
    const scores = new Map();
    for (const token of tokens) {
      const list = state.postings.get(token);
      if (!list) continue;
      const df = state.documentFrequency.get(token) || 0;
      const idf = Math.log(1 + (state.chunks.length - df + 0.5) / (df + 0.5));
      const tokenWeight = Math.max(1, Math.min(8, token.length));
      for (const [index, frequency] of list) {
        const length = state.lengths[index] || 1;
        const denominator = frequency + k1 * (1 - b + (b * length) / (state.averageLength || 1));
        scores.set(index, (scores.get(index) || 0) + idf * ((frequency * (k1 + 1)) / denominator) * tokenWeight);
      }
    }
    const phrase = norm(fixedQuery).toLowerCase();
    const intentQuery = KB_INTENT_RE.test(fixedQuery);
    const candidates = [];
    for (const [index, baseScore] of scores) {
      const record = state.records[index];
      const chunk = record.chunk;
      if (allowedTypes && !allowedTypes.includes(chunk.type)) continue;
      if (options.family) {
        const familyValue = String(options.family);
        if (chunk.familyId !== familyValue && norm(chunk.family) !== norm(familyValue)) continue;
      }
      if (options.bpmMin !== undefined || options.bpmMax !== undefined) {
        if (!chunk.bpm) continue;
        const low = Number(options.bpmMin);
        const high = Number(options.bpmMax);
        if (Number.isFinite(low) && chunk.bpm.max < low) continue;
        if (Number.isFinite(high) && chunk.bpm.min > high) continue;
      }
      let score = baseScore;
      if (phrase) {
        const title = norm(chunk.title).toLowerCase();
        const aliases = (chunk.aliases || []).map((alias) => norm(alias).toLowerCase());
        const familyText = norm(chunk.family || '').toLowerCase();
        if (title === phrase) score += 8;
        else if (title.includes(phrase)) score += 4;
        if (aliases.some((alias) => alias === phrase)) score += 5;
        else if (aliases.some((alias) => alias.includes(phrase))) score += 2;
        if (familyText === phrase) score += 5;
        else if (familyText.includes(phrase)) score += 2.5;
        if (chunk.type === 'family' && (familyText.includes(phrase) || title.includes(phrase))) score += 15;
        if (norm(chunk.text).toLowerCase().includes(phrase)) score += 2.5;
      }
      let coverage = 0;
      for (const token of tokens) if (record.frequencies.has(token)) coverage += 1;
      score *= 0.55 + (0.45 * coverage) / tokens.length;
      score *= KB_TYPE_WEIGHT[chunk.type] ?? 1;
      if (intentQuery) {
        if (chunk.type === 'guide' || chunk.type === 'glossary') score *= 1.12;
        if (chunk.type === 'transcript') score *= 0.96;
      }
      candidates.push({ record, score });
    }
    candidates.sort((a, b2) => b2.score - a.score || a.record.chunk.title.length - b2.record.chunk.title.length);
    const seen = new Set();
    const deduped = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.record.chunk.docId)) continue;
      seen.add(candidate.record.chunk.docId);
      deduped.push(candidate);
    }
    const results = deduped.slice(0, limit).map(({ record, score }) => {
      const entry = record.chunk.type === 'entry' ? entryById.get(record.chunk.docId) : null;
      const snippetSource = entry?.description || record.chunk.text;
      return {
        id: record.chunk.docId,
        chunk_id: record.chunk.id,
        type: record.chunk.type,
        title: record.chunk.title,
        family: record.chunk.family || null,
        familyId: record.chunk.familyId || null,
        path: record.chunk.path || null,
        bpm: record.chunk.bpm || null,
        score: Math.round(score * 1000) / 1000,
        snippet: kbSnippet(snippetSource, fixedQuery),
        source: record.chunk.source,
        metadata: record.chunk.metadata || {},
      };
    });
    return { query: q, count: deduped.length, results, meta: { normalizedQuery: fixedQuery !== q ? fixedQuery : null } };
  }

  function kbTypeLabel(type) {
    return KB_TYPE_LABELS[type] || type || '文档';
  }

  function kbDocHref(item) {
    if (item.type === 'entry') return `#/genre/${item.id}`;
    if (item.type === 'family' && item.familyId) return `#/family/${item.familyId}`;
    if (item.type === 'transcript') {
      const episode = djEpisodeFromSourceId(item.id);
      if (episode) return `#/dj/course?ep=${episode.page}`;
    }
    return `#/doc/${encodeURIComponent(item.id)}`;
  }

  function kbGetDoc(id) {
    const decoded = String(id || '');
    let doc = webDocsById.get(decoded);
    if (!doc) {
      const chunks = webChunksByDoc.get(decoded) || [];
      if (chunks.length) {
        doc = {
          id: decoded,
          type: chunks[0].type,
          title: chunks[0].title,
          text: mergeChunkTexts(chunks),
          family: chunks[0].family,
          familyId: chunks[0].familyId,
          bpm: chunks[0].bpm,
          source: chunks[0].source,
          metadata: chunks[0].metadata || {},
        };
      }
    }
    return doc || null;
  }

  function kbMarkdownLite(text) {
    const lines = escapeHtml(text || '').split(/\r?\n/);
    const output = [];
    let listOpen = false;
    const inline = (value) => value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const closeList = () => {
      if (listOpen) {
        output.push('</ul>');
        listOpen = false;
      }
    };
    for (const line of lines) {
      if (!line.trim()) {
        closeList();
        continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = Math.min(6, heading[1].length + 1);
        output.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        if (!listOpen) {
          output.push('<ul>');
          listOpen = true;
        }
        output.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
        continue;
      }
      closeList();
      output.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    return output.join('\n');
  }

  function familyClass(color) {
    return `family-${color || 'muted'}`;
  }

  function familyByLooseName(name) {
    if (!name) return null;
    const key = norm(name);
    if (familyByName.has(key)) return familyByName.get(key);
    if (familyAliases.has(key)) return familyByName.get(familyAliases.get(key));
    if (key.startsWith('disco')) return familyByName.get('Disco / Hi-NRG');
    if (key.startsWith('techno')) return familyByName.get('Techno');
    if (key.startsWith('trance')) return familyByName.get('Trance');
    if (key.startsWith('industrial')) return familyByName.get('Industrial');
    if (key.startsWith('ambient')) return familyByName.get('Ambient');
    if (key.startsWith('breakbeat')) return familyByName.get('Breakbeat');
    return null;
  }

  function familyColorForName(name) {
    const base = String(name || '').split(' / ')[0].toLowerCase();
    const map = {
      house: 'violet',
      techno: 'ice',
      trance: 'phosphor',
      'hip-hop': 'ice',
      'us bass': 'heat',
      hdm: 'phosphor',
    };
    return map[base] || 'violet';
  }

  function bpmFromString(value) {
    if (!value) return null;
    const numbers = String(value).match(/\d{2,3}/g);
    if (!numbers) return null;
    const min = Number(numbers[0]);
    const max = numbers[1] ? Number(numbers[1]) : min;
    return { min, max, label: value };
  }

  function curatedBpmHint(entry) {
    const style = curatedById.get(entry.id);
    if (!style || !style.bpm) return null;
    return { bpm: bpmFromString(style.bpm), note: style.bpmNote };
  }

  function bpmRuler(bpm, options = {}) {
    const large = Boolean(options.large);
    if (!bpm) {
      return `<div class="bpm-ruler" data-tooltip="原始资料未标注 BPM；没有数字不代表没有速度特征"><span class="bpm-empty">BPM 未标注</span><div class="bpm-track"></div></div>`;
    }
    const scaleMin = 60;
    const scaleMax = 300;
    const low = Math.max(scaleMin, Math.min(scaleMax, bpm.min));
    const high = Math.max(scaleMin, Math.min(scaleMax, bpm.max));
    const left = ((low - scaleMin) / (scaleMax - scaleMin)) * 100;
    const width = Math.max(((high - low) / (scaleMax - scaleMin)) * 100, 0.9);
    const label = bpm.label || (bpm.min === bpm.max ? String(bpm.min) : `${bpm.min}–${bpm.max}`);
    return `
      <div class="bpm-ruler" data-tooltip="${escapeHtml(`${label} BPM`)}">
        <div class="bpm-track"><span class="bpm-range" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></span></div>
        <div class="bpm-meta"><strong>${escapeHtml(label)}</strong><span>${large ? '60 — 300 BPM' : 'BPM'}</span></div>
      </div>`;
  }

  function traitChips(traits, limit = 3) {
    if (!traits || !traits.length) return '';
    return traits.slice(0, limit).map((trait) => `<span class="chip">${escapeHtml(trait)}</span>`).join('');
  }

  function relationHref(relation) {
    if (relation.id) return `#/genre/${relation.id}`;
    const family = familyByLooseName(relation.name);
    if (family) return `#/family/${family.id}`;
    return null;
  }

  function relationChip(relation, extraClass = '') {
    const href = relationHref(relation);
    const label = escapeHtml(relation.name);
    if (href) return `<a class="chip ${extraClass}" href="${href}">${label}</a>`;
    return `<span class="chip ${extraClass}">${label}</span>`;
  }

  function relationChips(relations, emptyText = '暂无记录') {
    if (!relations || !relations.length) return `<p class="aside-relation-note">${emptyText}</p>`;
    return `<div class="chip-row">${relations.map((relation) => relationChip(relation)).join('')}</div>`;
  }

  function familyPill(family) {
    if (!family) return '';
    return `<a class="chip is-family ${familyClass(family.color)}" href="#/family/${family.id}">${escapeHtml(family.name)}${family.zh ? ` · ${escapeHtml(family.zh)}` : ''}</a>`;
  }

  function stripLong(text, length = 160) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= length) return clean;
    return `${clean.slice(0, length - 1)}…`;
  }

  function parseRoute() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart] = raw.split('?');
    return {
      path: pathPart || '/',
      params: new URLSearchParams(queryPart || ''),
    };
  }

  function navigate(hash) {
    if (location.hash === hash) {
      render();
      return;
    }
    location.hash = hash;
  }

  function replaceHash(hash) {
    try {
      history.replaceState(null, '', hash);
    } catch {
      // Some file:// contexts restrict history mutation; routing still works without it.
    }
  }

  function currentNavPath(path) {
    if (path.startsWith('/guide/atlas')) return '/atlas';
    return path;
  }

  function renderHeader(path) {
    const activePath = currentNavPath(path);
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.classList.toggle('is-active', activePath === '/');
      if (activePath === '/') brand.setAttribute('aria-current', 'page');
      else brand.removeAttribute('aria-current');
    }
    siteNav.innerHTML = NAV.map((item) => {
      const active = item.match(activePath);
      return `<a href="${item.href}"${active ? ' aria-current="page"' : ''}><span>${escapeHtml(item.label)}</span></a>`;
    }).join('');

    const completed = courseCompleted.size;
    const total = COURSE_LESSONS.length;
    const djDone = djCompletedCount();
    const planDone = START_TASK_DONE();
    const fieldDone = FIELD_GUIDE_DONE();
    const learningDone = completed + djDone + planDone + fieldDone;
    const learningTotal = total + (DJ_COURSE?.episodeCount || 0) + START_TASK_TOTAL + FIELD_GUIDE_TOTAL;
    const learningPercent = learningTotal ? Math.round((learningDone / learningTotal) * 100) : 0;
    if (headerProgress) {
      headerProgress.hidden = learningDone === 0;
      headerProgress.href = '#/start';
      headerProgress.querySelector('strong').textContent = `${learningPercent}%`;
      headerProgress.style.setProperty('--path-progress', `${learningPercent}%`);
      headerProgress.setAttribute('aria-label', `学习路径 ${learningDone}/${learningTotal}，打开新手起步`);
      headerProgress.dataset.tooltip = '学习路径：制作课 / DJ 课 / 7 天计划 / 现场清单';
    }

    const mobileProgress = learningDone
      ? `<a class="mobile-nav-progress" href="#/start"><span>PATH / 学习路径</span><strong>${learningPercent}%</strong><i style="--path-progress:${learningPercent}%" aria-hidden="true"></i></a>`
      : '';
    mobileNav.innerHTML = `
      ${mobileProgress}
      <div class="mobile-nav-list">
        ${NAV.map((item) => {
          const active = item.match(activePath);
          return `<a href="${item.href}"${active ? ' aria-current="page"' : ''}>
            <span class="mobile-nav-icon">${uiIcon(item.icon)}</span>
            <span class="mobile-nav-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.desc)}</small></span>
            ${uiIcon('arrow')}
          </a>`;
        }).join('')}
      </div>
      <div class="mobile-nav-secondary">
        <a href="#/atlas">风格图谱</a>
        <a href="#/lab">实验室</a>
        <a href="#/studio">工作室</a>
        <a href="#/start">新手起步</a>
        <a href="#/dj">DJ 工具</a>
        <a href="#/dj/automix">自动接歌台</a>
        <a href="#/dj/course">DJ 修炼手册</a>
        <a href="#/dj/field-guide">DJ 现场手册</a>
        <a href="#/search">全库检索</a>
        <a href="#/about">来源与勘误</a>
        <a href="#/module">知识库模块</a>
      </div>
      <div class="mobile-nav-foot">
        <span>电音档案 / FIELD NOTES</span>
        <span>${total} LESSONS · ${formatNumber(KB.meta.stats.entries)} ENTRIES</span>
      </div>`;
  }

  function renderFooter() {
    const supportLinks = [
      SUPPORT_LINKS.afdian ? `<a href="${escapeHtml(SUPPORT_LINKS.afdian)}" target="_blank" rel="noopener noreferrer">爱发电</a>` : '',
      SUPPORT_LINKS.github ? `<a href="${escapeHtml(SUPPORT_LINKS.github)}" target="_blank" rel="noopener noreferrer">GitHub Sponsors</a>` : '',
      SUPPORT_LINKS.gumroad ? `<a href="${escapeHtml(SUPPORT_LINKS.gumroad)}" target="_blank" rel="noopener noreferrer">Automix 便携版</a>` : '',
    ].filter(Boolean).join('');
    footer.innerHTML = `
      <div class="footer-brand">
        <strong>电音档案 / FIELD NOTES</strong>
        <span>基于《电音风格项目丨第四期》、四期《电音圣经》与一期现场播客整理。资料截至 ${escapeHtml(CUR.updated)}。</span>
        <span>本地静态知识库 · 仅作学习与研究 · 例曲不提供音频下载</span>
        <span>声音示例由浏览器实时合成，不是原曲。</span>
      </div>
      <div class="footer-links">
        <a href="#/archive">档案总览</a>
        <a href="#/archive?section=learn">学习路径</a>
        <a href="#/archive?section=tools">DJ 与制作</a>
        <a href="#/tree">风格树</a>
        <a href="#/learn">制作课</a>
        <a href="#/library">知识库</a>
        <a href="#/atlas">图谱</a>
        <a href="#/practice">练习</a>
        <a href="#/lab">实验室</a>
        <a href="#/start">新手起步</a>
        <a href="#/dj">DJ 工具</a>
        <a href="#/dj/automix">自动接歌台</a>
        <a href="#/dj/course">DJ 修炼手册</a>
        <a href="#/dj/field-guide">DJ 现场手册</a>
        <a href="#/quick">速查</a>
        <a href="#/search">全库检索</a>
        <a href="#/module">模块</a>
        <a href="#/about">来源</a>
      </div>
      ${supportLinks ? `<div class="footer-support"><span>支持这个项目</span>${supportLinks}</div>` : ''}`;
  }

  function pageEnter() {
    main.classList.remove('page-enter');
    void main.offsetWidth;
    main.classList.add('page-enter');
  }

  function closeMobileNav() {
    mobileNav.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', '打开导航');
  }

  function openMobileNav() {
    mobileNav.hidden = false;
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.setAttribute('aria-label', '关闭导航');
  }

  // Shared page pieces

  function sectionHead(kicker, title, link, num = '') {
    return `
      <div class="section-head">
        ${num ? `<span class="section-num">${escapeHtml(num)}</span>` : ''}
        <div class="section-head-copy">
          <div class="section-kicker">${escapeHtml(kicker)}</div>
          <h2>${title}</h2>
        </div>
        ${link ? `<a class="section-link" href="${link.href}">${escapeHtml(link.label)}</a>` : ''}
      </div>`;
  }

  // One compact header for every inner page. The homepage keeps the only full hero,
  // so the site stops repeating the same slogan-block on eight different routes.
  function pageHead({ code, label, title, lead = '', stats = [], action = null }) {
    return `
      <header class="page-head">
        <div class="page-head-index" aria-hidden="true">
          <span class="page-head-code">${escapeHtml(code)}</span>
          <span class="page-head-label">${escapeHtml(label)}</span>
        </div>
        <div class="page-head-copy">
          <h1>${title}</h1>
          ${lead ? `<p>${lead}</p>` : ''}
        </div>
        ${stats.length ? `
          <dl class="page-head-stats">
            ${stats.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${item.value}</dd></div>`).join('')}
          </dl>` : ''}
        ${action ? `<a class="page-head-action" href="${action.href}">${action.label}${uiIcon('arrow')}</a>` : ''}
      </header>`;
  }

  function spectrumHTML() {
    const families = KB.families.filter((family) => !family.archive && !family.supplement);
    const supplementCount = KB.families.filter((family) => family.supplement).length;
    const max = Math.max(...families.map((family) => family.count));
    return `
      <div class="spectrum-panel" aria-label="按大族浏览风格图谱">
        <div class="spectrum-head">
          <span class="mono-label">SIGNAL / ${families.length} 个大族，按条目数量排列</span>
          <span class="mono-label">CLICK TO ENTER</span>
        </div>
        <div class="spectrum-bars" role="list">
          ${families.map((family, index) => {
            const height = 18 + (family.count / max) * 82;
            const code = FAMILY_CODES[family.name] || family.name.slice(0, 3).toUpperCase();
            return `
              <a class="spectrum-bar ${familyClass(family.color)}" href="#/family/${family.id}" role="listitem" style="--bar-height:${height.toFixed(1)}%;--i:${index}" aria-label="${escapeHtml(family.name)}，${family.count} 个条目，查看大族" data-tooltip="${escapeHtml(`${family.name}${family.zh ? ` / ${family.zh}` : ''} · ${family.count} 个条目`)}">
                <span class="bar"></span>
                <span class="bar-code">${escapeHtml(code)}</span>
              </a>`;
          }).join('')}
        </div>
        <div class="spectrum-legend">
          ${families.map((family) => `<a class="${familyClass(family.color)}" href="#/family/${family.id}">${escapeHtml(family.name)} <span>${family.count}</span></a>`).join('')}
        </div>
        ${supplementCount ? `<div class="spectrum-foot"><span class="mono-label">另有 ${supplementCount} 个补充收纳桶（覆盖度补全用），见</span> <a href="#/atlas">风格图谱</a></div>` : ''}
      </div>`;
  }

  function tenStylesHTML() {
    return `
      <div class="style-list">
        ${CUR.tenStyles.map((style, index) => {
          const color = familyColorForName(style.family);
          const bpm = bpmFromString(style.bpm);
          const demo = demoForEntry(style.id);
          return `
            <details class="style-item ${familyClass(color)}">
              <summary>
                <span class="style-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="style-name">${escapeHtml(style.name)}<span class="style-zh">${escapeHtml(style.zh)}</span></span>
                <span class="style-family">${escapeHtml(style.family)}</span>
                ${bpmRuler(bpm)}
                <span class="style-plus" aria-hidden="true"></span>
              </summary>
              <div class="style-body">
                <div>
                  <p class="style-signature">${escapeHtml(style.signature)}</p>
                  ${demo ? `<div class="style-audio">${audioDemoButton(demo, '试听 8 秒')}<span>浏览器实时合成，不是原曲</span></div>` : ''}
                  <div class="style-tips">${style.tips.map((tip) => `<span class="chip">${escapeHtml(tip)}</span>`).join('')}</div>
                  <div class="style-tracks">
                    <div class="mono-label">TRACKS / 例曲</div>
                    ${style.tracks.map((track) => `<div class="style-track">${escapeHtml(track)}</div>`).join('')}
                  </div>
                </div>
                <div class="style-aside">
                  <div class="mono-label">ARTISTS / 代表</div>
                  <p class="style-artists">${style.artists.map(escapeHtml).join('、')}</p>
                  <p class="style-caveat">${escapeHtml(style.caveat)}</p>
                  <a class="style-link" href="${style.id.startsWith('f-') ? '#/family/' : '#/genre/'}${style.id}">在图谱中查看 →</a>
                </div>
              </div>
            </details>`;
        }).join('')}
      </div>`;
  }

  function timelineHTML() {
    return `
      <div class="timeline">
        ${CUR.timeline.map((item) => `
          <div class="timeline-item">
            <div class="timeline-years">${escapeHtml(item.years)}</div>
            <div class="timeline-body">
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
              <div class="chip-row">
                ${item.families.map((name) => {
                  const family = familyByLooseName(name);
                  return family
                    ? `<a class="chip is-family ${familyClass(family.color)}" href="#/family/${family.id}">${escapeHtml(name)}</a>`
                    : `<span class="chip">${escapeHtml(name)}</span>`;
                }).join('')}
              </div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function structureStripHTML(compact = false) {
    const sections = CUR.production.sections;
    return `
      <div class="structure-strip${compact ? ' is-compact' : ''}">
        <div class="structure-strip-head">
          <span class="mono-label">ENERGY / 能量示意</span>
          <span class="mono-label">BAR LENGTH / 小节数</span>
        </div>
        <div class="structure-blocks" role="list" aria-label="典型 EDM 八段结构">
          ${sections.map((section, index) => `
            <div class="structure-block" role="listitem" aria-label="${escapeHtml(section.name)}，${escapeHtml(section.zh)}，${escapeHtml(section.bars)} 小节">
              <div class="structure-bar"><span style="height:${section.energy}%"></span></div>
              <div class="structure-label">
                <strong>${escapeHtml(section.name)}</strong>
                <small>${escapeHtml(section.zh)}</small>
                <em>${escapeHtml(section.bars)}</em>
              </div>
            </div>`).join('')}
        </div>
        <div class="structure-axis">
          <span>INTRO / 进入</span>
          <span>DROP / 舞池</span>
          <span>OUTRO / 退出</span>
        </div>
      </div>`;
  }

  // Home

  function heroSequencerHTML(pattern) {
    const rows = [
      { id: 'kick', label: 'KICK' },
      { id: 'snare', label: 'CLAP' },
      { id: 'hat', label: 'HAT' },
    ];
    return `
      <div class="console-sequencer" aria-label="可编辑的一小节鼓机">
        <div class="console-ruler" aria-hidden="true">
          ${['1', '&', '2', '&', '3', '&', '4', '&'].map((label) => `<span>${label}</span>`).join('')}
        </div>
        ${rows.map((row) => `
          <div class="console-row">
            <span class="console-row-label">${row.label}</span>
            <div class="console-steps">
              ${Array.from({ length: 8 }, (_, index) => {
                const on = Boolean(pattern[row.id][index]);
                return `<button class="console-step${on ? ' is-on' : ''}" type="button" data-hero-step="${row.id}-${index}" data-step-index="${index}" aria-pressed="${on}" aria-label="${row.label} 第 ${index + 1} 格"></button>`;
              }).join('')}
            </div>
          </div>`).join('')}
      </div>`;
  }

  function bindHomeSequencer() {
    const root = document.querySelector('[data-hero-console]');
    if (!root || !heroPattern) return;
    root.querySelectorAll('[data-hero-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const [row, index] = button.dataset.heroStep.split('-');
        heroPattern[row][Number(index)] = !heroPattern[row][Number(index)];
        const on = Boolean(heroPattern[row][Number(index)]);
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', String(on));
        const state = Audio?.getState();
        if (state?.playing && state.demoId === 'drum-machine') Audio.setDrumPattern(heroPattern);
      });
    });
    const search = document.getElementById('homeKbSearch');
    search?.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = new FormData(search).get('q')?.toString().trim() || '';
      navigate(query ? `#/search?q=${encodeURIComponent(query)}` : '#/search');
    });
  }

  function renderHome() {
    const stats = KB.meta.stats;
    const nextLesson = firstIncompleteLesson();
    const completedCount = courseCompleted.size;
    const total = COURSE_LESSONS.length;
    const familyTotal = KB.families.filter((family) => !family.archive && !family.supplement).length;
    const styles = listenStyles();
    const styleTotal = styles.length;
    const cellCount = {};
    for (const item of styles) {
      const key = `${item.data.band}/${item.data.groove}`;
      cellCount[key] = (cellCount[key] || 0) + 1;
    }
    const nextNumber = nextLesson ? COURSE_LESSONS.findIndex((lesson) => lesson.id === nextLesson.id) + 1 : 0;
    const startHref = nextLesson ? `#/learn/${nextLesson.id}` : '#/learn';
    // 今天听这条：按天取模，同一天打开是同一条；「换一条」才随机
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    homeDaily = styles[dayOfYear % Math.max(1, styles.length)] || styles[0] || null;
    const randomStyle = styles[(dayOfYear * 7 + 3) % Math.max(1, styles.length)] || null;

    heroPattern = {
      kick: [true, false, false, false, true, false, false, false],
      snare: [false, false, true, false, false, false, true, false],
      hat: [true, true, true, true, true, true, true, true],
    };

    const mm = LISTEN.grooves.map((groove) => `
      <div class="mm-row">
        ${LISTEN.bands.map((band) => {
          const count = cellCount[`${band.id}/${groove.id}`] || 0;
          const fill = count ? Math.min(1, 0.3 + count * 0.08) : 0;
          return `<span class="mm-cell${count ? ' is-on' : ''}" style="--fill:${fill.toFixed(2)}"></span>`;
        }).join('')}
      </div>`).join('');

    const steps8 = COURSE_CHAPTERS.map((chapter) => {
      const done = chapter.lessons.filter((lesson) => courseCompleted.has(lesson.id)).length;
      const state = done === chapter.lessons.length && done > 0 ? 'is-done' : done ? 'is-part' : '';
      return `<i class="${state}" title="${escapeHtml(chapter.title)}：${done}/${chapter.lessons.length}"></i>`;
    }).join('');

    main.innerHTML = `
      <section class="hero hero-home hero-compact">
        <div class="hero-copy">
          <div class="hero-topline">
            <span class="hero-kicker">ELECTRONIC MUSIC FIELD NOTES / 电音档案</span>
            <span class="mono-label">${familyTotal} 大族 · ${formatNumber(stats.entries)} 条</span>
          </div>
          <h1 class="hero-title">
            <span class="hero-title-line">听见差别。</span>
            <span class="hero-title-line"><em>找到你的声音。</em></span>
          </h1>
          <p class="hero-lead">从一小节鼓点出发，听懂风格，查清来路，再做出自己的音乐。不用先记住名字，先让耳朵带路。</p>
          <div class="hero-actions">
            <a class="button-primary" href="#/tree">从风格树开始听 ${uiIcon('arrow')}</a>
            <a class="button-ghost" href="${startHref}">${completedCount ? `继续第 ${nextNumber} 课` : '动手做一段音乐'}</a>
          </div>
          <p class="hero-scale">
            <span><b>${styleTotal}</b> 段可听</span>
            <span><b>${formatNumber(stats.entries)}</b> 条资料</span>
            <span><b>${total}</b> 节课</span>
            <span><b>${familyTotal}</b> 个大族</span>
          </p>
        </div>
        <aside class="hero-console" data-hero-console>
          <div class="console-top">
            <span class="console-live"><i aria-hidden="true"></i> LIVE PATCH</span>
            <span>128 BPM · 4/4</span>
          </div>
          <div class="console-heading">
            <div>
              <span class="mono-label">ONE BAR / 合成示例</span>
              <h2>Kick. Clap. Hat.</h2>
            </div>
            <span class="console-eight">8 STEPS</span>
          </div>
          ${heroSequencerHTML(heroPattern)}
          <div class="console-actions">
            <button class="console-play" type="button" data-hero-play>${uiIcon('play')} 播放这一小节</button>
            <a class="console-start" href="#/lab">进实验室 ${uiIcon('arrow')}</a>
          </div>
          <div class="console-foot">
            <span>点格子改节奏，再播放</span>
            <span>非原曲</span>
            <span class="console-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          </div>
        </aside>
      </section>

      <section class="home-archive" aria-labelledby="homeArchiveTitle">
        <div class="home-archive-copy">
          <span class="mono-label">THE ARCHIVE / 风格索引</span>
          <h2 id="homeArchiveTitle">电音档案</h2>
          <p>${formatNumber(stats.entries)} 条风格资料，从声音特征到历史脉络。沿着一条线索，找到下一种值得听的声音。</p>
          <a class="button-primary" data-archive-entry href="#/archive">打开完整档案 ${uiIcon('arrow')}</a>
        </div>
        <div class="home-archive-index">
          ${KB.families.filter((family) => ['House', 'Techno', 'Breakbeat', 'Ambient'].includes(family.name)).map((family) => `
            <a class="home-family" href="#/family/${family.id}">
              <span class="home-family-code">${escapeHtml(FAMILY_CODES[family.name])}</span>
              <strong>${escapeHtml(family.name)}</strong><span>${family.count} 条</span>${uiIcon('arrow')}
            </a>`).join('')}
          <a class="home-archive-all" href="#/archive">浏览全部 ${familyTotal} 个大族 ${uiIcon('arrow')}</a>
        </div>
      </section>

      <section class="rack" aria-labelledby="rackTitle">
        <div class="rack-head">
          <div>
            <span class="mono-label">FOUR TRACKS / 四个入口</span>
            <h2 id="rackTitle">今天，想从哪里开始？</h2>
          </div>
          <p>先听、再查，也可以直接动手。按你的节奏来。</p>
        </div>
        <div class="rack-grid">

          <article class="track track-listen" aria-labelledby="trackListen">
            <header class="track-head">
              <span class="track-num" aria-hidden="true">01</span>
              <span class="track-code">LISTEN</span>
              <span class="track-stat">${styleTotal} 个风格</span>
            </header>
            <h3 class="track-title" id="trackListen"><a href="#/tree">树</a></h3>
            <p class="track-line">不知道这是什么？从大族开始，一层层点开分支，每点一个节点就直接听到它的声音，路径随时看得见。</p>
            <div class="track-visual">
              <div class="mm" role="img" aria-label="${LISTEN.bands.length} 档速度 × ${LISTEN.grooves.length} 种律动，共 ${LISTEN.bands.length * LISTEN.grooves.length} 格，${styleTotal} 个风格分布其中">${mm}</div>
              <p class="visual-cap">4 档速度 × 5 种律动 · 亮点表示那一格的风格数</p>
            </div>
            <ul class="track-links">
              <li><a href="#/tree">风格树</a></li>
              <li><a href="#/quick">现场速查</a></li>
              ${randomStyle ? `<li><a href="#/genre/${randomStyle.id}">随便听一条</a></li>` : ''}
            </ul>
          </article>

          <article class="track track-search" aria-labelledby="trackSearch">
            <header class="track-head">
              <span class="track-num" aria-hidden="true">02</span>
              <span class="track-code">SEARCH</span>
              <span class="track-stat">${formatNumber(stats.entries)} 条</span>
            </header>
            <h3 class="track-title" id="trackSearch"><a href="#/library">查</a></h3>
            <p class="track-line">每个名词都有出处。检索条目、术语、结构文档，再沿上下位与相似关系一路追下去。</p>
            <div class="track-visual">
              <form class="track-search" id="homeKbSearch" role="search">
                <label class="sr-only" for="homeKbSearchInput">搜索知识库</label>
                <input id="homeKbSearchInput" name="q" type="search" placeholder="Sidechain、808、八段结构…" autocomplete="off">
                <button type="submit" aria-label="检索">${uiIcon('search')}</button>
              </form>
              <div class="track-chips">
                ${['Supersaw', 'Sidechain', '808', 'Acid'].map((term) => `<a class="chip" href="#/search?q=${encodeURIComponent(term)}">${escapeHtml(term)}</a>`).join('')}
              </div>
            </div>
            <ul class="track-links">
              <li><a href="#/search">全库检索</a></li>
              <li><a href="#/atlas">风格图谱</a></li>
              <li><a href="#/guide/glossary">术语手册</a></li>
            </ul>
          </article>

          <article class="track track-train" aria-labelledby="trackTrain">
            <header class="track-head">
              <span class="track-num" aria-hidden="true">03</span>
              <span class="track-code">TRAIN</span>
              <span class="track-stat">2 种模式</span>
            </header>
            <h3 class="track-title" id="trackTrain"><a href="#/practice">练</a></h3>
            <p class="track-line">把耳朵校准到制作决定上。风格四选一、BPM 估速，答错不是失败——它会把你送回对应的那一课。</p>
            <div class="track-visual">
              <div class="bpmr" aria-hidden="true">
                <div class="bpmr-scale">
                  ${Array.from({ length: 13 }, (_, index) => `<i class="${index % 3 === 0 ? 'is-major' : ''}"></i>`).join('')}
                  <b style="--pos:62%"><span>128</span></b>
                </div>
              </div>
              <p class="visual-cap">100 — 160 BPM · 四选一 / 估速</p>
            </div>
            <ul class="track-links">
              <li><a href="#/practice">听辨练习</a></li>
              <li><a href="#/practice?mode=bpm">BPM 估速</a></li>
              <li><a href="#/lab">音色实验室</a></li>
              <li><a href="#/dj/course">DJ 修炼手册</a></li>
              <li><a href="#/dj/field-guide">DJ 现场手册</a></li>
              <li><a href="#/start">新手 7 天计划</a></li>
            </ul>
          </article>

          <article class="track track-make" aria-labelledby="trackMake">
            <header class="track-head">
              <span class="track-num" aria-hidden="true">04</span>
              <span class="track-code">MAKE</span>
              <span class="track-stat">${total} 课 · 9 模块</span>
            </header>
            <h3 class="track-title" id="trackMake"><a href="#/learn">做</a></h3>
            <p class="track-line">从第一段鼓点到混音导出。跟着制作课走，在九个工作室模块里边学边做。</p>
            <div class="track-visual">
              <div class="steps8" role="img" aria-label="8 个阶段，已完成 ${completedCount} / ${total} 课">${steps8}</div>
              <p class="visual-cap">8 个阶段 · 已完成 ${completedCount}/${total} 课</p>
            </div>
            <ul class="track-links">
              <li><a href="${startHref}">${completedCount ? '继续学习' : '从第一课开始'}</a></li>
              <li><a href="#/studio">工作室</a></li>
              <li><a href="#/learn">课程地图</a></li>
            </ul>
          </article>

        </div>
      </section>

      <section class="daily" aria-labelledby="dailyTitle">
        <span class="mono-label" id="dailyTitle">PICK / 今天听这条</span>
        <div class="daily-copy">
          <strong data-daily-name>${homeDaily ? `${escapeHtml(homeDaily.entry.name)} · ${homeDaily.model.bpm} BPM` : '—'}</strong>
          <p data-daily-line>${homeDaily ? escapeHtml(homeDaily.model.oneLine) : ''}</p>
        </div>
        <div class="daily-actions">
          <button class="button-primary" type="button" data-daily-play>播放 8 秒</button>
          <a class="button-ghost" data-daily-href href="${homeDaily ? `#/genre/${homeDaily.id}` : '#/tree'}">完整条目 →</a>
          <button class="daily-shuffle" type="button" data-daily-shuffle>换一条</button>
        </div>
      </section>
      <section class="home-tools" aria-label="DJ 与制作工具">
        <a href="#/dj/automix"><div><span class="mono-label">DJ / AUTOMIX</span><h2>让两首歌，接得上。</h2><p>试听示例 Set，查看乐句与过渡；本机引擎可接入 Rekordbox。</p></div>${uiIcon('arrow')}</a>
        <a href="#/start"><div><span class="mono-label">YOUR FIRST WEEK</span><h2>把第一周，交给耳朵。</h2><p>每天一个小任务，从认鼓点到完成一段自己的 Loop。</p></div>${uiIcon('arrow')}</a>
      </section>`;

    bindHomeSequencer();
    bindHomeDaily();
  }

  function renderArchive(route) {
    const sections = [
      { id: 'styles', label: '风格档案', code: 'STYLES' },
      { id: 'learn', label: '学习路径', code: 'LEARN' },
      { id: 'tools', label: 'DJ 与制作', code: 'TOOLS' },
      { id: 'sources', label: '资料来源', code: 'SOURCES' },
    ];
    const selected = route.params.get('section');
    const section = sections.some((item) => item.id === selected) ? selected : 'styles';
    const families = KB.families.filter((family) => !family.archive && !family.supplement);
    const moduleCard = (href, code, title, text, action) => `
      <a class="archive-module" href="${href}">
        <span class="mono-label">${escapeHtml(code)}</span><h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p><span class="archive-module-link">${escapeHtml(action)} ${uiIcon('arrow')}</span>
      </a>`;
    let content;
    if (section === 'learn') {
      content = `
        <div class="archive-section-head"><div><span class="mono-label">LEARNING PATHS</span><h2>从第一次听，到第一次完成。</h2></div><a class="section-link" href="#/start">我的学习进度 ${uiIcon('arrow')}</a></div>
        <div class="archive-modules">
          ${moduleCard('#/start', 'START / 7 DAYS', '新手七天计划', '每天一个短任务，把听、查、练、做串成一条能走完的路。', '开始第一周')}
          ${moduleCard('#/learn', `PRODUCTION / ${COURSE_LESSONS.length} LESSONS`, '音乐制作课', '从轨道与信号链，到低音、和声、结构、混音和导出。', '打开课程地图')}
          ${moduleCard('#/dj/course', `DJ / ${DJ_COURSE?.episodeCount || 0} LESSONS`, 'DJ 修炼手册', '沿课程学习节拍、乐句、接歌和选曲，完成情况保存在当前浏览器。', '进入 DJ 课程')}
        </div>
        <div class="archive-section-head"><div><span class="mono-label">PRODUCTION ROADMAP</span><h2>八个阶段，逐步做出一首歌。</h2></div><p>进度仅保存在当前设备，不会跨站点同步。</p></div>
        <ol class="archive-chapters">${COURSE_CHAPTERS.map((chapter, index) => {
          const done = chapter.lessons.filter((lesson) => courseCompleted.has(lesson.id)).length;
          const next = chapter.lessons.find((lesson) => !courseCompleted.has(lesson.id)) || chapter.lessons[0];
          return `<li><a class="archive-chapter" href="#/learn/${next.id}"><span class="archive-chapter-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${escapeHtml(chapter.title)}</h3><p>${done} / ${chapter.lessons.length} 课完成</p></div>${uiIcon('arrow')}</a></li>`;
        }).join('')}</ol>`;
    } else if (section === 'tools') {
      content = `
        <div class="archive-section-head"><div><span class="mono-label">WORKBENCH</span><h2>把听到的，变成自己的。</h2></div><p>从浏览器练习到本机接歌，按需选择。</p></div>
        <div class="archive-modules">
          ${moduleCard('#/studio', 'CREATE / 9 MODULES', '音乐工作室', '编鼓、写低音与旋律、排结构、混音，最后导出 WAV。', '打开工作室')}
          ${moduleCard('#/lab', 'SOUND / EXPERIMENT', '音色实验室', '拆开鼓、低音与合成器，一次只改一个参数，听清差别。', '进入实验室')}
          ${moduleCard('#/practice', 'EAR / TRAINING', '听辨与估速', '风格四选一、BPM 估速，把模糊的感觉练成有依据的判断。', '开始练习')}
          ${moduleCard('#/dj', 'DJ / TRANSITION', '接歌过渡检查', '对照速度、律动与风格，查看可执行的衔接建议。', '检查两种风格')}
          ${moduleCard('#/dj/automix', 'DJ / AUTOMIX', '自动接歌台', '试听离线生成的示例 Set，查看选曲、乐句对齐和 Double Drop。', '打开接歌台')}
          ${moduleCard('#/dj/field-guide', 'DJ / FIELD GUIDE', '现场手册', '演出前检查、现场判断与应急处理，放进随手能查的清单。', '打开现场清单')}
        </div>
        <div class="archive-note"><strong>浏览器工具与本机引擎，各有边界。</strong><p>工作室与练习在浏览器内运行。自动接歌台的真实曲库分析、Demucs 分轨与 Rekordbox 写回需要本机 djcore 服务；本站托管版提供示例试听与过渡报告，不会访问你的本地曲库。</p></div>`;
    } else if (section === 'sources') {
      content = `
        <div class="archive-section-head"><div><span class="mono-label">READ / TRACE / VERIFY</span><h2>每一条资料，都有来路。</h2></div><p>资料更新至 ${escapeHtml(CUR.updated)}。</p></div>
        <div class="archive-modules">
          ${moduleCard('#/about', 'PROVENANCE', '来源与勘误', '查看原始资料、整理边界、待补条目与勘误说明。', '核对资料来源')}
          ${moduleCard('#/search', 'FULL-TEXT SEARCH', '全库检索', '在风格条目、术语、DJ 课程与结构文档中交叉查证。', '检索全部内容')}
          ${moduleCard('#/module', 'AGENT / MCP / CLI', '知识库模块', '供本地工具和 Agent 使用的检索接口、数据产物与接入说明。', '查看接入方式')}
        </div>
        <div class="archive-section-head"><div><span class="mono-label">READING ROOM</span><h2>用专题，把线索串起来。</h2></div></div>
        <div class="archive-reading-list">
          ${moduleCard('#/guide/history', 'HISTORY', '历史脉络', '把风格放回它出现的时代，而不是只记一个标签。', '阅读专题')}
          ${moduleCard('#/guide/production', 'PRODUCTION', '结构与音色', '用音乐制作的视角，理解听到的段落与声部。', '阅读专题')}
          ${moduleCard('#/guide/glossary', 'GLOSSARY', '术语手册', '查清 BPM、侧链、音色与结构背后的常用概念。', '查阅术语')}
        </div>
        <div class="archive-note"><strong>学习用的声音，不冒充原曲。</strong><p>风格示例由浏览器合成；例曲仅提供来源链接和可用的第三方短试听，不提供原曲下载。归档与补遗保留原始整理边界，不把待补资料当成完整结论。</p></div>`;
    } else {
      content = `
        <div class="archive-section-head"><div><span class="mono-label">FIND YOUR WAY IN</span><h2>先从一种声音开始。</h2></div><a class="section-link" href="#/tree">逐级试听 ${listenStyles().length} 种风格 ${uiIcon('arrow')}</a></div>
        <div class="archive-featured">
          <a class="archive-feature" href="#/tree"><span class="mono-label">BY SOUND / 听声音</span><h3>这是什么风格？</h3><p>从大族往下逐级展开，点到哪个听哪个，不用先知道流派名。</p><span class="archive-feature-link">打开风格树 ${uiIcon('arrow')}</span></a>
          <a class="archive-feature" href="#/atlas"><span class="mono-label">BY CONNECTION / 看关系</span><h3>它们怎么相连？</h3><p>沿着上下位、起源与相似关系，追一条风格线索。</p><span class="archive-feature-link">浏览风格图谱 ${uiIcon('arrow')}</span></a>
          <a class="archive-feature" href="#/quick"><span class="mono-label">IN THE FIELD / 随手查</span><h3>下一首，怎么认？</h3><p>一张卡片一个风格，把听点带到现场。</p><span class="archive-feature-link">打开现场速查 ${uiIcon('arrow')}</span></a>
        </div>
        <div class="archive-section-head"><div><span class="mono-label">FAMILY INDEX / ${families.length} FAMILIES</span><h2>完整大族目录</h2></div><a class="section-link" href="#/library">查看全部条目 ${uiIcon('arrow')}</a></div>
        <div class="archive-directory">${families.map((family) => `
          <a class="archive-family ${familyClass(family.color)}" data-archive-family href="#/family/${family.id}">
            <span class="archive-family-code">${escapeHtml(FAMILY_CODES[family.name])}</span>
            <div><h3>${escapeHtml(family.name)}</h3><p>${escapeHtml(family.zh || '')}</p></div>
            <span class="archive-family-count">${family.count}<span> 条目</span></span>${uiIcon('arrow')}
          </a>`).join('')}</div>
        <div class="archive-note"><p>目录按知识库原有大族组织，不是风格排名。另有 ${KB.families.filter((family) => family.supplement).length} 组编辑补遗与待归档资料。</p><a class="section-link" href="#/atlas">查看补遗与归档 ${uiIcon('arrow')}</a></div>`;
    }
    main.innerHTML = `
      <section class="archive-header">
        <div class="archive-breadcrumb"><a href="#/">首页</a><span>/ 档案总览</span></div>
        <div class="archive-intro"><div><span class="mono-label">ELECTRONIC MUSIC FIELD NOTES</span><h1>电音档案<span>从风格到作品。</span></h1><p>听一段声音，读一条脉络，再动手试一次。你需要的线索，都在这里。</p></div>
          <dl class="archive-count"><div><dt>风格条目</dt><dd>${formatNumber(KB.meta.stats.entries)}</dd></div><div><dt>音乐大族</dt><dd>${families.length}</dd></div></dl>
        </div>
        <form class="archive-search" id="archiveSearch" role="search"><label class="sr-only" for="archiveQuery">搜索档案：风格、艺人、术语或课程</label>${uiIcon('search')}<input id="archiveQuery" name="q" type="search" placeholder="搜索风格、艺人、术语或课程" autocomplete="off"><button type="submit">检索档案 ${uiIcon('arrow')}</button></form>
        <p class="archive-search-hint">试试 ${['House', 'Techno', 'Sidechain', 'Double Drop'].map((term) => `<a href="#/search?q=${encodeURIComponent(term)}">${escapeHtml(term)}</a>`).join('')}</p>
      </section>
      <nav class="archive-nav" aria-label="档案分区">${sections.map((item) => `<a href="${item.id === 'styles' ? '#/archive' : `#/archive?section=${item.id}`}"${section === item.id ? ' aria-current="page"' : ''}><span>${item.label}</span><small>${item.code}</small></a>`).join('')}</nav>
      <section class="archive-content" aria-label="${sections.find((item) => item.id === section).label}">${content}</section>`;
    document.getElementById('archiveSearch').addEventListener('submit', (event) => {
      event.preventDefault();
      const query = new FormData(event.currentTarget).get('q')?.toString().trim() || '';
      navigate(query ? `#/search?q=${encodeURIComponent(query)}` : '#/search');
    });
  }

  let homeDaily = null;

  function bindHomeDaily() {
    const play = document.querySelector('[data-daily-play]');
    play?.addEventListener('click', () => {
      if (!homeDaily || !Audio) return;
      const state = Audio.getState();
      if (state.playing && state.demoId === `fp:${homeDaily.model.fp}`) {
        Audio.stop();
        return;
      }
      Audio.playFingerprint(homeDaily.model.fp, {
        bpm: homeDaily.model.bpm,
        label: `${homeDaily.entry.name} · ${homeDaily.model.bpm} BPM`,
      });
    });

    document.querySelector('[data-daily-shuffle]')?.addEventListener('click', () => {
      const styles = listenStyles();
      if (!styles.length) return;
      let pick = styles[Math.floor(Math.random() * styles.length)];
      if (styles.length > 1 && homeDaily && pick.id === homeDaily.id) {
        pick = styles[(styles.indexOf(pick) + 1) % styles.length];
      }
      homeDaily = pick;
      const name = document.querySelector('[data-daily-name]');
      const line = document.querySelector('[data-daily-line]');
      const href = document.querySelector('[data-daily-href]');
      if (name) name.textContent = `${pick.entry.name} · ${pick.model.bpm} BPM`;
      if (line) line.textContent = pick.model.oneLine;
      if (href) href.setAttribute('href', `#/genre/${pick.id}`);
      if (Audio) {
        const state = Audio.getState();
        if (state.playing && state.demoId?.startsWith('fp:')) Audio.stop();
      }
    });
  }

  // Atlas

  function atlasStateFromParams(params) {
    const familyParam = params.get('family') || '';
    const family = familyById.has(familyParam) ? familyParam : '';
    return {
      q: params.get('q') || '',
      family,
      bpmMin: params.get('bpmMin') || '',
      bpmMax: params.get('bpmMax') || '',
      examplesOnly: params.get('ex') === '1',
      all: params.get('all') === '1',
      limit: 60,
    };
  }

  function atlasParams(state) {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.family) params.set('family', state.family);
    if (state.bpmMin) params.set('bpmMin', state.bpmMin);
    if (state.bpmMax) params.set('bpmMax', state.bpmMax);
    if (state.examplesOnly) params.set('ex', '1');
    if (state.all) params.set('all', '1');
    return params.toString();
  }

  function hasAtlasFilter(state) {
    return Boolean(state.q || state.family || state.bpmMin || state.bpmMax || state.examplesOnly || state.all);
  }

  function bpmFilterActive(state) {
    return Boolean(state.bpmMin || state.bpmMax);
  }

  function applyBpmFilter(entries, state) {
    if (!bpmFilterActive(state)) return entries;
    const values = [Number(state.bpmMin), Number(state.bpmMax)].filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return entries;
    const low = Math.min(...values);
    const high = Math.max(...values, low);
    return entries.filter((entry) => entry.bpm && entry.bpm.max >= low && entry.bpm.min <= high);
  }

  function searchEntries(query) {
    const terms = query.trim().split(/\s+/).map(norm).filter(Boolean);
    if (!terms.length) return [];
    const results = [];
    for (const item of searchIndex) {
      let score = 0;
      let matchesAll = true;
      for (const term of terms) {
        let termScore = 0;
        if (item.name === term) termScore = 130;
        else if (item.name.startsWith(term)) termScore = 95;
        else if (item.name.includes(term)) termScore = 75;
        else if (item.aliases.includes(term)) termScore = 55;
        else if (item.examples.includes(term)) termScore = 42;
        else if (item.family.includes(term)) termScore = 32;
        else if (item.summary.includes(term)) termScore = 22;
        else if (item.desc.includes(term)) termScore = 13;
        else if (item.rel.includes(term)) termScore = 8;
        else {
          matchesAll = false;
          break;
        }
        score += termScore;
      }
      if (matchesAll) results.push({ entry: item.entry, score });
    }
    results.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length || a.entry.line - b.entry.line);
    return results.map((item) => item.entry);
  }

  function filteredEntries(state) {
    let entries;
    if (state.q) {
      entries = searchEntries(state.q);
      if (state.family) entries = entries.filter((entry) => entry.familyId === state.family);
    } else if (state.family) {
      entries = [...(familyEntries.get(state.family) || [])];
    } else {
      entries = [...KB.entries];
    }
    entries = applyBpmFilter(entries, state);
    if (state.examplesOnly) entries = entries.filter((entry) => entry.examples.length > 0);
    if (!state.q) entries.sort((a, b) => a.line - b.line);
    return entries;
  }

  function treeHTML(state) {
    const selectedFamily = state.family;
    const renderFamily = (family) => {
      const isExpanded = expandedTree.has(family.id);
      const isSelected = selectedFamily === family.id;
      return `
        <div class="tree-family ${familyClass(family.color)}${isSelected ? ' is-selected' : ''}">
          <button class="tree-toggle${family.childIds.length ? '' : ' is-leaf'}" type="button" data-tree-toggle="${family.id}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? '收起' : '展开'} ${escapeHtml(family.name)}">${family.childIds.length ? (isExpanded ? '−' : '+') : ''}</button>
          <span class="tree-family-dot"></span>
          <a class="tree-family-link" href="#/atlas?family=${family.id}" title="${escapeHtml(family.name)}${family.zh ? ` · ${escapeHtml(family.zh)}` : ''}" data-tooltip="${escapeHtml(`${family.name}${family.zh ? ` / ${family.zh}` : ''} · ${family.count} 个条目`)}">${escapeHtml(family.name)}</a>
          <span class="tree-family-count">${family.count}</span>
        </div>
        ${isExpanded ? `<div class="tree-children">${family.childIds.map((id) => treeNodeHTML(entryById.get(id), state)).join('')}</div>` : ''}`;
    };
    const active = KB.families.filter((family) => !family.archive && !family.supplement);
    const supplements = KB.families.filter((family) => family.supplement);
    const archive = KB.families.filter((family) => family.archive);
    return `
      <div class="tree-panel-head">
        <span class="mono-label">INDEX / 分类浏览</span>
        <span class="mono-label">${formatNumber(KB.meta.stats.entries)}</span>
      </div>
      <div class="tree-root">
        ${active.map(renderFamily).join('')}
        ${supplements.length ? `<div class="tree-group-label">补充收纳桶</div>${supplements.map(renderFamily).join('')}` : ''}
        ${archive.map(renderFamily).join('')}
      </div>`;
  }

  function treeNodeHTML(entry, state) {
    if (!entry) return '';
    const isExpanded = expandedTree.has(entry.id);
    const hasChildren = entry.childrenIds.length > 0;
    return `
      <div class="tree-node">
        <div class="tree-row">
          <button class="tree-toggle${hasChildren ? '' : ' is-leaf'}" type="button" data-tree-toggle="${entry.id}" aria-expanded="${isExpanded}" aria-label="${isExpanded ? '收起' : '展开'} ${escapeHtml(entry.name)}">${hasChildren ? (isExpanded ? '−' : '+') : ''}</button>
          <a class="tree-link" href="#/genre/${entry.id}" title="${escapeHtml(entry.pathNames.join(' / '))}" data-tooltip="${escapeHtml(entry.pathNames.join(' / '))}">${escapeHtml(entry.name)}</a>
          ${hasChildren ? `<span class="tree-count">${countDescendants(entry)}</span>` : ''}
        </div>
        ${isExpanded && hasChildren ? `<div class="tree-children">${entry.childrenIds.map((id) => treeNodeHTML(entryById.get(id), state)).join('')}</div>` : ''}
      </div>`;
  }

  function genreCard(entry, query) {
    const examples = entry.examples.length;
    const stub = entry.stub ? `<span class="chip is-warn">${entry.stubReason === 'crossref' ? '交叉引用' : '资料待补'}</span>` : '';
    return `
      <a class="genre-card ${familyClass(entry.familyColor)}${entry.stub ? ' is-stub' : ''}" href="#/genre/${entry.id}">
        <div class="card-top">
          <span class="family-tag">${escapeHtml(entry.familyName)}</span>
          <span class="card-line">L${entry.line}</span>
        </div>
        <h3>${highlight(entry.name, query)}</h3>
        ${entry.aliases.length ? `<p class="aliases">A.K.A. ${entry.aliases.slice(0, 3).map(escapeHtml).join(' / ')}</p>` : ''}
        <p class="summary">${highlight(entry.summary || '原始资料暂未展开这一条目。', query)}</p>
        <div class="card-meta">
          ${bpmRuler(entry.bpm)}
          <div class="chip-row">${traitChips(entry.traits, 2)}${stub}</div>
        </div>
        <div class="card-foot">
          <span>${examples ? `${examples} 条例曲` : '暂无例曲'}</span>
          <span class="arrow">↗</span>
        </div>
      </a>`;
  }

  function familyCard(family) {
    const kind = family.archive ? 'ARCHIVE' : family.supplement ? 'SUPPLEMENT' : 'FAMILY';
    return `
      <a class="family-card ${familyClass(family.color)}" href="#/family/${family.id}">
        <div class="family-card-top">
          <span class="mono-label">${kind}</span>
          <span class="mono-label">${family.count} ENTRIES</span>
        </div>
        <h3>${escapeHtml(family.name)}</h3>
        <div class="family-zh">${escapeHtml(family.zh || '')}</div>
        <p>${escapeHtml(family.introSummary || '收录这个方向的条目、关系与例曲。')}</p>
        <div class="family-card-foot"><span>${family.childIds.length} 个下级分组</span><span>↗</span></div>
      </a>`;
  }

  function familyOverviewHTML() {
    const active = KB.families.filter((family) => !family.archive && !family.supplement);
    const supplements = KB.families.filter((family) => family.supplement);
    const archive = KB.families.filter((family) => family.archive);
    return `
      <div class="atlas-overview-head">
        <div>
          <div class="results-title">${active.length} 个大族，一张可继续修订的地图</div>
          <div class="results-meta">先选一个大族，或者直接用上方搜索与 BPM 筛选。也可以浏览全部 ${formatNumber(KB.meta.stats.entries)} 条。</div>
        </div>
        <div class="results-actions">
          <button class="toolbar-button" type="button" data-random>随机一条</button>
          <a class="toolbar-button" href="#/atlas?all=1">全部条目</a>
        </div>
      </div>
      <div class="family-grid">
        ${active.map(familyCard).join('')}
      </div>
      ${supplements.length ? `
        <div class="atlas-overview-head is-secondary">
          <div>
            <div class="results-title">${supplements.length} 个补充收纳桶</div>
            <div class="results-meta">为补齐覆盖度而追加的分组。桶内条目各自有正确的上位关系（例如 Psybient → Ambient），分组本身不代表音乐分类。</div>
          </div>
        </div>
        <div class="family-grid">
          ${supplements.map(familyCard).join('')}
        </div>` : ''}
      ${archive.length ? `
        <div class="family-grid">
          ${archive.map(familyCard).join('')}
        </div>` : ''}`;
  }

  function familySummaryHTML(family, state) {
    if (!family) return '';
    const kind = family.archive ? 'ARCHIVE / 待归档' : family.supplement ? 'SUPPLEMENT / 补充收纳桶' : 'FAMILY / 大族';
    return `
      <div class="family-summary ${familyClass(family.color)}">
        <div>
          <div class="mono-label">${kind}</div>
          <h2>${escapeHtml(family.name)}${family.zh ? ` <span>${escapeHtml(family.zh)}</span>` : ''}</h2>
          <p>${escapeHtml(stripLong(family.introSummary || family.intro || '这个分组还没有简介。', 220))}</p>
        </div>
        <a class="button-ghost" href="#/family/${family.id}">家族页 →</a>
      </div>`;
  }

  function resultsHTML(state) {
    const entries = filteredEntries(state);
    const visible = entries.slice(0, state.limit);
    const query = state.q;
    const family = state.family ? familyById.get(state.family) : null;
    let title = '全部条目';
    let meta = `${formatNumber(entries.length)} 条`;
    if (query) {
      title = '搜索结果';
      meta = `“${query}” · ${formatNumber(entries.length)} 条`;
    } else if (family) {
      title = family.name;
      meta = `${formatNumber(entries.length)} 条 · ${family.zh || '按原文顺序'}`;
    }
    if (bpmFilterActive(state)) meta += ` · BPM ${state.bpmMin || '60'}–${state.bpmMax || '300'}`;
    if (state.examplesOnly) meta += ' · 仅有例曲';
    return `
      <div class="results-head">
        <div>
          <div class="results-title">${escapeHtml(title)}</div>
          <div class="results-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="results-actions">
          <button class="toolbar-button" type="button" data-random>随机一条</button>
          ${family ? `<a class="toolbar-button" href="#/atlas?family=${family.id}">只看本族</a>` : ''}
        </div>
      </div>
      ${family && !query ? familySummaryHTML(family, state) : ''}
      ${entries.length === 0 ? `
        <div class="result-empty">
          <h3>没有匹配的风格</h3>
          <p>试试更短的关键词，或清除 BPM 筛选。只有原始资料明确写出数字的 ${formatNumber(KB.meta.stats.bpmEntries)} 个条目能通过 BPM 筛选。</p>
          <a class="button-ghost" href="#/atlas">清除全部筛选</a>
        </div>` : `
        <div class="genre-grid">${visible.map((entry) => genreCard(entry, query)).join('')}</div>
        ${entries.length > visible.length ? `<div class="load-more-row"><button class="button-ghost" type="button" data-load-more>加载更多（还有 ${formatNumber(entries.length - visible.length)} 条）</button></div>` : ''}
      `}`;
  }

  function renderAtlasMain(state) {
    if (!hasAtlasFilter(state)) return familyOverviewHTML();
    return resultsHTML(state);
  }

  function renderAtlasTree(state) {
    return treeHTML(state);
  }

  function refreshAtlasTrees() {
    if (!atlas) return;
    const desktop = document.getElementById('treeDesktop');
    const mobile = document.getElementById('treeMobile');
    const scroll = desktop ? desktop.scrollTop : 0;
    const html = renderAtlasTree(atlas);
    if (desktop) {
      desktop.innerHTML = html;
      desktop.scrollTop = scroll;
    }
    if (mobile) mobile.innerHTML = html;
  }

  function updateAtlasURL(state) {
    const query = atlasParams(state);
    replaceHash(`#/atlas${query ? `?${query}` : ''}`);
  }

  function updateAtlas(patch, resetLimit = true) {
    if (!atlas) return;
    atlas = { ...atlas, ...patch };
    if (resetLimit) atlas.limit = 60;
    updateAtlasURL(atlas);
    const mainPanel = document.getElementById('atlasMain');
    if (mainPanel) mainPanel.innerHTML = renderAtlasMain(atlas);
    refreshAtlasTrees();
    const search = document.getElementById('atlasSearch');
    if (search && patch.q === undefined && document.activeElement !== search) {
      // Keep the field as the source of truth; no-op.
    }
  }

  function renderAtlas(route) {
    const state = atlasStateFromParams(route.params);
    atlas = state;
    if (state.family) expandedTree.add(state.family);
    const familiesOptions = KB.families.map((family) => {
      const tag = family.archive ? '（待归档）' : family.supplement ? '（补充桶）' : '';
      return `<option value="${family.id}"${state.family === family.id ? ' selected' : ''}>${escapeHtml(family.name)}${tag} · ${family.count}</option>`;
    }).join('');
    main.innerHTML = `
      ${pageHead({
        code: '04',
        label: 'ATLAS',
        title: '风格图谱',
        lead: '按大族、别名、BPM 或关键词检索。每条都保留原文档的上下位关系、例曲与未完成状态。',
        stats: [
          { label: '大族', value: formatNumber(KB.meta.stats.families) },
          { label: '条目', value: formatNumber(KB.meta.stats.entries) },
          { label: '有 BPM', value: formatNumber(KB.meta.stats.bpmEntries) },
        ],
        action: { href: '#/search', label: '搜全库' },
      })}
      <div class="atlas-toolbar">
        <label class="atlas-search">
          <span class="sr-only">搜索风格、别名、艺人或例曲</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 5 5"></path></svg>
          <input id="atlasSearch" type="search" value="${escapeHtml(state.q)}" placeholder="搜索风格、别名、艺人或例曲…" autocomplete="off">
        </label>
        <select class="filter-select" id="atlasFamily" aria-label="按大族筛选">
          <option value="">全部大族</option>
          ${familiesOptions}
        </select>
        <div class="toolbar-group">
          <span class="mono-label">BPM</span>
          <input class="filter-input" id="bpmMin" type="number" inputmode="numeric" min="60" max="300" placeholder="60" value="${escapeHtml(state.bpmMin)}" aria-label="最低 BPM" data-tooltip="仅对原始资料明确写出 BPM 数字的 ${formatNumber(KB.meta.stats.bpmEntries)} 个条目生效">
          <span class="mono-label">—</span>
          <input class="filter-input" id="bpmMax" type="number" inputmode="numeric" min="60" max="300" placeholder="300" value="${escapeHtml(state.bpmMax)}" aria-label="最高 BPM" data-tooltip="仅对原始资料明确写出 BPM 数字的 ${formatNumber(KB.meta.stats.bpmEntries)} 个条目生效">
        </div>
        <button class="toolbar-button${state.examplesOnly ? ' is-active' : ''}" id="examplesOnly" type="button" aria-pressed="${state.examplesOnly}" data-tooltip="只显示原始资料列有例曲的条目">有例曲</button>
        <a class="toolbar-button" href="#/tree" data-tooltip="逐级展开风格分类，不需要先知道流派名">按风格树找</a>
        <a class="toolbar-button" href="#/tree" data-tooltip="顺着分叉走，看每一条从哪来、分到哪去">看分支树</a>
        <button class="toolbar-button" id="atlasClear" type="button">清除</button>
      </div>
      <div class="atlas-layout">
        <aside class="tree-panel" id="treeDesktop" aria-label="风格分类树">${renderAtlasTree(state)}</aside>
        <details class="tree-mobile">
          <summary>浏览分类</summary>
          <div class="tree-panel" id="treeMobile">${renderAtlasTree(state)}</div>
        </details>
        <div class="atlas-main" id="atlasMain">${renderAtlasMain(state)}</div>
      </div>`;

    bindAtlasEvents();
  }

  function bindAtlasEvents() {
    const search = document.getElementById('atlasSearch');
    const familySelect = document.getElementById('atlasFamily');
    const bpmMin = document.getElementById('bpmMin');
    const bpmMax = document.getElementById('bpmMax');
    const examplesOnly = document.getElementById('examplesOnly');
    const clear = document.getElementById('atlasClear');
    if (!search || !atlas) return;

    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        updateAtlas({ q: search.value.trim() });
      }, 160);
    });

    familySelect.addEventListener('change', () => {
      const family = familySelect.value;
      if (family) expandedTree.add(family);
      updateAtlas({ family });
    });

    [bpmMin, bpmMax].forEach((input) => {
      input.addEventListener('change', () => {
        updateAtlas({
          bpmMin: bpmMin.value.trim(),
          bpmMax: bpmMax.value.trim(),
        });
      });
    });

    examplesOnly.addEventListener('click', () => {
      const next = examplesOnly.getAttribute('aria-pressed') !== 'true';
      examplesOnly.setAttribute('aria-pressed', String(next));
      examplesOnly.classList.toggle('is-active', next);
      updateAtlas({ examplesOnly: next });
    });

    clear.addEventListener('click', () => {
      atlas = { q: '', family: '', bpmMin: '', bpmMax: '', examplesOnly: false, all: false, limit: 60 };
      replaceHash('#/atlas');
      render();
    });
  }

  /* ==========================================================================
     分支树 / BRANCH TREE

     借鉴 Ishkur's Guide 的两件事：分类以「看得见分叉」的树出现；每个节点都能播。
     不抄它的自由画布 —— 1376 条目在画布上会迷路，列式树用结构换「找得到」。

     数据来自 data/tree.js（构建期预计算的索引），不是运行时遍历 kb.js。
     原因：每次下钻都要重渲染一列，现场递归 1376 条会有可感知的点击延迟。
     ========================================================================== */

  const TREE = window.KB_TREE || null;

  // 树页的会话状态。跨路由保留：从树里点进条目页再返回，位置不该丢。
  const treeState = {
    path: [],        // 已下钻的节点 key，决定有几列（桌面端）
    expanded: new Set(), // 已展开的节点 key（移动端纵向树的折叠状态）
    selected: null,  // 当前选中
    playing: null,   // 正在播放
    playMode: null,  // 'example' 例曲预览 | 'synth' 合成骨架 —— 引擎同步与按钮文案都要区分
    query: '',
  };
  let treeKeyHandler = null;
  let treeProgressTimer = null;
  let treeNarrowQuery = null;
  let treeNarrowListener = null;
  // 例曲查询（iTunes）是异步的：等待期间用户可能又点了别的节点，
  // 新一次播放发起后，旧查询拿到的结果直接作废，靠这个自增序号判断。
  let treePlaySeq = 0;
  // 树正在播的那首例曲（显示名 + 反馈文案）：详情卡整卡重画后靠它把
  // 「停止」按钮态补回去，否则声音还在响、界面上却没有能停的按钮。
  let treePlayingExample = null;

  // 窄屏用纵向折叠树，宽屏用横向列式。
  // 断点与 styles-tree.css 里的 767px 对齐 —— 两边不一致会出现
  // 「JS 按桌面渲染、CSS 按移动排版」的错位。
  function treeIsNarrow() {
    if (!treeNarrowQuery) treeNarrowQuery = window.matchMedia('(max-width: 767px)');
    return treeNarrowQuery.matches;
  }

  function treeReady() {
    return TREE && TREE.nodes && Object.keys(TREE.nodes).length > 0;
  }

  function treeNode(key) {
    if (!key || !treeReady()) return null;
    return TREE.nodes[key] || null;
  }

  // 声音解析已由构建期写进节点：own（专属）/ fallback（同族回退）/ 无
  function treeSound(node) {
    return node && node.sound ? node.sound : null;
  }

  // 可用的例曲列表：树播放默认优先从这里随机挑一首
  function treeExamples(node) {
    return node && Array.isArray(node.examples) ? node.examples.filter((ex) => ex && ex.title) : [];
  }

  // 节点是否有任何可播的东西（例曲或合成骨架）—— 行播放按钮的 disabled 依据
  function treePlayable(node) {
    return Boolean(treeSound(node) || treeExamples(node).length);
  }

  function treeDemoId(node) {
    const sound = treeSound(node);
    return sound ? `fp:${sound.fp}` : null;
  }

  function treeFamilyVars(color) {
    const map = {
      violet: 'var(--violet)',
      heat: 'var(--heat)',
      phosphor: 'var(--sodium)',
      ice: 'var(--cyan)',
      muted: 'var(--archive)',
    };
    return map[color] || map.muted;
  }

  // 每一列的模型：首列是大族（分三组），之后每列是上一列的下一级
  function treeColumns() {
    if (!treeReady()) return [];
    const cols = [{
      level: 0,
      label: 'ROOT / 大族',
      groups: TREE.groups,
      keys: TREE.roots,
      parentKey: null,
    }];
    treeState.path.forEach((key, index) => {
      const node = treeNode(key);
      if (!node || !node.children.length) return;
      cols.push({
        level: index + 1,
        label: `L${index + 1} / 下级`,
        groups: null,
        keys: node.children.slice(),
        parentKey: key,
      });
    });
    return cols;
  }

  // 当前节点在这一屏里是否处于展开状态。
  // 窄屏看 expanded 集合，宽屏看 path（列状态）—— 两套状态不能混用，
  // 否则切断点时会出现「标记展开但下面没有列」的空档。
  function treeIsOpen(key) {
    if (treeIsNarrow()) return treeState.expanded.has(key);
    return treeState.path.includes(key);
  }

  // index/total 用来给屏幕阅读器报「第几项，共几项」；
  // 不传也能渲染，只是少了位置信息。
  function treeRowHTML(key, index, total) {
    const node = treeNode(key);
    if (!node) return '';
    const isSelected = treeState.selected === key;
    // 选中项本身也算路径的一环：色条要一路连到终点，
    // 断在最后一段会让「我现在在哪」变得要自己推。
    const isPath = treeState.path.includes(key) || isSelected;
    const hasKids = node.children.length > 0;
    const isOpen = treeIsOpen(key);
    const sound = treeSound(node);
    const classes = [
      'tree-row',
      isSelected ? 'is-selected' : '',
      isPath ? 'is-path' : '',
      hasKids ? 'has-kids' : '',
      isOpen ? 'is-open' : '',
      treeState.playing === key ? 'is-playing' : '',
    ].filter(Boolean).join(' ');

    return `
      <div class="${classes}" data-tree-key="${escapeHtml(key)}" style="--family:${treeFamilyVars(node.color)}" role="option" aria-selected="${isSelected}" aria-expanded="${hasKids ? String(isOpen) : 'false'}"${Number.isInteger(index) ? ` aria-posinset="${index + 1}" aria-setsize="${total}"` : ''}>
        <button class="tree-row-play" type="button" data-tree-play="${escapeHtml(key)}" ${treePlayable(node) ? '' : 'disabled'} aria-label="${treePlayable(node) ? `播放 ${escapeHtml(node.name)}` : `${escapeHtml(node.name)} 暂无试听`}">${treePlayable(node) ? '▶' : '·'}</button>
        <span class="tree-row-edge" aria-hidden="true"></span>
        <span class="tree-row-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
        ${sound && sound.scope === 'own'
          ? '<span class="tree-row-tag is-own">专属</span>'
          : node.stub
            ? '<span class="tree-row-tag is-stub">待补</span>'
            : hasKids
              /* subtree 是子树规模，大族与条目都有；
                 不能用 node.count —— 那个字段只在大族节点上存在 */
              ? `<span class="tree-row-count">${node.subtree}</span>`
              : '<span class="tree-row-count">—</span>'}
        ${hasKids
          ? `<button class="tree-row-chev is-toggle" type="button" data-tree-toggle="${escapeHtml(key)}" aria-label="${isOpen ? '收起' : '展开'} ${escapeHtml(node.name)}"><span aria-hidden="true">${isOpen ? '▾' : '›'}</span></button>`
          : '<span class="tree-row-chev" aria-hidden="true"></span>'}
        <span class="tree-row-progress" data-tree-progress="${escapeHtml(key)}"></span>
      </div>`;
  }

  function treeColumnsHTML() {
    return treeColumns().map((col) => {
      // 展开出来的列（有 parentKey）标记一下：列头点亮，
      // 让「这一列是从左边哪一支展开的」在视觉上成立。
      const openCls = col.parentKey ? ' is-open-col' : '';
      const head = `<div class="tree-col-head"><span class="mono-label">${escapeHtml(col.label)}</span><b>${col.keys.length}</b></div>`;
      // 行的位置信息按整列算，跨分组连续编号，读屏才不会每组都从 1 开始
      let rowNo = 0;
      const rowAt = (key) => treeRowHTML(key, rowNo++, col.keys.length);
      if (col.groups) {
        // 首列三组共用一个滚动区：三段各自滚动会让列高对不齐
        const rows = col.groups.map((group) => `
          <div class="tree-group-label"><span>${escapeHtml(group.label)}</span><b>${group.roots.length}</b></div>
          ${group.roots.map(rowAt).join('')}`).join('');
        // role=listbox + option：屏幕阅读器会报「第 N 项，共 M 项」，
        // 光靠视觉的列布局对读屏用户等于没有结构。
        return `<div class="tree-col${openCls}" data-level="${col.level}" role="listbox" aria-label="第 ${col.level + 1} 层：${escapeHtml(col.label)}">${head}<div class="tree-rows">${rows}</div></div>`;
      }
      return `<div class="tree-col${openCls}" data-level="${col.level}" role="listbox" aria-label="第 ${col.level + 1} 层：${escapeHtml(col.label)}">${head}<div class="tree-rows">${col.keys.map(treeRowHTML).join('')}</div></div>`;
    }).join('');
  }

  function treeCrumbsHTML() {
    const parts = [`<button class="tree-crumb${treeState.path.length ? '' : ' is-current'}" type="button" data-tree-root>全部大族</button>`];
    treeState.path.forEach((key, index) => {
      const node = treeNode(key);
      if (!node) return;
      const isLast = index === treeState.path.length - 1;
      parts.push(`<span class="tree-crumb-sep" aria-hidden="true">›</span>`);
      parts.push(`<button class="tree-crumb${isLast ? ' is-current' : ''}" type="button" data-tree-jump="${escapeHtml(key)}" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</button>`);
    });
    return parts.join('');
  }

  /* ------------------------------------------------------------ 移动端纵向树
     窄屏上横向列式要左右滑才看得见下一层，新手经常滑不到、也看不出
     「这一支下面还有东西」。改成一行一个节点、缩进表示层级、
     点行首三角折叠，全部在一屏里从上往下读。 */

  // 纵向树的一行：缩进 + 三角 + 行内容。缩进用 CSS 变量，避免每层写死 padding。
  function treeFlatRowHTML(key, depth, index, total) {
    const node = treeNode(key);
    if (!node) return '';
    const hasKids = node.children.length > 0;
    const isOpen = treeState.expanded.has(key);
    const isSelected = treeState.selected === key;
    // 与桌面端一致：选中项也是路径的一环
    const onPath = treeState.path.includes(key) || isSelected;
    const sound = treeSound(node);
    const classes = [
      'tree-flat-row',
      isSelected ? 'is-selected' : '',
      onPath ? 'is-path' : '',
      hasKids ? 'has-kids' : '',
      isOpen ? 'is-open' : '',
      treeState.playing === key ? 'is-playing' : '',
    ].filter(Boolean).join(' ');

    return `
      <div class="${classes}" data-tree-key="${escapeHtml(key)}" data-depth="${depth}" style="--depth:${depth};--family:${treeFamilyVars(node.color)}" role="treeitem" aria-level="${depth + 1}" aria-expanded="${hasKids ? String(isOpen) : 'false'}" aria-selected="${isSelected}"${Number.isInteger(index) ? ` aria-posinset="${index + 1}" aria-setsize="${total}"` : ''}>
        ${hasKids
          ? `<button class="tree-flat-toggle" type="button" data-tree-toggle="${escapeHtml(key)}" aria-label="${isOpen ? '收起' : '展开'} ${escapeHtml(node.name)}"><span aria-hidden="true">${isOpen ? '▾' : '▸'}</span></button>`
          : '<span class="tree-flat-toggle is-leaf" aria-hidden="true">·</span>'}
        <button class="tree-flat-play" type="button" data-tree-play="${escapeHtml(key)}" ${treePlayable(node) ? '' : 'disabled'} aria-label="${treePlayable(node) ? `播放 ${escapeHtml(node.name)}` : `${escapeHtml(node.name)} 暂无试听`}">${treePlayable(node) ? '▶' : '·'}</button>
        <span class="tree-flat-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
        ${sound && sound.scope === 'own'
          ? '<span class="tree-row-tag is-own">专属</span>'
          : node.stub
            ? '<span class="tree-row-tag is-stub">待补</span>'
            : hasKids
              ? `<span class="tree-row-count">${node.subtree}</span>`
              : ''}
        <span class="tree-row-progress" data-tree-progress="${escapeHtml(key)}"></span>
      </div>`;
  }

  // 深度优先把「已展开」的节点摊平。只走 expanded 里的分支，
  // 没展开的子树连 DOM 都不生成 —— 1406 个节点全渲染会卡。
  function treeFlatHTML() {
    if (!treeReady()) return '';
    const rows = [];
    let rowNo = 0;
    const walk = (keys, depth) => {
      keys.forEach((key) => {
        const node = treeNode(key);
        if (!node) return;
        rows.push(treeFlatRowHTML(key, depth, rowNo++, 0));
        if (treeState.expanded.has(key) && node.children.length) {
          walk(node.children, depth + 1);
        }
      });
    };
    // 首列按三组分开，和桌面端的分组保持一致
    TREE.groups.forEach((group) => {
      rows.push(`<div class="tree-flat-group"><span>${escapeHtml(group.label)}</span><b>${group.roots.length}</b></div>`);
      walk(group.roots, 0);
    });
    return rows.join('');
  }

  // 把某个节点所在的整条祖先链展开 —— 深链跳进来时要用，
  // 否则目标藏在折叠的分支里，用户只看到一排大族。
  function treeExpandAncestors(key) {
    let cursor = treeNode(key);
    let guard = 0;
    while (cursor && guard++ < 12) {
      treeState.expanded.add(cursor.key);
      cursor = cursor.parent ? treeNode(cursor.parent) : null;
    }
  }

  /* 树详情卡里的例曲：与听感卡同一套 30 秒预览（Apple 官方预览 + B站/网易云兜底），
     但面板只有 320px 宽，所以按钮排到曲名下面、只列前三首。
     不跟「进入即播」联动 —— 树里点节点是浏览动作，每点一下就外放会很吵，
     也没必要为一次下钻去请求一次 iTunes。 */
  function treeExamplesHTML(node) {
    const all = (node.examples || []).filter((ex) => ex && ex.title);
    const list = all.slice(0, 3);
    if (!list.length) return '';
    const more = all.length - list.length;
    return `
      <div class="tree-rel tree-examples-block">
        <h3>EXAMPLES / 例曲<span>点按钮听 30 秒官方预览</span></h3>
        <ol class="tree-examples">
          ${list.map((ex) => {
            const cands = previewCandidates(ex.artist, ex.title);
            const term = cands[0] || ex.title || '';
            const alt = cands.slice(1).join('\u0001');
            const label = [cleanExampleText(ex.title) || ex.title, cleanExampleText(ex.artist) || ex.artist].filter(Boolean).join(' — ');
            const query = encodeURIComponent([ex.artist, ex.title].filter(Boolean).join(' ').trim() || ex.title);
            return `
            <li class="tree-example-item">
              <span class="tree-example-meta">
                <span class="tree-example-title">${escapeHtml(cleanExampleText(ex.title) || ex.title)}</span>
                ${ex.artist ? `<span class="tree-example-artist">${escapeHtml(cleanExampleText(ex.artist) || ex.artist)}</span>` : ''}
              </span>
              <span class="tree-example-actions">
                <button class="example-preview" type="button" data-preview="${escapeHtml(term)}"${alt ? ` data-preview-alt="${escapeHtml(alt)}"` : ''}>试听 30 秒</button>
                <a class="example-link" href="https://search.bilibili.com/all?keyword=${query}" target="_blank" rel="noopener noreferrer" aria-label="在 B 站搜：${escapeHtml(label)}">B 站 ↗</a>
                <a class="example-link" href="https://music.163.com/#/search/m/?s=${query}" target="_blank" rel="noopener noreferrer" aria-label="在网易云搜：${escapeHtml(label)}">网易云 ↗</a>
              </span>
              <span class="example-feedback" hidden></span>
            </li>`;
          }).join('')}
        </ol>
        <p class="tree-examples-note">预览来自 Apple Music，本站不托管音频${more > 0 ? `；原始资料还列了 ${more} 首，见完整条目` : ''}。</p>
      </div>`;
  }

  function treeDetailHTML() {
    const node = treeState.selected ? treeNode(treeState.selected) : null;
    if (!node) {
      return `
        <div class="tree-detail-empty">
          <p class="tree-detail-lead">从左边选一个节点。</p>
          <p>每选一个节点，这里会显示它的听感卡：一句人话、三个听点、BPM 区间，以及一个播放按钮。
          有下级的节点可以继续往右点下去。</p>
        </div>`;
    }

    const sound = treeSound(node);
    const examples = treeExamples(node);
    const isFamily = node.kind === 'family';
    const isPlaying = treeState.playing === node.key;
    const family = isFamily ? node : familyById.get(node.familyId);
    const own = sound && sound.scope === 'own' ? sound.data : null;
    const kids = node.children.map((k) => TREE.nodes[k]).filter(Boolean);
    const bpm = sound ? sound.bpm : null;

    // BPM 条：只有专属条目才有真实区间，回退值不画区间避免误导
    const bpmMin = own ? own.bpm.min : null;
    const bpmMax = own ? own.bpm.max : null;
    const left = bpmMin ? ((bpmMin - 60) / 200) * 100 : 0;
    const width = bpmMin ? Math.max(((bpmMax - bpmMin) / 200) * 100, 1.2) : 0;

    // 派生关系：up = 源头，down = 分支。crossFamily 的单独标出来 —— 那才是「跨族影响」
    const relBlock = (list, title, hint) => {
      if (!list || !list.length) return '';
      return `
        <div class="tree-rel">
          <h3>${title}<span>${hint}</span></h3>
          <div class="chip-row">
            ${list.slice(0, 10).map((item) => `
              <button class="chip${item.crossFamily ? ' is-cross' : ''}" type="button" data-tree-jump-node="${escapeHtml(item.key)}" title="${escapeHtml(item.name)}${item.crossFamily ? ' · 跨大族' : ''}">${escapeHtml(item.name)}${item.crossFamily ? ' ↗' : ''}</button>`).join('')}
          </div>
        </div>`;
    };

    return `
      <div class="tree-detail-head" style="--family:${treeFamilyVars(node.color)}">
        <div class="mono-label">${isFamily ? 'FAMILY / 大族' : 'STYLE / 条目'}${node.stub ? ' · 资料待补' : ''}</div>
        <h2>${escapeHtml(node.name)}</h2>
        <p class="tree-detail-zh">${isFamily ? (node.zh ? escapeHtml(node.zh) + ' · ' : '') : (family ? escapeHtml(family.name) + (family.zh ? ' · ' + escapeHtml(family.zh) : '') + ' · ' : '')}${node.children.length} 个直接下级</p>
        ${bpm ? `
          <div class="tree-detail-bpm"><strong>${bpm}</strong><span>BPM${own ? ` · ${bpmMin}–${bpmMax}` : ' · 同族参考值'}</span></div>
          ${own ? `<div class="tree-bpm-track"><i style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></i></div>
          <div class="tree-bpm-scale"><span>60</span><span>260</span></div>` : ''}
        ` : ''}
      </div>
      <div class="tree-detail-body">
        ${own ? `
          <p class="tree-detail-l1">${escapeHtml(own.oneLine)}</p>
          <ul class="tree-detail-hear">${own.hear.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
          ${own.when ? `<p class="tree-detail-when">${escapeHtml(own.when)}</p>` : ''}
        ` : node.summary ? `
          <p class="tree-detail-l1">${escapeHtml(stripLong(node.summary, 240))}</p>
        ` : family && family.intro ? `
          <p class="tree-detail-l1">${escapeHtml(stripLong(family.intro, 280))}</p>
        ` : `
          <p class="tree-detail-l1">原始资料暂未展开这一条目。</p>
        `}

        ${sound && sound.scope === 'fallback' ? `
          <div class="tree-detail-note">
            <b>同族参考：</b>这一条没有专属试听，播的是 <b>${escapeHtml(sound.familyName || '同族')}</b> 的骨架，不是它独有的声音。
          </div>` : ''}

        ${!treePlayable(node) ? `
          <div class="tree-detail-note is-plain">
            这一条暂时没有可播放的内容（既无例曲也无合成示例；待归档条目，原始资料未给出速度与律动信息）。
          </div>` : ''}

        <div class="tree-detail-actions">
          ${treePlayable(node) ? `<button class="button-primary${isPlaying ? ' is-playing' : ''}" type="button" data-tree-play="${escapeHtml(node.key)}" data-tree-play-mode="${escapeHtml(treeState.playMode || 'synth')}">${isPlaying ? (treeState.playMode === 'example' ? '■ 停止例曲' : '■ 停止') : '▶ 播放这一条'}</button>` : ''}
          ${sound && examples.length && !(isPlaying && treeState.playMode === 'synth') ? `<button class="button-ghost" type="button" data-tree-synth="${escapeHtml(node.key)}">♪ 合成骨架</button>` : ''}
          ${kids.length ? `<button class="button-ghost" type="button" data-tree-descend="${escapeHtml(node.key)}">继续往下 ${kids.length} 个 ›</button>` : ''}
          ${isFamily
            ? `<a class="button-ghost" href="#/family/${escapeHtml(node.id)}">大族页 ↗</a>`
            : `<a class="button-ghost" href="#/genre/${escapeHtml(node.id)}">完整条目 ↗</a>`}
        </div>

        ${treeExamplesHTML(node)}

        ${ishkurCompactHTML(node)}
        ${ishkurFamilyInTreeHTML(node)}

        ${relBlock(node.up, 'FROM / 源头', '这一条从哪来')}
        ${relBlock(node.down, 'DERIVED / 派生', '从这一条分出去')}
        ${relBlock(node.related, 'RELATED / 相关', '平行关系')}

        ${kids.length ? `
          <div class="tree-detail-children">
            <h3>NEXT / 直接下级 ${kids.length}</h3>
            <div class="chip-row">
              ${kids.slice(0, 14).map((k) => `<button class="chip" type="button" data-tree-descend="e:${escapeHtml(k.id)}">${escapeHtml(k.name)}</button>`).join('')}
              ${kids.length > 14 ? `<span class="chip is-static">还有 ${kids.length - 14} 个</span>` : ''}
            </div>
          </div>` : ''}
      </div>`;
  }

  // 只重画树与面包屑，不动详情 —— 播放状态变化时详情里的按钮文案要跟着变，所以单独处理
  function treePaintRows() {
    const host = document.getElementById('treeColumns');
    if (!host) return;
    const scroll = host.scrollLeft;
    const scrollTop = host.scrollTop;
    // 两种布局共用一个容器 id，按当前断点选渲染器。
    // 纵向树重画后要还原纵向滚动位置，否则点一下就把用户甩回顶部。
    host.innerHTML = treeIsNarrow() ? treeFlatHTML() : treeColumnsHTML();
    host.scrollLeft = scroll;
    host.scrollTop = scrollTop;
    const crumbs = document.getElementById('treeCrumbs');
    if (crumbs) crumbs.innerHTML = treeCrumbsHTML();
  }

  function treePaintDetail() {
    const host = document.getElementById('treeDetail');
    if (!host) return;
    // 详情重画会把例曲按钮整块换掉：音频留着继续响的话，
    // 界面上已经没有能停它的按钮了（新按钮显示的是「试听 30 秒」）。
    // 树随机例曲还在响时例外：重画后按 treePlayingExample 把对应按钮补回「停止」态。
    const treeExampleOn = treeState.playMode === 'example';
    if (!treeExampleOn && host.querySelector('.example-preview.is-playing')) stopExamplePreview();
    host.innerHTML = treeDetailHTML();
    if (treeExampleOn && treePlayingExample) {
      // 按曲名匹配详情卡里对应的例曲按钮（data-preview 是转义过的查询词，
      // 曲名才是稳定锚点），把它补回「停止」态，用户才有东西可点着停。
      const btn = [...host.querySelectorAll('.tree-example-item')]
        .map((li) => ({ li, b: li.querySelector('.example-preview'), t: li.querySelector('.tree-example-title') }))
        .find(({ t }) => t && (t.textContent || '').trim() === treePlayingExample.title)?.b;
      if (btn) {
        btn.classList.add('is-playing');
        btn.textContent = '停止';
      }
      const item = btn ? btn.closest('.tree-example-item') : null;
      const feedback = item ? item.querySelector('.example-feedback') : null;
      if (feedback && treePlayingExample.note) {
        feedback.hidden = false;
        feedback.textContent = treePlayingExample.note;
      }
    }
  }

  function treePaintPlaying() {
    document.querySelectorAll('[data-tree-key]').forEach((row) => {
      row.classList.toggle('is-playing', row.dataset.treeKey === treeState.playing);
    });
  }

  // 只改详情里那个播放按钮，不动整块 DOM。
  // 整块重画会连带换掉例曲按钮：正在查询/播放中的按钮会变成游离节点，
  // 声音还在响，界面上却没有能停它的按钮了。
  function treePaintDetailPlayState() {
    const host = document.getElementById('treeDetail');
    if (!host) return;
    const btn = host.querySelector('[data-tree-play]');
    if (!btn) return;
    const isPlaying = treeState.playing === btn.dataset.treePlay;
    btn.classList.toggle('is-playing', isPlaying);
    btn.textContent = isPlaying ? (treeState.playMode === 'example' ? '■ 停止例曲' : '■ 停止') : '▶ 播放这一条';
  }

  // 与引擎同步：事件驱动为主，进度条叠加低频补间
  function treeSyncFromEngine(state) {
    if (!state) return;
    // 例曲走的是 HTMLAudio（window.Audio），引擎（Web Audio 合成）看不到它，
    // treeState.playing 是例曲时引擎回报的 state.playing 必然为假 —— 不能用它擦高亮，
    // 否则例曲刚响起来就被这里当成「已停止」把行高亮和按钮文案清掉。
    if (treeState.playing && treeState.playMode === 'example') return;

    // 只认树自己发起的播放：把节点的 demoId 记下来比对，而不是看前缀。
    // 主站所有合成试听都是 fp: 前缀，用前缀判断会让树的旧高亮永远擦不掉。
    const mine = treeState.playing ? treeDemoId(treeNode(treeState.playing)) : null;
    const stillMine = Boolean(state.playing && mine && state.demoId === mine);
    if (!stillMine && treeState.playing) {
      treeState.playing = null;
      treeState.playMode = null;
      treePaintPlaying();
      treePaintDetailPlayState();
    }

    // 只维护行内那条 2px 进度线；底部播放条由主站的 updateAudioUI 负责，
    // 树不再插一手，避免两条 dock 打架。
    if (state.playing) {
      if (!treeProgressTimer) {
        treeProgressTimer = setInterval(() => {
          const now = Audio.getState();
          if (!treeState.playing) return;
          const bar = document.querySelector(`[data-tree-progress="${CSS.escape(treeState.playing)}"]`);
          if (bar) bar.style.width = `${Math.round((now.progress || 0) * 100)}%`;
        }, 140);
      }
    } else if (treeProgressTimer) {
      clearInterval(treeProgressTimer);
      treeProgressTimer = null;
    }
  }

  // 停掉树里正在响的一切（合成 + 例曲），并把行高亮、按钮文案复位。
  // 合成走引擎的 Audio.stop()，例曲走 stopExamplePreview()，两条声道都要清。
  function treeHaltPlayback() {
    Audio.stop();
    stopExamplePreview();
    treeState.playing = null;
    treeState.playMode = null;
    treePlayingExample = null;
    treePaintPlaying();
    treePaintDetailPlayState();
    treeSyncFromEngine(Audio.getState());
  }

  // 用户主动停止（再点一次播放钮 / 点了具体例曲按钮 / 面包屑跳转）：
  // 除停声源外，还要作废仍在路上的例曲查询 —— 否则几秒后它突然出声，
  // 用户会以为「停不掉」。
  function treeStopPlay() {
    treePlaySeq += 1;
    treeHaltPlayback();
  }

  // 手动触发例曲按钮 / 面包屑跳转前，把树自身发起的播放停掉，
  // 避免「详情卡里点某首例曲，背景里树随机挑的另一首还在响」。
  function stopTreePlayIfAny() {
    if (treeState.playing) treeStopPlay();
  }

  /* 树内例曲播放：从节点的例曲列表里随机挑一首，用与听感卡同一套
     「iTunes 三级候选词查询」找 30 秒官方预览。不依赖 DOM 按钮 ——
     行播放钮、详情卡播放钮、点行三处触发共用这一个入口。
     返回 'playing' | 'no-preview' | 'blocked' | 'stale' | 'no-example'。 */
  async function treePlayExampleFor(node, seq) {
    const all = treeExamples(node);
    if (!all.length) return 'no-example';
    const ex = all[Math.floor(Math.random() * all.length)];
    const cands = previewCandidates(ex.artist, ex.title);
    // 查询前先亮加载态：iTunes 查询要几秒，界面上没动静会像「点了没反应」。
    // 行播放钮是树里三处触发唯一的固定挂点（详情卡按钮可能刚被重画换掉）。
    const loadBtn = document.querySelector(`[data-tree-play="${CSS.escape(node.key)}"]`);
    if (loadBtn) {
      loadBtn.classList.add('is-loading');
      if (loadBtn.classList.contains('tree-row-play') || loadBtn.classList.contains('tree-flat-play')) {
        loadBtn.textContent = '…';
      } else {
        loadBtn.textContent = '查询例曲…';
      }
    }
    const payload = await resolvePreview(cands);
    // 恢复按钮态时只清自己加的 is-loading；若按钮已被新一轮播放接管
    // （新 is-playing 态），保留新状态，只把临时文案复位。
    if (loadBtn && loadBtn.isConnected) {
      loadBtn.classList.remove('is-loading');
      if (!loadBtn.classList.contains('is-playing')) loadBtn.textContent = '▶';
    }
    // 查询要几秒，期间用户可能点了别的节点或手动停了：
    // 只有自己仍是「最新一次播放意图」时才把声音放出来。
    if (seq !== treePlaySeq) return 'stale';
    if (!payload || !payload.previewUrl) return 'no-preview';

    // 界面反馈：详情卡对应例曲的按钮进入「停止」态（行内没有稳定挂点，反馈进详情卡）。
    const host = document.getElementById('treeDetail');
    const items = host ? [...host.querySelectorAll('.tree-example-item')] : [];
    const match = items.find((li) => {
      const title = li.querySelector('.tree-example-title');
      return title && (title.textContent || '').trim() === (cleanExampleText(ex.title) || ex.title).trim();
    });
    stopExamplePreview();
    if (Audio?.getState()?.playing) Audio.stop();

    const audio = new window.Audio(payload.previewUrl); // 站点的 Audio 是合成引擎，这里必须用 window.Audio
    exampleAudio = audio;
    audio.volume = 0.85;
    try {
      await audio.play();
    } catch {
      if (exampleAudio === audio) exampleAudio = null;
      return 'blocked';
    }
    // play() 是异步的：等待期间例曲可能被 stopExamplePreview() 换成别的 Audio，
    // 只有自己还是「当前那一个」时才继续挂事件、登记状态。
    if (exampleAudio !== audio) return 'stale';
    if (seq !== treePlaySeq) { audio.pause(); if (exampleAudio === audio) exampleAudio = null; return 'stale'; }
    audio.addEventListener('ended', () => {
      if (treeState.playMode === 'example') {
        treeState.playing = null;
        treeState.playMode = null;
        treePlayingExample = null;
        treePaintPlaying();
        treePaintDetailPlayState();
      }
      stopExamplePreview();
    }, { once: true });
    const shownTitle = (cleanExampleText(ex.title) || ex.title).trim();
    treePlayingExample = {
      title: shownTitle,
      note: `正在试听：${payload.trackName} — ${payload.artistName}（30 秒官方预览）`,
    };
    if (match) {
      const btn = match.querySelector('.example-preview');
      if (btn) {
        btn.classList.add('is-playing');
        btn.textContent = '停止';
      }
      const feedback = match.querySelector('.example-feedback');
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = treePlayingExample.note;
      }
    }
    return 'playing';
  }

  /* 树播放总入口。默认优先级：
     1. 有例曲 → 随机播一首例曲（30 秒 Apple 官方预览）；
     2. 例曲拿不到预览 / 被浏览器拦截 / 查询失败 → 兜底播合成骨架；
     3. 没例曲但有合成 → 直接播合成；
     4. 用户主动选择：例曲播放中再点一次同一个节点 = 停止；
        详情卡里点具体例曲的「试听 30 秒」按钮永远只播那一首，不随机。
     options.forceSynth: 绕过例曲优先，直接播合成骨架。 */
  async function treePlay(key, options = {}) {
    const node = treeNode(key);
    if (!node) return;
    const sound = treeSound(node);
    const examples = treeExamples(node);
    if (!sound && !examples.length) return;

    // 再点同一个正在播的节点 = 停止
    if (treeState.playing === key) { treeStopPlay(); return; }

    // 换节点播放：先停掉旧声源（可能是另一节的合成，也可能是随机例曲），
    // 并作废它还没返回的例曲查询 —— seq 自增天然完成这件事。
    treeHaltPlayback();
    treePlaySeq += 1;

    const seq = treePlaySeq;
    const keepSelected = Boolean(options.keepSelected);

    if (!options.forceSynth && examples.length) {
      const state = await treePlayExampleFor(node, seq);
      if (state === 'stale') return; // 已被更新的一次播放取代
      if (state === 'playing') {
        if (treeState.selected !== key) treeState.selected = key;
        treeState.playing = key;
        treeState.playMode = 'example';
        treePaintRows();
        treePaintDetailPlayState();
        return;
      }
      // no-preview / blocked / no-example：落到下面的合成兜底。
      // blocked（浏览器拦自动播放）时用户在页面上，合成引擎不受播放策略限制，仍可直接出声。
      // 兜底前给一句轻提示，让「怎么换声音了」有解释。
      showToast(`「${node.name}」例曲没有可用预览，改放合成骨架。`);
    }

    if (!sound) {
      showToast(`「${node.name}」没找到例曲预览，也没有合成示例可放。`);
      return;
    }
    stopExamplePreview();
    const ok = Audio.playFingerprint(sound.fp, { bpm: sound.bpm, label: node.name });
    if (!ok) {
      showToast('音频不可用：浏览器未提供 Web Audio 支持。');
      return;
    }
    treeState.playing = key;
    treeState.playMode = 'synth';
    treePlayingExample = null;
    // 点行试听时选中项已经是它了，不要再覆盖一次 ——
    // 那会把 treeSelect 刚设好的状态顶掉，详情卡闪一下再重画。
    if (!keepSelected && treeState.selected !== key) treeState.selected = key;
    treePaintRows();
    treePaintDetail();
    treeSyncFromEngine(Audio.getState());
  }

  // 点行：试听 + 展开下级。两件事一起做，是因为新手的第一个问题是
  // 「这是什么声音」，第二个问题是「那它下面还有什么」——分两步做会各卡一次。
  function treeSelect(key, options = {}) {
    const node = treeNode(key);
    if (!node) return;
    treeState.selected = key;
    const hasKids = node.children.length > 0;
    if (options.descend && hasKids) {
      if (treeIsNarrow()) {
        treeState.expanded.add(key);
      } else {
        // 按真实祖先链重建列，而不是「已在 path 里就截断、否则追加」
        treeState.path = treePathFor(key);
      }
    }
    treePaintRows();
    treePaintDetail();
    treeUpdateURL();
    if (options.scroll !== false) {
      requestAnimationFrame(() => {
        const row = document.querySelector(`[data-tree-key="${CSS.escape(key)}"]`);
        if (row) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }
    // 播放放最后：它会重画行与详情，先播会把上面刚画好的状态冲掉。
    // 已有声音在响时再点别的行，直接切过去，不用先停。
    if (options.play) {
      if (treePlayable(node)) treePlay(key, { keepSelected: true });
      // 全库只有十几个节点既没有例曲也没有声音。点了没反应比听到声音更让人困惑，
      // 所以明确说一句，而不是让用户以为页面卡了。
      else showToast(`「${node.name}」暂无试听音频，先看右边的资料。`);
    }
  }

  // 三角：只折叠/展开，不播放、不改变选中。
  // 桌面端收起时要连带砍掉它右侧的所有列 —— 否则会出现「父级已收起、
  // 子级还挂在右边」的断链视图。
  function treeToggle(key) {
    const node = treeNode(key);
    if (!node || !node.children.length) return;
    if (treeIsNarrow()) {
      if (treeState.expanded.has(key)) treeState.expanded.delete(key);
      else treeState.expanded.add(key);
      treePaintRows();
      return;
    }
    const at = treeState.path.indexOf(key);
    if (at >= 0) {
      // 收起：砍掉它自己与右侧所有列
      treeState.path = treeState.path.slice(0, at);
    } else {
      // 展开同列里的另一个分支：按祖先链重建。直接追加会把这一支
      // 接到当前链尾（也就是挂到别的父级下），层级会串成假血缘。
      treeState.path = treePathFor(key);
    }
    treePaintRows();
    treeUpdateURL();
    if (at < 0) {
      requestAnimationFrame(() => {
        const cols = document.getElementById('treeColumns');
        if (cols) cols.scrollLeft = cols.scrollWidth;
      });
    }
  }

  function treeDescend(key) {
    const node = treeNode(key);
    if (!node || !node.children.length) return;
    // 「继续往下」= 展开这一支：列要按真实祖先链重建，
    // 否则从详情卡跳到同层另一支时会把旧链留在左边。
    treeState.path = treePathFor(key);
    treeState.selected = key;
    treePaintRows();
    treePaintDetail();
    treeUpdateURL();
    requestAnimationFrame(() => {
      const cols = document.getElementById('treeColumns');
      if (cols) cols.scrollLeft = cols.scrollWidth;
    });
  }

  function treeAscend() {
    if (!treeState.path.length) return;
    const last = treeState.path[treeState.path.length - 1];
    treeState.path = treeState.path.slice(0, -1);
    treeState.selected = last;
    treePaintRows();
    treePaintDetail();
    treeUpdateURL();
  }

  // 深链：把路径写进 hash，分享出去的链接能直接打开同一位置
  function treeUpdateURL() {
    const params = new URLSearchParams();
    if (treeState.path.length) params.set('path', treeState.path.map((k) => k.split(':')[1]).join(','));
    if (treeState.selected) params.set('sel', treeState.selected.split(':')[1]);
    const query = params.toString();
    replaceHash(`#/tree${query ? `?${query}` : ''}`);
  }

  // 解析一个节点引用。同时接受三种写法：
  //   g-383 / f-165  裸 id（构建期生成的短链用这种）
  //   e:g-383        带前缀的完整 key（树内部与分享链接用这种）
  // 两种都认，是因为手改 hash 的人不该需要知道前缀规则。
  function treeKeyFrom(raw) {
    if (!raw) return null;
    if (TREE.nodes[raw]) return raw;
    if (TREE.nodes[`e:${raw}`]) return `e:${raw}`;
    if (TREE.nodes[`f:${raw}`]) return `f:${raw}`;
    return null;
  }

  function treeApplyParams(params) {
    if (!treeReady()) return;
    const rawPath = params.get('path');
    const rawSel = params.get('sel');
    if (rawPath) {
      const keys = rawPath.split(',').map(treeKeyFrom).filter(Boolean);
      // 只保留连续可解析的前缀，避免手改 hash 造出不存在的列
      const chain = [];
      for (const key of keys) {
        const prev = chain[chain.length - 1];
        if (!prev) { chain.push(key); continue; }
        const prevNode = treeNode(prev);
        if (prevNode && prevNode.children.includes(key)) chain.push(key);
        else break;
      }
      treeState.path = chain;
    }
    if (rawSel) {
      const key = treeKeyFrom(rawSel);
      if (key) {
        treeState.selected = key;
        // sel 可能比 path 深：外部链接常常只带目标、不带路径，
        // 手改 hash 也会这样。不补祖先链的话，选中项落在没渲染的列里，
        // 详情卡显示着它、列表上却一处高亮都没有。
        const chain = treeAncestorChain(key);
        /* 判「现有 path 是否已经展开到它的父级」，而不是比长度：
           残留的旧路径（上一条 deep link 留下的）可能更长，却和 sel 毫无关系，
           留着就会变成「选中 Deep House、面包屑却写着 Techno › Minimal Techno」。
           显式 path 能覆盖 sel 的父级时才保留 —— 那种情况下用户是想看更宽的范围。 */
        const parentKey = (treeNode(key) || {}).parent || null;
        const pathCovers = parentKey
          ? treeState.path.includes(parentKey)
          : treeState.path.length === 0;
        if (!pathCovers) treeState.path = chain;
      }
    }
  }

  // 从根到该节点（不含自身）的 key 链。数据是纯树、无共享子节点，
  // 所以沿 parent 上溯不会走岔。
  function treeAncestorChain(key) {
    const chain = [];
    let cursor = treeNode(key);
    let guard = 0;
    while (cursor && cursor.parent && guard++ < 12) {
      cursor = treeNode(cursor.parent);
      if (!cursor) break;
      chain.unshift(cursor.key);
    }
    return chain;
  }

  /* 展开某个节点所需的完整 path：祖先链 + 自身。
     不能用 treeState.path.indexOf(key) 判断它在第几列 —— 两者不是一回事：
     点的是同一列里的另一个分支时，key 根本不在 path 里，indexOf 返回 -1，
     「追加到链尾」会把不相关的一支接到已有链后面，层级立刻串成
     「House › Deep House › Electro House」这种假血缘。
     按 parent 上溯重建，path 永远等于真实祖先链，列数恒定等于深度 + 1。 */
  function treePathFor(key) {
    const node = treeNode(key);
    if (!node) return treeState.path.slice();
    return [...treeAncestorChain(key), key];
  }

  // 搜索：只搜名字与别名，命中后把整条路径展开，而不是只给一个孤立结果
  function treeSearch(query) {
    const q = norm(query);
    if (!q) return [];
    const hits = [];
    for (const node of Object.values(TREE.nodes)) {
      const hay = node.search || norm(node.name);
      if (hay.includes(q)) hits.push(node);
      if (hits.length >= 40) break;
    }
    return hits;
  }

  function treeReveal(node) {
    const chain = [];
    let cursor = node;
    let guard = 0;
    while (cursor && guard++ < 12) {
      chain.unshift(cursor.key);
      // 数据里父指针叫 parent（构建期写入的完整 key），不是 parentKey
      cursor = cursor.parent ? treeNode(cursor.parent) : null;
    }
    treeState.path = chain.slice(0, -1);
    // 窄屏用 expanded 集合，宽屏用 path；两边都写，
    // 这样用户在断点两侧来回切时看到的位置是一致的。
    treeState.expanded = new Set(chain.slice(0, -1));
    treeState.selected = node.key;
    treePaintRows();
    treePaintDetail();
    treeUpdateURL();
    // 搜索结果可能是折叠在深处的节点，展开后要把它滚进视野，
    // 否则用户看到「跳过去了」但屏幕上什么都没变。
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-tree-key="${CSS.escape(node.key)}"]`);
      if (row) row.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }

  function renderTree(route) {
    if (!treeReady()) {
      main.innerHTML = `
        ${pageHead({
          code: '05',
          label: 'TREE',
          title: '风格树',
          lead: '分支树索引尚未生成。',
        })}
        <div class="guide-body"><p class="prose">请先运行 <code>node scripts/build-tree.mjs</code> 生成 <code>data/tree.js</code>，再刷新本页。</p></div>`;
      return;
    }

    // 首次进入或换了 hash：从参数恢复位置；否则保留上次的位置
    if (!treeState.selected || route.params.get('path') || route.params.get('sel')) {
      treeApplyParams(route.params);
    }
    if (!treeState.selected && TREE.roots.length) {
      // 深链只给了 path 没给 sel 时，选中最深展开的那个节点，
      // 不要把 path 覆盖成首个大族 —— 那会让 ?path=... 的分享链接失效
      // （用户打开链接看到的是 House，而不是链接里写的分支）。
      const deepest = treeState.path[treeState.path.length - 1];
      if (deepest) {
        treeState.selected = deepest;
      } else {
        const first = TREE.roots[0];
        treeState.selected = first;
        const node = treeNode(first);
        if (node && node.children.length) treeState.path = [first];
      }
    }
    // 移动端：把选中节点的祖先链展开，否则深链进来只看到一排大族
    if (treeState.selected) treeExpandAncestors(treeState.selected);

    const narrow = treeIsNarrow();
    const stats = TREE.stats;
    main.innerHTML = `
      ${pageHead({
        code: '05',
        label: 'TREE',
        title: '风格树',
        lead: narrow
          ? '从大族往下逐级点开。点一行就听到它的声音，点行首三角收起或展开这一支，面包屑随时告诉你走到了哪。'
          : '从大族往下逐级点开。点一行就听到它的声音，点右端箭头收起或展开这一支。声音由浏览器实时合成，不是原曲。',
        stats: [
          { label: '节点', value: formatNumber(stats.nodes) },
          { label: '分支', value: formatNumber(stats.branches) },
          { label: '有声', value: formatNumber(stats.withOwnSound + stats.withFallback) },
        ],
        action: { href: '#/atlas', label: '改用检索' },
      })}
      <div class="tree-page">
        <div class="tree-bar">
          <label class="tree-search">
            <span class="sr-only">搜索风格名或别名</span>
            ${uiIcon('search')}
            <input id="treeSearch" type="search" value="${escapeHtml(treeState.query)}" placeholder="搜风格名或别名，直接跳到那一支…" autocomplete="off">
          </label>
          <div class="tree-hint">
            <span><b>点行</b>试听并展开下级</span>
            <span><b>三角</b>只折叠不播放</span>
            <span><b>↑↓</b>移动 <b>Enter</b>试听 <b>Esc</b>收起</span>
          </div>
        </div>

        <nav class="tree-crumbs" id="treeCrumbs" aria-label="当前位置">${treeCrumbsHTML()}</nav>

        <div class="tree-results" id="treeResults" hidden></div>

        ${narrow ? `
        <div class="tree-layout is-flat">
          <div class="tree-flat" id="treeColumns" role="tree" aria-label="风格分类树" tabindex="0">${treeFlatHTML()}</div>
          <aside class="tree-detail" id="treeDetail" aria-live="polite">${treeDetailHTML()}</aside>
        </div>` : `
        <div class="tree-layout">
          <div class="tree-columns" id="treeColumns" role="listbox" aria-label="风格分支树" tabindex="0">${treeColumnsHTML()}</div>
          <aside class="tree-detail" id="treeDetail" aria-live="polite">${treeDetailHTML()}</aside>
        </div>`}
      </div>`;

    // 不再自己造一条底部播放条：主站的 #audioDock 已经是居中浮层，
    // 两条同时出现会叠在一起。树只负责行内进度线，播放控制交给主站。
    treeBind();

    // 旋转屏幕 / 拖窗口跨过断点时，两套布局的 DOM 结构完全不同，
    // 只靠 CSS 切换会留下一棵按旧断点渲染的树。
    if (!treeNarrowQuery) treeNarrowQuery = window.matchMedia('(max-width: 767px)');
    if (treeNarrowListener) treeNarrowQuery.removeEventListener('change', treeNarrowListener);
    treeNarrowListener = () => {
      if (!document.getElementById('treeColumns')) return;
      // 切换前把当前选中链同步到另一套状态里，用户看到的位置才不会跳。
      if (treeState.selected) treeExpandAncestors(treeState.selected);
      treePaintRows();
    };
    treeNarrowQuery.addEventListener('change', treeNarrowListener);
  }

  function treeBind() {
    const cols = document.getElementById('treeColumns');
    const detail = document.getElementById('treeDetail');
    const crumbs = document.getElementById('treeCrumbs');
    const search = document.getElementById('treeSearch');
    const results = document.getElementById('treeResults');

    // 统一用事件委托：列会整块重画，逐行绑监听会随重画失效
    cols?.addEventListener('click', (event) => {
      // 三角必须排在播放钮和整行之前：它是「只折叠、不播放」的唯一入口，
      // 被后面的分支吃掉就再也收不起来了。
      const toggleBtn = event.target.closest('[data-tree-toggle]');
      if (toggleBtn) {
        event.stopPropagation();
        treeToggle(toggleBtn.dataset.treeToggle);
        return;
      }
      const playBtn = event.target.closest('[data-tree-play]');
      if (playBtn) { event.stopPropagation(); treePlay(playBtn.dataset.treePlay); return; }
      const row = event.target.closest('[data-tree-key]');
      if (!row) return;
      const key = row.dataset.treeKey;
      const node = treeNode(key);
      // 点行 = 试听这一条 + 展开它的下级。
      // 新手不用先找到播放钮，也不会「点开了但不知道下一步做什么」。
      treeSelect(key, { descend: !!(node && node.children.length), play: true });
    });

    detail?.addEventListener('click', (event) => {
      // 例曲试听放在最前：详情会整块重画，逐按钮绑监听会随重画失效，
      // 只能走委托；也不依赖 bindExamplePreviews() 的启动时机。
      const previewBtn = event.target.closest('[data-preview]');
      if (previewBtn) { event.preventDefault(); stopTreePlayIfAny(); playExamplePreview(previewBtn); return; }
      const synthBtn = event.target.closest('[data-tree-synth]');
      if (synthBtn) { treePlay(synthBtn.dataset.treeSynth, { forceSynth: true }); return; }
      const playBtn = event.target.closest('[data-tree-play]');
      if (playBtn) { treePlay(playBtn.dataset.treePlay); return; }
      const descendBtn = event.target.closest('[data-tree-descend]');
      if (descendBtn) { treeDescend(descendBtn.dataset.treeDescend); return; }
      const jump = event.target.closest('[data-tree-jump-node]');
      if (jump) { const node = treeNode(jump.dataset.treeJumpNode); if (node) treeReveal(node); return; }
      const crumb = event.target.closest('[data-tree-jump]');
      if (crumb) {
        const key = crumb.dataset.treeJump;
        // 面包屑每段都是当前 path 的一环，截断到它即可；
        // 若 key 不在 path 里（手改 hash 等），按祖先链重建而不是原样不动，
        // 否则点了没反应，选中项还会落在没渲染的列里。
        const at = treeState.path.indexOf(key);
        treeState.path = at >= 0 ? treeState.path.slice(0, at + 1) : treePathFor(key);
        treeState.selected = key;
        stopTreePlayIfAny();
        treePaintRows(); treePaintDetail(); treeUpdateURL();
      }
    });

    crumbs?.addEventListener('click', (event) => {
      const root = event.target.closest('[data-tree-root]');
      if (root) {
        treeState.path = [];
        treePaintRows(); treePaintDetail(); treeUpdateURL();
        return;
      }
      const jump = event.target.closest('[data-tree-jump]');
      if (jump) {
        const key = jump.dataset.treeJump;
        const at = treeState.path.indexOf(key);
        treeState.path = at >= 0 ? treeState.path.slice(0, at + 1) : treePathFor(key);
        treeState.selected = key;
        treePaintRows(); treePaintDetail(); treeUpdateURL();
      }
    });

    // 搜索：边打边出候选，点候选直接跳到那一支
    search?.addEventListener('input', () => {
      const q = search.value.trim();
      treeState.query = q;
      if (!q) { results.hidden = true; results.innerHTML = ''; return; }
      const hits = treeSearch(q);
      results.hidden = false;
      results.innerHTML = hits.length ? `
        <div class="tree-results-head"><span class="mono-label">MATCH / 命中 ${hits.length}</span></div>
        <div class="tree-results-list">
          ${hits.map((node) => `
            <button class="tree-result" type="button" data-tree-reveal="${escapeHtml(node.key)}">
              <span class="tree-result-name">${escapeHtml(node.name)}</span>
              <span class="tree-result-path">${escapeHtml(node.pathLabel || node.familyName || '')}</span>
            </button>`).join('')}
        </div>` : `<div class="tree-results-head"><span class="mono-label">没有匹配「${escapeHtml(q)}」的风格</span></div>`;
    });

    results?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-tree-reveal]');
      if (!btn) return;
      const node = treeNode(btn.dataset.treeReveal);
      if (!node) return;
      treeReveal(node);
      if (search) search.value = '';
      treeState.query = '';
      results.hidden = true;
      results.innerHTML = '';
    });

    // 键盘：纯键盘走完一次下钻。焦点在列容器上，不抢输入框。
    if (treeKeyHandler) document.removeEventListener('keydown', treeKeyHandler);
    treeKeyHandler = (event) => {
      if (!document.getElementById('treeColumns')) return;
      const tag = (event.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || event.target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const keys = [...document.querySelectorAll('[data-tree-key]')].map((el) => el.dataset.treeKey);
      if (!keys.length) return;
      const at = Math.max(0, keys.indexOf(treeState.selected));
      const cur = treeNode(treeState.selected);
      let next = null;
      const narrow = treeIsNarrow();

      if (event.key === 'ArrowDown') next = keys[Math.min(keys.length - 1, at + 1)];
      else if (event.key === 'ArrowUp') next = keys[Math.max(0, at - 1)];
      else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        // 数据里子节点字段是 children（完整 key 数组），不是 childIds。
        // 两种布局的「深入」含义不同：窄屏是展开这一支，宽屏是下钻一列。
        if (cur && cur.children.length) {
          event.preventDefault();
          if (narrow) treeToggle(treeState.selected);
          else treeDescend(treeState.selected);
          return;
        }
        return;
      } else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
        event.preventDefault();
        // 窄屏先收起当前分支，宽屏退回上一层
        if (narrow) {
          if (treeState.expanded.has(treeState.selected)) treeToggle(treeState.selected);
          else treeAscend();
        } else treeAscend();
        return;
      } else return;

      if (next) {
        event.preventDefault();
        treeSelect(next, { scroll: false });
        const row = document.querySelector(`[data-tree-key="${CSS.escape(next)}"]`);
        if (row) row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };
    document.addEventListener('keydown', treeKeyHandler);
  }

  // Family

  function renderFamily(route) {
    const id = route.path.split('/')[2] || '';
    const family = familyById.get(id);
    if (!family) {
      renderNotFound('没有找到这个大族。');
      return;
    }
    const entries = familyEntries.get(family.id) || [];
    const examples = entries.reduce((sum, entry) => sum + entry.examples.length, 0);
    const withBpm = entries.filter((entry) => entry.bpm).length;
    const children = family.childIds.map((childId) => entryById.get(childId)).filter(Boolean);
    const samples = entries.filter((entry) => entry.examples.length > 0).slice(0, 6);
    const relatedLessons = lessonsForKb(family.id);
    const familyColor = family.color;
    main.innerHTML = `
      <section class="atlas-hero ${familyClass(familyColor)}">
        <div class="breadcrumb"><a href="#/">首页</a><span class="sep">/</span><a href="#/atlas">风格图谱</a><span class="sep">/</span><span>${escapeHtml(family.name)}</span></div>
        <div class="hero-kicker">${family.archive ? 'ARCHIVE / 待归档' : family.supplement ? 'SUPPLEMENT / 补充收纳桶' : 'FAMILY / 大族'}</div>
        ${family.supplement ? `<p class="family-bucket-note">这是为补齐覆盖度而追加的收纳桶，不是一个音乐分类。桶内条目各自挂着正确的上位关系，可以从条目页回到它真正的母族。</p>` : ''}
        <div class="family-headline"><h1>${escapeHtml(family.name)}</h1><span>${escapeHtml(family.zh || '')}</span></div>
        <p class="family-intro is-clamped" id="familyIntro">${escapeHtml(family.intro || '这个分组还没有前言。你可以直接从下级分类或条目开始浏览。')}</p>
        <div class="family-actions">
          <a class="button-primary" href="#/atlas?family=${family.id}">浏览本族 ${entries.length} 条 →</a>
          <button class="button-ghost" type="button" data-random-family="${family.id}">随机一条</button>
          <button class="button-ghost" type="button" id="familyIntroToggle">展开简介</button>
        </div>
        <div class="atlas-stats">
          <div class="atlas-stat"><strong>${formatNumber(entries.length)}</strong>条目</div>
          <div class="atlas-stat"><strong>${formatNumber(children.length)}</strong>个直接下级</div>
          <div class="atlas-stat"><strong>${formatNumber(examples)}</strong>条例曲</div>
          <div class="atlas-stat"><strong>${formatNumber(withBpm)}</strong>条有明确 BPM</div>
        </div>
      </section>
      <section class="guide-body">
        ${familyListenStrip(family)}
        ${relatedLessons.length ? `<div class="kb-course-panel"><span class="mono-label">COURSE / 在课程中学习</span><div class="chip-row">${lessonChipsHTML(relatedLessons)}</div></div>` : ''}
        ${children.length ? `
          <div class="guide-section-head"><h2>下级分类</h2><span class="mono-label">STRUCTURE / 只表示文档层级</span></div>
          <div class="subfamily-grid">
            ${children.map((child) => `
              <a class="subfamily-card ${familyClass(familyColor)}" href="#/genre/${child.id}">
                <h3>${escapeHtml(child.name)}</h3>
                <p>${escapeHtml(stripLong(child.summary || '原始资料暂未展开这一条目。', 110))}</p>
                <div class="subfamily-foot"><span>${child.childrenIds.length} 个下级 · ${child.examples.length} 条例曲</span><span>↗</span></div>
              </a>`).join('')}
          </div>` : ''}
        ${samples.length ? `
          <div class="guide-section">
            <div class="guide-section-head"><h2>从这些条目开始</h2><a class="section-link" href="#/atlas?family=${family.id}">查看全部</a></div>
            <div class="genre-grid">${samples.map((entry) => genreCard(entry, '')).join('')}</div>
          </div>` : ''}
        ${ishkurFamilySummaryHTML(family.id, entries)}
      </section>`;

    const intro = document.getElementById('familyIntro');
    const toggle = document.getElementById('familyIntroToggle');
    if (intro && toggle) {
      toggle.addEventListener('click', () => {
        const clamped = intro.classList.toggle('is-clamped');
        toggle.textContent = clamped ? '展开简介' : '收起简介';
      });
    }

    const familyPlay = document.querySelector('[data-family-play]');
    if (familyPlay) {
      familyPlay.addEventListener('click', () => {
        const fam = LISTEN.families[family.id];
        if (!fam) return;
        const state = Audio?.getState();
        if (state && state.playing && state.demoId === `fp:${fam.fp}`) {
          Audio.stop();
          return;
        }
        Audio?.playFingerprint(fam.fp, {
          bpm: BAND_MID[fam.band] || 120,
          label: `${family.name} · 这一族的声音`,
        });
      });
    }
  }

  // Genre detail

  function renderGenre(route) {
    const id = route.path.split('/')[2] || '';
    const entry = entryById.get(id);
    if (!entry) {
      renderNotFound('没有找到这个风格条目。');
      return;
    }
    const family = familyById.get(entry.familyId);
    const siblings = familyEntries.get(entry.familyId) || [];
    const index = siblings.findIndex((item) => item.id === entry.id);
    const previous = index > 0 ? siblings[index - 1] : null;
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
    const children = entry.childrenIds.map((childId) => entryById.get(childId)).filter(Boolean);
    const bpmHint = entry.bpm ? null : curatedBpmHint(entry);
    const displayBpm = entry.bpm || (bpmHint ? bpmHint.bpm : null);
    const demo = demoForEntry(entry.id);
    const relatedLessons = lessonsForKb(entry.id);
    const stubText = entry.stub
      ? entry.stubReason === 'crossref'
        ? '原始资料把这一条指向了其他板块，没有独立展开。你仍可以通过关系与例曲继续追踪。'
        : entry.stubReason === 'pending'
          ? '原始资料把这一条标记为“待完善”。本库保留原状，不替原文补写。'
          : '原始资料对这一条的内容很少，暂时没有足够的描述。'
      : '';

    main.innerHTML = `
      <article class="detail ${familyClass(entry.familyColor)}">
        <nav class="breadcrumb" aria-label="面包屑">
          <a href="#/">首页</a><span class="sep">/</span>
          <a href="#/atlas">风格图谱</a><span class="sep">/</span>
          ${family ? `<a href="#/family/${family.id}">${escapeHtml(family.name)}</a><span class="sep">/</span>` : ''}
          ${entry.pathIds.map((pathId, pathIndex) => {
            const pathEntry = entryById.get(pathId);
            if (!pathEntry || pathIndex === entry.pathIds.length - 1) return '';
            return `<a href="#/genre/${pathId}">${escapeHtml(pathEntry.name)}</a><span class="sep">/</span>`;
          }).join('')}
          <span>${escapeHtml(entry.name)}</span>
        </nav>
        <header class="detail-header">
          <div class="detail-kicker">
            ${family ? `<a class="chip is-family ${familyClass(family.color)}" href="#/family/${family.id}">${escapeHtml(family.name)}${family.zh ? ` · ${escapeHtml(family.zh)}` : ''}</a>` : ''}
            ${entry.group ? `<span class="chip">${escapeHtml(entry.group)}</span>` : ''}
            ${entry.status ? `<span class="chip is-warn">${escapeHtml(entry.status)}</span>` : ''}
            ${entry.stub ? `<span class="chip is-warn">${entry.stubReason === 'crossref' ? '交叉引用' : '资料待补'}</span>` : ''}
          </div>
          <h1 class="detail-title">${escapeHtml(entry.name)}</h1>
          ${entry.aliases.length ? `<p class="detail-aliases">A.K.A. ${entry.aliases.map(escapeHtml).join(' / ')}</p>` : ''}
          <div class="detail-meta-row">
            ${bpmRuler(displayBpm, { large: true })}
            <div class="detail-meta-block"><div class="mono-label">FAMILY</div><strong>${escapeHtml(family ? family.name : entry.familyName)}</strong></div>
            <div class="detail-meta-block"><div class="mono-label">TRACKS</div><strong>${entry.examples.length} 条例曲</strong></div>
            <div class="detail-meta-block"><div class="mono-label">SOURCE</div><strong>L${entry.line}</strong></div>
            <div class="detail-meta-block"><div class="mono-label">TRAITS</div><div class="chip-row" style="margin-top:6px">${traitChips(entry.traits, 4) || '<span class="chip">未标注</span>'}</div></div>
          </div>
          ${bpmHint ? `<p class="bpm-source-note">原始分类库未标注 BPM；此处 ${escapeHtml(bpmHint.note || '补充来源')}：${escapeHtml(bpmHint.bpm.label)}。</p>` : ''}
        </header>
        ${listenBlockHTML(entry)}
        ${demo && !LISTEN.entries[entry.id] ? `<section class="detail-demo">
          <div>
            <span class="mono-label">SOUND / 合成试听</span>
            <h2>${escapeHtml(demo.name)} · ${demo.bpm} BPM</h2>
            <p>${escapeHtml(demo.blurb)} 浏览器实时合成，不是原曲。</p>
          </div>
          ${audioDemoButton(demo, '播放示例', 'is-large')}
        </section>` : ''}
        ${relatedLessons.length ? `<div class="kb-course-panel"><span class="mono-label">COURSE / 在课程中学习</span><div class="chip-row">${lessonChipsHTML(relatedLessons)}</div></div>` : ''}
        <div class="detail-layout">
          <div class="detail-body">
            ${entry.stub ? `<div class="detail-stub-note">${escapeHtml(stubText)}</div>` : ''}
            ${entry.description ? `<div class="detail-description">${escapeHtml(entry.description)}</div>` : `<div class="detail-stub-note">原始资料没有展开这一条目的描述。你仍可以从右侧关系和例曲继续探索。</div>`}
            <section class="detail-section">
              <h2>例曲索引</h2>
              <p class="section-sub">原文只保存文字索引。试听走 Apple Music 的 30 秒官方预览（有就播，没有就转去 B 站 / 网易云搜），本站不托管任何音频。</p>
              ${entry.examples.length ? `<ul class="example-list">${entry.examples.map((example) => `
                <li class="example-item">
                  <div>
                    <div class="example-title">${escapeHtml(cleanExampleText(example.title) || example.title)}</div>
                    ${example.artist ? `<div class="example-artist">${escapeHtml(cleanExampleText(example.artist) || example.artist)}</div>` : ''}
                    <div class="example-feedback" hidden></div>
                  </div>
                  ${exampleActions(example)}
                </li>`).join('')}</ul>` : '<p class="aside-relation-note">原始资料未列例曲。</p>'}
            </section>
            ${ishkurSectionHTML(entry)}
            <nav class="detail-nav" aria-label="同族前后条目">
              ${previous ? `<a href="#/genre/${previous.id}"><span class="mono-label">← PREVIOUS</span><strong>${escapeHtml(previous.name)}</strong></a>` : '<span></span>'}
              ${next ? `<a class="nav-next" href="#/genre/${next.id}"><span class="mono-label">NEXT →</span><strong>${escapeHtml(next.name)}</strong></a>` : '<span></span>'}
            </nav>
          </div>
          <aside class="detail-aside">
            <div class="aside-block">
              <h3>来路 / 上位</h3>
              ${relationChips(entry.relations.up, '原文没有记录上位影响。')}
              <p class="aside-relation-note">上位表示“受到什么影响/由什么演变”，不是目录父子关系。</p>
            </div>
            <div class="aside-block">
              <h3>去向 / 下位</h3>
              ${relationChips(entry.relations.down, '原文没有记录下位衍生。')}
            </div>
            <div class="aside-block">
              <h3>相似 / Related To</h3>
              ${relationChips(entry.relations.related, '没有标注相似风格。')}
            </div>
            ${children.length ? `<div class="aside-block"><h3>结构下级</h3><div class="chip-row">${children.map((child) => `<a class="chip" href="#/genre/${child.id}">${escapeHtml(child.name)}</a>`).join('')}</div></div>` : ''}
            <div class="aside-block">
              <h3>被引用</h3>
              ${entry.backlinks.length ? `<div class="chip-row">${entry.backlinks.slice(0, 12).map((link) => `<a class="chip" href="#/genre/${link.fromId}">${escapeHtml(link.fromName)}</a>`).join('')}</div>` : '<p class="aside-relation-note">还没有其他条目引用它。</p>'}
            </div>
            <div class="aside-block">
              <h3>原文位置</h3>
              <p class="source-line">《电音风格项目丨第四期》第 ${entry.line} 行 · <a href="https://my.feishu.cn/docx/doxcnC2Rbwa2saGhRoFxh1aq4Gc" target="_blank" rel="noopener noreferrer">打开飞书文档 ↗</a></p>
            </div>
          </aside>
        </div>
      </article>`;
    mountListenBlock(entry);
  }

  // Guides

  function guideHero(kicker, title, lead, note) {
    return `
      <section class="guide-hero">
        <div class="hero-kicker">${escapeHtml(kicker)}</div>
        <h1>${title}</h1>
        <p class="hero-lead">${escapeHtml(lead)}</p>
        ${note ? `<p class="guide-note">${escapeHtml(note)}</p>` : ''}
      </section>`;
  }

  function renderGuideListen() {
    main.innerHTML = `
      ${guideHero(
        'LISTENING / 听辨入门',
        '先听差异，<br><em>再记名字。</em>',
        '你不需要先背 1200 个名词。先抓住三个坐标：速度、鼓组、音色。它们能把“好听/不好听”拆成可以描述、可以比较的判断。',
        '这一页以《电音圣经》的十大风格为骨架，名称和细节用分类库校正。视频是 2020 年的风格快照，部分热度判断已经过时。'
      )}
      <div class="guide-body">
        <div class="coordinate-grid">
          ${CUR.coordinates.map((item, index) => {
            const color = ['violet', 'ice', 'heat'][index] || 'violet';
            return `<div class="coordinate ${familyClass(color)}"><div class="coordinate-label">${escapeHtml(item.label)}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div>`;
          }).join('')}
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>三步练习</h2><span class="mono-label">EDITOR'S METHOD / 编辑方法</span></div>
          <div class="practice-list">
            ${CUR.listen.practice.map((item, index) => `
              <div class="practice-card">
                <div class="mono-label">STEP ${String(index + 1).padStart(2, '0')}</div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.body)}</p>
              </div>`).join('')}
          </div>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>十种最常见的声音</h2><a class="section-link" href="#/atlas">去图谱里查更多</a></div>
          ${tenStylesHTML()}
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>两个容易混淆的点</h2></div>
          <div class="prose">
            ${CUR.listen.confusions.map((item) => `<p><strong>${escapeHtml(item.title)}</strong>${escapeHtml(item.body)}</p>`).join('')}
            <p>想进一步拆歌，读下一页：<a class="section-link" href="#/guide/production">结构、七组音色与音色链</a></p>
          </div>
        </div>
      </div>`;
  }

  function renderGuideProduction() {
    const production = CUR.production;
    const colors = ['violet', 'ice', 'phosphor', 'heat', 'violet', 'ice', 'phosphor'];
    main.innerHTML = `
      ${guideHero(production.kicker, production.title, production.lead, production.note)}
      <div class="guide-body">
        <div class="guide-section">
          <div class="guide-section-head"><h2>先搭时间的格子</h2><span class="mono-label">BEAT → BAR → PHRASE → SECTION</span></div>
          <div class="unit-grid">
            ${production.units.map((unit) => `
              <div class="unit-card">
                <span class="mono-label">${escapeHtml(unit.name)}</span>
                <h3>${escapeHtml(unit.zh)}</h3>
                <p>${escapeHtml(unit.body)}</p>
              </div>`).join('')}
          </div>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>八段结构：能量怎么走</h2><span class="mono-label">TYPICAL EDM HOUSE / 8 SECTIONS</span></div>
          ${structureStripHTML(false)}
          <div class="structure-player">
            <div class="structure-player-head">
              <div>
                <span class="mono-label">LISTEN / 听结构</span>
                <h3>把八段结构听一遍</h3>
                <p>合成示例会依次走过 Intro、Breakdown、Build-up、Drop、第二次间奏、第二次进阶、第二次 Drop 和 Outro。注意能量与层数的变化。</p>
              </div>
              <button class="audio-play-button is-large" type="button" data-audio-structure data-tooltip="播放浏览器实时合成的 16 小节结构示例">▶ 播放结构示例</button>
            </div>
            <div class="structure-player-progress"><span id="structureProgress"></span></div>
            <div class="structure-player-sections">
              ${production.sections.map((section, index) => `<div class="structure-player-section" data-structure-section="${index}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(section.name)}</strong><small>${escapeHtml(section.zh)}</small></div>`).join('')}
            </div>
          </div>
          <div class="structure-detail-grid">
            ${production.sections.map((section, index) => `
              <div class="structure-detail">
                <div class="structure-detail-top">
                  <span class="mono-label">${String(index + 1).padStart(2, '0')}</span>
                  <span class="mono-label">${escapeHtml(section.bars)} 小节</span>
                </div>
                <h3>${escapeHtml(section.name)} <span>${escapeHtml(section.zh)}</span></h3>
                <p>${escapeHtml(section.body)}</p>
              </div>`).join('')}
          </div>
          <p class="guide-note">${escapeHtml(production.structureNote)}</p>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>七大乐器组：谁在做什么</h2><span class="mono-label">SEVEN GROUPS / 功能分工</span></div>
          <p class="guide-lead">原视频用一个人物的骨架、肌肉、表情、气息和珠宝来比喻这七组：打击乐是骨架，贝斯是肌肉，和弦与人声是脸，主奏是曲线，氛围是气息，音效是珠宝。比喻之外，更重要的是每组在频段和段落里的分工。</p>
          <div class="instrument-grid">
            ${production.instrumentGroups.map((group, index) => `
              <article class="instrument-card ${familyClass(colors[index % colors.length])}">
                <div class="instrument-head">
                  <span class="instrument-role">${escapeHtml(group.role)}</span>
                  <span class="mono-label">${escapeHtml(group.en)}</span>
                </div>
                <h3>${escapeHtml(group.name)}</h3>
                <div class="instrument-freq">${escapeHtml(group.freq)}</div>
                <p>${escapeHtml(group.body)}</p>
                <div class="chip-row">${group.examples.map((example) => `<span class="chip">${escapeHtml(example)}</span>`).join('')}</div>
                <div class="instrument-listen"><span class="mono-label">LISTEN / 怎么听</span><p>${escapeHtml(group.listen)}</p></div>
              </article>`).join('')}
            <article class="instrument-card instrument-summary">
              <div class="instrument-head">
                <span class="instrument-role">小结</span>
                <span class="mono-label">MIX / 频段</span>
              </div>
              <h3>七组不是清单，是分工</h3>
              <p>同一个音色可以在不同段落扮演不同角色：Pad 可以变成 Lead，Vocal 可以被切成 FX。真正决定“像不像”的，是它在频段和段落里占了什么位置。</p>
              <div class="instrument-listen"><span class="mono-label">RULE / 一条规则</span><p>先让每个组在自己的频段里清楚，再谈“响不响”。</p></div>
            </article>
          </div>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>音色是怎么来的</h2><span class="mono-label">MIDI → SOURCE → FX → BUS</span></div>
          <div class="signal-chain">
            ${production.soundChain.steps.map((step) => `
              <div class="signal-step">
                <span class="mono-label">STEP ${escapeHtml(step.step)}</span>
                <h3>${escapeHtml(step.name)}</h3>
                <p>${escapeHtml(step.body)}</p>
              </div>`).join('')}
          </div>
          <div class="two-col-prose">
            <div>
              <h3>合成器：从波形开始</h3>
              <p>${escapeHtml(production.soundChain.synth)}</p>
              <p>${escapeHtml(production.soundChain.synthTypes)}</p>
            </div>
            <div>
              <h3>采样器：把录音变成乐器</h3>
              <p>${escapeHtml(production.soundChain.sampler)}</p>
            </div>
          </div>
          <h3 class="subhead">四类效果器</h3>
          <div class="effect-grid">
            ${production.soundChain.effects.map((effect) => `
              <div class="effect-card">
                <span class="mono-label">${escapeHtml(effect.examples)}</span>
                <h4>${escapeHtml(effect.name)}</h4>
                <p>${escapeHtml(effect.body)}</p>
              </div>`).join('')}
          </div>
          <p class="guide-note">${escapeHtml(production.soundChain.orderNote)}</p>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>${escapeHtml(production.frequency.title)}</h2><span class="mono-label">FREQUENCY / 频谱</span></div>
          <div class="frequency-map">
            ${production.frequency.bands.map((band) => `
              <div class="frequency-band">
                <span class="freq-range">${escapeHtml(band.range)}</span>
                <strong>${escapeHtml(band.name)}</strong>
                <p>${escapeHtml(band.body)}</p>
              </div>`).join('')}
          </div>
          <p class="guide-note">${escapeHtml(production.frequency.body)}</p>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>四个练习：把歌拆开</h2><span class="mono-label">PRACTICE / 编辑方法</span></div>
          <div class="practice-list">
            ${production.practice.map((item, index) => `
              <div class="practice-card">
                <div class="mono-label">STEP ${String(index + 1).padStart(2, '0')}</div>
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.body)}</p>
              </div>`).join('')}
          </div>
        </div>

        <div class="guide-section">
          <p class="guide-note">${escapeHtml(production.caveat)}</p>
        </div>
      </div>`;
  }

  function renderGuideHistory() {
    main.innerHTML = `
      ${guideHero(
        'TIMELINE / 历史脉络',
        '风格不是按年份<br><em>整齐切换的。</em>',
        '下面的时间线是一条粗略的主干：技术、场景、地理和媒介一起推动声音分叉。很多风格在同一个十年里并行发生，彼此影响。',
        '时间线根据分类库的前言、条目与两期播客整理；具体年份因场景而异，不应当作精确年表。'
      )}
      <div class="guide-body">
        ${timelineHTML()}
        <div class="guide-section">
          <div class="guide-section-head"><h2>为什么会不断分叉？</h2><span class="mono-label">FOUR DRIVERS / 四个驱动力</span></div>
          <div class="driver-grid">
            ${CUR.historyDrivers.map((item) => `<div class="driver-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div>`).join('')}
          </div>
        </div>
        <div class="guide-section">
          <div class="guide-section-head"><h2>怎么继续查</h2></div>
          <div class="prose">
            <p>从一个大族进入，先读“前言”，再沿着“上位/下位”看它的来路和去向。不要只看名称：同名条目可能分布在不同大族，详情页的面包屑会告诉你在哪一支。</p>
            <p><a class="section-link" href="#/guide/atlas">读图谱说明</a> <a class="section-link" href="#/atlas">打开风格图谱</a></p>
          </div>
        </div>
      </div>`;
  }

  function renderGuideLive() {
    main.innerHTML = `
      ${guideHero(
        CUR.live.kicker,
        '现场不是“听歌”，<br><em>是把身体交给一套系统。</em>',
        CUR.live.lead,
        '内容来自《多新鲜呐 ep31》的现场对谈。节目含品牌赞助，本页只提炼与电音文化有关的部分；带“编辑补充”的部分不属于原节目。'
      )}
      <div class="guide-body">
        <div class="live-points">
          ${CUR.live.sections.map((section, index) => `
            <div class="live-point">
              <span class="point-index">${String(index + 1).padStart(2, '0')}</span>
              <div><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body)}</p></div>
            </div>`).join('')}
        </div>
        <div class="guide-section">
          <div class="live-quote">
            <blockquote>${escapeHtml(CUR.live.quote.text)}</blockquote>
            <p class="quote-note">${escapeHtml(CUR.live.quote.note)}</p>
          </div>
        </div>
        <div class="guide-section">
          <div class="guide-section-head"><h2>${escapeHtml(CUR.live.checklistTitle)}</h2><span class="mono-label">${escapeHtml(CUR.live.checklistNote)}</span></div>
          <ul class="usage-list">${CUR.live.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
        <div class="guide-section">
          <div class="guide-section-head"><h2>现场与录音室的分工</h2></div>
          <div class="prose">
            <p>录音室追求可控：每一层音色、每一个频段都可以反复修改。现场追求不可控：房间会吃掉一些低频，人群会改变你的注意力，DJ 会根据台下反应临时换歌。两者不是同一个作品的不同音量版本。</p>
            <p>所以，别用“和耳机里一样吗”来判断现场。更值得问的是：它有没有把一群人带进同一个时间感里？</p>
          </div>
        </div>
      </div>`;
  }

  function renderGuideGlossary() {
    main.innerHTML = `
      ${guideHero(
        'GLOSSARY / 术语手册',
        '先知道词，<br><em>再描述声音。</em>',
        '曲式、鼓组、音色、设备、乐理、DJ 与制作。你不需要一次记住全部；遇到听不懂的词，回来查即可。',
        '解释以分类库的术语表为基础，部分用更直白的语言重写；不追求学院派定义的完备性。'
      )}
      <div class="guide-body">
        <div class="glossary-toolbar">
          <span class="mono-label">FILTER</span>
          <label class="sr-only" for="glossaryFilter">筛选术语</label>
          <input id="glossaryFilter" type="search" placeholder="筛选术语，例如 Drop、808、sidechain…" autocomplete="off">
        </div>
        <div id="glossaryList">
          ${CUR.glossary.map((group) => `
            <section class="glossary-group" data-glossary-group>
              <div class="glossary-group-head"><h2>${escapeHtml(group.group)}</h2><p>${escapeHtml(group.intro)}</p></div>
              <div class="glossary-terms">
                ${group.terms.map((term) => `
                  <div class="glossary-term" data-glossary-term>
                    <div><span class="term-name">${escapeHtml(term.term)}</span><span class="term-zh">${escapeHtml(term.zh)}</span></div>
                    <div class="term-def">${escapeHtml(term.def)}</div>
                  </div>`).join('')}
              </div>
            </section>`).join('')}
          <div class="glossary-empty" id="glossaryEmpty" hidden>没有匹配的术语。试试更短的关键词。</div>
        </div>
      </div>`;

    const input = document.getElementById('glossaryFilter');
    const empty = document.getElementById('glossaryEmpty');
    const groups = [...document.querySelectorAll('[data-glossary-group]')];
    if (input) {
      input.addEventListener('input', () => {
        const query = norm(input.value);
        let total = 0;
        for (const group of groups) {
          let visible = 0;
          for (const term of group.querySelectorAll('[data-glossary-term]')) {
            const matches = !query || norm(term.textContent).includes(query);
            term.hidden = !matches;
            if (matches) visible += 1;
          }
          group.hidden = visible === 0;
          total += visible;
        }
        empty.hidden = total !== 0;
      });
    }
  }

  function renderGuideAtlas() {
    main.innerHTML = `
      ${guideHero(
        'READING / 图谱说明',
        '怎么读<br><em>这张图谱。</em>',
        CUR.atlasGuide.lead,
        `数据生成于 ${CUR.updated}。图谱保留原文档的编辑口吻、未完成状态和存疑标记，不做“中立化”改写。`
      )}
      <div class="guide-body">
        <div class="prose">
          ${CUR.atlasGuide.sections.map((section) => `<h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.body)}</p>`).join('')}
        </div>
        <div class="guide-section">
          <div class="guide-section-head"><h2>数据规模</h2><span class="mono-label">BUILD / ${escapeHtml(CUR.updated)}</span></div>
          <div class="data-stats">
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.entries)}</strong><span>条目总数</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.activeEntries)}</strong><span>活跃条目</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.archiveEntries)}</strong><span>待归档</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.stubs)}</strong><span>待补 / 交叉引用</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.examples)}</strong><span>例曲索引</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.bpmEntries)}</strong><span>有明确 BPM</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.relationLinks)}</strong><span>关系链接</span></div>
            <div class="data-stat"><strong>${formatNumber(KB.meta.stats.families)}</strong><span>活跃大族</span></div>
            ${KB.meta.stats.supplementFamilies ? `<div class="data-stat"><strong>${formatNumber(KB.meta.stats.supplementEntries)}</strong><span>补充桶条目</span></div>` : ''}
          </div>
        </div>
      </div>`;
  }

  function labEffectiveGroups() {
    if (!labSolo) return labGroups;
    return LAB_GROUPS.reduce((acc, group) => {
      acc[group.id] = group.id === labSolo;
      return acc;
    }, {});
  }

  function renderLab() {
    const activeCount = LAB_GROUPS.filter((group) => labGroups[group.id]).length;
    main.innerHTML = `
      ${pageHead({
        code: '06',
        label: 'LAB',
        title: '音色实验室',
        lead: '同一段鼓组与 Bassline，换掉和弦、主奏、氛围与音效就会变成另一种情绪。先关掉所有层，再一层层加回来。',
        stats: [
          { label: '开启', value: `${activeCount}<span>/7</span>` },
          { label: 'BPM', value: `<span id="labBpmRead">${labBpm}</span>` },
          { label: '试听', value: '合成' },
        ],
      })}
      <section class="lab-body">
        <div class="lab-deck">
          <button class="lab-play" type="button" data-audio-lab>${uiIcon('play')} 播放</button>
          <label class="lab-bpm">
            <span class="lab-bpm-label">BPM</span>
            <input id="labBpm" type="range" min="100" max="160" step="1" value="${labBpm}">
            <output id="labBpmValue">${labBpm}</output>
          </label>
          <div class="lab-deck-actions">
            <button class="segment" type="button" data-lab-all="off">全关</button>
            <button class="segment" type="button" data-lab-all="on">全开</button>
          </div>
          <span class="lab-hint">按 <kbd>1</kbd> 到 <kbd>7</kbd> 开关 · <kbd>S</kbd> 独奏</span>
        </div>
        <div class="lab-channels">
          ${LAB_GROUPS.map((group, index) => {
            const on = Boolean(labGroups[group.id]);
            const solo = labSolo === group.id;
            const dim = Boolean(labSolo) && !solo;
            return `
              <div class="lab-channel ${familyClass(LAB_TONES[index])}${on ? ' is-on' : ''}${solo ? ' is-solo' : ''}${dim ? ' is-dim' : ''}" data-channel="${group.id}">
                <div class="lab-channel-top">
                  <span class="lab-channel-num">${String(index + 1).padStart(2, '0')}</span>
                  <span class="lab-channel-role">${escapeHtml(group.role)}</span>
                  <button class="lab-solo" type="button" data-lab-solo="${group.id}" aria-pressed="${solo}" aria-label="独奏 ${escapeHtml(group.name)}" data-tooltip="独奏这一层">S</button>
                </div>
                <button class="lab-toggle" type="button" data-lab-group="${group.id}" aria-pressed="${on}" aria-label="${on ? '关闭' : '开启'}${escapeHtml(group.name)}层">
                  <strong>${escapeHtml(group.name)}</strong>
                  <small>${escapeHtml(group.en)}</small>
                  <span class="lab-fader" aria-hidden="true"><i style="--fill:${on ? 0.86 : 0.12}"></i></span>
                  <em>${on ? 'ON' : 'OFF'}</em>
                </button>
                <p>${escapeHtml(group.desc)}</p>
              </div>`;
          }).join('')}
        </div>
        <div class="lab-explain">
          <div>
            <h2>怎么听</h2>
            <p>先只听打击乐，确认 Kick 的落点；加入贝斯，听低频如何变厚；再加和弦与主奏，听情绪如何被填满。最后打开氛围和 FX，听空间与转场如何出现。</p>
          </div>
          <a class="section-link" href="#/guide/production">回到七组音色的文字说明</a>
        </div>
      </section>`;
    bindLab();
  }

  function refreshLabChannels() {
    document.querySelectorAll('[data-channel]').forEach((channel) => {
      const id = channel.dataset.channel;
      const on = Boolean(labGroups[id]);
      const solo = labSolo === id;
      channel.classList.toggle('is-on', on);
      channel.classList.toggle('is-solo', solo);
      channel.classList.toggle('is-dim', Boolean(labSolo) && !solo);
      const toggle = channel.querySelector('[data-lab-group]');
      toggle?.setAttribute('aria-pressed', String(on));
      const marker = toggle?.querySelector('em');
      if (marker) marker.textContent = on ? 'ON' : 'OFF';
      toggle?.querySelector('.lab-fader i')?.style.setProperty('--fill', on ? '0.86' : '0.12');
      channel.querySelector('[data-lab-solo]')?.setAttribute('aria-pressed', String(solo));
    });
    const count = LAB_GROUPS.filter((group) => labGroups[group.id]).length;
    const firstStat = main.querySelector('.page-head-stats dd');
    if (firstStat) firstStat.innerHTML = `${count}<span>/${LAB_GROUPS.length}</span>`;
    const read = document.getElementById('labBpmRead');
    if (read) read.textContent = String(labBpm);
    return count;
  }

  function bindLab() {
    const bpmInput = document.getElementById('labBpm');
    const bpmValue = document.getElementById('labBpmValue');
    if (!document.querySelector('[data-lab-group]')) return;
    const syncAudio = () => {
      if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'lab') {
        Audio.setLabGroups(labEffectiveGroups());
      }
    };
    document.querySelectorAll('[data-lab-group]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.labGroup;
        if (labSolo) labSolo = null;
        labGroups[id] = !labGroups[id];
        refreshLabChannels();
        syncAudio();
      });
    });
    document.querySelectorAll('[data-lab-solo]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = button.dataset.labSolo;
        labSolo = labSolo === id ? null : id;
        refreshLabChannels();
        syncAudio();
      });
    });
    document.querySelectorAll('[data-lab-all]').forEach((button) => {
      button.addEventListener('click', () => {
        const on = button.dataset.labAll === 'on';
        labSolo = null;
        LAB_GROUPS.forEach((group) => { labGroups[group.id] = on; });
        refreshLabChannels();
        syncAudio();
      });
    });
    bpmInput?.addEventListener('input', () => {
      labBpm = Number(bpmInput.value);
      if (bpmValue) bpmValue.textContent = String(labBpm);
      const read = document.getElementById('labBpmRead');
      if (read) read.textContent = String(labBpm);
    });
    bpmInput?.addEventListener('change', () => {
      labBpm = Number(bpmInput.value);
      if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'lab') {
        Audio.stop();
        setTimeout(() => Audio.startLab({ bpm: labBpm, groups: labEffectiveGroups() }), 180);
      }
    });
    document.querySelector('[data-audio-lab]')?.setAttribute('aria-label', '播放七组音色实验室');

    if (labKeyHandler) document.removeEventListener('keydown', labKeyHandler);
    labKeyHandler = (event) => {
      if (!main.querySelector('[data-channel]')) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[1-7]$/.test(event.key)) {
        const group = LAB_GROUPS[Number(event.key) - 1];
        if (group) {
          event.preventDefault();
          document.querySelector(`[data-lab-group="${group.id}"]`)?.click();
        }
      } else if (event.key.toLowerCase() === 's' && labSolo) {
        event.preventDefault();
        labSolo = null;
        refreshLabChannels();
        syncAudio();
      }
    };
    document.addEventListener('keydown', labKeyHandler);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function newStyleQuiz() {
    const demos = Audio?.demos || [];
    if (!demos.length) {
      styleQuiz = null;
      return;
    }
    const target = demos[Math.floor(Math.random() * demos.length)];
    const options = shuffle([target, ...shuffle(demos.filter((demo) => demo.id !== target.id)).slice(0, 3)]);
    styleQuiz = { target, options, answered: false, selected: null };
  }

  function newBpmQuiz() {
    bpmQuiz = { target: 110 + Math.floor(Math.random() * 51), guess: 130, answered: false };
  }

  function demoLink(demo) {
    return demo.entryId?.startsWith('f-') ? `#/family/${demo.entryId}` : `#/genre/${demo.entryId}`;
  }

  function renderPractice(route) {
    const modeParam = route?.params?.get('mode');
    if (modeParam === 'bpm' || modeParam === 'style' || modeParam === 'phrase') practiceMode = modeParam;
    if (practiceMode === 'style' && !styleQuiz) newStyleQuiz();
    if (practiceMode === 'bpm' && !bpmQuiz) newBpmQuiz();
    const quiz = practiceMode === 'style' ? styleQuiz : bpmQuiz;
    main.innerHTML = `
      ${pageHead({
        code: '05',
        label: 'PRACTICE',
        title: '听辨练习',
        lead: practiceMode === 'phrase'
          ? '跟着 64 小节节拍器，练 8 小节一乐句的计数与边界判断；误差在 0.5 拍内算命中。'
          : '先听一小段合成示例，再判断风格或估 BPM。答错不是失败，重听一遍比记住答案更重要。',
        stats: practiceMode === 'phrase'
          ? [
              { label: '命中', value: `${phraseStats.hits}<span>/${phraseStats.attempts}</span>` },
              { label: '最佳偏差', value: phraseBestLabel() },
              { label: 'BPM', value: '100–140' },
            ]
          : [
              { label: '得分', value: `${practiceStats.score}<span>/${practiceStats.total}</span>` },
              { label: '连对', value: String(practiceStats.streak) },
              { label: '最佳', value: String(practiceStats.bestStreak) },
            ],
      })}
      <section class="practice-body">
        <div class="practice-switch" role="group" aria-label="练习模式">
          <button class="segment${practiceMode === 'style' ? ' is-active' : ''}" type="button" data-practice-mode="style">风格听辨</button>
          <button class="segment${practiceMode === 'bpm' ? ' is-active' : ''}" type="button" data-practice-mode="bpm">BPM 估速</button>
          <button class="segment${practiceMode === 'phrase' ? ' is-active' : ''}" type="button" data-practice-mode="phrase">乐句计数</button>
          <span class="practice-switch-hint">${practiceMode === 'phrase' ? '空格开始/停止 · H 标记乐句边界' : '按 1 到 4 作答 · 空格重听'}</span>
        </div>
        ${!Audio?.supported ? '<div class="practice-panel"><p>当前浏览器不支持 Web Audio，无法播放练习片段。</p></div>' : practiceMode === 'style' ? `
          <div class="practice-panel">
            <div class="practice-panel-head">
              <div class="practice-question">
                <span class="practice-q-index">Q${String(practiceStats.total + (quiz.answered ? 0 : 1)).padStart(2, '0')}</span>
                <h2>这段声音更像哪一类？</h2>
              </div>
              <button class="audio-play-button is-large" type="button" data-practice-style-play data-tooltip="播放一段 2 小节的合成循环">${uiIcon('play')} 播放片段</button>
            </div>
            <div class="practice-options">
              ${quiz.options.map((demo, index) => {
                const correct = quiz.answered && demo.id === quiz.target.id;
                const wrong = quiz.answered && demo.id === quiz.selected && demo.id !== quiz.target.id;
                return `<button class="practice-option${correct ? ' is-correct' : ''}${wrong ? ' is-wrong' : ''}" type="button" data-practice-answer="${demo.id}" ${quiz.answered ? 'disabled' : ''}>
                  <span class="practice-option-key">${index + 1}</span>
                  <span class="practice-option-name">${escapeHtml(demo.name)}</span>
                  <span class="practice-option-zh">${escapeHtml(demo.zh)}</span>
                  <span class="practice-option-mark">${correct ? '✓' : wrong ? '×' : ''}</span>
                </button>`;
              }).join('')}
            </div>
            ${quiz.answered ? `<div class="practice-feedback ${quiz.selected === quiz.target.id ? 'is-correct' : 'is-wrong'}" aria-live="polite">
              <strong>${quiz.selected === quiz.target.id ? '答对了。' : '再听一遍。'}</strong>
              这段是 <a href="${demoLink(quiz.target)}">${escapeHtml(quiz.target.name)} / ${escapeHtml(quiz.target.zh)}</a>，${quiz.target.bpm} BPM。
              <span>${escapeHtml(quiz.target.blurb)}</span>
              <div><button class="button-ghost" type="button" data-practice-next>下一题 →</button></div>
            </div>` : '<p class="practice-hint">提示：先听 Kick 的落点，再听低频和主奏音色；不要只凭速度判断。</p>'}
          </div>` : practiceMode === 'bpm' ? `
          <div class="practice-panel">
            <div class="practice-panel-head">
              <div class="practice-question">
                <span class="practice-q-index">Q${String(practiceStats.total + (quiz.answered ? 0 : 1)).padStart(2, '0')}</span>
                <h2>这段节拍大约多快？</h2>
              </div>
              <button class="audio-play-button is-large" type="button" data-practice-bpm-play data-tooltip="播放两小节合成节拍">${uiIcon('play')} 播放节拍</button>
            </div>
            <div class="bpm-guess">
              <input id="practiceBpmGuess" type="range" min="100" max="170" step="1" value="${quiz.guess}" ${quiz.answered ? 'disabled' : ''}>
              <output id="practiceBpmValue">${quiz.guess} BPM</output>
              ${!quiz.answered ? '<button class="button-primary" type="button" data-practice-bpm-submit>提交估计</button>' : ''}
            </div>
            ${quiz.answered ? `<div class="practice-feedback ${Math.abs(quiz.target - quiz.guess) <= 3 ? 'is-correct' : 'is-wrong'}" aria-live="polite">
              <strong>实际 ${quiz.target} BPM；你的估计 ${quiz.guess} BPM${Math.abs(quiz.target - quiz.guess) <= 3 ? '，很接近。' : '，再听一次重拍。'}</strong>
              <div><button class="button-ghost" type="button" data-practice-next>下一题 →</button></div>
            </div>` : '<p class="practice-hint">提示：跟着 Kick 点头，数十秒内的拍数；不要被 Hi-hat 的密度带跑。</p>'}
          </div>` : phrasePanelHTML()}
        <div class="practice-note">
          <p>所有练习片段都是浏览器实时合成的，不是原曲。答错后可以回到 <a href="#/guide/listen">听辨入门</a> 或 <a href="#/lab">音色实验室</a> 继续拆解。</p>
        </div>
      </section>`;
    bindPractice();
  }

  function phraseBestLabel() {
    return phraseStats.best == null ? '—' : `${phraseStats.best.toFixed(2)} 拍`;
  }

  function phrasePanelHTML() {
    return `
      <div class="practice-panel phrase-panel">
        <div class="practice-panel-head">
          <div class="practice-question">
            <span class="practice-q-index">PHRASE / 8 BARS</span>
            <h2>8 小节一乐句，你能踩准吗？</h2>
          </div>
          <div class="phrase-controls">
            <label class="phrase-bpm">BPM <input id="phraseBpm" type="range" min="100" max="140" step="1" value="124"><output id="phraseBpmValue">124</output></label>
            <button class="audio-play-button is-large" type="button" data-phrase-play>${uiIcon('play')} 开始 64 小节</button>
          </div>
        </div>
        <div class="phrase-visual" aria-hidden="true">
          <div class="phrase-row-label">乐句</div>
          <div class="phrase-phrases">${Array.from({ length: 8 }, (_, index) => `<span data-phrase-index="${index + 1}">${index + 1}</span>`).join('')}</div>
          <div class="phrase-row-label">小节</div>
          <div class="phrase-bars">${Array.from({ length: 8 }, (_, index) => `<span data-phrase-bar="${index + 1}">${index + 1}</span>`).join('')}</div>
        </div>
        <div class="phrase-now"><b id="phraseNowPhrase">第 1 乐句</b><span id="phraseNowBar">第 1 小节 · 第 1 拍</span></div>
        <div class="phrase-actions">
          <button class="button-primary" type="button" data-phrase-hit>乐句边界 <kbd>H</kbd></button>
          <button class="button-ghost" type="button" data-phrase-reset>清空成绩</button>
          <span class="mono-label" id="phraseFeedback">先开始，再在每 8 小节的第一拍按。</span>
        </div>
        <div class="phrase-stats">
          <span>命中 <b id="phraseHitStat">${phraseStats.hits}</b>/<b id="phraseAttemptStat">${phraseStats.attempts}</b></span>
          <span>最佳偏差 <b id="phraseBestStat">${phraseBestLabel()}</b></span>
        </div>
        <div class="phrase-next">
          <span class="mono-label">NEXT / 下一步</span>
          <a href="#/dj/course?ep=24">看对拍课 24–26 →</a>
          <a href="#/dj/field-guide">现场清单 →</a>
        </div>
        <p class="practice-hint">先数十秒，找到“每 8 小节一次”的循环。不要盯着进度条；用耳朵数，再按。误差在 0.5 拍内算命中。</p>
      </div>`;
  }

  function stopPhraseTimer() {
    if (phraseTimer) {
      window.clearInterval(phraseTimer);
      phraseTimer = null;
    }
  }

  function setPhraseButton(running) {
    const button = document.querySelector('[data-phrase-play]');
    if (button) button.innerHTML = running ? `${uiIcon('stop')} 停止` : `${uiIcon('play')} 开始 64 小节`;
  }

  function updatePhraseUI() {
    if (parseRoute().path !== '/practice' || practiceMode !== 'phrase') {
      stopPhraseTimer();
      Audio?.stop();
      return;
    }
    const state = Audio?.getState();
    if (!state?.playing || state.demoId !== 'practice-metronome') {
      const wasRunning = phraseState.running;
      phraseState.running = false;
      setPhraseButton(false);
      stopPhraseTimer();
      if (wasRunning) {
        const feedback = document.getElementById('phraseFeedback');
        if (feedback) feedback.textContent = `本次结束 · 命中 ${phraseStats.hits}/${phraseStats.attempts}`;
      }
      return;
    }
    const bpm = state.bpm || 124;
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;
    const elapsed = state.elapsed || 0;
    const globalBar = Math.floor(elapsed / barSec);
    const phrase = Math.min(8, Math.floor(globalBar / 8) + 1);
    const bar = (globalBar % 8) + 1;
    const beat = Math.floor((elapsed % barSec) / beatSec) + 1;
    phraseState = { phrase, bar, beat, running: true };
    document.querySelectorAll('[data-phrase-index]').forEach((el) => {
      const value = Number(el.dataset.phraseIndex);
      el.classList.toggle('is-on', value === phrase);
      el.classList.toggle('is-done', value < phrase);
    });
    document.querySelectorAll('[data-phrase-bar]').forEach((el) => {
      const value = Number(el.dataset.phraseBar);
      el.classList.toggle('is-on', value === bar);
      el.classList.toggle('is-done', value < bar);
    });
    const nowPhrase = document.getElementById('phraseNowPhrase');
    const nowBar = document.getElementById('phraseNowBar');
    if (nowPhrase) nowPhrase.textContent = `第 ${phrase} 乐句`;
    if (nowBar) nowBar.textContent = `第 ${bar} 小节 · 第 ${beat} 拍`;
    setPhraseButton(true);
  }

  function startPhraseTimer() {
    stopPhraseTimer();
    phraseTimer = window.setInterval(updatePhraseUI, 80);
    updatePhraseUI();
  }

  function togglePhraseDrill() {
    const state = Audio?.getState();
    if (state?.playing && state.demoId === 'practice-metronome') {
      Audio.stop();
      stopPhraseTimer();
      setPhraseButton(false);
      return;
    }
    const bpm = Number(document.getElementById('phraseBpm')?.value) || 124;
    if (!Audio?.supported) return;
    Audio.stop();
    Audio.playPracticeMetronome(bpm, 64);
    phraseState = { phrase: 1, bar: 1, beat: 1, running: true };
    const feedback = document.getElementById('phraseFeedback');
    if (feedback) feedback.textContent = '开始：每 8 小节的第一拍按一次。';
    startPhraseTimer();
  }

  function hitPhraseBoundary() {
    const state = Audio?.getState();
    if (!state?.playing || state.demoId !== 'practice-metronome') {
      const feedback = document.getElementById('phraseFeedback');
      if (feedback) feedback.textContent = '先开始练习，再按乐句边界。';
      return;
    }
    const bpm = state.bpm || 124;
    const beatSec = 60 / bpm;
    const phraseSec = beatSec * 32;
    const elapsed = state.elapsed || 0;
    const nearest = Math.round(elapsed / phraseSec);
    const error = elapsed - nearest * phraseSec;
    const errorBeats = error / beatSec;
    const absBeats = Math.abs(errorBeats);
    phraseStats.attempts += 1;
    if (absBeats <= 0.5) phraseStats.hits += 1;
    if (phraseStats.best == null || absBeats < phraseStats.best) phraseStats.best = absBeats;
    const hit = absBeats <= 0.5;
    const direction = absBeats < 0.05 ? '正好' : errorBeats > 0 ? '偏晚' : '偏早';
    const feedback = document.getElementById('phraseFeedback');
    if (feedback) {
      feedback.textContent = `${hit ? '命中' : '没踩准'}：${direction} ${absBeats.toFixed(2)} 拍（${Math.round(Math.abs(error) * 1000)} ms）`;
      feedback.classList.toggle('is-hit', hit);
      feedback.classList.toggle('is-miss', !hit);
    }
    const hitEl = document.getElementById('phraseHitStat');
    const attemptEl = document.getElementById('phraseAttemptStat');
    const bestEl = document.getElementById('phraseBestStat');
    if (hitEl) hitEl.textContent = String(phraseStats.hits);
    if (attemptEl) attemptEl.textContent = String(phraseStats.attempts);
    if (bestEl) bestEl.textContent = phraseBestLabel();
  }

  function bindPhrasePractice() {
    const bpmInput = document.getElementById('phraseBpm');
    const bpmValue = document.getElementById('phraseBpmValue');
    bpmInput?.addEventListener('input', () => {
      if (bpmValue) bpmValue.textContent = bpmInput.value;
    });
    document.querySelector('[data-phrase-play]')?.addEventListener('click', togglePhraseDrill);
    document.querySelector('[data-phrase-hit]')?.addEventListener('click', hitPhraseBoundary);
    document.querySelector('[data-phrase-reset]')?.addEventListener('click', () => {
      phraseStats.attempts = 0;
      phraseStats.hits = 0;
      phraseStats.best = null;
      const feedback = document.getElementById('phraseFeedback');
      if (feedback) {
        feedback.textContent = '成绩已清空。';
        feedback.classList.remove('is-hit', 'is-miss');
      }
      const hitEl = document.getElementById('phraseHitStat');
      const attemptEl = document.getElementById('phraseAttemptStat');
      const bestEl = document.getElementById('phraseBestStat');
      if (hitEl) hitEl.textContent = '0';
      if (attemptEl) attemptEl.textContent = '0';
      if (bestEl) bestEl.textContent = '—';
    });
    if (practiceMode === 'phrase') startPhraseTimer();
  }

  function bindPractice() {
    document.querySelectorAll('[data-practice-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        Audio?.stop();
        stopPhraseTimer();
        practiceMode = button.dataset.practiceMode;
        replaceHash(`#/practice?mode=${practiceMode}`);
        if (practiceMode === 'style' && !styleQuiz) newStyleQuiz();
        if (practiceMode === 'bpm' && !bpmQuiz) newBpmQuiz();
        renderPractice();
      });
    });
    document.querySelector('[data-practice-style-play]')?.addEventListener('click', () => {
      if (!styleQuiz || !Audio?.supported) return;
      const state = Audio.getState();
      if (state.playing && state.demoId === styleQuiz.target.id) Audio.stop();
      else Audio.playDemo(styleQuiz.target.id);
    });
    document.querySelectorAll('[data-practice-answer]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!styleQuiz || styleQuiz.answered) return;
        styleQuiz.answered = true;
        styleQuiz.selected = button.dataset.practiceAnswer;
        const correct = styleQuiz.selected === styleQuiz.target.id;
        practiceStats.total += 1;
        if (correct) {
          practiceStats.score += 1;
          practiceStats.streak += 1;
          practiceStats.bestStreak = Math.max(practiceStats.bestStreak, practiceStats.streak);
        } else {
          practiceStats.streak = 0;
        }
        Audio?.stop();
        renderPractice();
      });
    });
    document.querySelector('[data-practice-bpm-play]')?.addEventListener('click', () => {
      if (!bpmQuiz || !Audio?.supported) return;
      const state = Audio.getState();
      if (state.playing && state.demoId === 'metronome') Audio.stop();
      else Audio.playMetronome(bpmQuiz.target);
    });
    const guess = document.getElementById('practiceBpmGuess');
    const guessValue = document.getElementById('practiceBpmValue');
    guess?.addEventListener('input', () => {
      if (bpmQuiz) bpmQuiz.guess = Number(guess.value);
      if (guessValue) guessValue.textContent = `${guess.value} BPM`;
    });
    document.querySelector('[data-practice-bpm-submit]')?.addEventListener('click', () => {
      if (!bpmQuiz || bpmQuiz.answered) return;
      bpmQuiz.answered = true;
      practiceStats.total += 1;
      if (Math.abs(bpmQuiz.target - bpmQuiz.guess) <= 3) {
        practiceStats.score += 1;
        practiceStats.streak += 1;
        practiceStats.bestStreak = Math.max(practiceStats.bestStreak, practiceStats.streak);
      } else {
        practiceStats.streak = 0;
      }
      Audio?.stop();
      renderPractice();
    });
    document.querySelector('[data-practice-next]')?.addEventListener('click', () => {
      Audio?.stop();
      if (practiceMode === 'style') newStyleQuiz();
      else newBpmQuiz();
      renderPractice();
    });
    bindPhrasePractice();

    // Keyboard answers: 1-4 picks an option, space replays, Enter takes the next question.
    if (practiceKeyHandler) document.removeEventListener('keydown', practiceKeyHandler);
    practiceKeyHandler = (event) => {
      if (parseRoute().path !== '/practice') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === ' ') {
        event.preventDefault();
        if (practiceMode === 'phrase') document.querySelector('[data-phrase-play]')?.click();
        else if (practiceMode === 'style') document.querySelector('[data-practice-style-play]')?.click();
        else document.querySelector('[data-practice-bpm-play]')?.click();
        return;
      }
      if (practiceMode === 'phrase' && (event.key === 'h' || event.key === 'H')) {
        event.preventDefault();
        document.querySelector('[data-phrase-hit]')?.click();
        return;
      }
      if (event.key === 'Enter') {
        const nextButton = document.querySelector('[data-practice-next]');
        if (nextButton) {
          event.preventDefault();
          nextButton.click();
        }
        return;
      }
      if (/^[1-4]$/.test(event.key) && practiceMode === 'style' && styleQuiz && !styleQuiz.answered) {
        const option = document.querySelectorAll('[data-practice-answer]')[Number(event.key) - 1];
        if (option) {
          event.preventDefault();
          option.click();
        }
      }
    };
    document.addEventListener('keydown', practiceKeyHandler);
  }

  function lessonKbLinksHTML(lesson) {
    const links = (lesson.kbLinks || []).map((id) => `<a class="chip" href="${courseKbHref(id)}">${escapeHtml(courseKbLabel(id))}</a>`);
    const internal = (lesson.links || []).map((link) => `<a class="chip" href="${link.href}">${escapeHtml(link.label)}</a>`);
    return `<div class="chip-row">${[...links, ...internal].join('')}</div>`;
  }

  function renderLessonWidget(lesson) {
    const widget = lesson.widget || { type: 'none' };
    if (widget.type === 'metronome') {
      return `
        <div class="lesson-widget" data-lesson-widget="metronome">
          <div class="lesson-widget-head">
            <div><span class="mono-label">INTERACTIVE / 节拍器</span><h3>先跟着数 8 拍</h3></div>
            <button class="audio-play-button is-large" type="button" data-lesson-metronome-play data-tooltip="浏览器实时合成的节拍器">▶ 播放节拍</button>
          </div>
          <label class="lesson-bpm">BPM
            <input id="lessonMetronomeBpm" type="range" min="80" max="180" step="1" value="${widget.bpm || 120}">
            <output id="lessonMetronomeValue">${widget.bpm || 120}</output>
          </label>
          <div class="lesson-beat-dots" data-lesson-beats>
            <span data-beat-dot="0">1</span><span data-beat-dot="1">2</span><span data-beat-dot="2">3</span><span data-beat-dot="3">4</span>
            <i class="lesson-beat-loop" data-lesson-beat-loop aria-hidden="true"></i>
          </div>
          <p class="lesson-widget-note">播放时跟着数 1-2-3-4；每四拍换一小节。<span class="lesson-loop-read" data-lesson-loop-read>循环 2 小节</span></p>
        </div>`;
    }
    if (widget.type === 'sequencer') {
      const pattern = widget.pattern || {
        kick: [true, false, false, false, true, false, false, false],
        snare: [false, false, true, false, false, false, true, false],
        hat: [true, true, true, true, true, true, true, true],
      };
      const rows = [
        { id: 'kick', label: 'Kick' },
        { id: 'snare', label: 'Clap' },
        { id: 'hat', label: 'Hi-hat' },
      ];
      return `
        <div class="lesson-widget" data-lesson-widget="sequencer">
          <div class="lesson-widget-head">
            <div><span class="mono-label">INTERACTIVE / 鼓组步进器</span><h3>搭一个 4/4 鼓型</h3></div>
            <button class="audio-play-button is-large" type="button" data-lesson-drum-play data-tooltip="浏览器实时合成的鼓组循环">▶ 播放鼓组</button>
          </div>
          <div class="drum-grid">
            ${rows.map((row) => `
              <div class="drum-row">
                <span class="drum-label">${row.label}</span>
                <div class="drum-steps">
                  ${Array.from({ length: 8 }, (_, index) => `<button class="drum-step${pattern[row.id][index] ? ' is-on' : ''}${index % 4 === 0 ? ' is-beat' : ''}" type="button" data-drum-step="${row.id}-${index}" data-drum-col="${index}" aria-pressed="${Boolean(pattern[row.id][index])}" aria-label="${row.label} 第 ${index + 1} 格"></button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <label class="lesson-bpm">BPM
            <input id="lessonDrumBpm" type="range" min="90" max="160" step="1" value="${widget.bpm || 118}">
            <output id="lessonDrumValue">${widget.bpm || 118}</output>
          </label>
          <div class="lesson-loop-bar" data-lesson-loop data-lesson-loop-bars="1">
            <span class="lesson-loop-label">循环</span>
            <span class="lesson-loop-track"><i data-lesson-loop-fill></i></span>
            <span class="lesson-loop-count" data-lesson-loop-count>1 / 1</span>
          </div>
          <p class="lesson-widget-note">8 格代表一个小节里的八分音符。先保留 Kick 与 Clap，再试试点亮或关掉 Hi-hat。</p>
        </div>`;
    }
    if (widget.type === 'compare') {
      const demos = (widget.demos || []).map((id) => Audio?.demos?.find((demo) => demo.id === id)).filter(Boolean);
      return `
        <div class="lesson-widget" data-lesson-widget="compare">
          <div class="lesson-widget-head">
            <div><span class="mono-label">COMPARE / 对比听</span><h3>${escapeHtml(widget.prompt || '两段各听一遍')}</h3></div>
          </div>
          <div class="lesson-demo-grid">
            ${demos.map((demo) => `<button class="lesson-demo" type="button" data-audio-demo="${demo.id}" data-audio-label="播放 ${escapeHtml(demo.name)}">
              <strong>${escapeHtml(demo.name)}</strong>
              <span>${escapeHtml(demo.zh)} · ${demo.bpm} BPM</span>
              <i class="lesson-demo-ring" aria-hidden="true"></i>
            </button>`).join('')}
          </div>
          <p class="lesson-widget-note">每段循环 2 小节；先听鼓组，再听低频和主奏。</p>
        </div>`;
    }
    if (widget.type === 'lab') {
      const groups = widget.groups || {};
      return `
        <div class="lesson-widget" data-lesson-widget="lab">
          <div class="lesson-widget-head">
            <div><span class="mono-label">INTERACTIVE / 分层实验室</span><h3>${escapeHtml(widget.prompt || '一次只加或减一层')}</h3></div>
            <button class="audio-play-button is-large" type="button" data-lesson-lab-play data-tooltip="浏览器实时合成的分层循环">▶ 播放实验室</button>
          </div>
          <div class="lesson-lab-groups" data-lesson-lab-groups>
            ${LAB_GROUPS.map((group) => `<button class="lesson-lab-toggle${groups[group.id] ? ' is-on' : ''} ${familyClass(['violet','heat','phosphor','ice','violet','ice','phosphor'][LAB_GROUPS.indexOf(group)])}" type="button" data-lesson-lab-group="${group.id}" aria-pressed="${Boolean(groups[group.id])}"><strong>${escapeHtml(group.name)}</strong><span>${escapeHtml(group.en)}</span><i class="lesson-lab-pulse" aria-hidden="true"></i></button>`).join('')}
          </div>
          <label class="lesson-bpm">BPM
            <input id="lessonLabBpm" type="range" min="100" max="160" step="1" value="${widget.bpm || 124}">
            <output id="lessonLabValue">${widget.bpm || 124}</output>
          </label>
          <div class="lesson-loop-bar" data-lesson-loop data-lesson-loop-bars="2">
            <span class="lesson-loop-label">循环</span>
            <span class="lesson-loop-track"><i data-lesson-loop-fill></i></span>
            <span class="lesson-loop-count" data-lesson-loop-count>1 / 2</span>
          </div>
          <p class="lesson-widget-note">从默认层开始，一次只改变一个开关；先让每一层在自己的频段里清楚。</p>
        </div>`;
    }
    if (widget.type === 'structure') {
      return `
        <div class="lesson-widget" data-lesson-widget="structure">
          <div class="lesson-widget-head">
            <div><span class="mono-label">LISTEN / 结构播放器</span><h3>跟着高亮听完八段</h3></div>
            <button class="audio-play-button is-large" type="button" data-audio-structure data-tooltip="播放 16 小节的合成结构示例">▶ 播放结构示例</button>
          </div>
          <div class="structure-player-progress"><span id="structureProgress"></span></div>
          <div class="structure-player-sections">
            ${CUR.production.sections.map((section, index) => `<div class="structure-player-section" data-structure-section="${index}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(section.name)}</strong><small>${escapeHtml(section.zh)}</small><i class="structure-scan" aria-hidden="true"></i></div>`).join('')}
          </div>
          <p class="lesson-widget-note">不是完整歌曲，而是一段 30 秒的结构示意；注意每一段的层数与能量变化。</p>
        </div>`;
    }
    if (widget.type === 'chords') {
      return `
        <div class="lesson-widget" data-lesson-widget="chords">
          <div class="lesson-widget-head">
            <div><span class="mono-label">INTERACTIVE / 和弦试听</span><h3>点一个和弦，听它的颜色</h3></div>
          </div>
          <div class="lesson-chords">
            ${(widget.chords || []).map((chord) => `<button class="lesson-chord" type="button" data-chord-notes='${escapeHtml(JSON.stringify(chord.notes))}' data-chord-label="${escapeHtml(chord.label)}"><strong>${escapeHtml(chord.label)}</strong><span>${escapeHtml(chord.note)}</span></button>`).join('')}
          </div>
          <p class="lesson-widget-note">每个和弦约 2 秒；试着按 Fm → Ab → Eb → Bb 的顺序听一遍。</p>
        </div>`;
    }
    return '';
  }

  function bindLessonWidget(lesson) {
    const widget = lesson.widget || { type: 'none' };
    if (widget.type === 'metronome') {
      const input = document.getElementById('lessonMetronomeBpm');
      const output = document.getElementById('lessonMetronomeValue');
      const button = document.querySelector('[data-lesson-metronome-play]');
      if (!input || !button) return;
      const read = () => Number(input.value);
      const restart = () => {
        if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'metronome') {
          Audio.stop();
          setTimeout(() => Audio.playMetronome(read()), 180);
        }
      };
      input.addEventListener('input', () => {
        if (output) output.textContent = input.value;
      });
      input.addEventListener('change', restart);
      button.addEventListener('click', () => {
        const state = Audio?.getState();
        if (state?.playing && state.demoId === 'metronome') Audio.stop();
        else Audio?.playMetronome(read());
      });
    }
    if (widget.type === 'sequencer') {
      const pattern = widget.pattern
        ? JSON.parse(JSON.stringify(widget.pattern))
        : {
            kick: [true, false, false, false, true, false, false, false],
            snare: [false, false, true, false, false, false, true, false],
            hat: [true, true, true, true, true, true, true, true],
          };
      const input = document.getElementById('lessonDrumBpm');
      const output = document.getElementById('lessonDrumValue');
      const button = document.querySelector('[data-lesson-drum-play]');
      const buttons = [...document.querySelectorAll('[data-drum-step]')];
      const refresh = () => {
        buttons.forEach((stepButton) => {
          const [row, index] = stepButton.dataset.drumStep.split('-');
          const on = Boolean(pattern[row]?.[Number(index)]);
          stepButton.classList.toggle('is-on', on);
          stepButton.setAttribute('aria-pressed', String(on));
        });
        if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'drum-machine') {
          Audio.setDrumPattern(pattern);
        }
      };
      buttons.forEach((stepButton) => {
        stepButton.addEventListener('click', () => {
          const [row, index] = stepButton.dataset.drumStep.split('-');
          pattern[row][Number(index)] = !pattern[row][Number(index)];
          refresh();
        });
      });
      input?.addEventListener('input', () => {
        if (output) output.textContent = input.value;
      });
      input?.addEventListener('change', () => {
        if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'drum-machine') {
          Audio.stop();
          setTimeout(() => Audio.startDrumMachine({ bpm: Number(input.value), pattern }), 180);
        }
      });
      button?.addEventListener('click', () => {
        const state = Audio?.getState();
        if (state?.playing && state.demoId === 'drum-machine') Audio.stop();
        else Audio?.startDrumMachine({ bpm: Number(input?.value) || 118, pattern });
      });
    }
    if (widget.type === 'lab') {
      const groups = { ...(widget.groups || {}) };
      const buttons = [...document.querySelectorAll('[data-lesson-lab-group]')];
      const play = document.querySelector('[data-lesson-lab-play]');
      const input = document.getElementById('lessonLabBpm');
      const output = document.getElementById('lessonLabValue');
      const refresh = () => {
        buttons.forEach((button) => {
          const on = Boolean(groups[button.dataset.lessonLabGroup]);
          button.classList.toggle('is-on', on);
          button.setAttribute('aria-pressed', String(on));
        });
        if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'lab') {
          Audio.setLabGroups(groups);
        }
      };
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.dataset.lessonLabGroup;
          groups[id] = !groups[id];
          refresh();
        });
      });
      input?.addEventListener('input', () => {
        if (output) output.textContent = input.value;
      });
      input?.addEventListener('change', () => {
        if (Audio?.supported && Audio.getState().playing && Audio.getState().demoId === 'lab') {
          Audio.stop();
          setTimeout(() => Audio.startLab({ bpm: Number(input.value), groups }), 180);
        }
      });
      play?.addEventListener('click', () => {
        const state = Audio?.getState();
        if (state?.playing && state.demoId === 'lab') Audio.stop();
        else Audio?.startLab({ bpm: Number(input?.value) || 124, groups });
      });
    }
    if (widget.type === 'chords') {
      document.querySelectorAll('[data-chord-notes]').forEach((button) => {
        button.addEventListener('click', () => {
          try {
            const notes = JSON.parse(button.dataset.chordNotes);
            Audio?.previewChord(notes, `${button.dataset.chordLabel || '和弦'} 试听`);
          } catch {
            // Ignore malformed chord data.
          }
        });
      });
    }
  }

  // Stage-level knowledge map: what you must already know, what this stage adds,
  // and how you prove you are done. Chips resolve into the knowledge base.
  function stageMetaHTML(chapter) {
    const knowledge = chapter.knowledge || [];
    return `
      <div class="stage-meta">
        <div class="stage-meta-knowledge">
          <span class="stage-meta-label">知识点 · ${knowledge.length}</span>
          <div class="stage-knowledge">
            ${knowledge.map((item) => `<a class="knowledge-chip" href="${courseKbHref(item.kb)}">${escapeHtml(item.label)}</a>`).join('')}
          </div>
        </div>
        <div class="stage-meta-gate">
          <p><span>进入</span>${escapeHtml(chapter.entry || '')}</p>
          <p><span>验收</span>${escapeHtml(chapter.exit || '')}</p>
        </div>
      </div>`;
  }

  function renderLearn() {
    const total = COURSE_LESSONS.length;
    const completed = courseCompleted.size;
    const next = firstIncompleteLesson();
    const nextHref = next ? `#/learn/${next.id}` : '#/learn';
    const remaining = total - completed;
    const knowledgeCount = COURSE_CHAPTERS.reduce((sum, chapter) => sum + (chapter.knowledge || []).length, 0);
    const visibleChapters = COURSE_CHAPTERS.map((chapter) => ({
      chapter,
      lessons: courseFilter === 'todo'
        ? chapter.lessons.filter((lesson) => !courseCompleted.has(lesson.id))
        : chapter.lessons,
    })).filter((item) => item.lessons.length);

    main.innerHTML = `
      <section class="learn-head">
        ${pageHead({
          code: '01',
          label: 'COURSE',
          title: '制作课',
          lead: '八阶段、二十二节短课，顺序由制作依赖决定：先让声音出来，再让低频、和声与结构成立，最后混音与导出。每课只留一个可交付的产物。',
          stats: [
            { label: '课时', value: `${completed}<span>/${total}</span>` },
            { label: '阶段', value: String(COURSE_CHAPTERS.length) },
            { label: '知识点', value: String(knowledgeCount) },
            { label: '剩余', value: String(remaining) },
          ],
          action: { href: nextHref, label: completed ? `继续 · ${next ? next.title : '课程地图'}` : '开始第一课' },
        })}
        <div class="path-deck">
          <div class="path-deck-top">
            <span class="path-deck-label">PATH</span>
            <span class="path-deck-count">${completed}/${total}</span>
            <span class="path-deck-next">NEXT <strong>${next ? escapeHtml(next.title) : '全部完成'}</strong></span>
            <div class="path-deck-filters" role="group" aria-label="课程过滤">
              <button class="segment${courseFilter === 'all' ? ' is-active' : ''}" type="button" data-course-filter="all">全部 ${total}</button>
              <button class="segment${courseFilter === 'todo' ? ' is-active' : ''}" type="button" data-course-filter="todo">未完成 ${remaining}</button>
            </div>
          </div>
          <div class="route-tiers" aria-hidden="true">
            ${courseTiers.map((tier) => `<span class="route-tier" style="--span:${tier.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0)}"><em>${escapeHtml(tier.name)}</em><b>${escapeHtml(tier.caption)}</b></span>`).join('')}
          </div>
          <ol class="route" aria-label="八阶段学习路线，每格一课，可直接跳转">
            ${COURSE_CHAPTERS.map((chapter) => {
              const done = chapter.lessons.filter((lesson) => courseCompleted.has(lesson.id)).length;
              const full = done === chapter.lessons.length;
              const current = Boolean(next && next.chapterId === chapter.id);
              return `<li class="route-stage ${familyClass(chapter.color)}${full ? ' is-complete' : ''}${current ? ' is-current' : ''}" style="--span:${chapter.lessons.length}">
                <a class="route-stage-head" href="#/learn/${chapter.lessons[0].id}" data-tooltip="${escapeHtml(chapter.outcome)}">
                  <span class="route-index">${escapeHtml(chapter.index)}</span>
                  <span class="route-name">${escapeHtml(chapter.short || chapter.title)}</span>
                  <span class="route-count">${done}/${chapter.lessons.length}</span>
                </a>
                <span class="route-ticks">
                  ${chapter.lessons.map((lesson) => {
                    const lessonDone = courseCompleted.has(lesson.id);
                    const isNext = next?.id === lesson.id;
                    return `<a class="route-tick${lessonDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}" href="#/learn/${lesson.id}" aria-label="${escapeHtml(`${chapter.title} · ${lesson.title}${lessonDone ? '，已完成' : ''}`)}" data-tooltip="${escapeHtml(lesson.title)}"></a>`;
                  }).join('')}
                </span>
              </li>`;
            }).join('')}
          </ol>
          <div class="path-deck-foot">
            <span>由浅入深：基础 3 阶段 → 进阶 3 阶段 → 完成 2 阶段</span>
            <span class="path-legend"><i class="is-done"></i>已完成<i class="is-next"></i>下一课<i></i>未开始</span>
          </div>
        </div>
      </section>
      <section class="course-body">
        <div class="course-tracklist">
          ${visibleChapters.map(({ chapter, lessons }) => {
            const chapterDone = chapter.lessons.filter((lesson) => courseCompleted.has(lesson.id)).length;
            const chapterComplete = chapterDone === chapter.lessons.length;
            const current = Boolean(next && next.chapterId === chapter.id);
            if (chapterComplete && courseFilter === 'todo') return '';
            return `
              <article class="stage-card ${familyClass(chapter.color)}${current ? ' is-current' : ''}${chapterComplete ? ' is-complete' : ''}">
                <div class="stage-card-head">
                  <span class="stage-card-index">${escapeHtml(chapter.index)}</span>
                  <div class="stage-card-title">
                    <span class="stage-card-tier">${escapeHtml(chapter.tier || '')}${chapter.subtitle ? ` · ${escapeHtml(chapter.subtitle)}` : ''}</span>
                    <h2>${escapeHtml(chapter.title)}</h2>
                    <p>${escapeHtml(chapter.outcome || chapter.subtitle)}</p>
                  </div>
                  <div class="stage-card-meter">
                    <span class="stage-meter-bars" aria-hidden="true">
                      ${chapter.lessons.map((lesson) => `<i class="${courseCompleted.has(lesson.id) ? 'is-done' : lesson.id === next?.id ? 'is-next' : ''}"></i>`).join('')}
                    </span>
                    <strong>${chapterDone}/${chapter.lessons.length}</strong>
                  </div>
                </div>
                ${stageMetaHTML(chapter)}
                <div class="stage-card-lessons">
                  ${lessons.map((lesson) => {
                    const done = courseCompleted.has(lesson.id);
                    const isCurrent = next?.id === lesson.id;
                    const index = chapter.lessons.indexOf(lesson) + 1;
                    return `<a class="track-lesson${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}" href="#/learn/${lesson.id}">
                      <span class="track-lesson-index">${String(index).padStart(2, '0')}</span>
                      <span class="track-lesson-copy"><strong>${escapeHtml(lesson.title)}</strong><small>${escapeHtml(lesson.subtitle)}</small></span>
                      <span class="track-lesson-minutes">${lesson.minutes}′</span>
                      <span class="track-lesson-state">${done ? uiIcon('check') : isCurrent ? '继续' : uiIcon('arrow')}</span>
                    </a>`;
                  }).join('')}
                </div>
              </article>`;
          }).join('')}
          ${courseFilter === 'todo' && !visibleChapters.length ? '<p class="course-empty">二十二节都已完成。切回「全部」可以重看任意一课。</p>' : ''}
        </div>
        <div class="course-footer">
          <p>卡住时先回查知识库，再回到任务；完成标准写在课时页的自检清单里。</p>
          ${completed ? `<button class="toolbar-button" type="button" data-course-reset>${uiIcon('reset')} 重置进度</button>` : ''}
        </div>
      </section>`;
    document.querySelectorAll('[data-course-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        courseFilter = button.dataset.courseFilter;
        renderLearn();
      });
    });
    document.querySelector('[data-course-reset]')?.addEventListener('click', () => {
      if (!window.confirm('确定要清空本地学习进度吗？')) return;
      courseCompleted.clear();
      saveCourseProgress();
      render();
    });
  }

  function renderLesson(route) {
    const id = decodeURIComponent(route.path.split('/')[2] || '');
    const lesson = LESSON_BY_ID.get(id);
    if (!lesson) {
      renderNotFound('没有找到这一课。');
      return;
    }
    const chapter = CHAPTER_BY_ID.get(lesson.chapterId);
    const lessonIndex = COURSE_LESSONS.findIndex((item) => item.id === lesson.id);
    const previous = lessonIndex > 0 ? COURSE_LESSONS[lessonIndex - 1] : null;
    const next = lessonIndex >= 0 && lessonIndex < COURSE_LESSONS.length - 1 ? COURSE_LESSONS[lessonIndex + 1] : null;
    const complete = courseCompleted.has(lesson.id);
    const percent = courseProgressPercent();
    const prerequisites = (lesson.prerequisites || []).map((prereqId) => LESSON_BY_ID.get(prereqId)).filter(Boolean);
    const missingPrereqs = prerequisites.filter((item) => !courseCompleted.has(item.id));
    const checkpoints = lesson.checkpoints?.length ? lesson.checkpoints : lesson.goals || [];
    const checks = lessonCheckState(lesson.id, checkpoints.length);
    const checkedCount = checks.filter(Boolean).length;
    const studioEntry = lessonStudioEntry(lesson.id);

    // Each step of the lesson is a numbered block, so the reading order is explicit
    // instead of one undifferentiated column of paragraphs.
    const widgetHTML = renderLessonWidget(lesson);
    const lessonBlocks = [
      {
        label: '概念',
        hint: '只讲完成这一课所需的部分',
        body: `<div class="lesson-concept">${(lesson.concept || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</div>
          ${(lesson.keyTerms || []).length ? `<div class="lesson-keyterms"><span class="mono-label">TERMS</span><div class="chip-row">${lesson.keyTerms.map((term) => `<a class="chip" href="#/search?q=${encodeURIComponent(term)}">${escapeHtml(term)}</a>`).join('')}</div></div>` : ''}`,
      },
      widgetHTML ? { label: '先听', hint: '先建立听感，再动手', body: widgetHTML } : null,
      {
        label: '动手',
        hint: studioEntry ? '先在这里试，再回 DAW 做' : '在 DAW 里完成',
        body: `<div class="lesson-task"><h2>把一个概念变成一个可交付的声音。</h2><p>${escapeHtml(lesson.task)}</p></div>${lessonPracticeHTML(lesson, studioEntry)}`,
      },
      checkpoints.length ? {
        label: '自检',
        hint: '全部勾选后再标记完成',
        body: `<div class="lesson-checkpoints">
              <div class="check-head">
                <h2>完成前自查</h2>
                <span class="check-count" data-check-count>${checkedCount}/${checkpoints.length}</span>
              </div>
              <div class="check-list">
                ${checkpoints.map((item, index) => `<label class="check-item${checks[index] ? ' is-done' : ''}">
                  <input type="checkbox" data-check="${index}" ${checks[index] ? 'checked' : ''}>
                  <span class="check-box" aria-hidden="true">${checks[index] ? uiIcon('check') : ''}</span>
                  <span class="check-text">${escapeHtml(item)}</span>
                </label>`).join('')}
              </div>
            </div>`,
      } : null,
      {
        label: '回查',
        hint: '不懂的名词回到知识库',
        body: `<div class="lesson-kb">
              ${lessonKbLinksHTML(lesson)}
              <a class="section-link" href="#/search?q=${encodeURIComponent(lesson.title)}">在全库中继续查</a>
            </div>`,
      },
    ].filter(Boolean);
    main.innerHTML = `
      <article class="lesson-page">
        <nav class="breadcrumb"><a href="#/learn">制作课</a><span class="sep">/</span><span>${escapeHtml(chapter.title)}</span><span class="sep">/</span><span>${escapeHtml(lesson.title)}</span></nav>
        <header class="lesson-head">
          <div class="lesson-head-index">
            <span class="lesson-stage-code">STAGE ${escapeHtml(chapter.index)}</span>
            <span class="lesson-stage-name">${escapeHtml(chapter.title)}</span>
          </div>
          <h1>${escapeHtml(lesson.title)}</h1>
          <p class="lesson-sub">${escapeHtml(lesson.subtitle)}</p>
          <div class="lesson-meta">
            <span class="lesson-meta-item">${lesson.minutes}′</span>
            <span class="lesson-meta-item">${chapter.lessons.length} 节 · 第 ${chapter.lessons.findIndex((item) => item.id === lesson.id) + 1} 节</span>
            <span class="stage-meter-bars" aria-hidden="true">
              ${chapter.lessons.map((item) => `<i class="${courseCompleted.has(item.id) ? 'is-done' : item.id === lesson.id ? 'is-next' : ''}"></i>`).join('')}
            </span>
            ${complete ? '<span class="lesson-meta-item is-done">已完成</span>' : ''}
          </div>
        </header>
        <section class="lesson-brief">
          <div class="brief-cell">
            <span class="brief-label">学完能做到</span>
            <p>${escapeHtml(lesson.outcome || '完成本课任务，并保留一份可复用的工程或音频。')}</p>
          </div>
          <div class="brief-cell">
            <span class="brief-label">要留下</span>
            <p>${escapeHtml(lesson.deliverable || '一份工程文件或音频片段。')}</p>
          </div>
        </section>
        <div class="lesson-layout">
          <div class="lesson-main">
            ${lessonBlocks.map((block, index) => `<section class="lesson-block">
              <div class="block-head">
                <span class="block-num">${String(index + 1).padStart(2, '0')}</span>
                <span class="block-label">${escapeHtml(block.label)}</span>
                <span class="block-hint">${escapeHtml(block.hint)}</span>
              </div>
              ${block.body}
            </section>`).join('')}
          </div>
          <aside class="lesson-aside">
            <div class="lesson-progress">
              <div class="course-progress-label"><span class="mono-label">PATH</span><strong>${courseCompleted.size} / ${COURSE_LESSONS.length}</strong></div>
              <div class="course-progress-track"><span style="width:${percent}%"></span></div>
            </div>
            <div class="lesson-prereqs">
              <span class="mono-label">前置</span>
              ${prerequisites.length ? `<div class="chip-row">${prerequisites.map((item) => `<a class="chip${courseCompleted.has(item.id) ? ' is-done' : ''}" href="#/learn/${item.id}">${escapeHtml(item.title)}</a>`).join('')}</div>` : '<p class="aside-relation-note">无前置课时，可以直接开始。</p>'}
              ${missingPrereqs.length ? `<p class="aside-relation-note is-warn">建议先完成：${missingPrereqs.map((item) => escapeHtml(item.title)).join('、')}。</p>` : ''}
            </div>
            <div class="lesson-outline">
              <span class="mono-label">本阶段</span>
              ${chapter.lessons.map((item) => `<a class="lesson-outline-item${item.id === lesson.id ? ' is-current' : ''}${courseCompleted.has(item.id) ? ' is-done' : ''}" href="#/learn/${item.id}"><span>${courseCompleted.has(item.id) ? '✓' : item.minutes + '′'}</span>${escapeHtml(item.title)}</a>`).join('')}
            </div>
          </aside>
        </div>
      </article>
      <div class="lesson-actionbar" data-lesson-bar>
        ${previous ? `<a class="lesson-action-step is-prev" href="#/learn/${previous.id}"><span class="action-arrow">${uiIcon('arrowLeft')}</span><span class="action-copy"><small>PREV</small><strong>${escapeHtml(previous.title)}</strong></span></a>` : `<span class="lesson-action-step is-prev is-disabled"><span class="action-arrow">${uiIcon('arrowLeft')}</span><span class="action-copy"><small>START</small><strong>课程起点</strong></span></span>`}
        <div class="lesson-action-progress">
          <span class="mono-label">PATH</span>
          <strong>${courseCompleted.size}/${COURSE_LESSONS.length}</strong>
          <i aria-hidden="true"><span style="width:${percent}%"></span></i>
        </div>
        <button class="lesson-action-complete${complete ? ' is-complete' : ''}" type="button" data-lesson-complete>
          ${complete ? `${uiIcon('check')} 已完成` : `${uiIcon('plus')} 标记完成`}
          ${!complete && checkpoints.length ? `<small>自检 ${checkedCount}/${checkpoints.length}</small>` : ''}
        </button>
        ${next ? `<a class="lesson-action-step is-next" href="#/learn/${next.id}"><span class="action-copy"><small>NEXT</small><strong>${escapeHtml(next.title)}</strong></span><span class="action-arrow">${uiIcon('arrow')}</span></a>` : `<a class="lesson-action-step is-next" href="#/learn"><span class="action-copy"><small>MAP</small><strong>课程地图</strong></span><span class="action-arrow">${uiIcon('arrow')}</span></a>`}
      </div>`;
    document.body.classList.add('has-lesson-bar');
    bindLessonWidget(lesson);
    // The inline studio starts collapsed: the lesson page should stay light
    // until you actually want to try something.
    document.querySelectorAll('[data-lesson-studio-open]').forEach((button) => {
      button.addEventListener('click', () => toggleLessonStudio(lesson, button));
    });
    document.querySelectorAll('[data-check]').forEach((input) => {
      input.addEventListener('change', () => {
        const index = Number(input.dataset.check);
        const current = new Set(lessonChecks[lesson.id] || []);
        if (input.checked) current.add(index);
        else current.delete(index);
        lessonChecks[lesson.id] = [...current].sort((a, b) => a - b);
        saveLessonChecks();
        const label = input.closest('.check-item');
        label?.classList.toggle('is-done', input.checked);
        const box = label?.querySelector('.check-box');
        if (box) box.innerHTML = input.checked ? uiIcon('check') : '';
        const total = checkpoints.length;
        const done = lessonChecks[lesson.id].length;
        const counter = document.querySelector('[data-check-count]');
        if (counter) counter.textContent = `${done}/${total}`;
        const buttonHint = document.querySelector('[data-lesson-complete] small');
        if (buttonHint) buttonHint.textContent = `自检 ${done}/${total}`;
      });
    });
    document.querySelectorAll('[data-lesson-complete]').forEach((button) => {
      button.addEventListener('click', () => {
        const wasComplete = courseCompleted.has(lesson.id);
        if (wasComplete) courseCompleted.delete(lesson.id);
        else courseCompleted.add(lesson.id);
        saveCourseProgress();
        render();
        if (wasComplete) {
          showToast(`已取消完成：${lesson.title}`);
        } else {
          const done = Array.isArray(lessonChecks[lesson.id]) ? lessonChecks[lesson.id].length : 0;
          const partial = checkpoints.length && done < checkpoints.length;
          showToast(partial ? `已标记完成（自检 ${done}/${checkpoints.length}）：${lesson.title}` : `已完成：${lesson.title}`, {
            tone: 'success',
            action: next
              ? { href: `#/learn/${next.id}`, label: '下一课' }
              : { href: '#/learn', label: '回课程地图' },
          });
        }
      });
    });
  }

  // The written task stays as-is; this adds a place to actually do it. The
  // studio mounts right here rather than sending you to another page — going
  // back and forth to read one line and try one thing was the whole problem.
  function lessonPracticeHTML(lesson, studioEntry) {
    if (!studioEntry) return '';
    const mod = STUDIO_MODULE_META[studioEntry.module];
    if (!mod) return '';
    const fullHref = `#/studio?m=${studioEntry.module}&from=${encodeURIComponent(lesson.id)}`;
    return `
      <div class="lesson-practice">
        <div class="practice-head">
          <span class="mono-label">PRACTICE / 动手</span>
          <span class="practice-module">${escapeHtml(mod.num)} · ${escapeHtml(mod.label)}</span>
        </div>
        <p class="practice-hint">${escapeHtml(studioEntry.hint)}</p>
        <div class="practice-actions">
          <button class="practice-cta" type="button" data-lesson-studio-open aria-expanded="false" aria-controls="lessonStudioHost">
            <span data-lesson-studio-open-label>在这里动手</span>${uiIcon('play')}
          </button>
          <a class="practice-full" href="${fullHref}">去完整工作室${uiIcon('arrow')}</a>
          <span class="practice-note">${escapeHtml(mod.lead)}</span>
        </div>
        <div class="practice-stage" id="lessonStudioHost" data-lesson-studio hidden></div>
      </div>`;
  }

  // Mounts the studio into the lesson page. studio.js loads after app.js, so a
  // first visit retries briefly instead of failing.
  let lessonStudioAttempts = 0;

  function mountLessonStudio(lesson) {
    const entry = lessonStudioEntry(lesson.id);
    const stage = document.querySelector('[data-lesson-studio]');
    if (!entry || !stage) return;
    if (stage.dataset.mounted === '1') return;
    const kit = { pageHead, uiIcon, escapeHtml };
    const mount = () => {
      if (!window.EMStudio) return false;
      window.EMStudio.mount(stage, kit, { module: entry.module, embedded: true, from: lesson.id });
      stage.dataset.mounted = '1';
      return true;
    };
    if (mount()) return;
    if (lessonStudioAttempts > 25) return;
    lessonStudioAttempts += 1;
    setTimeout(() => {
      if (parseRoute().path !== `/learn/${lesson.id}`) return;
      mountLessonStudio(lesson);
    }, 40);
  }

  function toggleLessonStudio(lesson, button) {
    const stage = document.querySelector('[data-lesson-studio]');
    if (!stage) return;
    const open = !stage.hidden;
    const label = button.querySelector('[data-lesson-studio-open-label]');
    if (open) {
      // Leaving the module tears the session down so the lesson's own players
      // are not fighting the studio loop for the audio context.
      if (window.EMStudio) window.EMStudio.unmount();
      stage.dataset.mounted = '0';
      stage.innerHTML = '';
      stage.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (label) label.textContent = '在这里动手';
      return;
    }
    // One session at a time: if the lesson's own player is running, stop it so
    // the studio loop is what you hear when it starts.
    const state = Audio?.getState?.();
    if (state?.playing && state.demoId !== 'studio') Audio.stop();
    stage.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (label) label.textContent = '收起';
    mountLessonStudio(lesson);
    setTimeout(() => {
      stage.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }

  function lessonChipsHTML(lessons) {
    return lessons.map((lesson) => `<a class="chip" href="#/learn/${lesson.id}">${lesson.chapterIndex} · ${escapeHtml(lesson.title)}</a>`).join('');
  }

  function renderStart() {
    const planDone = START_TASK_DONE();
    const planTotal = START_TASK_TOTAL;
    const planPct = planTotal ? Math.round((planDone / planTotal) * 100) : 0;
    const tasks = (START.plan || []).flatMap((day) => day.tasks || []);
    const nextTask = tasks.find((task) => !startPlanDone[task.id]) || null;
    const courseDone = courseCompleted.size;
    const courseTotal = COURSE_LESSONS.length;
    const djDone = djCompletedCount();
    const djTotal = DJ_COURSE?.episodeCount || 0;
    const fieldDone = FIELD_GUIDE_DONE();
    const fieldTotal = FIELD_GUIDE_TOTAL;
    const djNext = firstIncompleteDjEpisode();
    const faqs = (CUR.djFaq || []).slice(0, 4);

    main.innerHTML = `
      ${pageHead({
        code: '00',
        label: 'START',
        title: '第一次来，<br><em>先选一条路</em>。',
        lead: '不用先买设备，也不用先懂乐理。先选你想做的事，再按 7 天计划每天 20–30 分钟走一遍；每一步都能回到具体页面。',
        stats: [
          { label: '路径', value: '3' },
          { label: '7 天任务', value: `${planDone}<span>/${planTotal}</span>` },
          { label: 'DJ 课', value: `${djDone}<span>/${djTotal}</span>` },
        ],
        action: { href: nextTask?.href || '#/start', label: nextTask ? '继续今天的任务' : '查看完整计划' },
      })}
      <section class="start-body">
        <div class="start-paths">
          ${(START.paths || []).map((path) => `
            <article class="start-path">
              <div class="start-path-top"><span class="mono-label">${escapeHtml(path.code)} / PATH</span><span class="start-path-arrow">${uiIcon('arrow')}</span></div>
              <h2>${escapeHtml(path.title)}</h2>
              <p>${escapeHtml(path.lead)}</p>
              <ol class="start-steps">${(path.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
              <p class="start-outcome"><span>学完能做到</span>${escapeHtml(path.outcome)}</p>
              <a class="button-primary" href="${escapeHtml(path.href)}">${escapeHtml(path.cta)}</a>
              ${path.id === 'dj' ? `<a class="start-path-extra" href="#/dj/automix">进阶：自动接歌台（本地引擎）→</a>` : ''}
            </article>`).join('')}
        </div>

        <section class="start-dash" aria-label="我的进度">
          <div class="start-section-head">
            <div><span class="section-kicker">YOUR POSITION</span><h2>你现在走到哪了</h2></div>
            <span class="mono-label">保存在本机</span>
          </div>
          <div class="start-stats">
            <a class="start-stat" href="#/learn">
              <span class="mono-label">制作课</span>
              <strong>${courseDone}<small>/${courseTotal}</small></strong>
              <span class="start-bar"><i style="--pct:${courseTotal ? Math.round((courseDone / courseTotal) * 100) : 0}%"></i></span>
              <em>${courseDone ? '继续下一课' : '从第一课开始'} →</em>
            </a>
            <a class="start-stat" href="${djNext ? `#/dj/course?ep=${djNext.page}` : '#/dj/course'}">
              <span class="mono-label">DJ 课</span>
              <strong>${djDone}<small>/${djTotal}</small></strong>
              <span class="start-bar"><i style="--pct:${djProgressPercent()}%"></i></span>
              <em>${djNext ? `继续第 ${djNext.id} 集` : '全部完成'} →</em>
            </a>
            <a class="start-stat" href="#/start">
              <span class="mono-label">7 天计划</span>
              <strong>${planDone}<small>/${planTotal}</small></strong>
              <span class="start-bar"><i style="--pct:${planPct}%"></i></span>
              <em>${planDone ? '继续计划' : '从今天开始'} →</em>
            </a>
            <a class="start-stat" href="#/dj/field-guide">
              <span class="mono-label">现场清单</span>
              <strong>${fieldDone}<small>/${fieldTotal}</small></strong>
              <span class="start-bar"><i style="--pct:${fieldTotal ? Math.round((fieldDone / fieldTotal) * 100) : 0}%"></i></span>
              <em>出门前过一遍 →</em>
            </a>
          </div>
        </section>

        <section class="start-plan" aria-label="7 天计划">
          <div class="start-section-head">
            <div><span class="section-kicker">7-DAY STARTER</span><h2>7 天，每天 20–30 分钟</h2></div>
            <button class="button-ghost" type="button" data-start-reset>重置计划</button>
          </div>
          <div class="start-plan-progress"><span>${planDone} / ${planTotal} 个任务</span><i><b style="--pct:${planPct}%"></b></i><em>${planPct}%</em></div>
          <div class="start-days">
            ${(START.plan || []).map((day) => {
              const dayTasks = day.tasks || [];
              const dayDone = dayTasks.filter((task) => startPlanDone[task.id]).length;
              return `<article class="start-day${dayDone === dayTasks.length ? ' is-done' : ''}">
                <header><span class="start-day-num">${String(day.day).padStart(2, '0')}</span><div><h3>${escapeHtml(day.title)}</h3><p>${escapeHtml(day.lead)}</p></div><span class="mono-label">${dayDone}/${dayTasks.length}</span></header>
                <div class="start-tasks">
                  ${dayTasks.map((task) => `<div class="start-task${startPlanDone[task.id] ? ' is-done' : ''}">
                    <input id="start-${escapeHtml(task.id)}" type="checkbox" data-start-task="${escapeHtml(task.id)}"${startPlanDone[task.id] ? ' checked' : ''}>
                    <label for="start-${escapeHtml(task.id)}">${escapeHtml(task.label)}</label>
                    ${task.href ? `<a href="${escapeHtml(task.href)}">打开 →</a>` : ''}
                  </div>`).join('')}
                </div>
              </article>`;
            }).join('')}
          </div>
        </section>

        <section class="start-faq" aria-label="新手常见问题">
          <div class="start-section-head">
            <div><span class="section-kicker">FIRST QUESTIONS</span><h2>新手最常问的几件事</h2></div>
            <a class="section-link" href="#/doc/guide:dj-faq">完整 FAQ →</a>
          </div>
          ${faqs.map((item) => `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`).join('')}
        </section>
      </section>`;

    main.querySelectorAll('[data-start-task]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.startTask;
        if (input.checked) startPlanDone[id] = true;
        else delete startPlanDone[id];
        saveStartPlan();
        renderHeader('/start');
        const y = window.scrollY;
        renderStart();
        window.scrollTo({ top: y, behavior: 'auto' });
      });
    });
    main.querySelector('[data-start-reset]')?.addEventListener('click', () => {
      if (!window.confirm('重置 7 天计划的勾选记录？')) return;
      startPlanDone = {};
      saveStartPlan();
      renderHeader('/start');
      renderStart();
    });
  }

  function renderDjFieldGuide() {
    const sections = START.fieldGuide?.sections || [];
    const done = FIELD_GUIDE_DONE();
    const total = FIELD_GUIDE_TOTAL;
    const pct = total ? Math.round((done / total) * 100) : 0;
    main.innerHTML = `
      ${pageHead({
        code: 'DJ',
        label: 'FIELD GUIDE',
        title: '出门前，<br><em>先过一遍清单</em>。',
        lead: '曲库、U 盘、接线、试音、第一场 Set。清单保存在本机，可以打印带走；它不是标准答案，但能帮你少犯低级错误。',
        stats: [
          { label: '完成', value: `${done}<span>/${total}</span>` },
          { label: '章节', value: String(sections.length) },
          { label: '保存', value: '本机' },
        ],
        action: { href: '#/dj/course?ep=30', label: '回到第一次混音' },
      })}
      <section class="djfg-body">
        <div class="djfg-toolbar">
          <div class="djfg-progress"><span>${done} / ${total} 项</span><i><b style="--pct:${pct}%"></b></i><em>${pct}%</em></div>
          <div class="djfg-actions">
            <button class="button-primary" type="button" data-field-print>打印清单</button>
            <button class="button-ghost" type="button" data-field-reset>重置</button>
            <a class="button-ghost" href="#/start">回到新手起步</a>
          </div>
        </div>
        <div class="djfg-sections">
          ${sections.map((section) => {
            const items = section.items || [];
            const sectionDone = items.filter((item) => fieldGuideDone[item.id]).length;
            return `<section class="djfg-section">
              <header class="djfg-head">
                <div><span class="mono-label">${escapeHtml(section.id)} / CHECKLIST</span><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.hint)}</p></div>
                <span class="djfg-count">${sectionDone}/${items.length}</span>
              </header>
              <div class="djfg-items">
                ${items.map((item) => `<div class="djfg-item${fieldGuideDone[item.id] ? ' is-done' : ''}">
                  <input id="field-${escapeHtml(item.id)}" type="checkbox" data-field-item="${escapeHtml(item.id)}"${fieldGuideDone[item.id] ? ' checked' : ''}>
                  <label for="field-${escapeHtml(item.id)}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.hint)}</small></label>
                </div>`).join('')}
              </div>
            </section>`;
          }).join('')}
        </div>
        <div class="djfg-next">
          <span class="mono-label">NEXT / 下一步</span>
          <a class="button-primary" href="#/practice?mode=phrase">练 8 小节乐句</a>
          <a class="button-ghost" href="#/dj/course?ep=24">回到对拍课</a>
          <a class="button-ghost" href="#/start">回新手起步</a>
        </div>
        <p class="djfg-note">清单只保存在本机浏览器；换设备不会同步。演出前至少提前 30 分钟到场，先试读、再试音、最后试监听。</p>
      </section>`;

    main.querySelectorAll('[data-field-item]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.fieldItem;
        if (input.checked) fieldGuideDone[id] = true;
        else delete fieldGuideDone[id];
        saveFieldGuide();
        renderHeader('/dj/field-guide');
        const y = window.scrollY;
        renderDjFieldGuide();
        window.scrollTo({ top: y, behavior: 'auto' });
      });
    });
    main.querySelector('[data-field-print]')?.addEventListener('click', () => window.print());
    main.querySelector('[data-field-reset]')?.addEventListener('click', () => {
      if (!window.confirm('重置现场清单的勾选记录？')) return;
      fieldGuideDone = {};
      saveFieldGuide();
      renderHeader('/dj/field-guide');
      renderDjFieldGuide();
    });
  }

  function renderLibrary() {
    const stats = WEB.manifest?.stats || KB.meta.stats || {};
    const activeFamilies = KB.families.filter((family) => !family.archive && !family.supplement);
    const families = activeFamilies.slice(0, 8);
    const tools = [
      { title: '沿分支找风格', text: '不知道叫什么？从大族往下逐级展开，点开就听，路径一路看得见。', href: '#/tree', meta: 'TREE', icon: 'atlas' },
      { title: '风格图谱', text: '按大族、BPM、别名与上下位关系查。', href: '#/atlas', meta: 'ATLAS', icon: 'atlas' },
      { title: '分支树', text: '顺着分叉走。看得见每一条从哪来、又分到哪去，每个节点都能试听。', href: '#/tree', meta: 'TREE', icon: 'atlas' },
      { title: '术语手册', text: '曲式、鼓组、音色、设备、乐理与效果。', href: '#/guide/glossary', meta: 'GLOSSARY', icon: 'library' },
      { title: '结构与音色', text: '八段结构、七组音色与频谱分工。', href: '#/guide/production', meta: 'GUIDE', icon: 'lab' },
      { title: 'DJ 修炼手册', text: '41 集视频课：装备、Rekordbox、CUE、对拍、混音与接歌。', href: '#/dj/course', meta: 'DJ COURSE', icon: 'practice' },
      { title: '历史脉络', text: '从 Disco 到 Post-Internet：技术、场景、地理。', href: '#/guide/history', meta: 'HISTORY', icon: 'source' },
      { title: '现场笔记', text: '能量交换、音乐节、社群与散场之后。', href: '#/guide/live', meta: 'LIVE', icon: 'practice' },
    ];
    main.innerHTML = `
      ${pageHead({
        code: '02',
        label: 'LIBRARY',
        title: '知识库',
        lead: '查概念、找来源、沿关系追踪，再回到对应的制作课。课程给顺序，知识库给依据。',
        stats: [
          { label: '条目', value: formatNumber(stats.entries || KB.meta.stats.entries) },
          { label: '文档', value: formatNumber(stats.docs || stats.curatedDocs || 158) },
          { label: '分块', value: formatNumber(stats.chunks || 1541) },
        ],
        action: { href: '#/search', label: '全库检索' },
      })}
      <section class="library-body">
        <form class="search-bar" id="librarySearchForm" role="search">
          <span class="search-bar-icon">${uiIcon('search')}</span>
          <label class="sr-only" for="librarySearchInput">检索知识库</label>
          <input id="librarySearchInput" type="search" placeholder="输入风格、术语、艺人、结构或问题…" autocomplete="off">
          <button type="submit">检索</button>
        </form>
        <div class="tool-index">
          ${tools.map((tool, index) => `<a class="tool-index-row" href="${tool.href}">
            <span class="tool-index-num">${String(index + 1).padStart(2, '0')}</span>
            <span class="tool-index-icon">${uiIcon(tool.icon)}</span>
            <span class="tool-index-copy"><strong>${escapeHtml(tool.title)}</strong><small>${escapeHtml(tool.text)}</small></span>
            <span class="tool-index-meta">${tool.meta}</span>
            ${uiIcon('arrow')}
          </a>`).join('')}
        </div>
        <div class="library-section">
          ${sectionHead('大族', '从一个大族进入', { href: '#/atlas', label: `查看全部 ${activeFamilies.length} 个大族` }, '01')}
          <div class="family-grid">${families.map(familyCard).join('')}</div>
        </div>
        <p class="cross-note">
          <span class="cross-note-label">双向</span>
          课时页的每个名词都能跳到条目或文档；条目与文档页也会显示「在课程中学习」。
          <a href="#/search?q=sidechain">试一个：Sidechain</a>
        </p>
      </section>`;
    document.getElementById('librarySearchForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get('q')?.toString().trim() || '';
      navigate(value ? `#/search?q=${encodeURIComponent(value)}` : '#/search');
    });
  }

  function searchResultHTML(item, query) {
    const family = item.family || '';
    const bpm = item.bpm?.label ? `${item.bpm.label} BPM` : '';
    const source = item.source?.title || '';
    return `
      <a class="search-result type-${escapeHtml(item.type)}" href="${kbDocHref(item)}">
        <div class="search-result-top">
          <span class="type-badge type-${escapeHtml(item.type)}">${escapeHtml(kbTypeLabel(item.type))}</span>
          ${family ? `<span class="result-family">${escapeHtml(family)}</span>` : ''}
          ${bpm ? `<span class="result-bpm">${escapeHtml(bpm)}</span>` : ''}
        </div>
        <h3>${highlight(item.title, query)}</h3>
        <p>${highlightLimited(item.snippet, query, 2)}</p>
        <div class="search-result-foot">
          <span>${escapeHtml(source)}</span>
          <span class="result-open">打开 ${uiIcon('arrow')}</span>
        </div>
      </a>`;
  }

  function renderSearch(route) {
    const query = (route.params.get('q') || '').trim();
    const type = route.params.get('type') || 'all';
    const group = SEARCH_TYPE_GROUPS.find((item) => item.id === type) || SEARCH_TYPE_GROUPS[0];
    const stats = WEB.manifest?.stats || KB.meta.stats || {};
    const result = query ? kbSearchAll(query, { type: group.id, limit: 80 }) : null;
    const effectiveQuery = result?.meta?.normalizedQuery || query;
    const lessonMatches = query ? searchLessons(query) : [];
    const filterHref = (groupItem) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (groupItem.id !== 'all') params.set('type', groupItem.id);
      return `#/search${params.toString() ? `?${params.toString()}` : ''}`;
    };
    main.innerHTML = `
      ${pageHead({
        code: '03',
        label: 'SEARCH',
        title: '全库检索',
        lead: '覆盖条目、大族、指南、术语、乐器组、历史与现场笔记；结果里同时给出相关课程。',
        stats: [
          { label: '条目', value: formatNumber(stats.entries || KB.meta.stats.entries) },
          { label: '文档', value: formatNumber(stats.docs || stats.curatedDocs || 0) },
          { label: '分块', value: formatNumber(stats.chunks || 0) },
        ],
      })}
      <section class="search-console">
        <form class="search-bar is-large" id="kbSearchPageForm" role="search">
          <span class="search-bar-icon">${uiIcon('search')}</span>
          <label class="sr-only" for="kbSearchPageInput">检索整个知识库</label>
          <input id="kbSearchPageInput" name="q" type="search" value="${escapeHtml(query)}" placeholder="输入风格、术语、艺人、结构或问题…" autocomplete="off">
          <button type="submit">检索</button>
        </form>
        <div class="search-filter-row">
          ${SEARCH_TYPE_GROUPS.map((item) => `<a class="search-filter${item.id === group.id ? ' is-active' : ''}" href="${filterHref(item)}">${escapeHtml(item.label)}</a>`).join('')}
        </div>
      </section>
      <section class="search-body">
        ${query ? `
          <div class="results-head">
            <div>
              <div class="results-title">检索结果</div>
              <div class="results-meta">“${escapeHtml(query)}” · ${escapeHtml(group.label)} · ${result.count} 条${result.count > result.results.length ? `（展示前 ${result.results.length} 条）` : ''}${result.meta?.normalizedQuery ? ` · 已按“${escapeHtml(result.meta.normalizedQuery)}”检索` : ''}</div>
            </div>
            <div class="results-head-actions">
              <button class="copy-button ai-copy-button" type="button" data-copy-ai-search="${escapeHtml(query)}">复制给 AI</button>
              <a class="section-link" href="#/module">在 Agent 中调用</a>
            </div>
          </div>
          ${lessonMatches.length ? `<div class="course-match-panel"><span class="course-match-label">相关课程</span><div class="chip-row">${lessonChipsHTML(lessonMatches)}</div></div>` : ''}
          ${result.results.length ? `<div class="search-result-list">${result.results.map((item) => searchResultHTML(item, effectiveQuery)).join('')}</div>` : `
            <div class="result-empty">
              <h3>没有匹配的知识内容</h3>
              <p>试试更短的关键词，或切换检索范围。也可以搜索“808 bass”“七组音色”“ADSR”“结构”等。</p>
              <a class="button-ghost" href="#/search">重新开始</a>
            </div>`}
        ` : `
          <div class="search-suggestions">
            <div class="section-kicker">START SOMEWHERE</div>
            <h2>试试这些问题</h2>
            <div class="search-suggestion-grid">
              ${BEGINNER_QUERIES.map((item) => `<a href="#/search?q=${encodeURIComponent(item)}">${escapeHtml(item)} ${uiIcon('arrow')}</a>`).join('')}
            </div>
          </div>`}
      </section>`;

    const form = document.getElementById('kbSearchPageForm');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = new FormData(form).get('q')?.toString().trim() || '';
        navigate(value ? `#/search?q=${encodeURIComponent(value)}&type=${group.id}` : '#/search');
      });
    }
  }

  function renderDoc(route) {
    const encoded = route.path.split('/')[2] || '';
    let id = encoded;
    try {
      id = decodeURIComponent(encoded);
    } catch {
      // Keep the raw ID if it is not valid percent-encoding.
    }
    const doc = kbGetDoc(id);
    if (!doc) {
      renderNotFound('没有找到这个知识文档。');
      return;
    }
    const meta = doc.metadata || {};
    const family = doc.familyId ? familyById.get(doc.familyId) : null;
    const relatedEntry = meta.entryId ? entryById.get(meta.entryId) : null;
    const relatedLessons = lessonsForKb(doc.id);
    const source = doc.source || {};
    const sourceUrl = source.url || meta.url || null;
    const djEpisode = djEpisodeFromSourceId(doc.id);
    const djGuideEpisodes = meta.courseId === 'dj-course' && Array.isArray(meta.episodeIds) && djCourseReady()
      ? meta.episodeIds.map((page) => DJ_COURSE.episodes.find((episode) => episode.page === Number(page))).filter(Boolean)
      : [];
    main.innerHTML = `
      <article class="doc-page">
        <nav class="breadcrumb" aria-label="面包屑">
          <a href="#/">首页</a><span class="sep">/</span>
          <a href="#/search">全库检索</a><span class="sep">/</span>
          <span>${escapeHtml(doc.title)}</span>
        </nav>
        <header class="doc-header">
          <div class="detail-kicker">
            <span class="type-badge type-${escapeHtml(doc.type)}">${escapeHtml(kbTypeLabel(doc.type))}</span>
            ${family ? `<a class="chip is-family ${familyClass(family.color)}" href="#/family/${family.id}">${escapeHtml(family.name)}${family.zh ? ` · ${escapeHtml(family.zh)}` : ''}</a>` : ''}
            ${doc.bpm?.label ? `<span class="chip">${escapeHtml(doc.bpm.label)} BPM</span>` : ''}
            ${djEpisode ? `<a class="chip" href="#/dj/course?ep=${djEpisode.page}">在课程中查看 · ${escapeHtml(djEpisode.id)}</a>` : ''}
          </div>
          <h1 class="doc-title">${escapeHtml(doc.title)}</h1>
          <div class="doc-meta-row">
            <span class="mono-label">DOC / ${escapeHtml(doc.id)}</span>
            ${source.title ? `<span class="mono-label">SOURCE / ${escapeHtml(source.title)}</span>` : ''}
            ${meta.role ? `<span class="mono-label">ROLE / ${escapeHtml(meta.role)}</span>` : ''}
            ${meta.group ? `<span class="mono-label">GROUP / ${escapeHtml(meta.group)}</span>` : ''}
          </div>
        </header>
        ${relatedLessons.length ? `<div class="kb-course-panel"><span class="mono-label">COURSE / 在课程中学习</span><div class="chip-row">${lessonChipsHTML(relatedLessons)}</div></div>` : ''}
        ${djGuideEpisodes.length ? `<div class="kb-course-panel dj-guide-panel">
          <span class="mono-label">COURSE / 本章剧集 · ${djGuideEpisodes.length} 集</span>
          <div class="chip-row">${djGuideEpisodes.map((episode) => `<a class="chip" href="#/dj/course?ep=${episode.page}">${escapeHtml(episode.id)} · ${escapeHtml(episode.displayTitle || episode.title)}</a>`).join('')}</div>
          <a class="section-link" href="#/dj/course">打开课程页 →</a>
        </div>` : ''}
        <div class="doc-layout">
          <div class="doc-body">${kbMarkdownLite(doc.text)}</div>
          <aside class="doc-aside">
            <div class="aside-block">
              <h3>导航</h3>
              <div class="chip-row">
                ${family ? `<a class="chip" href="#/family/${family.id}">大族页</a>` : ''}
                ${relatedEntry ? `<a class="chip" href="#/genre/${relatedEntry.id}">分类条目</a>` : ''}
                <a class="chip" href="#/search">全库检索</a>
                <a class="chip" href="#/module">Agent 模块</a>
              </div>
            </div>
            <div class="aside-block">
              <h3>来源</h3>
              <p class="source-line">${escapeHtml(source.title || '本地知识库')}${sourceUrl ? `<br><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">打开原始链接 ↗</a>` : ''}</p>
            </div>
            <div class="aside-block">
              <h3>给 Agent 的 ID</h3>
              <p class="source-line"><code id="docIdText">${escapeHtml(doc.id)}</code><br>可在 kb_get 中直接读取。</p>
              <button class="copy-button is-inline" type="button" data-copy-target="#docIdText" data-tooltip="复制 Agent ID">复制 ID</button>
              <button class="copy-button is-inline" type="button" data-copy-ai-doc="${escapeHtml(doc.id)}" data-tooltip="复制为 AI 上下文">复制给 AI</button>
            </div>
          </aside>
        </div>
      </article>`;
  }

  function renderModule() {
    const manifest = WEB.manifest || {};
    const stats = manifest.stats || {};
    const tools = manifest.tools || ['kb_search', 'kb_context', 'kb_get', 'kb_families', 'kb_manifest'];
    const sources = manifest.sources || [];
    const mcpConfig = `{
  "mcpServers": {
    "electronic-music-kb": {
      "command": "node",
      "args": [
        "<ABS_PATH>/kb-module/bin/mcp-server.mjs",
        "--dist",
        "<ABS_PATH>/kb-module/dist"
      ]
    }
  }
}`;
    main.innerHTML = `
      <section class="module-hero">
        <div class="hero-kicker">MODULE / 知识库模块</div>
        <h1>网页只是前端，<br><em>知识库可以单独被调用。</em></h1>
        <p class="hero-lead">同一份知识库产物同时支撑网页检索、CLI、MCP 与 HTTP。Agent 不需要网页，只需要 <code>kb-module/dist/</code>。</p>
        <div class="module-actions">
          <a class="button-primary" href="#/search">用网页检索 →</a>
          <label class="api-port"><span class="sr-only">HTTP API 端口</span><input id="apiPort" type="number" min="1" max="65535" value="8787" aria-label="HTTP API 端口" data-tooltip="模块 HTTP API 端口，默认 8787"></label>
          <button class="button-ghost" id="checkApi" type="button">检测本地 HTTP API</button>
          <span class="api-status" id="apiStatus">未检测</span>
        </div>
      </section>
      <section class="module-body">
        <div class="data-stats module-stats">
          <div class="data-stat"><strong>${formatNumber(stats.entries || 0)}</strong><span>分类条目</span></div>
          <div class="data-stat"><strong>${formatNumber(stats.families || 0)}</strong><span>活跃大族</span></div>
          <div class="data-stat"><strong>${formatNumber(stats.docs || stats.curatedDocs || 0)}</strong><span>知识文档</span></div>
          <div class="data-stat"><strong>${formatNumber(stats.chunks || 0)}</strong><span>检索分块</span></div>
        </div>
        <div class="module-grid">
          <article class="module-card">
            <div class="mono-label">BUILD / 构建</div>
            <h2>独立生成</h2>
            <p>模块读取自己的 inputs，生成 JSON/JSONL 与 manifest；不依赖网页、数据库或外部服务。</p>
            <pre class="module-code"><code>node kb-module/bin/kb.mjs build
node kb-module/bin/kb.mjs verify</code></pre>
            <p class="module-meta">构建时间：${escapeHtml(manifest.builtAt || '未知')}</p>
          </article>
          <article class="module-card">
            <div class="mono-label">MCP / AGENT</div>
            <h2>直接接入 Agent</h2>
            <p>通过 MCP stdio 暴露五个工具。把下面的配置合并到客户端配置即可。</p>
            <div class="module-code-wrap">
              <button class="copy-button" type="button" data-copy-target="#mcpConfigText" data-tooltip="复制 MCP 配置">复制配置</button>
              <pre class="module-code"><code id="mcpConfigText">${escapeHtml(mcpConfig)}</code></pre>
            </div>
            <div class="chip-row">${tools.map((tool) => `<span class="chip">${escapeHtml(tool)}</span>`).join('')}</div>
          </article>
          <article class="module-card">
            <div class="mono-label">HTTP / LOCAL</div>
            <h2>本地 API</h2>
            <p>也可以把它当作本地 HTTP 检索服务，适合 LangChain、函数调用或跨进程使用。</p>
            <pre class="module-code"><code>node kb-module/bin/kb.mjs serve --port 8787
curl "http://127.0.0.1:8787/search?q=uplifting%20trance"</code></pre>
            <p class="module-meta">默认只监听 127.0.0.1；HTTP 无鉴权，不要直接暴露公网。</p>
          </article>
          <article class="module-card">
            <div class="mono-label">DOCS / CONTRACT</div>
            <h2>接口与存储</h2>
            <p>输入 config、taxonomy、curated、transcripts；输出 manifest、kb.json、chunks.jsonl、docs.json、index.meta.json 与 web.js。</p>
            <div class="chip-row">
              <span class="chip">JSON + JSONL</span>
              <span class="chip">BM25</span>
              <span class="chip">source hashes</span>
              <span class="chip">schema/</span>
            </div>
            <p class="module-meta">完整契约见 <code>kb-module/README.md</code>；Agent 配置见 <code>kb-module/agent/</code>。</p>
          </article>
        </div>
        <div class="guide-section">
          <div class="guide-section-head"><h2>来源与构建快照</h2><span class="mono-label">SOURCES / ${sources.length}</span></div>
          <div class="source-grid">
            ${sources.map((source) => `
              <article class="source-card">
                <span class="source-type">${escapeHtml(source.type || 'source')}</span>
                <h3>${escapeHtml(source.title || source.id)}</h3>
                <p>${escapeHtml(source.note || '')}</p>
                <div class="source-author">${escapeHtml(source.author || '')}${source.url ? ` · <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">原始链接 ↗</a>` : ''}</div>
              </article>`).join('')}
          </div>
        </div>
      </section>`;

    const button = document.getElementById('checkApi');
    const status = document.getElementById('apiStatus');
    const portInput = document.getElementById('apiPort');
    if (button && status) {
      button.addEventListener('click', async () => {
        const port = Math.max(1, Math.min(65535, Number(portInput?.value) || 8787));
        status.textContent = '检测中…';
        status.className = 'api-status is-checking';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1600);
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
          const data = await response.json();
          status.textContent = `在线 · ${data.module?.name || '知识库'} · ${formatNumber(data.stats?.chunks || 0)} 分块`;
          status.className = 'api-status is-ok';
        } catch {
          status.textContent = `未检测到 API。运行 node kb-module/bin/kb.mjs serve --port ${port} 后重试。`;
          status.className = 'api-status is-error';
        } finally {
          clearTimeout(timer);
        }
      });
    }
  }

  function renderAbout() {
    const stats = KB.meta.stats;
    main.innerHTML = `
      ${guideHero(
        'ABOUT / 来源与勘误',
        '一张有出处、<br><em>也有错误的地图。</em>',
        '这份知识库是二次整理，不是原文档的替代品。所有条目解释和例曲以原文档为准；精编页的校正、取舍和编辑补充都在这里说明。',
        `资料截至 ${CUR.updated}。如果你要引用，请优先引用原文档与视频，并注明本库只是整理。`
      )}
      <div class="about-body">
        <div class="guide-section">
          <div class="guide-section-head"><h2>网页与 Agent 共用同一份知识库</h2><span class="mono-label">ONE SOURCE / TWO SURFACES</span></div>
          <div class="prose">
            <p>网页的检索结果来自知识库模块生成的 <code>web.js</code>；同一份模块还可以通过 CLI、MCP 与 HTTP 被 Agent 调用。</p>
            <p>前端交互使用本地引入的 Floating UI（MIT）处理工具提示与页头搜索浮层，包含自动翻转、边界避让与滚动跟随。</p>
            <p>所有可试听片段都由浏览器 Web Audio API 实时合成，不是原曲录音；它们用于展示节奏、音色与结构差异，不能替代原曲欣赏。</p>
            <p><a class="section-link" href="#/search">打开全库检索</a> <a class="section-link" href="#/practice">做听辨练习</a> <a class="section-link" href="#/module">查看知识库模块</a></p>
          </div>
        </div>

        <div class="guide-section-head"><h2>资料来源</h2><span class="mono-label">SOURCES</span></div>
        <div class="source-grid">
          ${CUR.sources.map((source) => `
            <article class="source-card">
              <span class="source-type">${escapeHtml(source.type)}</span>
              <h3>${escapeHtml(source.title)}</h3>
              <p>${escapeHtml(source.note)}</p>
              <div class="source-author">${escapeHtml(source.author)}${source.url ? ` · <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">原始链接 ↗</a>` : ''}</div>
            </article>`).join('')}
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>数据规模</h2><span class="mono-label">STATS</span></div>
          <div class="data-stats">
            <div class="data-stat"><strong>${formatNumber(stats.entries)}</strong><span>条目总数</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.families)}</strong><span>活跃大族</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.examples)}</strong><span>例曲索引</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.relationLinks)}</strong><span>关系链接</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.bpmEntries)}</strong><span>有明确 BPM</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.stubs)}</strong><span>待补 / 交叉引用</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.archiveEntries)}</strong><span>待归档</span></div>
            <div class="data-stat"><strong>${formatNumber(stats.archivedFamilies)}</strong><span>待归档大族</span></div>
          </div>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>转写校正</h2><span class="mono-label">CORRECTIONS / 自动转写有误差</span></div>
          <p class="guide-note">两期节目使用自动转写，术语和人名存在明显误差。精编页按分类库与上下文校正；图谱条目不受影响，仍以原文为准。</p>
          <table class="correction-table">
            <thead><tr><th>转写</th><th>校正为</th><th>说明</th></tr></thead>
            <tbody>${CUR.corrections.map((item) => `<tr><td>${escapeHtml(item.from)}</td><td>${escapeHtml(item.to)}</td><td>${escapeHtml(item.note)}</td></tr>`).join('')}</tbody>
          </table>
        </div>

        <div class="guide-section">
          <div class="guide-section-head"><h2>使用与版权</h2><span class="mono-label">USAGE</span></div>
          <ul class="usage-list">${CUR.usage.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          <div class="prose">
            <p><strong>例曲不提供音频。</strong>页面只保留原文中的“歌名 - 制作人”索引和少量原始链接；版权归原作者。请不要把本库当作音乐下载站。</p>
            <p><strong>原文档仍有错误与未完成条目。</strong>分类库是一份民间协作成果，带强烈编辑判断。发现错误时，优先回到原文档与视频核对。</p>
            <p><strong>重新生成数据：</strong>在项目根目录运行 <code>node scripts/build-data.mjs</code>。源文件在 <code>sources/</code>，生成物在 <code>data/</code>。</p>
          </div>
        </div>
      </div>`;
  }

  function renderNotFound(message) {
    main.innerHTML = `
      <section class="atlas-hero">
        <div class="hero-kicker">404 / NOT FOUND</div>
        <h1>这一页<br><em>不在图谱里。</em></h1>
        <p class="hero-lead">${escapeHtml(message || '链接可能已经失效，或者条目被移动了。')}</p>
        <div class="family-actions"><a class="button-primary" href="#/atlas">回到风格图谱 →</a><a class="button-ghost" href="#/">回首页</a></div>
      </section>`;
  }

  // --------------------------------------------------------------------------
  // 听感层 / LISTEN LAYER
  //
  // 这一层不改知识库，只加三种「看法」：
  //   · 在风格树里逐级展开并试听（#/tree）
  //   · 在条目页最上面加一张可听可分享的卡（#/genre/:id）
  //   · 给 DJ 用的过渡检查（#/dj）
  // 所有内容仍以 entryId 为准，detail 页才是唯一地址。
  // --------------------------------------------------------------------------

  const LISTEN = window.KB_LISTEN || { bands: [], grooves: [], lows: [], families: {}, entries: {} };
  const FP_BANK = (window.EM_FINGERPRINTS && window.EM_FINGERPRINTS.recipes) || {};
  const BAND_MID = { slow: 95, mid: 120, fast: 134, xfast: 155 };
  const bandById = new Map(LISTEN.bands.map((band) => [band.id, band]));
  const grooveById = new Map(LISTEN.grooves.map((groove) => [groove.id, groove]));
  const lowById = new Map(LISTEN.lows.map((low) => [low.id, low]));

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'style';
  }

  function shareUrl(id, slug, override) {
    // 构建期传入 override 时，卡片上印短链 /s/{slug}/；否则印一定能打开的条目地址。
    if (override) return `${override.replace(/\/$/, '')}/s/${slug}/`;
    if (location.protocol === 'file:') return `#/genre/${id}`;
    const path = location.pathname.replace(/index\.html$/, '');
    return `${location.host}${path}#/genre/${id}`;
  }

  function listenStyles() {
    return Object.entries(LISTEN.entries)
      .map(([id, data]) => {
        const entry = entryById.get(id);
        if (!entry) return null;
        return { id, data, entry, model: listenModel(entry) };
      })
      .filter(Boolean)
      .sort((a, b) => (a.model.bpm - b.model.bpm) || a.entry.name.localeCompare(b.entry.name));
  }

  // 一条风格在「听感」视角下的全部信息。没有专属文案时返回 null，
  // 由 familyModel() 兜底 —— 两条路必须分开，否则页面会假装所有条目都被编辑过。
  function listenModel(entry, hostOverride) {
    const data = LISTEN.entries[entry.id];
    if (!data || !FP_BANK[data.fp]) return null;
    const family = familyById.get(entry.familyId);
    const band = bandById.get(data.band) || LISTEN.bands[0];
    const groove = grooveById.get(data.groove) || LISTEN.grooves[0];
    const low = lowById.get(data.low) || LISTEN.lows[0];
    const bpm = Math.round((data.bpm.min + data.bpm.max) / 2);
    return {
      id: entry.id,
      slug: slugify(entry.name),
      name: entry.name,
      zh: family ? (family.zh && family.zh.length <= 9 ? `${family.name} · ${family.zh}` : family.name) : entry.familyName,
      bpm,
      bpmLabel: `${data.bpm.min}–${data.bpm.max}`,
      bpmSource: data.bpm.source,
      band,
      groove,
      low,
      bandName: band.name,
      bandFeel: band.feel,
      grooveName: groove.name,
      lowName: low.name,
      oneLine: data.oneLine,
      hear: data.hear,
      when: data.when,
      felt: data.felt || null,
      fp: data.fp,
      fpLabel: (FP_BANK[data.fp] && FP_BANK[data.fp].label) || data.fp,
      shortUrl: shareUrl(entry.id, slugify(entry.name), hostOverride),
      hint: '浏览器实时合成 · 不是原曲',
    };
  }

  function familyListenModel(entry) {
    const fam = LISTEN.families[entry.familyId];
    if (!fam || !FP_BANK[fam.fp]) return null;
    const band = bandById.get(fam.band);
    const groove = grooveById.get(fam.groove);
    const kbBpm = entry.bpm && entry.bpm.min ? Math.round((entry.bpm.min + (entry.bpm.max || entry.bpm.min)) / 2) : null;
    return {
      band, groove, fp: fam.fp,
      fpLabel: (FP_BANK[fam.fp] && FP_BANK[fam.fp].label) || fam.fp,
      bpm: kbBpm || BAND_MID[fam.band] || 120,
      bandName: band ? band.name : '',
      grooveName: groove ? groove.name : '',
    };
  }

  // 大族页的声音入口：用这一族的默认配方，别让「Techno」这个词搜进来是一条哑页。
  function familyListenStrip(family) {
    const fam = LISTEN.families[family.id];
    if (!fam || !FP_BANK[fam.fp]) return '';
    const band = bandById.get(fam.band);
    const groove = grooveById.get(fam.groove);
    const label = FP_BANK[fam.fp].label;
    return `
      <section class="listen-ref" aria-label="这一族的声音">
        <span class="mono-label">LISTEN / 这一族的声音</span>
        <p>先听 <b>${escapeHtml(label)}</b> 的骨架，这是这一族最典型的落地方式（${band ? escapeHtml(band.name) : ''} · ${groove ? escapeHtml(groove.name) : ''}）。具体分支在下面，有专属卡片的会单独展示。</p>
        <button class="button-ghost" type="button" data-family-play="${family.id}">播放这一族</button>
        <a class="button-ghost" href="#/tree?sel=${escapeHtml(family.id)}">在风格树里看</a>
      </section>`;
  }

  /* 老链接重定向：矩阵页已下线，能力并入风格树。
     `#/listen?band=…&groove=…&s=g-xxx` 这类链接可能已经发进群里、存进收藏夹，
     不能让它 404。带 s= 就精确落到那一条风格，否则退回树的根。 */
  function listenRedirectTarget(params) {
    const id = params.get('s');
    if (id) {
      const key = treeKeyFrom(id);
      const node = key ? treeNode(key) : null;
      if (node) {
        // 与 treeReveal 同一套祖先链算法：把目标放在展开后的正确位置，
        // 否则深链进来只看得到根，用户还得自己再找一遍。
        const chain = [];
        let cursor = node;
        let guard = 0;
        while (cursor && guard++ < 12) {
          chain.push(cursor.key.split(':')[1]);
          cursor = cursor.parent ? treeNode(cursor.parent) : null;
        }
        const path = chain.slice(1).reverse();
        const query = new URLSearchParams();
        if (path.length) query.set('path', path.join(','));
        query.set('sel', chain[0]);
        return `#/tree?${query.toString()}`;
      }
    }
    return '#/tree';
  }

  /* ---------------------------------------------------------------- 入口页 */

  /* ------------------------------------------------------- 条目页的听感块 */

  /* 听感卡里的例曲。只列前三首：再多就不是「先听一下」而是变成列表页了。
     播放走 Apple 的 30 秒官方预览（站点不托管任何音频），
     曲库没有的用 B 站 / 网易云兜底，按钮永远有第二条路。 */
  function listenExamplesHTML(entry) {
    const list = (entry.examples || []).filter((ex) => ex && ex.title).slice(0, 3);
    if (!list.length) return '';
    return `
      <div class="lc-examples">
        <div class="lc-examples-head">
          <span class="mono-label">EXAMPLES / 例曲 30 秒</span>
          <label class="lc-autoplay" data-tooltip="打开后，进入任何风格页会自动试听第一首例曲">
            <input type="checkbox" data-lc-autoplay${listenAutoplayOn() ? ' checked' : ''}>
            <span>进入即播</span>
          </label>
        </div>
        <ol class="lc-example-list">
          ${list.map((ex) => {
            const cands = previewCandidates(ex.artist, ex.title);
            const term = cands[0] || ex.title || '';
            const alt = cands.slice(1).join('\u0001');
            const query = encodeURIComponent([ex.artist, ex.title].filter(Boolean).join(' ').trim() || ex.title);
            return `
            <li class="lc-example-item">
              <span class="lc-example-meta">
                <span class="lc-example-title">${escapeHtml(cleanExampleText(ex.title) || ex.title)}</span>
                ${ex.artist ? `<span class="lc-example-artist">${escapeHtml(cleanExampleText(ex.artist) || ex.artist)}</span>` : ''}
              </span>
              <span class="lc-example-actions">
                <button class="example-preview" type="button" data-preview="${escapeHtml(term)}"${alt ? ` data-preview-alt="${escapeHtml(alt)}"` : ''}>试听 30 秒</button>
                <a class="example-link" href="https://search.bilibili.com/all?keyword=${query}" target="_blank" rel="noopener noreferrer">B 站 ↗</a>
                <a class="example-link" href="https://music.163.com/#/search/m/?s=${query}" target="_blank" rel="noopener noreferrer">网易云 ↗</a>
              </span>
              <span class="example-feedback" hidden></span>
            </li>`;
          }).join('')}
        </ol>
        <p class="lc-examples-note">试听来自 Apple Music 的 30 秒官方预览，本站不托管音频。曲库未收录的（地下 / 白标发行）用右边的链接去别处找。</p>
      </div>`;
  }

  /* ============================================================ Ishkur 资料层

     数据来自 Ishkur's Guide to Electronic Music（见 data/ishkur.js）。
     它是另一套独立编目，视角和本库不同 —— 名字对得上才挂，对不上就不挂，
     不做「大概像」的模糊合并。

     三个入口共用这里的渲染：
       · 条目页   —— 完整的介绍正文（中英对照）+ 例曲清单 + 配图
       · 风格树   —— 详情面板里的紧凑版（首段 + 前几条例曲）
       · 大族页   —— 该族下已匹配条目的汇总入口
     ============================================================ */

  const ISHKUR = window.ISHKUR || { genres: [], byNode: {}, counts: {} };

  // slug → 风格数据，避免每次渲染都线性查找
  const ishkurBySlug = new Map((ISHKUR.genres || []).map((g) => [g.slug, g]));

  /** 取某个树节点对应的 Ishkur 资料（可能有多条，如 Progressive Trance ← McProg + 8th Note Prog） */
  function ishkurFor(nodeKey) {
    const hit = ISHKUR.byNode ? ISHKUR.byNode[nodeKey] : null;
    if (!hit || !hit.sources || !hit.sources.length) return null;
    const list = hit.sources.map((slug) => ishkurBySlug.get(slug)).filter(Boolean);
    return list.length ? { ...hit, entries: list } : null;
  }

  /* 条目页拿到的是 entry.id（形如 g-413），树里用的是带类型前缀的 key（e:g-413）。
     两处都要能查，所以统一走这个入口，调用方不必关心前缀。 */
  function ishkurForEntryId(id) {
    return ishkurFor(`e:${id}`);
  }

  /** 该节点是否有已翻译的正文 */
  function ishkurHasZh(entry) {
    return (entry.paras || []).some((p) => p.zh);
  }

  /* 正文段落。有译文显示译文，没有就显示英文原文并标注 ——
     宁可让读者看到英文，也不要留一片空白让人以为坏了。 */
  function ishkurParasHTML(entry, limit) {
    const paras = (entry.paras || []).filter((p) => p.en || p.zh);
    const list = limit ? paras.slice(0, limit) : paras;
    return list.map((p) => {
      if (p.zh) {
        return `<p class="ishkur-p">${escapeHtml(p.zh)}</p>`;
      }
      return `<p class="ishkur-p is-en"><span class="ishkur-en-tag">EN</span>${escapeHtml(p.en)}</p>`;
    }).join('');
  }

  /* 例曲清单。走站点既有的 Apple Music 预览链路，不另起一套播放逻辑。 */
  function ishkurTracksHTML(entry, limit) {
    const all = (entry.tracks || []).filter((t) => t.song);
    if (!all.length) return '';
    const list = limit ? all.slice(0, limit) : all;
    const more = all.length - list.length;
    return `
      <div class="ishkur-tracks">
        <div class="ishkur-sub-head">
          <span class="mono-label">EXAMPLES / 例曲 ${all.length}</span>
          ${more > 0 ? `<span class="ishkur-more-hint">还列了 ${more} 首，见完整清单</span>` : ''}
        </div>
        <ol class="ishkur-track-list">
          ${list.map((t) => {
            const cands = previewCandidates(t.artist, t.song);
            const term = cands[0] || t.song || '';
            const alt = cands.slice(1).join('\u0001');
            const query = encodeURIComponent([t.artist, t.song].filter(Boolean).join(' ').trim() || t.song);
            return `
            <li class="ishkur-track-item">
              <span class="ishkur-track-year">${t.year || '—'}</span>
              <span class="ishkur-track-meta">
                <span class="ishkur-track-song">${escapeHtml(t.song)}</span>
                ${t.artist ? `<span class="ishkur-track-artist">${escapeHtml(t.artist)}</span>` : ''}
              </span>
              <span class="ishkur-track-actions">
                <button class="example-preview" type="button" data-preview="${escapeHtml(term)}"${alt ? ` data-preview-alt="${escapeHtml(alt)}"` : ''}>试听 30 秒</button>
                <a class="example-link" href="https://search.bilibili.com/all?keyword=${query}" target="_blank" rel="noopener noreferrer">B 站 ↗</a>
                <a class="example-link" href="https://music.163.com/#/search/m/?s=${query}" target="_blank" rel="noopener noreferrer">网易云 ↗</a>
              </span>
              <span class="example-feedback" hidden></span>
            </li>`;
          }).join('')}
        </ol>
      </div>`;
  }

  /** 配图。说明文字在下面，样式交给 CSS 做窄栏。 */
  function ishkurImagesHTML(entry) {
    const imgs = (entry.images || []).filter((im) => im && im.file);
    if (!imgs.length) return '';
    return `
      <div class="ishkur-figures">
        ${imgs.map((im) => `
          <figure class="ishkur-figure">
            <img src="assets/ishkur/${encodeURIComponent(im.file)}" alt="${escapeHtml(im.caption || entry.name)}" loading="lazy"
                 onerror="this.closest('figure').hidden=true;var g=this.closest('.ishkur-figures');if(g&&![...g.querySelectorAll('figure')].some(f=>!f.hidden))g.hidden=true">
            ${im.caption ? `<figcaption>${escapeHtml(im.caption)}</figcaption>` : ''}
          </figure>`).join('')}
      </div>`;
  }

  /** 外部链接（原文里引用的纪录片、曲目页等） */
  function ishkurLinksHTML(entry) {
    const links = (entry.links || []).filter((l) => l && l.url);
    if (!links.length) return '';
    return `
      <div class="ishkur-links">
        <span class="mono-label">LINKS / 延伸</span>
        <div class="chip-row">
          ${links.map((l) => `<a class="chip" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)} ↗</a>`).join('')}
        </div>
      </div>`;
  }

  /** 单个风格块的头部：名字、年代、场景、别名 */
  function ishkurHeadHTML(entry) {
    const meta = [entry.emerged, entry.scene].filter(Boolean).join(' · ');
    return `
      <div class="ishkur-head">
        <h3>${escapeHtml(entry.name)}${entry.zh ? `<span class="ishkur-zh">${escapeHtml(entry.zh)}</span>` : ''}</h3>
        ${meta ? `<p class="ishkur-meta">${escapeHtml(meta)}</p>` : ''}
        ${entry.aka ? `<p class="ishkur-aka">又称：${escapeHtml(entry.aka)}</p>` : ''}
      </div>`;
  }

  /* 条目页的完整区块。
     一个节点可能对应多条 Ishkur 资料（Ishkur 分得更细），逐条平铺。
     全部都没有译文时，在顶部说明一句，免得读者以为是站点没做完。 */
  function ishkurSectionHTML(entry) {
    const hit = ishkurForEntryId(entry.id);
    if (!hit) return '';
    const anyZh = hit.entries.some(ishkurHasZh);
    return `
      <section class="detail-section ishkur-section">
        <div class="ishkur-section-head">
          <h2>Ishkur 的解读</h2>
          <p class="section-sub">
            来自 <a href="https://music.ishkur.com/" target="_blank" rel="noopener noreferrer">Ishkur's Guide to Electronic Music</a>
            的独立编目，观点与本库不同，保留原作者语气。例曲试听走 Apple Music 30 秒预览，本站不托管音频。
          </p>
          ${anyZh ? '' : '<p class="ishkur-note">这一条的译文还在整理，先显示英文原文。</p>'}
        </div>
        ${hit.entries.map((e) => `
          <article class="ishkur-entry">
            ${hit.entries.length > 1 ? ishkurHeadHTML(e) : ''}
            <div class="ishkur-body">${ishkurParasHTML(e)}</div>
            ${ishkurImagesHTML(e)}
            ${ishkurTracksHTML(e)}
            ${ishkurLinksHTML(e)}
          </article>`).join('')}
      </section>`;
  }

  /* 风格树里选中大族时，列该族下已匹配的条目 ——
     大族节点本身没有 Ishkur 对应物（Ishkur 的 Trance 是整体，本库拆成了 19 条），
     所以这里给的是「往哪儿去」，不是正文。 */
  function ishkurFamilyInTreeHTML(node) {
    if (node.kind !== 'family') return '';
    const kids = node.children
      .map((k) => TREE.nodes[k])
      .filter((n) => n && n.kind === 'entry')
      .map((n) => ({ node: n, hit: ishkurFor(n.key) }))
      .filter((x) => x.hit);
    if (!kids.length) return '';
    return `
      <div class="tree-rel ishkur-compact ishkur-family-in-tree">
        <h3>ISHKUR / 另一套解读<span>这一族有 ${kids.length} 条对应</span></h3>
        <div class="chip-row">
          ${kids.map(({ node, hit }) => {
            const tracks = hit.entries.reduce((s, e) => s + (e.tracks || []).length, 0);
            return `<button class="chip" type="button" data-tree-descend="${escapeHtml(node.key)}" title="${escapeHtml(hit.entries.map((e) => e.name).join(' / '))} · ${tracks} 首例曲">${escapeHtml(node.name)}</button>`;
          }).join('')}
        </div>
        <p class="ishkur-compact-note">Ishkur 把这一族当作整体来讲，本库拆得更细；点上面的条目看对应解读。</p>
      </div>`;
  }

  /* 风格树详情面板用的紧凑版：首两段 + 前 3 首例曲，其余引导去条目页 */
  function ishkurCompactHTML(node) {
    const hit = ishkurFor(node.key);
    if (!hit) return '';
    const first = hit.entries[0];
    const totalTracks = hit.entries.reduce((s, e) => s + (e.tracks || []).length, 0);
    return `
      <div class="tree-rel ishkur-compact">
        <h3>ISHKUR / 另一套解读<span>${escapeHtml(first.name)}${hit.entries.length > 1 ? ` 等 ${hit.entries.length} 条` : ''} · ${totalTracks} 首例曲</span></h3>
        <div class="ishkur-compact-body">${ishkurParasHTML(first, 2)}</div>
        ${ishkurTracksHTML(first, 3)}
        <p class="ishkur-compact-note">
          <a href="#/genre/${escapeHtml(node.id)}">在条目页看完整解读与全部例曲 →</a>
        </p>
      </div>`;
  }

  /* 大族页的汇总入口：这一族下有哪些条目带 Ishkur 资料。
     只列有资料的 —— 没匹配上的条目本来就没有，列出来只是噪声。 */
  function ishkurFamilySummaryHTML(familyId, familyEntries) {
    const kids = (familyEntries || [])
      .map((entry) => ({ entry, hit: ishkurForEntryId(entry.id) }))
      .filter((x) => x.hit);
    if (!kids.length) return '';
    return `
      <section class="detail-section ishkur-family-section">
        <h2>Ishkur 的解读 · ${kids.length} 条</h2>
        <p class="section-sub">Ishkur's Guide 里对应到本族的条目。点进去看完整介绍与例曲清单。</p>
        <div class="ishkur-family-grid">
          ${kids.map(({ entry, hit }) => {
            const tracks = hit.entries.reduce((s, e) => s + (e.tracks || []).length, 0);
            const label = hit.entries.map((e) => e.name).join(' / ');
            return `<a class="ishkur-family-card" href="#/genre/${escapeHtml(entry.id)}">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(entry.name)}${entry.zh ? ` · ${escapeHtml(entry.zh)}` : ''}</span>
              <em>${tracks} 首例曲${hit.entries.some(ishkurHasZh) ? '' : ' · 英文'}</em>
            </a>`;
          }).join('')}
        </div>
      </section>`;
  }

  function listenBlockHTML(entry) {
    const model = listenModel(entry);
    if (model) {
      const source = model.bpmSource === 'source' ? '原文明确' : '编辑推断';
      return `
        <section class="listen-card" aria-label="听感卡">
          <div>
            <div class="lc-kicker"><i aria-hidden="true"></i>LISTEN / 先听</div>
            <h2 class="lc-line">${escapeHtml(model.oneLine)}</h2>
            <div class="lc-dims">
              <span>${model.bpm} BPM · ${escapeHtml(model.bpmLabel)}</span>
              <span>${escapeHtml(model.bandName)} / ${escapeHtml(model.bandFeel)}</span>
              <span>${escapeHtml(model.grooveName)}</span>
              <span>低频 ${escapeHtml(model.lowName)}</span>
            </div>
            <div class="lc-hear">
              ${[['01 / 鼓', model.hear[0]], ['02 / 低音', model.hear[1]], ['03 / 空间', model.hear[2]]].map((row) => `
                <div><b>${escapeHtml(row[0])}</b><span>${escapeHtml(row[1])}</span></div>`).join('')}
            </div>
            <p class="lc-when">什么时候会听到：<b>${escapeHtml(model.when)}</b></p>
            <div class="lc-actions">
              <button class="button-primary" type="button" data-genre-play>播放 8 秒</button>
              <button class="button-ghost" type="button" data-genre-share>做成卡片</button>
              <a class="button-ghost" href="#/tree?sel=${escapeHtml(model.id)}">在风格树里看 →</a>
            </div>
            <p class="lc-note">BPM 来源：${source}（${escapeHtml(model.bpmLabel)}）。试听是浏览器实时合成的骨架，不是原曲；下面的正文才是完整的风格资料。</p>
            ${listenExamplesHTML(entry)}
          </div>
          <div class="lc-preview">
            <canvas id="genreListenCanvas" width="1080" height="1440" aria-label="${escapeHtml(model.name)} 风格卡预览"></canvas>
            <p>1080 × 1440 · 长按可保存 · 也能直接发进群里</p>
          </div>
        </section>`;
    }

    const fam = familyListenModel(entry);
    if (!fam) return '';
    return `
      <section class="listen-ref" aria-label="同族试听">
        <span class="mono-label">LISTEN / 同族参考</span>
        <p>这一条还没有专属听感文案。先听 <b>${escapeHtml(fam.fpLabel)}</b> 的骨架——它属于这个族，但不是这一条独有的声音。</p>
        <button class="button-ghost" type="button" data-ref-play>播放同族示例</button>
        <a class="button-ghost" href="#/tree?sel=${escapeHtml(entry.familyId)}">在风格树里看同族</a>
        ${listenExamplesHTML(entry)}
      </section>`;
  }

  function mountListenBlock(entry) {
    bindExamplePreviews();
    const canvas = document.getElementById('genreListenCanvas');
    const model = listenModel(entry);
    if (canvas && model && window.EMShare) window.EMShare.draw(canvas, model);

    // 例曲自动播放：进入风格页就试听第一首。开关状态跨页面保留。
    const autoplayToggle = document.querySelector('[data-lc-autoplay]');
    if (autoplayToggle) {
      autoplayToggle.addEventListener('change', () => {
        setListenAutoplay(autoplayToggle.checked);
        if (autoplayToggle.checked) autoplayFirstExample();
        else stopExamplePreview();
      });
      // 等一帧：让首次布局稳定，也避开和路由切换的音频清理抢时序
      if (autoplayToggle.checked) window.requestAnimationFrame(() => autoplayFirstExample());
    }

    document.querySelectorAll('[data-genre-play]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!model) return;
        stopExamplePreview(); // 原曲预览与合成骨架互斥，避免两段声音叠着响
        const state = Audio?.getState();
        if (state && state.playing && state.demoId === `fp:${model.fp}`) Audio.stop();
        else Audio?.playFingerprint(model.fp, { bpm: model.bpm, label: `${model.name} · ${model.bpm} BPM` });
      });
    });
    document.querySelectorAll('[data-genre-share]').forEach((button) => {
      button.addEventListener('click', () => {
        if (model && window.EMShare) window.EMShare.open(model);
      });
    });

    const refPlay = document.querySelector('[data-ref-play]');
    if (refPlay) {
      refPlay.addEventListener('click', () => {
        const fam = familyListenModel(entry);
        if (!fam) return;
        stopExamplePreview();
        const state = Audio?.getState();
        if (state && state.playing && state.demoId === `fp:${fam.fp}`) Audio.stop();
        else Audio?.playFingerprint(fam.fp, { bpm: fam.bpm, label: `${fam.fpLabel} · 同族示例` });
      });
    }
  }

  /* -------------------------------------------------------------- DJ 工具 */

  function djCourseReady() {
    return Boolean(DJ_COURSE && Array.isArray(DJ_COURSE.episodes) && DJ_COURSE.episodes.length);
  }

  function djFormatDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function djEpisodeFromSourceId(sourceId) {
    if (!djCourseReady() || !sourceId) return null;
    return DJ_COURSE.episodes.find((episode) => episode.sourceId === sourceId) || null;
  }

  function djTranscriptText(episode) {
    if (!episode) return '';
    return mergeChunkTexts(webChunksByDoc.get(episode.sourceId) || []).trim();
  }

  function djEpisodeListHTML(currentId) {
    if (!djCourseReady()) return '';
    return DJ_COURSE.chapters.map((chapter) => {
      const episodes = chapter.episodeIds
        .map((id) => DJ_COURSE.episodes.find((episode) => episode.id === id))
        .filter(Boolean);
      return `<section class="djc-chapter">
        <header class="djc-chapter-head">
          <span class="djc-chapter-code">${escapeHtml(chapter.index)}</span>
          <div>
            <h2>${escapeHtml(chapter.title)}</h2>
            <p>${escapeHtml(chapter.subtitle)}${chapter.guideId ? ` · <a class="djc-chapter-guide" href="#/doc/${encodeURIComponent(chapter.guideId)}">导读</a>` : ''}</p>
          </div>
        </header>
        <ol class="djc-episode-list">
          ${episodes.map((episode) => {
            const done = djCompleted.has(episode.id);
            return `<li><a class="djc-episode${episode.id === currentId ? ' is-active' : ''}${done ? ' is-done' : ''}" href="#/dj/course?ep=${episode.page}">
            <span class="djc-episode-num">${escapeHtml(episode.id)}${done ? ' ✓' : ''}</span>
            <span class="djc-episode-copy"><strong>${escapeHtml(episode.displayTitle || episode.title)}</strong><small>${escapeHtml(episode.summary)}</small></span>
            <span class="djc-episode-time">${djFormatDuration(episode.duration)}</span>
          </a></li>`;
          }).join('')}
        </ol>
      </section>`;
    }).join('');
  }

  let lastDjEpisodeId = null;

  function renderDjCourse(route) {
    if (!djCourseReady()) {
      renderNotFound('DJ 课程数据未加载。请确认 data/dj-course.js 存在。');
      return;
    }
    const requested = Number(route.params.get('ep'));
    const fallback = firstIncompleteDjEpisode() || DJ_COURSE.episodes[0];
    const episode = DJ_COURSE.episodes.find((item) => item.page === requested) || fallback;
    const chapter = DJ_COURSE.chapters.find((item) => item.id === episode.chapterId) || DJ_COURSE.chapters[0];
    const index = DJ_COURSE.episodes.findIndex((item) => item.id === episode.id);
    const previous = DJ_COURSE.episodes[index - 1] || null;
    const next = DJ_COURSE.episodes[index + 1] || null;
    const transcript = djTranscriptText(episode);
    const minuteLabel = Math.round(DJ_COURSE.totalDuration / 60);
    const djDone = djCompletedCount();
    const djTotal = DJ_COURSE.episodeCount;
    const djPct = djProgressPercent();
    const djNext = firstIncompleteDjEpisode();
    const episodeDone = djCompleted.has(episode.id);

    main.innerHTML = `
      ${pageHead({
        code: 'DJ',
        label: 'COURSE',
        title: `${DJ_COURSE.episodeCount} 集，<br><em>从第一次摸机到第一次接歌</em>。`,
        lead: '《DJ 修炼手册 · 基础篇》的逐集知识笔记与学习索引：38 节正课，加课程说明、结课与进阶预告，共 41 集。先看装备与 Rekordbox，再练 CUE、对拍和混音，最后用 8 种方法接歌。',
        stats: [
          { label: '集数', value: String(DJ_COURSE.episodeCount) },
          { label: '时长', value: `${minuteLabel} 分` },
          { label: '章节', value: String(DJ_COURSE.chapters.length) },
          { label: '进度', value: `${djDone}<span>/${djTotal}</span>` },
        ],
        action: { href: djNext ? `#/dj/course?ep=${djNext.page}` : '#/dj/course?ep=1', label: djNext ? `继续第 ${djNext.id} 集` : '全部完成 · 回看第 1 集' },
      })}
      <section class="djc-shell">
        <aside class="djc-index" aria-label="课程目录">
          <div class="djc-index-head">
            <span class="mono-label">TRACKLIST / ${DJ_COURSE.episodeCount} 集</span>
            <span class="mono-label">${minuteLabel} MIN</span>
          </div>
          <div class="djc-progress" aria-label="DJ 课程进度"><span>${djDone} / ${djTotal}</span><i><b style="--pct:${djPct}%"></b></i></div>
          ${djEpisodeListHTML(episode.id)}
        </aside>
        <article class="djc-reader">
          <details class="djc-mobile-picker">
            <summary>选择集数 · 当前 ${escapeHtml(episode.id)} / ${DJ_COURSE.episodeCount}</summary>
            ${djEpisodeListHTML(episode.id)}
          </details>
          <header class="djc-reader-head">
            <div class="djc-reader-meta">
              <span class="chip">DJ 修炼手册</span>
              <span class="mono-label">${escapeHtml(chapter.index)} / ${escapeHtml(chapter.title)}</span>
              <span class="mono-label">${djFormatDuration(episode.duration)}</span>
              ${chapter.guideId ? `<a class="chip" href="#/doc/${encodeURIComponent(chapter.guideId)}">本章导读</a>` : ''}
            </div>
            <h1>${escapeHtml(episode.displayTitle || episode.title)}</h1>
            <p class="djc-reader-summary">${escapeHtml(episode.summary)}</p>
            <div class="djc-reader-actions">
              <a class="button-primary" href="${escapeHtml(episode.url)}" target="_blank" rel="noopener noreferrer">在 B 站看这一集 ↗</a>
              <a class="button-ghost" href="#/doc/${encodeURIComponent(episode.sourceId)}">在知识库打开全文 →</a>
            </div>
            <p class="djc-asr-note">${escapeHtml(DJ_COURSE.asrNote)}</p>
          </header>
          <div class="djc-transcript doc-body">
            ${transcript
              ? kbMarkdownLite(transcript)
              : `<p class="djc-empty">这一集的知识笔记尚未生成。<a href="${escapeHtml(episode.url)}" target="_blank" rel="noopener noreferrer">先去 B 站看原片 ↗</a></p>`}
          </div>
          <footer class="djc-reader-foot">
            <div class="djc-complete">
              <button class="${episodeDone ? 'button-ghost' : 'button-primary'}" type="button" data-dj-complete="${episode.id}">${episodeDone ? '已完成 ✓ · 取消' : '标记本集完成'}</button>
              <span>${episodeDone ? '进度已保存到本机' : '完成后会同步到新手起步页'}</span>
            </div>
            <div class="djc-pager">
              ${previous ? `<a href="#/dj/course?ep=${previous.page}">← ${escapeHtml(previous.id)} ${escapeHtml(previous.displayTitle || previous.title)}</a>` : '<span></span>'}
              ${next ? `<a href="#/dj/course?ep=${next.page}">${escapeHtml(next.id)} ${escapeHtml(next.displayTitle || next.title)} →</a>` : '<span></span>'}
            </div>
            <div class="djc-keywords">
              <span class="mono-label">SEARCH / 本集相关概念</span>
              ${(chapter.keywords || []).map((keyword) => `<a class="chip" href="#/search?q=${encodeURIComponent(keyword)}">${escapeHtml(keyword)}</a>`).join('')}
            </div>
            <div class="djc-next">
              <span class="mono-label">NEXT / 下一步</span>
              <a href="#/dj/field-guide">读现场手册：出门前 24 项检查 →</a>
              <a href="#/practice?mode=phrase">练 8 小节乐句计数 →</a>
            </div>
            <p class="djc-source-line">来源：${escapeHtml(DJ_COURSE.author)} · ${escapeHtml(DJ_COURSE.licenseNote)}</p>
          </footer>
        </article>
      </section>`;

    const indexPanel = main.querySelector('.djc-index');
    const activeEpisode = indexPanel?.querySelector('.djc-episode.is-active');
    if (indexPanel && activeEpisode) {
      indexPanel.scrollTop = Math.max(0, activeEpisode.offsetTop - indexPanel.clientHeight / 2);
    }
    if (lastDjEpisodeId && lastDjEpisodeId !== episode.id) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    lastDjEpisodeId = episode.id;
    main.querySelector('[data-dj-complete]')?.addEventListener('click', () => {
      if (djCompleted.has(episode.id)) djCompleted.delete(episode.id);
      else djCompleted.add(episode.id);
      saveDjProgress();
      renderHeader('/dj/course');
      renderDjCourse(parseRoute());
    });
  }

  function djStyles() {
    return listenStyles().filter((item) => item.data.bpm);
  }

  function analyzePair(a, b) {
    const delta = b.model.bpm - a.model.bpm;
    const pct = (delta / a.model.bpm) * 100;
    const half = Math.abs(a.model.bpm * 2 - b.model.bpm) <= 5 || Math.abs(b.model.bpm * 2 - a.model.bpm) <= 5;
    let tag = '';
    let cls = 'is-ok';
    let note = '';

    if (half) {
      tag = '半速 / 双速';
      cls = 'is-info';
      note = `${a.model.bpm} 与 ${b.model.bpm} 差一倍：不要对拍，用 half-time 叠 8 小节，让两边的鼓互相填空。`;
    } else if (Math.abs(pct) <= 3) {
      tag = '可以直接接';
      cls = 'is-ok';
      note = `差 ${Math.abs(delta)} BPM（${Math.abs(pct).toFixed(1)}%），对拍即可，人声几乎听不出变化。`;
    } else if (Math.abs(pct) <= 8) {
      tag = '需要推速';
      cls = 'is-ok';
      note = `差 ${Math.abs(delta)} BPM，需要 pitch ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%；超过 6% 人声会明显变调。`;
    } else {
      tag = '不要直接接';
      cls = 'is-warn';
      note = `差 ${Math.abs(Math.round(pct))}%，中间需要垫一首桥接曲。`;
    }

    const moves = [];
    if (a.model.groove.id !== b.model.groove.id) {
      moves.push({
        text: `律动不同（${a.model.grooveName} → ${b.model.grooveName}）：不要在小节线上硬切，先用 8 小节只有鼓的段落过渡。`,
        kb: 'EQ',
      });
    } else {
      moves.push({ text: '律动相同：可以对小节线直接切，或者叠 16 小节做 layer。', kb: '八段结构' });
    }
    if (a.model.low.id === 'sustain' && b.model.low.id === 'sustain') {
      moves.push({ text: '两边低频都是持续铺底：进 B 之前先把 A 的低频切掉，否则会糊成一片。', kb: 'Sidechain' });
    } else if (a.model.low.id !== 'sustain' && b.model.low.id === 'sustain') {
      moves.push({ text: 'B 的低频会突然变满：留 4 小节空档，让耳朵先适应。', kb: '低频' });
    } else {
      moves.push({ text: '低频形态接近：直接叠也不会打架，注意总电平。', kb: 'Limiter' });
    }
    if (half) {
      moves.push({ text: '半速关系最适合做「突然加速」：A 播 1 小节，B 从第 2 拍进。', kb: 'Half-time' });
    } else if (Math.abs(pct) > 3) {
      moves.push({ text: '用 loop 把 A 的最后一小节锁住，边推 pitch 边进 B，比直接切更安全。', kb: '转场' });
    } else {
      moves.push({ text: 'BPM 接近时最容易犯的错是「接得太早」：等 A 的乐句走完再进。', kb: '乐句' });
    }

    return { delta, pct, tag, cls, note, moves };
  }

  function renderDj(route) {
    const styles = djStyles();
    const bridgeCount = djCourseReady() ? DJ_COURSE.episodeCount : 41;
    const byId = new Map(styles.map((item) => [item.id, item]));
    const a = byId.get(route.params.get('a')) || byId.get('g-10159') || styles[0];
    const b = byId.get(route.params.get('b')) || byId.get('g-8566') || styles[1];
    const result = analyzePair(a, b);

    main.innerHTML = `
      ${pageHead({
        code: 'DJ',
        label: 'TRANSITION',
        title: '两首歌能不能接，<br><em>先看三件事</em>。',
        lead: '速度差多少、鼓是不是同一种落地、低频会不会打架。判断是规则算的，建议是手写的，每一条都指向对应的课与词条。',
        stats: [
          { label: '可查风格', value: String(styles.length) },
          { label: '规则', value: '3' },
        ],
        action: { href: '#/dj/course', label: '系统学碟机' },
      })}
      <form class="dj-grid" id="djForm">
        <div class="dj-field">
          <label for="djA">A / 现在放的</label>
          <select id="djA">${styles.map((item) => `<option value="${item.id}"${item.id === a.id ? ' selected' : ''}>${escapeHtml(item.entry.name)} · ${item.model.bpm} BPM</option>`).join('')}</select>
        </div>
        <div class="dj-field">
          <label for="djB">B / 想接的</label>
          <select id="djB">${styles.map((item) => `<option value="${item.id}"${item.id === b.id ? ' selected' : ''}>${escapeHtml(item.entry.name)} · ${item.model.bpm} BPM</option>`).join('')}</select>
        </div>
      </form>
      <div class="dj-verdict" id="djVerdict">${djVerdictHTML(a, b, result)}</div>
      <section class="dj-quick" aria-label="现场判定">
        <div class="dj-quick-head">
          <strong>现场判定</strong>
          <span class="mono-label">不知道这是什么？按你听到的选三个</span>
        </div>
        <div class="dj-quick-grid">
          <div class="dj-field">
            <label for="dqGroove">鼓怎么落地</label>
            <select id="dqGroove">
              <option value="">不确定</option>
              ${LISTEN.grooves.map((groove) => `<option value="${groove.id}">${escapeHtml(groove.name)} · ${escapeHtml(groove.hint)}</option>`).join('')}
            </select>
          </div>
          <div class="dj-field">
            <label for="dqLow">低音</label>
            <select id="dqLow">
              <option value="">不确定</option>
              ${LISTEN.lows.map((low) => `<option value="${low.id}">${escapeHtml(low.name)}</option>`).join('')}
            </select>
          </div>
          <div class="dj-field">
            <label for="dqBand">速度</label>
            <select id="dqBand">
              <option value="">不确定</option>
              ${LISTEN.bands.map((band) => `<option value="${band.id}">${escapeHtml(band.name)} · ${escapeHtml(band.range)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="dj-quick-out" id="djQuickOut"></div>
      </section>
      <section class="dj-neighbors">
        <div class="dj-neighbors-head">
          <strong>BPM 邻接表</strong>
          <span class="mono-label">在</span>
          <input id="djBpm" type="number" min="60" max="200" step="1" value="${a.model.bpm}" aria-label="输入 BPM">
          <span class="mono-label">附近能接什么</span>
        </div>
        <div id="djNeighbors">${djNeighborsHTML(a.model.bpm)}</div>
      </section>
      <p class="listen-hint">规则是保守的：它只会告诉你「能不能直接接」，真正好不好听还得你自己听。右侧的 BPM 都是编辑推断的区间中点，不是唱片上印的数字。</p>
      <section class="dj-course-bridge">
        <div>
          <span class="mono-label">COURSE / ${bridgeCount} 集 · 2 小时 38 分</span>
          <h2>想系统学碟机，而不只是查一首歌？</h2>
          <p>从装备、Rekordbox、CUE，到对拍、EQ/Filter 混音和 8 种接歌方法，按课程顺序走一遍。</p>
        </div>
        <a class="button-primary" href="#/dj/course">进入 DJ 修炼手册${uiIcon('arrow')}</a>
      </section>
      <section class="dj-course-bridge dj-automix-bridge">
        <div>
          <span class="mono-label">ADVANCED / 自动接歌台 · 需要本地引擎</span>
          <h2>不止查能不能接，<br>让机器排一遍。</h2>
          <p>选风格、排 set、规划长混音 / 低频交换 / 滤波 / 硬切 / 双 drop，再用分轨渲染成一条 mix。线上未连接引擎时展示示例数据。</p>
        </div>
        <a class="button-primary" href="#/dj/automix">打开自动接歌台${uiIcon('arrow')}</a>
      </section>`;

    const form = document.getElementById('djForm');
    const update = () => {
      const nextA = byId.get(document.getElementById('djA').value);
      const nextB = byId.get(document.getElementById('djB').value);
      if (!nextA || !nextB) return;
      replaceHash(`#/dj?a=${nextA.id}&b=${nextB.id}`);
      document.getElementById('djVerdict').innerHTML = djVerdictHTML(nextA, nextB, analyzePair(nextA, nextB));
      bindDjLinks();
    };
    // 直接挂在两个 select 上：原生 change 会冒泡，但程序化触发的不会，
    // 挂在这里两种都能收到，也避免 form 上再挂一次导致重复执行。
    document.getElementById('djA')?.addEventListener('change', update);
    document.getElementById('djB')?.addEventListener('change', update);
    const bpmInput = document.getElementById('djBpm');
    bpmInput?.addEventListener('input', () => {
      const value = Number(bpmInput.value);
      if (!Number.isFinite(value) || value < 60 || value > 200) return;
      document.getElementById('djNeighbors').innerHTML = djNeighborsHTML(value);
      bindDjNeighborChips();
    });
    bindDjLinks();
    bindDjNeighborChips();

    // 现场判定：三个问题 → 候选 ≤ 12 → 点一下直接听
    const quickFields = ['dqGroove', 'dqLow', 'dqBand'].map((id) => document.getElementById(id));
    const renderQuick = () => {
      const [groove, low, band] = quickFields.map((field) => field?.value || '');
      const hits = styles.filter((item) => (!groove || item.model.groove.id === groove)
        && (!low || item.model.low.id === low)
        && (!band || item.model.band.id === band));
      const out = document.getElementById('djQuickOut');
      if (!out) return;
      if (!groove && !low && !band) {
        out.innerHTML = '<p class="dj-quick-note">先选一个你听得出来的条件，不确定的就跳过。三个都不选等于把 60 条全列出来，那不叫判定。</p>';
        return;
      }
      const shown = hits.slice(0, 12);
      out.innerHTML = hits.length
        ? `<div class="dj-quick-list">${shown.map((item) => `
            <button class="dj-nb-chip" type="button" data-quick-play="${item.id}">
              ${escapeHtml(item.entry.name)}<i>${item.model.bpm}${item.model.groove.id === 'floor' ? '' : ` · ${item.model.grooveName}`}</i>
            </button>`).join('')}</div>
            <p class="dj-quick-note">${hits.length} 个候选${hits.length > shown.length ? `，先列前 ${shown.length} 个` : ''}。点是直接听 8 秒；想看得更细就去 <a href="#/tree">风格树</a> 里沿分支找。</p>`
        : '<p class="dj-quick-note">没有完全匹配的。把「低音」改成不确定再试——三个条件同时成立的情况确实不多。</p>';
      out.querySelectorAll('[data-quick-play]').forEach((button) => {
        button.addEventListener('click', () => {
          const item = styles.find((style) => style.id === button.dataset.quickPlay);
          if (!item) return;
          const state = Audio?.getState();
          if (state && state.playing && state.demoId === `fp:${item.model.fp}`) Audio.stop();
          else Audio?.playFingerprint(item.model.fp, { bpm: item.model.bpm, label: `${item.entry.name} · ${item.model.bpm} BPM` });
        });
      });
    };
    quickFields.forEach((field) => field?.addEventListener('change', renderQuick));
    renderQuick();
  }

  function djVerdictHTML(a, b, result) {
    return `
      <div class="dj-top">
        <div class="dj-delta">${result.delta > 0 ? '+' : ''}${result.delta}<small>BPM</small></div>
        <span class="dj-tag ${result.cls}">${result.tag}</span>
        <span class="mono-label">${escapeHtml(a.entry.name)} → ${escapeHtml(b.entry.name)}</span>
      </div>
      <p class="dj-note">${result.note}</p>
      <ul class="dj-moves">
        ${result.moves.slice(0, 3).map((move, index) => `
          <li>
            <span class="n">${String(index + 1).padStart(2, '0')}</span>${move.text}
            <div class="links">
              <a href="#/learn/transitions">过渡课 →</a>
              <a href="#/search?q=${encodeURIComponent(move.kb)}">${escapeHtml(move.kb)} →</a>
            </div>
          </li>`).join('')}
      </ul>`;
  }

  function djNeighborsHTML(bpm) {
    const styles = djStyles();
    const near = styles
      .map((item) => ({ item, diff: item.model.bpm - bpm }))
      .filter((row) => Math.abs(row.diff) <= 5)
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
    const half = styles
      .map((item) => ({ item, diff: item.model.bpm - bpm }))
      .filter((row) => Math.abs(row.item.model.bpm * 2 - bpm) <= 5 || Math.abs(bpm * 2 - row.item.model.bpm) <= 5);

    const chip = (row) => `<button class="dj-nb-chip" type="button" data-nb="${row.item.id}">
      ${escapeHtml(row.item.entry.name)}<i>${row.item.model.bpm}${row.item.model.groove.id === 'floor' ? '' : ` · ${row.item.model.grooveName}`}</i>
    </button>`;

    return `
      <div class="dj-nb-row">
        <span>±5 BPM</span>
        <div>${near.length ? near.map(chip).join('') : '<span style="font-size:12px;color:var(--muted-2)">这个速度附近没有收录的风格</span>'}</div>
      </div>
      <div class="dj-nb-row">
        <span>半速 / 双速</span>
        <div>${half.length ? half.map(chip).join('') : '<span style="font-size:12px;color:var(--muted-2)">没有正好差一倍的风格</span>'}</div>
      </div>`;
  }

  function bindDjNeighborChips() {
    document.querySelectorAll('[data-nb]').forEach((button) => {
      button.addEventListener('click', () => {
        // 邻接表回答的是「下一步放什么」，所以点一下就把 B 换成它并重新判断，
        // 而不是只把数字填进输入框。
        const target = button.dataset.nb;
        const select = document.getElementById('djB');
        if (select) {
          select.value = target;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
  }

  function bindDjLinks() {
    // 链接是真实路由，交给浏览器即可；这里只保留钩子，便于以后加埋点。
  }

  /* -------------------------------------------- 例曲试听（Apple 30 秒预览）

     站点不托管任何音频。能播的只有 Apple Music 的官方 30 秒预览：
     iTunes Search API 不支持 CORS，所以用 JSONP；拿不到就退回到搜索链接。
     找不到预览是常态（地下/白标发行不进 Apple 曲库），所以按钮必须有第二条路。
     ------------------------------------------------------------------------ */

  let exampleAudio = null;
  let examplePreviewSeq = 0;
  const previewCache = new Map();

  /* 例曲数据是手工整理的，作者把编辑备注直接写进了字段：
     `Sutra [1:06起始]`、`Closer【专辑：As Is】`、`早期——Acceleration`、
     `(偏Eurodance/Italodance) Oh Le Le`。

     清理分两档，因为「显示」和「搜索」的要求相反：
     - 显示要**保守**：`Rain Falls (David's 12" Soakin Wet Mix)` 里的版本说明
       是有用信息，砍掉反而丢失「这是哪个 mix」。
     - 搜索要**激进**：Apple 曲库存的是 `Rain Falls`，带后缀必然搜不到。

     所以：cleanExampleText 给眼睛看，cleanForSearch 给 API 用。 */

  // 显示用：只剥掉一眼可知不是曲名的东西
  function cleanExampleText(value) {
    const s = String(value || '')
      .replace(/[\u3010][^\u3011]*[\u3011]/g, ' ')       // 【专辑：xxx】
      .replace(/\[[^\]]*\]/g, ' ')                        // [1:06起始] / [Nightstep Edit]
      .replace(/^[^\u2014]*\u2014\u2014/, '')             // 「早期——Acceleration」批注在**前面**
      .replace(/^[\s\uFF08(][^\uFF09)]*[\uFF09)]\s*/, '') // 开头的（偏Eurodance）整段
      .replace(/\s*\d{1,2}:\d{2}\s*/g, ' ')               // 裸时间码
      .replace(/[\u2122\u00AE]/g, '')                     // ™ / ®
      .replace(/\s+/g, ' ')
      .trim();
    return s || String(value || '').trim(); // 整条都是批注时保留原文，不要显示成空白
  }

  // 搜索用：在显示版基础上，再去掉括号版本说明（含 feat.）
  function cleanForSearch(value) {
    const s = String(value || '')
      .replace(/[\u3010][^\u3011]*[\u3011]/g, ' ')
      .replace(/[\uFF08(][^\uFF09)]*[\uFF09)]/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/^[^\u2014]*\u2014\u2014/, '')
      .replace(/\s*\d{1,2}:\d{2}\s*/g, ' ')
      .replace(/[\u2122\u00AE]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s || String(value || '').trim();
  }

  /* 生成查询候选词，按「最可能命中」排序。
     Apple 曲库对全串匹配很挑：版本后缀、批注、甚至多个 feat. 都会让它返回空。
     所以逐级放宽：
       1. 清理后的「艺人 + 曲名」   最精确
       2. 清理后的「曲名」单独搜     艺人写法差异大，反而是噪声
       3. 原始串                     清理可能误伤，留一条退路 */
  function previewCandidates(artist, title) {
    const ct = cleanForSearch(title);
    const ca = cleanForSearch(artist);
    const out = [];
    const push = (v) => {
      const s = String(v || '').trim();
      if (s && !out.includes(s)) out.push(s);
    };
    push([ca, ct].filter(Boolean).join(' '));
    push(ct);
    push([artist, title].filter(Boolean).join(' ').trim());
    return out;
  }

  function exampleActions(example) {
    const cands = previewCandidates(example.artist, example.title);
    const term = cands[0] || example.title || '';
    const alt = cands.slice(1).join('\u0001');
    const query = encodeURIComponent([example.artist, example.title].filter(Boolean).join(' ').trim() || example.title);
    const original = example.url
      ? `<a class="example-link" href="${escapeHtml(example.url)}" target="_blank" rel="noopener noreferrer">原始链接 ↗</a>`
      : '';
    return `
      <div class="example-actions">
        <button class="example-preview" type="button" data-preview="${escapeHtml(term)}"${alt ? ` data-preview-alt="${escapeHtml(alt)}"` : ''}>试听 30 秒</button>
        <a class="example-link" href="https://search.bilibili.com/all?keyword=${query}" target="_blank" rel="noopener noreferrer">B 站 ↗</a>
        <a class="example-link" href="https://music.163.com/#/search/m/?s=${query}" target="_blank" rel="noopener noreferrer">网易云 ↗</a>
        ${original}
      </div>`;
  }

  function stopExamplePreview() {
    if (exampleAudio) {
      exampleAudio.pause();
      exampleAudio = null;
    }
    document.querySelectorAll('.example-preview.is-playing').forEach((button) => {
      button.classList.remove('is-playing');
      button.textContent = '试听 30 秒';
    });
    document.querySelectorAll('.example-feedback').forEach((node) => { node.hidden = true; });
  }

  function searchItunesPreview(term) {
    return new Promise((resolve) => {
      const name = `__emItunes${(examplePreviewSeq += 1)}`;
      const script = document.createElement('script');
      const timer = window.setTimeout(() => {
        cleanup();
        resolve(null);
      }, 8000);
      function cleanup() {
        window.clearTimeout(timer);
        try { delete window[name]; } catch { window[name] = undefined; }
        script.remove();
      }
      window[name] = (data) => {
        cleanup();
        const hit = data && Array.isArray(data.results) ? data.results[0] : null;
        resolve(hit && hit.previewUrl
          ? { previewUrl: hit.previewUrl, trackName: hit.trackName, artistName: hit.artistName }
          : null);
      };
      script.onerror = () => {
        cleanup();
        resolve(null);
      };
      script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1&callback=${name}`;
      document.head.appendChild(script);
    });
  }

  /* 一条例曲常常带 remix 后缀或编辑批注：「Rain Falls (David's 12" Soakin Wet Mix)」。
     Apple 曲库里存的是「Rain Falls」，拿全名去搜必然落空 ——
     不代表这首不在库里。所以按「先精确、再宽松」的顺序试几轮。
     候选词由 previewCandidates() 生成，用 \u0001 拼在 data-preview-alt 里。 */
  function previewTermsFor(button) {
    const primary = (button.dataset.preview || '').trim();
    const rest = (button.dataset.previewAlt || '').split('\u0001').map((s) => s.trim());
    return [...new Set([primary, ...rest].filter(Boolean))];
  }

  async function resolvePreview(terms) {
    for (const term of terms) {
      if (previewCache.has(term)) {
        const hit = previewCache.get(term);
        if (hit && hit.previewUrl) return hit;
        continue; // 上次没搜到，换下一个候选词
      }
      const payload = await searchItunesPreview(term);
      previewCache.set(term, payload);
      if (payload && payload.previewUrl) return payload;
    }
    return null;
  }

  /* 播放一条例曲。
     返回 'playing' | 'no-preview' | 'blocked' | 'stopped'，
     调用方（尤其是自动播放）据此决定「换下一首」还是「到此为止」：
     没预览可以换歌，被浏览器拦下换多少首都一样。 */
  async function playExamplePreview(button, options = {}) {
    const terms = previewTermsFor(button);
    if (!terms.length) return 'no-preview';
    if (button.classList.contains('is-playing')) {
      stopExamplePreview();
      return 'stopped';
    }
    const item = button.closest('.example-item, .lc-example-item, .tree-example-item');
    const feedback = item ? item.querySelector('.example-feedback') : null;
    stopExamplePreview();
    // 合成骨架和原曲预览不能同时响：一次只让一个出声，
    // 否则用户点「播放 8 秒」时会听到两段不相关的音乐叠在一起。
    if (Audio?.getState()?.playing) Audio.stop();

    const silent = Boolean(options.silent);

    button.classList.add('is-loading');
    button.textContent = '查询中…';
    const payload = await resolvePreview(terms);
    button.classList.remove('is-loading');

    // 查询要走几秒，期间用户可能切了节点、翻了页 —— 那些动作都会重建 DOM。
    // 按钮已经不在文档里就到此为止：否则声音响起来，界面上却没有能停它的按钮。
    if (!button.isConnected) return 'stopped';

    if (!payload || !payload.previewUrl) {
      if (silent) {
        // 自动播放拿不到预览是常态（地下发行不进 Apple 曲库），
        // 静默退回按钮状态，不弹错误打扰刚进页面的人。
        button.textContent = '试听 30 秒';
        return 'no-preview';
      }
      button.textContent = '没有预览';
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = 'Apple 曲库里没有这一条。用右边的 B 站 / 网易云搜同名曲。';
      }
      window.setTimeout(() => { button.textContent = '试听 30 秒'; }, 2600);
      return 'no-preview';
    }

    exampleAudio = new window.Audio(payload.previewUrl); // 站点自己的 Audio 是 EMAudio，这里必须用 window.Audio
    const audio = exampleAudio;
    audio.volume = 0.85;
    try {
      await audio.play();
    } catch {
      // 自动播放被浏览器的播放策略拦下时，不报错 —— 用户没做任何操作，
      // 弹一句「播放失败」只会让人困惑。手动点击时照常提示。
      button.textContent = silent ? '试听 30 秒' : '播放失败';
      if (feedback && !silent) {
        feedback.hidden = false;
        feedback.textContent = '浏览器拦下了这次播放，再点一次试试。';
      }
      if (exampleAudio === audio) exampleAudio = null;
      return 'blocked';
    }
    // play() 等待期间音频可能已被 stopExamplePreview()/树播放换成别的实例，
    // 只有自己还是「当前那一个」才挂 ended 事件，避免对 null 或别的实例操作。
    if (exampleAudio !== audio) return 'stopped';
    button.classList.add('is-playing');
    button.textContent = '停止';
    if (feedback) {
      feedback.hidden = false;
      feedback.textContent = `正在试听：${payload.trackName} — ${payload.artistName}（30 秒官方预览）`;
    }
    audio.addEventListener('ended', stopExamplePreview, { once: true });
    return 'playing';
  }

  /* ---- 例曲自动播放 ----------------------------------------------------
     用户的诉求是「进入一个风格就直接听到例曲」。浏览器的播放策略要求
     先有用户交互，但站内点卡片跳转本身就是一次点击，所以进入页面后
     紧接着 play() 通常是被允许的。被拦时不报错，静默留下按钮。
     -------------------------------------------------------------------- */

  const LISTEN_AUTOPLAY_KEY = 'em.listen.autoplay';

  function listenAutoplayOn() {
    try {
      const saved = window.localStorage.getItem(LISTEN_AUTOPLAY_KEY);
      return saved === null ? true : saved === '1';
    } catch {
      return true; // 隐私模式下 localStorage 会抛错，按默认开处理
    }
  }

  function setListenAutoplay(on) {
    try { window.localStorage.setItem(LISTEN_AUTOPLAY_KEY, on ? '1' : '0'); } catch { /* 忽略 */ }
  }

  /* 自动播放：依次试这一页的例曲，第一首能播的就播。
     搜不到预览就换下一首；被浏览器拦下就停手（换多少首都一样会被拦）。 */
  async function autoplayFirstExample() {
    const buttons = [...document.querySelectorAll('.lc-examples .example-preview')];
    for (const button of buttons) {
      const state = await playExamplePreview(button, { silent: true });
      if (state === 'playing' || state === 'blocked' || state === 'stopped') return state;
    }
    return 'no-preview';
  }

  function bindExamplePreviews() {
    document.querySelectorAll('[data-preview]').forEach((button) => {
      button.addEventListener('click', () => playExamplePreview(button));
    });
  }

  /* ---------------------------------------------------- 自动接歌台 */

  let automixPoll = null;
  const AUTOMIX_API_BASE = (() => {
    try {
      const base = document.baseURI.replace(/[#?].*$/, '');
      return new URL('api', base).pathname.replace(/\/$/, '');
    } catch {
      return '/api';
    }
  })();

  const AUTOMIX_PRESETS = [
    { id: 'melodic-techno', label: 'Melodic Techno', meta: '118–126' },
    { id: 'tech-house', label: 'Tech House', meta: '122–128' },
    { id: 'progressive-house', label: 'Progressive', meta: '120–132' },
    { id: 'deep-house', label: 'Deep House', meta: '110–124' },
    { id: 'peak-time', label: 'Peak Time', meta: '124–132' },
    { id: 'sunrise', label: 'Sunrise', meta: '118–126' },
  ];

  const AUTOMIX_TYPES = {
    long_blend: { label: '长混音', short: 'BLEND' },
    bass_swap: { label: '低频交换', short: 'BASS' },
    filter_out: { label: '滤波退出', short: 'FILTER' },
    cut: { label: '硬切', short: 'CUT' },
    double_drop: { label: '双 Drop', short: 'DROP' },
  };

  const AUTOMIX_STEMS = [
    ['vocals', '人声'],
    ['drums', '鼓'],
    ['bass', '低频'],
    ['other', '其他'],
  ];

  function automixDemo() {
    const demo = window.DJ_AUTOMIX_DEMO;
    return demo && demo.plan ? demo : null;
  }

  function automixRiskClass(risk) {
    if (risk >= 0.55) return 'is-bad';
    if (risk >= 0.3) return 'is-warn';
    return 'is-good';
  }

  function automixType(type) {
    return AUTOMIX_TYPES[type] || { label: type, short: String(type).toUpperCase() };
  }

  function automixTransitionHTML(plan, index, state) {
    const transition = plan.transitions[index];
    if (!transition) return '';
    const type = automixType(transition.type);
    const active = state.selectedType === 'transition' && state.selectedIndex === index;
    const risk = Math.round((transition.risk || 0) * 100);
    return `<button class="dja-transition ${automixRiskClass(transition.risk)}${active ? ' is-active' : ''}" type="button" data-transition="${index}" aria-pressed="${active}" title="${escapeHtml(type.label)} · ${transition.phrase.overlapBars} 小节 · 风险 ${risk}%">
      <span class="dja-transition-arrow" aria-hidden="true">→</span>
      <strong>${escapeHtml(type.short)}</strong>
      <i class="dja-transition-dot" aria-hidden="true"></i>
    </button>`;
  }

  function automixSetlistHTML(plan, state) {
    return plan.entries.map((entry, index) => {
      const active = state.selectedType === 'entry' && state.selectedIndex === index;
      const changedTempo = Math.abs(entry.nativeBpm - entry.targetBpm) >= 0.5;
      const bpm = changedTempo
        ? `${entry.nativeBpm.toFixed(0)}→${entry.targetBpm.toFixed(0)}`
        : `${entry.targetBpm.toFixed(0)}`;
      const card = `<button class="dja-card${active ? ' is-active' : ''}" type="button" data-entry="${index}" aria-pressed="${active}" title="${escapeHtml(entry.title)} · ${bpm} BPM · ${escapeHtml(entry.camelot)}">
        <span class="dja-card-top">
          <span class="dja-card-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="dja-card-role">${escapeHtml(entry.role)}</span>
        </span>
        <strong>${escapeHtml(entry.title)}</strong>
        <span class="dja-card-meta">${bpm} BPM <i>·</i> ${escapeHtml(entry.camelot)}</span>
        <span class="dja-card-energy" aria-hidden="true"><i style="width:${Math.round(entry.energy * 100)}%"></i></span>
      </button>`;
      return card + automixTransitionHTML(plan, index, state);
    }).join('');
  }

  function automixCurvePoints(curve, maxBar) {
    return (curve || []).map((point) => {
      const x = Math.max(0, Math.min(100, (point.bar / Math.max(1, maxBar)) * 100));
      const gain = Math.max(-60, Math.min(0, Number(point.gainDb) || 0));
      const y = 32 - ((gain + 60) / 60) * 28;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function automixStemRowsHTML(transition) {
    const maxBar = transition.phrase.overlapBars || 1;
    return AUTOMIX_STEMS.map(([name, label]) => {
      const a = transition.stems?.[`a.${name}`] || [];
      const b = transition.stems?.[`b.${name}`] || [];
      if (!a.length && !b.length) return '';
      const isBass = name === 'bass';
      return `<div class="dja-stem${isBass && transition.type === 'double_drop' ? ' is-duck' : ''}">
        <div class="dja-stem-head"><span>${label}</span><span class="mono-label">A / B</span></div>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label="${label} 自动化曲线">
          <line x1="0" y1="18" x2="100" y2="18" class="dja-stem-base"></line>
          ${a.length ? `<polyline points="${automixCurvePoints(a, maxBar)}" class="is-a" vector-effect="non-scaling-stroke"></polyline>` : ''}
          ${b.length ? `<polyline points="${automixCurvePoints(b, maxBar)}" class="is-b" vector-effect="non-scaling-stroke"></polyline>` : ''}
        </svg>
      </div>`;
    }).join('');
  }

  function automixFormatTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function automixPlanSource(plan) {
    if (!plan || !plan.entries?.length) return null;
    return plan.entries.every((entry) => String(entry.trackId || '').startsWith('rb-'))
      ? 'rekordbox'
      : 'demo';
  }

  function automixUpdateSourceChip(state) {
    const chip = document.getElementById('djaSetSource');
    if (!chip) return;
    const planSource = automixPlanSource(state.plan);
    if (!planSource) {
      chip.textContent = '未生成';
      chip.dataset.state = 'none';
      chip.classList.remove('is-stale');
      return;
    }
    const stale = state.source !== planSource;
    chip.textContent = `${planSource === 'rekordbox' ? 'Rekordbox' : '示例曲'}${stale ? ' · 待重新生成' : ''}`;
    chip.dataset.state = planSource;
    chip.classList.toggle('is-stale', stale);
  }

  function automixUpdateTime(state) {
    const audio = document.getElementById('djaAudio');
    const element = document.getElementById('djaAudioTime');
    if (!element) return;
    const duration = audio?.duration || state.result?.durationSec || state.plan?.totals?.durationSec || 0;
    const current = audio?.currentTime || 0;
    element.textContent = `${automixFormatTime(current)} / ${automixFormatTime(duration)}`;
  }

  function automixGenerateLabel() {
    const active = document.querySelector('[data-source].is-active');
    return active?.dataset.source === 'rekordbox' ? '从 Rekordbox 生成' : '生成接歌';
  }

  function automixDetailHTML(plan, state) {
    if (!plan) {
      const action = state.source === 'rekordbox' ? '从 Rekordbox 生成' : '生成示例 set';
      return `<div class="dja-empty">
        <span class="mono-label">NO SET / 还没有 set</span>
        <h2>先跑一遍，再决定接法。</h2>
        <p>左侧选来源和风格，点「生成接歌」。示例曲不需要 Rekordbox。</p>
        <button class="button-primary" id="djaEmptyGenerate" type="button">${action}</button>
      </div>`;
    }
    if (state.selectedType === 'entry') {
      const entry = plan.entries[state.selectedIndex];
      if (!entry) return '';
      return `<div class="dja-detail-head">
        <div class="dja-detail-kicker">
          <span class="mono-label">TRACK ${String(entry.position).padStart(2, '0')} / ${escapeHtml(entry.role)}</span>
          <span class="dja-risk is-good">${escapeHtml(entry.camelot)}</span>
        </div>
        <h2>${escapeHtml(entry.title)}</h2>
      </div>
      <div class="dja-detail-stats">
        <div><span>原生 BPM</span><strong>${entry.nativeBpm.toFixed(1)}</strong></div>
        <div><span>播放 BPM</span><strong>${entry.targetBpm.toFixed(1)}</strong></div>
        <div><span>能量</span><strong>${Math.round(entry.energy * 100)}%</strong></div>
        <div><span>小节</span><strong>${entry.playFromBar}–${entry.playToBar}</strong></div>
      </div>
      <p class="dja-hint">点上面的过渡节点，看这一首怎么接下一首。</p>
      ${automixRekordboxExportHTML(plan, state)}`;
    }
    const transition = plan.transitions[state.selectedIndex];
    if (!transition) return '';
    const from = plan.entries[transition.fromPosition - 1];
    const to = plan.entries[transition.toPosition - 1];
    const type = automixType(transition.type);
    const rendered = state.result?.transitions?.[state.selectedIndex];
    const drop = transition.dropLock;
    const risk = transition.risk || 0;
    const correlation = rendered?.phaseCorrelation;
    const totalDuration = state.result?.durationSec || plan.totals.durationSec || 0;
    return `<div class="dja-detail-head">
      <div class="dja-detail-kicker">
        <span class="mono-label">TRANSITION ${String(state.selectedIndex + 1).padStart(2, '0')} / ${escapeHtml(type.label)}</span>
        <span class="dja-risk ${automixRiskClass(risk)}">风险 ${Math.round(risk * 100)}%</span>
      </div>
      <h2>${escapeHtml(from?.title || 'A')} <span class="dja-arrow">→</span> ${escapeHtml(to?.title || 'B')}</h2>
    </div>
    <div class="dja-detail-stats">
      <div><span>重叠</span><strong>${transition.phrase.overlapBars} 小节</strong></div>
      <div><span>BPM</span><strong>${transition.tempo.fromBpm.toFixed(0)} → ${transition.tempo.toBpm.toFixed(0)}</strong></div>
      <div><span>调性</span><strong>${escapeHtml(from?.camelot || '')} → ${escapeHtml(to?.camelot || '')}</strong></div>
      <div><span>占低频</span><strong>${transition.bassOwner ? transition.bassOwner.toUpperCase() : '—'}</strong></div>
    </div>
    ${drop ? `<p class="dja-drop-lock"><span class="mono-label">DROP LOCK</span> A ${drop.aDropBar} / B ${drop.bDropBar} · ${drop.buildBars} 小节 build</p>` : ''}
    <div class="dja-wave-head">
      <span class="mono-label">整场波形 <i>· 点击定位</i></span>
      <span class="dja-wave-time" id="djaAudioTime">0:00 / ${automixFormatTime(totalDuration)}</span>
    </div>
    <div class="dja-wave-wrap" id="djaWaveWrap" role="slider" tabindex="0" aria-label="整场波形，点击或左右方向键定位">
      <canvas id="djaWave" aria-label="整场波形与过渡位置"></canvas>
      <div class="dja-playhead" id="djaPlayhead" hidden></div>
    </div>
    <div class="dja-actions">
      <button class="button-primary" id="djaPlayTransition" type="button"${rendered ? '' : ' disabled'}>播放过渡</button>
      <button class="dja-secondary" id="djaPlayMix" type="button"${state.audioUrl ? '' : ' disabled'}>从头播放</button>
      <span class="dja-action-note">${rendered ? `${automixFormatTime(rendered.startSec)}–${automixFormatTime(rendered.endSec)}${correlation != null ? ` · 相位 ${correlation.toFixed(2)}` : ''}` : '尚未渲染音频'}</span>
    </div>
    <section class="dja-section">
      <div class="dja-section-head">
        <span class="mono-label">AUTOMATION / 分轨</span>
        <span class="dja-section-meta">A 橙 · B 青</span>
      </div>
      <div class="dja-stems">${automixStemRowsHTML(transition)}</div>
    </section>
    <section class="dja-section dja-why">
      <div class="dja-section-head"><span class="mono-label">WHY / 判定理由</span></div>
      <ul>${(transition.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
    </section>
    ${automixRekordboxExportHTML(plan, state)}`;
  }

  function automixDrawWave(plan, state) {
    const canvas = document.getElementById('djaWave');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, canvas.clientWidth || 640);
    const height = 150;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fillRect(0, 0, width, height);

    const peaks = state.result?.waveform?.peaks;
    const duration = state.result?.durationSec || plan.totals.durationSec || 1;
    if (peaks && peaks.length) {
      ctx.fillStyle = 'rgba(244,240,231,0.42)';
      for (let x = 0; x < width; x += 1) {
        const index = Math.min(peaks.length - 1, Math.floor((x / width) * peaks.length));
        const [min, max] = peaks[index] || [0, 0];
        const y1 = height / 2 - max * height * 0.42;
        const y2 = height / 2 - min * height * 0.42;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    } else {
      ctx.strokeStyle = 'rgba(244,240,231,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    (state.result?.transitions || []).forEach((transition, index) => {
      const x0 = (transition.startSec / duration) * width;
      const x1 = (transition.endSec / duration) * width;
      ctx.fillStyle = index === state.selectedIndex && state.selectedType === 'transition'
        ? 'rgba(255,176,0,0.20)'
        : 'rgba(255,176,0,0.07)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
      ctx.strokeStyle = 'rgba(255,176,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, height);
      ctx.stroke();
    });

    (state.result?.transitions || []).forEach((transition) => {
      const planTransition = plan.transitions[transition.index];
      if (!planTransition || planTransition.type !== 'double_drop') return;
      const barSeconds = (4 * 60) / (planTransition.tempo?.toBpm || plan.totals.avgBpm || 125);
      const offset = (planTransition.phrase.overlapBars - planTransition.phrase.bars) * barSeconds;
      const x = ((transition.startSec + offset) / duration) * width;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ff2e63';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff2e63';
      ctx.font = '10px "Cascadia Mono", monospace';
      ctx.fillText('DROP', x + 4, 12);
    });

    ctx.strokeStyle = 'rgba(244,240,231,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  function automixUpdateAudio(state) {
    const audio = document.getElementById('djaAudio');
    if (!audio) return;
    if (!state.audioUrl) {
      audio.hidden = true;
      audio.removeAttribute('src');
      delete audio.dataset.src;
      return;
    }
    if (audio.dataset.src !== state.audioUrl) {
      audio.src = state.audioUrl;
      audio.dataset.src = state.audioUrl;
    }
    audio.hidden = false;
  }

  function automixRenderAll(state) {
    const set = document.getElementById('djaSet');
    const detail = document.getElementById('djaDetail');
    const total = document.getElementById('djaTotal');
    if (!set || !detail) return;

    if (!state.plan) {
      set.innerHTML = '';
      detail.innerHTML = automixDetailHTML(null, state);
      if (total) total.textContent = 'NO SET';
      automixUpdateSourceChip(state);
      automixUpdateTime(state);
      document.getElementById('djaEmptyGenerate')?.addEventListener('click', () => {
        document.getElementById('djaGenerate')?.click();
      });
      return;
    }

    set.innerHTML = automixSetlistHTML(state.plan, state);
    if (total) {
      const plan = state.plan;
      total.innerHTML = `<strong>${plan.entries.length} 首 · ${(plan.totals.durationSec / 60).toFixed(1)} 分钟 · ${plan.totals.avgBpm.toFixed(1)} BPM</strong><span>${escapeHtml(plan.totals.keyPath.join(' → '))}</span>`;
    }
    automixUpdateSourceChip(state);

    set.querySelectorAll('[data-entry]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedType = 'entry';
        state.selectedIndex = Number(button.dataset.entry);
        automixRenderAll(state);
      });
    });
    set.querySelectorAll('[data-transition]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedType = 'transition';
        state.selectedIndex = Number(button.dataset.transition);
        automixRenderAll(state);
        if (window.matchMedia('(max-width: 900px)').matches) {
          requestAnimationFrame(() => document.getElementById('djaDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      });
    });

    detail.innerHTML = automixDetailHTML(state.plan, state);
    requestAnimationFrame(() => automixDrawWave(state.plan, state));
    automixUpdateTime(state);

    const audio = document.getElementById('djaAudio');
    const playTransition = document.getElementById('djaPlayTransition');
    const playMix = document.getElementById('djaPlayMix');
    if (playTransition) {
      playTransition.addEventListener('click', () => {
        const transition = state.result?.transitions?.[state.selectedIndex] || state.plan.transitions[state.selectedIndex]?.render;
        if (!audio || !transition) return;
        audio.currentTime = transition.startSec || 0;
        audio.play().catch(() => {});
      });
    }
    if (playMix) {
      playMix.addEventListener('click', () => {
        if (!audio) return;
        audio.currentTime = 0;
        audio.play().catch(() => {});
      });
    }

    const waveWrap = document.getElementById('djaWaveWrap');
    const seekToRatio = (ratio) => {
      if (!audio || !audio.src) return;
      const duration = audio.duration || state.result?.durationSec || state.plan?.totals?.durationSec || 0;
      if (!duration) return;
      audio.currentTime = Math.max(0, Math.min(duration - 0.05, duration * ratio));
      audio.play().catch(() => {});
    };
    waveWrap?.addEventListener('click', (event) => {
      const rect = waveWrap.getBoundingClientRect();
      seekToRatio(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
    });
    waveWrap?.addEventListener('keydown', (event) => {
      if (!audio || !audio.src || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const duration = audio.duration || state.result?.durationSec || 0;
      const delta = event.key === 'ArrowRight' ? 5 : -5;
      audio.currentTime = Math.max(0, Math.min(duration - 0.05, (audio.currentTime || 0) + delta));
    });

    const writeDb = document.getElementById('djaWriteDb');
    const exportXml = document.getElementById('djaExportXml');
    const exportNote = document.getElementById('djaExportNote');
    const playlistName = document.getElementById('djaPlaylistName');
    const runExport = async (mode) => {
      if (!state.plan) return;
      const name = (playlistName?.value || '').trim();
      if (!name) {
        if (exportNote) {
          exportNote.dataset.state = 'error';
          exportNote.textContent = '先填播放列表名。';
        }
        return;
      }
      if (mode === 'db' && !state.rekordbox?.writable) {
        if (exportNote) {
          exportNote.dataset.state = 'error';
          exportNote.textContent = 'Rekordbox 正在运行或未检测，不能写库。';
        }
        return;
      }
      if (mode === 'db' && !window.confirm(`将写入播放列表「${name}」，并自动备份 master.db。确认？`)) return;

      const actionButton = mode === 'db' ? writeDb : exportXml;
      const defaultLabel = mode === 'db' ? '写入播放列表' : '导出 XML';
      if (actionButton) {
        actionButton.disabled = true;
        actionButton.textContent = mode === 'db' ? '写入中…' : '导出中…';
      }
      try {
        const response = await fetch(`${AUTOMIX_API_BASE}/rekordbox/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setId: state.plan.id, name, mode, confirm: mode === 'db' }),
        });
        if (!response.ok) throw new Error(await response.text());
        const job = await response.json();
        if (exportNote) {
          exportNote.dataset.state = 'running';
          exportNote.textContent = mode === 'db' ? '写库任务已提交…' : 'XML 导出任务已提交…';
        }
        automixPollJob(job.id, (done) => {
          if (actionButton) {
            actionButton.disabled = mode === 'db' ? !state.rekordbox?.writable : false;
            actionButton.textContent = defaultLabel;
          }
          if (!exportNote) return;
          if (done.status !== 'done') {
            exportNote.dataset.state = 'error';
            exportNote.textContent = done.error || '导出失败';
            return;
          }
          const result = done.result || {};
          exportNote.dataset.state = 'ok';
          if (mode === 'db') {
            exportNote.innerHTML = `已写入播放列表 <b>#${escapeHtml(String(result.playlist?.playlistId || ''))}</b> · 备份 ${escapeHtml(result.playlist?.backupDir || '')}`;
          } else if (result.xmlUrl) {
            exportNote.innerHTML = `XML 已生成：<a href="${escapeHtml(result.xmlUrl)}" target="_blank" rel="noopener">下载 rekordbox.xml</a>`;
          } else {
            exportNote.textContent = '导出完成';
          }
        });
      } catch (error) {
        if (actionButton) {
          actionButton.disabled = mode === 'db' ? !state.rekordbox?.writable : false;
          actionButton.textContent = defaultLabel;
        }
        if (exportNote) {
          exportNote.dataset.state = 'error';
          exportNote.textContent = String(error);
        }
      }
    };
    writeDb?.addEventListener('click', () => runExport('db'));
    exportXml?.addEventListener('click', () => runExport('xml'));
    automixUpdateAudio(state);
  }

  function automixShowJob(job) {
    const element = document.getElementById('djaJob');
    if (!element) return;
    element.hidden = false;
    const running = !['done', 'failed', 'cancelled'].includes(job.status);
    const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
    const status = job.status === 'failed'
      ? '失败'
      : job.status === 'done'
        ? '完成'
        : job.status === 'cancelled'
          ? '已取消'
          : job.stage || '运行中';
    const planJob = ['demo', 'rekordbox-plan'].includes(job.kind);
    if (planJob) {
      document.querySelector('.dja-shell')?.classList.toggle('is-busy', running);
      const generate = document.getElementById('djaGenerate');
      if (generate) {
        const stageLabels = {
          analyze: '分析',
          plan: '排 set',
          render: '渲染',
          fixtures: '准备',
          'rekordbox scan': '扫描',
          starting: '启动',
        };
        if (running) {
          generate.disabled = true;
          generate.textContent = `${stageLabels[job.stage] || '处理'} ${progress}%`;
        } else if (job.status === 'done') {
          generate.disabled = false;
          generate.textContent = '已生成';
          setTimeout(() => {
            if (
              generate
              && document.getElementById('djaJob')?.getAttribute('aria-busy') !== 'true'
              && generate.textContent === '已生成'
            ) {
              generate.textContent = automixGenerateLabel();
            }
          }, 1600);
        } else {
          generate.disabled = false;
          generate.textContent = job.status === 'cancelled' ? automixGenerateLabel() : '重试生成';
        }
      }
    }
    element.setAttribute('aria-busy', running ? 'true' : 'false');
    element.innerHTML = `<div class="dja-job-head">
      <span class="mono-label">JOB / ${escapeHtml(job.kind || 'demo')}</span>
      <strong>${escapeHtml(status)}</strong>
      <span class="dja-job-pct">${progress}%</span>
      ${job.id && running ? `<button class="dja-job-cancel" type="button" data-cancel-job="${escapeHtml(job.id)}">取消</button>` : ''}
    </div>
    <div class="dja-progress"><i style="width:${progress}%"></i></div>
    ${job.error ? `<p class="dja-job-error">${escapeHtml(job.error)}</p>` : ''}
    ${(job.logs || []).length ? `<details class="dja-job-log"><summary>日志</summary><pre>${escapeHtml((job.logs || []).slice(-6).join('\n'))}</pre></details>` : ''}`;
    element.querySelector('[data-cancel-job]')?.addEventListener('click', () => automixCancelJob(job.id));
  }

  async function automixCancelJob(jobId) {
    try {
      await fetch(`${AUTOMIX_API_BASE}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    } catch (error) {
      automixShowJob({ kind: 'demo', status: 'failed', progress: 0, stage: '取消失败', error: String(error) });
    }
  }

  function automixPollJob(jobId, onDone) {
    if (automixPoll) clearInterval(automixPoll);
    const started = Date.now();
    const maxWaitMs = 30 * 60 * 1000;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      if (Date.now() - started > maxWaitMs) {
        clearInterval(automixPoll);
        automixPoll = null;
        automixShowJob({ kind: 'demo', status: 'failed', progress: 0, stage: '任务超时', error: '超过 30 分钟仍未完成；请查看本地引擎日志或降低分析曲目数。' });
        return;
      }
      busy = true;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${AUTOMIX_API_BASE}/jobs/${jobId}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error('job lost');
        const job = await response.json();
        automixShowJob(job);
        if (job.status === 'done') {
          clearInterval(automixPoll);
          automixPoll = null;
          onDone(job);
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(automixPoll);
          automixPoll = null;
          onDone(job);
        }
      } catch (error) {
        clearInterval(automixPoll);
        automixPoll = null;
        automixShowJob({ kind: 'demo', status: 'failed', progress: 0, stage: '连接中断', error: String(error) });
      } finally {
        busy = false;
      }
    };
    automixPoll = setInterval(tick, 1200);
    tick();
  }

  function automixUpdateControls(state) {
    const rb = state.rekordbox;
    document.querySelectorAll('[data-source]').forEach((button) => {
      const active = button.dataset.source === state.source;
      button.classList.toggle('is-active', active);
      if (button.dataset.source === 'rekordbox') {
        button.disabled = !(rb && rb.ok && rb.playableCount >= 2);
      }
    });
    const generate = document.getElementById('djaGenerate');
    const jobBusy = document.getElementById('djaJob')?.getAttribute('aria-busy') === 'true';
    if (generate && !jobBusy && generate.textContent !== '已生成') {
      generate.textContent = automixGenerateLabel();
    }
    const status = document.getElementById('djaRbStatus');
    if (status) {
      let stateName = 'checking';
      if (rb) stateName = !rb.ok ? 'error' : rb.writable ? 'ok' : 'readonly';
      status.dataset.state = stateName;
      if (!rb) status.textContent = '检测 Rekordbox…';
      else if (!rb.ok) status.textContent = `Rekordbox 未检测到${rb.error ? ` · ${rb.error}` : ''}`;
      else status.textContent = `${rb.playableCount} 首可排 · ${rb.playlistCount} 个播放列表 · ${rb.writable ? '已关闭（可写）' : '正在运行（只读）'}`;
    }
    const note = document.getElementById('djaNote');
    if (note) {
      if (state.source === 'rekordbox' && rb?.ok) {
        note.textContent = 'Rekordbox 曲库已连接。生成只读分析，不会自动写库；导出需要点按钮并确认。';
      } else if (state.source === 'rekordbox') {
        note.textContent = rb?.error
          ? `Rekordbox 不可用：${rb.error}`
          : 'Rekordbox 不可用；切回示例曲，或检查 master.db 与本地引擎。';
      } else if (state.engine) {
        note.textContent = '本地引擎已连接。生成会分析 4 首示例曲、排 set 并渲染；首次运行需要下载 Demucs 模型。';
      } else if (state.engine === false) {
        note.textContent = '连不上本地 API。确认 start-api.bat 正在运行，并用 node scripts/serve.mjs 从 http://127.0.0.1:5501（或当前本地端口）打开；线上地址/旧静态服务器没有 /api 代理。';
      }
    }
    automixUpdateSourceChip(state);
  }

  function automixRekordboxExportHTML(plan, state) {
    const isRekordboxSet = plan.entries.length > 0
      && plan.entries.every((entry) => String(entry.trackId || '').startsWith('rb-'));
    if (!isRekordboxSet) return '';
    const writable = Boolean(state.rekordbox?.writable);
    const today = new Date().toISOString().slice(0, 10);
    return `<div class="dja-export">
      <div class="dja-export-head">
        <span class="mono-label">OUTPUT / REKORDBOX</span>
        <span class="dja-export-state" data-state="${writable ? 'ok' : 'readonly'}">${writable ? '可写：Rekordbox 已关闭' : '只读：Rekordbox 运行中或未检测'}</span>
      </div>
      <div class="dja-export-row">
        <input id="djaPlaylistName" type="text" value="djcore ${today}" aria-label="播放列表名">
        <button class="button-primary" id="djaWriteDb" type="button"${writable ? '' : ' disabled title="Rekordbox 正在运行；关闭后再试"'}>写入播放列表</button>
        <button class="dja-secondary" id="djaExportXml" type="button">导出 XML</button>
      </div>
      <p class="dja-export-note" id="djaExportNote" data-state="info">写库前自动备份 master.db；Rekordbox 必须关闭。XML 不改库，可在 Rekordbox 手动导入。</p>
    </div>`;
  }

  function renderDjAutomix() {
    const demo = automixDemo();
    const state = {
      plan: demo?.plan || null,
      result: demo?.result || null,
      selectedType: 'transition',
      selectedIndex: 0,
      preset: 'melodic-techno',
      engine: null,
      source: 'demo',
      rekordbox: null,
      audioUrl: demo?.audio?.mix || null,
    };

    main.innerHTML = `
      ${pageHead({
        code: 'DJ',
        label: 'AUTOMIX LAB',
        title: '把两首歌接起来，<br><em>先让机器排一遍</em>。',
        lead: '选风格、排 set、规划过渡，再用 Demucs 分轨渲染。停止播放、低频让位、双 drop 对齐，每一条判断都能展开看原因。',
        stats: [
          { label: '过渡类型', value: '5' },
          { label: '来源', value: '2' },
        ],
        action: { href: '#/dj', label: '先看过渡检查' },
      })}
      <section class="dja-shell">
        <aside class="dja-controls">
          <div class="dja-control-head">
            <span class="mono-label">STYLE / 选风格</span>
            <div class="dja-engine-wrap">
              <span class="dja-engine" id="djaEngine">检测本地引擎…</span>
              <button class="dja-reconnect" id="djaReconnect" type="button" title="重新检测本地 API">重试</button>
            </div>
          </div>
          <div class="dja-source">
            <span class="mono-label">SOURCE / 曲库</span>
            <div class="dja-source-buttons" id="djaSource">
              <button class="dja-source-btn is-active" type="button" data-source="demo">示例曲</button>
              <button class="dja-source-btn" type="button" data-source="rekordbox" disabled>Rekordbox</button>
            </div>
            <p class="dja-rb-status" id="djaRbStatus">检测 Rekordbox…</p>
          </div>
          <div class="dja-presets" id="djaPresets">
            ${AUTOMIX_PRESETS.map((preset) => `<button class="dja-preset${preset.id === 'melodic-techno' ? ' is-active' : ''}" type="button" data-preset="${preset.id}"><strong>${preset.label}</strong><small>${preset.meta} BPM</small></button>`).join('')}
          </div>
          <label class="dja-field">
            <span class="mono-label">PROMPT / 一句话</span>
            <input id="djaPrompt" type="text" placeholder="日出时段的 melodic techno，少一点人声" autocomplete="off">
          </label>
          <div class="dja-run">
            <div class="dja-run-top">
              <label class="dja-field">
                <span class="mono-label">DURATION</span>
                <select id="djaDuration">
                  <option value="6">6 分钟</option>
                  <option value="8" selected>8 分钟</option>
                  <option value="10">10 分钟</option>
                  <option value="12">12 分钟</option>
                </select>
              </label>
              <span class="dja-run-note">目标时长</span>
            </div>
            <button class="button-primary dja-generate" id="djaGenerate" type="button" disabled>生成接歌</button>
            <p class="dja-note" id="djaNote">正在检测本地引擎…</p>
          </div>
        </aside>
        <div class="dja-main">
          <div class="dja-job" id="djaJob" aria-live="polite" hidden></div>
          <div class="dja-set-head">
            <div class="dja-set-title">
              <span class="mono-label">SET / 顺序与过渡</span>
              <span class="dja-set-source" id="djaSetSource" data-state="none">未生成</span>
            </div>
            <span class="dja-total" id="djaTotal">NO SET</span>
          </div>
          <div class="dja-set" id="djaSet"></div>
          <div class="dja-detail" id="djaDetail"></div>
        </div>
      </section>
      <audio class="dja-audio" id="djaAudio" controls preload="metadata" hidden></audio>`;

    automixRenderAll(state);
    document.querySelectorAll('[data-source]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        state.source = button.dataset.source;
        automixUpdateControls(state);
        if (!state.plan) automixRenderAll(state);
      });
    });
    automixUpdateControls(state);

    document.getElementById('djaReconnect')?.addEventListener('click', () => {
      window.location.reload();
    });

    const audio = document.getElementById('djaAudio');
    audio?.addEventListener('timeupdate', () => {
      const playhead = document.getElementById('djaPlayhead');
      const duration = audio.duration || state.result?.durationSec || 1;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (playhead) {
        playhead.hidden = false;
        playhead.style.left = `${Math.min(100, (audio.currentTime / duration) * 100)}%`;
      }
      automixUpdateTime(state);
    });
    audio?.addEventListener('loadedmetadata', () => automixUpdateTime(state));
    audio?.addEventListener('durationchange', () => automixUpdateTime(state));

    document.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        state.preset = button.dataset.preset;
        document.querySelectorAll('[data-preset]').forEach((item) => item.classList.toggle('is-active', item === button));
      });
    });

    document.getElementById('djaGenerate')?.addEventListener('click', async () => {
      const button = document.getElementById('djaGenerate');
      if (!state.engine) return;
      button.disabled = true;
      const rekordboxSource = state.source === 'rekordbox';
      const payload = {
        preset: state.preset,
        prompt: document.getElementById('djaPrompt').value.trim(),
        durationMin: Number(document.getElementById('djaDuration').value),
        stems: true,
      };
      try {
        const response = await fetch(rekordboxSource ? `${AUTOMIX_API_BASE}/rekordbox/plan` : `${AUTOMIX_API_BASE}/demo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(await response.text());
        const job = await response.json();
        automixShowJob(job);
        automixPollJob(job.id, async (done) => {
          const setId = done.result?.setId;
          if (done.status !== 'done' || !setId) {
            button.disabled = false;
            return;
          }
          const setResponse = await fetch(`${AUTOMIX_API_BASE}/sets/${setId}`);
          const data = await setResponse.json();
          state.plan = data.plan;
          state.result = data.result;
          state.selectedType = 'transition';
          state.selectedIndex = 0;
          state.audioUrl = data.result?.outputs?.mixMp3
            ? `${AUTOMIX_API_BASE}/files/${data.result.outputs.mixMp3}`
            : data.result?.outputs?.mixWav
              ? `${AUTOMIX_API_BASE}/files/${data.result.outputs.mixWav}`
              : null;
          automixRenderAll(state);
          button.disabled = false;
        });
      } catch (error) {
        automixShowJob({ kind: 'demo', status: 'failed', progress: 0, stage: '启动失败', error: String(error) });
        button.disabled = false;
      }
    });

    (async () => {
      const badge = document.getElementById('djaEngine');
      const button = document.getElementById('djaGenerate');
      const note = document.getElementById('djaNote');
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${AUTOMIX_API_BASE}/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`health ${response.status}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('api-html');
        const health = await response.json();
        if (!health || !health.capabilities) throw new Error('not djcore');
        state.engine = true;
        badge.textContent = `本地引擎 · ${health.capabilities?.device || 'cpu'}`;
        badge.classList.add('is-on');
        button.disabled = false;
        note.textContent = '本地引擎已连接。生成会分析 4 首示例曲、排 set 并渲染；首次运行需要下载 Demucs 模型。';
        automixUpdateControls(state);
      } catch {
        state.engine = false;
        badge.textContent = demo ? '演示数据 · 本地引擎未连接' : '本地引擎未连接';
        badge.classList.add('is-off');
        button.disabled = true;
        note.textContent = '连不上本地 API。确认 start-api.bat 正在运行，并用 node scripts/serve.mjs 从 http://127.0.0.1:5501（或当前本地端口）打开；线上地址/旧静态服务器没有 /api 代理。';
        automixUpdateControls(state);
      }
    })();

    (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${AUTOMIX_API_BASE}/rekordbox/status`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`rekordbox ${response.status}`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('api-html');
        state.rekordbox = await response.json();
      } catch (error) {
        const raw = String(error);
        const friendly = raw.includes('api-html') || raw.includes('Unexpected token')
          ? '本地 API 未连接（/api 返回了网页）'
          : raw.includes('rekordbox 404')
            ? '本地 API 未连接（旧站点服务器没有 /api 代理）'
            : raw.includes('Failed to fetch')
              ? '连不上本地 API（127.0.0.1:5601）'
              : raw;
        state.rekordbox = { ok: false, error: friendly };
      }
      automixUpdateControls(state);
    })();
  }

  /* ------------------------------------------------------ 现场速查（离线） */

  let quickKeyHandler = null;

  function renderQuick(route) {
    const styles = listenStyles();
    const target = route.params.get('s');
    const startIndex = Math.max(0, styles.findIndex((item) => item.id === target));

    main.innerHTML = `
      <section class="quick">
        <div class="quick-bar">
          <span class="mono-label">QUICK / 现场速查</span>
          <span class="quick-offline" id="quickOffline" hidden>离线可用</span>
          <div class="quick-bar-actions">
            <button class="lf-chip" type="button" id="quickWake">保持常亮</button>
            <a class="lf-chip" href="#/tree">打开风格树</a>
          </div>
        </div>
        <div class="quick-deck" id="quickDeck">
          ${styles.map((item) => `
            <article class="quick-slide" data-slide="${item.id}">
              <div class="quick-slide-top">
                <span class="mono-label">${item.model.bandName} / ${item.model.bpm} BPM</span>
                <span class="mono-label">${escapeHtml(item.model.grooveName)}</span>
              </div>
              <h1 class="quick-name">${escapeHtml(item.entry.name)}</h1>
              <p class="quick-meta">${escapeHtml(item.model.zh)}</p>
              <p class="quick-line">${escapeHtml(item.model.oneLine)}</p>
              <ul class="quick-hear">
                ${[['鼓', item.model.hear[0]], ['低音', item.model.hear[1]], ['空间', item.model.hear[2]]].map((row) => `
                  <li><b>${row[0]}</b><span>${escapeHtml(row[1])}</span></li>`).join('')}
              </ul>
              <p class="quick-when">${escapeHtml(item.model.when)}</p>
              <div class="quick-actions">
                <button class="button-primary" type="button" data-quick-listen="${item.id}">播放 8 秒</button>
                <a class="button-ghost" href="#/genre/${item.id}">完整条目 →</a>
              </div>
            </article>`).join('')}
        </div>
        <p class="quick-foot"><span id="quickPos">1 / ${styles.length}</span> · 左右滑动或按 ← → 换风格 · 飞行模式下也能打开</p>
      </section>`;

    const deck = document.getElementById('quickDeck');
    const pos = document.getElementById('quickPos');
    const sync = () => {
      const width = deck.clientWidth || 1;
      const index = Math.round(deck.scrollLeft / width);
      if (pos) pos.textContent = `${Math.min(styles.length, index + 1)} / ${styles.length}`;
      const item = styles[index];
      if (item) replaceHash(`#/quick?s=${item.id}`);
    };
    deck?.addEventListener('scroll', () => {
      window.clearTimeout(renderQuick.timer);
      renderQuick.timer = window.setTimeout(sync, 120);
    }, { passive: true });

    if (startIndex > 0 && deck) {
      requestAnimationFrame(() => {
        deck.scrollLeft = deck.clientWidth * startIndex;
        if (pos) pos.textContent = `${startIndex + 1} / ${styles.length}`;
      });
    }

    document.querySelectorAll('[data-quick-listen]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = styles.find((style) => style.id === button.dataset.quickListen);
        if (!item) return;
        const state = Audio?.getState();
        if (state && state.playing && state.demoId === `fp:${item.model.fp}`) Audio.stop();
        else Audio?.playFingerprint(item.model.fp, { bpm: item.model.bpm, label: `${item.entry.name} · ${item.model.bpm} BPM` });
      });
    });

    const offline = document.getElementById('quickOffline');
    if (offline) offline.hidden = navigator.onLine !== false;

    const wake = document.getElementById('quickWake');
    let lock = null;
    wake?.addEventListener('click', async () => {
      if (lock) {
        try { await lock.release(); } catch { /* 已释放 */ }
        lock = null;
        wake.textContent = '保持常亮';
        wake.classList.remove('is-on');
        return;
      }
      try {
        lock = await navigator.wakeLock.request('screen');
        wake.textContent = '已常亮';
        wake.classList.add('is-on');
        lock.addEventListener('release', () => {
          lock = null;
          wake.textContent = '保持常亮';
          wake.classList.remove('is-on');
        });
      } catch {
        wake.textContent = '此浏览器不支持';
        wake.disabled = true;
      }
    });

    quickKeyHandler = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (!deck) return;
      event.preventDefault();
      const step = deck.clientWidth * (event.key === 'ArrowRight' ? 1 : -1);
      deck.scrollBy({ left: step, behavior: 'smooth' });
    };
    document.addEventListener('keydown', quickKeyHandler);
  }

  /* ------------------------------------------------------------ 单独卡片页 */

  function renderCardPage(route) {
    const id = route.path.split('/')[2] || '';
    const entry = entryById.get(id);
    const model = entry ? listenModel(entry, route.params.get('h') || '') : null;
    if (!model) {
      renderNotFound('这一条还没有听感卡。先去「听」里找一个有卡片的风格。');
      return;
    }
    main.innerHTML = `
      <section class="card-page">
        <div class="card-page-inner">
          <canvas id="cardPageCanvas" width="1080" height="1440" aria-label="${escapeHtml(model.name)} 风格卡"></canvas>
          <div class="card-page-actions">
            <button class="button-primary" type="button" data-card-play>播放 8 秒</button>
            <button class="button-ghost" type="button" data-card-download>下载 PNG</button>
            <a class="button-ghost" href="#/genre/${model.id}">完整条目 →</a>
          </div>
          <p class="card-page-note">手机上长按图片即可保存。<br>这一页是给「发链接」准备的：微信里打开就只有一张卡。</p>
        </div>
      </section>`;
    if (window.EMShare) window.EMShare.draw(document.getElementById('cardPageCanvas'), model);
    document.querySelector('[data-card-play]')?.addEventListener('click', () => {
      const state = Audio?.getState();
      if (state && state.playing && state.demoId === `fp:${model.fp}`) Audio.stop();
      else Audio?.playFingerprint(model.fp, { bpm: model.bpm, label: `${model.name} · ${model.bpm} BPM` });
    });
    document.querySelector('[data-card-download]')?.addEventListener('click', () => window.EMShare?.download(model));
  }


  function render() {
    const route = parseRoute();
    // Teardown must never block navigation: if a page module throws here the
    // hash already changed and the user is left on stale content with no way
    // forward except a refresh. Isolate it and keep routing.
    if (window.EMStudio) {
      try {
        window.EMStudio.unmount();
      } catch (error) {
        console.error('Studio unmount failed; continuing route change', error);
      }
    }
    if (quickKeyHandler) {
      document.removeEventListener('keydown', quickKeyHandler);
      quickKeyHandler = null;
    }
    if (automixPoll) {
      clearInterval(automixPoll);
      automixPoll = null;
    }
    // 树的键盘监听与进度轮询必须随路由卸载，否则切页后仍在响应按键。
    if (treeKeyHandler) {
      document.removeEventListener('keydown', treeKeyHandler);
      treeKeyHandler = null;
    }
    if (treeProgressTimer) {
      clearInterval(treeProgressTimer);
      treeProgressTimer = null;
    }
    // 断点监听挂在 matchMedia 上，不随 DOM 消失，必须显式摘掉。
    if (treeNarrowListener && treeNarrowQuery) {
      treeNarrowQuery.removeEventListener('change', treeNarrowListener);
      treeNarrowListener = null;
    }
    stopExamplePreview();
    hideTooltip();
    hideHeaderSearchPopover();
    closeMobileNav();
    renderHeader(route.path);
    renderFooter();
    toastStack?.replaceChildren();
    document.body.classList.remove('has-lesson-bar');
    document.body.classList.toggle('is-quick', route.path === '/quick');
    atlas = null;
    expandedTree = new Set(expandedTree);

    if (route.path === '/' || route.path === '') renderHome();
    else if (route.path === '/archive') renderArchive(route);
    // 矩阵页已下线：老链接（含发进群里的 ?s=g-xxx）重定向到风格树，
    // 而不是 404 —— 那些链接可能已经散落在聊天记录和收藏夹里。
    // replaceHash 走的是 history.replaceState，不会触发 hashchange，
    // 所以这里必须自己再 render 一次，否则页面停在上一屏、地址却已经变了。
    else if (route.path === '/listen') {
      replaceHash(listenRedirectTarget(route.params));
      render();
      return;
    }
    else if (route.path === '/start') renderStart();
    else if (route.path === '/dj/field-guide') renderDjFieldGuide();
    else if (route.path === '/dj/course') renderDjCourse(route);
    else if (route.path === '/dj/automix') renderDjAutomix(route);
    else if (route.path === '/dj') renderDj(route);
    else if (route.path === '/quick') renderQuick(route);
    else if (route.path.startsWith('/card/')) renderCardPage(route);
    else if (route.path === '/studio') renderStudio();
    else if (route.path === '/learn') renderLearn();
    else if (route.path.startsWith('/learn/')) renderLesson(route);
    else if (route.path === '/library') renderLibrary();
    else if (route.path === '/practice') renderPractice(route);
    else if (route.path === '/lab') renderLab();
    else if (route.path === '/search') renderSearch(route);
    else if (route.path.startsWith('/doc/')) renderDoc(route);
    else if (route.path === '/module') renderModule();
    else if (route.path === '/atlas') renderAtlas(route);
    else if (route.path === '/tree') renderTree(route);
    else if (route.path.startsWith('/family/')) renderFamily(route);
    else if (route.path.startsWith('/genre/')) renderGenre(route);
    else if (route.path === '/guide/listen') renderGuideListen();
    else if (route.path === '/guide/production') renderGuideProduction();
    else if (route.path === '/guide/history') renderGuideHistory();
    else if (route.path === '/guide/live') renderGuideLive();
    else if (route.path === '/guide/glossary') renderGuideGlossary();
    else if (route.path === '/guide/atlas') renderGuideAtlas();
    else if (route.path === '/about') renderAbout();
    else renderNotFound();

    pageEnter();
    if (lastRoutePath !== route.path) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      lastRoutePath = route.path;
    }
    document.title = pageTitle(route.path);
    if (Audio?.supported) updateAudioUI(Audio.getState());
  }

  // --------------------------------------------------------------------------
  // Lesson -> studio bridge
  //
  // Every lesson already ends with a written task. This maps that task onto the
  // studio module that actually lets you do it, so "动手" becomes a place you
  // can go instead of a paragraph you read. A lesson without an entry here keeps
  // the plain text task.
  // --------------------------------------------------------------------------

  // Mirrors the MODULES array in studio.js. Keep the num values in step: the
  // lesson bridge prints them, and a mismatch would send people to the wrong tab.
  const STUDIO_MODULE_META = {
    chain: { num: '01', label: '信号链', lead: '五类轨道各放一个声部，再把效果器拖成一条链。' },
    beats: { num: '02', label: '节拍', lead: '点亮格子放一个音，循环一直在响。' },
    bass: { num: '03', label: '低音', lead: '三行分别是根音、五度、八度。' },
    chords: { num: '04', label: '和弦', lead: '每一小节挑一个和弦，低音会自动跟着走。' },
    melody: { num: '05', label: '旋律', lead: '只有八个音可选，怎么点都不会跑调。' },
    sound: { num: '06', label: '音色', lead: '效果在总线上，会同时改变所有声部。' },
    song: { num: '07', label: '结构', lead: '给段落分配小节数，播放时逐层加减。' },
    mix: { num: '08', label: '混音', lead: '七层各自的电平、EQ、声像与发送量。' },
    bounce: { num: '09', label: '导出', lead: '渲染整首编排，试听，下载 WAV。' },
  };

  const LESSON_STUDIO = {
    'daw-and-tracks': { module: 'chain', hint: '给五类轨道各认一个声部，点轨道头试听它。' },
    'signal-chain-basics': { module: 'chain', hint: '看清声音从 MIDI 走到总线的四步，再回来看效果器顺序。' },
    'drum-programming': { module: 'beats', hint: '搭一个四拍 House 鼓型，再关掉 Hat 听差别。' },
    'groove-and-half-time': { module: 'beats', hint: '把 Swing 拉到 30% 以上，再把 Kick 挪到第 8 格听 Half-time。' },
    'drum-processing': { module: 'beats', hint: '先做鼓型，再切到 06 音色调滤波，听鼓组怎么变闷。' },
    'kick-and-bass': { module: 'bass', hint: '用八分推进音型，让低音落在 Kick 的缝里。' },
    'bass-sound-design': { module: 'bass', hint: '换低音的性格，听同一个音型怎么变长、变抖、变短。' },
    'low-end-control': { module: 'bass', hint: '只留根音行，让低音与 Kick 各占一个位置。' },
    'chord-progressions': { module: 'chords', hint: '选一组进行，听四个小节的情绪走向。' },
    'chord-texture': { module: 'chords', hint: '先定进行，再去 06 音色把和弦切到 Pad 听空间变化。' },
    'lead-hook': { module: 'melody', hint: '只用两三个音写一个动机，重复它。' },
    'synth-controls': { module: 'sound', hint: '逐个拉滤波、共振、失真、延迟，一次只改一个。' },
    'sampling-chops': { module: 'sound', hint: '把四个元音切片排成节奏型——切片当乐器用，就是这个意思。' },
    'structure-eight': { module: 'song', hint: '给段落分配小节数，播放时听层数怎么加减。' },
    'transitions': { module: 'song', hint: '在段落之间留一段零小节，听它被跳过。' },
    'automation-energy': { module: 'song', hint: '排完段落再回 06 音色，播放中慢慢拉滤波，模拟能量曲线。' },
    'gain-stage': { module: 'mix', hint: '七层各自留出余量，别让总线顶到红线。' },
    'eq-space': { module: 'mix', hint: '让每层在自己的频段里清楚——低音和 Kick 不要抢同一段。' },
    'space-stereo': { module: 'mix', hint: '给不同层不同的空间：一个近、一个远、一个宽。' },
    'project-house': { module: 'bounce', hint: '套用 House 模板，再把九块过一遍，得到你的 House Loop。' },
    'project-bass': { module: 'bounce', hint: '套用 Trap 模板，听半拍鼓与 808 怎么撑住低频。' },
    'finish-export': { module: 'bounce', hint: '把结构排完，渲染整首，下载 WAV，再写五行复盘。' },
  };

  function lessonStudioEntry(lessonId) {
    return LESSON_STUDIO[lessonId] || null;
  }

  // studio.js loads after this file, so a direct #/studio visit retries once the
  // script has parsed instead of rendering a 404.
  let studioRetry = 0;

  function renderStudio() {
    const kit = { pageHead, uiIcon, escapeHtml };
    // Resolve the lesson the visitor came from, so the studio can name it and
    // link back. Parsed here because app.js owns the course data.
    try {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      const fromId = params.get('from');
      const lesson = fromId ? LESSON_BY_ID.get(fromId) : null;
      if (lesson) {
        const chapter = CHAPTER_BY_ID.get(lesson.chapterId);
        kit.entry = {
          id: lesson.id,
          title: lesson.title,
          chapter: chapter ? chapter.title : '',
          task: lesson.task || '',
        };
      }
    } catch (error) {
      console.error('Studio entry lookup failed', error);
    }
    if (window.EMStudio) {
      try {
        window.EMStudio.mount(main, kit);
      } catch (error) {
        console.error('Studio mount failed', error);
        main.innerHTML = `<div class="page-loading"><span class="mono-label">STUDIO</span><p>工作室载入失败，请刷新重试。</p><a class="section-link" href="#/learn">先去制作课</a></div>`;
      }
      return;
    }
    main.innerHTML = `<div class="page-loading"><span class="mono-label">STUDIO</span><p>正在载入工作室…</p></div>`;
    if (studioRetry > 20) return;
    studioRetry += 1;
    setTimeout(() => {
      if (!window.EMStudio || parseRoute().path !== '/studio') return;
      studioRetry = 0;
      try {
        window.EMStudio.mount(main, kit);
      } catch (error) {
        console.error('Studio mount failed on retry', error);
      }
    }, 40);
  }

  function pageTitle(path) {
    if (path === '/archive') return '档案总览 · 电音档案';
    if (path === '/listen') return '听：用速度与律动找风格 · 电音档案';
    if (path === '/start') return '新手起步 · 电音档案';
    if (path === '/dj/field-guide') return 'DJ 现场手册 · 电音档案';
    if (path === '/dj/course') return 'DJ 修炼手册 · 电音档案';
    if (path === '/dj/automix') return '自动接歌台 · 电音档案';
    if (path === '/dj') return '过渡检查 · 电音档案';
    if (path === '/quick') return '现场速查 · 电音档案';
    if (path.startsWith('/card/')) return '风格卡 · 电音档案';
    if (path === '/studio') return '工作室 · 电音档案';
    if (path === '/learn') return '制作课 · 电音档案';
    if (path.startsWith('/learn/')) {
      let id = path.split('/')[2] || '';
      try {
        id = decodeURIComponent(id);
      } catch {
        // Keep raw ID.
      }
      const lesson = LESSON_BY_ID.get(id);
      return lesson ? `${lesson.title} · 电音档案` : '课程 · 电音档案';
    }
    if (path === '/library') return '知识库 · 电音档案';
    if (path === '/practice') return '听辨练习 · 电音档案';
    if (path === '/lab') return '音色实验室 · 电音档案';
    if (path === '/search') return '全库检索 · 电音档案';
    if (path === '/module') return '知识库模块 · 电音档案';
    if (path.startsWith('/doc/')) {
      let id = path.split('/')[2] || '';
      try {
        id = decodeURIComponent(id);
      } catch {
        // Keep the raw ID if it is not valid percent-encoding.
      }
      const doc = kbGetDoc(id);
      return doc ? `${doc.title} · 电音档案` : '文档 · 电音档案';
    }
    if (path === '/atlas') return '风格图谱 · 电音档案';
    if (path.startsWith('/family/')) return '大族 · 电音档案';
    if (path.startsWith('/genre/')) {
      const id = path.split('/')[2];
      const entry = entryById.get(id);
      return entry ? `${entry.name} · 电音档案` : '条目 · 电音档案';
    }
    if (path === '/guide/listen') return '听辨入门 · 电音档案';
    if (path === '/guide/production') return '结构与音色 · 电音档案';
    if (path === '/guide/history') return '历史脉络 · 电音档案';
    if (path === '/guide/live') return '现场文化 · 电音档案';
    if (path === '/guide/glossary') return '术语手册 · 电音档案';
    if (path === '/guide/atlas') return '图谱说明 · 电音档案';
    if (path === '/about') return '来源与勘误 · 电音档案';
    return '电音档案 · ELECTRONIC MUSIC FIELD NOTES';
  }

  // Global interactions

  function initFloatingUI() {
    if (floatingReady || !Floating) return;
    floatingReady = true;
    setupTooltipEvents();
    setupHeaderSearchPopover();
    setupCopyButtons();
    setupAiCopyButtons();
  }

  function updateTooltipPosition() {
    if (!Floating || !tooltipTarget || !uiTooltip || uiTooltip.hidden) return;
    const placement = tooltipTarget.dataset.tooltipPlacement || 'top';
    Floating.computePosition(tooltipTarget, uiTooltip, {
      placement,
      strategy: 'fixed',
      middleware: [
        Floating.offset(10),
        Floating.flip({ padding: 8 }),
        Floating.shift({ padding: 8 }),
        Floating.arrow({ element: uiTooltipArrow }),
      ],
    }).then(({ x, y, placement: finalPlacement, middlewareData }) => {
      Object.assign(uiTooltip.style, { left: `${x}px`, top: `${y}px` });
      uiTooltip.dataset.placement = finalPlacement;
      if (uiTooltipArrow) {
        const arrow = middlewareData.arrow || {};
        const staticSide = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }[finalPlacement.split('-')[0]] || 'bottom';
        Object.assign(uiTooltipArrow.style, {
          left: arrow.x != null ? `${arrow.x}px` : '',
          top: arrow.y != null ? `${arrow.y}px` : '',
          right: '',
          bottom: '',
          [staticSide]: '-4px',
        });
      }
    });
  }

  function showTooltip(target, text) {
    if (!Floating || !uiTooltip || !target || !text) return;
    clearTimeout(tooltipHideTimer);
    if (tooltipTarget && tooltipTarget !== target) tooltipTarget.removeAttribute('aria-describedby');
    tooltipTarget = target;
    uiTooltipText.textContent = text;
    uiTooltip.hidden = false;
    target.setAttribute('aria-describedby', 'uiTooltip');
    tooltipCleanup?.();
    tooltipCleanup = Floating.autoUpdate(target, uiTooltip, updateTooltipPosition);
    updateTooltipPosition();
  }

  function hideTooltip() {
    clearTimeout(tooltipHideTimer);
    tooltipCleanup?.();
    tooltipCleanup = null;
    if (uiTooltip) uiTooltip.hidden = true;
    if (tooltipTarget) tooltipTarget.removeAttribute('aria-describedby');
    tooltipTarget = null;
  }

  function setupTooltipEvents() {
    document.addEventListener('mouseover', (event) => {
      const target = event.target.closest?.('[data-tooltip]');
      if (!target || target === tooltipTarget) return;
      if (target.contains(event.relatedTarget)) return;
      showTooltip(target, target.dataset.tooltip);
    });
    document.addEventListener('mouseout', (event) => {
      const target = event.target.closest?.('[data-tooltip]');
      if (!target) return;
      if (target.contains(event.relatedTarget)) return;
      hideTooltip();
    });
    document.addEventListener('focusin', (event) => {
      const target = event.target.closest?.('[data-tooltip]');
      if (!target) return;
      showTooltip(target, target.dataset.tooltip);
    });
    document.addEventListener('focusout', (event) => {
      const target = event.target.closest?.('[data-tooltip]');
      if (!target) return;
      if (target.contains(event.relatedTarget)) return;
      hideTooltip();
    });
  }

  function positionHeaderSearchPopover() {
    if (!Floating || !headerSearch || !headerSearchPopover || headerSearchPopover.hidden) return;
    Floating.computePosition(headerSearch, headerSearchPopover, {
      placement: 'bottom-start',
      strategy: 'fixed',
      middleware: [
        Floating.offset(10),
        Floating.flip({ padding: 12 }),
        Floating.shift({ padding: 12 }),
        Floating.size({
          apply({ rects, elements }) {
            elements.floating.style.minWidth = `${rects.reference.width}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      Object.assign(headerSearchPopover.style, { left: `${x}px`, top: `${y}px` });
    });
  }

  function renderHeaderSearchPopover(query) {
    if (!headerSearchPopover) return;
    const value = String(query || '').trim();
    if (!value) {
      hideHeaderSearchPopover();
      return;
    }
    const result = kbSearchAll(value, { limit: 5 });
    const effective = result.meta?.normalizedQuery || value;
    headerSearchPopover.innerHTML = `
      <div class="header-search-popover-head">
        <span class="mono-label">QUICK RESULTS</span>
        <span class="mono-label">${result.results.length} / ${result.count} 条 · 全库</span>
      </div>
      ${result.results.length ? `<div class="header-search-popover-list">${result.results.map((item) => `
        <a class="header-search-popover-item" href="${kbDocHref(item)}">
          <span class="type-badge type-${escapeHtml(item.type)}">${escapeHtml(kbTypeLabel(item.type))}</span>
          <span class="header-search-popover-title">${highlight(item.title, effective)}</span>
          <span class="header-search-popover-meta">${escapeHtml(item.family || item.source?.title || '')}</span>
        </a>`).join('')}</div>` : '<p class="search-preview-empty">没有直接匹配。按 Enter 打开全库检索。</p>'}
      <a class="header-search-popover-all" href="#/search?q=${encodeURIComponent(value)}">查看全部结果 ↗</a>`;
    headerSearchPopover.hidden = false;
    headerSearchInput.setAttribute('aria-expanded', 'true');
    headerSearchCleanup?.();
    headerSearchCleanup = Floating.autoUpdate(headerSearch, headerSearchPopover, positionHeaderSearchPopover);
    positionHeaderSearchPopover();
  }

  function hideHeaderSearchPopover() {
    clearTimeout(headerSearchTimer);
    headerSearchCleanup?.();
    headerSearchCleanup = null;
    if (headerSearchPopover) headerSearchPopover.hidden = true;
    if (headerSearchInput) headerSearchInput.setAttribute('aria-expanded', 'false');
  }

  function setupHeaderSearchPopover() {
    if (!Floating || !headerSearch || !headerSearchInput || !headerSearchPopover) return;
    headerSearchInput.setAttribute('aria-expanded', 'false');
    headerSearchInput.setAttribute('aria-controls', 'headerSearchPopover');
    headerSearchInput.addEventListener('input', () => {
      clearTimeout(headerSearchTimer);
      const value = headerSearchInput.value.trim();
      if (!value) {
        hideHeaderSearchPopover();
        return;
      }
      headerSearchTimer = setTimeout(() => renderHeaderSearchPopover(value), 120);
    });
    headerSearchInput.addEventListener('focus', () => {
      if (headerSearchInput.value.trim()) renderHeaderSearchPopover(headerSearchInput.value);
    });
    headerSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideHeaderSearchPopover();
    });
    headerSearch.addEventListener('submit', hideHeaderSearchPopover);
    headerSearchPopover.addEventListener('click', (event) => {
      if (event.target.closest('a')) hideHeaderSearchPopover();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!headerSearch.contains(event.target) && !headerSearchPopover.contains(event.target)) {
        hideHeaderSearchPopover();
      }
    });
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (!copied) throw new Error('copy failed');
  }

  function buildAiContext(query, results) {
    const lines = [
      '# 电音档案知识库上下文',
      '',
      `查询：${query}`,
      `命中：${results.length} 条（已按相关度去重）`,
      '使用说明：回答时请用 [ID] 引用来源；资料不足时明确说明，不要补造。',
      '',
    ];
    results.forEach((item, index) => {
      lines.push(`## ${index + 1}. [${item.id}] ${item.title}`);
      lines.push(`- 类型：${item.type}`);
      if (item.family) lines.push(`- 大族：${item.family}`);
      if (item.source?.title) lines.push(`- 来源：${item.source.title}`);
      if (item.source?.url) lines.push(`- 链接：${item.source.url}`);
      lines.push('');
      lines.push(String(item.snippet || '').trim());
      lines.push('');
    });
    return lines.join('\n');
  }

  function buildDocAiContext(doc) {
    if (!doc) return '';
    const source = doc.source || {};
    const lines = [
      '# 电音档案知识库文档',
      '',
      `## [${doc.id}] ${doc.title}`,
      `- 类型：${doc.type}`,
      source.title ? `- 来源：${source.title}` : null,
      source.url ? `- 链接：${source.url}` : null,
      '',
      String(doc.text || '').slice(0, 6000).trim(),
      '',
      '使用说明：引用时请保留 [ID] 与来源；资料不足时明确说明。',
    ];
    return lines.filter((line) => line !== null).join('\n');
  }

  function setupAiCopyButtons() {
    document.addEventListener('click', async (event) => {
      const searchButton = event.target.closest('[data-copy-ai-search]');
      const docButton = event.target.closest('[data-copy-ai-doc]');
      if (!searchButton && !docButton) return;
      const button = searchButton || docButton;
      try {
        let text = '';
        if (searchButton) {
          const query = searchButton.getAttribute('data-copy-ai-search') || '';
          const result = kbSearchAll(query, { limit: 6 });
          text = buildAiContext(query, result.results);
        } else {
          const id = docButton.getAttribute('data-copy-ai-doc') || '';
          text = buildDocAiContext(kbGetDoc(id));
        }
        if (!text) throw new Error('empty context');
        await copyText(text);
        showTooltip(button, '已复制 AI 上下文');
        const original = button.dataset.tooltip || '复制给 AI';
        button.dataset.tooltip = '已复制 AI 上下文';
        tooltipHideTimer = setTimeout(() => {
          button.dataset.tooltip = original;
          hideTooltip();
        }, 1600);
      } catch {
        showTooltip(button, '复制失败，请手动选择内容');
      }
    });
  }

  function setupCopyButtons() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy-target]');
      if (!button) return;
      const target = document.querySelector(button.getAttribute('data-copy-target'));
      const text = target?.textContent || button.getAttribute('data-copy-text') || '';
      if (!text) return;
      const original = button.dataset.tooltip || '复制';
      try {
        await copyText(text);
        button.dataset.tooltip = '已复制';
        showTooltip(button, '已复制');
        tooltipHideTimer = setTimeout(() => {
          button.dataset.tooltip = original;
          hideTooltip();
        }, 1400);
      } catch {
        if (target) {
          const range = document.createRange();
          range.selectNodeContents(target);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        showTooltip(button, target ? '无法自动复制；已选中文本，请按 Ctrl+C' : '无法自动复制，请手动选择');
      }
    });
  }

  function demoForEntry(entryId) {
    return Audio?.getDemoForEntry?.(entryId) || null;
  }

  function audioDemoButton(demo, label = '播放合成示例', extraClass = '') {
    if (!demo) return '';
    return `<button class="audio-play-button${extraClass ? ` ${extraClass}` : ''}" type="button" data-audio-demo="${escapeHtml(demo.id)}" data-audio-label="${escapeHtml(label)}" data-tooltip="浏览器实时合成的示例，不是原曲">▶ ${escapeHtml(label)}</button>`;
  }

  function updateStructurePlayer(state) {
    const progress = document.getElementById('structureProgress');
    const sections = [...document.querySelectorAll('[data-structure-section]')];
    if (!progress && !sections.length) return;
    const active = state.playing && state.demoId === 'structure';
    // The bar readout, the active cell and the scan line all come from the
    // playhead. Reading the active section from state.section would use a
    // different clock, and the three would drift apart.
    const head = active && Audio?.getPlayhead ? Audio.getPlayhead('structure') : null;
    const BARS_PER_SECTION = 2;
    const section = head ? Math.min(sections.length - 1, Math.floor(head.bar / BARS_PER_SECTION)) : -1;
    const ratio = head ? (head.bar + head.phase) / Math.max(1, head.bars) : 0;
    if (progress) progress.style.width = `${active ? Math.round(ratio * 100) : 0}%`;
    sections.forEach((item, index) => {
      const isActive = active && index === section;
      item.classList.toggle('is-active', isActive);
      item.classList.toggle('is-passed', active && index < section);
      const scan = item.querySelector('.structure-scan');
      if (scan) {
        // Advance within the two-bar cell, including the fractional bar.
        const within = head ? ((head.bar % BARS_PER_SECTION) + head.phase) / BARS_PER_SECTION : 0;
        scan.style.width = isActive ? `${Math.round(within * 100)}%` : '0%';
      }
      if (isActive) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  // --------------------------------------------------------------------------
  // Lesson players: live loop feedback
  //
  // Everything here reads the audio clock through Audio.getPlayhead(), the same
  // source the studio uses. A rAF loop paints; the audio never waits on the DOM.
  // --------------------------------------------------------------------------

  const lessonHeads = {
    metronome: { beat: -1, bar: -1 },
    drum: { col: -1 },
    lab: { bar: -1 },
  };

  function clearLessonHeads() {
    Object.values(lessonHeads).forEach((head) => { Object.keys(head).forEach((key) => { head[key] = -1; }); });
    document.querySelectorAll('.is-lesson-now').forEach((el) => el.classList.remove('is-lesson-now'));
    document.querySelectorAll('[data-lesson-loop-fill]').forEach((el) => { el.style.width = '0%'; });
  }

  // Beat dots: one dot per beat, the loop marker slides across the bar.
  function paintMetronome(head) {
    const dots = [...document.querySelectorAll('[data-beat-dot]')];
    if (!dots.length) return;
    const beat = head ? head.step % 4 : -1;
    if (lessonHeads.metronome.beat === beat && lessonHeads.metronome.bar === (head ? head.bar : -1)) return;
    lessonHeads.metronome.beat = beat;
    lessonHeads.metronome.bar = head ? head.bar : -1;
    dots.forEach((dot, index) => dot.classList.toggle('is-lesson-now', index === beat));
    const read = document.querySelector('[data-lesson-loop-read]');
    if (read) read.textContent = head ? `第 ${head.bar + 1} / ${head.bars} 小节` : '循环 2 小节';
  }

  // Sequencer: one column at a time, across all three rows at once.
  function paintDrumHead(head) {
    const cols = [...document.querySelectorAll('[data-drum-col]')];
    if (!cols.length) return;
    const col = head ? head.step : -1;
    if (lessonHeads.drum.col === col) return;
    lessonHeads.drum.col = col;
    cols.forEach((cell) => cell.classList.toggle('is-lesson-now', Number(cell.dataset.drumCol) === col));
  }

  function paintLabHead(head) {
    const buttons = [...document.querySelectorAll('[data-lesson-lab-group]')];
    if (!buttons.length) return;
    const bar = head ? head.bar : -1;
    if (lessonHeads.lab.bar === bar) return;
    lessonHeads.lab.bar = bar;
    // Every enabled layer is sounding the whole time, so they all stay lit while
    // the loop runs. Gating this on an even bar made the highlight flicker off
    // for a whole bar at a time.
    buttons.forEach((button) => {
      const on = button.getAttribute('aria-pressed') === 'true';
      button.classList.toggle('is-lesson-now', Boolean(head) && on);
    });
  }

  function paintLoopBar(head) {
    document.querySelectorAll('[data-lesson-loop]').forEach((bar) => {
      const fill = bar.querySelector('[data-lesson-loop-fill]');
      const count = bar.querySelector('[data-lesson-loop-count]');
      if (fill) fill.style.width = `${head ? Math.round((head.progress || 0) * 100) : 0}%`;
      if (count) count.textContent = head ? `${head.bar + 1} / ${head.bars}` : `1 / ${bar.dataset.lessonLoopBars || 1}`;
    });
  }

  function paintLessonPlayheads() {
    const state = Audio?.getState?.();
    if (!state?.playing) {
      clearLessonHeads();
      paintLoopBar(null);
      return;
    }
    const head = Audio.getPlayhead ? Audio.getPlayhead(state.demoId) : null;
    if (state.demoId === 'metronome') paintMetronome(head);
    else paintMetronome(null);
    if (state.demoId === 'drum-machine') paintDrumHead(head);
    else paintDrumHead(null);
    if (state.demoId === 'lab') paintLabHead(head);
    else paintLabHead(null);
    paintLoopBar(head);
  }

  function updateHeroPlayhead(state) {
    const steps = document.querySelectorAll('[data-step-index]');
    if (!steps.length) return;
    const active = state.playing && state.demoId === 'drum-machine';
    const current = active ? Math.floor(state.progress * 8) % 8 : -1;
    steps.forEach((button) => {
      button.classList.toggle('is-playhead', Number(button.dataset.stepIndex) === current);
    });
    const consoleEl = document.querySelector('[data-hero-console]');
    consoleEl?.classList.toggle('is-playing', active);
  }

  function updateTransport(state) {
    if (!transportHead || !transport) return;
    const playing = Boolean(state?.playing);
    transport.classList.toggle('is-playing', playing);
    if (playing) {
      transportHead.style.left = `${Math.min(1, Math.max(0, state.progress || 0)) * 100}%`;
      document.documentElement.style.setProperty('--bpm', String(state.bpm || 128));
    }
  }

  // Real FFT levels from the master bus — the header meter is not a decorative loop.
  function paintHeaderMeter() {
    if (!headerMeterBars.length) return;
    const levels = Audio?.supported ? Audio.getLevels() : null;
    if (!levels) {
      headerMeterBars.forEach((bar) => bar.style.setProperty('--level', '0.05'));
      return;
    }
    const count = headerMeterBars.length;
    for (let index = 0; index < count; index += 1) {
      const sample = Math.floor((index / count) * levels.length * 0.82);
      headerMeterBars[index].style.setProperty('--level', (levels[sample] / 255).toFixed(3));
    }
  }

  function audioProgressTick() {
    if (!Audio) return;
    const state = Audio.getState();
    if (audioDockProgress) audioDockProgress.style.width = `${Math.round((state.progress || 0) * 100)}%`;
    paintDockWave(state.playing ? state.progress || 0 : 0);
    updateStructurePlayer(state);
    updateHeroPlayhead(state);
    paintLessonPlayheads();
    updateTransport(state);
    paintHeaderMeter();
    if (state.playing) {
      audioProgressRaf = requestAnimationFrame(audioProgressTick);
    } else {
      audioProgressRaf = null;
      paintHeaderMeter();
    }
  }

  // A lesson page can host two players at once (its own widget and the inline
  // studio). They share one audio session, so when a lesson player starts, the
  // inline studio has to let go — otherwise its button keeps saying "stop" while
  // a different loop is what you hear.
  let lastSessionOwner = null;

  function reconcileLessonSessions(state) {
    const owner = state.playing ? state.demoId : null;
    if (owner === lastSessionOwner) return;
    lastSessionOwner = owner;
    if (!window.EMStudio || typeof window.EMStudio.isEmbedded !== 'function') return;
    if (!window.EMStudio.isEmbedded()) return;
    // The studio owns the session only while it is the one playing.
    if (owner && owner !== 'studio') window.EMStudio.releaseSession();
  }

  function updateAudioUI(state) {
    if (!Audio || !Audio.supported) {
      if (soundToggle) soundToggle.disabled = true;
      if (audioDock) audioDock.hidden = true;
      return;
    }
    reconcileLessonSessions(state);
    const soundOn = !state.muted;
    if (soundToggle) {
      soundToggle.classList.toggle('is-muted', state.muted);
      soundToggle.setAttribute('aria-pressed', String(soundOn));
      soundToggle.setAttribute('aria-label', soundOn ? '关闭声音' : '开启声音');
      soundToggle.dataset.tooltip = soundOn ? '声音开着，点击静音' : '声音已关闭，点击开启';
    }
    if (audioDock) {
      audioDock.hidden = !state.playing;
      document.body.classList.toggle('has-audio-dock', state.playing);
      if (state.playing && audioDockTitle) audioDockTitle.textContent = state.label || '合成示例';
    }
    if (audioDockProgress) audioDockProgress.style.width = `${Math.round((state.progress || 0) * 100)}%`;
    paintDockWave(state.playing ? state.progress || 0 : 0);
    if (audioDockVolume && document.activeElement !== audioDockVolume) {
      audioDockVolume.value = String(Math.round(state.volume * 100));
    }
    document.querySelectorAll('[data-audio-demo]').forEach((button) => {
      const active = state.playing && state.demoId === button.dataset.audioDemo;
      button.classList.toggle('is-playing', active);
      button.textContent = active ? '■ 停止' : `▶ ${button.dataset.audioLabel || '播放合成示例'}`;
    });
    document.querySelectorAll('[data-audio-structure]').forEach((button) => {
      const active = state.playing && state.demoId === 'structure';
      button.classList.toggle('is-playing', active);
      button.textContent = active ? '■ 停止结构示例' : '▶ 播放结构示例';
    });
    document.querySelectorAll('[data-audio-lab]').forEach((button) => {
      const active = state.playing && state.demoId === 'lab';
      button.classList.toggle('is-playing', active);
      button.textContent = active ? '■ 停止实验室' : '▶ 播放实验室';
    });
    document.querySelectorAll('[data-lesson-metronome-play]').forEach((button) => {
      const active = state.playing && state.demoId === 'metronome';
      button.classList.toggle('is-playing', active);
      button.textContent = active ? '■ 停止节拍' : '▶ 播放节拍';
    });
    document.querySelectorAll('[data-lesson-drum-play]').forEach((button) => {
      const active = state.playing && state.demoId === 'drum-machine';
      button.classList.toggle('is-playing', active);
      button.textContent = active ? '■ 停止鼓组' : '▶ 播放鼓组';
    });
    document.querySelectorAll('[data-lesson-lab-play]').forEach((button) => {
      const active = state.playing && state.demoId === 'lab';
      button.classList.toggle('is-playing', active);
      button.textContent = active ? '■ 停止分层' : '▶ 播放实验室';
    });
    document.querySelectorAll('[data-hero-play]').forEach((button) => {
      const active = state.playing && state.demoId === 'drum-machine';
      button.classList.toggle('is-playing', active);
      button.innerHTML = `${uiIcon(active ? 'stop' : 'play')} ${active ? '停止播放' : '播放这一小节'}`;
    });
    updateStructurePlayer(state);
    updateHeroPlayhead(state);
    // Also painted here, not only inside the rAF loop: when playback stops the
    // loop ends, and without this call the last highlighted step would stay lit
    // forever.
    paintLessonPlayheads();
    updateTransport(state);
    paintHeaderMeter();
    if (state.playing && !audioProgressRaf) audioProgressRaf = requestAnimationFrame(audioProgressTick);
  }

  function initAudioUI() {
    if (!Audio || !Audio.supported) {
      if (soundToggle) {
        soundToggle.disabled = true;
        soundToggle.dataset.tooltip = '当前浏览器不支持 Web Audio';
      }
      return;
    }
    Audio.onState(updateAudioUI);
    // 树页也订阅一次：主站订阅只更新页头与底部 dock，
    // 树还需要自己擦掉「正在播放」的行高亮。两处各管各的，互不依赖。
    Audio.onState((state) => {
      if (document.getElementById('treeColumns')) treeSyncFromEngine(state);
    });
    soundToggle?.addEventListener('click', () => {
      Audio.toggleMute();
      updateAudioUI(Audio.getState());
    });
    audioDockStop?.addEventListener('click', () => Audio.stop());
    audioDockVolume?.addEventListener('input', () => {
      Audio.setVolume(Number(audioDockVolume.value) / 100);
    });
    document.addEventListener('click', (event) => {
      const heroPlay = event.target.closest('[data-hero-play]');
      if (heroPlay) {
        event.preventDefault();
        const state = Audio.getState();
        if (state.playing && state.demoId === 'drum-machine') Audio.stop();
        else Audio.startDrumMachine({ bpm: 128, pattern: heroPattern || undefined });
        return;
      }
      const demoButton = event.target.closest('[data-audio-demo]');
      if (demoButton) {
        event.preventDefault();
        const demoId = demoButton.getAttribute('data-audio-demo');
        const state = Audio.getState();
        if (state.playing && state.demoId === demoId) Audio.stop();
        else Audio.playDemo(demoId);
        return;
      }
      const structureButton = event.target.closest('[data-audio-structure]');
      if (structureButton) {
        event.preventDefault();
        const state = Audio.getState();
        if (state.playing && state.demoId === 'structure') Audio.stop();
        else Audio.playStructure();
        return;
      }
      const labButton = event.target.closest('[data-audio-lab]');
      if (labButton) {
        event.preventDefault();
        const state = Audio.getState();
        if (state.playing && state.demoId === 'lab') Audio.stop();
        else Audio.startLab({ bpm: labBpm, groups: labGroups });
        return;
      }
      const stopButton = event.target.closest('[data-audio-stop]');
      if (stopButton) {
        event.preventDefault();
        Audio.stop();
      }
    });
  }

  function openSearch() {
    hideHeaderSearchPopover();
    searchLayer.hidden = false;
    document.body.style.overflow = 'hidden';
    searchLayerInput.value = '';
    renderSearchQuick('');
    setTimeout(() => searchLayerInput.focus(), 20);
  }

  function closeSearch() {
    searchLayer.hidden = true;
    document.body.style.overflow = '';
  }

  function renderSearchQuick(query = '') {
    const quick = document.getElementById('searchQuick');
    if (!quick) return;
    const value = String(query || '').trim();
    if (!value) {
      quick.innerHTML = `
        ${recentSearches.length ? `
          <div class="search-preview-head"><span class="mono-label">RECENT / 最近搜索</span><button class="search-clear-recent" type="button" data-clear-recent>清空</button></div>
          <div class="chip-row">${recentSearches.map((item) => `<button class="chip" type="button" data-quick="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}</div>` : ''}
        <div class="search-preview-head"><span class="mono-label">BEGINNER / 新手常问</span><span class="mono-label">按 Ctrl / ⌘ + K 随时打开</span></div>
        <div class="chip-row">${BEGINNER_QUERIES.slice(0, 4).map((item) => `<button class="chip" type="button" data-quick="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}</div>
        <div class="search-preview-head"><span class="mono-label">QUICK / 风格</span><span class="mono-label">覆盖条目 / 大族 / 指南 / 术语</span></div>
        <div class="chip-row">${CUR.tenStyles.slice(0, 6).map((style) => `<button class="chip" type="button" data-quick="${escapeHtml(style.name)}">${escapeHtml(style.name)}</button>`).join('')}</div>`;
      return;
    }
    const result = kbSearchAll(value, { limit: 5 });
    const effective = result.meta?.normalizedQuery || value;
    if (!result.results.length) {
      quick.innerHTML = `<p class="search-preview-empty">没有直接匹配的内容。按 Enter 打开全库检索，试试更短的关键词。</p>`;
      return;
    }
    quick.innerHTML = `
      <div class="search-preview-head"><span class="mono-label">PREVIEW / 前 ${result.results.length} 条</span><span class="mono-label">覆盖全库</span></div>
      <div class="search-preview-list">
        ${result.results.map((item) => `
          <a class="search-preview-item" href="${kbDocHref(item)}">
            <span class="type-badge type-${escapeHtml(item.type)}">${escapeHtml(kbTypeLabel(item.type))}</span>
            <span class="search-preview-title">${highlight(item.title, effective)}</span>
            <span class="search-preview-meta">${escapeHtml(item.family || item.source?.title || '')}</span>
          </a>`).join('')}
      </div>`;
  }

  function submitSearch(query) {
    const value = String(query || '').trim();
    saveRecentSearch(value);
    hideHeaderSearchPopover();
    closeSearch();
    navigate(value ? `#/search?q=${encodeURIComponent(value)}` : '#/search');
  }

  headerSearch.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch(new FormData(headerSearch).get('q'));
  });

  searchOpen.addEventListener('click', openSearch);
  searchLayerClose.addEventListener('click', closeSearch);

  searchLayer.addEventListener('click', (event) => {
    if (event.target === searchLayer) closeSearch();
  });

  searchLayerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch(searchLayerInput.value);
  });

  let searchPreviewTimer = null;
  searchLayerInput.addEventListener('input', () => {
    clearTimeout(searchPreviewTimer);
    searchPreviewTimer = setTimeout(() => renderSearchQuick(searchLayerInput.value), 120);
  });

  document.addEventListener('click', (event) => {
    const previewLink = event.target.closest('.search-preview-item');
    if (previewLink) {
      closeSearch();
      return;
    }

    const clearRecent = event.target.closest('[data-clear-recent]');
    if (clearRecent) {
      recentSearches = [];
      try { localStorage.removeItem(RECENT_SEARCH_KEY); } catch { /* ignore */ }
      renderSearchQuick('');
      return;
    }

    const quick = event.target.closest('[data-quick]');
    if (quick) {
      submitSearch(quick.getAttribute('data-quick'));
      return;
    }

    const familyRandom = event.target.closest('[data-random-family]');
    if (familyRandom) {
      const pool = familyEntries.get(familyRandom.getAttribute('data-random-family')) || [];
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        navigate(`#/genre/${pick.id}`);
      }
      return;
    }

    const random = event.target.closest('[data-random]');
    if (random) {
      const pool = atlas ? filteredEntries(atlas) : KB.entries;
      if (pool.length) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        navigate(`#/genre/${pick.id}`);
      }
      return;
    }

    const loadMore = event.target.closest('[data-load-more]');
    if (loadMore && atlas) {
      atlas.limit += 60;
      const panel = document.getElementById('atlasMain');
      if (panel) panel.innerHTML = renderAtlasMain(atlas);
      return;
    }

    const treeToggle = event.target.closest('[data-tree-toggle]');
    if (treeToggle && atlas) {
      event.preventDefault();
      const id = treeToggle.getAttribute('data-tree-toggle');
      if (expandedTree.has(id)) expandedTree.delete(id);
      else expandedTree.add(id);
      refreshAtlasTrees();
      return;
    }

    const mobileLink = event.target.closest('.mobile-nav a');
    if (mobileLink) closeMobileNav();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!searchLayer.hidden) {
        closeSearch();
        return;
      }
      if (!mobileNav.hidden) closeMobileNav();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }

    if (event.key === '/' && searchLayer.hidden) {
      const tag = (event.target.tagName || '').toLowerCase();
      const editing = ['input', 'textarea', 'select'].includes(tag) || event.target.isContentEditable;
      if (!editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openSearch();
      }
    }

    if (event.key === 'Tab' && !searchLayer.hidden) {
      const focusables = [...searchLayer.querySelectorAll('button, input, a[href]')].filter((element) => !element.hidden);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  menuToggle.addEventListener('click', () => {
    if (mobileNav.hidden) openMobileNav();
    else closeMobileNav();
  });

  window.addEventListener('hashchange', render);

  initFloatingUI();
  initAudioUI();
  if (!location.hash) replaceHash('#/');
  render();

  // 离线速查：只在 http(s) 下注册（file:// 不支持 Service Worker）。
  // 改完前端要记得同步 sw.js 里的 VERSION，否则老访客会继续吃缓存。
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // 注册失败不影响在线使用
      });
    });
  }
})();

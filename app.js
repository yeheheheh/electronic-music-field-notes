(() => {
  const KB = window.KB_DATA;
  const CUR = window.KB_CURATED;

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

  // 导航按「意图」收敛成四个字：
  // 听（我想知道这是什么）/ 查（我想查一个词）/ 练（我想练耳朵）/ 做（我想自己做）。
  // 图谱、工作室、实验室、DJ 工具都还在，只是退到各自该在的位置，一条内容都没删。
  const NAV = [
    {
      href: '#/listen',
      label: '听',
      icon: 'listen',
      desc: '用速度与律动找风格',
      match: (path) => path === '/listen' || path === '/quick' || path.startsWith('/card/'),
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
      match: (path) => path === '/learn' || path.startsWith('/learn/') || path === '/studio' || path === '/lab',
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
    transcript: '转写',
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

  function kbExpandQuery(query) {
    const additions = [];
    if (/七组|七件/.test(query)) additions.push('七大乐器组');
    if (/bass/i.test(query)) additions.push('贝斯');
    if (/drum/i.test(query)) additions.push('鼓组');
    if (/结构/.test(query)) additions.push('段落');
    if (/音色组/.test(query)) additions.push('乐器组');
    return additions;
  }

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

  function kbSnippet(text, query, maxLength = 220) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
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
    const tokens = [...new Set(kbTokenize([q, ...kbExpandQuery(q)].join(' ')))];
    if (!tokens.length) return { query: q, count: 0, results: [] };
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
    const phrase = norm(q).toLowerCase();
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
        snippet: kbSnippet(snippetSource, q),
        source: record.chunk.source,
        metadata: record.chunk.metadata || {},
      };
    });
    return { query: q, count: deduped.length, results };
  }

  function kbTypeLabel(type) {
    return KB_TYPE_LABELS[type] || type || '文档';
  }

  function kbDocHref(item) {
    if (item.type === 'entry') return `#/genre/${item.id}`;
    if (item.type === 'family' && item.familyId) return `#/family/${item.familyId}`;
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
          text: chunks.map((chunk) => chunk.text).join('\n\n'),
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
    const percent = courseProgressPercent();
    if (headerProgress) {
      headerProgress.hidden = completed === 0;
      headerProgress.href = firstIncompleteLesson() ? `#/learn/${firstIncompleteLesson().id}` : '#/learn';
      headerProgress.querySelector('strong').textContent = `${completed}/${total}`;
      headerProgress.style.setProperty('--path-progress', `${percent}%`);
      headerProgress.setAttribute('aria-label', `学习进度 ${completed}/${total}，继续学习`);
    }

    const mobileProgress = completed
      ? `<a class="mobile-nav-progress" href="#/learn"><span>PATH / 学习进度</span><strong>${completed} / ${total}</strong><i style="--path-progress:${percent}%" aria-hidden="true"></i></a>`
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
        <a href="#/dj">DJ 工具</a>
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
    footer.innerHTML = `
      <div class="footer-brand">
        <strong>电音档案 / FIELD NOTES</strong>
        <span>基于《电音风格项目丨第四期》、四期《电音圣经》与一期现场播客整理。资料截至 ${escapeHtml(CUR.updated)}。</span>
        <span>本地静态知识库 · 仅作学习与研究 · 例曲不提供音频下载</span>
        <span>声音示例由浏览器实时合成，不是原曲。</span>
      </div>
      <div class="footer-links">
        <a href="#/listen">听</a>
        <a href="#/learn">制作课</a>
        <a href="#/library">知识库</a>
        <a href="#/atlas">图谱</a>
        <a href="#/practice">练习</a>
        <a href="#/lab">实验室</a>
        <a href="#/dj">DJ 工具</a>
        <a href="#/quick">速查</a>
        <a href="#/search">全库检索</a>
        <a href="#/module">模块</a>
        <a href="#/about">来源</a>
      </div>`;
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
    const startHref = nextLesson ? `#/learn/${nextLesson.id}` : '#/learn';
    const total = COURSE_LESSONS.length;
    const familyTotal = KB.families.filter((family) => !family.archive && !family.supplement).length;
    heroPattern = {
      kick: [true, false, false, false, true, false, false, false],
      snare: [false, false, true, false, false, false, true, false],
      hat: [true, true, true, true, true, true, true, true],
    };
    main.innerHTML = `
      <section class="hero hero-home">
        <div class="hero-copy">
          <div class="hero-topline">
            <span class="hero-kicker">${escapeHtml(CUR.hero.kicker)}</span>
            <span class="mono-label">FIELD NOTES / 2026</span>
          </div>
          <h1 class="hero-title">
            <span class="hero-title-line">先做出一段 Loop，</span>
            <span class="hero-title-line"><em>再谈风格</em>。</span>
          </h1>
          <p class="hero-lead">${escapeHtml(CUR.hero.lead)}</p>
          <div class="hero-actions">
            <a class="button-primary" href="${startHref}">${completedCount ? '继续制作' : '开始第一课'}${nextLesson ? ` · ${escapeHtml(nextLesson.title)}` : ''}</a>
            <a class="button-ghost" href="#/library">打开知识库</a>
          </div>
          <div class="hero-index" aria-label="网站规模">
            <span><strong>${total}</strong> 节制作课</span>
            <span><strong>${formatNumber(stats.entries)}</strong> 条知识</span>
            <span><strong>${familyTotal}</strong> 个大族</span>
          </div>
          <p class="hero-note">${escapeHtml(CUR.hero.note)}</p>
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
            <a class="console-start" href="#/learn">完整路径 ${uiIcon('arrow')}</a>
          </div>
          <div class="console-foot">
            <span>点格子改节奏，再播放</span>
            <span>非原曲</span>
            <span class="console-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          </div>
        </aside>
      </section>

      <a class="listen-door" href="#/listen">
        <span class="listen-door-kicker">ONLY WANT TO LISTEN? / 只想先听懂</span>
        <p><b>不用记流派名。</b>多快、鼓怎么落地、低音什么样——三个问题就能把范围收到几个，每一个都能直接听 8 秒。</p>
        <span class="listen-door-arrow">用 BPM 找风格 →</span>
      </a>

      <section class="section home-path">
        <div class="home-path-head section-head">
          <span class="section-num">01</span>
          <div class="section-head-copy">
            <div class="section-kicker">学习路线</div>
            <h2>八段，像八小节一样推进。</h2>
          </div>
          <div class="home-path-aside">
            <p>顺序由制作依赖决定：先让声音出来，再让低频、和声与结构成立，最后混音和导出。</p>
            <a class="section-link" href="#/learn">完整课程地图</a>
          </div>
        </div>
        <div class="stage-list">
          ${COURSE_CHAPTERS.map((chapter) => {
            const done = chapter.lessons.filter((lesson) => courseCompleted.has(lesson.id)).length;
            const chapterNext = chapter.lessons.find((lesson) => !courseCompleted.has(lesson.id));
            const target = chapterNext || chapter.lessons[0];
            const isCurrent = Boolean(nextLesson && nextLesson.chapterId === chapter.id);
            return `
              <a class="stage-row ${familyClass(chapter.color)}${isCurrent ? ' is-current' : ''}${chapterNext ? '' : ' is-complete'}" href="#/learn/${target.id}">
                <span class="stage-row-index">${escapeHtml(chapter.index)}</span>
                <span class="stage-row-copy">
                  <strong>${escapeHtml(chapter.title)}</strong>
                  <small>${escapeHtml(chapter.outcome)}</small>
                </span>
                <span class="stage-row-meter" aria-hidden="true">
                  ${chapter.lessons.map((lesson) => `<i class="${courseCompleted.has(lesson.id) ? 'is-done' : lesson.id === nextLesson?.id ? 'is-next' : ''}"></i>`).join('')}
                  <em>${done}/${chapter.lessons.length}</em>
                </span>
                <span class="stage-row-enter">${uiIcon('arrow')}</span>
              </a>`;
          }).join('')}
        </div>
      </section>

      <section class="section home-knowledge">
        <div class="knowledge-top section-head">
          <span class="section-num">02</span>
          <div class="section-head-copy knowledge-copy">
            <div class="section-kicker">知识库</div>
            <h2>卡住的时候，<em>查一下。</em></h2>
            <p>课上的每个名词都有出处。检索条目、术语或结构文档，再回到对应的制作课。</p>
          </div>
          <form class="knowledge-search" id="homeKbSearch" role="search">
            <label class="sr-only" for="homeKbSearchInput">搜索知识库</label>
            <input id="homeKbSearchInput" name="q" type="search" placeholder="Sidechain、808、Supersaw、八段结构…" autocomplete="off">
            <button type="submit">${uiIcon('search')} 检索</button>
          </form>
        </div>
        <div class="knowledge-quick">
          <span class="mono-label">TRY / 常查</span>
          ${['Sidechain', '808', 'Supersaw', '八段结构'].map((term) => `<a class="chip" href="#/search?q=${encodeURIComponent(term)}">${escapeHtml(term)}</a>`).join('')}
        </div>
        <div class="knowledge-links">
          <a class="knowledge-link" href="#/atlas">
            <span class="knowledge-link-icon">${uiIcon('atlas')}</span>
            <span><strong>风格图谱</strong><small>${familyTotal} 个大族 · ${formatNumber(stats.entries)} 条</small></span>
            ${uiIcon('arrow')}
          </a>
          <a class="knowledge-link" href="#/guide/glossary">
            <span class="knowledge-link-icon">${uiIcon('library')}</span>
            <span><strong>术语手册</strong><small>鼓组、合成、效果与曲式</small></span>
            ${uiIcon('arrow')}
          </a>
          <a class="knowledge-link" href="#/guide/production">
            <span class="knowledge-link-icon">${uiIcon('lab')}</span>
            <span><strong>结构与音色</strong><small>七组音色 · 八段结构</small></span>
            ${uiIcon('arrow')}
          </a>
          <a class="knowledge-link" href="#/guide/history">
            <span class="knowledge-link-icon">${uiIcon('source')}</span>
            <span><strong>历史脉络</strong><small>技术、场景与地理</small></span>
            ${uiIcon('arrow')}
          </a>
        </div>
        ${spectrumHTML()}
      </section>

      <section class="section home-tools">
        <div class="home-tools-head section-head">
          <span class="section-num">03</span>
          <div class="section-head-copy">
            <div class="section-kicker">动手</div>
            <h2>不只看。先听，再调。</h2>
          </div>
          <p>练习不是考试，是把耳朵校准到制作决定上。</p>
        </div>
        <div class="tool-band">
          <a class="tool-slab is-practice" href="#/practice">
            <span class="tool-slab-icon">${uiIcon('practice')}</span>
            <span class="tool-slab-copy">
              <span class="mono-label">EARTRAIN / 听辨</span>
              <strong>风格四选一 + BPM 估速</strong>
              <small>答错直接回到相关课时，不在原地困惑。</small>
            </span>
            <span class="tool-slab-cta">开始练习 ${uiIcon('arrow')}</span>
          </a>
          <a class="tool-slab is-lab" href="#/lab">
            <span class="tool-slab-icon">${uiIcon('lab')}</span>
            <span class="tool-slab-copy">
              <span class="mono-label">SOUND LAB / 音色</span>
              <strong>七组音色，随时开合</strong>
              <small>先关掉所有层，再一层层加回来。</small>
            </span>
            <span class="tool-slab-cta">打开实验室 ${uiIcon('arrow')}</span>
          </a>
        </div>
      </section>`;
    bindHomeSequencer();
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
        <a class="toolbar-button" href="#/listen" data-tooltip="按速度与律动找，不需要先知道流派名">按听感找</a>
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
                    <div class="example-title">${escapeHtml(example.title)}</div>
                    ${example.artist ? `<div class="example-artist">${escapeHtml(example.artist)}</div>` : ''}
                    <div class="example-feedback" hidden></div>
                  </div>
                  ${exampleActions(example)}
                </li>`).join('')}</ul>` : '<p class="aside-relation-note">原始资料未列例曲。</p>'}
            </section>
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

  function renderPractice() {
    if (practiceMode === 'style' && !styleQuiz) newStyleQuiz();
    if (practiceMode === 'bpm' && !bpmQuiz) newBpmQuiz();
    const quiz = practiceMode === 'style' ? styleQuiz : bpmQuiz;
    main.innerHTML = `
      ${pageHead({
        code: '05',
        label: 'PRACTICE',
        title: '听辨练习',
        lead: '先听一小段合成示例，再判断风格或估 BPM。答错不是失败，重听一遍比记住答案更重要。',
        stats: [
          { label: '得分', value: `${practiceStats.score}<span>/${practiceStats.total}</span>` },
          { label: '连对', value: String(practiceStats.streak) },
          { label: '最佳', value: String(practiceStats.bestStreak) },
        ],
      })}
      <section class="practice-body">
        <div class="practice-switch" role="group" aria-label="练习模式">
          <button class="segment${practiceMode === 'style' ? ' is-active' : ''}" type="button" data-practice-mode="style">风格听辨</button>
          <button class="segment${practiceMode === 'bpm' ? ' is-active' : ''}" type="button" data-practice-mode="bpm">BPM 估速</button>
          <span class="practice-switch-hint">按 <kbd>1</kbd> 到 <kbd>4</kbd> 作答 · <kbd>空格</kbd> 重听</span>
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
          </div>` : `
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
          </div>`}
        <div class="practice-note">
          <p>所有练习片段都是浏览器实时合成的，不是原曲。答错后可以回到 <a href="#/guide/listen">听辨入门</a> 或 <a href="#/lab">音色实验室</a> 继续拆解。</p>
        </div>
      </section>`;
    bindPractice();
  }

  function bindPractice() {
    document.querySelectorAll('[data-practice-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        Audio?.stop();
        practiceMode = button.dataset.practiceMode;
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

    // Keyboard answers: 1-4 picks an option, space replays, Enter takes the next question.
    if (practiceKeyHandler) document.removeEventListener('keydown', practiceKeyHandler);
    practiceKeyHandler = (event) => {
      if (parseRoute().path !== '/practice') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === ' ') {
        event.preventDefault();
        if (practiceMode === 'style') document.querySelector('[data-practice-style-play]')?.click();
        else document.querySelector('[data-practice-bpm-play]')?.click();
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

  function renderLibrary() {
    const stats = WEB.manifest?.stats || KB.meta.stats || {};
    const activeFamilies = KB.families.filter((family) => !family.archive && !family.supplement);
    const families = activeFamilies.slice(0, 8);
    const tools = [
      { title: '按速度找风格', text: '不知道叫什么？用多快、鼓怎么落地、低音什么样来查。', href: '#/listen', meta: 'LISTEN', icon: 'listen' },
      { title: '风格图谱', text: '按大族、BPM、别名与上下位关系查。', href: '#/atlas', meta: 'ATLAS', icon: 'atlas' },
      { title: '术语手册', text: '曲式、鼓组、音色、设备、乐理与效果。', href: '#/guide/glossary', meta: 'GLOSSARY', icon: 'library' },
      { title: '结构与音色', text: '八段结构、七组音色与频谱分工。', href: '#/guide/production', meta: 'GUIDE', icon: 'lab' },
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
              <div class="results-meta">“${escapeHtml(query)}” · ${escapeHtml(group.label)} · ${result.count} 条${result.count > result.results.length ? `（展示前 ${result.results.length} 条）` : ''}</div>
            </div>
            <a class="section-link" href="#/module">在 Agent 中调用</a>
          </div>
          ${lessonMatches.length ? `<div class="course-match-panel"><span class="course-match-label">相关课程</span><div class="chip-row">${lessonChipsHTML(lessonMatches)}</div></div>` : ''}
          ${result.results.length ? `<div class="search-result-list">${result.results.map((item) => searchResultHTML(item, query)).join('')}</div>` : `
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
              ${['Uplifting Trance', '七组音色怎么分工', '808 bass', 'EDM 八段结构', 'ADSR', '现场为什么让人上瘾'].map((item) => `<a href="#/search?q=${encodeURIComponent(item)}">${escapeHtml(item)} ${uiIcon('arrow')}</a>`).join('')}
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
  //   · 用 BPM × 律动看全部风格（#/listen）
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

  const listenState = { band: '', groove: '', low: '', selected: '', expanded: new Set(), muted: new Set() };

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

  function listenMatches(data) {
    if (listenState.band && data.band !== listenState.band) return false;
    if (listenState.groove && data.groove !== listenState.groove) return false;
    if (listenState.low && data.low !== listenState.low) return false;
    return true;
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
        <a class="button-ghost" href="#/listen?band=${fam.band}">在矩阵里看</a>
      </section>`;
  }

  function listenFilterActive() {
    return Boolean(listenState.band || listenState.groove || listenState.low);
  }

  // 「听」的状态是地址栏的一部分：筛选、选中项都写进 hash，
  // 这样 听 → 条目 → 返回、刷新、把链接发给别人，看到的都是同一屏。
  function listenQuery() {
    const query = new URLSearchParams();
    if (listenState.band) query.set('band', listenState.band);
    if (listenState.groove) query.set('groove', listenState.groove);
    if (listenState.low) query.set('low', listenState.low);
    if (listenState.selected) query.set('s', listenState.selected);
    const text = query.toString();
    return text ? `?${text}` : '';
  }

  function syncListenHash() {
    // replaceState 不触发 hashchange，所以不会让 render 递归
    replaceHash(`#/listen${listenQuery()}`);
  }

  let pendingScrollToSelected = false;

  /* ---------------------------------------------------------------- 入口页 */

  function renderListen(route) {
    const styles = listenStyles();
    const params = route.params;
    const deepLink = ['band', 'groove', 'low', 's'].some((key) => params.has(key));
    if (deepLink) {
      // 从条目页、大族页或别人发的链接进来：以链接为准
      listenState.band = params.get('band') || '';
      listenState.groove = params.get('groove') || '';
      listenState.low = params.get('low') || '';
      listenState.selected = params.get('s') || '';
      pendingScrollToSelected = params.has('s');
    }
    // 没有参数 = 从导航回来，沿用上次的状态
    const selectedId = listenState.selected || (styles[0] && styles[0].id) || '';
    listenState.selected = selectedId;
    syncListenHash();

    main.innerHTML = `
      ${pageHead({
        code: '00',
        label: 'LISTEN',
        title: '先听出区别，<em>再记名字</em>。',
        lead: '不用先学会流派名。<b>多快</b>、<b>鼓怎么落地</b>、<b>低音什么样</b>——三个问题就能把范围收到几个。点任意风格直接听，卡片可以存成图发进群里。',
        action: { href: '#/quick', label: '现场速查' },
        stats: [
          { label: '风格', value: String(styles.length) },
          { label: '合成配方', value: String(Object.keys(FP_BANK).length) },
          { label: '片段', value: '8 秒' },
        ],
      })}
      <section class="listen-asks" aria-label="按听感筛选">
        ${listenFilterRow('band', '多快', LISTEN.bands.map((band) => ({ id: band.id, label: band.name, note: band.range })), '01')}
        ${listenFilterRow('groove', '鼓怎么落地', LISTEN.grooves.map((groove) => ({ id: groove.id, label: groove.name, note: groove.hint })), '02')}
        ${listenFilterRow('low', '低音呢', LISTEN.lows.map((low) => ({ id: low.id, label: low.name })), '03')}
      </section>
      <p class="listen-count" id="listenCount"></p>
      <p class="listen-scroll" aria-hidden="true">← 左右滑动，看 4 档速度 →</p>
      <div class="listen-layout">
        <div class="listen-matrix-wrap"><div class="listen-matrix" id="listenMatrix"></div></div>
        <aside class="listen-panel" id="listenPanel"></aside>
      </div>
      <p class="listen-hint">横轴是每分钟多少拍，纵轴是鼓怎么落地。<b>真正决定身体感受的是纵轴</b>——所以 Trap 和 Hardstyle 都在最右一列，感受却完全相反。空白格标「少见」，是真的少见，不是没做完。</p>`;

    renderListenBody();
    bindListenFilters();
  }

  function listenFilterRow(kind, label, options, step) {
    return `
      <div class="lf-row">
        <span class="lf-label"><b>${escapeHtml(step)}</b>${escapeHtml(label)}</span>
        <div class="lf-opts">
          ${options.map((option) => `
            <button class="lf-chip${listenState[kind] === option.id ? ' is-on' : ''}" type="button" data-lf="${kind}" data-value="${option.id}">
              ${escapeHtml(option.label)}${option.note ? `<small>${escapeHtml(option.note)}</small>` : ''}
            </button>`).join('')}
        </div>
        <button class="lf-reset" type="button" data-lf-reset>${listenState[kind] ? '清除' : ''}</button>
      </div>`;
  }

  function renderListenBody() {
    const matrix = document.getElementById('listenMatrix');
    const panel = document.getElementById('listenPanel');
    const count = document.getElementById('listenCount');
    if (!matrix || !panel) return;

    const styles = listenStyles();
    matrix.innerHTML = `
      <div class="lm-head"></div>
      ${LISTEN.bands.map((band) => `
        <div class="lm-head">
          <span>${escapeHtml(band.range)} BPM</span>
          <strong>${escapeHtml(band.name)}</strong>
          <em>${escapeHtml(band.feel)}</em>
        </div>`).join('')}
      ${LISTEN.grooves.map((groove) => `
        <div class="lm-row">
          <strong>${escapeHtml(groove.name)}</strong>
          <span>${escapeHtml(groove.hint)}</span>
          <span>${escapeHtml(groove.tech)}</span>
        </div>
        ${LISTEN.bands.map((band) => matrixCell(band, groove, styles)).join('')}`).join('')}`;

    const matched = styles.filter((item) => listenMatches(item.data));
    if (count) {
      if (!matched.length) {
        count.innerHTML = '没有完全匹配的风格。<b>少答一个问题</b>试试——三个条件同时成立的情况确实不多。';
      } else if (listenFilterActive()) {
        count.innerHTML = `收到 <b>${matched.length}</b> 个候选 · 点任意一个直接听`;
      } else {
        // 待归档不是大族，不计入这句统计
        const activeFamilyCount = [...new Set(styles.map((item) => item.entry.familyId))]
          .filter((id) => !familyById.get(id)?.archive).length;
        count.innerHTML = `${styles.length} 个风格 · ${activeFamilyCount} 个大族 · 每个都能听 8 秒`;
      }
    }

    const selected = styles.find((item) => item.id === listenState.selected) || matched[0] || styles[0];
    panel.innerHTML = selected ? listenPanelHTML(selected) : '<p class="lp-empty">左边选一个风格。</p>';
    bindListenPanel(selected);
    matrix.querySelectorAll('[data-style]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = styles.find((style) => style.id === button.dataset.style);
        if (!item) return;
        listenState.selected = item.id;
        syncListenHash();
        renderListenBody();
        playListen(item);
      });
    });
    matrix.querySelectorAll('[data-more]').forEach((button) => {
      button.addEventListener('click', () => {
        listenState.expanded.add(button.dataset.more);
        renderListenBody();
      });
    });

    if (pendingScrollToSelected) {
      pendingScrollToSelected = false;
      const chip = matrix.querySelector(`[data-style="${listenState.selected}"]`);
      const wrap = matrix.closest('.listen-matrix-wrap');
      if (chip && wrap) {
        const chipBox = chip.getBoundingClientRect();
        const wrapBox = wrap.getBoundingClientRect();
        if (chipBox.left < wrapBox.left || chipBox.right > wrapBox.right) {
          wrap.scrollLeft += chipBox.left - wrapBox.left - 14;
        }
      }
    }
  }

  function matrixCell(band, groove, styles) {
    const key = `${band.id}/${groove.id}`;
    const items = styles.filter((item) => item.data.band === band.id && item.data.groove === groove.id);
    if (!items.length) return '<div class="lm-cell"><span class="lm-empty">少见</span></div>';
    const expanded = listenState.expanded.has(key);
    const shown = expanded ? items : items.slice(0, 4);
    const rest = items.length - shown.length;
    const dim = listenFilterActive() && !items.some((item) => listenMatches(item.data));
    return `
      <div class="lm-cell${dim ? ' is-dim' : ''}">
        ${shown.map((item) => {
          const data = item.data;
          return `<button class="lm-chip${item.id === listenState.selected ? ' is-on' : ''}" type="button" data-style="${item.id}">
            <b>${escapeHtml(item.entry.name)}</b>
            <span>${item.model.bpm}${data.felt ? ` · 像${data.felt}` : ''}${listenMatches(data) ? '' : ' ·'}</span>
          </button>`;
        }).join('')}
        ${rest > 0 ? `<button class="lm-more" type="button" data-more="${key}">+${rest} 个</button>` : ''}
      </div>`;
  }

  function listenPanelHTML(item) {
    const model = item.model;
    const source = model.bpmSource === 'source' ? '原文明确' : '编辑推断';
    return `
      <span class="mono-label">NOW / ${escapeHtml(model.bandName)} · ${model.bpm} BPM</span>
      <h2 class="lp-name">${escapeHtml(model.name)}</h2>
      <p class="lp-meta">${escapeHtml(model.zh)}</p>
      <p class="lp-line">${escapeHtml(model.oneLine)}</p>
      <ul class="lp-hear">
        ${[['01', '鼓', model.hear[0]], ['02', '低音', model.hear[1]], ['03', '空间', model.hear[2]]].map((row) => `
          <li><b>${row[0]}</b><em>${row[1]}</em><span>${escapeHtml(row[2])}</span></li>`).join('')}
      </ul>
      <p class="lp-when"><span>什么时候会听到</span>${escapeHtml(model.when)}</p>
      <div class="lp-actions">
        <button class="button-primary" type="button" data-lp-play>播放 8 秒</button>
        ${['all', 'drums', 'bass', 'chord', 'lead'].map((layer) => `
          <button class="lp-solo${layer === 'all' && listenState.muted.size === 0 ? ' is-on' : ''}${listenState.muted.has(layer) ? ' is-mute' : ''}"
            type="button" data-solo="${layer}">${layer === 'all' ? '全奏' : layer === 'drums' ? '鼓' : layer === 'bass' ? '低音' : layer === 'chord' ? '和弦' : '主音'}</button>`).join('')}
      </div>
      <div class="lp-actions" style="margin-top:8px">
        <button class="button-ghost" type="button" data-lp-share>做成卡片</button>
        <a class="button-ghost" href="#/genre/${model.id}">完整条目 →</a>
      </div>
      <p class="lp-foot">BPM ${escapeHtml(model.bpmLabel)} · ${source} · 配方 ${escapeHtml(model.fpLabel)}</p>`;
  }

  function bindListenFilters() {
    document.querySelectorAll('[data-lf]').forEach((button) => {
      button.addEventListener('click', () => {
        const kind = button.dataset.lf;
        const value = button.dataset.value;
        listenState[kind] = listenState[kind] === value ? '' : value;
        const row = button.closest('.lf-row');
        row.parentElement.querySelectorAll(`[data-lf="${kind}"]`).forEach((chip) => {
          chip.classList.toggle('is-on', listenState[kind] === chip.dataset.value);
        });
        const reset = row.querySelector('[data-lf-reset]');
        if (reset) reset.textContent = listenState[kind] ? '清除' : '';
        syncListenHash();
        renderListenBody();
      });
    });
    document.querySelectorAll('[data-lf-reset]').forEach((button) => {
      button.addEventListener('click', () => {
        listenState.band = '';
        listenState.groove = '';
        listenState.low = '';
        document.querySelectorAll('[data-lf]').forEach((chip) => chip.classList.remove('is-on'));
        document.querySelectorAll('[data-lf-reset]').forEach((reset) => { reset.textContent = ''; });
        syncListenHash();
        renderListenBody();
      });
    });
  }

  function listenPanelEls() {
    return {
      play: document.querySelector('[data-lp-play]'),
      share: document.querySelector('[data-lp-share]'),
      solos: [...document.querySelectorAll('[data-solo]')],
    };
  }

  function bindListenPanel(item) {
    if (!item) return;
    const { play, share, solos } = listenPanelEls();
    if (play) {
      play.addEventListener('click', () => playListen(item));
    }
    if (share) {
      share.addEventListener('click', () => {
        if (!window.EMShare) return;
        window.EMShare.open(item.model);
      });
    }
    solos.forEach((button) => {
      button.addEventListener('click', () => {
        const layer = button.dataset.solo;
        if (layer === 'all') listenState.muted.clear();
        else if (listenState.muted.has(layer)) listenState.muted.delete(layer);
        else listenState.muted.add(layer);
        Audio?.setFingerprintLayers([...listenState.muted]);
        renderListenBody();
      });
    });
  }

  function playListen(item) {
    if (!Audio || !Audio.supported) return;
    const state = Audio.getState();
    const demoId = `fp:${item.model.fp}`;
    if (state.playing && state.demoId === demoId) {
      Audio.stop();
      return;
    }
    const ok = Audio.playFingerprint(item.model.fp, {
      bpm: item.model.bpm,
      label: `${item.entry.name} · ${item.model.bpm} BPM`,
    });
    if (ok) {
      // playFingerprint 会重置层级，所以重放时把静音状态写回去
      Audio.setFingerprintLayers([...listenState.muted]);
      document.querySelector('[data-lp-play]')?.classList.add('is-playing');
    }
  }

  /* ------------------------------------------------------- 条目页的听感块 */

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
              <a class="button-ghost" href="#/listen?band=${model.band.id}&groove=${model.groove.id}&s=${model.id}">在矩阵里看 →</a>
            </div>
            <p class="lc-note">BPM 来源：${source}（${escapeHtml(model.bpmLabel)}）。试听是浏览器实时合成的骨架，不是原曲；下面的正文才是完整的风格资料。</p>
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
        <a class="button-ghost" href="#/listen?band=${fam.band.id}&groove=${fam.groove.id}">用 BPM 找风格</a>
      </section>`;
  }

  function mountListenBlock(entry) {
    bindExamplePreviews();
    const canvas = document.getElementById('genreListenCanvas');
    const model = listenModel(entry);
    if (canvas && model && window.EMShare) window.EMShare.draw(canvas, model);

    document.querySelectorAll('[data-genre-play]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!model) return;
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
        const state = Audio?.getState();
        if (state && state.playing && state.demoId === `fp:${fam.fp}`) Audio.stop();
        else Audio?.playFingerprint(fam.fp, { bpm: fam.bpm, label: `${fam.fpLabel} · 同族示例` });
      });
    }
  }

  /* -------------------------------------------------------------- DJ 工具 */

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
      <p class="listen-hint">规则是保守的：它只会告诉你「能不能直接接」，真正好不好听还得你自己听。右侧的 BPM 都是编辑推断的区间中点，不是唱片上印的数字。</p>`;

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
            <p class="dj-quick-note">${hits.length} 个候选${hits.length > shown.length ? `，先列前 ${shown.length} 个` : ''}。点是直接听 8 秒；想看得更细就去 <a href="#/listen">听</a> 里看整张矩阵。</p>`
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

  function exampleActions(example) {
    const term = [example.artist, example.title].filter(Boolean).join(' ').trim();
    const query = encodeURIComponent(term || example.title);
    const original = example.url
      ? `<a class="example-link" href="${escapeHtml(example.url)}" target="_blank" rel="noopener noreferrer">原始链接 ↗</a>`
      : '';
    return `
      <div class="example-actions">
        <button class="example-preview" type="button" data-preview="${escapeHtml(term)}">试听 30 秒</button>
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

  function searchItunesPreview(term, callback) {
    const name = `__emItunes${(examplePreviewSeq += 1)}`;
    const script = document.createElement('script');
    const timer = window.setTimeout(() => {
      cleanup();
      callback(null);
    }, 8000);
    function cleanup() {
      window.clearTimeout(timer);
      try { delete window[name]; } catch { window[name] = undefined; }
      script.remove();
    }
    window[name] = (data) => {
      cleanup();
      const hit = data && Array.isArray(data.results) ? data.results[0] : null;
      callback(hit && hit.previewUrl
        ? { previewUrl: hit.previewUrl, trackName: hit.trackName, artistName: hit.artistName }
        : null);
    };
    script.onerror = () => {
      cleanup();
      callback(null);
    };
    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1&callback=${name}`;
    document.head.appendChild(script);
  }

  function playExamplePreview(button) {
    const term = button.dataset.preview;
    if (!term) return;
    if (button.classList.contains('is-playing')) {
      stopExamplePreview();
      return;
    }
    const item = button.closest('.example-item');
    const feedback = item ? item.querySelector('.example-feedback') : null;
    stopExamplePreview();

    const finish = (payload) => {
      button.classList.remove('is-loading');
      if (!payload || !payload.previewUrl) {
        button.textContent = '没有预览';
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = 'Apple 曲库里没有这一条。用右边的 B 站 / 网易云搜同名曲。';
        }
        window.setTimeout(() => { button.textContent = '试听 30 秒'; }, 2600);
        return;
      }
      exampleAudio = new window.Audio(payload.previewUrl); // 站点自己的 Audio 是 EMAudio，这里必须用 window.Audio
      exampleAudio.volume = 0.85;
      exampleAudio.play().then(() => {
        button.classList.add('is-playing');
        button.textContent = '停止';
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = `正在试听：${payload.trackName} — ${payload.artistName}（30 秒官方预览）`;
        }
      }).catch(() => {
        button.textContent = '播放失败';
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = '浏览器拦下了这次播放，再点一次试试。';
        }
      });
      exampleAudio.addEventListener('ended', stopExamplePreview, { once: true });
    };

    if (previewCache.has(term)) {
      finish(previewCache.get(term));
      return;
    }
    button.classList.add('is-loading');
    button.textContent = '查询中…';
    searchItunesPreview(term, (payload) => {
      previewCache.set(term, payload);
      finish(payload);
    });
  }

  function bindExamplePreviews() {
    document.querySelectorAll('[data-preview]').forEach((button) => {
      button.addEventListener('click', () => playExamplePreview(button));
    });
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
            <a class="lf-chip" href="#/listen">回到矩阵</a>
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
    else if (route.path === '/listen') renderListen(route);
    else if (route.path === '/dj') renderDj(route);
    else if (route.path === '/quick') renderQuick(route);
    else if (route.path.startsWith('/card/')) renderCardPage(route);
    else if (route.path === '/studio') renderStudio();
    else if (route.path === '/learn') renderLearn();
    else if (route.path.startsWith('/learn/')) renderLesson(route);
    else if (route.path === '/library') renderLibrary();
    else if (route.path === '/practice') renderPractice();
    else if (route.path === '/lab') renderLab();
    else if (route.path === '/search') renderSearch(route);
    else if (route.path.startsWith('/doc/')) renderDoc(route);
    else if (route.path === '/module') renderModule();
    else if (route.path === '/atlas') renderAtlas(route);
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
    if (path === '/listen') return '听：用速度与律动找风格 · 电音档案';
    if (path === '/dj') return '过渡检查 · 电音档案';
    if (path === '/quick') return '现场速查 · 电音档案';
    if (path.startsWith('/card/')) return '风格卡 · 电音档案';
    if (path === '/studio') return '工作室 · 电音入门';
    if (path === '/learn') return '制作课 · 电音入门';
    if (path.startsWith('/learn/')) {
      let id = path.split('/')[2] || '';
      try {
        id = decodeURIComponent(id);
      } catch {
        // Keep raw ID.
      }
      const lesson = LESSON_BY_ID.get(id);
      return lesson ? `${lesson.title} · 电音入门` : '课程 · 电音入门';
    }
    if (path === '/library') return '知识库 · 电音入门';
    if (path === '/practice') return '听辨练习 · 电音入门';
    if (path === '/lab') return '音色实验室 · 电音入门';
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
    headerSearchPopover.innerHTML = `
      <div class="header-search-popover-head">
        <span class="mono-label">QUICK RESULTS</span>
        <span class="mono-label">${result.results.length} / ${result.count} 条 · 全库</span>
      </div>
      ${result.results.length ? `<div class="header-search-popover-list">${result.results.map((item) => `
        <a class="header-search-popover-item" href="${kbDocHref(item)}">
          <span class="type-badge type-${escapeHtml(item.type)}">${escapeHtml(kbTypeLabel(item.type))}</span>
          <span class="header-search-popover-title">${highlight(item.title, value)}</span>
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
        <div class="search-preview-head"><span class="mono-label">QUICK / 试试</span><span class="mono-label">覆盖条目 / 大族 / 指南 / 术语</span></div>
        <div class="chip-row">${CUR.tenStyles.slice(0, 6).map((style) => `<button class="chip" type="button" data-quick="${escapeHtml(style.name)}">${escapeHtml(style.name)}</button>`).join('')}</div>`;
      return;
    }
    const result = kbSearchAll(value, { limit: 5 });
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
            <span class="search-preview-title">${highlight(item.title, value)}</span>
            <span class="search-preview-meta">${escapeHtml(item.family || item.source?.title || '')}</span>
          </a>`).join('')}
      </div>`;
  }

  function submitSearch(query) {
    const value = String(query || '').trim();
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

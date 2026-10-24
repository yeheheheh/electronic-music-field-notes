/* ==========================================================================
   STUDIO — hands-on production modules
   --------------------------------------------------------------------------
   One shared project object feeds a single looping 4-bar audio session.
   Drums, chords, bass, melody and the effect chain all read from it, so an
   edit in one module is heard against everything you built in the others.
   Patterns are one bar long and repeat; the chord row changes per bar, which
   is what makes the bass follow the harmony instead of drifting.
   ========================================================================== */

(() => {
  const STORAGE_KEY = 'em-studio-v1';
  const BARS = 4;
  const STEPS = 16;

  const CHORD_META = {
    Fm: { label: 'Fm', notes: [53, 56, 60], roman: 'i', mood: '主和弦，最稳' },
    Ab: { label: 'Ab', notes: [56, 60, 63], roman: 'VI', mood: '拉开亮度' },
    Eb: { label: 'Eb', notes: [51, 55, 58], roman: 'VII', mood: '向下推进' },
    Bb: { label: 'Bb', notes: [58, 62, 65], roman: 'IV', mood: '悬着，想回主和弦' },
    Cm: { label: 'Cm', notes: [48, 51, 55], roman: 'v', mood: '更暗的小和弦' },
    Gm: { label: 'Gm', notes: [55, 58, 62], roman: 'ii', mood: '过渡' },
    Dm: { label: 'Dm', notes: [50, 53, 57], roman: 'vi', mood: '柔和转色' },
  };

  const SCALE = {
    name: 'F 自然小调',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    base: 65, // F4
    names: ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb', 'F'],
  };

  const DRUM_ROWS = [
    { id: 'kick', label: 'KICK', zh: '底鼓', hint: '低频的重心，通常落在 1、3 拍' },
    { id: 'clap', label: 'CLAP', zh: '拍手', hint: '2、4 拍回应，是最稳的骨架' },
    { id: 'hat', label: 'HAT', zh: '闭镲', hint: '八分或十六分，负责推动' },
    { id: 'openhat', label: 'OPEN', zh: '开镲', hint: '放在反拍，制造呼吸' },
  ];

  const BASS_ROWS = [
    { id: 0, label: 'R', zh: '根音' },
    { id: 1, label: '5', zh: '五度' },
    { id: 2, label: '8', zh: '八度' },
  ];

  const SECTIONS = {
    Intro: { zh: '前奏', layers: ['hat', 'chords'] },
    Build: { zh: '推进', layers: ['hat', 'clap', 'chords', 'bass'] },
    Drop: { zh: '高潮', layers: ['kick', 'clap', 'hat', 'openhat', 'chords', 'bass', 'melody'] },
    Break: { zh: '间奏', layers: ['chords', 'melody'] },
    Outro: { zh: '尾奏', layers: ['hat', 'chords'] },
  };

  // --- signal chain ---------------------------------------------------------

  // Five track types, named the way the glossary names them. `voice` is what
  // the track plays; `module` is where you go to edit its notes. Keeping those
  // two separate is what lets this module say "this track is empty" and point
  // at the right place instead of pretending to be a sequencer.
  const TRACKS = [
    { id: 'drums', label: 'DRUMS', zh: '鼓', voice: 'drums', module: 'beats', layer: 'kick', hint: '底鼓、拍手、镲都在这一条' },
    { id: 'bass', label: 'BASS', zh: '低音', voice: 'bass', module: 'bass', layer: 'bass', hint: '20–250 Hz 的地基' },
    { id: 'chords', label: 'CHORDS', zh: '和弦', voice: 'chords', module: 'chords', layer: 'chords', hint: '决定情绪的和声层' },
    { id: 'lead', label: 'LEAD', zh: '主奏', voice: 'lead', module: 'melody', layer: 'melody', hint: '在最前面的旋律' },
    { id: 'fx', label: 'FX', zh: '效果', voice: 'fx', module: 'sound', layer: null, hint: '过渡与冲击，不占主频段' },
  ];

  // Four inserts with fixed settings. The module changes their ORDER and
  // nothing else — see the note in audio.js for why that is load-bearing.
  const CHAIN_NODES = [
    { id: 'distortion', label: '失真', en: 'DISTORTION', role: '把波形削平，增加谐波', when: '放在最前面，后面的效果处理的就已经是失真的声音' },
    { id: 'eq', label: 'EQ', en: 'EQ', role: '削掉中低频、抬起存在感', when: '放在失真前会改变「削多少」，放在失真后只改变结果' },
    { id: 'compressor', label: '压缩', en: 'COMPRESSOR', role: '把动态压平，让整体更稳', when: '放在失真前压的是干声，放在后面压的是失真后的声音' },
    { id: 'reverb', label: '混响', en: 'REVERB', role: '加一个房间，把声音推远', when: '放在失真前，连混响尾巴一起被削；放在后面尾巴保持平滑' },
  ];

  const CHAIN_IDS = CHAIN_NODES.map((item) => item.id);

  // Two slots so A/B compares two orders of the SAME four effects. Storing
  // full arrays rather than one array plus a flag is what makes "switch back"
  // exact instead of an inverse-operation guess.
  const CHAIN_DEFAULT = {
    a: ['distortion', 'eq', 'compressor', 'reverb'],
    b: ['reverb', 'compressor', 'eq', 'distortion'],
    slot: 'a',
    touched: false,
  };

  // A reorder is only meaningful if it actually changes what you hear, so the
  // two orders are compared on the effects that do the colouring, not on the
  // array as a whole. Swapping EQ and compressor changes the order but barely
  // changes the sound; putting the reverb first is the audible one.
  //
  // The rank must be the index inside the order being inspected. An earlier
  // version filtered the fixed CHAIN_IDS list by presence, which returned the
  // same sequence for both slots and made every pair look identical.
  function chainIsAudiblyDifferent(a, b) {
    const rank = (order, id) => (Array.isArray(order) ? order.indexOf(id) : -1);
    return rank(a, 'reverb') !== rank(b, 'reverb')
      || rank(a, 'distortion') !== rank(b, 'distortion');
  }

  // Nine modules, numbered in production order. The ids of the original six are
  // deliberately unchanged so saved projects keep their `module` and `done{}`.
  // See docs/hands-on-modules-plan.md for why each boundary sits where it does.
  const MODULES = [
    {
      id: 'chain', num: '01', label: '信号链', en: 'CHAIN',
      title: '声音从哪里来，经过什么',
      lead: '五类轨道各放一个声部，点轨道头就能单独试听。再把四个效果器拖成一条链——顺序会改变结果，先失真后混响和先混响后失真是两种声音。',
      lesson: 'signal-chain-basics',
    },
    {
      id: 'beats', num: '02', label: '节拍', en: 'BEATS',
      title: '先让身体动起来',
      lead: '点亮格子放一个音，再点一次取消。鼓组循环一直在响，你可以边听边改。',
      lesson: 'drum-programming',
    },
    {
      id: 'bass', num: '03', label: '低音', en: 'BASS',
      title: '低音跟着和弦换根音',
      lead: '三行分别是根音、五度、八度。同一组音型会在四个小节里自动换根音。',
      lesson: 'kick-and-bass',
    },
    {
      id: 'chords', num: '04', label: '和弦', en: 'CHORDS',
      title: '四小节决定情绪',
      lead: '每一小节挑一个和弦。低音会自动跟着走，所以先定和弦，再写低音。',
      lesson: 'chord-progressions',
    },
    {
      id: 'melody', num: '05', label: '旋律', en: 'MELODY',
      title: '在音阶里找出一个动机',
      lead: '只有八个音可选，所以怎么点都不会跑调。先写两三个音，重复它。',
      lesson: 'lead-hook',
    },
    {
      id: 'sound', num: '06', label: '音色', en: 'SOUND',
      title: '同一个 Loop，换个性格',
      lead: '滤波器、失真、延迟、混响都在总线上，所以它们会同时改变鼓、和弦与旋律。',
      lesson: 'synth-controls',
    },
    {
      id: 'song', num: '07', label: '结构', en: 'SONG',
      title: '把 Loop 排成一首歌',
      lead: '给每个段落分配小节数，播放时按段落一层层加减。零小节的段落会被跳过。',
      lesson: 'structure-eight',
    },
    {
      id: 'mix', num: '08', label: '混音', en: 'MIX',
      title: '每层在自己的频段里清楚',
      lead: '七层各有一条通道：电平、三段 EQ、声像、发送量。好的混音不是每个组都响，而是互相让位。',
      lesson: 'eq-space',
    },
    {
      id: 'bounce', num: '09', label: '导出', en: 'BOUNCE',
      title: '把工程变成一首歌',
      lead: '渲染整首编排，试听，然后下载 WAV。到这里你手上就有一首自己做的曲子了。',
      lesson: 'finish-export',
    },
  ];

  const EMPTY_ROW = () => new Array(STEPS).fill(false);

  function defaultProject() {
    const kick = EMPTY_ROW();
    const clap = EMPTY_ROW();
    const hat = EMPTY_ROW();
    const openhat = EMPTY_ROW();
    [0, 4, 8, 12].forEach((i) => { kick[i] = true; });
    [4, 12].forEach((i) => { clap[i] = true; });
    [2, 6, 10, 14].forEach((i) => { hat[i] = true; });
    [7, 15].forEach((i) => { openhat[i] = true; });

    const bass = [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()];
    [0, 6, 8, 14].forEach((i) => { bass[0][i] = true; });

    const melody = Array.from({ length: 8 }, EMPTY_ROW);
    [0, 3, 6, 10].forEach((i, index) => { melody[[4, 2, 5, 3][index]][i] = true; });

    return {
      version: 1,
      bpm: 124,
      swing: 0,
      chords: ['Fm', 'Ab', 'Eb', 'Bb'],
      drums: { kick, clap, hat, openhat },
      bass,
      melody,
      sound: {
        cutoff: 14000,
        resonance: 0.9,
        drive: 0,
        delay: 0.18,
        reverb: 0.35,
        bassCutoff: 680,
        bassDrive: 0,
        osc: 'sawtooth',
        chordVoice: 'stab',
        melodyVoice: 'pluck',
        touched: false,
      },
      structure: [
        { id: 's1', section: 'Intro', bars: 4 },
        { id: 's2', section: 'Build', bars: 4 },
        { id: 's3', section: 'Drop', bars: 8 },
        { id: 's4', section: 'Break', bars: 4 },
        { id: 's5', section: 'Drop', bars: 8 },
        { id: 's6', section: 'Outro', bars: 4 },
      ],
      chain: { ...CHAIN_DEFAULT, a: [...CHAIN_DEFAULT.a], b: [...CHAIN_DEFAULT.b] },
      module: 'beats',
      done: {},
    };
  }

  // Saved chains may predate an effect being added, or be hand-edited in
  // localStorage. Repair rather than reject: the module's whole subject is
  // order, so a chain missing an effect would teach the wrong thing.
  function normalizeChain(raw) {
    const base = { ...CHAIN_DEFAULT, a: [...CHAIN_DEFAULT.a], b: [...CHAIN_DEFAULT.b] };
    if (!raw || typeof raw !== 'object') return base;
    const clean = (list) => {
      const ids = (Array.isArray(list) ? list : []).filter((id) => CHAIN_IDS.includes(id));
      for (const id of CHAIN_IDS) if (!ids.includes(id)) ids.push(id);
      return ids;
    };
    return {
      a: clean(raw.a),
      b: clean(raw.b),
      slot: raw.slot === 'b' ? 'b' : 'a',
      touched: Boolean(raw.touched),
    };
  }

  // The order currently in force. Everything that reads the chain goes through
  // here so A/B, the audio and the picture cannot disagree about which one is on.
  function chainOrder(slot) {
    const chain = project.chain || CHAIN_DEFAULT;
    return chain[slot === 'b' ? 'b' : (slot || chain.slot || 'a')] || CHAIN_DEFAULT.a;
  }

  function loadProject() {
    const base = defaultProject();
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return base;
      return {
        ...base,
        ...raw,
        drums: { ...base.drums, ...(raw.drums || {}) },
        sound: { ...base.sound, ...(raw.sound || {}) },
        bass: Array.isArray(raw.bass) && raw.bass.length === 3 ? raw.bass : base.bass,
        melody: Array.isArray(raw.melody) && raw.melody.length === 8 ? raw.melody : base.melody,
        chords: Array.isArray(raw.chords) && raw.chords.length === BARS ? raw.chords : base.chords,
        structure: Array.isArray(raw.structure) && raw.structure.length ? raw.structure : base.structure,
        chain: normalizeChain(raw.chain),
        done: raw.done && typeof raw.done === 'object' ? raw.done : {},
      };
    } catch (error) {
      return base;
    }
  }

  function saveProject() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch (error) {
      // Progress is optional; private mode may block storage.
    }
  }

  let project = defaultProject();
  // L2 view state, keyed by module id. Loaded once per mount.
  let uiState = {};
  let host = null;
  let ui = null;
  let playing = false;
  let raf = 0;
  let songMode = false;
  let songClock = null;
  // Painting a row. Pointer capture is deliberately not used: it routes every
  // move to the first cell and suppresses `pointerenter` on its siblings, and
  // touch never fires `pointerenter` at all. The cell under the cursor is
  // resolved by hit-testing instead, which works for mouse, pen and touch.
  let paint = null;
  let pendingTap = null;
  let lastPreviewAt = 0;
  // Set when the studio is opened from a lesson: the page then shows where you
  // came from and which module that lesson actually asks for.
  let entry = null;
  // Embedded mode renders one module straight into a lesson page: no page head,
  // no module tabs, no second transport. The lesson already provides the frame.
  let embedded = false;

  // `root = document` only covers `undefined`; an explicit `null` still slips
  // through and throws. Several call sites legitimately pass the (possibly
  // null) host, so fall back here instead of guarding every caller.
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => [...(root || document).querySelectorAll(selector)];

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name, api) {
    return api && api.uiIcon ? api.uiIcon(name) : '';
  }

  // --- derived data ---------------------------------------------------------

  const count = (row) => (row || []).filter(Boolean).length;
  const chordNotes = (name) => (CHORD_META[name] ? CHORD_META[name].notes : [53, 56, 60]);

  // How many notes a track currently carries. The chain module shows this so
  // "试听" is never a mystery: an empty track still makes a sound, and the
  // readout says why the loop itself is silent on that layer.
  function trackNoteCount(track) {
    if (track.id === 'drums') {
      return Object.values(project.drums || {}).reduce((sum, row) => sum + count(row), 0);
    }
    if (track.id === 'bass') return (project.bass || []).reduce((sum, row) => sum + count(row), 0);
    if (track.id === 'chords') return count(project.chords);
    if (track.id === 'lead') return (project.melody || []).reduce((sum, row) => sum + count(row), 0);
    return 0; // FX is generated, not programmed.
  }

  function barChordRoot(bar) {
    const chord = CHORD_META[project.chords[bar]];
    return chord ? chord.notes[0] : 53;
  }

  function bassNoteName(row) {
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const root = barChordRoot(0) - 12 + [0, 7, 12][row];
    return names[((root % 12) + 12) % 12];
  }

  function melodyNoteName(row) {
    return SCALE.names[row] || '—';
  }

  // Progress means "you touched it", not "the demo happens to satisfy a rule".
  // The starter loop already sounds finished, so a condition-based badge would
  // show 5/6 on first visit and teach nothing.
  function completion() {
    const done = project.done || {};
    const state = {};
    for (const item of MODULES) state[item.id] = Boolean(done[item.id]);
    return state;
  }

  function markDone(id) {
    if (!id) return;
    project.done = project.done || {};
    if (project.done[id]) return;
    project.done[id] = true;
    saveProject();
    refreshStatus();
  }

  function doneCount() {
    const state = completion();
    return MODULES.filter((item) => state[item.id]).length;
  }

  // --- song gating ----------------------------------------------------------

  // Which bar of the *arrangement* is playing? The session loops every 4 bars,
  // so `head.bar` alone would restart the arrangement every 4 bars. absBar keeps
  // counting across loops and wraps at the arrangement's own total length.
  function songBarAt(absBar) {
    const total = songTotalBars();
    if (!total) return -1;
    return ((absBar % total) + total) % total;
  }

  // The pure gate. Given a bar number and a project, return the copy of the
  // project that should sound at that bar. No UI state, no clock, no DOM.
  //
  // This used to be split in two: `activeLayers()` read a `songClock` that the
  // requestAnimationFrame loop advanced from the UI playhead, and `readForAudio`
  // turned that into a gated copy. Two consequences: the arrangement switched
  // sections on the UI's frame rate rather than the audio clock, and the offline
  // renderer had no way to reuse the logic. A pure function fixes both and lets
  // the exporter walk bars 0..N through exactly the same code the speakers use.
  function gateForBar(projectState, bar) {
    if (!songMode) return projectState;
    const blocks = (projectState.structure || []).filter((item) => item.bars > 0);
    if (!blocks.length) return projectState;
    const total = blocks.reduce((sum, item) => sum + Math.max(0, item.bars), 0);
    if (!total) return projectState;
    const position = ((bar % total) + total) % total;

    let acc = 0;
    let block = blocks[blocks.length - 1];
    for (const item of blocks) {
      if (position >= acc && position < acc + item.bars) { block = item; break; }
      acc += item.bars;
    }

    const layers = new Set(SECTIONS[block.section] ? SECTIONS[block.section].layers : []);
    const blank = EMPTY_ROW();
    return {
      ...projectState,
      drums: {
        kick: layers.has('kick') ? projectState.drums.kick : blank,
        clap: layers.has('clap') ? projectState.drums.clap : blank,
        hat: layers.has('hat') ? projectState.drums.hat : blank,
        openhat: layers.has('openhat') ? projectState.drums.openhat : blank,
      },
      bass: layers.has('bass') ? projectState.bass : [blank, blank, blank],
      melody: layers.has('melody') ? projectState.melody : Array.from({ length: 8 }, () => blank),
      chords: layers.has('chords') ? projectState.chords : ['', '', '', ''],
      __section: block.section,
    };
  }

  // The audio session calls this on every 16th. absBar comes from the session's
  // own clock, so the arrangement follows the sound rather than the screen.
  function readForAudio(absBar) {
    if (!songMode) return project;
    if (typeof absBar !== 'number' || !Number.isFinite(absBar)) return project;
    return gateForBar(project, songBarAt(absBar));
  }

  // --- rendering -----------------------------------------------------------

  // Shown only when arriving from a lesson. It answers the two questions the
  // jump creates: where am I, and how do I get back.
  function entryHTML() {
    if (!entry) return '';
    const back = `#/learn/${encodeURIComponent(entry.id)}`;
    return `
      <div class="st-entry">
        <span class="st-entry-tag">来自制作课</span>
        <div class="st-entry-copy">
          <strong>${esc(entry.title || '上一课')}</strong>
          ${entry.chapter ? `<small>${esc(entry.chapter)}</small>` : ''}
        </div>
        <a class="st-entry-back" href="${back}">回到这一课${icon('arrow', ui)}</a>
      </div>`;
  }

  function transportHTML() {
    return `
      <div class="st-transport" data-st-transport>
        <button class="st-play" type="button" data-st-play aria-pressed="false">
          <span class="st-play-icon" data-st-play-icon>${icon('play', ui)}</span>
          <span data-st-play-label>播放</span>
        </button>
        <div class="st-transport-meta">
          <label class="st-bpm">
            <span>BPM</span>
            <input type="range" min="90" max="150" step="1" value="${project.bpm}" data-st-bpm>
            <output data-st-bpm-out>${project.bpm}</output>
          </label>
          <label class="st-swing">
            <span>SWING</span>
            <input type="range" min="0" max="60" step="1" value="${Math.round(project.swing * 100)}" data-st-swing>
            <output data-st-swing-out>${Math.round(project.swing * 100)}%</output>
          </label>
        </div>
        <div class="st-barread" data-st-barread aria-live="off">
          <span class="st-barread-label">BAR</span>
          <span class="st-barread-value" data-st-bar>1</span>
          <span class="st-barread-of">/ ${BARS}</span>
        </div>
        <div class="st-stepnav" role="group" aria-label="模块切换">
          <button class="st-ghost st-stepnav-btn" type="button" data-st-module-prev aria-label="上一个模块">${icon('arrow', ui)}<span>上一块</span></button>
          <button class="st-ghost st-stepnav-btn" type="button" data-st-module-next aria-label="下一个模块"><span>下一块</span>${icon('arrow', ui)}</button>
        </div>
        <button class="st-ghost" type="button" data-st-reset-all>恢复示范</button>
      </div>`;
  }

  function tabsHTML(active) {
    return `
      <nav class="st-tabs" aria-label="工作室模块">
        ${MODULES.map((item) => {
          const ok = completion()[item.id];
          return `<button class="st-tab${item.id === active ? ' is-active' : ''}${ok ? ' is-done' : ''}" type="button" data-st-tab="${item.id}" aria-current="${item.id === active ? 'true' : 'false'}">
            <span class="st-tab-num">${item.num}</span>
            <span class="st-tab-label">${item.label}</span>
            <span class="st-tab-en">${item.en}</span>
            <i class="st-tab-dot" aria-hidden="true"></i>
          </button>`;
        }).join('')}
      </nav>`;
  }

  function stepGridHTML({ rows, kind, labelHeader = 'STEP' }) {
    const head = Array.from({ length: STEPS }, (_, step) => {
      const beat = step % 4 === 0;
      return `<span class="st-cell-head${beat ? ' is-beat' : ''}">${beat ? step / 4 + 1 : ''}</span>`;
    }).join('');

    const body = rows.map((row) => `
      <div class="st-row" data-st-row="${row.key}">
        <div class="st-row-head">
          <span class="st-row-label">${esc(row.label)}</span>
          <span class="st-row-zh">${esc(row.zh)}</span>
        </div>
        <div class="st-cells" role="group" aria-label="${esc(row.zh)} 步进格">
          ${Array.from({ length: STEPS }, (_, step) => {
            const on = Boolean(row.cells[step]);
            const beat = step % 4 === 0;
            return `<button class="st-cell${on ? ' is-on' : ''}${beat ? ' is-beat' : ''}" type="button"
              data-st-cell data-st-kind="${kind}" data-st-row="${row.key}" data-st-step="${step}"
              aria-pressed="${on}" aria-label="${esc(row.zh)} 第 ${step + 1} 格"></button>`;
          }).join('')}
        </div>
      </div>`).join('');

    return `<div class="st-grid" data-st-grid="${kind}">
      <div class="st-row st-row-head-only"><div class="st-row-head"></div><div class="st-cells st-cells-head">${head}</div></div>
      ${body}
    </div>`;
  }

  const PRESETS = {
    beats: [
      { name: '四拍 House', apply: () => { const p = defaultProject(); project.drums = p.drums; } },
      {
        name: 'Breakbeat',
        apply: () => {
          const kick = EMPTY_ROW(); const clap = EMPTY_ROW(); const hat = EMPTY_ROW(); const openhat = EMPTY_ROW();
          [0, 3, 10].forEach((i) => { kick[i] = true; });
          [4, 12].forEach((i) => { clap[i] = true; });
          [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { hat[i] = true; });
          [7, 15].forEach((i) => { openhat[i] = true; });
          project.drums = { kick, clap, hat, openhat };
        },
      },
      {
        name: 'Half-time',
        apply: () => {
          const kick = EMPTY_ROW(); const clap = EMPTY_ROW(); const hat = EMPTY_ROW(); const openhat = EMPTY_ROW();
          [0, 7].forEach((i) => { kick[i] = true; });
          [8].forEach((i) => { clap[i] = true; });
          [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { hat[i] = true; });
          project.drums = { kick, clap, hat, openhat };
        },
      },
    ],
    bass: [
      {
        name: '八分推进',
        apply: () => {
          const rows = [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()];
          [0, 2, 4, 6, 8, 10, 12, 14].forEach((i) => { rows[0][i] = true; });
          project.bass = rows;
        },
      },
      {
        name: '反拍低音',
        apply: () => {
          const rows = [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()];
          [2, 6, 10, 14].forEach((i) => { rows[0][i] = true; });
          project.bass = rows;
        },
      },
      {
        name: '根音 + 八度',
        apply: () => {
          const rows = [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()];
          [0, 6, 10].forEach((i) => { rows[0][i] = true; });
          [8].forEach((i) => { rows[2][i] = true; });
          project.bass = rows;
        },
      },
    ],
    melody: [
      {
        name: '三音动机',
        apply: () => {
          const rows = Array.from({ length: 8 }, EMPTY_ROW);
          [0, 4, 8, 12].forEach((i) => { rows[4][i] = true; });
          [2, 10].forEach((i) => { rows[2][i] = true; });
          [6, 14].forEach((i) => { rows[5][i] = true; });
          project.melody = rows;
        },
      },
      {
        name: '上行',
        apply: () => {
          const rows = Array.from({ length: 8 }, EMPTY_ROW);
          [0, 4, 8, 12].forEach((i, index) => { rows[index * 2][i] = true; });
          project.melody = rows;
        },
      },
      {
        name: '长音',
        apply: () => {
          const rows = Array.from({ length: 8 }, EMPTY_ROW);
          rows[7][0] = true;
          rows[4][8] = true;
          project.melody = rows;
        },
      },
    ],
    chords: [
      { name: 'i – VI – III – VII', apply: () => { project.chords = ['Fm', 'Ab', 'Eb', 'Bb']; } },
      { name: 'i – iv – VII – III', apply: () => { project.chords = ['Fm', 'Bb', 'Eb', 'Ab']; } },
      { name: 'vi – IV – i – v', apply: () => { project.chords = ['Dm', 'Bb', 'Fm', 'Cm']; } },
    ],
  };

  function presetsHTML(kind) {
    const list = PRESETS[kind];
    if (!list) return '';
    return `<div class="st-presets" role="group" aria-label="${kind} 预设">
      <span class="st-presets-label">预设</span>
      ${list.map((item, index) => `<button class="st-preset" type="button" data-st-preset="${kind}:${index}">${esc(item.name)}</button>`).join('')}
      <button class="st-preset is-clear" type="button" data-st-clear="${kind}">清空</button>
    </div>`;
  }

  function panelBeats() {
    const rows = DRUM_ROWS.map((row) => ({
      key: row.id, label: row.label, zh: `${row.zh}`, cells: project.drums[row.id],
    }));
    const total = DRUM_ROWS.reduce((sum, row) => sum + count(project.drums[row.id]), 0);
    return `
      <div class="st-panel" data-st-panel="beats">
        ${presetsHTML('beats')}
        ${stepGridHTML({ rows, kind: 'drums' })}
        <div class="st-readout">
          <span><b>${total}</b> 个音在响</span>
          <span>底鼓 <b>${count(project.drums.kick)}</b></span>
          <span>拍手 <b>${count(project.drums.clap)}</b></span>
          <span>镲 <b>${count(project.drums.hat) + count(project.drums.openhat)}</b></span>
          <span class="st-readout-hint">空格键 播放 / 停止</span>
        </div>
        <ul class="st-tips">
          ${DRUM_ROWS.map((row) => `<li><span>${row.label}</span>${esc(row.hint)}</li>`).join('')}
        </ul>
      </div>`;
  }

  function panelChords() {
    const palette = Object.keys(CHORD_META);
    return `
      <div class="st-panel" data-st-panel="chords">
        ${presetsHTML('chords')}
        <div class="st-chord-bars">
          ${project.chords.map((current, bar) => `
            <div class="st-chord-bar" data-st-bar-index="${bar}">
              <div class="st-chord-bar-head">
                <span class="st-chord-bar-num">${bar + 1}</span>
                <span class="st-chord-bar-label">小节 ${bar + 1}</span>
                <button class="st-chord-listen" type="button" data-st-chord-listen="${bar}" aria-label="试听第 ${bar + 1} 小节和弦">${icon('wave', ui)} 听</button>
              </div>
              <div class="st-chord-options">
                ${palette.map((name) => {
                  const meta = CHORD_META[name];
                  return `<button class="st-chord${name === current ? ' is-active' : ''}" type="button"
                    data-st-chord="${name}" data-st-chord-bar="${bar}" aria-pressed="${name === current}">
                    <strong>${meta.label}</strong>
                    <small>${meta.roman}</small>
                  </button>`;
                }).join('')}
              </div>
              <p class="st-chord-mood">${current ? `${esc(current)} · ${esc(CHORD_META[current] ? CHORD_META[current].mood : '')}` : '未选择'}</p>
            </div>`).join('')}
        </div>
        <div class="st-readout">
          <span>进行 <b>${project.chords.map((c) => esc(c || '—')).join(' – ')}</b></span>
          <span>调性 <b>${SCALE.name}</b></span>
          <span class="st-readout-hint">换和弦后低音与旋律会自动跟上</span>
        </div>
      </div>`;
  }

  function panelBass() {
    const rows = BASS_ROWS.map((row) => ({
      key: String(row.id), label: row.label, zh: row.zh, cells: project.bass[row.id],
    }));
    const total = project.bass.reduce((sum, row) => sum + count(row), 0);
    return `
      <div class="st-panel" data-st-panel="bass">
        ${presetsHTML('bass')}
        <div class="st-barctx" aria-hidden="true">
          ${project.chords.map((name, index) => `<span class="st-barctx-item"><i>${index + 1}</i>${esc(name || '—')}</span>`).join('')}
        </div>
        ${stepGridHTML({ rows, kind: 'bass' })}
        <div class="st-readout">
          <span><b>${total}</b> 个音</span>
          <span>根音 <b>${bassNoteName(0)}</b></span>
          <span>五度 <b>${bassNoteName(1)}</b></span>
          <span>八度 <b>${bassNoteName(2)}</b></span>
          <span class="st-readout-hint">四小节共用这一组音型，根音随和弦移动</span>
        </div>
      </div>`;
  }

  function panelMelody() {
    const rows = [];
    for (let row = 7; row >= 0; row -= 1) {
      rows.push({
        key: String(row),
        label: melodyNoteName(row),
        zh: row === 7 ? '高八度' : `第 ${row + 1} 级`,
        cells: project.melody[row],
      });
    }
    const total = project.melody.reduce((sum, row) => sum + count(row), 0);
    return `
      <div class="st-panel" data-st-panel="melody">
        ${presetsHTML('melody')}
        <div class="st-scale-strip" aria-hidden="true">
          ${SCALE.names.map((name) => `<span>${name}</span>`).join('')}
        </div>
        ${stepGridHTML({ rows, kind: 'melody' })}
        <div class="st-readout">
          <span><b>${total}</b> 个音</span>
          <span>音阶 <b>${SCALE.name}</b></span>
          <span class="st-readout-hint">八个音都在调内，随便点不会错</span>
        </div>
      </div>`;
  }

  function sliderRow({ id, label, hint, min, max, step, value, display, log = false }) {
    return `
      <label class="st-slider">
        <span class="st-slider-head"><b>${esc(label)}</b><output data-st-out="${id}">${esc(display)}</output></span>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-st-sound="${id}"${log ? ' data-st-log="1"' : ''}>
        <small>${esc(hint)}</small>
      </label>`;
  }

  function panelSound() {
    const s = project.sound;
    return `
      <div class="st-panel" data-st-panel="sound">
        <div class="st-sound-grid">
          ${sliderRow({ id: 'cutoff', label: '滤波器', hint: '往左闷、往右亮；它接在总线上，鼓也一样受影响', min: 0, max: 100, step: 1, value: Math.round(Math.log10(s.cutoff / 220) / Math.log10(18000 / 220) * 100), display: `${Math.round(s.cutoff)} Hz`, log: true })}
          ${sliderRow({ id: 'resonance', label: '共振', hint: '在截止点附近加一点尖角，太多会啸叫', min: 0, max: 16, step: 0.1, value: s.resonance, display: Number(s.resonance).toFixed(1) })}
          ${sliderRow({ id: 'drive', label: '失真', hint: '让声音变脏、变厚，Bass 与鼓最明显', min: 0, max: 100, step: 1, value: Math.round(s.drive * 100), display: `${Math.round(s.drive * 100)}%` })}
          ${sliderRow({ id: 'delay', label: '延迟', hint: '按附点八分的时值重复，制造空间感', min: 0, max: 100, step: 1, value: Math.round(s.delay * 100), display: `${Math.round(s.delay * 100)}%` })}
          ${sliderRow({ id: 'reverb', label: '混响', hint: '给整个 Loop 一个房间；过多会糊', min: 0, max: 100, step: 1, value: Math.round(s.reverb * 100), display: `${Math.round(s.reverb * 100)}%` })}
          ${sliderRow({ id: 'bassCutoff', label: 'Bass 滤波', hint: '只影响低音，决定它是闷的还是带齿的', min: 180, max: 2400, step: 10, value: s.bassCutoff, display: `${Math.round(s.bassCutoff)} Hz` })}
        </div>
        <div class="st-voice-grid">
          <label class="st-voice">
            <span>Bass 波形</span>
            <select data-st-voice="osc">
              <option value="sawtooth"${s.osc === 'sawtooth' ? ' selected' : ''}>锯齿 saw</option>
              <option value="square"${s.osc === 'square' ? ' selected' : ''}>方波 square</option>
              <option value="triangle"${s.osc === 'triangle' ? ' selected' : ''}>三角 triangle</option>
            </select>
          </label>
          <label class="st-voice">
            <span>和弦音色</span>
            <select data-st-voice="chordVoice">
              <option value="stab"${s.chordVoice === 'stab' ? ' selected' : ''}>短促 stab</option>
              <option value="pad"${s.chordVoice === 'pad' ? ' selected' : ''}>铺底 pad</option>
            </select>
          </label>
          <label class="st-voice">
            <span>旋律音色</span>
            <select data-st-voice="melodyVoice">
              <option value="pluck"${s.melodyVoice === 'pluck' ? ' selected' : ''}>拨弦 pluck</option>
              <option value="lead"${s.melodyVoice === 'lead' ? ' selected' : ''}>主奏 lead</option>
              <option value="bell"${s.melodyVoice === 'bell' ? ' selected' : ''}>铃 bell</option>
            </select>
          </label>
          <button class="st-audition" type="button" data-st-audition>${icon('play', ui)} 试听当前音色</button>
        </div>
        <div class="st-readout">
          <span>当前 <b>${s.chordVoice === 'pad' ? 'Pad 铺底' : 'Stab 短促'}</b></span>
          <span>Bass <b>${s.osc}</b></span>
          <span>旋律 <b>${s.melodyVoice}</b></span>
          <span class="st-readout-hint">播放中调参，下一拍就能听到</span>
        </div>
      </div>`;
  }

  function songTotalBars() {
    return project.structure.reduce((sum, item) => sum + Math.max(0, item.bars), 0);
  }

  function panelSong() {
    return `
      <div class="st-panel" data-st-panel="song">
        <div class="st-song">
          ${project.structure.map((block, index) => `
            <div class="st-song-block" data-st-song-block="${index}" data-section="${block.section}">
              <div class="st-song-head">
                <span class="st-song-num">${String(index + 1).padStart(2, '0')}</span>
                <select data-st-section="${index}" aria-label="第 ${index + 1} 段类型">
                  ${Object.keys(SECTIONS).map((name) => `<option value="${name}"${block.section === name ? ' selected' : ''}>${name} · ${SECTIONS[name].zh}</option>`).join('')}
                </select>
                <button class="st-song-remove" type="button" data-st-song-remove="${index}" aria-label="删除第 ${index + 1} 段">${icon('close', ui)}</button>
              </div>
              <div class="st-song-bars">
                <button type="button" data-st-song-bars="${index}:-4" aria-label="减少小节">−</button>
                <strong>${block.bars}<small> 小节</small></strong>
                <button type="button" data-st-song-bars="${index}:4" aria-label="增加小节">+</button>
              </div>
              <div class="st-song-layers">
                ${(SECTIONS[block.section] ? SECTIONS[block.section].layers : []).map((layer) => `<i>${layer}</i>`).join('')}
              </div>
            </div>`).join('')}
          <button class="st-song-add" type="button" data-st-song-add>${icon('plus', ui)} 加一段</button>
        </div>
        <div class="st-readout">
          <span>总长 <b>${songTotalBars()}</b> 小节</span>
          <span>约 <b>${Math.round(songTotalBars() * 4 * 60 / project.bpm)}</b> 秒</span>
          <button class="st-song-play" type="button" data-st-song-play aria-pressed="false">
            <span data-st-song-play-label>播放整首</span>
          </button>
        </div>
        <ul class="st-tips">
          <li><span>Intro</span>只有镲与和弦，先建立空间</li>
          <li><span>Build</span>加拍手与低音，能量往上推</li>
          <li><span>Drop</span>全部进入，这是最响的一段</li>
          <li><span>Break</span>抽掉鼓，只留和弦与旋律</li>
        </ul>
      </div>`;
  }

  // Switching modules must not restart audio: the loop keeps running so the
  // change you just made is heard immediately in context.
  // --- module view state (L2) ----------------------------------------------
  //
  // Three layers of state, each with a different lifetime:
  //   L1 the project  — what you built.  localStorage: em-studio-v1
  //   L2 the view     — where you were looking. localStorage: em-studio-ui-v1
  //   L3 the session  — playing or not. Never persisted: a restored autoplay
  //                     would be blocked by the browser's autoplay policy, so
  //                     reloading correctly lands on "stopped".
  //
  // L2 exists because switching modules used to lose your place: scroll to the
  // bottom of the arrangement, hop to the beat grid and back, and you were at
  // the top again. Only the scroll offset is stored — everything else in a
  // panel is derived from the project and rebuilt on render.

  const UI_KEY = 'em-studio-ui-v1';

  function loadUiState() {
    try {
      const raw = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (error) {
      return {};
    }
  }

  function saveUiState() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(uiState));
    } catch (error) {
      // View state is a nicety; private mode may block storage.
    }
  }

  // Scroll positions are measured relative to the panel host, not the window,
  // so they stay valid when the page itself is scrolled or the layout reflows.
  function rememberScroll(id) {
    if (!id || !host) return;
    const panel = $('[data-st-panel]', host);
    if (!panel) return;
    uiState[id] = uiState[id] || {};
    uiState[id].scroll = host.scrollTop || 0;
    saveUiState();
  }

  function restoreScroll(id) {
    if (!id || !host) return;
    const saved = uiState[id];
    if (!saved || !saved.scroll) return;
    // The new panel has just been written to the DOM; its height is only known
    // after layout, so restoring in the same frame would clamp to 0. Two frames
    // is enough in practice and costs nothing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (host) host.scrollTop = saved.scroll;
      });
    });
  }

  function stepModule(delta) {
    const index = MODULES.findIndex((item) => item.id === project.module);
    if (index < 0) return;
    const next = index + delta;
    // Stop at the ends instead of wrapping: the numbering is a production
    // order, and jumping from "导出" back to "信号链" would read as a loop.
    if (next < 0 || next >= MODULES.length) return;
    switchModule(MODULES[next].id);
  }

  // The switch protocol, in order. The sequence matters:
  //   1. persist the *outgoing* module's view state — must happen before
  //      project.module changes, or the offset gets filed under the new module
  //   2. record the new module id
  //   3. re-render the panel — this never touches audio
  //   4. restore the incoming module's scroll offset
  //   5. repaint the playhead so a switch mid-playback shows the current
  //      position immediately instead of an empty grid for one frame
  //
  // Audio is deliberately untouched throughout: the nine modules share one loop
  // and one bus, so switching swaps the control surface, not the sound. That is
  // what makes "change a kick, hop to the bass, keep listening" work.
  function switchModule(id) {
    if (!MODULES.some((item) => item.id === id)) return;
    if (id === project.module && host && $('[data-st-panel]', host)) {
      // Same module: nothing to swap, but still make sure the light is right.
      paintPlayhead();
      return;
    }

    rememberScroll(project.module);          // 1
    project.module = id;                      // 2
    saveProject();

    if (!host) return;
    $$('[data-st-tab]', host).forEach((tab) => {
      const on = tab.dataset.stTab === id;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-current', String(on));
    });
    renderPanel();                            // 3
    restoreScroll(id);                        // 4
    refreshStatus();                          // 5 (statusHTML also repaints)
    paintPlayhead();
    syncStepNav();
    syncEmbedLink();
  }

  // The embedded footer links to the full studio with the current module in the
  // query string. renderPanel() only rebuilds the panel body, so that link would
  // keep pointing at whichever module was open on first render.
  function syncEmbedLink() {
    if (!host || !embedded) return;
    const link = $('.st-embed-link', host);
    if (link) link.setAttribute('href', `#/studio?m=${project.module}`);
  }

  // Grey out the end stops so the linear order is visible without clicking.
  function syncStepNav() {
    if (!host) return;
    const index = MODULES.findIndex((item) => item.id === project.module);
    const prev = $('[data-st-module-prev]', host);
    const next = $('[data-st-module-next]', host);
    if (prev) prev.disabled = index <= 0;
    if (next) next.disabled = index < 0 || index >= MODULES.length - 1;
  }

  // --- new modules (P1 scaffolding) ----------------------------------------
  //
  // `mix` and `bounce` are deliberately honest about their state. The plan
  // (docs/hands-on-modules-plan.md) specifies real interactive controls for
  // each, but shipping dead switches would be worse than shipping none: a
  // fader that does nothing teaches the wrong thing about what a fader is.
  //
  // So each panel states what it will do, lists the lesson tasks it will carry,
  // and links to the lesson that explains the concept. The audio, the state and
  // the switching all work; only the controls are pending.
  //
  // `chain` used to live here and is now a real module — see panelChain().

  const ROADMAP = {
    mix: {
      will: [
        '七层通道条：电平 / 三段 EQ / 声像 / 混响发送 / 延迟发送',
        '频段占用图：Sub / Low / Mid / High 四段实时占用',
        '总线电平表：峰值与余量，对应「留 headroom」',
      ],
      tasks: [
        { lesson: 'gain-stage', title: '增益结构与总线', task: '调每层电平，让总线留出余量。' },
        { lesson: 'eq-space', title: 'EQ 与频段让位', task: '每层三段 EQ，让频段占用图不再重叠。' },
        { lesson: 'space-stereo', title: '混响、延迟与立体声', task: '做出「一个近、一个远、一个宽」。' },
      ],
      why: '现在只能整体调音色（总线），不能单独调某一层。混音要的正是层与层之间的相对关系。',
    },
    bounce: {
      will: [
        '两个项目模板：House（124 BPM）与 Trap（140 BPM）',
        '成品概览：BPM、调性、总小节数、时长、结构图',
        '离线渲染 → 波形预览 → 下载 WAV',
        '5 行复盘表单',
      ],
      tasks: [
        { lesson: 'project-house', title: '项目一：House 8 小节 Loop', task: '套用 House 模板，六层都有内容。' },
        { lesson: 'project-bass', title: '项目二：Trap / Dubstep', task: '套用 Trap 模板，听到半拍与 808。' },
        { lesson: 'finish-export', title: '结构收束、导出与复盘', task: '渲染、试听、下载 WAV、填复盘。' },
      ],
      why: '这是「产出一首属于自己的电音」的最后一步。渲染用的是同一套合成器，只是换一个离线上下文。',
    },
  };

  function panelRoadmap(id) {
    const plan = ROADMAP[id] || { will: [], tasks: [], why: '' };
    return `
      <div class="st-panel" data-st-panel="${id}">
        <div class="st-roadmap">
          <div class="st-roadmap-note">
            <strong>这一块还在搭</strong>
            <p>${esc(plan.why)}</p>
          </div>
          <div class="st-roadmap-cols">
            <div>
              <h3>建成后能做什么</h3>
              <ul class="st-roadmap-list">
                ${plan.will.map((item) => `<li>${esc(item)}</li>`).join('')}
              </ul>
            </div>
            <div>
              <h3>它会承接的课时任务</h3>
              <ul class="st-roadmap-tasks">
                ${plan.tasks.map((item) => `
                  <li>
                    <a href="#/learn/${encodeURIComponent(item.lesson)}">${esc(item.title)}</a>
                    <span>${esc(item.task)}</span>
                  </li>`).join('')}
              </ul>
            </div>
          </div>
          <p class="st-roadmap-foot">
            在此之前，这一课要练的东西可以在
            <a href="#/learn/${encodeURIComponent(plan.tasks[0] ? plan.tasks[0].lesson : 'learn')}">对应课时</a>
            里用现有播放器先听。九个模块的完整方案写在
            <a href="#/about">来源页</a>说明里。
          </p>
        </div>
      </div>`;
  }

  // --- module 01: signal chain ---------------------------------------------
  //
  // Two exercises in one panel, matching the two lessons it carries:
  //   `daw-and-tracks`        — five tracks, each assigned a voice, click to hear it
  //   `signal-chain-basics`   — drag four effects into a different order, A/B it
  //
  // Scope is deliberately narrow: this module changes ORDER and nothing else.
  // Note editing lives in the beats/bass/chords/melody modules and effect
  // settings live in the sound module, so there is exactly one place to change
  // each thing. See docs/hands-on-modules-plan.md §3.1.

  function chainSignalHTML() {
    const order = chainOrder();
    return `
      <div class="st-signal-head">
        <span class="mono-label">信号流 / SIGNAL FLOW</span>
      </div>
      <div class="st-signal" role="list" aria-label="信号链路径">
        <div class="st-signal-node is-source" role="listitem">
          <span class="st-signal-tag">MIDI</span>
          <strong>音符</strong>
        </div>
        <span class="st-signal-arrow" aria-hidden="true">${icon('arrow', ui)}</span>
        <div class="st-signal-node is-source" role="listitem">
          <span class="st-signal-tag">音源</span>
          <strong>五条轨道</strong>
        </div>
        <span class="st-signal-arrow" aria-hidden="true">${icon('arrow', ui)}</span>
        ${order.map((id, index) => {
          const node = CHAIN_NODES.find((item) => item.id === id);
          return `
            <div class="st-signal-node" role="listitem" data-st-signal-node="${id}">
              <span class="st-signal-tag">${index + 1}</span>
              <strong>${esc(node ? node.label : id)}</strong>
            </div>
            ${index < order.length - 1 ? `<span class="st-signal-arrow" aria-hidden="true">${icon('arrow', ui)}</span>` : ''}`;
        }).join('')}
        <span class="st-signal-arrow" aria-hidden="true">${icon('arrow', ui)}</span>
        <div class="st-signal-node is-bus" role="listitem">
          <span class="st-signal-tag">总线</span>
          <strong>输出</strong>
        </div>
      </div>`;
  }

  function chainTracksHTML() {
    return `
      <div class="st-tracks" data-st-tracks>
        ${TRACKS.map((track) => {
          const notes = trackNoteCount(track);
          return `
            <div class="st-track" data-st-track="${track.id}">
              <button class="st-track-head" type="button" data-st-track-audition="${track.id}"
                aria-label="试听 ${esc(track.zh)} 轨道">
                <span class="st-track-play" aria-hidden="true">${icon('play', ui)}</span>
                <span class="st-track-name">
                  <strong>${esc(track.label)}</strong>
                  <small>${esc(track.zh)}</small>
                </span>
              </button>
              <div class="st-track-meta">
                <span class="st-track-voice">${esc(track.voice)}</span>
                <span class="st-track-notes">${notes ? `${notes} 个音` : '空轨'}</span>
              </div>
              <a class="st-track-edit" href="#/studio?m=${track.module}">去编辑</a>
            </div>`;
        }).join('')}
      </div>`;
  }

  function chainBoardHTML() {
    const chain = project.chain || CHAIN_DEFAULT;
    const order = chainOrder();
    return `
      <div class="st-chain-board" data-st-chain-board data-st-slot="${esc(chain.slot)}">
        <div class="st-chain-slots" role="group" aria-label="A/B 对比">
          <span class="st-chain-slots-label">对比</span>
          ${['a', 'b'].map((slot) => `
            <button class="st-chain-slot${chain.slot === slot ? ' is-active' : ''}" type="button"
              data-st-chain-slot="${slot}" aria-pressed="${chain.slot === slot}">
              <strong>${slot.toUpperCase()}</strong>
              <small>${(chain[slot] || []).map((id) => {
                const node = CHAIN_NODES.find((item) => item.id === id);
                return node ? node.label : id;
              }).join(' → ')}</small>
            </button>`).join('')}
        </div>
        <ul class="st-chain" data-st-chain role="list">
          ${order.map((id, index) => {
            const node = CHAIN_NODES.find((item) => item.id === id) || { id, label: id, en: id, role: '', when: '' };
            return `
              <li class="st-chain-node" data-st-chain-node="${id}" data-st-chain-index="${index}" draggable="true">
                <span class="st-chain-grip" aria-hidden="true" title="拖动排序">
                  <i></i><i></i><i></i>
                </span>
                <div class="st-chain-body">
                  <div class="st-chain-head">
                    <span class="st-chain-order">${index + 1}</span>
                    <strong>${esc(node.label)}</strong>
                    <em>${esc(node.en)}</em>
                  </div>
                  <p class="st-chain-role">${esc(node.role)}</p>
                  <p class="st-chain-when">${esc(node.when)}</p>
                </div>
                <div class="st-chain-move">
                  <button class="st-chain-btn" type="button" data-st-chain-move="${index}:-1"
                    aria-label="把${esc(node.label)}上移一位"${index === 0 ? ' disabled' : ''}>${icon('arrow', ui)}</button>
                  <button class="st-chain-btn" type="button" data-st-chain-move="${index}:1"
                    aria-label="把${esc(node.label)}下移一位"${index === order.length - 1 ? ' disabled' : ''}>${icon('arrow', ui)}</button>
                </div>
              </li>`;
          }).join('')}
        </ul>
      </div>`;
  }

  function panelChain() {
    const chain = project.chain || CHAIN_DEFAULT;
    const order = chainOrder();
    const other = chain.slot === 'a' ? 'b' : 'a';
    const different = chainIsAudiblyDifferent(chain.a, chain.b);
    const orderText = order.map((id) => {
      const node = CHAIN_NODES.find((item) => item.id === id);
      return node ? node.label : id;
    }).join(' → ');
    return `
      <div class="st-panel" data-st-panel="chain">
        ${chainSignalHTML()}
        <div class="st-chain-grid">
          <section class="st-chain-col">
            <h3 class="st-chain-title">五条轨道 <span>点轨道头试听</span></h3>
            ${chainTracksHTML()}
          </section>
          <section class="st-chain-col">
            <h3 class="st-chain-title">效果器链 <span>拖动手柄，或用 ↑↓ 换位</span></h3>
            ${chainBoardHTML()}
          </section>
        </div>
        <div class="st-readout">
          <span>顺序 <b>${esc(orderText)}</b></span>
          <span>当前 <b>${esc(chain.slot.toUpperCase())}</b></span>
          <span class="st-readout-hint">${different ? `按「切到 ${other.toUpperCase()}」听另一种顺序` : '两套顺序听起来几乎一样——把混响或失真挪到另一端试试'}</span>
        </div>
        <ul class="st-tips">
          <li><span>顺序</span>效果器像流水线：先失真后混响，和先混响后失真，是两种声音。</li>
          <li><span>参数</span>这里只改顺序。音量与音色在「音色」模块，音符内容在各自模块。</li>
          <li><span>拖动</span>播放中也能改：已经发声的音保持原样，下一拍起走新链路。</li>
        </ul>
      </div>`;
  }

  function panelMix() { return panelRoadmap('mix'); }
  function panelBounce() { return panelRoadmap('bounce'); }

  function panelFor(id) {
    if (id === 'chain') return panelChain();
    if (id === 'chords') return panelChords();
    if (id === 'bass') return panelBass();
    if (id === 'melody') return panelMelody();
    if (id === 'sound') return panelSound();
    if (id === 'song') return panelSong();
    if (id === 'mix') return panelMix();
    if (id === 'bounce') return panelBounce();
    return panelBeats();
  }

  function renderPanel() {
    const active = MODULES.find((item) => item.id === project.module) || MODULES[0];
    const panel = $('[data-st-panel-host]', host);
    if (!panel) return;
    panel.innerHTML = `
      <header class="st-module-head">
        <div class="st-module-index"><span>${active.num}</span><em>${active.en}</em></div>
        <div class="st-module-copy">
          <h2>${active.title}</h2>
          <p>${active.lead}</p>
        </div>
        <a class="st-module-lesson" href="#/learn/${active.lesson}">对应课程 ${icon('arrow', ui)}</a>
      </header>
      ${panelFor(active.id)}`;
    bindPanel(active.id);
    paintPlayhead();
  }

  // --- interaction ---------------------------------------------------------

  function toggleCell(kind, row, step, forced, silent) {
    let target;
    if (kind === 'drums') target = project.drums[row];
    else if (kind === 'bass') target = project.bass[Number(row)];
    else target = project.melody[Number(row)];
    if (!target) return;
    const next = typeof forced === 'boolean' ? forced : !target[step];
    if (target[step] === next) return;
    target[step] = next;
    const cell = $(`[data-st-cell][data-st-kind="${kind}"][data-st-row="${row}"][data-st-step="${step}"]`, host);
    if (cell) {
      cell.classList.toggle('is-on', next);
      cell.setAttribute('aria-pressed', String(next));
    }
    if (!silent) {
      previewCell(kind, row, step, next);
      lastPreviewAt = Date.now();
    }
    markDone(kind === 'drums' ? 'beats' : kind === 'bass' ? 'bass' : 'melody');
    refreshStatus();
    saveProject();
  }

  function previewCell(kind, row, step, on) {
    if (!on || !window.EMAudio || !window.EMAudio.supported) return;
    if (kind === 'melody') {
      const note = SCALE.base + SCALE.intervals[Number(row) % 7] + Math.floor(Number(row) / 7) * 12;
      window.EMAudio.previewStudio({ notes: [note], duration: 0.35, type: 'triangle', gain: 0.08 });
    } else if (kind === 'bass') {
      const note = barChordRoot(Math.floor(step / 4)) - 12 + [0, 7, 12][Number(row)];
      window.EMAudio.previewStudio({ notes: [note], duration: 0.3, type: 'sawtooth', gain: 0.09, reverb: 0.1 });
    }
  }

  function refreshStatus() {
    const done = completion();
    $$('[data-st-tab]', host).forEach((tab) => {
      const id = tab.dataset.stTab;
      tab.classList.toggle('is-done', Boolean(done[id]));
    });
    const badge = $('[data-st-done]', host);
    if (badge) badge.innerHTML = `${doneCount()}<span>/${MODULES.length}</span>`;
    const readout = $('[data-st-readout-host]', host);
    if (readout) readout.innerHTML = statusHTML();
  }

  function statusHTML() {
    const done = completion();
    const active = project.module;
    const ready = done[active];
    return `
      <div class="st-status">
        <span class="st-status-dot${ready ? ' is-ready' : ''}" aria-hidden="true"></span>
        <div class="st-status-copy">
          <strong>${ready ? '这一模块已完成' : '继续调整，完成度会自动更新'}</strong>
          <small>${MODULES.filter((item) => done[item.id]).map((item) => item.label).join(' · ') || '还没有完成的模块'}</small>
        </div>
        <button class="st-status-link" type="button" data-st-next="${nextModule() || ''}">${nextModule() ? `下一模块 · ${(MODULES.find((m) => m.id === nextModule()) || {}).label || ''}` : '全部完成'}${icon('arrow', ui)}</button>
      </div>
      `;
  }

  function nextModule() {
    const done = completion();
    const item = MODULES.find((entry) => !done[entry.id]);
    return item ? item.id : null;
  }

  function bindPanel(id) {
    const panel = $(`[data-st-panel="${id}"]`, host);
    if (!panel) return;

    if (id === 'chain') bindChainPanel(panel);

    $$('[data-st-cell]', panel).forEach((cell) => {
      cell.addEventListener('pointerdown', (event) => {
        if (event.button > 0) return;
        const kind = cell.dataset.stKind;
        const row = cell.dataset.stRow;
        const step = Number(cell.dataset.stStep);
        const next = !cell.classList.contains('is-on');

        if (event.pointerType === 'touch') {
          // Touch stays available for scrolling, so a toggle only counts as a
          // tap: commit on release, and only if the finger stayed put.
          pendingTap = { kind, row, step, next, x: event.clientX, y: event.clientY };
          return;
        }

        event.preventDefault();
        toggleCell(kind, row, step, next);
        paint = { panel, row: `${kind}:${row}`, value: next };
      });
    });

    $$('[data-st-preset]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const [kind, index] = button.dataset.stPreset.split(':');
        const preset = (PRESETS[kind] || [])[Number(index)];
        if (!preset) return;
        preset.apply();
        saveProject();
        markDone(kind);
        renderPanel();
        refreshStatus();
        ensurePlaying();
      });
    });

    $$('[data-st-clear]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const kind = button.dataset.stClear;
        if (kind === 'beats') {
          Object.keys(project.drums).forEach((key) => { project.drums[key] = EMPTY_ROW(); });
        } else if (kind === 'bass') {
          project.bass = [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()];
        } else if (kind === 'melody') {
          project.melody = Array.from({ length: 8 }, EMPTY_ROW);
        }
        saveProject();
        renderPanel();
        refreshStatus();
      });
    });

    $$('[data-st-chord]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const bar = Number(button.dataset.stChordBar);
        project.chords[bar] = button.dataset.stChord;
        saveProject();
        const barEl = button.closest('.st-chord-bar');
        $$('.st-chord', barEl).forEach((item) => {
          const on = item === button;
          item.classList.toggle('is-active', on);
          item.setAttribute('aria-pressed', String(on));
        });
        const mood = $('.st-chord-mood', barEl);
        if (mood) {
          const meta = CHORD_META[button.dataset.stChord];
          mood.textContent = `${button.dataset.stChord} · ${meta ? meta.mood : ''}`;
        }
        if (window.EMAudio && window.EMAudio.supported) {
          window.EMAudio.previewStudio({ notes: chordNotes(button.dataset.stChord), duration: 1.1, type: 'sawtooth', gain: 0.06, reverb: 0.3 });
        }
        markDone('chords');
        refreshStatus();
        ensurePlaying();
      });
    });

    $$('[data-st-chord-listen]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const bar = Number(button.dataset.stChordListen);
        if (window.EMAudio && window.EMAudio.supported) {
          window.EMAudio.previewStudio({ notes: chordNotes(project.chords[bar]), duration: 1.2, type: 'sawtooth', gain: 0.07, reverb: 0.3 });
        }
      });
    });

    $$('[data-st-sound]', panel).forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.stSound;
        const raw = Number(input.value);
        const out = $(`[data-st-out="${key}"]`, panel);
        if (key === 'cutoff' && input.dataset.stLog) {
          const hz = 220 * (18000 / 220) ** (raw / 100);
          project.sound.cutoff = Math.round(hz);
          if (out) out.textContent = `${Math.round(hz)} Hz`;
        } else if (key === 'drive') {
          project.sound.drive = raw / 100;
          if (out) out.textContent = `${raw}%`;
        } else if (key === 'delay') {
          project.sound.delay = raw / 100;
          if (out) out.textContent = `${raw}%`;
        } else if (key === 'reverb') {
          project.sound.reverb = raw / 100;
          if (out) out.textContent = `${raw}%`;
        } else if (key === 'resonance') {
          project.sound.resonance = raw;
          if (out) out.textContent = raw.toFixed(1);
        } else if (key === 'bassCutoff') {
          project.sound.bassCutoff = raw;
          if (out) out.textContent = `${raw} Hz`;
        }
        project.sound.touched = true;
        if (window.EMAudio) window.EMAudio.updateStudio(project);
        markDone('sound');
        refreshStatus();
        saveProject();
      });
    });

    $$('[data-st-voice]', panel).forEach((select) => {
      select.addEventListener('change', () => {
        project.sound[select.dataset.stVoice] = select.value;
        project.sound.touched = true;
        markDone('sound');
        refreshStatus();
        saveProject();
        ensurePlaying();
      });
    });

    const audition = $('[data-st-audition]', panel);
    if (audition) {
      audition.addEventListener('click', () => {
        if (window.EMAudio && window.EMAudio.supported) {
          const notes = project.chords.flatMap((name) => chordNotes(name).slice(0, 2));
          window.EMAudio.previewStudio({ notes: notes.slice(0, 6), duration: 1.4, type: 'sawtooth', gain: 0.05, reverb: 0.35 });
        }
        ensurePlaying();
      });
    }

    $$('[data-st-song-bars]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const [index, delta] = button.dataset.stSongBars.split(':');
        const block = project.structure[Number(index)];
        if (!block) return;
        block.bars = Math.max(0, Math.min(32, block.bars + Number(delta)));
        markDone('song');
        saveProject();
        renderPanel();
        refreshStatus();
      });
    });

    $$('[data-st-section]', panel).forEach((select) => {
      select.addEventListener('change', () => {
        const index = Number(select.dataset.stSection);
        const block = project.structure[index];
        if (!block) return;
        block.section = select.value;
        markDone('song');
        saveProject();
        renderPanel();
        refreshStatus();
      });
    });

    $$('[data-st-song-remove]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        project.structure.splice(Number(button.dataset.stSongRemove), 1);
        saveProject();
        renderPanel();
        refreshStatus();
      });
    });

    const addBlock = $('[data-st-song-add]', panel);
    if (addBlock) {
      addBlock.addEventListener('click', () => {
        project.structure.push({ id: `s${Date.now()}`, section: 'Drop', bars: 8 });
        markDone('song');
        saveProject();
        renderPanel();
        refreshStatus();
      });
    }

    const songPlay = $('[data-st-song-play]', panel);
    if (songPlay) {
      songPlay.addEventListener('click', () => {
        if (songMode) stopSong();
        else startSong();
      });
    }
  }

  // --- module 01 bindings ---------------------------------------------------

  // One place that commits a new order, so drag, keyboard and the A/B switch
  // all take the same path: write the array, push it to the audio, repaint.
  function commitChainOrder(next, { slot, done = true } = {}) {
    const target = slot || (project.chain || CHAIN_DEFAULT).slot || 'a';
    const chain = project.chain || (project.chain = { ...CHAIN_DEFAULT });
    const ids = (Array.isArray(next) ? next : []).filter((id) => CHAIN_IDS.includes(id));
    for (const id of CHAIN_IDS) if (!ids.includes(id)) ids.push(id);
    chain[target] = ids;
    chain.touched = true;
    if (window.EMAudio && window.EMAudio.supported) window.EMAudio.setChainOrder(chainOrder(target));
    saveProject();
    if (done) markDone('chain');
    renderPanel();
    pulseSignal();
    refreshStatus();
    // A reorder is only worth hearing if the loop is running. Starting it on
    // first touch matches every other module: you should not have to press
    // play twice to find out what you just did.
    ensurePlaying();
  }

  function moveChainNode(from, delta) {
    const order = chainOrder().slice();
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    commitChainOrder(order);
  }

  function bindChainPanel(panel) {
    $$('[data-st-track-audition]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const voice = button.dataset.stTrackAudition;
        if (window.EMAudio && window.EMAudio.supported) {
          window.EMAudio.auditionTrack({ voice, project });
        }
        // Marking progress on audition would be wrong: hearing a track is not
        // the task. Assigning it a voice is, and that happens by playing it in
        // context, so the module completes on reorder instead (see below).
        ensurePlaying();
      });
    });

    $$('[data-st-chain-move]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const [index, delta] = button.dataset.stChainMove.split(':').map(Number);
        moveChainNode(index, delta);
      });
    });

    $$('[data-st-chain-slot]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const chain = project.chain || (project.chain = { ...CHAIN_DEFAULT });
        const slot = button.dataset.stChainSlot === 'b' ? 'b' : 'a';
        if (chain.slot === slot) return;
        chain.slot = slot;
        chain.touched = true;
        if (window.EMAudio && window.EMAudio.supported) window.EMAudio.setChainOrder(chainOrder(slot));
        saveProject();
        markDone('chain');
        renderPanel();
        pulseSignal();
        refreshStatus();
        ensurePlaying();
      });
    });

    const list = $('[data-st-chain]', panel);
    if (!list) return;

    // Pointer-based reordering.
    //
    // HTML5 drag-and-drop is not used: it does not fire on touch at all, and
    // this site is used on phones. Instead the node under the pointer is
    // hit-tested on every move — the same approach the step grids use, and for
    // the same reason (pointer capture suppresses sibling events).
    let drag = null;

    const nodeAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('[data-st-chain-node]') : null;
    };

    const endDrag = () => {
      if (!drag) return;
      drag.el.classList.remove('is-dragging');
      drag = null;
      $$('.is-drop-target', list).forEach((el) => el.classList.remove('is-drop-target'));
    };

    $$('[data-st-chain-node]', list).forEach((node) => {
      node.addEventListener('pointerdown', (event) => {
        if (event.button > 0) return;
        // Only the grip starts a drag. Without this, tapping a node to read it
        // would begin a drag and a stray pixel of movement would reorder it.
        const grip = event.target.closest('.st-chain-grip');
        if (!grip) return;
        event.preventDefault();
        drag = { el: node, id: node.dataset.stChainNode, x: event.clientX, y: event.clientY, moved: false };
        node.classList.add('is-dragging');
      });
    });

    const onMove = (event) => {
      if (!drag) return;
      if (!drag.moved && Math.abs(event.clientY - drag.y) < 6 && Math.abs(event.clientX - drag.x) < 6) return;
      drag.moved = true;
      const over = nodeAt(event.clientX, event.clientY);
      $$('.is-drop-target', list).forEach((el) => { if (el !== over) el.classList.remove('is-drop-target'); });
      if (over && over !== drag.el) over.classList.add('is-drop-target');
    };

    const onUp = (event) => {
      if (!drag) return;
      const from = drag.el;
      const moved = drag.moved;
      const over = moved ? nodeAt(event.clientX, event.clientY) : null;
      endDrag();
      if (!moved || !over || over === from) return;
      const order = chainOrder().slice();
      const fromIndex = order.indexOf(from.dataset.stChainNode);
      const toIndex = order.indexOf(over.dataset.stChainNode);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      const [item] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, item);
      commitChainOrder(order);
    };

    // Listeners live on the panel and are removed by the next renderPanel(),
    // which replaces the panel's innerHTML. Adding them per render is safe
    // because the element they are attached to is discarded with them.
    panel.addEventListener('pointermove', onMove);
    panel.addEventListener('pointerup', onUp);
    panel.addEventListener('pointercancel', endDrag);

    // Keyboard reordering. The grip is focusable so the same operation is
    // reachable without a pointer; arrow keys mirror the ↑↓ buttons.
    $$('.st-chain-grip', list).forEach((grip) => {
      grip.setAttribute('tabindex', '0');
      grip.setAttribute('role', 'button');
      grip.addEventListener('keydown', (event) => {
        const node = grip.closest('[data-st-chain-node]');
        if (!node) return;
        const index = Number(node.dataset.stChainIndex);
        if (event.key === 'ArrowUp') { event.preventDefault(); moveChainNode(index, -1); }
        else if (event.key === 'ArrowDown') { event.preventDefault(); moveChainNode(index, 1); }
      });
    });
  }

  // --- transport -----------------------------------------------------------

  function paintTransport() {
    if (!ui) return;
    const button = $('[data-st-play]', host);
    if (button) {
      button.classList.toggle('is-playing', playing);
      button.setAttribute('aria-pressed', String(playing));
      const iconEl = $('[data-st-play-icon]', button);
      if (iconEl) iconEl.innerHTML = icon(playing ? 'stop' : 'play', ui);
      const label = $('[data-st-play-label]', button);
      if (label) label.textContent = playing ? '停止' : '播放';
    }
    const bar = $('[data-st-bar]', host);
    if (bar && !playing) bar.textContent = '1';
  }

  function startAudio() {
    if (!window.EMAudio || !window.EMAudio.supported) return false;
    const ok = window.EMAudio.startStudio({ read: readForAudio });
    if (!ok) return false;
    playing = true;
    paintTransport();
    tick();
    return true;
  }

  function stopAudio() {
    if (window.EMAudio) window.EMAudio.stopStudio();
    playing = false;
    cancelAnimationFrame(raf);
    paintPlayhead();
    paintTransport();
  }

  function ensurePlaying() {
    if (playing) return;
    startAudio();
  }

  function togglePlay() {
    if (playing) {
      stopAudio();
      stopSong();
    } else {
      startAudio();
    }
  }

  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      const head = window.EMAudio ? window.EMAudio.getStudioPlayhead() : null;
      // One audio session exists at a time. If a lesson player started its own
      // loop, this one is gone: reset the transport instead of leaving a button
      // that claims to be playing while someone else owns the sound.
      if (playing && !head) {
        stopSong();
        playing = false;
        cancelAnimationFrame(raf);
        raf = 0;
        paintPlayhead();
        paintTransport();
        return;
      }
      if (head) {
        paintPlayhead(head);
        const bar = $('[data-st-bar]', host);
        if (bar) bar.textContent = String(head.bar + 1);
        if (songMode) advanceSong(head);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // The playhead is painted on the cells themselves: one class per column.
  // A floating overlay used to drift on scroll and on row overflow.
  function paintPlayhead(head) {
    if (!host) return;
    const grids = $$('.st-grid', host);
    if (!grids.length) return;
    if (!head) {
      $$('.is-now', host).forEach((el) => el.classList.remove('is-now'));
      return;
    }
    grids.forEach((grid) => {
      $$('.is-now', grid).forEach((el) => el.classList.remove('is-now'));
      $$(`.st-cell[data-st-step="${head.step}"]`, grid).forEach((el) => el.classList.add('is-now'));
      const headCell = $$('.st-cell-head', grid)[head.step];
      if (headCell) headCell.classList.add('is-now');
    });
  }

  // A one-shot sweep across the signal-flow diagram, run right after a reorder.
  //
  // It sweeps the whole path rather than highlighting "the node being heard":
  // every insert processes the signal on every note, so lighting one node would
  // invent a stage that does not exist. What actually changed is the ORDER, and
  // that is what the sweep shows.
  let signalTimer = 0;
  function pulseSignal() {
    if (!host) return;
    const nodes = $$('.st-signal-node', host);
    if (!nodes.length) return;
    clearTimeout(signalTimer);
    nodes.forEach((node) => node.classList.remove('is-live'));
    nodes.forEach((node, index) => {
      setTimeout(() => node.classList.add('is-live'), index * 90);
    });
    signalTimer = setTimeout(() => {
      nodes.forEach((node) => node.classList.remove('is-live'));
    }, nodes.length * 90 + 900);
  }

  // --- song mode -----------------------------------------------------------

  function startSong() {
    songMode = true;
    songClock = { blockIndex: 0 };
    const total = songTotalBars();
    if (!total) {
      songMode = false;
      return;
    }
    if (!playing) startAudio();
    const button = $('[data-st-song-play]', host);
    if (button) {
      button.setAttribute('aria-pressed', 'true');
      const label = $('[data-st-song-play-label]', button);
      if (label) label.textContent = '停止播放';
    }
    highlightSong(0);
  }

  function stopSong() {
    songMode = false;
    songClock = null;
    if (host) $$('.st-song-block.is-active', host).forEach((el) => el.classList.remove('is-active'));
    const button = $('[data-st-song-play]', host);
    if (button) {
      button.setAttribute('aria-pressed', 'false');
      const label = $('[data-st-song-play-label]', button);
      if (label) label.textContent = '播放整首';
    }
    $$('.st-song-block.is-active', host).forEach((el) => el.classList.remove('is-active'));
  }

  // Which block of the arrangement covers a given bar? Shared by the highlight
  // and the audio gate so the light and the sound can never disagree.
  function blockIndexAt(bar) {
    const blocks = project.structure.filter((item) => item.bars > 0);
    if (!blocks.length) return -1;
    const total = blocks.reduce((sum, item) => sum + Math.max(0, item.bars), 0);
    if (!total) return -1;
    const position = ((bar % total) + total) % total;
    let acc = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      if (position >= acc && position < acc + blocks[i].bars) return i;
      acc += blocks[i].bars;
    }
    return blocks.length - 1;
  }

  // Highlight only. The gating itself lives in gateForBar(), driven by the
  // audio clock — this just moves the light to match.
  //
  // The old version counted bars itself with `songClock.tick += 1` on every
  // change of head.bar. Because head came from the rAF loop, a dropped frame
  // could skip a bar count and shift the whole arrangement by one. Reading
  // absBar straight off the session removes the drift entirely.
  function advanceSong(head) {
    if (!songClock) return;
    if (typeof head.absBar !== 'number') return;
    const bar = songBarAt(head.absBar);
    if (bar < 0) return;
    const index = blockIndexAt(bar);
    if (index < 0) return;
    if (index !== songClock.blockIndex) {
      songClock.blockIndex = index;
      highlightSong(index);
    }
  }

  function highlightSong(index) {
    $$('.st-song-block', host).forEach((el, i) => el.classList.toggle('is-active', i === index));
  }

  // --- mount ---------------------------------------------------------------

  function render() {
    if (embedded) {
      // The lesson supplies the heading and the copy; this only needs the
      // transport, the module itself and a way to jump to the full studio.
      // The step nav in the transport still works here, so a reader can walk
      // forward through the modules without leaving the lesson.
      host.innerHTML = `
        <section class="st-body st-body-embedded">
          ${transportHTML()}
          <div class="st-module-host" data-st-panel-host></div>
          <div class="st-readout-host" data-st-readout-host>${statusHTML()}</div>
          <div class="st-embed-foot">
            <span>只是这一模块。想按顺序做完九块，去完整工作室。</span>
            <a class="st-embed-link" href="#/studio?m=${project.module}">打开完整工作室${icon('arrow', ui)}</a>
          </div>
        </section>`;
      renderPanel();
      bindTransport();
      syncStepNav();
      return;
    }
    const done = doneCount();
    host.innerHTML = `
      ${ui.pageHead({
        code: '07',
        label: 'STUDIO',
        title: '工作室：把耳朵练成手',
        lead: '九个模块共用同一条循环，按制作顺序排开：信号链、节拍、低音、和弦、旋律、音色、结构、混音、导出。一路做下来，你会得到一首能下载的曲子。',
        stats: [
          { label: '完成', value: `<span data-st-done>${done}<span>/${MODULES.length}</span></span>` },
          { label: 'BPM', value: `<span data-st-bpm-stat>${project.bpm}</span>` },
          { label: '循环', value: `${BARS} 小节` },
        ],
      })}
      <section class="st-body">
        ${entryHTML()}
        ${transportHTML()}
        ${tabsHTML(project.module)}
        <div class="st-module-host" data-st-panel-host></div>
        <div class="st-readout-host" data-st-readout-host>${statusHTML()}</div>
      </section>`;
    renderPanel();
    bindTransport();
    syncStepNav();
  }

  function bindTransport() {
    const play = $('[data-st-play]', host);
    if (play) play.addEventListener('click', togglePlay);

    const bpm = $('[data-st-bpm]', host);
    if (bpm) {
      bpm.addEventListener('input', () => {
        const value = Number(bpm.value);
        project.bpm = value;
        const out = $('[data-st-bpm-out]', host);
        if (out) out.textContent = String(value);
        const stat = $('[data-st-bpm-stat]', host);
        if (stat) stat.textContent = String(value);
        saveProject();
        // Tempo needs a session restart; keep the pattern, just rebuild the clock.
        if (playing) {
          stopAudio();
          startAudio();
        }
      });
    }

    const swing = $('[data-st-swing]', host);
    if (swing) {
      swing.addEventListener('input', () => {
        const value = Number(swing.value);
        project.swing = value / 100;
        const out = $('[data-st-swing-out]', host);
        if (out) out.textContent = `${value}%`;
        saveProject();
      });
    }

    $$('[data-st-tab]', host).forEach((tab) => {
      tab.addEventListener('click', () => switchModule(tab.dataset.stTab));
    });

    const prev = $('[data-st-module-prev]', host);
    if (prev) prev.addEventListener('click', () => stepModule(-1));
    const next = $('[data-st-module-next]', host);
    if (next) next.addEventListener('click', () => stepModule(1));

    // Delegated: the status strip is re-rendered often, so bind once on the host.
    if (!host.dataset.stNextBound) {
      host.dataset.stNextBound = '1';
      host.addEventListener('click', (event) => {
        const next = event.target.closest('[data-st-next]');
        if (!next) return;
        const id = next.dataset.stNext;
        if (id) switchModule(id);
        else switchModule('beats');
      });
    }

    const reset = $('[data-st-reset-all]', host);
    if (reset) {
      reset.addEventListener('click', () => {
        project = defaultProject();
        saveProject();
        if (playing) { stopAudio(); }
        render();
      });
    }

    bindKeyboardOnce();
  }

  // Bound once for the lifetime of the page. Registering per mount leaked a
  // listener every visit, so Space eventually toggled playback an even number
  // of times and appeared dead.
  let keysBound = false;

  function bindKeyboardOnce() {
    if (keysBound) return;
    keysBound = true;
    document.addEventListener('keydown', onKeydown);
  }

  function onKeydown(event) {
    if (!document.body.contains(host)) return;
    const tag = (event.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePlay();
      return;
    }
    const index = Number(event.key);
    if (index >= 1 && index <= MODULES.length) {
      switchModule(MODULES[index - 1].id);
    }
  }

  function paintAt(x, y) {
    if (!paint) return;
    if (!paint.panel.isConnected) {
      paint = null;
      return;
    }
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest ? el.closest('[data-st-cell]') : null;
    if (!cell || !paint.panel.contains(cell)) return;
    const kind = cell.dataset.stKind;
    const row = cell.dataset.stRow;
    if (`${kind}:${row}` !== paint.row) return;
    // A fast swipe crosses a dozen cells in one frame; audition only the first
    // so the gesture reads as one sweep instead of a stacked chord.
    const silent = Date.now() - lastPreviewAt < 80;
    toggleCell(kind, row, Number(cell.dataset.stStep), paint.value, silent);
  }

  function endPointer(event) {
    paint = null;
    const tap = pendingTap;
    pendingTap = null;
    if (!tap || event.type === 'pointercancel') return;
    const dx = (event.clientX || 0) - tap.x;
    const dy = (event.clientY || 0) - tap.y;
    // Moved far enough to be a scroll or a swipe, not a tap.
    if (Math.hypot(dx, dy) > 10) return;
    toggleCell(tap.kind, tap.row, tap.step, tap.next);
  }

  document.addEventListener('pointermove', (event) => {
    if (paint) paintAt(event.clientX, event.clientY);
  });
  document.addEventListener('pointerup', endPointer);
  document.addEventListener('pointercancel', endPointer);
  window.addEventListener('blur', () => {
    paint = null;
    pendingTap = null;
  });

  window.EMStudio = {
    // `options.module` mounts that module in place (used by lesson pages);
    // without it the studio reads the hash the way it always has.
    mount(node, kit, options = {}) {
      host = node;
      ui = kit;
      embedded = Boolean(options.embedded);
      project = loadProject();
      uiState = loadUiState();
      if (options.module && MODULES.some((item) => item.id === options.module)) {
        project.module = options.module;
      } else {
        const params = new URLSearchParams(location.hash.split('?')[1] || '');
        const wanted = params.get('m');
        if (wanted && MODULES.some((item) => item.id === wanted)) project.module = wanted;
      }

      // `from` carries the lesson id. app.js resolves it into a title (it owns
      // the course data), so the banner can name the lesson and link back.
      const from = options.from || new URLSearchParams(location.hash.split('?')[1] || '').get('from');
      entry = from ? (kit.entry || { id: from, title: '', chapter: '', task: '' }) : null;

      render();
      playing = false;
      paintTransport();
    },
    unmount() {
      // Called on every route change, including ones that never touched the
      // studio. Nothing to tear down means nothing to do.
      if (!host && !playing) {
        cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      try {
        stopSong();
        if (playing) stopAudio();
      } catch (error) {
        console.error('Studio teardown failed', error);
      }
      clearTimeout(signalTimer);
      signalTimer = 0;
      cancelAnimationFrame(raf);
      raf = 0;
      playing = false;
      embedded = false;
      entry = null;
      host = null;
      ui = null;
    },
    getProject() {
      return project;
    },
    // The lesson page asks whether the inline studio is the one mounted here.
    isEmbedded() {
      return embedded;
    },
    // Called when another player takes the audio session. The module stays on
    // screen with its edits intact; only the transport resets.
    releaseSession() {
      if (!playing && !songMode) return;
      stopSong();
      playing = false;
      cancelAnimationFrame(raf);
      raf = 0;
      paintPlayhead();
      paintTransport();
    },
  };
})();

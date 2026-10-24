/* ==========================================================================
   风格配方 / STYLE FINGERPRINTS

   每一段试听 = 一组 16 格图案（x = 击打，- = 休止）+ 一组音色参数。
   数据而不是代码：加一个风格只需要加一个对象，不需要写新的合成逻辑。
   引擎在 audio.js 的 playFingerprint()，按这里的字段翻译成 Web Audio 调用。

   字段约定
   ─────────────────────────────────────────────────────────────────────────
   key       低音根音（MIDI）。和弦 = key + 24，主奏 = key + 36。
   kick.p    16/32 字符串图案。kick.pitch/end/decay/gain/drive 对应合成参数。
   bass      图案 + 波形 + 滤波 + 时长。bass.note 是相对 key 的半音偏移。
   chord     notes 是相对 key+24 的半音数组；chords 是按小节轮换的和弦。
   lead/pluck/arp/pad  同理，note 相对 key+36。
   space.rev 0–1，混响量；space.delay 0–1，附点延迟送量。
   layers    这一条允许被单独 solo 的层。
   sig       一句话说明「它靠什么推进」，会显示在卡片上。
   ========================================================================== */

window.EM_FINGERPRINTS = (() => {
  const BASE = {
    /* ---------------------------------------------------------------- House */

    deephouse: {
      label: 'Deep House', bpm: 118, key: 41,
      kick: { p: 'x---x---x---x---', pitch: 135, end: 48, gain: .72, decay: .30 },
      clap: { p: '----x-------x---', gain: .09 },
      hat: { p: '--x---x---x---x-', gain: .030 },
      bass: { p: '--x---x---x---x-', wave: 'triangle', dur: .20, cut: 320, gain: .14 },
      chord: { p: 'x-------x-------', type: 'triangle', notes: [0, 3, 7, 10], dur: 1.7, cut: 1100, gain: .034, attack: .08, rev: .34 },
      chords: [[0, 3, 7, 10], [-5, -2, 2, 5]],
      pluck: { p: '-----x-----x----', dur: .22, cut: 2600, gain: .028 },
      space: { rev: .18, delay: 0 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '留白与闷音低音，不需要更多东西',
    },

    techhouse: {
      label: 'Tech House', bpm: 126, key: 38,
      kick: { p: 'x---x---x---x---', pitch: 140, end: 50, gain: .84, decay: .24 },
      clap: { p: '----x-------x---', gain: .13 },
      hat: { p: '--x-x---x-x-x-x-', gain: .038 },
      bass: { p: '--x---x-x-x---x-', wave: 'sawtooth', dur: .13, cut: 600, cutEnd: 200, res: 9, gain: .15 },
      chord: { p: '--x---x---x---x-', type: 'square', notes: [0, 3, 7], dur: .14, cut: 2200, gain: .020, attack: .004, rev: .10 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .08, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '短 Kick + 反拍低音，靠空隙推进',
    },

    bigroom: {
      label: 'Bigroom House', bpm: 128, key: 41,
      kick: { p: 'x---x---x---x---', pitch: 165, end: 44, gain: .94, decay: .40, drive: 5 },
      clap: { p: '----x-------x---', gain: .16 },
      hat: { p: '--x---x---x---x-', gain: .040 },
      bass: { p: '--x---x---x---x-', wave: 'sawtooth', dur: .15, cut: 460, gain: .15 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 4, 7, 12], dur: 1.1, cut: 2300, gain: .040, detune: 11, attack: .02, rev: .30 },
      chords: [[0, 4, 7, 12], [-4, 0, 3, 8]],
      lead: { p: 'x-x---x---x-x---', dur: .20, cut: 3600, gain: .050, rev: .30 },
      space: { rev: .28, delay: 0 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '巨大的 Kick 与极简旋律，Drop 只做减法',
    },

    afrohouse: {
      label: 'Afro House', bpm: 120, key: 36,
      kick: { p: 'x---x---x---x---', pitch: 130, end: 50, gain: .78, decay: .26 },
      clap: { p: '----x------x----', gain: .11 },
      hat: { p: 'x-xxx-xxx-xxx-xx', gain: .024 },
      bass: { p: 'x--x--x---x--x--', wave: 'triangle', dur: .18, cut: 420, gain: .15 },
      chord: { p: 'x-------x-------', type: 'triangle', notes: [0, 3, 7, 10], dur: .9, cut: 1600, gain: .030, detune: 3, attack: .05, rev: .35 },
      chords: [[0, 3, 7, 10], [-2, 2, 5, 9]],
      pluck: { p: '---x-----x------', dur: .2, cut: 2400, gain: .026 },
      space: { rev: .26, delay: 0 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '手打鼓组与跟着人声走的低音',
    },

    amapiano: {
      label: 'Amapiano', bpm: 112, key: 38,
      kick: { p: 'x---x---x---x---', pitch: 120, end: 46, gain: .62, decay: .30 },
      clap: { p: '----x-------x---', gain: .085 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .014 },
      bass: { p: '--x---x---x-x---', wave: 'triangle', dur: .26, cut: 300, gain: .17, log: true },
      chord: { p: 'x-------x-------', type: 'sine', notes: [0, 3, 7, 10], dur: 1.4, cut: 1400, gain: .032, attack: .06, rev: .40 },
      chords: [[0, 3, 7, 10], [0, 3, 7, 10]],
      space: { rev: .34, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '木头低音 + 大量留白，慢但不拖',
    },

    acidhouse: {
      label: 'Acid House', bpm: 126, key: 33,
      kick: { p: 'x---x---x---x---', pitch: 150, end: 48, gain: .82, decay: .26 },
      clap: { p: '----x-------x---', gain: .13 },
      hat: { p: '--x---x---x---x-', gain: .034 },
      bass: { p: '-x-xx---x-x-xx--', wave: 'sawtooth', dur: .14, cut: 900, cutEnd: 180, res: 16, gain: .16, drive: 4 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7], dur: .6, cut: 1400, gain: .020, rev: .15 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .12, delay: .12 },
      layers: ['drums', 'bass', 'chord'],
      sig: '一条会滑、会尖叫的 303 线',
    },

    /* --------------------------------------------------------------- Techno */

    techno: {
      label: 'Techno', bpm: 132, key: 33,
      kick: { p: 'x---x---x---x---', pitch: 150, end: 46, gain: .88, decay: .30, drive: 3 },
      clap: { p: '----x-------x---', gain: .11 },
      hat: { p: '--x---x---x---x-', gain: .032 },
      bass: { p: '--x---x---x---x-', wave: 'sawtooth', dur: .16, cut: 900, cutEnd: 220, res: 12, gain: .15, lfo: 5, lfoDepth: 120, drive: 3 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7, 10], dur: 1.9, cut: 900, gain: .026, detune: 5, attack: .30, rev: .30 },
      chords: [[0, 3, 7, 10], [-2, 1, 5, 8]],
      space: { rev: .14, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '几乎不变，变化全在滤波和混响上',
    },

    minimal: {
      label: 'Minimal Techno', bpm: 126, key: 36,
      kick: { p: 'x---x---x---x---', pitch: 145, end: 50, gain: .80, decay: .28 },
      clap: { p: '------------x---', gain: .08 },
      hat: { p: '--x-----x---x---', gain: .022 },
      bass: { p: '-----x-------x--', wave: 'sine', dur: .30, cut: 260, gain: .16 },
      chord: { p: 'x---------------', type: 'sine', notes: [0, 7], dur: 2.4, cut: 800, gain: .020, attack: .4, rev: .45 },
      chords: [[0, 7], [0, 7]],
      space: { rev: .32, delay: .18 },
      layers: ['drums', 'bass', 'chord'],
      sig: '东西少到能听见每一件的位置',
    },

    industrial: {
      label: 'Industrial Techno', bpm: 138, key: 31,
      kick: { p: 'x---x---x---x---', pitch: 170, end: 42, gain: .86, decay: .26, drive: 12 },
      clap: { p: '----x---x---x---', gain: .14 },
      hat: { p: 'x-x-x-x-x-x-x-x-', gain: .026 },
      bass: { p: '--x---x---x---x-', wave: 'square', dur: .12, cut: 700, cutEnd: 140, res: 14, gain: .17, drive: 10 },
      chord: { p: '----x-------x---', type: 'sawtooth', notes: [0, 1, 7], dur: .5, cut: 1100, gain: .022, rev: .28 },
      chords: [[0, 1, 7], [0, 1, 7]],
      space: { rev: .22, delay: .10 },
      layers: ['drums', 'bass', 'chord'],
      sig: '金属撞击与失真，空间是硬的',
    },

    /* --------------------------------------------------------------- Trance */

    trance: {
      label: 'Uplifting Trance', bpm: 138, key: 41,
      kick: { p: 'x---x---x---x---', pitch: 150, end: 47, gain: .80, decay: .30 },
      clap: { p: '----x-------x---', gain: .10 },
      hat: { p: '--x---x---x---x-', gain: .042, open: true },
      bass: { p: '--x---x---x---x-', wave: 'sawtooth', dur: .17, cut: 520, gain: .14 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 4, 7, 11], dur: 1.15, cut: 2800, gain: .038, detune: 9, attack: .02, rev: .40 },
      chords: [[0, 4, 7, 11], [-5, -1, 2, 7]],
      arp: { p: 'x-x-x-x-x-x-x-x-', dur: .13, cut: 3800, gain: .022, rev: .25 },
      lead: { p: 'x-----x---x-----', dur: .34, cut: 4200, gain: .040, rev: .35 },
      space: { rev: .36, delay: .10 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '长 Breakdown 之后把旋律举起来',
    },

    psytrance: {
      label: 'Psytrance', bpm: 142, key: 36,
      kick: { p: 'x---x---x---x---', pitch: 158, end: 46, gain: .84, decay: .24, drive: 4 },
      clap: { p: '------------x---', gain: .08 },
      hat: { p: 'x-x-x-x-x-x-x-x-', gain: .020 },
      bass: { p: 'x-x-x-x-x-x-x-x-', wave: 'sawtooth', dur: .09, cut: 700, cutEnd: 260, res: 8, gain: .15 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7], dur: .8, cut: 2000, gain: .020, detune: 6, rev: .25 },
      chords: [[0, 3, 7], [0, 3, 7]],
      lead: { p: '--x---x---x---x-', dur: .12, cut: 4800, gain: .030, rev: .3 },
      space: { rev: .20, delay: .14 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '十六分滚动低音，一圈一圈往上',
    },

    /* ----------------------------------------------------------------- HDM */

    hardstyle: {
      label: 'Hardstyle', bpm: 150, key: 36,
      kick: { p: 'x---x---x---x---', pitch: 180, end: 48, gain: .85, decay: .24, drive: 30 },
      clap: { p: '----x-------x---', gain: .12 },
      hat: { p: '------x-------x-', gain: .026, open: true },
      bass: { p: '--x---x---x---x-', wave: 'sawtooth', dur: .13, cut: 420, cutEnd: 110, gain: .16, reverse: true },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7], dur: .5, cut: 2600, gain: .024, detune: 12, rev: .18 },
      chords: [[0, 3, 7], [-2, 1, 5]],
      lead: { p: 'x-------x-------', dur: .28, cut: 5200, gain: .050, detune: 14, rev: .20 },
      space: { rev: .12, delay: 0 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '过载 Kick + 反向低音，冲击力来自形状不是音量',
    },

    uptempo: {
      label: 'Uptempo', bpm: 180, key: 33,
      kick: { p: 'x---x---x---x---', pitch: 200, end: 50, gain: .86, decay: .20, drive: 30 },
      clap: { p: '----x-------x---', gain: .11 },
      hat: { p: '--x---x---x---x-', gain: .020 },
      bass: { p: '--x---x---x---x-', wave: 'square', dur: .10, cut: 500, cutEnd: 120, gain: .15, drive: 8 },
      chord: { p: '------------x---', type: 'sawtooth', notes: [0, 3, 7], dur: .3, cut: 2400, gain: .018, rev: .12 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .08, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '没有空隙，只剩下一脚接一脚',
    },

    /* ----------------------------------------------------------- Breakbeat */

    breakbeat: {
      label: 'Breakbeat', bpm: 132, key: 36,
      kick: { p: 'x-------x-------', pitch: 145, end: 47, gain: .80, decay: .24 },
      snare: { p: '----x-------x---', gain: .18, decay: .16 },
      hat: { p: '--x-x-x---x-x-x-', gain: .026 },
      bass: { p: 'x--x--x---x--x--', wave: 'sawtooth', dur: .16, cut: 600, cutEnd: 200, gain: .15 },
      chord: { p: '--x-------x-----', type: 'square', notes: [0, 3, 7], dur: .5, cut: 1800, gain: .018, rev: .20 },
      chords: [[0, 3, 7], [-2, 1, 5]],
      space: { rev: .16, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '鼓是碎的，重音不在该在的地方',
    },

    dnb: {
      label: 'Drum & Bass', bpm: 174, key: 31,
      kick: { p: 'x-----x---x-----', pitch: 150, end: 46, gain: .82, decay: .22 },
      snare: { p: '----x-------x---', gain: .20, decay: .14 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .016 },
      bass: { p: 'x---x---x---x---', wave: 'sawtooth', dur: .22, cut: 500, cutEnd: 140, res: 10, gain: .17 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7, 10], dur: 1.6, cut: 1400, gain: .020, attack: .15, rev: .30 },
      chords: [[0, 3, 7, 10], [-2, 1, 5, 8]],
      space: { rev: .22, delay: .08 },
      layers: ['drums', 'bass', 'chord'],
      sig: '两拍里塞三下军鼓，低音又长又低',
    },

    jungle: {
      label: 'Jungle', bpm: 165, key: 33,
      kick: { p: 'x---x-----x-----', pitch: 148, end: 45, gain: .80, decay: .22 },
      snare: { p: '----x---x---x---', gain: .18, decay: .13 },
      hat: { p: 'x-xxx-xxx-xxx-xx', gain: .020 },
      bass: { p: 'x--x--x--x--x---', wave: 'sine', dur: .24, cut: 380, gain: .20 },
      chord: { p: '----x-------x---', type: 'triangle', notes: [0, 3, 7], dur: .9, cut: 1600, gain: .020, rev: .35 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .26, delay: .12 },
      layers: ['drums', 'bass', 'chord'],
      sig: '碎得更花，低音在旋律上走',
    },

    /* ------------------------------------------------------------ Bass 系 */

    dubstep: {
      label: 'US Dubstep', bpm: 140, key: 32,
      kick: { p: 'x---------x-----', pitch: 120, end: 42, gain: .80, decay: .24 },
      snare: { p: '--------x-------', gain: .22, decay: .18 },
      hat: { p: '----x-------x---', gain: .026 },
      bass: { p: 'x-x-x-x-x-x-x-x-', wave: 'sawtooth', dur: .19, cut: 700, cutEnd: 200, res: 14, gain: .20, lfo: 7, lfoDepth: 420, drive: 10 },
      chord: { p: '----x-------x---', type: 'sawtooth', notes: [0, 3, 7], dur: .3, cut: 1200, gain: .020, rev: .40 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .28, delay: .10 },
      layers: ['drums', 'bass', 'chord'],
      sig: '低音在抖、在变形，像一台会呼吸的机器',
    },

    trap: {
      label: 'Trap', bpm: 140, key: 29,
      kick: { p: 'x------x--------', pitch: 110, end: 40, gain: .78, decay: .30 },
      snare: { p: '--------x-------', gain: .20, decay: .16 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .019, rolls: true },
      bass: { p: 'x---------x-----', wave: 'sine', dur: .62, cut: 190, gain: .30, slide: true },
      chord: { p: '----x-------x---', type: 'sawtooth', notes: [0, 3, 7, 10], dur: .9, cut: 1600, gain: .024, attack: .10, rev: .35 },
      chords: [[0, 3, 7, 10], [0, 3, 7, 10]],
      space: { rev: .26, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '两拍一下的鼓，加上会拐弯的 808',
    },

    hiphop: {
      label: 'Hip-Hop', bpm: 90, key: 36,
      kick: { p: 'x-----x---x-----', pitch: 120, end: 45, gain: .78, decay: .26 },
      snare: { p: '----x-------x---', gain: .22, decay: .18, tone: 190 },
      hat: { p: '--x---x---x---x-', gain: .024 },
      bass: { p: 'x-----x-----x---', wave: 'triangle', dur: .34, cut: 300, gain: .20 },
      chord: { p: 'x-------x-------', type: 'triangle', notes: [0, 3, 7, 10], dur: 1.2, cut: 1500, gain: .026, rev: .18 },
      chords: [[0, 3, 7, 10], [-5, -2, 2, 5]],
      space: { rev: .16, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '鼓很松，人声在中间说话',
    },

    disco: {
      label: 'Disco', bpm: 118, key: 41,
      kick: { p: 'x---x---x---x---', pitch: 140, end: 50, gain: .78, decay: .22 },
      clap: { p: '----x-------x---', gain: .12 },
      hat: { p: '--x-x---x-x-x-x-', gain: .030, open: true },
      bass: { p: 'x--x--x-x--x--x-', wave: 'triangle', dur: .18, cut: 420, gain: .17 },
      chord: { p: '--x---x---x---x-', type: 'sawtooth', notes: [0, 4, 7], dur: .22, cut: 2600, gain: .030, rev: .18 },
      chords: [[0, 4, 7], [-5, -1, 2]],
      lead: { p: 'x---x---x---x---', dur: .12, cut: 4000, gain: .028, rev: .2 },
      space: { rev: .18, delay: .08 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '低音在跳，弦乐一切就切一下',
    },

    funk: {
      label: 'Funk', bpm: 105, key: 38,
      kick: { p: 'x------x--x-----', pitch: 120, end: 45, gain: .72, decay: .20 },
      snare: { p: '----x--x----x--x', gain: .16, decay: .12, tone: 220 },
      hat: { p: 'x-xxx-xxx-xxx-xx', gain: .018, open: false },
      bass: { p: 'x--x-x--x-x--x-x', wave: 'triangle', dur: .12, cut: 500, gain: .20 },
      chord: { p: '--x---x---x---x-', type: 'square', notes: [0, 4, 7, 11], dur: .1, cut: 2400, gain: .018, attack: .003, rev: .1 },
      chords: [[0, 4, 7, 11], [0, 4, 7, 11]],
      space: { rev: .08, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '低音短促带切分，和人声互相咬合',
    },

    /* ------------------------------------------------------- Down / Ambient */

    downtempo: {
      label: 'Downtempo', bpm: 90, key: 43,
      kick: { p: 'x-------x-------', pitch: 110, end: 45, gain: .62, decay: .34 },
      snare: { p: '--------x-------', gain: .12, decay: .22, tone: 170 },
      hat: { p: '----x-------x---', gain: .016 },
      bass: { p: 'x-------x-------', wave: 'sine', dur: .7, cut: 240, gain: .16 },
      pad: { p: 'x---------------', type: 'sawtooth', notes: [0, 3, 7, 10], dur: 3.2, cut: 1200, gain: .026, rev: .5 },
      chords: [[0, 3, 7, 10], [-5, -2, 2, 5]],
      space: { rev: .42, delay: .12 },
      layers: ['drums', 'bass', 'chord'],
      sig: '鼓退到后面，和声留在前面',
    },

    ambient: {
      label: 'Ambient', bpm: 80, key: 45,
      pad: { p: 'x---------------', type: 'sawtooth', notes: [0, 3, 7, 10], dur: 4.4, cut: 900, gain: .030, rev: .7 },
      spark: { p: '------x--------x', dur: .5, cut: 6000, gain: .012, rev: .8 },
      chords: [[0, 3, 7, 10], [-5, -2, 2, 5]],
      space: { rev: .7, delay: .25 },
      layers: ['chord', 'lead'],
      sig: '没有鼓，只有缓慢移动的和声',
    },

    /* ------------------------------------------------------------- Pop 系 */

    synthpop: {
      label: 'Synth-Pop', bpm: 118, key: 41,
      kick: { p: 'x---x---x---x---', pitch: 140, end: 50, gain: .78, decay: .22 },
      snare: { p: '----x-------x---', gain: .20, decay: .14, tone: 210 },
      hat: { p: '--x---x---x---x-', gain: .026 },
      bass: { p: 'x---x---x---x---', wave: 'square', dur: .18, cut: 520, gain: .16 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 4, 7, 11], dur: 1.2, cut: 2400, gain: .032, detune: 6, rev: .28 },
      chords: [[0, 4, 7, 11], [-5, -1, 2, 7]],
      lead: { p: '--x---x---x---x-', dur: .18, cut: 3800, gain: .035, rev: .2 },
      space: { rev: .24, delay: .1 },
      layers: ['drums', 'bass', 'chord', 'lead'],
      sig: '副歌是人唱出来的，不是 Drop 砸出来的',
    },

    hyperpop: {
      label: 'Hyperpop', bpm: 160, key: 44,
      kick: { p: 'x---x---x---x---', pitch: 190, end: 52, gain: .72, decay: .16, drive: 8 },
      clap: { p: '----x-------x---', gain: .14 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .018 },
      bass: { p: 'x--x-x--x--x-x--', wave: 'square', dur: .09, cut: 900, gain: .16, drive: 6 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 4, 7, 11], dur: .5, cut: 6000, gain: .038, detune: 20, rev: .3 },
      chords: [[0, 4, 7, 11], [-5, -1, 2, 7]],
      space: { rev: .3, delay: .16 },
      layers: ['drums', 'bass', 'chord'],
      sig: '所有东西都调得太快、太亮、太甜',
    },

    /* -------------------------------------------------------------- 其他 */

    reggaeton: {
      label: 'Reggaeton', bpm: 95, key: 38,
      kick: { p: 'x-----x-x-------', pitch: 120, end: 46, gain: .76, decay: .24 },
      snare: { p: '---x--x---x--x--', gain: .14, decay: .10, tone: 240 },
      hat: { p: 'xxxxxx-xxxxxx-xx', gain: .012 },
      bass: { p: 'x---------x-----', wave: 'sine', dur: .34, cut: 240, gain: .22 },
      chord: { p: '----x-------x---', type: 'triangle', notes: [0, 3, 7], dur: .5, cut: 2000, gain: .022, rev: .2 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .16, delay: 0 },
      layers: ['drums', 'bass', 'chord'],
      sig: '同一个鼓型一直扭，不需要变化',
    },

    chiptune: {
      label: 'Chiptune', bpm: 160, key: 45,
      kick: { p: 'x---x---x---x---', pitch: 180, end: 60, gain: .62, decay: .12 },
      snare: { p: '----x-------x---', gain: .14, decay: .08, tone: 400 },
      hat: { p: '--x---x---x---x-', gain: .014 },
      bass: { p: 'x-x-x-x-x-x-x-x-', wave: 'square', dur: .08, cut: 800, gain: .12 },
      lead: { p: 'x-x-x-x-x-x-x-x-', type: 'square', dur: .07, cut: 7000, gain: .030, rev: .1 },
      chords: [[0, 4, 7], [0, 4, 7]],
      space: { rev: .1, delay: .06 },
      layers: ['drums', 'bass', 'lead'],
      sig: '通道数有限，所以每个声部都很短',
    },

    club: {
      label: 'Club', bpm: 130, key: 36,
      kick: { p: 'x---x---x---x---', pitch: 165, end: 48, gain: .84, decay: .18, drive: 4 },
      clap: { p: '----x-------x---', gain: .16 },
      hat: { p: 'xxxx-xxx-xxxx-xx', gain: .020 },
      bass: { p: '---x---x---x---x', wave: 'sine', dur: .12, cut: 300, gain: .20 },
      chord: { p: 'x---x---x---x---', type: 'square', notes: [0, 3, 7], dur: .12, cut: 3000, gain: .022, attack: .002, rev: .1 },
      chords: [[0, 3, 7], [0, 3, 7]],
      space: { rev: .12, delay: .1 },
      layers: ['drums', 'bass', 'chord'],
      sig: '切得很碎的采样和喊声，靠剪辑推进',
    },

    garage: {
      label: 'UK Garage', bpm: 132, key: 38,
      kick: { p: 'x-----x-----x---', pitch: 135, end: 48, gain: .76, decay: .26 },
      snare: { p: '----x-------x---', gain: .16, decay: .12, tone: 260 },
      hat: { p: 'x-xx-xx-x-xx-xx-', gain: .020 },
      bass: { p: 'x--x-x---x--x-x-', wave: 'sine', dur: .25, cut: 260, gain: .19 },
      chord: { p: '--x---x---x---x-', type: 'triangle', notes: [0, 3, 7, 10], dur: .22, cut: 2000, gain: .022, attack: .004, rev: .2 },
      chords: [[0, 3, 7, 10], [0, 3, 7, 10]],
      space: { rev: .18, delay: .1 },
      layers: ['drums', 'bass', 'chord'],
      sig: '鼓在跳，人声被切成一格一格',
    },
  };

  /* 变体：继承一个基础配方，只覆盖几处。读起来像「同一个声音的不同调法」。 */
  const VARIANT = {
    electro: { base: 'bigroom', label: 'Electro House', bpm: 128,
      bass: { p: '--x---x---x---x-', wave: 'sawtooth', dur: .13, cut: 850, res: 7, gain: .17, drive: 6 },
      chord: { p: '---x---x---x---x', type: 'sawtooth', notes: [0, 3, 7, 12], dur: .1, cut: 3200, gain: .030, attack: .004, rev: .15 },
      sig: '漏电一样的锯齿低音，比 Bigroom 更脏' },

    progressive: { base: 'deephouse', label: 'Progressive House', bpm: 126,
      kick: { pitch: 145, end: 48, gain: .82, decay: .26 },
      bass: { p: '--x---x---x---x-', dur: .16, cut: 520, gain: .16 },
      chord: { p: 'x-------x-------', notes: [0, 3, 7, 10], dur: .8, cut: 2200, gain: .028, detune: 6, rev: .3 },
      sig: '一层一层往上叠，靠滤波开合推进' },

    chicago: { base: 'deephouse', label: 'Chicago House', bpm: 122,
      chord: { p: '--x---x---x---x-', notes: [0, 4, 7], dur: .3, cut: 2400, gain: .030, rev: .2 },
      pluck: { p: '---x---x--------', dur: .3, cut: 3000, gain: .026 },
      sig: '钢琴和弦一切一落，灵魂唱腔在前' },

    organic: { base: 'deephouse', label: 'Organic House', bpm: 110,
      kick: { pitch: 125, end: 50, gain: .60, decay: .32 },
      hat: { p: 'x-xxx-xxx-xxx-xx', gain: .018 },
      chord: { dur: 2.2, cut: 900, gain: .028, rev: .45 },
      sig: '鼓更轻，混响更大，像在户外' },

    melodic: { base: 'deephouse', label: 'Melodic House', bpm: 122,
      chord: { notes: [0, 3, 7, 10], dur: 1.4, cut: 2200, gain: .034, detune: 7, rev: .38 },
      lead: { p: 'x-----x---x-----', dur: .4, cut: 3600, gain: .034, rev: .4 },
      sig: '鼓在走，旋律在上面慢慢展开' },

    hardgroove: { base: 'techno', label: 'Hard Groove', bpm: 138,
      hat: { p: '-x-x-x-x-x-x-x-x', gain: .030 },
      bass: { p: '--x--x--x--x--x-', dur: .12, cut: 800, cutEnd: 300, res: 6, gain: .17 },
      sig: '拉丁式的鼓组切分，硬但不凶' },

    acidtechno: { base: 'acidhouse', label: 'Acid Techno', bpm: 135,
      kick: { pitch: 165, end: 44, gain: .86, decay: .26, drive: 8 },
      bass: { p: '-x-xx--xx-x-xx--', cut: 1100, cutEnd: 160, res: 18, gain: .17, drive: 6 },
      sig: '303 被推得更快更尖' },

    hardtechno: { base: 'techno', label: 'Hard Techno', bpm: 150,
      kick: { pitch: 175, end: 43, gain: .90, decay: .24, drive: 14 },
      bass: { p: 'x-x-x-x-x-x-x-x-', dur: .1, cut: 900, cutEnd: 200, gain: .16, drive: 8 },
      sig: 'Kick 失真，低音每一格都在' },

    melodictechno: { base: 'techno', label: 'Melodic Techno', bpm: 122,
      kick: { pitch: 140, end: 48, gain: .80, decay: .30 },
      chord: { notes: [0, 3, 7, 10], dur: 2.2, cut: 1500, gain: .034, detune: 8, attack: .5, rev: .45 },
      lead: { p: '--------x-------', dur: .6, cut: 3000, gain: .030, rev: .5 },
      sig: 'Techno 的骨架，加一层长的和声' },

    techtrance: { base: 'trance', label: 'Tech Trance', bpm: 138,
      kick: { pitch: 165, end: 45, gain: .86, decay: .26, drive: 8 },
      bass: { p: '--x---x---x---x-', cut: 700, cutEnd: 220, res: 8, gain: .16 },
      chord: { dur: .5, cut: 2000, gain: .026, rev: .2 },
      arp: { p: 'x-x-x-x-x-x-x-x-', gain: .018 },
      sig: 'Trance 的旋律，Techno 的鼓' },

    rawstyle: { base: 'hardstyle', label: 'Raw Hardstyle', bpm: 160,
      kick: { pitch: 195, end: 46, gain: .88, decay: .22, drive: 34 },
      bass: { p: '--x---x---x---x-', cut: 380, cutEnd: 90, gain: .18, drive: 10 },
      chord: { notes: [0, 1, 7], dur: .3, cut: 1800, rev: .1 },
      sig: 'Kick 更硬，音高更暗' },

    neurofunk: { base: 'dnb', label: 'Neurofunk', bpm: 174,
      bass: { p: 'x-x-x-x-x-x-x-x-', cut: 900, cutEnd: 180, res: 16, gain: .18, lfo: 6, lfoDepth: 260, drive: 10 },
      sig: '低音像机械在变形' },

    breakcore: { base: 'dnb', label: 'Breakcore', bpm: 190,
      kick: { p: 'x--x--x---x-x---', pitch: 170, end: 50, gain: .74, decay: .14 },
      snare: { p: '--x-xx--x-x-xx-x', gain: .18, decay: .08 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .018 },
      sig: '鼓被撕碎，然后撒在你脸上' },

    riddim: { base: 'dubstep', label: 'Riddim', bpm: 145,
      bass: { p: 'x-x-x-x-x-x-x-x-', dur: .14, cut: 520, cutEnd: 240, res: 20, gain: .21, lfo: 11, lfoDepth: 300, drive: 12 },
      sig: '同一个 wobble 重复到发麻' },

    futurebass: { base: 'trap', label: 'Future Bass', bpm: 150,
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 4, 7, 11], dur: .7, cut: 3600, gain: .045, detune: 13, attack: .01, rev: .3 },
      arp: { p: 'x-x-x-x-x-x-x-x-', dur: .1, cut: 5000, gain: .020, rev: .22 },
      sig: '和弦一大片，鼓却在半空中停着' },

    phonk: { base: 'trap', label: 'Phonk', bpm: 132,
      kick: { pitch: 100, end: 38, gain: .80, decay: .26, drive: 12 },
      bass: { p: 'x---------x-----', wave: 'sawtooth', dur: .5, cut: 220, gain: .26, drive: 9 },
      chord: { type: 'square', notes: [0, 3, 7, 10], dur: .8, cut: 1200, gain: .020, rev: .3 },
      sig: '磁带糊了，鼓还是硬的' },

    drill: { base: 'trap', label: 'Drill', bpm: 142,
      kick: { p: 'x-----x---x-----', pitch: 115, end: 40, gain: .78, decay: .28 },
      bass: { p: 'x-------x-x-----', dur: .5, cut: 200, gain: .28, slide: true },
      hat: { p: 'x-xxx-xxx-xxx-xx', gain: .018, rolls: true },
      sig: '808 一路滑下去，帽子三连' },

    lofi: { base: 'hiphop', label: 'Lo-fi Hip-Hop', bpm: 85,
      kick: { pitch: 105, end: 42, gain: .66, decay: .30 },
      hat: { p: '--x---x---x---x-', gain: .014 },
      chord: { notes: [0, 3, 7, 10], dur: 1.6, cut: 900, gain: .030, rev: .35 },
      sig: '像从隔壁房间传来的收音机' },

    nu: { base: 'disco', label: 'Nu-Disco', bpm: 120,
      bass: { p: 'x--x--x-x--x--x-', cut: 380, gain: .18 },
      chord: { notes: [0, 3, 7, 10], dur: .4, cut: 1800, gain: .028, rev: .28 },
      sig: 'Disco 的骨架，混响更多、更慢' },

    hnr: { base: 'disco', label: 'Hi-NRG', bpm: 126,
      kick: { pitch: 160, end: 48, gain: .84, decay: .18 },
      bass: { p: 'x-x-x-x-x-x-x-x-', cut: 500, gain: .16 },
      lead: { p: 'x-x-x-x-x-x-x-x-', gain: .032, cut: 5000 },
      sig: '每一拍都在推，没有一秒停' },

    triphop: { base: 'downtempo', label: 'Trip Hop', bpm: 85,
      kick: { p: 'x-----x---------', pitch: 100, end: 42, gain: .60, decay: .40 },
      snare: { p: '--------x-------', gain: .14, decay: .26, tone: 160 },
      chord: { notes: [0, 3, 7, 10], dur: 3.6, cut: 800, gain: .030, rev: .55 },
      sig: '鼓更重更慢，和声更暗' },

    indie: { base: 'synthpop', label: 'Indie Dance', bpm: 118,
      bass: { p: 'x---x---x---x---', wave: 'sawtooth', cut: 620, gain: .16 },
      chord: { notes: [0, 3, 7, 10], cut: 1800, rev: .35 },
      sig: '吉他的语气，合成器的骨架' },

    dembow: { base: 'reggaeton', label: 'Dembow', bpm: 110,
      snare: { p: '---x--x---x--x--', gain: .16, tone: 300 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .010 },
      sig: '三加三加二的鼓型，一直在推' },

    afrobeats: { base: 'afrohouse', label: 'Afrobeats', bpm: 105,
      kick: { pitch: 115, end: 50, gain: .68, decay: .28 },
      hat: { p: 'x-xx-xx-x-xx-xx-', gain: .020 },
      chord: { notes: [0, 4, 7, 11], dur: .7, cut: 1800, rev: .3 },
      sig: '鼓松、人声在前，低频只托一下' },

    indiepop: { base: 'synthpop', label: 'Alternative Dance', bpm: 120,
      chord: { notes: [0, 3, 7, 10], detune: 4, rev: .3 },
      sig: '乐队编制，电子处理' },

    synthwave: { base: 'synthpop', label: 'Synthwave', bpm: 100,
      kick: { p: 'x---x---x---x---', pitch: 130, end: 47, gain: .84, decay: .22 },
      snare: { p: '----x-------x---', gain: .22, decay: .20, tone: 180 },
      bass: { p: 'x-x-x-x-x-x-x-x-', wave: 'sawtooth', dur: .12, cut: 460, gain: .17 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7, 10], dur: 2.0, cut: 1800, gain: .034, detune: 10, attack: .06, rev: .45 },
      lead: { p: '----x-------x---', dur: .5, cut: 3200, gain: .032, detune: 9, rev: .5 },
      sig: '八十年代的夜景，混响比鼓还大' },

    /* --------------------------------------- 第二轮：补齐零覆盖大族 */

    darkambient: { base: 'ambient', label: 'Dark Ambient', bpm: 65,
      pad: { p: 'x---------------', notes: [0, 3, 6], dur: 5.4, cut: 520, gain: .036, rev: .78 },
      spark: { p: '------------x---', dur: .7, cut: 4200, gain: .010, rev: .85 },
      sig: '低频像雾，听不出边界' },

    drone: { base: 'ambient', label: 'Drone', bpm: 60,
      pad: { p: 'x---------------', notes: [0, 7], dur: 6.4, cut: 420, gain: .032, rev: .82 },
      spark: { p: '', dur: .7, cut: 4000, gain: .008, rev: .8 },
      sig: '一个音，几乎不移动' },

    illbient: { base: 'downtempo', label: 'Illbient', bpm: 85,
      kick: { p: 'x---------------', pitch: 92, end: 38, gain: .48, decay: .44 },
      snare: { p: '--------x-------', gain: .10, decay: .32, tone: 150 },
      bass: { p: 'x-------x-------', cut: 170, dur: .9, gain: .13 },
      pad: { p: 'x---------------', notes: [0, 3, 6, 10], dur: 3.6, cut: 800, gain: .028, rev: .6 },
      sig: '城市的噪声被拉长成背景' },

    ambienttechno: { base: 'techno', label: 'Ambient Techno', bpm: 120,
      kick: { pitch: 140, end: 46, gain: .62, decay: .34 },
      hat: { gain: .020 },
      bass: { p: '--x---x---x---x-', dur: .30, cut: 500, gain: .11 },
      chord: { notes: [0, 3, 7, 10], dur: 2.6, cut: 1200, gain: .034, attack: .40, rev: .52 },
      sig: 'Techno 的骨架，裹在混响里' },

    ebm: { base: 'industrial', label: 'EBM', bpm: 120,
      kick: { pitch: 130, end: 45, gain: .88, decay: .20, drive: 16 },
      bass: { p: 'x-x-x-x-x-x-x-x-', wave: 'square', dur: .12, cut: 520, cutEnd: 160, gain: .17, drive: 8 },
      chord: { p: '--x---x---x---x-', notes: [0, 1, 7], dur: .26, cut: 1600, gain: .022 },
      sig: '像流水线上整齐的踏步' },

    darkelectro: { base: 'industrial', label: 'Dark Electro', bpm: 125,
      kick: { pitch: 142, end: 44, gain: .82, decay: .22, drive: 8 },
      bass: { p: 'x--x--x---x--x--', cut: 620, cutEnd: 200, gain: .16, drive: 6 },
      lead: { p: '----x-------x---', dur: .3, cut: 2400, gain: .030, rev: .3 },
      sig: '冷、暗，人声像从管道里出来' },

    powernoise: { base: 'industrial', label: 'Power Noise', bpm: 140,
      kick: { pitch: 180, end: 50, gain: .92, decay: .16, drive: 34 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .026 },
      bass: { p: 'x-x-x-x-x-x-x-x-', cut: 900, cutEnd: 300, res: 20, gain: .18, drive: 14 },
      chord: { p: '', dur: .2 },
      sig: '整首歌就是一次持续的撞击' },

    newbeat: { base: 'industrial', label: 'New Beat', bpm: 110,
      kick: { pitch: 120, end: 48, gain: .80, decay: .30, drive: 4 },
      clap: { gain: .14 },
      bass: { p: 'x---x---x---x---', wave: 'sine', dur: .26, cut: 240, gain: .20 },
      chord: { p: '--x---x---x---x-', type: 'square', notes: [0, 3, 7], dur: .20, cut: 2200, gain: .024 },
      sig: '慢速的四拍，样本拼出来的' },

    rocktronica: { base: 'synthpop', label: 'Electronic Rock', bpm: 110,
      kick: { gain: .86, decay: .20 },
      snare: { gain: .24, decay: .14, tone: 200 },
      bass: { wave: 'sawtooth', dur: .18, cut: 900, gain: .16, drive: 6 },
      chord: { p: 'x-------x-------', type: 'sawtooth', notes: [0, 3, 7], dur: .8, cut: 2600, gain: .032, detune: 4, rev: .22 },
      sig: '吉他的失真，接在合成器上' },

    electronicore: { base: 'rocktronica', label: 'Electronicore', bpm: 150,
      kick: { p: 'x---x---x---x---', gain: .88, decay: .16, drive: 10 },
      snare: { p: '----x-------x---', gain: .22, decay: .10 },
      bass: { p: 'x-x-x-x-x-x-x-x-', dur: .10, cut: 1000, gain: .18, drive: 8 },
      chord: { p: '', dur: .2 },
      sig: '一半是金属，一半是电子' },

    vaporwave: { base: 'downtempo', label: 'Vaporwave', bpm: 80,
      kick: { pitch: 100, end: 42, gain: .55, decay: .40 },
      snare: { gain: .09, decay: .30 },
      bass: { cut: 200, dur: 1.0, gain: .14 },
      chord: { notes: [0, 3, 7, 10], dur: 3.6, cut: 900, gain: .034, rev: .62 },
      sig: '旧商场里的音乐，慢下来、糊掉' },

    nightcore: { base: 'hyperpop', label: 'Nightcore', bpm: 170,
      kick: { pitch: 200, end: 60, gain: .70, decay: .12 },
      bass: { dur: .06, cut: 1200, gain: .13 },
      lead: { p: 'x-x-x-x-x-x-x-x-', dur: .08, cut: 8000, gain: .028 },
      sig: '同一首歌，被调快、调高' },

    juke: { base: 'club', label: 'Bass / Club', bpm: 160,
      kick: { pitch: 180, end: 52, gain: .80, decay: .12 },
      hat: { p: 'xxxxxxxxxxxxxxxx', gain: .020 },
      bass: { p: 'x--x--x---x--x--', dur: .09, cut: 400, gain: .20 },
      sig: '低音是主角，鼓只是路标' },

    trapsoul: { base: 'trap', label: 'Trap Soul', bpm: 140,
      kick: { gain: .58, decay: .36, pitch: 105 },
      snare: { gain: .13, decay: .24 },
      bass: { dur: .80, cut: 170, gain: .24 },
      chord: { notes: [0, 3, 7, 10], dur: 1.6, cut: 1200, gain: .026, rev: .50 },
      sig: '鼓很慢，人声贴在耳朵上' },

    contemprnb: { base: 'hiphop', label: 'Contemporary R&B', bpm: 95,
      kick: { pitch: 105, end: 44, gain: .62, decay: .30 },
      snare: { gain: .14, decay: .22, tone: 210 },
      bass: { dur: .50, cut: 260, gain: .16 },
      chord: { notes: [0, 3, 7, 10], dur: 1.8, cut: 1400, gain: .028, rev: .40 },
      sig: '鼓很软，人声在中间' },

    mashup: { base: 'bigroom', label: 'Mashup', bpm: 128,
      chord: { notes: [0, 4, 7, 11], dur: .5, cut: 3000, gain: .036 },
      lead: { p: 'x-x-x-x-x-x-x-x-', dur: .14, gain: .038 },
      sig: '两首歌被硬塞进同一段' },

    chopped: { base: 'hiphop', label: 'Chopped and Screwed', bpm: 70,
      kick: { pitch: 90, end: 38, gain: .70, decay: .40 },
      snare: { decay: .30 },
      hat: { gain: .012 },
      bass: { dur: .80, cut: 180, gain: .20 },
      chord: { dur: 2.2, cut: 900, gain: .028, rev: .45 },
      sig: '整首歌被放慢、拉长、糊掉' },

    glitch: { base: 'breakbeat', label: 'Glitch', bpm: 100,
      kick: { p: 'x--x-x----x-x---', gain: .70, decay: .12 },
      snare: { p: '--x-x--x-x--x-x-', gain: .14, decay: .06 },
      hat: { p: 'x-xx-x-xx-x-xx-x', gain: .020 },
      bass: { p: 'x-x---x--x-x----', dur: .08, cut: 700, gain: .13 },
      chord: { p: '--x---x---x---x-', dur: .08, cut: 3000, gain: .015 },
      sig: '声音被切成碎片，再拼错位' },

    newage: { base: 'ambient', label: 'New Age', bpm: 70,
      pad: { p: 'x---------------', notes: [0, 7, 12], dur: 5.0, cut: 1400, gain: .028, rev: .70 },
      spark: { p: '------x-------x-', dur: .6, cut: 7000, gain: .016, rev: .80 },
      sig: '像风铃，也像很远的水' },

    newwave: { base: 'synthpop', label: 'New Wave', bpm: 130,
      kick: { gain: .82, decay: .18 },
      snare: { gain: .22, decay: .12 },
      bass: { wave: 'sawtooth', dur: .14, cut: 700, gain: .16 },
      lead: { p: 'x-x---x---x-x---', dur: .16, gain: .036 },
      sig: '合成器很亮，鼓很直接' },

    darkwave: { base: 'synthpop', label: 'Dark Wave', bpm: 110,
      kick: { gain: .72, decay: .30 },
      bass: { p: 'x---x---x---x---', wave: 'sawtooth', dur: .30, cut: 400, gain: .16 },
      chord: { notes: [0, 3, 7], dur: 1.8, cut: 1400, gain: .030, detune: 8, rev: .50 },
      lead: { p: '----x-------x---', dur: .5, cut: 2200, gain: .026, rev: .50 },
      sig: '冷的合成器，唱的是阴影' },

    electroclash: { base: 'bigroom', label: 'Electroclash', bpm: 130,
      kick: { pitch: 160, end: 48, gain: .86, decay: .16 },
      bass: { p: 'x-x-x-x-x-x-x-x-', wave: 'sawtooth', dur: .10, cut: 800, gain: .17, drive: 8 },
      chord: { p: '--x---x---x---x-', notes: [0, 3, 7], dur: .18, cut: 2600, gain: .022, rev: .10 },
      sig: '电子的骨架，朋克的嗓门' },

    gabber: { base: 'uptempo', label: 'Gabber', bpm: 170,
      kick: { pitch: 190, end: 44, gain: .92, decay: .18, drive: 36 },
      bass: { p: '--x---x---x---x-', cut: 400, cutEnd: 100, gain: .18, drive: 12 },
      sig: '鼓被失真到只剩一个形状' },

    speedcore: { base: 'uptempo', label: 'Speedcore', bpm: 240,
      kick: { pitch: 220, end: 60, gain: .86, decay: .10, drive: 30 },
      bass: { dur: .06, cut: 600, gain: .14, drive: 10 },
      hat: { p: '--x---x---x---x-', gain: .014 },
      sig: '速度已经超出身体能跟的范围' },

    goa: { base: 'psytrance', label: 'Goa Trance', bpm: 145,
      bass: { p: 'x-x-x-x-x-x-x-x-', dur: .10, cut: 800, gain: .14 },
      lead: { p: 'x-x-x-x-x-x-x-x-', dur: .18, cut: 4200, gain: .030, rev: .40 },
      chord: { notes: [0, 3, 7, 10], dur: 1.2, cut: 2400, gain: .024, rev: .45 },
      sig: '旋律一直在绕，像螺旋楼梯' },

    frenchhouse: { base: 'disco', label: 'French House', bpm: 120,
      bass: { p: 'x--x--x-x--x--x-', cut: 300, gain: .18 },
      chord: { p: 'x-------x-------', notes: [0, 3, 7, 10], dur: .9, cut: 1200, gain: .030, rev: .30 },
      sig: '滤波器一开一合，像在水下' },

    liquid: { base: 'dnb', label: 'Liquid Funk', bpm: 174,
      snare: { gain: .15, decay: .16 },
      bass: { p: 'x---x---x---x---', wave: 'triangle', dur: .40, cut: 300, gain: .18 },
      chord: { notes: [0, 3, 7, 10], dur: 2.2, cut: 1800, gain: .030, rev: .45 },
      sig: '鼓在跑，和声却很喜欢' },

    bigbeat: { base: 'breakbeat', label: 'Big Beat', bpm: 110,
      kick: { p: 'x-----x---x-----', gain: .90, decay: .20, drive: 4 },
      snare: { gain: .24, decay: .14 },
      bass: { p: 'x--x--x---x--x--', cut: 700, cutEnd: 200, gain: .18, drive: 4 },
      sig: '鼓是采样的，像在砸东西' },

    grime: { base: 'garage', label: 'Grime', bpm: 140,
      kick: { p: 'x-----x-----x---', gain: .70, decay: .20 },
      snare: { p: '----x-------x---', gain: .15, decay: .10 },
      hat: { p: 'x-xx-xx-x-xx-xx-', gain: .018 },
      bass: { p: 'x---x-----x-----', wave: 'square', dur: .30, cut: 400, gain: .18, drive: 4 },
      chord: { p: '', dur: .2 },
      sig: '冷、空，人声在缝隙里冲' },

    italodisco: { base: 'disco', label: 'Italo-Disco', bpm: 120,
      bass: { p: 'x--x--x-x--x--x-', cut: 500, gain: .17 },
      chord: { notes: [0, 3, 7, 10], dur: .30, cut: 2600, gain: .028 },
      lead: { p: 'x-x-x-x-x-x-x-x-', dur: .10, cut: 5200, gain: .030 },
      sig: '合成器在跑，像霓虹在闪' },

    nujazz: { base: 'funk', label: 'Nu Jazz', bpm: 90,
      kick: { p: 'x-----x---x-----', gain: .60, decay: .28 },
      snare: { p: '----x--x-x--x---', gain: .12, decay: .14 },
      bass: { p: 'x--x--x---x--x--', dur: .30, cut: 380, gain: .17 },
      chord: { notes: [0, 3, 7, 10], dur: 1.2, cut: 1600, gain: .026, rev: .30 },
      sig: '鼓是碎的，和声是爵士的' },
  };

  /* 展开变体：浅合并，图层与图案按需覆盖 */
  const ALL = { ...BASE };
  for (const [id, variant] of Object.entries(VARIANT)) {
    const base = BASE[variant.base] || BASE.techno;
    const merged = { ...base };
    for (const key of Object.keys(variant)) {
      if (key === 'base') continue;
      merged[key] = (typeof variant[key] === 'object' && !Array.isArray(variant[key]) && variant[key] !== null)
        ? { ...(base[key] || {}), ...variant[key] }
        : variant[key];
    }
    merged.base = variant.base;
    merged.id = id;
    ALL[id] = merged;
  }
  for (const [id, recipe] of Object.entries(BASE)) recipe.id = id;

  return { recipes: ALL, base: BASE, variant: VARIANT };
})();

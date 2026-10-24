window.EM_COURSE = {
  version: "2.0.0",
  title: "从第一个 Loop，到第一首完成曲",
  subtitle: "8 个制作阶段、22 节短课。先做声音，再用知识库补理论。",
  chapters: [
    {
      id: "setup",
      index: "00",
      title: "准备与信号链",
      subtitle: "先把工具和路径弄清楚",
      color: "ice",
      description: "DAW、轨道、MIDI、音源、效果器与总线。先知道声音从哪来、经过哪里，再开始写。",
      tier: "基础",
      short: "准备",
      entry: "不需要任何前置。一台能装 DAW 的电脑，一副能听见低频的耳机。",
      exit: "能新建一份 128 BPM 工程，五类轨道命名完毕，并用自己的话说明声音从 MIDI 到扬声器经过哪几步。",
      knowledge: [
        { label: "工程与轨道", kb: "glossary:track" },
        { label: "DAW 与 MIDI", kb: "glossary:daw" },
        { label: "BPM 与 4/4", kb: "glossary:bpm" },
        { label: "信号链与总线", kb: "guide:production-signal-chain" },
        { label: "监听与房间", kb: "guide:production-practice" }
      ],
      outcome: "建立一份可用的工程模板，并画出自己的声音信号链。",
      lessons: [
        {
          id: "daw-and-tracks",
          title: "DAW、轨道与工程模板",
          subtitle: "DAW / Track / Template",
          minutes: 5,
          outcome: "能建立一个包含鼓、Bass、和弦、Lead、FX 五类轨道的工程。",
          deliverable: "一个 128 BPM 的空工程模板，轨道已命名并按颜色分组。",
          prerequisites: [],
          goals: ["认识 MIDI 轨与音频轨", "建立可复用的工程模板"],
          concept: [
            "制作电子音乐不需要先买一堆硬件。一个 DAW、一个能听见低频的耳机或监听环境，就足够开始。关键是先把轨道分清楚：鼓组、Bass、和弦、Lead、氛围与 FX。",
            "工程模板能减少重复劳动：固定 BPM、轨道命名、总线、返送和常用效果器。你每次打开工程，直接进入写声音，而不是重新搭一遍桌子。"
          ],
          keyTerms: ["DAW", "Track", "MIDI"],
          widget: { type: "metronome", bpm: 128 },
          task: "在你的 DAW 里建立 5 条轨道并命名；用节拍器确认 128 BPM。",
          kbLinks: ["glossary:midi", "glossary:track", "guide:production-signal-chain"],
          links: [{ label: "读信号链说明", href: "#/guide/production" }]
        },
        {
          id: "signal-chain-basics",
          title: "MIDI、音源、效果器与总线",
          subtitle: "Signal Chain / Bus",
          minutes: 5,
          outcome: "能说清一个音色从 MIDI 信号到扬声器经过的每一步。",
          deliverable: "手写或截图一张自己的信号链：MIDI → 合成器/采样器 → 效果器 → 总线 → 输出。",
          prerequisites: ["daw-and-tracks"],
          goals: ["分清 MIDI 与音频", "知道效果器在链路中的位置"],
          concept: [
            "MIDI 只是控制信号，不发出声音；它告诉合成器或采样器“弹哪个音、多大力、持续多久”。声音真正由音源产生，再经过效果器修饰，最后汇入总线。",
            "效果器顺序会改变结果。压缩、EQ、混响、延迟、失真不是随便堆；先想清楚你要解决什么问题，再决定放在哪一步。"
          ],
          keyTerms: ["MIDI", "Synth", "FX Chain", "Bus"],
          widget: { type: "none" },
          task: "在你的 DAW 里给一条合成器轨道挂上 EQ → 压缩 → 混响，并观察顺序变化。",
          kbLinks: ["guide:production-signal-chain", "glossary:oscillator", "glossary:filter", "glossary:adsr", "glossary:lfo", "glossary:compressor", "glossary:bus"],
          links: [{ label: "读音色链全文", href: "#/guide/production" }]
        }
      ]
    },
    {
      id: "rhythm",
      index: "01",
      title: "鼓组与律动",
      subtitle: "让身体先动起来",
      color: "violet",
      description: "Kick、Clap、Hi-hat、切分与 Half-time。先写出一个能循环的鼓组，再谈音色。",
      tier: "基础",
      short: "鼓组",
      entry: "已有可用的工程模板，能数清小节与拍。",
      exit: "8 小节鼓组可无缝循环，第 8 小节有 Fill，并说得清 Kick、Clap、Hi-hat 各自的频段分工。",
      knowledge: [
        { label: "Kick 与 Clap 落点", kb: "glossary:kick" },
        { label: "4/4 与小节", kb: "glossary:4-4" },
        { label: "切分与留白", kb: "glossary:syncopation" },
        { label: "三连音与 Swing", kb: "glossary:triplet" },
        { label: "叠层与力度", kb: "glossary:velocity-layers" },
        { label: "鼓组处理", kb: "instrument:percussion" }
      ],
      outcome: "写出一个 8 小节鼓组，并能让它在重复中保持变化。",
      lessons: [
        {
          id: "drum-programming",
          title: "写出第一组 4/4 鼓",
          subtitle: "Drum Programming",
          minutes: 6,
          outcome: "能独立写出 Kick、Clap、Hi-hat 各就各位的 4/4 鼓组。",
          deliverable: "一段 8 小节、可循环的鼓组；至少有一处变化。",
          prerequisites: ["signal-chain-basics"],
          goals: ["掌握 4/4 鼓组的基本落点", "用 8 小节制造变化"],
          concept: [
            "最基础的 4/4 鼓组：Kick 落在每一拍，Clap 落在二、四拍，Hi-hat 填八分或十六分音符。先把这个骨架写稳，再决定要不要切分。",
            "变化不一定靠加更多音色。可以每 8 小节抽掉一次 Hi-hat、加一个 Fill、换一次 Clap 音色；重复中的小变化，比堆满更有效。"
          ],
          keyTerms: ["Kick", "Clap", "Hi-hat", "4/4"],
          widget: { type: "sequencer", bpm: 126 },
          task: "用站内鼓机写一个 8 小节鼓组；第 8 小节加入一个 Fill。",
          kbLinks: ["instrument:percussion", "glossary:kick", "glossary:snare", "glossary:hi-hat"],
          links: [{ label: "看打击乐组说明", href: "#/guide/production" }]
        },
        {
          id: "groove-and-half-time",
          title: "切分、留白与 Half-time",
          subtitle: "Groove / Syncopation / Half-time",
          minutes: 5,
          outcome: "能通过移动军鼓和抽掉鼓点，做出两种不同的身体感。",
          deliverable: "同一 BPM 下两个 4 小节鼓组：一个四四拍推进，一个 Half-time。",
          prerequisites: ["drum-programming"],
          goals: ["区分四四拍与半拍感", "用留白制造律动"],
          concept: [
            "同样 140 BPM，Bigroom 的 Kick 每拍落地，Trap 可以把军鼓放到第三拍附近，听感像慢了一半。差别不在速度，而在重音与留白。",
            "先写一个满的鼓组，再刻意删掉一些音。留白会让剩下的 Kick 和 Snare 更有重量；切分则把重音从正拍挪开。"
          ],
          keyTerms: ["Groove", "Syncopation", "Half-time"],
          widget: { type: "compare", demos: ["bigroom", "trap"], prompt: "先听 Bigroom，再听 Trap：哪一段更像“每拍点头”，哪一段更像“半速”？" },
          task: "在同一 BPM 下写两个鼓组；只改变军鼓位置与留白，听身体感如何变化。",
          kbLinks: ["style:bigroom-house", "style:trap", "guide:coordinates"],
          links: [{ label: "做风格听辨", href: "#/practice" }]
        },
        {
          id: "drum-processing",
          title: "鼓组层次：叠 Kick、处理 Snare",
          subtitle: "Layering / Tuning / Saturation",
          minutes: 6,
          outcome: "能让 Kick 有冲击、Clap 有空间，而不是所有鼓挤在一起。",
          deliverable: "一个处理过的鼓组：Kick 有 Sub 与 Click 两层，Snare/Clap 有空间。",
          prerequisites: ["drum-programming"],
          goals: ["理解鼓组的频段分工", "用叠层与失真塑造冲击力"],
          concept: [
            "一个 Kick 可以拆成 Click（高频点击）、Body（中低频）与 Sub（超低频）三层。先决定它在音箱和手机上分别要听到什么，再叠。",
            "Snare 和 Clap 不需要都很响；给它们留出中高频的位置，再用混响或短延迟制造空间。鼓组清楚，比鼓组大声更重要。"
          ],
          keyTerms: ["Layering", "Saturation", "EQ"],
          widget: { type: "lab", bpm: 126, groups: { drums: true, bass: false, chords: false, vocal: false, lead: false, ambient: false, fx: false }, prompt: "只听鼓组：先保留默认，再试着在脑中拆出 Click / Body / Sub。" },
          task: "在你的 DAW 里把 Kick 拆成两层；用 EQ 切掉重叠频段，再听冲击力。",
          kbLinks: ["instrument:percussion", "glossary:compressor", "glossary:eq", "glossary:distortion-saturation"],
          links: [{ label: "打开完整实验室", href: "#/lab" }]
        }
      ]
    },
    {
      id: "low-end",
      index: "02",
      title: "低频与 Bass",
      subtitle: "让 Kick 和 Bass 各就各位",
      color: "heat",
      description: "Kick 与 Bass 的关系决定舞池有没有推力。低频不是越响越好，而是各占各的位置。",
      tier: "基础",
      short: "低频",
      entry: "鼓组能稳定循环，Kick 的落点已经固定。",
      exit: "Kick 与 Bass 不抢同一瞬间；耳机与手机外放都能听清 Bass 的音高与走向。",
      knowledge: [
        { label: "Sidechain 让位", kb: "glossary:sidechain" },
        { label: "Sub Bass", kb: "glossary:sub-bass" },
        { label: "808 与滑音", kb: "glossary:808" },
        { label: "Acid Bassline", kb: "glossary:acid-bassline" },
        { label: "Growl 与 Wobble", kb: "glossary:wobble-growl-bass" },
        { label: "低频单声道与频段", kb: "guide:production-frequency" }
      ],
      outcome: "做出一个 Kick 与 Bass 不打架、在大小音箱都能听清的低频段。",
      lessons: [
        {
          id: "kick-and-bass",
          title: "Kick 与 Bass 如何让位",
          subtitle: "Sidechain / Low-end",
          minutes: 5,
          outcome: "能用 Sidechain 或音符编排，让 Kick 与 Bass 不抢同一瞬间。",
          deliverable: "一段 8 小节鼓组 + Bass；Kick 落下时 Bass 明显让位。",
          prerequisites: ["drum-processing"],
          goals: ["听出低频冲突", "用 Sidechain 或编排解决"],
          concept: [
            "Kick 和 Bass 在同一段低频工作。同时全音量落下会浑浊；常见解决方式是 Sidechain，让 Bass 在 Kick 瞬间退后，或者直接编排成错开。",
            "先不要把 Bass 调大。把 Kick 和 Bass 都调到能听清，再让它们在时间上让位；这比单纯加音量有效。"
          ],
          keyTerms: ["Sidechain", "Sub Bass", "Kick"],
          widget: { type: "lab", bpm: 124, groups: { drums: true, bass: true, chords: false, vocal: false, lead: false, ambient: false, fx: false }, prompt: "只保留鼓组与 Bass；注意 Kick 落下时低频有没有让位。" },
          task: "给 Bass 加 Sidechain，或把 Bass 音符挪开 Kick；A/B 对比冲突感。",
          kbLinks: ["instrument:bass-bassline", "glossary:sidechain", "glossary:sub-bass"],
          links: [{ label: "去音色实验室", href: "#/lab" }]
        },
        {
          id: "bass-sound-design",
          title: "Bass 的四种性格",
          subtitle: "808 / Sub / Reverse / Growl",
          minutes: 6,
          outcome: "能根据风格选择长 808、Sub、Reverse 或 Growl Bass。",
          deliverable: "同一段 Bassline 的两种 Bass 音色版本，并说明差异。",
          prerequisites: ["kick-and-bass"],
          goals: ["分辨四种 Bass 性格", "让 Bass 音色服务风格"],
          concept: [
            "808 靠长尾与滑音提供重量；Sub Bass 更低、更持续；Reverse Bass 的包络反着来，冲击力像从后面推；Growl Bass 被 LFO 与失真塑形，像机械怪兽的呼吸。",
            "同一个 MIDI 音符，换 Bass 音色就会换风格。Trap 的 808、Dubstep 的 Wobble、Hardstyle 的反向 Bass，对应不同的身体动作。"
          ],
          keyTerms: ["808", "Sub Bass", "Reverse Bass", "Growl Bass"],
          widget: { type: "compare", demos: ["trap", "dubstep", "hardstyle"], prompt: "依次听 Trap、US Dubstep、Hardstyle：低频是长、是抖，还是反着推？" },
          task: "用同一段 Bassline 做两个音色版本；写下它们分别适合什么场景。",
          kbLinks: ["glossary:808", "glossary:sub-bass", "glossary:reverse-bass", "glossary:wobble-growl-bass", "style:dubstep"],
          links: [{ label: "看 Bass 组说明", href: "#/guide/production" }]
        },
        {
          id: "low-end-control",
          title: "低频控制：单声道、动态与频段",
          subtitle: "Mono / Dynamics / Frequency",
          minutes: 6,
          outcome: "能让低频在 club 与耳机上都稳定，而不是一边响一边糊。",
          deliverable: "一个低频检查清单：Sub 单声道、Kick/Bass 分频、总线不过载。",
          prerequisites: ["bass-sound-design"],
          goals: ["检查低频单声道兼容", "给 Kick 与 Bass 分频"],
          concept: [
            "超低频通常建议保持单声道，避免黑胶、club 系统或手机扬声器上出现相位问题。Kick 与 Bass 可以用 EQ 分频：Kick 保留 Click 与 Body，Bass 让出对应频段。",
            "低频的动态也要控制。压缩不是把声音压死，而是让每一拍的低频更稳定；总线留出余量，给后面的混音和母带空间。"
          ],
          keyTerms: ["Mono", "Frequency", "Compressor"],
          widget: { type: "lab", bpm: 124, groups: { drums: true, bass: true, chords: false, vocal: false, lead: false, ambient: false, fx: false }, prompt: "只保留 Kick 与 Bass；听低频是否稳定、有没有浑浊。" },
          task: "把 Sub 层设为单声道，切掉 30 Hz 以下；比较耳机与音箱上的差异。",
          kbLinks: ["guide:production-frequency", "glossary:sidechain", "glossary:compressor", "glossary:eq"],
          links: [{ label: "读频谱说明", href: "#/guide/production" }]
        }
      ]
    },
    {
      id: "harmony",
      index: "03",
      title: "和弦与情绪",
      subtitle: "给 Loop 一个方向",
      color: "ice",
      description: "和弦进行决定情绪方向，音色决定颜色。先写四小节，再谈复杂。",
      tier: "进阶",
      short: "和弦",
      entry: "低频段已经稳定，工程里有一段能循环的鼓与 Bass。",
      exit: "四小节和弦循环成立；同一组和弦换成 Pad 或 Supersaw，能明确说出情绪变了什么。",
      knowledge: [
        { label: "调式与音阶", kb: "glossary:key-chord-scale" },
        { label: "和弦进行", kb: "instrument:chord-melody" },
        { label: "Supersaw", kb: "glossary:supersaw" },
        { label: "Pad 与包络", kb: "glossary:pad" },
        { label: "Arp 与 Pluck", kb: "glossary:arp" }
      ],
      outcome: "写出一个 4 小节和弦循环，并能用音色改变它的情绪。",
      lessons: [
        {
          id: "chord-progressions",
          title: "四小节和弦进行",
          subtitle: "Chord / Progression",
          minutes: 6,
          outcome: "能写一个可循环的 4 小节和弦进行。",
          deliverable: "一个 4 小节和弦 MIDI，至少包含两个和弦。",
          prerequisites: ["low-end-control"],
          goals: ["理解大调与小调色彩", "写出可循环的和弦进行"],
          concept: [
            "先不用背完整乐理。大调和弦通常更明亮，小调更暗；一个 4 小节循环只要有对比和回落，就能支撑一段 Drop。",
            "从 Fm → Ab → Eb → Bb 这样的进行开始，听每个和弦落下的情绪。再用转位、音区与音色改变它的重量。"
          ],
          keyTerms: ["Chord", "Key", "Progression"],
          widget: { type: "chords", chords: [
            { label: "Fm", note: "小调 / 暗", notes: [53, 56, 60] },
            { label: "Ab", note: "大调 / 亮", notes: [56, 60, 63] },
            { label: "Eb", note: "大调 / 开阔", notes: [51, 55, 58] },
            { label: "Bb", note: "大调 / 推进", notes: [58, 62, 65] }
          ] },
          task: "点听四个和弦，按 Fm → Ab → Eb → Bb 写一个 4 小节 MIDI。",
          kbLinks: ["instrument:chord-melody", "style:uplifting-trance", "guide:production-signal-chain"],
          links: [{ label: "看和弦组说明", href: "#/guide/production" }]
        },
        {
          id: "chord-texture",
          title: "Supersaw、Pad 与和弦音色",
          subtitle: "Supersaw / Pad / Voicing",
          minutes: 6,
          outcome: "能用 Supersaw 与 Pad 把同一组和弦做出不同空间。",
          deliverable: "同一和弦进行的两个版本：一个干净 Pluck，一个宽 Supersaw + Pad。",
          prerequisites: ["chord-progressions"],
          goals: ["听出 Supersaw 与 Pad 的差异", "用音色改变情绪"],
          concept: [
            "Supersaw 把多个锯齿波叠在一起，听起来宽、亮、带一点刺；Pad 的 Attack/Release 更长，像空气铺在背后。两者都能让和弦变大，但方式不同。",
            "和弦的“厚度”不只是加音符。改变八度、声部间距、Attack 与混响，都会改变它在混音里占的位置。"
          ],
          keyTerms: ["Supersaw", "Pad", "Attack", "Release"],
          widget: { type: "lab", bpm: 124, groups: { drums: false, bass: false, chords: true, vocal: false, lead: false, ambient: true, fx: false }, prompt: "只听和弦与氛围；比较干净与铺满空间两种状态。" },
          task: "用同一组和弦做两个音色版本；保留一个，另一个只作为对比。",
          kbLinks: ["instrument:ambient", "glossary:supersaw", "glossary:pad", "glossary:reverb-delay"],
          links: [{ label: "去音色实验室", href: "#/lab" }]
        }
      ]
    },
    {
      id: "sound-design",
      index: "04",
      title: "旋律与音色设计",
      subtitle: "做出能被记住的声音",
      color: "phosphor",
      description: "Lead 是 Drop 里最容易被记住的角色；合成器参数、采样与切片决定它的性格。",
      tier: "进阶",
      short: "音色",
      entry: "已有四小节和弦进行，知道振荡器与滤波器在链路里的位置。",
      exit: "完成 8 小节 Drop 草案：Lead 能被哼住，音色是调出来的而不是预设原样。",
      knowledge: [
        { label: "振荡器与波形", kb: "glossary:oscillator" },
        { label: "滤波器", kb: "glossary:filter" },
        { label: "ADSR 包络", kb: "glossary:adsr" },
        { label: "LFO 与 Wavetable", kb: "glossary:lfo" },
        { label: "FM 合成", kb: "glossary:fm-synthesis" },
        { label: "人声切片", kb: "instrument:vocal" }
      ],
      outcome: "完成一个 8 小节 Drop 草案：鼓、Bass、和弦、Lead 各就各位。",
      lessons: [
        {
          id: "lead-hook",
          title: "Lead 与 Hook",
          subtitle: "Lead / Hook / Drop",
          minutes: 5,
          outcome: "能在 Drop 里写出一条能被记住的主旋律。",
          deliverable: "一段 8 小节 Drop，包含一条主奏旋律。",
          prerequisites: ["chord-texture"],
          goals: ["理解 Lead 是角色", "写出可重复的钩子"],
          concept: [
            "Lead 不是某种固定音色，而是 Drop 里占主导、演奏主旋律的声音。它可以是 Supersaw、Pluck、Piano 或 Brass。",
            "好 Hook 往往很短：两到四个音，重复时只做轻微变化。先用一个简单动机写 8 小节，再决定音色。"
          ],
          keyTerms: ["Lead", "Hook", "Drop"],
          widget: { type: "compare", demos: ["bigroom", "futurerave"], prompt: "两段 Drop：哪一段的 Lead 更像旗帜，哪一段更像隧道里的光？" },
          task: "用 3–5 个音写一个动机，在 8 小节里重复两次并改变一次结尾。",
          kbLinks: ["instrument:lead", "glossary:lead", "style:bigroom-house", "style:future-rave"],
          links: [{ label: "听辨十种风格", href: "#/guide/listen" }]
        },
        {
          id: "synth-controls",
          title: "合成器四步：振荡器、滤波器、包络、LFO",
          subtitle: "Oscillator / Filter / ADSR / LFO",
          minutes: 7,
          outcome: "能通过四个参数改变同一个音色的明暗、长短与运动。",
          deliverable: "同一个合成器 Patch 的三个变体：暗、亮、带 LFO 摆动。",
          prerequisites: ["lead-hook"],
          goals: ["掌握合成器的基本信号流", "用参数塑造音色"],
          concept: [
            "合成器的起点是振荡器；滤波器削掉频段；ADSR 包络控制一个音的起承转合；LFO 让参数周期性变化。四步不需要一次学完，但要知道每一步在做什么。",
            "先只动 Filter Cutoff，听音色变亮或变暗；再动 ADSR 的 Release，听尾音变长；最后加一个很慢的 LFO 到 Filter，让声音开始“呼吸”。"
          ],
          keyTerms: ["Oscillator", "Filter", "ADSR", "LFO"],
          widget: { type: "lab", bpm: 124, groups: { drums: false, bass: false, chords: true, vocal: false, lead: true, ambient: false, fx: false }, prompt: "只听和弦与 Lead；想象用 Filter 与 Attack 改变它们的空间。" },
          task: "用一个合成器做三个 Patch 变体；每个只改变一个主要参数。",
          kbLinks: ["guide:production-signal-chain", "glossary:oscillator", "glossary:filter", "glossary:adsr", "glossary:lfo", "glossary:wavetable"],
          links: [{ label: "读合成器说明", href: "#/guide/production" }]
        },
        {
          id: "sampling-chops",
          title: "采样与人声切片",
          subtitle: "Sampler / Vocal Chop / FX",
          minutes: 6,
          outcome: "能把一段录音切成可演奏的节奏动机。",
          deliverable: "一个 4 小节的人声切片或采样 Loop。",
          prerequisites: ["synth-controls"],
          goals: ["理解采样器的工作原理", "用人声切片做节奏"],
          concept: [
            "采样器不是合成器：它回放事先录好的声音，再根据 MIDI 的音高、力度与时长调整。人声、鼓、环境声都可以成为采样。",
            "人声切片不需要完整句子。选一个元音或一个辅音，切成短片段，按节奏排列；再用音高、滤波与混响把它变成乐器。"
          ],
          keyTerms: ["Sampler", "Vocal Chop", "FX"],
          widget: { type: "lab", bpm: 124, groups: { drums: false, bass: false, chords: false, vocal: true, lead: false, ambient: false, fx: true }, prompt: "听人声与 FX 层；注意短切片与长混响的差别。" },
          task: "录一句人声或找一个采样，切成 4 个短片段，做成 4 小节 Loop。",
          kbLinks: ["instrument:vocal", "instrument:fx", "guide:production-signal-chain"],
          links: [{ label: "去音色实验室", href: "#/lab" }]
        }
      ]
    },
    {
      id: "arrangement",
      index: "05",
      title: "编曲与能量",
      subtitle: "把 Loop 变成一首歌",
      color: "heat",
      description: "八段结构、转场与自动化。你要决定什么时候加层、什么时候抽走、什么时候让 Drop 落下来。",
      tier: "进阶",
      short: "编曲",
      entry: "有一段 8 小节 Loop，鼓、Bass、和弦、Lead 各就各位。",
      exit: "2 分钟结构草图成立；能指出每一次能量上升与回落分别发生在第几小节。",
      knowledge: [
        { label: "八段结构", kb: "guide:production-structure" },
        { label: "乐句与小节", kb: "glossary:bar-phrase" },
        { label: "Fake Drop", kb: "glossary:fake-drop" },
        { label: "Riser 与 Impact", kb: "instrument:fx" },
        { label: "自动化与滤波", kb: "glossary:filter" },
        { label: "转场", kb: "glossary:transition" }
      ],
      outcome: "做出一个 2 分钟的结构草图：Intro → Breakdown → Build → Drop → Outro。",
      lessons: [
        {
          id: "structure-eight",
          title: "八段结构：Intro 到 Outro",
          subtitle: "Arrangement / Sections",
          minutes: 6,
          outcome: "能把 8 小节 Loop 扩展成 2 分钟的八段结构。",
          deliverable: "一个 2 分钟的结构草图，标出每个段落与能量。",
          prerequisites: ["sampling-chops"],
          goals: ["认识八段结构", "用段落组织能量"],
          concept: [
            "典型 EDM House 走过 Intro、Breakdown、Build-up、Drop、第二次 Breakdown、第二次 Build-up、第二次 Drop、Outro。每个段落的音色数量与能量层级不同。",
            "先用 8 小节 Loop 做骨架，再复制、删减、加层。结构不是公式：它是一张能量地图，告诉你现在在哪、下一步往哪走。"
          ],
          keyTerms: ["Intro", "Breakdown", "Build-up", "Drop", "Outro"],
          widget: { type: "structure" },
          task: "播放结构示例，画出你自己的 2 分钟结构草图；标出 Drop 时间。",
          kbLinks: ["guide:production-structure", "guide:production-caveat", "style:bigroom-house"],
          links: [{ label: "读完整结构说明", href: "#/guide/production" }]
        },
        {
          id: "transitions",
          title: "转场：Riser、Impact 与 Fill",
          subtitle: "Transitions / FX",
          minutes: 5,
          outcome: "能用 Riser、Impact 与 Fill 把段落连接起来。",
          deliverable: "三个转场：进入 Drop、进入 Breakdown、回到 Drop。",
          prerequisites: ["structure-eight"],
          goals: ["理解转场的作用", "用 FX 与鼓组填空"],
          concept: [
            "转场不是装饰，它负责告诉听众“要变了”。Riser 把张力拉高，Impact 把新段落钉住，Fill 在鼓组里制造最后一拍的空缺。",
            "不要每个转场都用同一种 FX。进入 Drop 可以更重，进入 Breakdown 可以更轻；转场要服务段落的能量，而不是反过来。"
          ],
          keyTerms: ["Riser", "Impact", "Fill", "FX"],
          widget: { type: "compare", demos: ["bigroom", "uplifting"], prompt: "比较两段 Drop 前的铺垫：哪一段更突然，哪一段更渐进？" },
          task: "在你的结构草图里标出三个转场，并各选一个 FX 或鼓组 Fill。",
          kbLinks: ["instrument:fx", "style:bigroom-house", "style:uplifting-trance", "guide:production-structure"],
          links: [{ label: "听结构示例", href: "#/guide/production" }]
        },
        {
          id: "automation-energy",
          title: "自动化与能量曲线",
          subtitle: "Automation / Energy",
          minutes: 6,
          outcome: "能用自动化让重复段落不无聊。",
          deliverable: "一条 16 小节自动化曲线：滤波、音量或混响至少一项。",
          prerequisites: ["transitions"],
          goals: ["用自动化制造渐变", "避免 Copy-Paste 式编曲"],
          concept: [
            "自动化是电子音乐的生命：Filter 慢慢打开、Reverb 逐渐变湿、Volume 在 Breakdown 前收一点。它让“重复”变成“推进”。",
            "先画一条能量曲线，再决定每个 8 小节要改变什么。不要一次改十个参数；一个明显的方向，比十个微小变化更容易被听见。"
          ],
          keyTerms: ["Automation", "Energy", "Filter"],
          widget: { type: "structure" },
          task: "选一个参数，在 16 小节里画一条自动化曲线；闭眼听它是否在推进。",
          kbLinks: ["guide:production-structure", "glossary:filter", "glossary:lfo"],
          links: [{ label: "读结构说明", href: "#/guide/production" }]
        }
      ]
    },
    {
      id: "mix",
      index: "06",
      title: "混音与空间",
      subtitle: "让每一层都清楚",
      color: "violet",
      description: "增益、EQ、压缩、混响、延迟与立体声。混音不是把声音变大，而是让每个声音找到位置。",
      tier: "完成",
      short: "混音",
      entry: "结构已经完整，每一段都有内容可以听。",
      exit: "粗混各层清楚、低频稳定，峰值不超过 -1 dBFS，手机上听也不糊。",
      knowledge: [
        { label: "增益与 Headroom", kb: "guide:production-signal-chain" },
        { label: "EQ 与频段让位", kb: "glossary:eq" },
        { label: "压缩", kb: "glossary:compressor" },
        { label: "效果链顺序", kb: "glossary:effects-chain" },
        { label: "干湿比", kb: "glossary:dry-wet" },
        { label: "混响与延迟", kb: "glossary:reverb-delay" }
      ],
      outcome: "完成一版平衡的粗混：各层清楚、低频稳定、没有明显过载。",
      lessons: [
        {
          id: "gain-stage",
          title: "增益结构与总线",
          subtitle: "Gain Staging / Bus",
          minutes: 5,
          outcome: "能建立不过载、留有余量的混音结构。",
          deliverable: "一份轨道电平表截图：Kick/Bass/和弦/Lead 分层，总线留 6 dB 余量。",
          prerequisites: ["automation-energy"],
          goals: ["理解增益与动态余量", "建立鼓组与音乐总线"],
          concept: [
            "混音从增益开始。每一轨先调到合理电平，再谈效果器；总线不要顶到 0 dB，给压缩和母带留余量。",
            "把鼓组、Bass、和弦、Lead 分到不同 Bus，能让你一次处理一组声音，而不是逐轨救火。"
          ],
          keyTerms: ["Gain", "Bus", "Headroom"],
          widget: { type: "lab", bpm: 124, groups: { drums: true, bass: true, chords: true, vocal: false, lead: true, ambient: true, fx: false }, prompt: "先听平衡的五层；想象把每一层分别送到不同总线。" },
          task: "把所有轨道降到 -18 dBFS 左右，再重新平衡；检查总线是否留有余量。",
          kbLinks: ["guide:production-signal-chain", "glossary:compressor", "glossary:bus"],
          links: [{ label: "读信号链说明", href: "#/guide/production" }]
        },
        {
          id: "eq-space",
          title: "EQ 与频段让位",
          subtitle: "EQ / Frequency",
          minutes: 6,
          outcome: "能用 EQ 给 Kick、Bass、和弦、Lead 分出空间。",
          deliverable: "一版 EQ 处理：至少三组声音不再抢同一频段。",
          prerequisites: ["gain-stage"],
          goals: ["识别频段冲突", "用 EQ 做减法"],
          concept: [
            "混音里的 EQ 更多是减法：切掉不需要的低频、削弱冲突的中频，而不是给每一轨都加高频。",
            "Kick 和 Bass 让出彼此；和弦让出人声/Lead 的中频；Hi-hat 不要和 FX 抢空气感。每个声音都要有自己的位置。"
          ],
          keyTerms: ["EQ", "Frequency", "Masking"],
          widget: { type: "lab", bpm: 124, groups: { drums: true, bass: true, chords: true, vocal: false, lead: true, ambient: true, fx: false }, prompt: "听五层同时播放；试着在脑中找出哪两层最可能抢频段。" },
          task: "给 Kick/Bass、和弦/Lead 各做一次 EQ 减法；A/B 对比清晰度。",
          kbLinks: ["guide:production-frequency", "glossary:eq", "instrument:chord-melody"],
          links: [{ label: "读频谱说明", href: "#/guide/production" }]
        },
        {
          id: "space-stereo",
          title: "混响、延迟与立体声",
          subtitle: "Reverb / Delay / Stereo",
          minutes: 6,
          outcome: "能用空间效果把声音放远或放近，并保持低频稳定。",
          deliverable: "一版空间处理：至少一个近、一个远、一个宽的声音。",
          prerequisites: ["eq-space"],
          goals: ["理解空间深度", "控制低频单声道"],
          concept: [
            "混响和延迟不是越多越好。它们让声音后退、变宽、变远；Kick 和 Bass 通常要更近、更干，Pad 与 FX 可以更远。",
            "立体声要检查单声道兼容。把 Sub 留在中间，用 Pan 与 Haas 效果处理中高频，避免低频相位问题。"
          ],
          keyTerms: ["Reverb", "Delay", "Stereo"],
          widget: { type: "lab", bpm: 124, groups: { drums: true, bass: true, chords: true, vocal: false, lead: true, ambient: true, fx: true }, prompt: "打开氛围与 FX，听空间如何把声音推远；再关掉，比较干湿。" },
          task: "给一个 Pad 加长混响、给一个 Lead 加短延迟；检查单声道时低频是否还在。",
          kbLinks: ["glossary:reverb-delay", "instrument:ambient", "guide:production-frequency"],
          links: [{ label: "去音色实验室", href: "#/lab" }]
        }
      ]
    },
    {
      id: "finish",
      index: "07",
      title: "完成一首歌",
      subtitle: "从 Loop 到可导出的 Demo",
      color: "phosphor",
      description: "把前面的选择收束成一首完整的 2 分钟 Demo：结构、混音、导出与复盘。",
      tier: "完成",
      short: "成曲",
      entry: "有一版粗混，结构完整，知道自己的歌要落在哪个风格。",
      exit: "导出一首 2 分钟 Demo，并写出一页复盘：哪些选择保留、下一次先改哪里。",
      knowledge: [
        { label: "House 与 Bigroom", kb: "family:house" },
        { label: "Trap 与 808", kb: "style:trap" },
        { label: "Dubstep 与 Growl", kb: "style:dubstep" },
        { label: "导出与响度", kb: "guide:production-caveat" },
        { label: "复盘方法", kb: "guide:production-practice" }
      ],
      outcome: "导出一首 2 分钟左右的电子音乐 Demo，并写一份复盘。",
      lessons: [
        {
          id: "project-house",
          title: "项目一：House 8 小节 Loop",
          subtitle: "Project / House",
          minutes: 8,
          outcome: "能独立完成一个 House 风格的 8 小节 Loop。",
          deliverable: "一个 8 小节 House Loop：鼓组、Bass、和弦、Lead、氛围。",
          prerequisites: ["space-stereo"],
          goals: ["组合 5 层以上音色", "让 Loop 可循环、可编排"],
          concept: [
            "用 124–128 BPM，先写 4/4 鼓组与 offbeat Bass，再加入和弦与 Lead。每一层都要回答：它在频段和段落里做什么？",
            "先让 Loop 能循环 30 秒不烦，再扩展结构。不要一开始就追求“完整歌曲”；一个清楚的 8 小节，是后面所有编排的种子。"
          ],
          keyTerms: ["House", "Loop", "Arrangement"],
          widget: { type: "lab", bpm: 124, groups: { drums: true, bass: true, chords: true, vocal: false, lead: true, ambient: true, fx: false }, prompt: "以默认五层为起点，做你自己的 House Loop 选择。" },
          task: "完成 8 小节 House Loop；导出 30 秒试听，隔天再听一次。",
          kbLinks: ["family:house", "style:bigroom-house", "guide:production-instrument-summary"],
          links: [{ label: "打开完整实验室", href: "#/lab" }]
        },
        {
          id: "project-bass",
          title: "项目二：Trap / Dubstep 8 小节",
          subtitle: "Project / Bass",
          minutes: 8,
          outcome: "能用一个 808 或 Growl Bass 做出半拍感的 Bass 段落。",
          deliverable: "一个 8 小节 Trap 或 Dubstep Loop：808/Growl、半拍鼓组、FX。",
          prerequisites: ["project-house"],
          goals: ["写出半拍感", "让 Bass 成为主角"],
          concept: [
            "Trap 的重点是 808 与 Hi-hat；Dubstep 的重点是 2-step 鼓组与 Growl Bass。两者都可以在 140 BPM 左右，但身体感完全不同。",
            "先选一个方向，不要同时做两种。把 Bass 写成一个可记住的节奏动机，再用 FX 把 Drop 钉住。"
          ],
          keyTerms: ["Trap", "Dubstep", "808", "Growl Bass"],
          widget: { type: "lab", bpm: 140, groups: { drums: true, bass: true, chords: false, vocal: false, lead: false, ambient: false, fx: true }, prompt: "只保留鼓组、Bass 与 FX；先听低频，再决定风格。" },
          task: "完成 8 小节 Bass Loop；标注它是 Trap 还是 Dubstep，以及依据。",
          kbLinks: ["family:us-bass", "style:trap", "style:dubstep", "glossary:808", "glossary:wobble-growl-bass"],
          links: [{ label: "做风格听辨", href: "#/practice" }]
        },
        {
          id: "finish-export",
          title: "结构收束、导出与复盘",
          subtitle: "Finish / Export / Review",
          minutes: 7,
          outcome: "能把 Loop 扩展成 2 分钟 Demo，并导出一个可分享的文件。",
          deliverable: "一个 2 分钟 Demo（WAV/MP3）+ 一份 5 行复盘。",
          prerequisites: ["project-bass"],
          goals: ["完成结构扩展", "导出并复盘"],
          concept: [
            "把 8 小节 Loop 复制成 Intro / Break / Build / Drop / Outro。用自动化与转场连接，不要只做 Copy-Paste。",
            "导出前检查：总线有余量、低频单声道、没有明显削波。导出后写 5 行复盘：最满意的一层、最不清楚的一层、下一次先改什么。"
          ],
          keyTerms: ["Arrangement", "Export", "Review"],
          widget: { type: "structure" },
          task: "完成 2 分钟结构，导出 WAV；写 5 行复盘并标记下一首的第一个目标。",
          kbLinks: ["guide:production-structure", "guide:production-caveat", "guide:production-frequency", "glossary:compressor"],
          links: [{ label: "读结构说明", href: "#/guide/production" }, { label: "回到课程地图", href: "#/learn" }]
        }
      ]
    }
  ]
};

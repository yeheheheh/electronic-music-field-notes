window.EM_START = {
  version: "1.0.0",
  paths: [
    {
      id: "listen",
      code: "01",
      title: "只想听懂电音",
      lead: "不买设备，先把耳朵校准。用风格树、每日一条和听辨练习建立“速度、鼓组、低音、空间”的判断。",
      cta: "从风格树开始",
      href: "#/tree",
      outcome: "7 天后能说出 5 个常见风格的区别，并知道自己喜欢哪一类声音。",
      steps: [
        "任选 3 个风格，各听 8 秒，不急着记名字",
        "读 1 张风格卡，记下 BPM 与鼓组落地方式",
        "做 5 题风格听辨，错题回到对应风格重听"
      ]
    },
    {
      id: "dj",
      code: "02",
      title: "想学 DJ 打碟",
      lead: "先理解设备与曲库，再练对拍、混音和接歌。没有碟机也能用 Rekordbox 键鼠先走一遍流程。",
      cta: "进入 DJ 修炼手册",
      href: "#/dj/course?ep=1",
      outcome: "能独立完成一次 16 小节混音，并说清 CUE、对拍、EQ 与接歌的基本逻辑。",
      steps: [
        "看 DJ 课 01–07，建立设备、软件与曲库概念",
        "安装 Rekordbox，建立课程播放列表并分析曲目",
        "用两首 House loop 完成一次对拍与 16 小节 EQ 混音",
        "读一遍现场手册，知道出门前要检查什么"
      ]
    },
    {
      id: "make",
      code: "03",
      title: "想做自己的音乐",
      lead: "按真实制作流程走：先让声音出来，再处理低频、和声与结构，最后混音导出。",
      cta: "开始制作课",
      href: "#/learn",
      outcome: "留下一个 8 小节 Loop，知道 Kick、Bass、和弦与 Lead 各自在做什么。",
      steps: [
        "看制作课 00–02，建立工程模板与轨道",
        "在工作室写一个 4 小节鼓组与低音",
        "加一个和弦或 Lead，做成 8 小节 Loop",
        "回到知识库查一次 Sidechain 或频段分工"
      ]
    }
  ],
  plan: [
    {
      day: 1,
      title: "建立听感坐标",
      lead: "先不学操作，先知道自己在听什么。",
      tasks: [
        { id: "d1t1", label: "在风格树里逐级点开，任选 3 个风格各听 8 秒", href: "#/tree" },
        { id: "d1t2", label: "读 1 张风格卡，记下 BPM 与鼓组", href: "#/tree" },
        { id: "d1t3", label: "做 5 题风格听辨", href: "#/practice?mode=style" }
      ]
    },
    {
      day: 2,
      title: "看清 DJ 全貌",
      lead: "知道 DJ 在做什么，以及你需要哪些设备。",
      tasks: [
        { id: "d2t1", label: "看 DJ 课 01–04：课程、概念、设备", href: "#/dj/course?ep=1" },
        { id: "d2t2", label: "写一份设备预算与购买顺序", href: "#/doc/guide:dj-00" },
        { id: "d2t3", label: "用 DJ 工具判断一组过渡", href: "#/dj" }
      ]
    },
    {
      day: 3,
      title: "曲库与 CUE",
      lead: "把歌曲变成能用的曲库，并给一首歌标好结构。",
      tasks: [
        { id: "d3t1", label: "看 DJ 课 08–10：Rekordbox 界面、设置、导入", href: "#/dj/course?ep=8" },
        { id: "d3t2", label: "安装 Rekordbox，建“基础”播放列表", href: "#/doc/guide:dj-01" },
        { id: "d3t3", label: "看 17–18 集，给一首歌设 8 个 Hot CUE", href: "#/dj/course?ep=17" }
      ]
    },
    {
      day: 4,
      title: "对拍",
      lead: "让两首歌的 Kick 落在同一拍点。",
      tasks: [
        { id: "d4t1", label: "看 DJ 课 24–26：三种对拍方法", href: "#/dj/course?ep=24" },
        { id: "d4t2", label: "用两首 House loop 练 10 分钟对拍", href: "#/doc/guide:dj-04" },
        { id: "d4t3", label: "做 5 题 BPM 估速", href: "#/practice?mode=bpm" }
      ]
    },
    {
      day: 5,
      title: "第一次混音",
      lead: "用推子、EQ、Filter 把两首歌叠在一起。",
      tasks: [
        { id: "d5t1", label: "看 DJ 课 27–30：推子、EQ、Filter、实战", href: "#/dj/course?ep=27" },
        { id: "d5t2", label: "用推子 + EQ 做一次 16 小节混音", href: "#/doc/guide:dj-05" },
        { id: "d5t3", label: "录音回听，记下 1 个问题" }
      ]
    },
    {
      day: 6,
      title: "接歌与现场",
      lead: "在正确的位置接入，而不是只会“切歌”。",
      tasks: [
        { id: "d6t1", label: "看 DJ 课 31–33：黄金法则与基础接歌", href: "#/dj/course?ep=31" },
        { id: "d6t2", label: "选 4 首歌练 Outro → Intro", href: "#/doc/guide:dj-06" },
        { id: "d6t3", label: "读现场手册前两节", href: "#/dj/field-guide" }
      ]
    },
    {
      day: 7,
      title: "做一个小 Set",
      lead: "把这一周的东西串起来，留下可复盘的记录。",
      tasks: [
        { id: "d7t1", label: "录 15 分钟 Set，至少 5 次接歌", href: "#/dj/field-guide" },
        { id: "d7t2", label: "写 3 个复盘点：选曲、接点、能量" },
        { id: "d7t3", label: "决定下一步：DJ 进阶或制作课", href: "#/learn" }
      ]
    }
  ],
  fieldGuide: {
    title: "DJ 现场手册",
    lead: "出门前、到场后、上台前各检查一遍。清单保存在本机，可以打印带走。",
    sections: [
      {
        id: "prep",
        title: "01 出门前 / 曲库与 U 盘",
        hint: "最常出问题的不是手法，是 U 盘、线材和没分析的曲目。",
        items: [
          { id: "prep-1", label: "曲目已在 Rekordbox 完成分析", hint: "BPM、调性、波形都有；没有分析的先全选右键分析。" },
          { id: "prep-2", label: "播放列表已导出到 U 盘", hint: "用 Export 模式导出，不要在 Performance 里直接拔盘。" },
          { id: "prep-3", label: "准备第二只备份 U 盘", hint: "两只盘内容一致；一只读不出时不要现场重导。" },
          { id: "prep-4", label: "U 盘格式与设备兼容", hint: "CDJ 常见 FAT32/exFAT；以场地设备说明为准，先试读。" },
          { id: "prep-5", label: "耳机与 3.5 / 6.35 转接头", hint: "耳机线、转接头、备用耳塞都放进包里。" },
          { id: "prep-6", label: "准备 3 首“救场曲”", hint: "结构清晰、你非常熟、任何时段都能放。" },
          { id: "prep-7", label: "电源、线材、充电宝", hint: "确认场地提供什么，缺什么自己带。" },
          { id: "prep-8", label: "确认场地设备型号与通道", hint: "CDJ/DJM 还是控制器；有没有多余通道给嘉宾。" }
        ]
      },
      {
        id: "arrive",
        title: "02 到场 / 接线与试音",
        hint: "先让声音正确，再谈混音。任何一步不确定，直接问场地方。",
        items: [
          { id: "arrive-1", label: "提前 30 分钟到场", hint: "留出找线、试音和突发问题的时间。" },
          { id: "arrive-2", label: "确认电源与接地", hint: "不要和灯光共用一个不稳定的排插。" },
          { id: "arrive-3", label: "输出线接对通道", hint: "RCA/XLR 接主扩或 DI；先确认左右声道。" },
          { id: "arrive-4", label: "Master 音量从低开始", hint: "先关小，再逐级推起，避免突然爆音。" },
          { id: "arrive-5", label: "每路 Trim 不红灯", hint: "红灯是过载风险，不是“更响更好”。" },
          { id: "arrive-6", label: "耳机 CUE / Master 比例合适", hint: "既能听清后手，也能听见现场。" },
          { id: "arrive-7", label: "试读两只 U 盘", hint: "每只都加载一首，确认波形与 CUE 正常。" },
          { id: "arrive-8", label: "确认监听与主扩都出声", hint: "别只试耳机；主扩和 Booth 都要听。" }
        ]
      },
      {
        id: "play",
        title: "03 上台 / 第一场 Set",
        hint: "稳住前 15 分钟，比急着放“炸曲”更重要。",
        items: [
          { id: "play-1", label: "第一首选低能量、结构清晰的歌", hint: "让观众和你都进入状态，不要一上来就 Drop。" },
          { id: "play-2", label: "前 3 首提前准备好", hint: "现场不临时翻歌；留 2 首备选。" },
          { id: "play-3", label: "不在 Drop 中间硬切", hint: "以乐句为单位，在边界接入或撤出。" },
          { id: "play-4", label: "每次只改一个变量", hint: "推子、EQ、Filter 分开动，才知道声音为什么变。" },
          { id: "play-5", label: "观察舞池，不盯屏幕", hint: "看人的脚和肩膀，比看波形更早告诉你能量。" },
          { id: "play-6", label: "电平留余量，不长期红区", hint: "给下一首和现场音响留空间。" },
          { id: "play-7", label: "每 45–60 分钟让耳朵休息", hint: "降一点音量、换耳机听；听力损伤不可逆。" },
          { id: "play-8", label: "结束后备份录音、收线、记 3 个点", hint: "下一次只改 1–2 个问题，不要同时改所有东西。" }
        ]
      }
    ]
  }
};

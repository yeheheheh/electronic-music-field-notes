/* ==========================================================================
   听感层 / LISTEN LAYER

   这一层只做三件事：
   1. 给每个风格一句人话、三个听点、一个场景（L1 / L2 / when）
   2. 给每个风格一个速度带、一种落地方式、一种低频形态（矩阵的两个轴）
   3. 指向一段合成配方（data/fingerprints.js）

   它不改知识库：键是 entryId，值只描述「听感」。
   生成文件（kb.js / web.js）重新构建后 id 可能变化，所以 scripts/check-listen.mjs
   会把「listen.js 指向了不存在的条目」变成构建失败，而不是线上空白。
   ========================================================================== */

window.KB_LISTEN = {
  version: 1,
  updated: '2026-10-24',

  /* 速度带：按身体感受命名，不按流派 */
  bands: [
    { id: 'slow', name: '慢', range: '60–110', feel: '可以走路' },
    { id: 'mid', name: '中', range: '110–128', feel: '可以点头' },
    { id: 'fast', name: '快', range: '128–140', feel: '想抬脚' },
    { id: 'xfast', name: '极快', range: '140–200', feel: '只能跳' },
  ],

  /* 落地方式：用拟声词，不用术语 */
  grooves: [
    { id: 'floor', name: '每拍一脚', tech: 'FOUR-ON-THE-FLOOR', hint: '咚·咚·咚·咚' },
    { id: 'half', name: '两拍一下', tech: 'HALF-TIME', hint: '咚——咚——' },
    { id: 'break', name: '碎的', tech: 'BREAKBEAT', hint: '咚哒咚咚哒' },
    { id: 'swing', name: '切开的', tech: 'SYNCOPATED', hint: '咚—哒，不在正拍上' },
  ],

  lows: [
    { id: 'sustain', name: '一直垫着' },
    { id: 'pulse', name: '一下一下' },
    { id: 'sink', name: '拖得很低' },
    { id: 'wobble', name: '在抖' },
    { id: 'grit', name: '粗、脏' },
    { id: 'sub', name: '又长又低' },
    { id: 'none', name: '几乎没有' },
  ],

  /* 大族默认值：没有专属文案的 1300 多条靠它兜底，页面上会标「同族参考」 */
  families: {
    'f-165': { zh: '浩室', band: 'mid', groove: 'floor', low: 'pulse', fp: 'deephouse' },
    'f-2077': { zh: '科技舞曲', band: 'fast', groove: 'floor', low: 'pulse', fp: 'techno' },
    'f-2703': { zh: '迷幻舞曲', band: 'fast', groove: 'floor', low: 'sustain', fp: 'trance' },
    'f-6652': { zh: '硬舞曲', band: 'xfast', groove: 'floor', low: 'pulse', fp: 'hardstyle' },
    'f-3585': { zh: '碎拍', band: 'xfast', groove: 'break', low: 'sub', fp: 'dnb' },
    'f-9207': { zh: '嘻哈 / Trap / 未来贝斯', band: 'xfast', groove: 'half', low: 'sink', fp: 'trap' },
    'f-5217': { zh: '英式低音', band: 'fast', groove: 'swing', low: 'pulse', fp: 'garage' },
    'f-5889': { zh: '美式低音', band: 'xfast', groove: 'half', low: 'wobble', fp: 'dubstep' },
    'f-11315': { zh: '迪斯科 / Hi-NRG', band: 'mid', groove: 'floor', low: 'pulse', fp: 'disco' },
    'f-19995': { zh: '放克', band: 'slow', groove: 'swing', low: 'pulse', fp: 'funk' },
    'f-11895': { zh: '氛围', band: 'slow', groove: 'half', low: 'none', fp: 'ambient' },
    'f-20154': { zh: '休闲', band: 'slow', groove: 'half', low: 'sustain', fp: 'downtempo' },
    'f-19330': { zh: '电子流行', band: 'mid', groove: 'floor', low: 'sustain', fp: 'synthpop' },
    'f-19764': { zh: '电子摇滚', band: 'mid', groove: 'floor', low: 'grit', fp: 'indiepop' },
    'f-12570': { zh: '独立 / 合成器流行', band: 'mid', groove: 'floor', low: 'pulse', fp: 'indie' },
    'f-16656': { zh: '地域 / 民族', band: 'slow', groove: 'swing', low: 'pulse', fp: 'reggaeton' },
    'f-20492': { zh: '芯片音乐', band: 'fast', groove: 'floor', low: 'pulse', fp: 'chiptune' },
    'f-20327': { zh: '低频俱乐部', band: 'fast', groove: 'break', low: 'pulse', fp: 'club' },
    'f-15336': { zh: '工业', band: 'fast', groove: 'floor', low: 'grit', fp: 'industrial' },
    'f-13700': { zh: '后互联网', band: 'xfast', groove: 'half', low: 'sink', fp: 'hyperpop' },
    'f-17480': { zh: '融合', band: 'mid', groove: 'floor', low: 'sustain', fp: 'deephouse' },
    'f-15794': { zh: '史前与技法', band: 'slow', groove: 'floor', low: 'pulse', fp: 'disco' },
    'f-20645': { zh: '重混与编辑', band: 'mid', groove: 'floor', low: 'pulse', fp: 'disco' },
    'f-19655': { zh: '节奏布鲁斯', band: 'slow', groove: 'half', low: 'sink', fp: 'lofi' },
    'f-20955': { zh: '风格补遗', band: 'fast', groove: 'floor', low: 'pulse', fp: 'techno' },
    'f-21437': { zh: '摇滚与极端补遗', band: 'fast', groove: 'break', low: 'grit', fp: 'breakbeat' },
    'f-20790': { zh: '实验电子补遗', band: 'slow', groove: 'half', low: 'none', fp: 'ambient' },
    'f-21372': { zh: 'Hard Dance 补遗', band: 'xfast', groove: 'floor', low: 'pulse', fp: 'hardstyle' },
    'f-21704': { zh: 'Reggae 补遗', band: 'slow', groove: 'swing', low: 'pulse', fp: 'reggaeton' },
  },

  /* 60 条高频风格：文案是编辑内容，BPM 来源单独标注 */
  entries: {
    /* ------------------------------------------------------------- House */
    'g-1135': {
      oneLine: '有人在你耳边说话，鼓在下面轻轻推。',
      hear: ['每拍一脚，但很软', '低音闷，只走两三个音', '混响多，像在小房间'],
      when: '日落后的露台，第一杯酒',
      bpm: { min: 110, max: 125, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'sustain', fp: 'deephouse',
    },
    'g-1081': {
      oneLine: '一台干净的机器，一直重复同一句话。',
      hear: ['每拍一脚，Kick 很短', '低音在反拍上啪一下', '干，几乎没有混响'],
      when: '凌晨一点，舞池刚满',
      bpm: { min: 122, max: 128, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'techhouse',
    },
    'g-1581': {
      oneLine: '体育馆那么大的房间，一秒把你举起来。',
      hear: ['每拍一脚，Kick 特别大', '低音只补空档', '混响很宽，像在山谷'],
      when: '音乐节主舞台，天黑了以后',
      bpm: { min: 126, max: 132, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'pulse', fp: 'bigroom',
    },
    'g-1525': {
      oneLine: '一台漏电的机器，在舞池中间跳舞。',
      hear: ['每拍一脚，鼓很紧', '低音嗡嗡响，带失真', '中频很满，声音贴脸'],
      when: '2000 年代的俱乐部，或者现在的怀旧场',
      bpm: { min: 125, max: 130, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'pulse', fp: 'electro',
    },
    'g-1149': {
      oneLine: '一群人在同一个节奏里走夜路。',
      hear: ['每拍一脚，鼓有手打感', '低音跟着人声走', '空间开阔，有回声'],
      when: '海边、日落、一群人',
      bpm: { min: 118, max: 124, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'afrohouse',
    },
    'g-1489': {
      oneLine: '鼓在走，旋律在上面慢慢展开。',
      hear: ['每拍一脚，但很稳', '低音只铺底', '混响宽，像在山谷'],
      when: '日落时分，人多但还没疯',
      bpm: { min: 118, max: 124, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'sustain', fp: 'melodic',
    },
    'g-1419': {
      oneLine: '一层一层往上叠，最后才开门。',
      hear: ['每拍一脚，从头到尾不变', '低音慢慢变亮', '越到后面越宽'],
      when: '大型场的暖场到主秀之间',
      bpm: { min: 120, max: 134, source: 'source' }, band: 'mid', groove: 'floor', low: 'sustain', fp: 'progressive',
    },
    'g-383': {
      oneLine: '钢琴一切，人声就上来了。',
      hear: ['每拍一脚，很松弛', '低音在跳，不垫底', '混响像一个大房间'],
      when: '老唱片里，或者致敬 80 年代的场',
      bpm: { min: 118, max: 126, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'sustain', fp: 'chicago',
    },
    'g-413': {
      oneLine: '一条会滑、会尖叫的线。',
      hear: ['每拍一脚，不加花', '低音在滑，像水管', '回声短，声音很尖'],
      when: '凌晨三点，有人开始闭眼',
      bpm: { min: 120, max: 130, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'acidhouse',
    },
    'g-571': {
      oneLine: '懒懒的鼓，加一声很远的木鱼。',
      hear: ['每拍一脚但留白很多', '低音是咚—咚的木质感', '混响松，像在户外'],
      when: '下午的派对，有人还没醒',
      bpm: { min: 108, max: 115, source: 'editorial' }, band: 'slow', groove: 'floor', low: 'pulse', fp: 'amapiano',
    },
    'g-1255': {
      oneLine: '像在树林里放了一套很轻的鼓。',
      hear: ['每拍一脚，很轻', '低音软，几乎不推人', '混响大，有鸟叫似的采样'],
      when: '白天、户外、躺着',
      bpm: { min: 108, max: 115, source: 'editorial' }, band: 'slow', groove: 'floor', low: 'sustain', fp: 'organic',
    },
    'g-2591': {
      oneLine: '拉丁的鼓，Techno 的脾气。',
      hear: ['每拍一脚，但切分很多', '低音短，一下一下', '干，鼓组很近'],
      when: '凌晨的仓库派对',
      bpm: { min: 135, max: 145, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'pulse', fp: 'hardgroove',
    },

    /* ------------------------------------------------------------ Techno */
    'g-2183': {
      oneLine: '机器在思考，人在旁边看着。',
      hear: ['每拍一脚，没有起伏', '低音在反拍上推', '很干，几乎没有混响'],
      when: '凌晨两点以后，灯全灭的时候',
      bpm: { min: 125, max: 135, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'pulse', fp: 'techno',
    },
    'g-2303': {
      oneLine: '那条线一直在往上爬。',
      hear: ['每拍一脚，很硬', '低音在滑，越来越尖', '回声短，全是金属味'],
      when: '凌晨四点，只剩一百个人',
      bpm: { min: 130, max: 140, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'pulse', fp: 'acidtechno',
    },
    'g-2529': {
      oneLine: '更快、更硬，没有商量的余地。',
      hear: ['每拍一脚，Kick 失真', '低音每一格都在', '空间是硬的'],
      when: '最疯的那一段',
      bpm: { min: 140, max: 160, source: 'source' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'hardtechno',
    },
    'g-2633': {
      oneLine: '冷的鼓，热的和声。',
      hear: ['每拍一脚，很克制', '低音只铺一层', '混响很长，像在山洞'],
      when: '日出前，人开始发呆',
      bpm: { min: 118, max: 126, source: 'source' }, band: 'mid', groove: 'floor', low: 'sustain', fp: 'melodictechno',
    },
    'g-2329': {
      oneLine: '东西少到能听见每一件的位置。',
      hear: ['每拍一脚，不加花', '低音很少出现', '混响在填空隙'],
      when: '凌晨，人不多，音场很好',
      bpm: { min: 124, max: 132, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'sustain', fp: 'minimal',
    },
    'g-2495': {
      oneLine: '像在工厂里跳舞。',
      hear: ['每拍一脚，鼓很脏', '低音粗，带金属', '空间硬，有撞击'],
      when: '地下仓库，灯只开一盏',
      bpm: { min: 132, max: 145, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'grit', fp: 'industrial',
    },

    /* ------------------------------------------------------------- Trance */
    'g-2999': {
      oneLine: '先把你举到半空，再松手。',
      hear: ['每拍一脚，速度偏快', '低音持续铺底', '混响很长，有旋律在绕'],
      when: '日出前那一个小时',
      bpm: { min: 135, max: 142, source: 'source' }, band: 'fast', groove: 'floor', low: 'sustain', fp: 'trance',
    },
    'g-3285': {
      oneLine: '螺旋一直在转，越转越紧。',
      hear: ['每拍一脚，Kick 很硬', '低音每一拍都在滚', '混响短，声音贴脸'],
      when: '凌晨四点，眼睛都闭着',
      bpm: { min: 138, max: 148, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'psytrance',
    },
    'g-3073': {
      oneLine: '不急，先铺很久，再给你。',
      hear: ['每拍一脚，很稳', '低音在慢慢变亮', '空间一直在扩大'],
      when: '暖场第二个小时',
      bpm: { min: 128, max: 134, source: 'source' }, band: 'fast', groove: 'floor', low: 'sustain', fp: 'trance',
    },
    'g-2961': {
      oneLine: '迷幻的旋律，科技舞曲的鼓。',
      hear: ['每拍一脚，鼓更硬', '低音短，带滤波', '混响比 Trance 短'],
      when: '主舞台换场，需要一点狠的',
      bpm: { min: 135, max: 142, source: 'source' }, band: 'fast', groove: 'floor', low: 'pulse', fp: 'techtrance',
    },
    'g-2863': {
      oneLine: '有人一直在唱，鼓在后面推。',
      hear: ['每拍一脚，很规整', '低音只铺底', '混响大，人声在前面'],
      when: '大型场的压轴前一小时',
      bpm: { min: 132, max: 140, source: 'editorial' }, band: 'fast', groove: 'floor', low: 'sustain', fp: 'trance',
    },

    /* ---------------------------------------------------------------- HDM */
    'g-8566': {
      oneLine: '每一脚都踹在胸口。',
      hear: ['每拍一脚，Kick 失真', '低音先吸后打，是反的', '空间硬，没什么混响'],
      when: '大型室内场，灯光全开',
      bpm: { min: 148, max: 155, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'hardstyle',
    },
    'g-8578': {
      oneLine: '同一脚，但旋律更亮。',
      hear: ['每拍一脚，鼓很整', '低音反向，有弹性', '混响比老派多一点'],
      when: '主舞台的黄金时段',
      bpm: { min: 150, max: 160, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'hardstyle',
    },
    'g-8630': {
      oneLine: '灯全灭，只剩失真。',
      hear: ['每拍一脚，更沉更低', '低音粗，像在摩擦', '几乎没有混响'],
      when: '最硬的那一小时',
      bpm: { min: 155, max: 165, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'rawstyle',
    },
    'g-7145': {
      oneLine: '没有空隙，只有下一脚。',
      hear: ['每拍一脚，快到数不清', '低音被失真糊成一片', '空间全满'],
      when: '最后半小时，剩下一百个人',
      bpm: { min: 170, max: 190, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'uptempo',
    },
    'g-6989': {
      oneLine: '速度本身就是内容。',
      hear: ['每拍一脚，像连发', '低音粗，几乎没有旋律', '干，只有冲击'],
      when: '凌晨五点，天快亮了',
      bpm: { min: 160, max: 180, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'uptempo',
    },

    /* ---------------------------------------------------------- Breakbeat */
    'g-3813': {
      oneLine: '鼓在跑，但不整齐。',
      hear: ['碎的，落点不固定', '低音短', '中频很满'],
      when: '换场过渡的时候',
      bpm: { min: 125, max: 140, source: 'source' }, band: 'fast', groove: 'break', low: 'grit', fp: 'breakbeat',
    },
    'g-4775': {
      oneLine: '心跳被调到 174，脚步跟着跑。',
      hear: ['碎的，两拍里塞三下', '低音又长又低', '高频碎，像下雨'],
      when: '凌晨四点，剩下的人都还在',
      bpm: { min: 168, max: 178, source: 'editorial' }, band: 'xfast', groove: 'break', low: 'sub', fp: 'dnb',
    },
    'g-4381': {
      oneLine: '鼓更野，低音更绕。',
      hear: ['碎的，切得很花', '低音在旋律上走', '混响多，像在仓库'],
      when: '九十年代的伦敦',
      bpm: { min: 160, max: 170, source: 'source' }, band: 'xfast', groove: 'break', low: 'sub', fp: 'jungle',
    },
    'g-4889': {
      oneLine: '低音像机械在变形。',
      hear: ['碎的，但很规整', '低音在拧、在变', '空间很窄'],
      when: '鼓打贝斯场的中段',
      bpm: { min: 172, max: 176, source: 'editorial' }, band: 'xfast', groove: 'break', low: 'sub', fp: 'neurofunk',
    },
    'g-19182': {
      oneLine: '鼓被撕碎，然后撒在你脸上。',
      hear: ['碎的，速度极快', '低音被切片', '没有空间，全是撞击'],
      when: '耳机里，凌晨三点，不想睡',
      bpm: { min: 180, max: 200, source: 'editorial' }, band: 'xfast', groove: 'break', low: 'grit', fp: 'breakcore',
    },

    /* ------------------------------------------------------- UK / US Bass */
    'g-5315': {
      oneLine: '鼓在跳，人声被切成一格一格。',
      hear: ['碎的，但很快', '低音很弹', '混响短'],
      when: '伦敦的深夜电台',
      bpm: { min: 128, max: 136, source: 'editorial' }, band: 'fast', groove: 'swing', low: 'pulse', fp: 'garage',
    },
    'g-5677': {
      oneLine: '低音在呼吸，鼓在留白。',
      hear: ['两拍一下，中间空一格', '低音在抖，但不凶', '混响很宽'],
      when: '深夜的地铁上',
      bpm: { min: 138, max: 142, source: 'editorial' }, band: 'xfast', groove: 'half', low: 'wobble', fp: 'dubstep',
    },
    'g-5829': {
      oneLine: '同一个低音，换着法子抖。',
      hear: ['两拍一下，很空', '低音短，重复一个音型', '空间干'],
      when: '低音场的前半段',
      bpm: { min: 138, max: 142, source: 'editorial' }, band: 'xfast', groove: 'half', low: 'wobble', fp: 'riddim',
    },
    'g-6167': {
      oneLine: '低音像一头会呼吸的机器。',
      hear: ['两拍一下，中间空一格', '低音在抖、在变形', '空间忽大忽小'],
      when: '有人想甩头的时候',
      bpm: { min: 140, max: 150, source: 'source' }, band: 'xfast', groove: 'half', low: 'wobble', fp: 'dubstep',
    },
    'g-6001': {
      oneLine: '一个音型重复到发麻。',
      hear: ['两拍一下，很机械', '低音一格一格地抖', '几乎没有混响'],
      when: '低音场的 Drop',
      bpm: { min: 140, max: 150, source: 'editorial' }, band: 'xfast', groove: 'half', low: 'wobble', fp: 'riddim',
    },
    'g-11151': {
      oneLine: '和弦一大片，鼓却在半空中停着。',
      hear: ['两拍一下', '低音短，只补底', '混响很宽，很亮'],
      when: '耳机里、副歌响起的时候',
      bpm: { min: 145, max: 155, source: 'editorial' }, band: 'xfast', groove: 'half', low: 'sink', fp: 'futurebass',
    },

    /* -------------------------------------------------- Hip-Hop / Trap 系 */
    'g-10159': {
      oneLine: '鼓很慢，帽子很快，头会自己点。',
      hear: ['两拍一下，像走路', '808 很低，会滑音', '高频密，空间干'],
      when: '夜店前半场，或者车上',
      bpm: { min: 140, max: 150, source: 'source' }, band: 'xfast', groove: 'half', low: 'sink', fp: 'trap', felt: 70,
    },
    'g-9479': {
      oneLine: '鼓很松，人声在中间说话。',
      hear: ['两拍一下', '低音很低，会拖', '干，像在房间里'],
      when: '车上、店里、路上',
      bpm: { min: 85, max: 95, source: 'editorial' }, band: 'slow', groove: 'half', low: 'sink', fp: 'hiphop',
    },
    'g-10247': {
      oneLine: '磁带糊了，鼓还是硬的。',
      hear: ['两拍一下，Kick 很闷', '低音在抖，带噪', '全是失真和磁带味'],
      when: '短视频、健身房',
      bpm: { min: 128, max: 138, source: 'editorial' }, band: 'fast', groove: 'half', low: 'sink', fp: 'phonk',
    },
    'g-10779': {
      oneLine: '808 一路滑下去，帽子三连。',
      hear: ['两拍一下，鼓很稀', '低音在滑，很长', '空间偏干'],
      when: '深夜开车，或者耳机里',
      bpm: { min: 138, max: 145, source: 'editorial' }, band: 'xfast', groove: 'half', low: 'sink', fp: 'drill', felt: 70,
    },
    'g-9713': {
      oneLine: '像从隔壁房间传来的收音机。',
      hear: ['两拍一下，很软', '低音糊', '全是噪声和磁带'],
      when: '写作业、发呆',
      bpm: { min: 80, max: 90, source: 'editorial' }, band: 'slow', groove: 'half', low: 'sink', fp: 'lofi',
    },

    /* ------------------------------------------------------------- Disco */
    'g-11415': {
      oneLine: '低音在跳，弦乐一切就切一下。',
      hear: ['每拍一脚，很亮', '低音在跳，不垫底', '混响像一个大舞厅'],
      when: '婚礼、复古派对、开场',
      bpm: { min: 110, max: 125, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'disco',
    },
    'g-11639': {
      oneLine: '迪斯科的骨架，混响更多。',
      hear: ['每拍一脚，但更慢', '低音闷一点，更圆', '空间更大，像在雾里'],
      when: '日落后的屋顶派对',
      bpm: { min: 115, max: 125, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'nu',
    },
    'g-11729': {
      oneLine: '每一拍都在推，没有一秒停。',
      hear: ['每拍一脚，很快', '低音一直在跑', '高频亮，像灯球'],
      when: '复古派对的高潮',
      bpm: { min: 124, max: 130, source: 'source' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'hnr',
    },

    /* --------------------------------------------- Funk / Chill / Pop 系 */
    'g-20027': {
      oneLine: '低音短促，和人声互相咬合。',
      hear: ['鼓很碎，重音很歪', '低音短，带切分', '干，像在排练房'],
      when: '下午的酒吧，还没上人',
      bpm: { min: 95, max: 115, source: 'editorial' }, band: 'slow', groove: 'swing', low: 'pulse', fp: 'funk',
    },
    'g-20200': {
      oneLine: '鼓退到后面，和声留在前面。',
      hear: ['两拍一下，很轻', '低音只托一下', '混响大，像在房间里'],
      when: '深夜、开车、一个人',
      bpm: { min: 60, max: 110, source: 'source' }, band: 'slow', groove: 'half', low: 'sustain', fp: 'downtempo',
    },
    'g-20212': {
      oneLine: '鼓更重更慢，和声更暗。',
      hear: ['两拍一下，鼓很沉', '低音拖得很长', '混响像一层雾'],
      when: '雨天的下午',
      bpm: { min: 80, max: 95, source: 'editorial' }, band: 'slow', groove: 'half', low: 'sustain', fp: 'triphop',
    },
    'g-19412': {
      oneLine: '副歌是人唱出来的，不是砸出来的。',
      hear: ['每拍一脚，很规整', '低音跟着和弦走', '混响干净，人声在前'],
      when: '商场、车里、朋友的歌单',
      bpm: { min: 110, max: 125, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'sustain', fp: 'synthpop',
    },
    'g-19548': {
      oneLine: '所有东西都调得太快、太亮、太甜。',
      hear: ['鼓是拼的，位置不固定', '低音短，被切碎', '全是效果，没有房间'],
      when: '耳机里，刷短视频的时候',
      bpm: { min: 150, max: 170, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'hyperpop',
    },
    'g-12730': {
      oneLine: '八十年代的夜景，慢镜头。',
      hear: ['每拍一脚，鼓很厚', '低音在走，很稳', '混响长，像在隧道里'],
      when: '开车、夜里、戴耳机',
      bpm: { min: 90, max: 115, source: 'source' }, band: 'slow', groove: 'floor', low: 'sustain', fp: 'synthwave',
    },
    'g-17706': {
      oneLine: '吉他的语气，合成器的骨架。',
      hear: ['每拍一脚，但很松', '低音有弹性', '混响中等，像在仓库'],
      when: '独立乐队的现场',
      bpm: { min: 110, max: 125, source: 'editorial' }, band: 'mid', groove: 'floor', low: 'pulse', fp: 'indie',
    },

    /* ------------------------------------------------------ Ethnic / 其他 */
    'g-16842': {
      oneLine: '同一个鼓型，一直在扭。',
      hear: ['鼓点不在正拍上，有点跳', '低音短促', '干、贴脸'],
      when: '夏天的店、出租车',
      bpm: { min: 90, max: 100, source: 'editorial' }, band: 'slow', groove: 'swing', low: 'pulse', fp: 'reggaeton',
    },
    'g-16860': {
      oneLine: '三加三加二，一直在推。',
      hear: ['鼓型很固定，一直在重复', '低音只托一下', '几乎没有混响'],
      when: '拉丁派对的前半场',
      bpm: { min: 105, max: 115, source: 'editorial' }, band: 'slow', groove: 'swing', low: 'pulse', fp: 'dembow',
    },
    'g-17074': {
      oneLine: '鼓松，人声在前。',
      hear: ['每拍一脚，很松', '低音只补底', '混响暖，像在户外'],
      when: '夏天的下午，很多人',
      bpm: { min: 100, max: 110, source: 'editorial' }, band: 'slow', groove: 'swing', low: 'pulse', fp: 'afrobeats',
    },
    'g-20524': {
      oneLine: '通道数有限，每个声部都很短。',
      hear: ['鼓是方的，没有混响', '低音一格一格', '高频刺，像游戏机'],
      when: '游戏、同人展、耳机里',
      bpm: { min: 140, max: 180, source: 'editorial' }, band: 'xfast', groove: 'floor', low: 'pulse', fp: 'chiptune',
    },
    'g-925': {
      oneLine: '切得很碎，喊一声就进。',
      hear: ['碎的，鼓点很密', '低音短，喊叫式', '干，全是剪辑'],
      when: '巴尔的摩的俱乐部',
      bpm: { min: 125, max: 135, source: 'editorial' }, band: 'fast', groove: 'break', low: 'pulse', fp: 'club',
    },
    'g-939': {
      oneLine: '三连踢，停一下，再踢。',
      hear: ['碎的，有标志性的三连', '低音短，跟着踢', '干，人声切片多'],
      when: '舞池中间，有人开始 Battle',
      bpm: { min: 135, max: 145, source: 'editorial' }, band: 'xfast', groove: 'break', low: 'pulse', fp: 'club',
    },
  },
};

/* ==========================================================================
   风格卡 / SHARE CARD

   一张 1080×1440 的图，是这个站点在微信群里的最小传播单位。
   设计约束（都踩过）：
   · 卡片必须落成 <img> 才能长按保存 —— canvas 本身在 iOS 微信里没有保存菜单
   · 字体不继承 CSS，canvas 里每个 font 都要写全
   · 二维码不是画上去的装饰：没有 QR 库时画真实短链，有库时才画码
   ========================================================================== */

(() => {
  const W = 1080;
  const H = 1440;
  const PAD = 72;

  const F_DISP = '"Bahnschrift","Arial Narrow","Microsoft YaHei",sans-serif';
  const F_MONO = '"Cascadia Mono","Consolas","SFMono-Regular",monospace';
  const F_BODY = '"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif';

  const C = {
    paper: '#f2ede3', muted: '#9a958b', dim: '#6f6b63',
    sodium: '#ffb000', laser: '#ff2e63', cyan: '#2fd8ff',
  };

  function fit(g, text, maxWidth, start, family, weight) {
    let size = start;
    do {
      g.font = `${weight} ${size}px ${family}`;
      if (g.measureText(text).width <= maxWidth) break;
      size -= 4;
    } while (size > 30);
    return size;
  }

  function wrap(g, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
      if (g.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  // 没有 QR 库时，把它画成一个「待接」的框并给出真实地址，
  // 而不是画一个看起来像二维码、扫不出来的假码。
  function drawCode(g, model, qy, qs) {
    const x = PAD;
    g.strokeStyle = 'rgba(242,237,227,.30)';
    g.lineWidth = 1;
    g.setLineDash([5, 5]);
    g.strokeRect(x, qy, qs, qs);
    g.setLineDash([]);
    g.textAlign = 'center';
    g.fillStyle = C.dim;
    g.font = `400 13px ${F_MONO}`;
    g.fillText('SHORT', x + qs / 2, qy + qs / 2 - 6);
    g.fillText('LINK', x + qs / 2, qy + qs / 2 + 14);
    g.textAlign = 'left';

    g.fillStyle = C.paper;
    g.font = `400 24px ${F_BODY}`;
    g.fillText('在地址栏打开', x + qs + 24, qy + 40);
    g.fillStyle = C.sodium;
    g.font = `400 18px ${F_MONO}`;
    g.fillText(model.shortUrl, x + qs + 24, qy + 74);
    g.fillStyle = C.dim;
    g.font = `400 14px ${F_BODY}`;
    g.fillText(model.hint || '浏览器实时合成 · 不是原曲', x + qs + 24, qy + 102);
  }

  function draw(canvas, model) {
    if (!canvas || !model) return;
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');

    g.clearRect(0, 0, W, H);
    g.fillStyle = '#060607';
    g.fillRect(0, 0, W, H);

    const glow = g.createLinearGradient(0, 0, 0, 300);
    glow.addColorStop(0, 'rgba(255,176,0,.10)');
    glow.addColorStop(1, 'rgba(255,176,0,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, 300);

    g.strokeStyle = 'rgba(242,237,227,.035)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 120) {
      g.beginPath();
      g.moveTo(x + .5, 0);
      g.lineTo(x + .5, H);
      g.stroke();
    }

    // 顶栏
    g.fillStyle = C.sodium;
    g.fillRect(PAD, 96, 44, 3);
    g.fillStyle = C.dim;
    g.font = `400 18px ${F_MONO}`;
    g.fillText('FIELD NOTES / LISTEN', PAD + 60, 104);
    for (let i = 0; i < 5; i += 1) {
      const h = [10, 18, 26, 14, 8][i];
      g.fillStyle = i === 2 ? C.laser : 'rgba(255,176,0,.55)';
      g.fillRect(W - PAD - 70 + i * 13, 104 - h, 7, h);
    }

    // 名称
    const name = String(model.name).toUpperCase();
    const size = fit(g, name, W - PAD * 2, 100, F_DISP, 600);
    g.fillStyle = C.paper;
    g.font = `600 ${size}px ${F_DISP}`;
    g.fillText(name, PAD, 300);

    g.fillStyle = C.muted;
    g.font = `400 28px ${F_BODY}`;
    g.fillText(model.zh, PAD, 350);

    // BPM
    g.fillStyle = C.paper;
    g.font = `600 172px ${F_MONO}`;
    g.fillText(String(model.bpm), PAD - 4, 540);
    const bw = g.measureText(String(model.bpm)).width;
    g.fillStyle = C.muted;
    g.font = `400 23px ${F_MONO}`;
    g.fillText('BPM', PAD + bw + 16, 540);

    g.textAlign = 'right';
    g.fillStyle = C.sodium;
    g.font = `400 23px ${F_BODY}`;
    g.fillText(`${model.bandName} / ${model.bandFeel}`, W - PAD, 560);
    g.textAlign = 'left';

    // 刻度
    const sy = 604;
    const x0 = PAD;
    const x1 = W - PAD;
    const map = (v) => x0 + ((v - 60) / (260 - 60)) * (x1 - x0);
    g.strokeStyle = 'rgba(242,237,227,.18)';
    g.beginPath();
    g.moveTo(x0, sy + .5);
    g.lineTo(x1, sy + .5);
    g.stroke();
    [60, 110, 160, 210, 260].forEach((v) => {
      const x = map(v);
      g.beginPath();
      g.moveTo(x, sy);
      g.lineTo(x, sy + 8);
      g.stroke();
      g.fillStyle = C.dim;
      g.font = `400 13px ${F_MONO}`;
      g.fillText(String(v), x - 10, sy + 28);
    });
    const bx = Math.min(x1 - 8, Math.max(x0 + 8, map(model.bpm)));
    g.fillStyle = C.sodium;
    g.beginPath();
    g.arc(bx, sy, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(bx - 1, sy - 22, 2, 20);

    // L1
    g.font = `400 42px ${F_BODY}`;
    const lines = wrap(g, model.oneLine, W - PAD * 2);
    g.fillStyle = C.paper;
    lines.slice(0, 2).forEach((line, i) => g.fillText(line, PAD, 704 + i * 58));

    // 第二维：落地方式（+「听起来像 70」）
    let note = model.grooveName;
    if (model.felt) note += ` · 听起来像 ${model.felt}`;
    g.fillStyle = C.cyan;
    g.fillRect(PAD, 742, 3, 20);
    g.font = `400 19px ${F_MONO}`;
    g.fillText(note, PAD + 14, 758);

    // 三个听点
    const rows = [
      ['01', '鼓', model.hear[0]],
      ['02', '低音', model.hear[1]],
      ['03', '空间', model.hear[2]],
    ];
    const ry = 868;
    g.strokeStyle = 'rgba(242,237,227,.10)';
    g.beginPath();
    g.moveTo(PAD, ry - 52);
    g.lineTo(x1, ry - 52);
    g.stroke();
    rows.forEach((row, i) => {
      const y = ry + i * 76;
      g.fillStyle = C.sodium;
      g.font = `400 18px ${F_MONO}`;
      g.fillText(row[0], PAD, y);
      g.fillStyle = C.dim;
      g.font = `400 17px ${F_MONO}`;
      g.fillText(row[1], PAD + 52, y);
      g.fillStyle = C.paper;
      g.font = `400 29px ${F_BODY}`;
      g.fillText(row[2], PAD + 150, y);
    });

    // 场景
    const wy = 1064;
    g.strokeStyle = 'rgba(242,237,227,.10)';
    g.beginPath();
    g.moveTo(PAD, wy);
    g.lineTo(x1, wy);
    g.stroke();
    g.fillStyle = C.dim;
    g.font = `400 16px ${F_MONO}`;
    g.fillText('什么时候会听到', PAD, wy + 32);
    g.fillStyle = C.muted;
    g.font = `400 27px ${F_BODY}`;
    g.fillText(model.when, PAD, wy + 76);

    drawCode(g, model, 1192, 132);

    // 页脚
    g.strokeStyle = 'rgba(242,237,227,.16)';
    g.beginPath();
    g.moveTo(PAD, H - 62);
    g.lineTo(x1, H - 62);
    g.stroke();
    g.fillStyle = C.muted;
    g.font = `400 19px ${F_BODY}`;
    g.fillText('电音档案 · 不做标准答案', PAD, H - 32);
    g.textAlign = 'right';
    g.fillStyle = C.dim;
    g.font = `400 14px ${F_MONO}`;
    g.fillText('FIELD NOTES / 2026', x1, H - 32);
    g.textAlign = 'left';
  }

  function toCanvas(model) {
    const canvas = document.createElement('canvas');
    draw(canvas, model);
    return canvas;
  }

  function toDataURL(model) {
    return toCanvas(model).toDataURL('image/png');
  }

  function download(model) {
    const link = document.createElement('a');
    link.download = `em-card-${model.slug || model.id || 'style'}.png`;
    link.href = toDataURL(model);
    link.click();
  }

  /* 弹层：先把 PNG 塞进 <img>，再让用户长按 —— 顺序反了 iOS 就没有保存菜单 */
  function open(model, options = {}) {
    let layer = document.getElementById('cardLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'cardLayer';
      layer.className = 'card-layer';
      layer.innerHTML = `
        <div class="card-layer-panel" role="dialog" aria-modal="true" aria-label="风格卡">
          <div class="card-layer-head">
            <span class="mono-label">SHARE / 风格卡</span>
            <button class="icon-button" type="button" data-card-close aria-label="关闭">×</button>
          </div>
          <div class="card-layer-body">
            <img alt="风格卡预览" data-card-img>
            <div class="card-layer-side">
              <p class="card-layer-tip">手机上长按图片保存，直接发进群里。桌面端点下面的按钮下载 PNG。</p>
              <div class="card-layer-actions">
                <button class="button-primary" type="button" data-card-save>下载 PNG</button>
                <a class="button-ghost" data-card-page href="#">单独打开这一页</a>
              </div>
              <p class="card-layer-note">1080 × 1440 · 深色 · 102 KB 左右</p>
            </div>
          </div>
        </div>`;
      document.body.appendChild(layer);
      layer.addEventListener('click', (event) => {
        if (event.target === layer || event.target.closest('[data-card-close]')) close();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
    }

    const img = layer.querySelector('[data-card-img]');
    img.src = toDataURL(model);
    img.alt = `${model.name} 风格卡`;
    layer.querySelector('[data-card-page]').href = `#/card/${model.id}`;
    layer.querySelector('[data-card-save]').onclick = () => download(model);
    layer.hidden = false;
    document.body.classList.add('has-card-layer');
    if (options.focus !== false) layer.querySelector('[data-card-close]').focus();
  }

  function close() {
    const layer = document.getElementById('cardLayer');
    if (layer) layer.hidden = true;
    document.body.classList.remove('has-card-layer');
  }

  window.EMShare = { draw, toDataURL, download, open, close, W, H };
})();

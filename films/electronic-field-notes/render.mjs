import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { once } from 'node:events';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(ROOT, '../..');
const PY = process.env.FILM_PYTHON || path.join(REPO, 'dj-engine/.venv/Scripts/python.exe');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FF = process.env.FFMPEG || execFileSync(PY, ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const TL = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json')));
const MODE = process.argv[2] || 'stills';
const delay = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      const p = this.pending.get(m.id);
      if (p) { clearTimeout(p.timer); this.pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
      if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
      this.pending.set(id, { resolve, reject, timer }); this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  close() { for (const p of this.pending.values()) clearTimeout(p.timer); this.pending.clear(); this.ws.close(); }
}
async function open() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'field-film-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--allow-file-access-from-files', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1080,1920', 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    let port;
    for (let i = 0; i < 150; i++) {
      if (chrome.exitCode !== null) throw Error('Chrome exited');
      try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; if (port) break; } catch {}
      await delay(100);
    }
    if (!port) throw Error('Chrome startup timeout');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    cdp = new CDP(ws);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: TL.width, height: TL.height, deviceScaleFactor: 1, mobile: false });
    return { cdp, close: async () => { cdp.close(); chrome.kill(); try { await once(chrome, 'exit'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} } };
  } catch (e) { cdp?.close(); chrome.kill(); throw e; }
}
async function waitFor(cdp, expression) {
  for (let i = 0; i < 150; i++) { if (await cdp.eval(expression)) return; await delay(100); }
  throw Error('Page not ready: ' + expression);
}
async function filmPage(cdp) {
  await cdp.send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'index.html')).href + '?render=1' });
  await waitFor(cdp, 'window.READY === true');
  await cdp.eval(`window.TIMELINE = ${JSON.stringify(TL)}; window.render(0)`);
}
async function jpeg(cdp, t) { return Buffer.from(await cdp.eval(`window.render(${t}); document.querySelector('canvas').toDataURL('image/jpeg', .96).split(',')[1]`), 'base64'); }
async function assets() {
  const b = await open();
  try {
    await b.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
    for (const [name, hash, selector] of [['home', '#/', '.hero-home'], ['automix', '#/dj/automix', '.dja-detail']]) {
      await b.cdp.send('Page.navigate', { url: 'http://127.0.0.1:5501/' + hash });
      await waitFor(b.cdp, `!!document.querySelector(${JSON.stringify(selector)})`);
      await b.cdp.eval('document.fonts.ready');
      const box = await b.cdp.eval(`(() => {const el = document.querySelector(${JSON.stringify(selector)});const b=el.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:Math.min(b.height,1000),scale:1}})()`);
      if (box.width < 200) throw Error('Bad asset selector');
      const shot = await b.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: box });
      fs.writeFileSync(path.join(ROOT, 'assets', name + '.png'), Buffer.from(shot.data, 'base64'));
      console.log('captured', name, box);
    }
  } finally { await b.close(); }
}
async function stills() {
  const b = await open();
  try {
    await filmPage(b.cdp);
    const times = [0, .5, 2, 3.8, 4.6, 6, 8.6, 10, 12, 14.6, 16, 18, 20.6, 22, 24, 26.6, 28, 30, 32.6, 34, 35.8, 36.3, 37.6, 38.6, 40, 42.6, 44, 46, 47.8];
    for (const t of times) fs.writeFileSync(path.join(ROOT, 'review', `frame-${t.toFixed(2)}.jpg`), await jpeg(b.cdp, t));
    fs.writeFileSync(path.join(ROOT, 'poster.jpg'), await jpeg(b.cdp, 44.8));
    const contact = await b.cdp.eval(`window.contactSheet(${JSON.stringify(times)}).split(',')[1]`);
    fs.writeFileSync(path.join(ROOT, 'review/contact-sheet.jpg'), Buffer.from(contact, 'base64'));
    const samples = Array.from({ length: 480 }, (_, i) => i / 10);
    const probes = await b.cdp.eval(`window.audit(${JSON.stringify(samples)})`);
    const frameA = await jpeg(b.cdp, 10.5); await jpeg(b.cdp, 36.3); const frameB = await jpeg(b.cdp, 10.5);
    probes.deterministic = frameA.equals(frameB);
    fs.writeFileSync(path.join(ROOT, 'review/layout-audit.json'), JSON.stringify(probes, null, 2));
    if (b.cdp.errors.length || probes.violations.length || !probes.deterministic) throw Error(JSON.stringify({ pageErrors: b.cdp.errors, layout: probes }));
    console.log('stills OK', times.length, 'frames;', probes.checked, 'text boxes checked');
  } finally { await b.close(); }
}
async function covers() {
  const b = await open();
  try {
    await filmPage(b.cdp);
    for (const [kind, name] of [['landscape', 'cover-4x3.jpg'], ['portrait', 'cover-3x4.jpg']]) {
      const data = await b.cdp.eval(`window.renderCover(${JSON.stringify(kind)}).split(',')[1]`);
      fs.writeFileSync(path.join(ROOT, name), Buffer.from(data, 'base64'));
      console.log('cover OK', name);
    }
    if (b.cdp.errors.length) throw Error(JSON.stringify(b.cdp.errors));
  } finally { await b.close(); }
}
async function video() {
  const workers = 3, total = TL.fps * TL.duration, per = Math.ceil(total / workers);
  await Promise.all(Array.from({ length: workers }, async (_, n) => {
    const a = n * per, z = Math.min(total, a + per), b = await open(); let ff;
    try {
      await filmPage(b.cdp);
      ff = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(TL.fps), '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', path.join(ROOT, `part-${n}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
      let failed = null; ff.on('error', e => failed = e); ff.stdin.on('error', e => failed = e);
      const done = once(ff, 'close');
      for (let f = a; f < z; f++) {
        if (failed) throw failed;
        const data = await jpeg(b.cdp, f / TL.fps);
        if (!ff.stdin.write(data)) await Promise.race([once(ff.stdin, 'drain'), done.then(() => { throw Error('Encoder stopped'); })]);
        if ((f - a) % 120 === 0) console.log(`render ${n + 1}/${workers}: ${f - a}/${z - a}`);
      }
      ff.stdin.end(); const [code] = await done;
      if (code !== 0 || b.cdp.errors.length) throw Error('Render failed: ' + code + JSON.stringify(b.cdp.errors));
    } finally { if (ff && ff.exitCode === null) ff.kill(); await b.close(); }
  }));
  fs.writeFileSync(path.join(ROOT, 'parts.txt'), Array.from({ length: workers }, (_, i) => `file 'part-${i}.mp4'`).join('\n'));
  execFileSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'parts.txt', '-c', 'copy', 'picture.mp4'], { cwd: ROOT, stdio: 'inherit' });
  console.log('picture.mp4 complete', total, 'frames');
}
if (MODE === 'assets') await assets();
else if (MODE === 'stills') await stills();
else if (MODE === 'covers') await covers();
else if (MODE === 'video') await video();
else throw Error('Use assets | stills | covers | video');

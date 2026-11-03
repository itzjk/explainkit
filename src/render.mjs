// Headless Chromium draws every frame (1080x1920, or the 4:5 or 1:1 crop of it); ffmpeg encodes them. Same time in, same frame out.
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { run, ffmpeg } from './util.mjs';
import { guideRects } from './guides.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FPS = 30;
const FACES = ['600 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', '800 40px "Barlow Condensed"',
  '400 40px "Barlow"', '500 40px "Barlow"', '700 40px "Barlow"', '400 40px "JetBrains Mono"', '700 40px "JetBrains Mono"'];

// Opens the stage page with the project's scenes loaded and every font ready before the first frame.
export async function openStage(datos) {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { throw new Error('playwright is not installed. Run: npm install && npx playwright install chromium'); }
  const launch = args => chromium.launch({ args: ['--disable-gpu-vsync', ...args] });
  // some Linux containers and CI images refuse the sandbox: retry without it
  const browser = await launch([]).catch(e => { if (/Executable doesn't exist/.test(String(e))) throw new Error('Chromium is not installed. Run: npx playwright install chromium'); return launch(['--no-sandbox']); });
  const page = await browser.newPage({ viewport: { width: datos.layout.width / 2, height: datos.layout.height / 2 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.join(HERE, 'runtime', 'index.html')).href);
  for (const f of datos.sceneFiles) await page.addScriptTag({ path: f });
  await page.evaluate(d => window.load(d), { shots: datos.shots, caps: datos.caps, fin: datos.fin, config: datos.config });
  const fontsOk = await page.evaluate(async faces => {
    await Promise.all(faces.map(f => document.fonts.load(f)));
    await document.fonts.ready;
    return faces.map(f => document.fonts.check(f));
  }, FACES);
  if (fontsOk.includes(false)) throw new Error('the bundled fonts did not load (fonts/ folder missing or moved?)');
  const frame = (t, { mark = null, guides = null, type = 'image/jpeg' } = {}) => page.evaluate(([t, mark, guides, type]) => {
    window.render(t);
    if (guides || mark) ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const z of guides || []) {
      ctx.fillStyle = 'rgba(255, 70, 70, .32)'; ctx.fillRect(z.x, z.y, z.width, z.height);
      if (z.label) text(z.label, z.x + z.width / 2, z.y + z.height / 2, 56, '#ffffff', { outline: 8 });
    }
    if (mark) { rrect(16, 16, 250, 96, 14, 'rgba(0,0,0,.75)', null); text(mark, 141, 70, 80, '#ffd166'); }
    return document.getElementById('c').toDataURL(type, .92);
  }, [t, mark, guides, type]).then(u => Buffer.from(u.split(',')[1], 'base64'));
  return { frame, errors, page, close: () => browser.close() };
}

function encoder(args, output) {
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', ...args, output], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg encoder exited with ${c}`)))); ff.on('error', rej); });
  ff.stdin.on('error', () => {}); // a dead ffmpeg is reported by "done"
  return { write: async buf => { if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); }, end: () => { ff.stdin.end(); return done; } };
}

export async function stills(datos, outDir, seconds, { guides = false } = {}) {
  const zones = guides ? guideRects(datos.layout) : null;
  const st = await openStage(datos); mkdirSync(outDir, { recursive: true }); const files = [];
  try {
    for (const s of seconds) { const f = path.join(outDir, `t${String(Math.round(s * 1000)).padStart(7, '0')}${guides ? '-guides' : ''}.jpg`); writeFileSync(f, await st.frame(s, { guides: zones })); files.push(f); }
  } finally { report(st.errors); await st.close(); }
  return files;
}

// contact sheet: one frame every `every` seconds with its time written in the corner
export async function sheet(datos, outDir, every = 6) {
  const st = await openStage(datos), tmp = path.join(outDir, 'sheet-frames');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  let n = 0;
  try { for (let t = .5; t < datos.fin; t += every) writeFileSync(path.join(tmp, `${String(n++).padStart(4, '0')}.jpg`), await st.frame(t, { mark: `${t.toFixed(1)} s` })); }
  finally { report(st.errors); await st.close(); }
  const cols = 8, file = path.join(outDir, 'sheet.jpg');
  ffmpeg(['-framerate', '1', '-i', path.join(tmp, '%04d.jpg'), '-vf', `scale=270:-2,tile=${cols}x${Math.ceil(n / cols)}`, '-frames:v', '1', file], 'contact sheet');
  rmSync(tmp, { recursive: true, force: true });
  return { file, frames: n };
}

// silent video (and with sound when an audio file is given). from/to cut a section.
export async function video(datos, outDir, { audio = null, from = 0, to = datos.fin, name = null, log = console.log } = {}) {
  mkdirSync(outDir, { recursive: true });
  to = Math.min(datos.fin, to);
  const cut = from > 0 || to < datos.fin, base = name || (cut ? `clip-${from}-${to}` : 'video');
  const silent = path.join(outDir, `${base}-silent.mp4`), final = path.join(outDir, `${base}.mp4`);
  const i0 = Math.floor(from * FPS), n = Math.ceil(to * FPS);
  const enc = encoder(['-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-threads', '4'], silent);
  const st = await openStage(datos), t0 = Date.now();
  try {
    for (let i = i0; i < n; i++) {
      await enc.write(await st.frame(i / FPS));
      if ((i - i0) % 300 === 0) log(`frame ${i - i0}/${n - i0}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  } finally { report(st.errors); await st.close(); await enc.end().catch(() => {}); }
  log(`silent video ready (${((Date.now() - t0) / 1000).toFixed(0)} s to render)`);
  if (audio && existsSync(audio)) {
    ffmpeg(['-i', silent, '-ss', String(from), '-t', String(to - from), '-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final], 'mux');
    rmSync(silent, { force: true });
    return { file: final, seconds: to - from, withAudio: true };
  }
  run('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-c', 'copy', '-movflags', '+faststart', final]);
  rmSync(silent, { force: true });
  return { file: final, seconds: to - from, withAudio: false };
}

// animated GIF of a section, for READMEs and posts
export async function gif(datos, outFile, { from = 0, to = 6, width = 300, fps = 12 } = {}) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  const vf = `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  const enc = encoder(['-framerate', String(fps), '-i', '-', '-vf', vf, '-loop', '0'], outFile);
  const st = await openStage(datos);
  try { for (let t = from; t < to; t += 1 / fps) await enc.write(await st.frame(t)); }
  finally { report(st.errors); await st.close(); await enc.end().catch(() => {}); }
  return outFile;
}

function report(errors) { if (errors.length) console.error('ERRORS IN THE PAGE:\n' + [...new Set(errors)].slice(0, 10).join('\n')); }

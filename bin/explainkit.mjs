#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepare, loadConfig } from '../src/project.mjs';
import { estimateWords, whisperWords, writeWords, scriptText } from '../src/align.mjs';
import { mix } from '../src/mix.mjs';
import { narrate } from '../src/tts.mjs';
import { writeCaptionFiles } from '../src/subtitles.mjs';
import { stills, sheet, video, gif } from '../src/render.mjs';
import { have, run, findOnPath } from '../src/util.mjs';
import { whisperDoctor } from '../src/whisper-model.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `explainkit: script + narration -> vertical 2D explainer video (1080x1920 by default, 30 fps), all on your machine.

  explainkit new <dir>                      create a starter project
  explainkit build <dir> [--audio file]     timings + mix + render: out/video.mp4 (silent narration track if no audio)
  explainkit frames <dir> --at 3,40,95 [--guides]   stills at those seconds -> out/stills/ (--guides tints the platform UI zones, on stills only)
  explainkit sheet <dir> [--every 6]        contact sheet of the whole video -> out/sheet.jpg
  explainkit render <dir> [--from 0 --to 10]   render the video (or a section) from what is already in out/
  explainkit gif <dir> --from 2 --to 8      animated GIF of a section -> out/preview.gif
  explainkit srt <dir>                      the video's captions as files -> out/captions.srt and out/captions.vtt
  explainkit align <dir> [--engine estimate|whisper] [--model ggml.bin]   write out/words.json
  explainkit mix <dir>                      write out/audio-final.m4a
  explainkit tts <dir> --engine kokoro|command [--voice af_heart] [--cmd "..."]   make narration.wav from the script
  explainkit tts <dir> --engine piper --voice voice.onnx [--piper-bin piper] [--piper-config voice.onnx.json]
  explainkit doctor                         check ffmpeg, Chromium, fonts, and the whisper model if you use it

Common options: --audio <file> uses that narration instead of project.json's "audio".
                --output 9:16|4:5|1:1 sets the video size (1080x1920, 1080x1350, 1080x1080) instead of project.json's "output".
Docs: README.md`;

const { values: v, positionals: pos } = parseArgs({ allowPositionals: true, options: {
  audio: { type: 'string' }, at: { type: 'string' }, every: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
  engine: { type: 'string' }, model: { type: 'string' }, voice: { type: 'string' }, cmd: { type: 'string' }, 'piper-bin': { type: 'string' }, 'piper-config': { type: 'string' }, width: { type: 'string' },
  fps: { type: 'string' }, out: { type: 'string' }, output: { type: 'string' }, guides: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
const [command, arg] = pos;
const dirOf = () => { if (!arg) fail(`usage: explainkit ${command} <project-folder>`); return path.resolve(arg); };
const overrides = () => ({ ...(v.audio ? { audio: path.resolve(v.audio) } : {}), ...(v.output !== undefined ? { output: v.output } : {}) });
const fail = m => { console.error(`error: ${m}`); process.exit(1); };
const num = (x, d) => (x === undefined ? d : Number(x));

async function alignStep(dir, cfg) {
  const engine = v.engine || 'estimate';
  const lang = cfg.language;
  let words;
  if (engine === 'whisper') { if (!cfg.audioFile) fail('--engine whisper needs narration audio (project.json "audio" or --audio)'); words = whisperWords(cfg.audioFile, { model: v.model, language: lang }); }
  else if (engine === 'estimate') words = estimateWords(scriptText(readFileSync(cfg.scriptFile, 'utf8')), { audio: cfg.audioFile, wps: cfg.wordsPerSecond });
  else fail(`unknown engine "${engine}" (estimate or whisper)`);
  mkdirSync(path.join(dir, 'out'), { recursive: true });
  const file = path.join(dir, 'out', 'words.json'); writeWords(file, words);
  console.log(`${words.length} words, ${words.at(-1).end.toFixed(1)} s -> ${path.relative(process.cwd(), file)} (${engine}${engine === 'estimate' ? ', approximate timings' : ''})`);
}

function doctor() {
  let bad = 0; const ok = (c, m, hint) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${c ? '' : '  -> ' + hint}`); if (!c) bad++; };
  ok(Number(process.versions.node.split('.')[0]) >= 20, `node ${process.versions.node}`, 'install Node 20 or newer');
  const ff = have('ffmpeg'); ok(ff, 'ffmpeg on PATH', 'install ffmpeg (https://ffmpeg.org/download.html)');
  if (ff) {
    const enc = run('ffmpeg', ['-hide_banner', '-encoders']).stdout, fl = run('ffmpeg', ['-hide_banner', '-filters']).stdout;
    ok(/libx264/.test(enc), 'ffmpeg has libx264', 'use an ffmpeg build with libx264');
    ok(/\baac\b/.test(enc), 'ffmpeg has aac', 'use an ffmpeg build with aac');
    ok(/loudnorm/.test(fl) && /sidechaincompress/.test(fl), 'ffmpeg has loudnorm and sidechaincompress', 'use ffmpeg 4.4 or newer');
  }
  ok(have('ffprobe'), 'ffprobe on PATH', 'it ships with ffmpeg');
  for (const f of ['barlow-condensed-latin-700-normal.woff2', 'barlow-latin-400-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2']) ok(existsSync(path.join(ROOT, 'fonts', f)), `font ${f}`, 'fonts/ folder is incomplete');
  const w = whisperDoctor(); w.lines.forEach(l => console.log(l)); if (w.failed) bad++;
  const pp = findOnPath('piper'); console.log(pp ? `ok   piper: ${pp}` : 'info piper: not found (optional: only --engine piper needs it; the error from tts says what to download)');
  return import('playwright').then(async ({ chromium }) => {
    try { const b = await chromium.launch(); await b.close(); ok(true, 'Chromium launches'); }
    catch { ok(false, 'Chromium launches', 'npx playwright install chromium'); }
  }, () => ok(false, 'playwright installed', 'npm install')).then(() => { console.log(bad ? `\n${bad} problem(s)` : '\nall good'); process.exit(bad ? 1 : 0); });
}

function scaffold(dir) {
  if (existsSync(path.join(dir, 'project.json'))) fail(`${dir} already has a project`);
  mkdirSync(dir, { recursive: true });
  const w = (f, s) => writeFileSync(path.join(dir, f), s);
  w('script.txt', `# Your narration. Lines that start with # are comments. One idea per sentence reads best.\n\nMost of the web is a library nobody organized. Every page is a shelf. Every link is a hallway between shelves.\n\nSo how does a search engine find anything? It sends robots to walk every hallway and write down what they see.\n`);
  w('project.json', JSON.stringify({ script: 'script.txt', audio: 'narration.mp3', plan: 'plan.js', scenes: ['scenes.js'], language: 'en', captions: true }, null, 2) + '\n');
  w('plan.js', `// One row per shot: [anchor, scene, params, label].\n// The shot starts when the narrator says the anchor (consecutive words from your script, in order) and lasts until the next anchor.\nconst PLAN = [\n  ['Most of the web', 'title', { lines: ['THE WEB', 'IS A LIBRARY'], stars: true }],\n  ['Every page is a shelf', 'shelves', { count: 6 }, 'SHELVES'],\n  ['So how does', 'face', { expr: 'surprised', bg: '#24304a', bg2: '#141a2a' }],\n  ['It sends robots', 'shelves', { count: 12, robots: true }, 'ROBOTS'],\n];\n`);
  w('scenes.js', `// Your own scenes. Everything in runtime/draw.js is available as a global: background, rrect, circle, text, glow, stars, city, hero, ...\nESC.shelves = (p, P, T) => {\n  background('#1b2234', '#0e121c');\n  const n = P.count || 6;\n  for (let i = 0; i < n; i++) {\n    const a = easeOut(p * 3 - i * .15), x0 = 140 + (i % 2) * 400, y0 = 520 + Math.floor(i / 2) * 230;\n    ctx.globalAlpha = a; rrect(x0, y0, 360, 170, 14, '#2c3a5a', '#4b628f', 4); text('/page-' + (i + 1), x0 + 180, y0 + 85, 46, '#cbd6ee', { font: MONO });\n  }\n  ctx.globalAlpha = 1;\n  if (P.robots) for (let r = 0; r < 3; r++) { const x1 = 140 + ((T * 160 + r * 330) % 760), y1 = 1560 + Math.sin(T * 4 + r) * 18; rrect(x1, y1, 90, 80, 18, C.light); circle(x1 + 28, y1 + 30, 9, C.black); circle(x1 + 62, y1 + 30, 9, C.black); }\n};\n`);
  w('mix.json', JSON.stringify({ music: [{ file: 'synth:pad', from: 0 }] }, null, 2) + '\n');
  w('.gitignore', 'out/\n');
  console.log(`created ${dir}\n  1. edit script.txt and plan.js\n  2. put your narration at ${path.join(dir, 'narration.mp3')} (or: explainkit tts ${dir} --engine kokoro)\n  3. explainkit build ${dir}`);
}

async function main() {
  if (!command || v.help || command === 'help') return console.log(HELP);
  if (v.guides && command !== 'frames') fail('--guides only works with frames: the zones are for looking at stills and are never drawn into a video, a sheet or a gif');
  if (command === 'doctor') return doctor();
  if (command === 'new') { if (!arg) fail('usage: explainkit new <dir>'); return scaffold(path.resolve(arg)); }
  const dir = dirOf(), out = path.join(dir, 'out');
  const cfg = () => loadConfig(dir, overrides());
  switch (command) {
    case 'align': return alignStep(dir, cfg());
    case 'mix': {
      const d = prepare(dir, overrides()); const r = mix(dir, { voice: d.cfg.audioFile, total: d.fin });
      return console.log(`audio ${r.seconds.toFixed(1)} s -> ${r.file}`);
    }
    case 'tts': {
      const c = cfg(); const o = path.resolve(v.out || (c.audio ? path.resolve(dir, c.audio) : path.join(dir, 'narration.wav')));
      await narrate({ scriptFile: c.scriptFile, out: o, engine: v.engine || 'kokoro', voice: v.voice, cmd: v.cmd, piperBin: v['piper-bin'], piperConfig: v['piper-config'] });
      return console.log(`narration -> ${o}`);
    }
    case 'frames': {
      const d = prepare(dir, overrides()); const secs = (v.at || '1').split(',').map(Number);
      const files = await stills(d, path.join(out, 'stills'), secs, { guides: v.guides }); return files.forEach(f => console.log(f));
    }
    case 'sheet': {
      const d = prepare(dir, overrides()); const r = await sheet(d, out, num(v.every, 6)); return console.log(`${r.frames} frames -> ${r.file}`);
    }
    case 'gif': {
      const d = prepare(dir, overrides()); const f = await gif(d, path.resolve(v.out || path.join(out, 'preview.gif')), { from: num(v.from, 0), to: num(v.to, 6), width: num(v.width, 300), fps: num(v.fps, 12) });
      return console.log(`gif -> ${f}`);
    }
    case 'srt': {
      const d = prepare(dir, overrides()), r = writeCaptionFiles(d.caps, out), rel = f => path.relative(process.cwd(), f);
      console.log(`${r.count} captions -> ${rel(r.srt)}, ${rel(r.vtt)} (timings: ${d.source})${r.skipped ? `, ${r.skipped} left out (no text or no length)` : ''}`);
      if (d.source !== 'file') console.log('note: no words file found, so these timings are estimates and can drift from the voice by a few tenths of a second. For exact times: explainkit align <dir> --engine whisper --model ggml.bin, then run srt again.');
      return;
    }
    case 'render': case 'build': {
      if (command === 'build') { await alignStep(dir, cfg()); }
      const d = prepare(dir, overrides());
      console.log(`${d.shots.length} shots, ${d.caps.length} captions, ${d.fin.toFixed(1)} s (timings: ${d.source})`);
      const m = command === 'build' || !existsSync(path.join(out, 'audio-final.m4a')) ? mix(dir, { voice: d.cfg.audioFile, total: d.fin }) : { file: path.join(out, 'audio-final.m4a') };
      const r = await video(d, out, { audio: m.file, from: num(v.from, 0), to: num(v.to, d.fin) });
      return console.log(`done: ${r.file}${d.cfg.audioFile ? '' : '\nnote: no narration audio found, so this has music only and estimated timings. Add narration.mp3 (see README) and run build again.'}`);
    }
    default: fail(`unknown command "${command}"\n\n${HELP}`);
  }
}
main().catch(e => fail(e.message));

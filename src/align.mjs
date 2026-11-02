// Word timings: the renderer places shots and captions where each word is spoken.
// words.json is a plain array: [{ "text": "Every", "start": 0.12, "end": 0.4 }, ...]
//
// Three ways to get it:
//   estimate  no extra tools. Spreads the words of the script over the speech found in the audio (or over a reading-speed
//             duration when there is no audio). Good for storyboards and drafts, can drift by a few tenths of a second.
//   whisper   whisper.cpp (`whisper-cli`) with a ggml model you downloaded yourself. Exact word times.
//   file      bring your own words.json (any tool), or whisper.cpp JSON: it is detected and converted.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, ffmpeg, duration, norm, findOnPath } from './util.mjs';
import { findWhisperModel, modelHelp, cliHelp, modelUrl, RECOMMENDED } from './whisper-model.mjs';

export const DEFAULT_WPS = 2.6; // words per second of a calm narrator, used when there is no audio to measure

// script.txt -> clean text. Lines starting with # are comments; [bracketed notes] are removed.
export function scriptText(raw) {
  return raw.replace(/\r/g, '').split('\n').filter(l => !/^\s*#/.test(l)).join('\n').replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

// how long a word takes relative to the others: letters, plus pause weight for punctuation
function weight(token) {
  const letters = token.replace(/[^\p{L}\p{N}]/gu, '').length;
  let w = 1.5 + letters; // every word costs something even when it is short
  if (/[.!?…]["')\]]*$/.test(token)) w += 5;
  else if (/[,;:\u2014-]["')\]]*$/.test(token)) w += 2.2;
  return { w, pauseAfter: /[.!?…]["')\]]*$/.test(token) ? 0.32 : /[,;:]["')\]]*$/.test(token) ? 0.14 : 0 };
}

// where speech starts and ends in an audio file (leading and trailing silence trimmed)
export function speechSpan(audio) {
  const total = duration(audio);
  const r = run('ffmpeg', ['-v', 'info', '-i', audio, '-af', 'silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = r.stderr || '';
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1]);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map(m => +m[1]);
  let start = 0, end = total;
  if (starts.length && starts[0] < 0.05 && ends.length) start = ends[0];            // silence at the very start
  if (starts.length > ends.length) end = starts[starts.length - 1];                    // silence that runs to the end
  if (end - start < total * 0.3) { start = 0; end = total; }                           // detection looks wrong: do not trust it
  return { start, end, total };
}

export function estimateWords(text, { audio = null, wps = DEFAULT_WPS } = {}) {
  const tokens = text.split(/\s+/).filter(t => norm(t));
  if (!tokens.length) throw new Error('the script has no words');
  const ws = tokens.map(weight);
  const pauses = ws.reduce((a, x) => a + x.pauseAfter, 0);
  let start = 0.25, span;
  if (audio) { const s = speechSpan(audio); start = s.start; span = s.end - s.start; }
  else span = tokens.length / wps + pauses;
  const sum = ws.reduce((a, x) => a + x.w, 0), speak = Math.max(0.5, span - pauses);
  let t = start; const out = [];
  tokens.forEach((tok, i) => {
    const d = ws[i].w / sum * speak;
    out.push({ text: tok, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
    t += d + ws[i].pauseAfter;
  });
  return out;
}

// whisper.cpp JSON ({ transcription: [{ text, offsets: { from, to } }] }) or ours; always returns our shape
export function readWords(file) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const arr = Array.isArray(j) ? j : j.transcription;
  if (!Array.isArray(arr)) throw new Error(`${file}: expected an array of words or a whisper.cpp JSON`);
  const words = arr.map(w => w.offsets
    ? { text: String(w.text).trim(), start: w.offsets.from / 1000, end: w.offsets.to / 1000 }
    : { text: String(w.text).trim(), start: Number(w.start), end: Number(w.end) });
  const bad = words.find(w => !w.text ? false : !(w.end >= w.start) || Number.isNaN(w.start));
  if (bad) throw new Error(`${file}: a word has no valid start/end: ${JSON.stringify(bad)}`);
  return words.filter(w => norm(w.text));
}

export function whisperWords(audio, { model, language = 'en', env = process.env, home } = {}) {
  const found = findWhisperModel({ flag: model, env, home, language }), cli = findOnPath('whisper-cli', { env });
  const problems = [];
  if (!cli) problems.push(cliHelp());
  if (!found.ok) { const h = modelHelp(found); problems.push(`${h.headline}\n${h.steps}`); }
  if (problems.length) throw new Error(problems.join('\n\n'));
  const tmp = mkdtempSync(path.join(tmpdir(), 'explainkit-'));
  try {
    ffmpeg(['-i', audio, '-ar', '16000', '-ac', '1', path.join(tmp, 'a.wav')], 'audio conversion');
    // -ml 1: one word per segment. -mc 0: no context between windows (with context whisper skipped whole sentences and times drifted)
    const r = run(cli, ['-m', found.file, '-l', language, '-ml', '1', '-sow', '-mc', '0', '-oj', '-of', path.join(tmp, 'p'), '-np', '-t', '4', path.join(tmp, 'a.wav')], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status !== 0) {
      const tail = (r.stderr || '').slice(-300);
      throw new Error(`whisper-cli failed: ${tail}${/model|tensor|magic/i.test(tail) ? `\nThe model file may be damaged or incomplete: ${found.file} is ${found.bytes} bytes, ${RECOMMENDED.file} is ${RECOMMENDED.bytes}. Download it again from ${modelUrl(RECOMMENDED.file)}` : ''}`);
    }
    return readWords(path.join(tmp, 'p.json'));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export function writeWords(file, words) { writeFileSync(file, JSON.stringify(words, null, 1)); }

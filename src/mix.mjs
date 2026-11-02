// Mixes voice + music + hits into out/audio-final.m4a. The music ducks under the voice (sidechain compression) and the
// result is normalized to a target loudness (-14 LUFS by default, a common level for social platforms).
//
// mix.json (every key is optional; paths are relative to the project folder, "synth:name" are built-in sounds):
//   { "music": [{ "file": "synth:pad", "from": 0, "duration": 60, "fadeIn": 1.5, "fadeOut": 3, "volume": 1 }],
//     "hits":  [{ "file": "synth:boom", "at": 12.3 }],
//     "musicVolume": 0.22, "hitVolume": 0.5, "tail": 1.4, "lufs": -14 }
// "volume" is a number or an ffmpeg expression in t (for example "if(gt(t,30),0.6,1)").
// "from" is the second of the video where the track enters, "duration" how long it plays.
// Use only audio you have the rights to. The repository ships none: bring your own files or use the synth sounds.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ffmpeg, duration, norm } from './util.mjs';
import { isSynth, synth } from './synth.mjs';

export function mixConfig(dir) {
  const f = path.join(dir, 'mix.json');
  return Object.assign({ music: [], hits: [], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 }, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {});
}

// Resolve { "words": "..." } anchors in hits[].at and music[].from to seconds.
// words is [{ text, start, end }] from loadWords(). Plain numbers pass through unchanged.
export function resolveMixAnchors(cfg, words) {
  const tok = [], owner = [];
  (words || []).forEach((w, i) => norm(w.text).split(' ').filter(Boolean).forEach(t => { tok.push(t); owner.push(i); }));
  const resolve = (anchor) => {
    const a = norm(anchor).split(' ').filter(Boolean);
    for (let i = 0; i <= tok.length - a.length; i++) {
      if (a.every((t, k) => tok[i + k] === t)) return words[owner[i]].start;
    }
    throw new Error(`mix.json: anchor not found: "${anchor}"`);
  };
  const isWordAnchor = v => v && typeof v === 'object' && v.words != null;
  const hits = cfg.hits.map(h => isWordAnchor(h.at) ? { ...h, at: resolve(h.at.words) } : h);
  const music = cfg.music.map(m => isWordAnchor(m.from) ? { ...m, from: resolve(m.from.words) } : m);
  return { ...cfg, hits, music };
}

// total: seconds of video; voice: path or null; words: [{ text, start, end }] or null. Returns { file, seconds }.
export function mix(dir, { voice = null, total, words = null }) {
  const cfg = resolveMixAnchors(mixConfig(dir), words || []);
  const out = path.join(dir, 'out'), cache = path.join(out, '.synth');
  mkdirSync(out, { recursive: true });
  const seconds = voice ? duration(voice) + cfg.tail : total;
  const resolve = (f, secs) => isSynth(f) ? synth(f, cache, secs) : path.resolve(dir, f);
  const music = cfg.music.map(m => ({ ...m, dur: m.duration ?? Math.max(1, seconds - (m.from || 0)) }));
  const files = music.map(m => resolve(m.file, m.dur));
  const hits = cfg.hits.map(h => ({ ...h, path: resolve(h.file, 3) }));
  for (const f of [...files, ...hits.map(h => h.path)]) if (!existsSync(f)) throw new Error(`mix.json: audio file not found: ${f}`);
  const inputs = [], graph = [], est = 'aresample=48000,aformat=channel_layouts=stereo';
  if (voice) inputs.push(voice); else inputs.push('anullsrc=r=48000:cl=stereo');
  graph.push(voice ? `[0:a]${est},apad=pad_dur=${cfg.tail + 1},asplit=2[voice][vsc]` : `[0:a]${est},asplit=2[voice][vsc]`);
  const parts = ['[voice]'];
  music.forEach((m, i) => {
    inputs.push(files[i]);
    const ms = Math.round((m.from || 0) * 1000), fi = m.fadeIn ?? 1, fo = m.fadeOut ?? 3;
    const vol = typeof m.volume === 'string' ? `volume='${m.volume}':eval=frame` : `volume=${m.volume ?? 1}`;
    graph.push(`[${inputs.length - 1}:a]atrim=0:${m.dur},afade=t=in:d=${fi},afade=t=out:st=${Math.max(0, m.dur - fo)}:d=${fo},${vol},adelay=${ms}|${ms},${est}[m${i}]`);
  });
  if (music.length) {
    graph.push(`${music.map((_, i) => `[m${i}]`).join('')}amix=inputs=${music.length}:normalize=0,volume=${cfg.musicVolume}[mus]`);
    if (voice) { graph.push('[mus][vsc]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=400[musd]'); parts.push('[musd]'); }
    else { graph.push('[vsc]anullsink'); parts.push('[mus]'); }
  } else graph.push('[vsc]anullsink');
  hits.forEach((h, i) => {
    inputs.push(h.path); const ms = Math.round(h.at * 1000);
    graph.push(`[${inputs.length - 1}:a]${est},adelay=${ms}|${ms}[h${i}]`);
  });
  if (hits.length) { graph.push(`${hits.map((_, i) => `[h${i}]`).join('')}amix=inputs=${hits.length}:normalize=0,volume=${cfg.hitVolume}[hits]`); parts.push('[hits]'); }
  graph.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0,atrim=0:${seconds.toFixed(2)},loudnorm=I=${cfg.lufs}:TP=-1.5:LRA=11[out]`);
  const file = path.join(out, 'audio-final.m4a');
  const args = [];
  inputs.forEach((f, i) => { if (i === 0 && !voice) args.push('-f', 'lavfi', '-t', String(seconds), '-i', f); else args.push('-i', f); });
  ffmpeg([...args, '-filter_complex', graph.join(';'), '-map', '[out]', '-c:a', 'aac', '-b:a', '192k', file], 'mix');
  return { file, seconds: duration(file) };
}

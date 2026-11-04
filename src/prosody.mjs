// Per-sentence prosody markers: [slow], [fast], [low], [high], [quiet], [loud]
// Place a marker before or inside the sentence it modifies; markers after a sentence-ending
// punctuation apply to the following sentence.
//
// Pitch limit: ±2 semitones. Beyond that the voice identity shifts noticeably (Mori, 1970).
// Tempo limit: 0.75–1.33× (atempo range usable without chaining).
//
// Usage:
//   const specs = parseProsodyScript(raw);        // validate + extract, throws on unknown markers
//   const groups = groupWordsBySentence(words);    // from out/words.json
//   prosody(raw, words, 'narration.wav', 'out/voice-prosody.wav');
import { readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ffmpeg, duration } from './util.mjs';

export const MARKERS = {
  slow:  { tempo: 0.85, semitones:  0, volume: 1    },
  fast:  { tempo: 1.18, semitones:  0, volume: 1    },
  low:   { tempo: 1,    semitones: -2, volume: 1    },
  high:  { tempo: 1,    semitones:  2, volume: 1    },
  quiet: { tempo: 1,    semitones:  0, volume: 0.65 },
  loud:  { tempo: 1,    semitones:  0, volume: 1.5  },
};

const SR = 48000;

// Parse the original script (with comments and markers) into [{text, markers}].
// text is the clean sentence (markers stripped); markers is string[].
// Throws if any [tag] is not a known prosody marker.
export function parseProsodyScript(raw) {
  const stripped = raw.replace(/\r/g, '').split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  const chunks = stripped.split(/(?<=[.!?…]["')\]]*)\s+/).map(c => c.trim()).filter(Boolean);
  const known = Object.keys(MARKERS);
  return chunks.map(chunk => {
    const markers = [];
    const re = /\[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(chunk)) !== null) {
      const name = m[1].trim().toLowerCase();
      if (!MARKERS[name]) {
        throw new Error(
          `unknown prosody marker [${m[1]}] — known markers: ${known.map(k => `[${k}]`).join(', ')}`
        );
      }
      markers.push(name);
    }
    const text = chunk.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    return { text, markers };
  }).filter(s => s.text.length > 0);
}

// Group word-time tokens into sentence arrays by detecting sentence-ending punctuation
// on each word's text. A trailing fragment with no sentence-ending punctuation becomes
// its own group.
export function groupWordsBySentence(words) {
  const sentences = [];
  let current = [];
  for (const w of words) {
    current.push(w);
    if (/[.!?…]["')\]]*$/.test(w.text)) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length) sentences.push(current);
  return sentences;
}

// Build the ffmpeg filtergraph filter string for a list of markers (may be empty → returns null).
function markerFilters(markers) {
  if (!markers.length) return null;
  let totalTempo = 1, totalSemitones = 0, totalVolume = 1;
  for (const m of markers) {
    const e = MARKERS[m];
    totalTempo  *= e.tempo;
    totalSemitones += e.semitones;
    totalVolume *= e.volume;
  }
  const filters = [];
  if (Math.abs(totalTempo - 1) > 1e-6) filters.push(`atempo=${totalTempo.toFixed(5)}`);
  if (Math.abs(totalSemitones) > 1e-6) {
    const f = 2 ** (totalSemitones / 12);
    const newRate = Math.round(SR * f);
    filters.push(`asetrate=${newRate},aresample=${SR},atempo=${(1 / f).toFixed(6)}`);
  }
  if (Math.abs(totalVolume - 1) > 1e-6) filters.push(`volume=${totalVolume.toFixed(5)}`);
  return filters.length ? filters.join(',') : null;
}

// Low-level: apply prosody to segments of an audio file and write outFile.
// segments: [{start, end, markers}] in seconds, covering the full audio duration.
export function applyProsody(audioFile, outFile, segments) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  if (!segments.some(s => s.markers.length > 0)) {
    copyFileSync(audioFile, outFile);
    return outFile;
  }
  const graph = [], outputs = [];
  for (let i = 0; i < segments.length; i++) {
    const { start, end, markers } = segments[i];
    const base = `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=${SR}`;
    const extra = markerFilters(markers);
    graph.push(`${base}${extra ? ',' + extra : ''}[s${i}]`);
    outputs.push(`[s${i}]`);
  }
  if (segments.length === 1) {
    graph[0] = graph[0].replace('[s0]', '[out]');
  } else {
    graph.push(`${outputs.join('')}concat=n=${segments.length}:v=0:a=1[out]`);
  }
  ffmpeg(['-i', audioFile, '-filter_complex', graph.join(';'), '-map', '[out]', outFile], 'prosody');
  return outFile;
}

// High-level: read script markers, match to word groups, apply prosody, write outFile.
// Returns { modified: boolean, sentences: number } where sentences is the count of modified ones.
export function prosody(scriptRaw, words, audioFile, outFile) {
  const specs = parseProsodyScript(scriptRaw);
  if (!specs.some(s => s.markers.length > 0)) {
    mkdirSync(path.dirname(outFile), { recursive: true });
    copyFileSync(audioFile, outFile);
    return { modified: false, sentences: 0 };
  }
  const wordGroups = groupWordsBySentence(words);
  if (!wordGroups.length) {
    mkdirSync(path.dirname(outFile), { recursive: true });
    copyFileSync(audioFile, outFile);
    return { modified: false, sentences: 0 };
  }
  const audioDur = duration(audioFile);
  const segments = [];
  const firstStart = wordGroups[0][0].start;
  if (firstStart > 0.01) segments.push({ start: 0, end: firstStart, markers: [] });
  for (let i = 0; i < wordGroups.length; i++) {
    const start = wordGroups[i][0].start;
    const end = i < wordGroups.length - 1 ? wordGroups[i + 1][0].start : audioDur;
    const markers = i < specs.length ? specs[i].markers : [];
    segments.push({ start, end, markers });
  }
  applyProsody(audioFile, outFile, segments);
  const modified = specs.filter(s => s.markers.length > 0).length;
  return { modified: true, sentences: modified };
}

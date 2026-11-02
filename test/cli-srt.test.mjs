import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../src/project.mjs';
import { toSrt, toVtt } from '../src/subtitles.mjs';
import { run } from '../src/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const explainkit = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'explainkit.mjs'), ...args], { encoding: 'utf8' });

const WORDS = [
  { text: 'Rain', start: 0.5, end: 0.8 }, { text: 'fell', start: 0.85, end: 1.1 }, { text: 'on', start: 1.15, end: 1.25 },
  { text: 'the', start: 1.3, end: 1.4 }, { text: 'old', start: 1.45, end: 1.7 }, { text: 'harbor.', start: 1.75, end: 2.3 },
  { text: 'Nobody', start: 3, end: 3.4 }, { text: 'noticed', start: 3.45, end: 3.9 }, { text: 'the', start: 3.95, end: 4.05 },
  { text: 'lamp.', start: 4.1, end: 4.6 },
];

// a project in a folder whose name has a space; words is the timings file, or null for a project that has none yet
function project({ cfg = {}, words = WORDS } = {}) {
  const d = mkdtempSync(path.join(tmpdir(), 'ek cli-'));
  writeFileSync(path.join(d, 'project.json'), JSON.stringify({ scenes: [], ...cfg }));
  writeFileSync(path.join(d, 'script.txt'), 'Rain fell on the old harbor. Nobody noticed the lamp.');
  writeFileSync(path.join(d, 'plan.js'), "const PLAN = [['Rain fell', 'a'], ['Nobody', 'b']];");
  if (words) { mkdirSync(path.join(d, 'out')); writeFileSync(path.join(d, 'out', 'words.json'), JSON.stringify(words)); }
  return d;
}

test('help lists the srt command and the two files it writes', () => {
  const r = explainkit('help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^ {2}explainkit srt <dir> .*out\/captions\.srt and out\/captions\.vtt$/m);
});

test('srt writes out/captions.srt and out/captions.vtt from the captions the renderer uses', () => {
  const d = project(), r = explainkit('srt', d);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^5 captions -> .*captions\.srt, .*captions\.vtt \(timings: file\)\n$/, 'words file present: no estimate note, nothing left out');
  const { caps } = prepare(d);
  assert.equal(readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8'), toSrt(caps));
  assert.equal(readFileSync(path.join(d, 'out', 'captions.vtt'), 'utf8'), toVtt(caps));
  assert.ok(readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8').startsWith('1\n00:00:00,500 --> 00:00:01,150\nRAIN FELL\n\n2\n00:00:01,150 --> 00:00:01,750\nON THE OLD\n'));
  assert.ok(readFileSync(path.join(d, 'out', 'captions.vtt'), 'utf8').startsWith('WEBVTT\n\n1\n00:00:00.500 --> 00:00:01.150\nRAIN FELL\n'));
});

test('srt follows out/words.json: other timings, other cues', () => {
  const d = project({ words: WORDS.map(w => ({ ...w, start: w.start + 10, end: w.end + 10 })) });
  assert.equal(explainkit('srt', d).status, 0);
  assert.ok(readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8').startsWith('1\n00:00:10,500 --> 00:00:11,150\nRAIN FELL\n'));
});

test('srt with no words file estimates the timings from the script, creates out/, and says it is an estimate', () => {
  const d = project({ words: null }), r = explainkit('srt', d);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\(timings: estimate-from-script\)/);
  assert.match(r.stdout, /^note: no words file found, so these timings are estimates/m);
  assert.equal(readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8'), toSrt(prepare(d).caps));
  assert.ok(!existsSync(path.join(d, 'out', 'words.json')), 'srt only writes the two caption files');
});

test('srt --audio spreads the estimated timings over that narration, like every other command', () => {
  const d = project({ words: null }), tone = path.join(d, 'tone.wav');
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', tone]);
  const r = explainkit('srt', d, '--audio', tone);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\(timings: estimate-from-audio\)/);
  const ends = [...readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8').matchAll(/--> (\d\d):(\d\d):(\d\d),(\d{3})/g)].map(m => ((+m[1] * 60 + +m[2]) * 60 + +m[3]) + m[4] / 1000);
  assert.ok(ends.at(-1) > 8, `the last cue ends at ${ends.at(-1)} s, so the 8 s narration was not used (the script alone is about 5 s)`);
});

test('srt works when the video has no burned-in captions ("captions": false), which is when people want the files', () => {
  const d = project({ cfg: { captions: false } }), r = explainkit('srt', d);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^5 captions/);
  assert.equal(readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8').split('\n\n').filter(Boolean).length, 5);
});

test('srt on a copy of an example project: one cue per caption, and nothing else is written', () => {
  const d = path.join(mkdtempSync(path.join(tmpdir(), 'ek-')), 'lighthouse');
  // out/ is ignored by git; a local build leaves files there that a fresh clone does not have, so it is not copied
  const src = path.join(ROOT, 'examples', 'lighthouse');
  cpSync(src, d, { recursive: true, filter: f => path.relative(src, f).split(path.sep)[0] !== 'out' });
  const r = explainkit('srt', d);
  assert.equal(r.status, 0, r.stderr);
  const n = prepare(d).caps.length;
  assert.match(r.stdout, new RegExp(`^${n} captions -> `));
  assert.equal(readFileSync(path.join(d, 'out', 'captions.srt'), 'utf8').trim().split('\n\n').length, n);
  assert.equal(readFileSync(path.join(d, 'out', 'captions.vtt'), 'utf8').trim().split('\n\n').length, n + 1, 'the cues and the header');
  assert.deepEqual(readdirSync(path.join(d, 'out')).sort(), ['captions.srt', 'captions.vtt']);
});

test('srt without a folder, or with a folder that is not a project, fails with a message and writes nothing', () => {
  const noArg = explainkit('srt');
  assert.equal(noArg.status, 1);
  assert.match(noArg.stderr, /usage: explainkit srt <project-folder>/);
  const empty = mkdtempSync(path.join(tmpdir(), 'ek-')), notProject = explainkit('srt', empty);
  assert.equal(notProject.status, 1);
  assert.match(notProject.stderr, /project\.json not found/);
  assert.deepEqual(readdirSync(empty), []);
});

test('srt with every caption removed by fixes fails and leaves no empty files', () => {
  const fixes = ['rain', 'fell', 'on', 'the', 'old', 'harbor', 'nobody', 'noticed', 'lamp'].map(from => ({ from, to: '', wholeWord: true }));
  const d = project({ cfg: { fixes } }), r = explainkit('srt', d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no captions to write: 0 found/);
  assert.deepEqual(readdirSync(path.join(d, 'out')), ['words.json']);
});

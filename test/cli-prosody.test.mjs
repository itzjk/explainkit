import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'explainkit.mjs');
const explainkit = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

function project({ script = 'One two three. Four five six.', audio = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek prosody-'));
  const audioFile = path.join(dir, 'narration.wav');
  if (audio) writeFileSync(audioFile, 'fake audio data');
  writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
    script: 'script.txt',
    audio: audio ? 'narration.wav' : undefined,
    scenes: [],
  }));
  writeFileSync(path.join(dir, 'script.txt'), script);
  return { dir, audioFile };
}

function writeWords(dir, words) {
  mkdirSync(path.join(dir, 'out'), { recursive: true });
  writeFileSync(path.join(dir, 'out', 'words.json'), JSON.stringify(words));
}

test('--help lists the prosody command with its marker syntax', () => {
  const r = explainkit('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /prosody/);
  assert.match(r.stdout, /\[slow\]/);
});

test('prosody fails with a clear error when out/words.json does not exist', () => {
  const { dir } = project();
  const r = explainkit('prosody', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /words\.json/);
  assert.match(r.stderr, /align/);
});

test('prosody fails with a clear error when no audio is configured', () => {
  const { dir } = project({ audio: false });
  writeWords(dir, [{ text: 'Hi.', start: 0, end: 0.5 }]);
  const r = explainkit('prosody', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /narration audio/);
});

test('prosody reports an unknown marker as an error without touching the output', () => {
  const { dir } = project({ script: '[emphasis] Wrong marker.' });
  writeWords(dir, [{ text: '[emphasis]', start: 0, end: 0.1 }, { text: 'Wrong', start: 0.2, end: 0.4 }, { text: 'marker.', start: 0.5, end: 0.8 }]);
  const out = path.join(dir, 'out', 'voice-prosody.wav');
  const r = explainkit('prosody', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[emphasis\]/);
  assert.match(r.stderr, /unknown prosody marker/);
  assert.ok(!existsSync(out), 'must not write output when a marker is invalid');
});

test('prosody with no markers copies the audio and reports it', () => {
  const { dir, audioFile } = project({ script: 'Plain sentence. No markers.' });
  const fakeContent = 'fake audio for copy test';
  writeFileSync(audioFile, fakeContent);
  writeWords(dir, [
    { text: 'Plain', start: 0.1, end: 0.3 },
    { text: 'sentence.', start: 0.4, end: 0.8 },
    { text: 'No', start: 1.0, end: 1.1 },
    { text: 'markers.', start: 1.2, end: 1.5 },
  ]);
  const out = path.join(dir, 'out', 'voice-prosody.wav');
  const r = explainkit('prosody', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no prosody markers/);
  assert.ok(existsSync(out));
  assert.equal(readFileSync(out, 'utf8'), fakeContent);
});

test('prosody --out writes to the specified path', () => {
  const { dir, audioFile } = project({ script: 'One sentence.' });
  writeFileSync(audioFile, 'fake');
  writeWords(dir, [{ text: 'One', start: 0, end: 0.3 }, { text: 'sentence.', start: 0.4, end: 0.7 }]);
  const custom = path.join(dir, 'custom', 'out.wav');
  const r = explainkit('prosody', dir, '--out', custom);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(custom));
});

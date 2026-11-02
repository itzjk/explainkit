import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scriptText, estimateWords, readWords } from '../src/align.mjs';

test('scriptText drops comment lines and [notes]', () => {
  assert.equal(scriptText('# note\nHello [pause] world.\n'), 'Hello world.');
});

test('scriptText strips *markers* and keeps the word', () => {
  assert.equal(scriptText('almost *eight* times'), 'almost eight times');
  assert.equal(scriptText('*Big* deal.'), 'Big deal.');
});

test('estimateWords: one entry per word, in order, strictly inside the duration, longer words last longer', () => {
  const w = estimateWords('A tiny cat. An extraordinarily enormous elephant!', { wps: 2.5 });
  assert.equal(w.length, 7);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].end - 1e-9, `word ${i} starts before the previous ends`);
  const dur = x => x.end - x.start;
  assert.ok(dur(w.find(x => x.text === 'extraordinarily')) > dur(w.find(x => x.text === 'An')));
});

test('estimateWords: a sentence end adds a pause before the next word', () => {
  const w = estimateWords('One two three. Four five six.', {});
  const gapInside = w[1].start - w[0].end, gapAcross = w[3].start - w[2].end;
  assert.ok(gapAcross > gapInside + 0.1, `gap across the full stop ${gapAcross} vs inside ${gapInside}`);
});

test('estimateWords refuses an empty script', () => {
  assert.throws(() => estimateWords('   ', {}), /no words/);
});

test('readWords converts whisper.cpp JSON and accepts our own shape', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek-'));
  const wh = path.join(dir, 'w.json'), own = path.join(dir, 'o.json');
  writeFileSync(wh, JSON.stringify({ transcription: [{ text: ' Hello', offsets: { from: 100, to: 400 } }, { text: ' [_BEG_]x', offsets: { from: 400, to: 500 } }] }));
  writeFileSync(own, JSON.stringify([{ text: 'Hi', start: 0.5, end: 0.9 }]));
  assert.deepEqual(readWords(wh)[0], { text: 'Hello', start: 0.1, end: 0.4 });
  assert.deepEqual(readWords(own), [{ text: 'Hi', start: 0.5, end: 0.9 }]);
});

test('readWords rejects a file that is not a word list', () => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'ek-')), 'bad.json');
  writeFileSync(f, '{"hello": 1}');
  assert.throws(() => readWords(f), /expected an array/);
});

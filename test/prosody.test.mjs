import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProsodyScript, groupWordsBySentence, MARKERS } from '../src/prosody.mjs';

// ── parseProsodyScript ──────────────────────────────────────────────────────

test('parseProsodyScript: script with no markers returns empty marker arrays', () => {
  const specs = parseProsodyScript('Hello world. How are you?\n\nFine thanks.');
  assert.ok(specs.every(s => s.markers.length === 0));
  assert.equal(specs.length, 3);
});

test('parseProsodyScript: marker before a sentence is attached to that sentence', () => {
  const specs = parseProsodyScript('[slow] This is slow. Normal sentence.');
  assert.deepEqual(specs[0].markers, ['slow']);
  assert.equal(specs[0].text, 'This is slow.');
  assert.deepEqual(specs[1].markers, []);
  assert.equal(specs[1].text, 'Normal sentence.');
});

test('parseProsodyScript: marker after sentence punctuation applies to the following sentence', () => {
  const specs = parseProsodyScript('Normal. [fast] Fast sentence.');
  assert.deepEqual(specs[0].markers, []);
  assert.deepEqual(specs[1].markers, ['fast']);
  assert.equal(specs[1].text, 'Fast sentence.');
});

test('parseProsodyScript: multiple markers on one sentence', () => {
  const specs = parseProsodyScript('[slow] [low] This sentence has two markers.');
  assert.deepEqual(specs[0].markers, ['slow', 'low']);
});

test('parseProsodyScript: all known markers are accepted', () => {
  const all = Object.keys(MARKERS).map(m => `[${m}] Sentence ${m}.`).join(' ');
  const specs = parseProsodyScript(all);
  for (let i = 0; i < specs.length; i++) assert.ok(specs[i].markers.length > 0);
});

test('parseProsodyScript: unknown marker throws with the marker name and the known list', () => {
  assert.throws(
    () => parseProsodyScript('[slwo] Mistyped.'),
    e => e.message.includes('[slwo]') && e.message.includes('[slow]')
  );
});

test('parseProsodyScript: unknown marker is never silently skipped', () => {
  assert.throws(() => parseProsodyScript('Normal. [emphasis] Marked.'), /unknown prosody marker/);
});

test('parseProsodyScript: comment lines are stripped before validation', () => {
  const specs = parseProsodyScript('# comment\n[slow] First sentence. Normal.');
  assert.equal(specs.length, 2);
  assert.deepEqual(specs[0].markers, ['slow']);
});

test('parseProsodyScript: marker is stripped from the sentence text', () => {
  const specs = parseProsodyScript('[loud] Loud sentence.');
  assert.equal(specs[0].text, 'Loud sentence.');
  assert.ok(!specs[0].text.includes('['));
});

test('parseProsodyScript: marker is case-insensitive', () => {
  const specs = parseProsodyScript('[SLOW] One sentence. [Fast] Two.');
  assert.deepEqual(specs[0].markers, ['slow']);
  assert.deepEqual(specs[1].markers, ['fast']);
});

// ── groupWordsBySentence ────────────────────────────────────────────────────

test('groupWordsBySentence: basic sentence split on period', () => {
  const words = [
    { text: 'Hello', start: 0.0, end: 0.4 },
    { text: 'world.', start: 0.5, end: 0.9 },
    { text: 'How', start: 1.1, end: 1.3 },
    { text: 'are', start: 1.4, end: 1.5 },
    { text: 'you?', start: 1.6, end: 2.0 },
  ];
  const groups = groupWordsBySentence(words);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 2);
  assert.equal(groups[1].length, 3);
  assert.equal(groups[0][0].text, 'Hello');
  assert.equal(groups[1][0].text, 'How');
});

test('groupWordsBySentence: splits on exclamation and question marks', () => {
  const words = [
    { text: 'Stop!', start: 0, end: 0.5 },
    { text: 'Why?', start: 0.6, end: 1.0 },
    { text: 'Done.', start: 1.1, end: 1.4 },
  ];
  const groups = groupWordsBySentence(words);
  assert.equal(groups.length, 3);
});

test('groupWordsBySentence: trailing fragment with no end punctuation becomes its own group', () => {
  const words = [
    { text: 'First.', start: 0, end: 0.5 },
    { text: 'No', start: 0.6, end: 0.7 },
    { text: 'ending', start: 0.8, end: 1.0 },
  ];
  const groups = groupWordsBySentence(words);
  assert.equal(groups.length, 2);
  assert.equal(groups[1][0].text, 'No');
  assert.equal(groups[1][1].text, 'ending');
});

test('groupWordsBySentence: empty array returns empty array', () => {
  assert.deepEqual(groupWordsBySentence([]), []);
});

test('groupWordsBySentence: single sentence with all words in one group', () => {
  const words = [
    { text: 'One', start: 0, end: 0.3 },
    { text: 'sentence.', start: 0.4, end: 0.8 },
  ];
  const groups = groupWordsBySentence(words);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);
});

test('groupWordsBySentence: words ending with closing quote or bracket after punctuation', () => {
  const words = [
    { text: 'He', start: 0, end: 0.2 },
    { text: 'said', start: 0.3, end: 0.5 },
    { text: '"hello."', start: 0.6, end: 1.0 },
    { text: 'Then', start: 1.2, end: 1.4 },
    { text: 'left.', start: 1.5, end: 1.8 },
  ];
  const groups = groupWordsBySentence(words);
  assert.equal(groups.length, 2);
  assert.equal(groups[0][2].text, '"hello."');
});

test('groupWordsBySentence: each group preserves start/end times', () => {
  const words = [
    { text: 'Fast!', start: 1.0, end: 1.4 },
    { text: 'Slow.', start: 2.0, end: 2.6 },
  ];
  const groups = groupWordsBySentence(words);
  assert.equal(groups[0][0].start, 1.0);
  assert.equal(groups[1][0].start, 2.0);
});

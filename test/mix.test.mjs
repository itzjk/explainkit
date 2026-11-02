import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMixAnchors } from '../src/mix.mjs';

const words = [
  { text: 'Now',    start: 1.0, end: 1.3 },
  { text: 'it',     start: 1.4, end: 1.5 },
  { text: 'floats', start: 1.6, end: 2.0 },
  { text: 'gently', start: 2.1, end: 2.6 },
];

test('plain number at passes through unchanged', () => {
  const cfg = { music: [], hits: [{ file: 'synth:boom', at: 9.0 }], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, words);
  assert.equal(out.hits[0].at, 9.0);
});

test('plain number music from passes through unchanged', () => {
  const cfg = { music: [{ file: 'synth:pad', from: 0 }], hits: [], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, words);
  assert.equal(out.music[0].from, 0);
});

test('word anchor in hit resolves to the start second of the first matching word', () => {
  const cfg = { music: [], hits: [{ file: 'synth:boom', at: { words: 'Now it floats' } }], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, words);
  assert.equal(out.hits[0].at, 1.0);
});

test('word anchor in music from resolves to the start second of the first matching word', () => {
  const cfg = { music: [{ file: 'synth:pad', from: { words: 'it floats' } }], hits: [], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, words);
  assert.equal(out.music[0].from, 1.4);
});

test('anchor is matched after normalizing punctuation and case', () => {
  const cfg = { music: [], hits: [{ file: 'synth:tick', at: { words: 'NOW IT' } }], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, words);
  assert.equal(out.hits[0].at, 1.0);
});

test('a missing anchor throws an error that names it', () => {
  const cfg = { music: [], hits: [{ file: 'synth:boom', at: { words: 'never said this' } }], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  assert.throws(() => resolveMixAnchors(cfg, words), /mix\.json: anchor not found.*never said this/);
});

test('other fields on a hit entry are preserved after resolution', () => {
  const cfg = { music: [], hits: [{ file: 'synth:tick', at: { words: 'gently' }, volume: 0.8 }], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, words);
  assert.equal(out.hits[0].volume, 0.8);
  assert.equal(out.hits[0].at, 2.1);
});

test('empty words with no anchors returns cfg unchanged', () => {
  const cfg = { music: [{ file: 'synth:pad', from: 0 }], hits: [{ file: 'synth:boom', at: 5 }], musicVolume: 0.22, hitVolume: 0.5, tail: 1.4, lufs: -14 };
  const out = resolveMixAnchors(cfg, []);
  assert.equal(out.hits[0].at, 5);
  assert.equal(out.music[0].from, 0);
});

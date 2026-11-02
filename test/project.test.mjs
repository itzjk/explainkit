import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, parsePlan, captions, markedSet } from '../src/project.mjs';

const EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples');

function tmpProject({ script, plan, cfg = {} }) {
  const d = mkdtempSync(path.join(tmpdir(), 'ek-'));
  writeFileSync(path.join(d, 'project.json'), JSON.stringify({ scenes: [], ...cfg }));
  writeFileSync(path.join(d, 'script.txt'), script);
  writeFileSync(path.join(d, 'plan.js'), plan);
  return d;
}

test('shots start at their anchors, in order, and cover the whole video', () => {
  const d = tmpProject({ script: 'Alpha beta gamma. Delta epsilon zeta. Eta theta iota.', plan: "const PLAN = [['Alpha beta', 'a'], ['Delta epsilon', 'b'], ['Eta', 'c']];" });
  const r = prepare(d);
  assert.equal(r.shots.length, 3);
  assert.equal(r.shots[0].s, 0);
  for (let i = 1; i < 3; i++) assert.ok(r.shots[i].s > r.shots[i - 1].s);
  assert.equal(r.shots[2].e, r.fin);
});

test('a hyphenated word is two tokens, so anchors read the way the script does', () => {
  const d = tmpProject({ script: 'Only twenty-eight men survived. Nobody else.', plan: "const PLAN = [['Only', 'a'], ['twenty eight men', 'b'], ['Nobody', 'c']];" });
  assert.equal(prepare(d).shots.length, 3);
});

test('an anchor that is not in the script fails loudly and names the anchor', () => {
  const d = tmpProject({ script: 'One two three.', plan: "const PLAN = [['One', 'a'], ['missing words', 'b']];" });
  assert.throws(() => prepare(d), /Anchor not found.*missing words/);
});

test('anchors only match after the previous anchor', () => {
  const d = tmpProject({ script: 'Go now. Stop. Go now again.', plan: "const PLAN = [['Stop', 'a'], ['Go now', 'b']];" });
  const r = prepare(d);
  assert.ok(r.shots[1].s > r.shots[0].s, 'second "Go now" must be the one after "Stop"');
});

test('plan rows can be arrays or objects; missing scene is an error', () => {
  assert.equal(parsePlan("const PLAN = [{ at: 'x', scene: 's', label: 'L' }, ['y', 't']];")[0].label, 'L');
  assert.throws(() => parsePlan("const PLAN = [['x']];"), /needs an anchor/);
  assert.throws(() => parsePlan('const PLAN = [];'), /at least one shot/);
});

test('captions: 1-3 words, never end on a function word, cut at punctuation', () => {
  const words = 'The cat sat on the warm mat, then it left.'.split(' ').map((t, i) => ({ txt: t, s: i * .3, e: i * .3 + .25 }));
  const caps = captions(words, { fixes: [], language: 'en' });
  for (const c of caps) { const n = c.txt.split(' ').length; assert.ok(n >= 1 && n <= 3, c.txt); }
  assert.ok(!caps.slice(0, -1).some(c => /\b(THE|ON|A)$/.test(c.txt)), JSON.stringify(caps.map(c => c.txt)));
  assert.ok(caps.some(c => c.txt.endsWith('MAT')), 'a caption ends at the comma');
  assert.ok(!caps.some(c => /MAT/.test(c.txt) && /THEN/.test(c.txt)), 'no caption spans the comma');
});

test('markedSet returns normalized tokens inside *markers*, ignores comment lines', () => {
  const s = markedSet('# skip this\nAlmost *eight* times *greater*.');
  assert.ok(s.has('eight'), 'eight should be marked');
  assert.ok(s.has('greater'), 'greater should be marked');
  assert.ok(!s.has('times'), 'times should not be marked');
});

test('captions: marked word gets hi pointing at its index in the caption', () => {
  const words = 'almost eight times.'.split(' ').map((t, i) => ({ txt: t, s: i * .3, e: i * .3 + .25 }));
  const caps = captions(words, { fixes: [], language: 'en', marks: new Set(['eight']) });
  const cap = caps.find(c => /EIGHT/.test(c.txt));
  assert.ok(cap, 'a caption containing EIGHT must exist');
  const idx = cap.txt.split(' ').indexOf('EIGHT');
  assert.equal(cap.hi, idx, `hi should be ${idx} for "EIGHT" in "${cap.txt}"`);
});

test('captions: no hi field when no marks are provided', () => {
  const words = 'almost eight times.'.split(' ').map((t, i) => ({ txt: t, s: i * .3, e: i * .3 + .25 }));
  const caps = captions(words, { fixes: [], language: 'en' });
  assert.ok(caps.every(c => c.hi == null), 'no caption should have hi when marks is absent');
});

test('captions: fixes rewrite a word, wholeWord only matches whole words, times limits uses', () => {
  const words = ['Cat', 'catalog', 'cat'].map((t, i) => ({ txt: t, s: i, e: i + .5 }));
  const caps = captions(words, { fixes: [{ from: 'cat', to: 'dog', wholeWord: true, times: 1 }], language: 'en' });
  assert.deepEqual(caps.map(c => c.txt).join(' '), 'DOG CATALOG CAT'.replace(/ /g, ' '));
});

for (const name of readdirSync(EXAMPLES)) {
  test(`example "${name}" prepares: every anchor is found and shots are ordered`, () => {
    const r = prepare(path.join(EXAMPLES, name));
    assert.ok(r.shots.length >= 8);
    for (let i = 1; i < r.shots.length; i++) assert.ok(r.shots[i].s > r.shots[i - 1].s, `shot ${i + 1} of ${name} starts before shot ${i}`);
    assert.ok(r.fin > 30 && r.fin < 120, `duration ${r.fin}`);
  });
}

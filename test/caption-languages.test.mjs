import test from 'node:test';
import assert from 'node:assert/strict';
import { captions, FUNCTION_WORDS } from '../src/project.mjs';

const CASES = {
  en: {
    never: 'THE OF IN ON AT FOR AND TO A'.split(' '),
    sentences: [
      'Many of the men in the camp lived on a small ration of bread and the hope of a rescue.',
      'The keeper climbed to the top of the tower and looked at the water for a long time.',
      'Nobody in the village wanted to talk about what had happened to the boat.',
    ],
  },
  es: {
    never: 'EL LA LOS DE EN QUE SU Y A'.split(' '),
    sentences: [
      'Cuando el faro se apagó los barcos perdieron el camino hacia la costa y la tripulación miró el cielo sin una sola estrella.',
      'El guardián vivía solo en una isla entre la niebla pero sabía que su luz era la única esperanza de los marineros.',
      'Nadie en el pueblo quiso hablar sobre lo que pasó con los hombres que salieron al mar aquella noche.',
      'Ella le dijo que no volvería a la casa hasta que la verdad saliera a la luz.',
    ],
  },
};

const spoken = sentence => sentence.split(' ').map((txt, i) => ({ txt, s: i * .3, e: i * .3 + .25 }));
const endings = (sentence, language) => captions(spoken(sentence), { fixes: [], language }).slice(0, -1).map(c => c.txt.split(' ').at(-1));

function withoutList(run) {
  FUNCTION_WORDS.none = /^$/;
  try { return run('none'); } finally { delete FUNCTION_WORDS.none; }
}

test('every language that has a function-word list has sentences below', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(FUNCTION_WORDS).sort());
});

for (const [language, { never, sentences }] of Object.entries(CASES)) {
  const hanging = (sentence, lang) => endings(sentence, lang).filter(w => never.includes(w) || FUNCTION_WORDS[language].test(w));

  test(`captions (${language}): no caption ends on a function word`, () => {
    for (const s of sentences) assert.deepEqual(hanging(s, language), [], s);
  });

  test(`captions (${language}): with an empty list the same sentences do end on one`, () => {
    for (const s of sentences) assert.ok(withoutList(none => hanging(s, none)).length > 0, s);
  });
}

test('captions: a run of function words moves to the next caption together and keeps its own start time', () => {
  const words = spoken('Many of the men survived.');
  const [first, second] = captions(words, { fixes: [], language: 'en' });
  assert.equal(first.txt, 'MANY');
  assert.equal(second.txt, 'OF THE MEN');
  assert.equal(first.e, words[1].s);
  assert.equal(second.s, words[1].s);
});

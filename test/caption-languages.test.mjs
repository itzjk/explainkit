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
    never: 'EL LA LOS LAS UN UNA UNOS DE DEL AL EN CON POR PARA SIN SOBRE ENTRE DESDE HASTA HACIA SEGÚN Y O PERO QUE COMO SI CUANDO PORQUE AUNQUE SU SUS MI MIS ME TE SE LE LES NOS NO MÁS MUY ES ERA FUE ESTE ESTA ESE ESA'.split(' '),
    sentences: [
      'Cuando el faro se apagó los barcos perdieron el camino hacia la costa y la tripulación miró el cielo sin una sola estrella.',
      'El guardián vivía solo en una isla entre la niebla pero sabía que su luz era la única esperanza de los marineros.',
      'Nadie en el pueblo quiso hablar sobre lo que pasó con los hombres que salieron al mar aquella noche.',
      'Ella le dijo que no volvería a la casa hasta que la verdad saliera a la luz.',
      'Si esta historia es cierta entonces ninguno de nosotros volverá a mirar el mar como antes.',
      'Mis padres me contaron que el faro fue construido por un hombre que no confiaba ni en los mapas ni en las estrellas.',
      'Según el diario el capitán nos dijo que los marineros o se quedaban en el barco o se perdían entre las olas.',
    ],
  },
  pt: {
    never: 'O A OS AS UM UMA AO À DO DA DOS DAS NO NA NOS NAS NUM NUMA PELO PELA PRA DE EM POR PARA COM SEM SOBRE ENTRE ATÉ E OU MAS NEM QUE SE COMO QUANDO PORQUE MEU MINHA SEU SUA ME TE LHE NÃO MAIS TÃO É ERA FOI ESTE ESSA NESTE DESSA'.split(' '),
    sentences: [
      'Quando o farol se apagou os barcos perderam o caminho para a costa e a tripulação olhou para um céu sem estrelas.',
      'O guardião morava sozinho numa ilha entre a névoa mas sabia que a luz dele era a única esperança dos marinheiros.',
      'Ninguém na aldeia quis falar sobre o que aconteceu com os homens que saíram ao mar naquela noite.',
      'Ela disse que não voltaria para a casa até que a verdade viesse à tona.',
      'Se essa história é verdade então nenhum de nós vai olhar o mar como antes.',
      'Meus pais me contaram que o farol foi construído por um homem que não confiava nem nos mapas nem nas estrelas.',
      'Eles voltaram pra casa porque ninguém queria ficar no escuro com a luz que já não era a mesma.',
      'Segundo o diário o capitão nos disse que os marinheiros ou ficavam no barco ou se perdiam entre as ondas.',
    ],
  },
};

const spoken = sentence => sentence.split(' ').map((txt, i) => ({ txt, s: i * .3, e: i * .3 + .25 }));
const endings = (sentence, language) => captions(spoken(sentence), { fixes: [], language }).slice(0, -1).filter(c => c.txt.includes(' ')).map(c => c.txt.split(' ').at(-1));

function withoutList(run) {
  FUNCTION_WORDS.none = /^$/;
  try { return run('none'); } finally { delete FUNCTION_WORDS.none; }
}

test('every language that has a function-word list has sentences below', () => {
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(FUNCTION_WORDS).sort());
});

for (const [language, { never, sentences }] of Object.entries(CASES)) {
  const hanging = (sentence, lang) => endings(sentence, lang).filter(w => never.includes(w) || FUNCTION_WORDS[language].test(w));

  test(`captions (${language}): the list holds the words that must never end a caption`, () => {
    for (const w of never) assert.ok(FUNCTION_WORDS[language].test(w), w);
  });

  test(`captions (${language}): no caption of two or more words ends on a function word`, () => {
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

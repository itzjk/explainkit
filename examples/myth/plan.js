// [anchor, scene, params, label]. Each anchor is consecutive words from the script, in order.
const PLAN = [
  ['Lightning never strikes', 'claim', { kind: 'MYTH', line: 'NEVER STRIKES TWICE' }],
  ['That is what', 'stormsky', { strike: false }],
  ['It is wrong', 'stormsky', { strike: true }],
  ['The Empire State', 'tower', { n: 1 }, 'EMPIRE STATE'],
  ['The same antenna', 'tower', { n: 20 }, '20× A YEAR'],
  ['Why', 'pathmap', {}],
  ['A tall conductor', 'pathmap', { highlight: true }, 'SHORTEST PATH'],
  ['A place gets struck', 'claim', { kind: 'FACT', line: 'BEST PATH|WINS AGAIN' }],
  ['Not once', 'tower', { n: 20, label: '20 TIMES A YEAR' }],
  ['Which myth', 'vote', { a: 'GRAVITY', b: 'MAGNETS' }],
];

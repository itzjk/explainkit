// [anchor, scene, params, label]. Each anchor is consecutive words from the script, in order.
// Built-in scenes only; custom scenes are added in scenes.js.
const PLAN = [
  ['Lightning never strikes', 'title', { lines: ['MYTH:', 'NEVER STRIKES', 'TWICE'], top: '#14080a', bottom: '#06090f', color: '#e5484d' }],
  ['That is what', 'cityLights', {}],
  ['It is wrong', 'cityLights', {}],
  ['The Empire State', 'title', { lines: ['EMPIRE STATE'], top: '#030508', bottom: '#0c0e18', color: '#ffd166', size: 190 }],
  ['The same antenna', 'tally', { total: 20, from: 1, to: 1 }],
  ['Why', 'title', { lines: ['SHORTEST', 'PATH'], top: '#030810', bottom: '#080e1e', color: '#9bd0ff' }],
  ['A tall conductor', 'title', { lines: ['TALLEST', 'WINS'], top: '#030810', bottom: '#080e1e', color: '#ffd166' }],
  ['A place gets struck', 'title', { lines: ['FACT:', 'BEST PATH', 'WINS AGAIN'], top: '#060e0a', bottom: '#06090f', color: '#3fbf7f' }],
  ['Not once', 'tally', { total: 20, from: 0, to: 20 }],
  ['Which myth', 'title', { lines: ['BUST NEXT?', 'ONE WORD'], top: '#030810', bottom: '#080e1e', size: 130 }],
];

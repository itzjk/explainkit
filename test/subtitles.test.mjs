import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../src/project.mjs';
import { timestamp, cues, toSrt, toVtt } from '../src/subtitles.mjs';

const EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const file = (...rows) => rows.join('\n') + '\n';
const LS = String.fromCharCode(0x2028); // U+2028 LINE SEPARATOR, written as a code so no editor can turn it into a real break

// A reader that shares no code with the writer: it splits the text on blank lines and turns each time back into
// whole milliseconds with its own arithmetic.
function readCues(text, sep) {
  const time = new RegExp(`^(\\d{2,}):(\\d{2}):(\\d{2})\\${sep}(\\d{3}) --> (\\d{2,}):(\\d{2}):(\\d{2})\\${sep}(\\d{3})$`);
  return text.replace(/^WEBVTT\n\n/, '').split('\n\n').filter(b => b.trim()).map(block => {
    const [id, timing, ...lines] = block.split('\n');
    const m = time.exec(timing);
    assert.ok(m, `not a timing line: ${JSON.stringify(timing)}`);
    const ms = (h, mi, s, f) => ((Number(h) * 60 + Number(mi)) * 60 + Number(s)) * 1000 + Number(f);
    return { id: Number(id), start: ms(...m.slice(1, 5)), end: ms(...m.slice(5, 9)), lines };
  });
}

function tmpProject({ script, plan, words }) {
  const d = mkdtempSync(path.join(tmpdir(), 'ek-'));
  writeFileSync(path.join(d, 'project.json'), JSON.stringify({ scenes: [] }));
  writeFileSync(path.join(d, 'script.txt'), script);
  writeFileSync(path.join(d, 'plan.js'), plan);
  mkdirSync(path.join(d, 'out'));
  writeFileSync(path.join(d, 'out', 'words.json'), JSON.stringify(words));
  return d;
}

test('timestamp: fixed-width fields and a comma before the milliseconds', () => {
  assert.equal(timestamp(0), '00:00:00,000');
  assert.equal(timestamp(1.5), '00:00:01,500');
  assert.equal(timestamp(0.12), '00:00:00,120');
  assert.equal(timestamp(61.005), '00:01:01,005');
  assert.equal(timestamp(3.2, '.'), '00:00:03.200', 'the separator is a parameter, WebVTT wants a dot');
});

test('timestamp: rounds once, on whole milliseconds, so a carry never prints 1000 or 60', () => {
  assert.equal(timestamp(0.9996), '00:00:01,000');
  assert.equal(timestamp(59.9996), '00:01:00,000');
  assert.equal(timestamp(3599.9996), '01:00:00,000');
  assert.equal(timestamp(1.0004), '00:00:01,000');
  assert.equal(timestamp(4.6 + 0.6), '00:00:05,200', '4.6 + 0.6 is 5.199999999999999 in floating point and must not lose a millisecond');
});

test('timestamp: past one hour the hours keep counting, past 99 they get a third digit', () => {
  assert.equal(timestamp(3600), '01:00:00,000');
  assert.equal(timestamp(3725.042), '01:02:05,042');
  assert.equal(timestamp(86399.9996), '24:00:00,000');
  assert.equal(timestamp(360000.5), '100:00:00,500');
});

test('timestamp: a time before 0 starts at 0, and anything that is not a finite number is refused', () => {
  assert.equal(timestamp(-2), '00:00:00,000');
  for (const bad of [NaN, Infinity, -Infinity, '1.5', null, undefined]) assert.throws(() => timestamp(bad), /not a finite number of seconds/, String(bad));
});

test('toSrt: the exact text of a known list (numbered from 1, a blank line after every cue)', () => {
  const caps = [{ s: 0.12, e: 0.9, txt: 'EVERY PAGE' }, { s: 0.9, e: 2.25, txt: 'IS A SHELF' }, { s: 4, e: 4.6, txt: 'SO?' }];
  assert.equal(toSrt(caps), file(
    '1', '00:00:00,120 --> 00:00:00,900', 'EVERY PAGE', '',
    '2', '00:00:00,900 --> 00:00:02,250', 'IS A SHELF', '',
    '3', '00:00:04,000 --> 00:00:04,600', 'SO?', ''));
});

test('toSrt: no captions give an empty file, not a stray blank line', () => {
  assert.equal(toSrt([]), '');
});

test('toSrt: a zero-length cue is left out and the numbering has no gap', () => {
  const caps = [
    { s: 1, e: 2, txt: 'FIRST' },
    { s: 2, e: 2, txt: 'ZERO LENGTH' },
    { s: 2.5, e: 2.1, txt: 'ENDS BEFORE IT STARTS' },
    { s: 3, e: 3.0004, txt: 'UNDER HALF A MILLISECOND' },
    { s: 4, e: 4.001, txt: 'ONE MILLISECOND' },
    { s: 5, e: 6, txt: 'LAST' },
  ];
  assert.equal(toSrt(caps), file(
    '1', '00:00:01,000 --> 00:00:02,000', 'FIRST', '',
    '2', '00:00:04,000 --> 00:00:04,001', 'ONE MILLISECOND', '',
    '3', '00:00:05,000 --> 00:00:06,000', 'LAST', ''));
  assert.deepEqual(readCues(toSrt(caps), ',').map(c => c.id), [1, 2, 3]);
});

test('toSrt: a cue that starts before 0 is shown from 0, one that ends before 0 is left out', () => {
  assert.equal(toSrt([{ s: -0.5, e: 1, txt: 'EARLY' }, { s: -2, e: -1, txt: 'NEVER SHOWN' }]), file('1', '00:00:00,000 --> 00:00:01,000', 'EARLY', ''));
});

test('toSrt: a cue over one hour, and one that crosses the hour mark', () => {
  const caps = [{ s: 3599.5, e: 3601.25, txt: 'ACROSS THE HOUR' }, { s: 7322.1, e: 7325, txt: 'SECOND HOUR' }];
  assert.equal(toSrt(caps), file(
    '1', '00:59:59,500 --> 01:00:01,250', 'ACROSS THE HOUR', '',
    '2', '02:02:02,100 --> 02:02:05,000', 'SECOND HOUR', ''));
});

test('toSrt: multi-line text keeps its lines whatever the line break was', () => {
  const caps = [
    { s: 0, e: 1, txt: 'ONE\nTWO' },
    { s: 1, e: 2, txt: 'WINDOWS\r\nBREAK' },
    { s: 2, e: 3, txt: 'OLD MAC\rBREAK' },
    { s: 3, e: 4, txt: `SEPARATOR${LS}BREAK` },
  ];
  assert.deepEqual(readCues(toSrt(caps), ',').map(c => c.lines), [['ONE', 'TWO'], ['WINDOWS', 'BREAK'], ['OLD MAC', 'BREAK'], ['SEPARATOR', 'BREAK']]);
});

test('toSrt: an empty line inside a caption would end the cue, so it never reaches the file', () => {
  const out = toSrt([{ s: 0, e: 1, txt: 'ABOVE\n\n  \n\t\nBELOW' }, { s: 1, e: 2, txt: '  PADDED  \n  LINES ' }]);
  assert.equal(out, file('1', '00:00:00,000 --> 00:00:01,000', 'ABOVE', 'BELOW', '', '2', '00:00:01,000 --> 00:00:02,000', 'PADDED', 'LINES', ''));
  assert.deepEqual(readCues(out, ',').map(c => c.lines.length), [2, 2]);
});

test('toSrt: control characters are dropped, tabs and ordinary text stay', () => {
  assert.equal(readCues(toSrt([{ s: 0, e: 1, txt: 'A\u0000B\u001bC\u0007D\u007fE\u0085F\tG' }]), ',')[0].lines[0], 'ABCDEF\tG');
});

test('toSrt: non-ASCII text goes through untouched', () => {
  const texts = ['¿QUÉ PASÓ, NIÑO?', 'ÉCOUTE: ÇA VA', 'ΕΛΛΗΝΙΚΆ', '日本語のテスト', 'مرحبا بالعالم', '🚀 LIFTOFF 🚀', 'ß İ ǅ'];
  const read = readCues(toSrt(texts.map((txt, i) => ({ s: i, e: i + 0.5, txt }))), ',');
  assert.deepEqual(read.map(c => c.lines.join('\n')), texts);
});

test('toSrt: a caption with no text is left out', () => {
  const out = toSrt([{ s: 0, e: 1, txt: '' }, { s: 1, e: 2, txt: '  \n ' }, { s: 2, e: 3 }, { s: 3, e: 4, txt: 'KEPT' }]);
  assert.equal(out, file('1', '00:00:03,000 --> 00:00:04,000', 'KEPT', ''));
});

test('toSrt: SubRip has no escape syntax, so & and < are written as they are', () => {
  assert.equal(readCues(toSrt([{ s: 0, e: 1, txt: 'R&D <3 A --> B' }]), ',')[0].lines[0], 'R&D <3 A --> B');
});

test('cues are listed in start order (not end order), and equal starts keep the order they came in', () => {
  const caps = [{ s: 5, e: 6, txt: 'D' }, { s: 1, e: 9, txt: 'A LONG' }, { s: 1, e: 2, txt: 'A SHORT' }, { s: 3, e: 4, txt: 'C' }];
  assert.deepEqual(cues(caps).map(c => c.lines[0]), ['A LONG', 'A SHORT', 'C', 'D']);
  assert.deepEqual(readCues(toSrt(caps), ',').map(c => [c.id, c.lines[0]]), [[1, 'A LONG'], [2, 'A SHORT'], [3, 'C'], [4, 'D']]);
});

test('a caption with a time that is not a number fails loudly and says which caption', () => {
  assert.throws(() => toSrt([{ s: 0, e: 1, txt: 'OK' }, { s: 1, e: NaN, txt: 'BAD' }]), /caption 2 end is not a finite number/);
  assert.throws(() => toSrt([{ s: '0.5', e: 1, txt: 'BAD' }]), /caption 1 start is not a finite number/);
});

const unescapeVtt = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const timingLine = /^\d{2,}:\d{2}:\d{2}[,.]\d{3} --> \d{2,}:\d{2}:\d{2}[,.]\d{3}$/;

test('toVtt: the exact text of a known list (WEBVTT and a blank line first, a dot before the milliseconds, a blank line after every cue)', () => {
  const caps = [{ s: 0.12, e: 0.9, txt: 'EVERY PAGE' }, { s: 0.9, e: 2.25, txt: 'IS A SHELF' }, { s: 4, e: 4.6, txt: 'SO?' }];
  assert.equal(toVtt(caps), file(
    'WEBVTT', '',
    '1', '00:00:00.120 --> 00:00:00.900', 'EVERY PAGE', '',
    '2', '00:00:00.900 --> 00:00:02.250', 'IS A SHELF', '',
    '3', '00:00:04.000 --> 00:00:04.600', 'SO?', ''));
});

test('toVtt: no captions give a valid file that is just the header', () => {
  assert.equal(toVtt([]), 'WEBVTT\n\n');
});

test('toVtt: the file starts with the letters WEBVTT, no byte order mark', () => {
  assert.equal(Buffer.from(toVtt([{ s: 0, e: 1, txt: 'A' }])).subarray(0, 6).toString('latin1'), 'WEBVTT');
});

test('toVtt: & < > are escaped, so a cue never holds a raw tag, a raw character reference or "-->"', () => {
  const out = toVtt([{ s: 0, e: 1, txt: 'R&D <3 A --> B' }, { s: 1, e: 2, txt: '<b>BOLD</b> &amp; &lt;' }]);
  assert.deepEqual(readCues(out, '.').map(c => c.lines), [['R&amp;D &lt;3 A --&gt; B'], ['&lt;b&gt;BOLD&lt;/b&gt; &amp;amp; &amp;lt;']]);
  const text = out.split('\n').filter(l => !timingLine.test(l)).join('\n');
  assert.ok(!text.includes('-->'), 'an arrow in the text would end the timing line early in a strict reader');
  assert.ok(!/</.test(text), 'a raw < starts a tag');
  assert.ok(!/&(?!(amp|lt|gt);)/.test(text), 'a raw & starts a character reference');
});

test('toVtt: unescaping gives back exactly the text that went in, even text that already looks escaped', () => {
  const texts = ['R&D', 'Q&A?', 'A < B > C', 'A --> B', '--&gt;', '&amp;', '&lt;3', '&#60; &#x3C;', '<i>x</i>', '<'];
  const read = readCues(toVtt(texts.map((txt, i) => ({ s: i, e: i + 1, txt }))), '.');
  assert.deepEqual(read.map(c => unescapeVtt(c.lines.join('\n'))), texts);
});

test('toVtt: a cue over one hour keeps its hours, and past 99 hours they get a third digit', () => {
  const out = toVtt([{ s: 3599.5, e: 3601.25, txt: 'ACROSS THE HOUR' }, { s: 360000.5, e: 360001, txt: 'LONG' }]);
  assert.match(out, /^00:59:59\.500 --> 01:00:01\.250$/m);
  assert.match(out, /^100:00:00\.500 --> 100:00:01\.000$/m);
  assert.deepEqual(readCues(out, '.').map(c => [c.start, c.end]), [[3599500, 3601250], [360000500, 360001000]]);
});

test('toVtt: a zero-length cue is left out (WebVTT needs the end after the start) and the numbering has no gap', () => {
  const out = toVtt([{ s: 1, e: 2, txt: 'FIRST' }, { s: 2, e: 2, txt: 'ZERO LENGTH' }, { s: 3, e: 3.0004, txt: 'UNDER HALF A MILLISECOND' }, { s: 4, e: 4.001, txt: 'ONE MILLISECOND' }]);
  assert.equal(out, file('WEBVTT', '', '1', '00:00:01.000 --> 00:00:02.000', 'FIRST', '', '2', '00:00:04.000 --> 00:00:04.001', 'ONE MILLISECOND', ''));
});

test('toVtt: multi-line text keeps its lines, and an empty line never splits a cue', () => {
  const out = toVtt([{ s: 0, e: 1, txt: 'ONE\r\nTWO' }, { s: 1, e: 2, txt: 'ABOVE\n\n  \nBELOW' }]);
  assert.deepEqual(readCues(out, '.').map(c => c.lines), [['ONE', 'TWO'], ['ABOVE', 'BELOW']]);
  assert.equal(out.split('\n\n').length, 4, 'header, two cues and the empty piece after the last blank line');
});

test('toVtt: non-ASCII text goes through untouched', () => {
  const texts = ['¿QUÉ PASÓ, NIÑO?', 'ÉCOUTE: ÇA VA', '日本語のテスト', 'مرحبا بالعالم', '🚀 LIFTOFF 🚀'];
  assert.deepEqual(readCues(toVtt(texts.map((txt, i) => ({ s: i, e: i + 0.5, txt }))), '.').map(c => c.lines.join('\n')), texts);
});

test('toVtt and toSrt write the same cues: same numbers, same times, same lines', () => {
  const caps = [{ s: 3599.5, e: 3601.25, txt: 'ACROSS THE HOUR' }, { s: 5, e: 5, txt: 'GONE' }, { s: 3, e: 4, txt: 'FIRST\nTWO LINES' }, { s: 6, e: 7, txt: '¿SÍ?' }];
  assert.deepEqual(readCues(toVtt(caps), '.'), readCues(toSrt(caps), ','));
});

test('a known project: words.json -> shots and captions -> the exact SubRip and WebVTT files', () => {
  const d = tmpProject({
    script: 'Rain fell on the old harbor. Nobody noticed the lamp.',
    plan: "const PLAN = [['Rain fell', 'a'], ['Nobody', 'b']];",
    words: [
      { text: 'Rain', start: 0.5, end: 0.8 }, { text: 'fell', start: 0.85, end: 1.1 }, { text: 'on', start: 1.15, end: 1.25 },
      { text: 'the', start: 1.3, end: 1.4 }, { text: 'old', start: 1.45, end: 1.7 }, { text: 'harbor.', start: 1.75, end: 2.3 },
      { text: 'Nobody', start: 3, end: 3.4 }, { text: 'noticed', start: 3.45, end: 3.9 }, { text: 'the', start: 3.95, end: 4.05 },
      { text: 'lamp.', start: 4.1, end: 4.6 },
    ],
  });
  // "on" is a function word, so it moves to the next caption; the last caption lingers 0.6 s after its last word
  const { caps } = prepare(d);
  assert.equal(toSrt(caps), file(
    '1', '00:00:00,500 --> 00:00:01,150', 'RAIN FELL', '',
    '2', '00:00:01,150 --> 00:00:01,750', 'ON THE OLD', '',
    '3', '00:00:01,750 --> 00:00:02,900', 'HARBOR', '',
    '4', '00:00:03,000 --> 00:00:03,950', 'NOBODY NOTICED', '',
    '5', '00:00:03,950 --> 00:00:05,200', 'THE LAMP', ''));
  assert.equal(toVtt(caps), file(
    'WEBVTT', '',
    '1', '00:00:00.500 --> 00:00:01.150', 'RAIN FELL', '',
    '2', '00:00:01.150 --> 00:00:01.750', 'ON THE OLD', '',
    '3', '00:00:01.750 --> 00:00:02.900', 'HARBOR', '',
    '4', '00:00:03.000 --> 00:00:03.950', 'NOBODY NOTICED', '',
    '5', '00:00:03.950 --> 00:00:05.200', 'THE LAMP', ''));
});

for (const name of readdirSync(EXAMPLES)) {
  test(`example "${name}": one cue per caption, in order, never overlapping, and both files read back to the same milliseconds`, () => {
    const { caps } = prepare(path.join(EXAMPLES, name)), read = readCues(toSrt(caps), ',');
    assert.ok(caps.length > 20, `${name} has ${caps.length} captions`);
    assert.equal(read.length, caps.length, 'a caption was left out');
    read.forEach((c, i) => {
      assert.equal(c.id, i + 1);
      assert.equal(c.start, Math.round(caps[i].s * 1000), `cue ${i + 1} start`);
      assert.equal(c.end, Math.round(caps[i].e * 1000), `cue ${i + 1} end`);
      assert.equal(c.lines.join(' '), caps[i].txt);
      assert.ok(c.end > c.start, `cue ${i + 1} has no length`);
      if (i) assert.ok(c.start >= read[i - 1].end, `cue ${i + 1} starts before cue ${i} ends: the video shows one caption at a time`);
    });
    assert.deepEqual(readCues(toVtt(caps), '.').map(c => ({ ...c, lines: c.lines.map(unescapeVtt) })), read, 'the WebVTT file has other cues than the SubRip file');
  });
}

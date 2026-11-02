import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../src/project.mjs';
import { openStage, video } from '../src/render.mjs';
import { OUTPUTS } from '../src/output.mjs';
import { run } from '../src/util.mjs';

const EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const LIGHTHOUSE = path.join(EXAMPLES, 'lighthouse');

function jpegSize(buf) {
  for (let i = 2; i < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    if (buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no JPEG size found');
}

function inkBox(st, t, element) {
  return st.page.evaluate(([t, element]) => {
    const canvas = document.getElementById('c'), c2 = canvas.getContext('2d');
    const grab = () => { window.render(t); return c2.getImageData(0, 0, canvas.width, canvas.height).data; };
    const withIt = grab();
    const saved = { captions: DATA.config.captions, pulse: DATA.config.pulse, labels: DATA.shots.map(s => s.label) };
    if (element === 'caption') DATA.config.captions = false;
    if (element === 'pulse') DATA.config.pulse = false;
    if (element === 'label') DATA.shots.forEach(s => { s.label = null; });
    const without = grab();
    DATA.config.captions = saved.captions; DATA.config.pulse = saved.pulse; DATA.shots.forEach((s, i) => { s.label = saved.labels[i]; });
    let top = canvas.height, bottom = -1, left = canvas.width, right = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (Math.abs(withIt[i] - without[i]) + Math.abs(withIt[i + 1] - without[i + 1]) + Math.abs(withIt[i + 2] - without[i + 2]) > 40) {
        if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x;
      }
    }
    return { top, bottom, left, right, width: canvas.width, height: canvas.height };
  }, [t, element]);
}

function middleChecksum(st, t) {
  return st.page.evaluate(t => {
    const canvas = document.getElementById('c'), c2 = canvas.getContext('2d');
    DATA.config.captions = false; DATA.config.pulse = false; DATA.shots.forEach(s => { s.label = null; });
    window.render(t);
    let sum = 0;
    for (const v of c2.getImageData(440, canvas.height / 2 - 100, 200, 200).data) sum = (sum * 31 + v) >>> 0;
    return sum;
  }, t);
}

const CLEAR = 24;

async function expectInside(st, d, element, t, what) {
  const box = await inkBox(st, t, element), at = `${d.layout.name}, ${element} ${what} at ${t.toFixed(2)} s`;
  assert.ok(box.bottom >= 0, `${at}: no ink found`);
  assert.ok(box.top >= CLEAR && box.left >= CLEAR && box.bottom <= box.height - 1 - CLEAR && box.right <= box.width - 1 - CLEAR, `${at}: cut or too close to the edge: ${JSON.stringify(box)}`);
  const expected = { caption: d.layout.captionY, label: d.layout.labelY }[element];
  if (expected !== undefined) assert.ok(Math.abs((box.top + box.bottom) / 2 - expected) < 40, `${at}: centered at ${(box.top + box.bottom) / 2}, layout says ${expected}`);
  else assert.ok(Math.abs(box.top - d.layout.pulseY) < 12, `${at}: starts at ${box.top}, layout says ${d.layout.pulseY}`);
}

for (const example of readdirSync(EXAMPLES)) for (const output of Object.keys(OUTPUTS)) {
  test(`${example} in ${output}: the frame has the right size and the captions, labels and pulse are fully inside it where the layout says`, async () => {
    const d = prepare(path.join(EXAMPLES, example), { output }), st = await openStage(d);
    try {
      assert.deepEqual(jpegSize(await st.frame(5)), { width: d.layout.width, height: d.layout.height });
      const widest = d.caps.reduce((a, c) => (c.txt.length > a.txt.length ? c : a));
      const picks = [d.caps[0], widest, d.caps[Math.floor(d.caps.length / 3)], d.caps[Math.floor(d.caps.length * 2 / 3)], d.caps.at(-1)];
      for (const c of picks) await expectInside(st, d, 'caption', c.s + .01, `"${c.txt}"`);
      for (const s of d.shots.filter(shot => shot.label)) await expectInside(st, d, 'label', s.s + Math.min(.6, (s.e - s.s) * .8), `"${s.label}"`);
      if (d.config.pulse) await expectInside(st, d, 'pulse', d.shots[3].s + .5, 'monitor');
      assert.deepEqual(st.errors, []);
    } finally { await st.close(); }
  });
}

test('4:5 and 1:1 show the same middle of the stage as 9:16: a centered crop, not a scale', async () => {
  const sums = {};
  for (const output of Object.keys(OUTPUTS)) {
    const d = prepare(LIGHTHOUSE, { output }), st = await openStage(d);
    try { sums[output] = await middleChecksum(st, 33); } finally { await st.close(); }
  }
  assert.equal(sums['4:5'], sums['9:16'], '4:5 middle differs from 9:16');
  assert.equal(sums['1:1'], sums['9:16'], '1:1 middle differs from 9:16');
});

for (const output of ['4:5', '1:1']) {
  test(`a one second clip is encoded at the size of ${output}`, async () => {
    const d = prepare(path.join(EXAMPLES, 'boat'), { output }), out = mkdtempSync(path.join(tmpdir(), 'ek-'));
    const r = await video(d, out, { from: 10, to: 11, log: () => {} });
    const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', r.file]).stdout;
    assert.match(probe, new RegExp(`h264,${d.layout.width},${d.layout.height}`));
  });
}

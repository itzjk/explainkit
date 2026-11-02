import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_ZONES, guideRects } from '../src/guides.mjs';
import { layoutFor } from '../src/output.mjs';
import { prepare } from '../src/project.mjs';
import { openStage, stills } from '../src/render.mjs';

const BOAT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'boat');

test('the zones are the three percentages Meta publishes for Reels ads', () => {
  assert.deepEqual(UI_ZONES, { top: 0.14, bottom: 0.35, side: 0.06 });
});

test('on a 1080x1920 frame the zones are 269 px at the top, 672 px at the bottom and 65 px on each side', () => {
  assert.deepEqual(guideRects(layoutFor('9:16')), [
    { name: 'top', label: 'TOP 14%', x: 0, y: 0, width: 1080, height: 269 },
    { name: 'bottom', label: 'BOTTOM 35%', x: 0, y: 1248, width: 1080, height: 672 },
    { name: 'left', x: 0, y: 269, width: 65, height: 979 },
    { name: 'right', x: 1015, y: 269, width: 65, height: 979 },
  ]);
});

test('the zones stay inside the frame and never overlap each other', () => {
  const l = layoutFor('9:16'), zones = guideRects(l);
  for (const z of zones) assert.ok(z.x >= 0 && z.y >= 0 && z.x + z.width <= l.width && z.y + z.height <= l.height, `${z.name} leaves the frame`);
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    const a = zones[i], b = zones[j];
    const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
    assert.ok(apart, `${a.name} overlaps ${b.name}`);
  }
});

test('the guides are for full screen vertical players, so 4:5 and 1:1 refuse them', () => {
  for (const output of ['4:5', '1:1']) assert.throws(() => guideRects(layoutFor(output)), new RegExp(`need the 9:16 output \\(this project renders ${output}\\)`));
});

function pixels(st, points) {
  return st.page.evaluate(points => {
    const x = document.getElementById('c').getContext('2d');
    return points.map(([px, py]) => Array.from(x.getImageData(px, py, 1, 1).data.slice(0, 3)));
  }, points);
}

test('a frame drawn with guides is tinted inside every zone and untouched everywhere else, and later frames carry no trace of it', async () => {
  const d = prepare(BOAT), st = await openStage(d);
  try {
    const inside = [[150, 100], [150, 1700], [30, 900], [1050, 900]], outside = [[540, 700], [300, 1000], [540, 1200], [200, 400]];
    const plain = await st.frame(14), plainPixels = await pixels(st, [...inside, ...outside]);
    const withGuides = await st.frame(14, { guides: guideRects(d.layout) }), guided = await pixels(st, [...inside, ...outside]);
    assert.ok(!plain.equals(withGuides), 'guides changed nothing');
    inside.forEach((p, i) => {
      const red = guided[i][0] - plainPixels[i][0], green = guided[i][1] - plainPixels[i][1];
      assert.ok(red > 25 && red > green + 15, `no red tint at ${p}: ${plainPixels[i]} -> ${guided[i]}`);
    });
    outside.forEach((p, i) => assert.deepEqual(guided[inside.length + i], plainPixels[inside.length + i], `${p} is outside the zones but changed`));
    assert.ok((await st.frame(14)).equals(plain), 'a frame drawn after one with guides is not identical to the one drawn before');
    assert.deepEqual(st.errors, []);
  } finally { await st.close(); }
});

test('stills with guides are written next to the plain ones under another name, and a size without guides fails before anything renders', async () => {
  const d = prepare(BOAT), out = mkdtempSync(path.join(tmpdir(), 'ek-'));
  const [plain] = await stills(d, out, [14]), [guided] = await stills(d, out, [14], { guides: true });
  assert.equal(path.basename(plain), 't0014.jpg');
  assert.equal(path.basename(guided), 't0014-guides.jpg');
  assert.ok(!readFileSync(plain).equals(readFileSync(guided)));
  await assert.rejects(() => stills(prepare(BOAT, { output: '1:1' }), out, [14], { guides: true }), /need the 9:16 output/);
  assert.ok(!existsSync(path.join(out, 't0014-guides-1x1.jpg')));
});

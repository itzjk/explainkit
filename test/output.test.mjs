import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTENT, OUTPUTS, STAGE, layoutFor, resolveOutput } from '../src/output.mjs';
import { loadConfig, prepare } from '../src/project.mjs';

const EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples');

function project(cfg = {}) {
  const d = mkdtempSync(path.join(tmpdir(), 'ek-'));
  writeFileSync(path.join(d, 'project.json'), JSON.stringify({ scenes: [], ...cfg }));
  return d;
}

test('the three sizes are 1080 wide and 1920, 1350 and 1080 tall', () => {
  assert.deepEqual(Object.entries(OUTPUTS).map(([name, o]) => [name, o.width, o.height]), [['9:16', 1080, 1920], ['4:5', 1080, 1350], ['1:1', 1080, 1080]]);
});

test('each name is the real ratio of its pixel size', () => {
  for (const [name, o] of Object.entries(OUTPUTS)) {
    const [w, h] = name.split(':').map(Number);
    assert.equal(o.width * h, o.height * w, `${name} is ${o.width}x${o.height}`);
  }
});

test('no output setting means 9:16, the size every project had before', () => {
  for (const none of [undefined, null]) assert.equal(resolveOutput(none).name, '9:16');
  assert.deepEqual(resolveOutput(), { name: '9:16', ...OUTPUTS['9:16'] });
  assert.equal(loadConfig(project()).output, '9:16');
});

test('output accepts the ratio or the pixel size, in any case and with stray spaces', () => {
  for (const [given, name] of [['4:5', '4:5'], ['1080x1350', '4:5'], [' 1080X1080 ', '1:1'], ['1080×1920', '9:16'], ['1:1', '1:1']]) {
    assert.equal(resolveOutput(given).name, name, `"${given}"`);
  }
});

test('anything else is rejected, and the message lists what is accepted', () => {
  for (const bad of ['3:4', '16:9', '1920x1080', '', '4:5:1', 'square', 45, true, ['4:5'], {}]) {
    assert.throws(() => resolveOutput(bad), err => {
      assert.match(err.message, /^unknown output /);
      for (const listed of ['9:16 (1080x1920)', '4:5 (1080x1350)', '1:1 (1080x1080)']) assert.ok(err.message.includes(listed), `${JSON.stringify(bad)}: message does not list ${listed}`);
      return true;
    }, `accepted ${JSON.stringify(bad)}`);
  }
});

test('project.json output is checked when the project loads, before anything renders', () => {
  assert.equal(loadConfig(project({ output: '4:5' })).output, '4:5');
  assert.equal(loadConfig(project({ output: '1080x1080' })).output, '1:1');
  assert.throws(() => loadConfig(project({ output: '3:4' })), /unknown output "3:4"/);
});

test('an override (what --output sends) beats project.json and is checked the same way', () => {
  assert.equal(loadConfig(project({ output: '4:5' }), { output: '1:1' }).output, '1:1');
  assert.throws(() => loadConfig(project({ output: '4:5' }), { output: 'wide' }), /unknown output "wide"/);
});

const reach = (name, y) => ({ top: y - EXTENT[name].above, bottom: y + EXTENT[name].below });

test('4:5 and 1:1 are centered crops of the 1080x1920 stage; 9:16 is the whole stage', () => {
  assert.deepEqual(STAGE, { width: 1080, height: 1920 });
  for (const name of Object.keys(OUTPUTS)) {
    const l = layoutFor(name);
    assert.equal(l.width, STAGE.width, `${name} keeps the full width`);
    assert.equal(l.cropY * 2 + l.height, STAGE.height, `${name} is centered`);
    assert.ok(Number.isInteger(l.cropY) && l.cropY >= 0, `${name} crops at whole rows`);
  }
  assert.deepEqual([layoutFor('9:16').cropY, layoutFor('4:5').cropY, layoutFor('1:1').cropY], [0, 285, 420]);
});

test('9:16 keeps the label, caption and pulse positions every project already had', () => {
  const l = layoutFor('9:16');
  assert.deepEqual([l.labelY, l.captionY, l.pulseY], [300, 1395, 1700]);
});

test('in every size the label, captions and pulse fit the frame with room around them and never share rows', () => {
  const MARGIN = 40, GAP = 16;
  for (const name of Object.keys(OUTPUTS)) {
    const l = layoutFor(name);
    const rows = [['label', reach('label', l.labelY)], ['captions', reach('caption', l.captionY)], ['pulse', reach('pulse', l.pulseY)]].sort((a, b) => a[1].top - b[1].top);
    assert.ok(rows[0][1].top >= MARGIN, `${name}: ${rows[0][0]} starts ${rows[0][1].top} px from the top`);
    assert.ok(l.height - rows[2][1].bottom >= MARGIN, `${name}: ${rows[2][0]} ends ${l.height - rows[2][1].bottom} px from the bottom`);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i][1].top - rows[i - 1][1].bottom >= GAP, `${name}: ${rows[i - 1][0]} and ${rows[i][0]} are ${rows[i][1].top - rows[i - 1][1].bottom} px apart`);
  }
});

test('captions keep the stage row they have in 9:16, so they sit against the scenes the way the scenes were composed, unless the frame has no room', () => {
  const stageRow = name => { const l = layoutFor(name); return l.cropY + l.captionY; };
  assert.equal(stageRow('9:16'), 1395);
  assert.equal(stageRow('4:5'), 1395);
  const square = layoutFor('1:1');
  assert.equal(square.height - reach('caption', square.captionY).bottom, 80);
});

test('labelY and captionY are pixels from the top of the output frame; a value that would cut the text is refused', () => {
  assert.equal(layoutFor('4:5', { captionY: 900 }).captionY, 900);
  assert.equal(layoutFor('4:5', { captionY: null }).captionY, OUTPUTS['4:5'].captionY);
  const lowest = 1080 - EXTENT.caption.below, highest = EXTENT.label.above;
  assert.equal(layoutFor('1:1', { captionY: lowest }).captionY, lowest);
  assert.equal(layoutFor('1:1', { labelY: highest }).labelY, highest);
  assert.throws(() => layoutFor('1:1', { captionY: lowest + 1 }), /captionY 1017 does not fit a 1080x1080 frame.*from 64 to 1016/);
  assert.throws(() => layoutFor('1:1', { labelY: highest - 1 }), /labelY 69 does not fit/);
  assert.throws(() => layoutFor('1:1', { captionY: 1395 }), /captionY 1395 does not fit a 1080x1080 frame.*leave it out for 936/);
  for (const bad of ['900', NaN, Infinity, {}]) assert.throws(() => layoutFor('4:5', { captionY: bad }), /captionY .* does not fit/, `accepted ${String(bad)}`);
});

test('the layout travels with the project: loadConfig validates it and prepare hands the same one to the page and the renderer', () => {
  assert.equal(loadConfig(project({ output: '1:1' })).layout.captionY, OUTPUTS['1:1'].captionY);
  assert.equal(loadConfig(project({ output: '1:1', captionY: 700 })).layout.captionY, 700);
  assert.throws(() => loadConfig(project({ output: '1:1', captionY: 1395 })), /captionY 1395 does not fit a 1080x1080 frame/);
  const d = prepare(path.join(EXAMPLES, 'boat'), { output: '4:5' });
  assert.deepEqual([d.layout.name, d.layout.width, d.layout.height], ['4:5', 1080, 1350]);
  assert.equal(d.config.layout, d.layout);
  assert.equal(prepare(path.join(EXAMPLES, 'boat')).layout.name, '9:16');
});

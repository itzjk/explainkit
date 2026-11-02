import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OUTPUTS, resolveOutput } from '../src/output.mjs';
import { loadConfig } from '../src/project.mjs';

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

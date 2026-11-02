import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'explainkit.mjs');
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

function project(cfg = {}) {
  const d = mkdtempSync(path.join(tmpdir(), 'ek-'));
  writeFileSync(path.join(d, 'project.json'), JSON.stringify({ scenes: [], ...cfg }));
  writeFileSync(path.join(d, 'script.txt'), 'One two three. Four five six.');
  writeFileSync(path.join(d, 'plan.js'), "const PLAN = [['One two', 'title', { lines: ['HELLO'] }]];");
  return d;
}

test('--help lists --output with the three sizes', () => {
  const r = cli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--output 9:16\|4:5\|1:1/);
});

test('--output with an unknown size fails with the accepted sizes and does nothing else', () => {
  const d = project(), r = cli('align', d, '--output', '3:4');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /error: unknown output "3:4"\. Use 9:16 \(1080x1920\), 4:5 \(1080x1350\), 1:1 \(1080x1080\)/);
  assert.ok(!existsSync(path.join(d, 'out', 'words.json')), 'a refused size must not write anything');
});

test('--output with a known size is accepted by the commands that read the project', () => {
  const d = project(), r = cli('align', d, '--output', '4:5');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(path.join(d, 'out', 'words.json')));
});

test('an unknown output in project.json fails the same way, and --output overrides it', () => {
  const d = project({ output: 'wide' });
  const bad = cli('align', d);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /error: unknown output "wide"/);
  const fixed = cli('align', d, '--output', '1:1');
  assert.equal(fixed.status, 0, fixed.stderr);
});

test('--help lists --guides as a frames option', () => {
  assert.match(cli('--help').stdout, /frames <dir> --at 3,40,95 \[--guides\]/);
});

test('--guides is refused by every command that is not frames, before it does any work, so a build never carries guides', () => {
  for (const command of ['build', 'render', 'sheet', 'gif', 'align', 'mix']) {
    const d = project(), r = cli(command, d, '--guides');
    assert.equal(r.status, 1, command);
    assert.match(r.stderr, /error: --guides only works with frames/, command);
    assert.ok(!existsSync(path.join(d, 'out')), `${command} created out/ before refusing`);
  }
});

test('frames --guides writes the guided still and only that one; on a 4:5 project it is refused before Chromium starts', () => {
  const d = project(), ok = cli('frames', d, '--at', '1', '--guides');
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(existsSync(path.join(d, 'out', 'stills', 't0001-guides.jpg')));
  assert.ok(!existsSync(path.join(d, 'out', 'stills', 't0001.jpg')));
  const refused = cli('frames', project({ output: '4:5' }), '--at', '1', '--guides');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /need the 9:16 output \(this project renders 4:5\)/);
});

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

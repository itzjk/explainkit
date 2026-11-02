import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { narrate, sentences } from '../src/tts.mjs';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'fake-tts.mjs');

test('sentences groups by paragraph and splits on . ! ?', () => {
  assert.deepEqual(sentences('One. Two! Three?\n\nFour.'), [['One.', 'Two!', 'Three?'], ['Four.']]);
});

test('the command engine runs the program with {in} and {out}, even when the output path has spaces and folders that do not exist yet', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek tts-')), script = path.join(dir, 'script.txt');
  writeFileSync(script, '# comment\nHello there [pause] world.');
  const out = path.join(dir, 'new folder', 'voice.wav');
  await narrate({ scriptFile: script, out, engine: 'command', cmd: `node "${FAKE}" {in} {out}` });
  assert.ok(existsSync(out));
  assert.equal(readFileSync(out, 'utf8'), 'fake audio for 18 characters'); // "Hello there world." with comment and note removed
});

test('a failing TTS command is reported, not ignored', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek-')), script = path.join(dir, 's.txt');
  writeFileSync(script, 'Hi.');
  await assert.rejects(() => narrate({ scriptFile: script, out: path.join(dir, 'o.wav'), engine: 'command', cmd: 'node -e "process.exit(3)"' }), /TTS command failed \(exit 3\)/);
});

test('command engine without --cmd and unknown engines explain what to do', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek-')), script = path.join(dir, 's.txt'); writeFileSync(script, 'Hi.');
  await assert.rejects(() => narrate({ scriptFile: script, out: path.join(dir, 'o.wav'), engine: 'command' }), /needs --cmd/);
  await assert.rejects(() => narrate({ scriptFile: script, out: path.join(dir, 'o.wav'), engine: 'nope' }), /unknown TTS engine/);
});

test('a command that exits 0 without writing the audio file is an error, not a success', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek-')), script = path.join(dir, 's.txt'); writeFileSync(script, 'Hi.');
  const out = path.join(dir, 'voice.wav');
  await assert.rejects(() => narrate({ scriptFile: script, out, engine: 'command', cmd: 'node -e "0"' }), /finished but wrote no audio to .*voice\.wav.*{out}/);
  await assert.rejects(() => narrate({ scriptFile: script, out, engine: 'command', cmd: `node -e "require('fs').writeFileSync(process.argv[1], '')" {out}` }), /wrote no audio/);
});

test('a command killed by a signal is reported with the signal, not with "exit null"', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek-')), script = path.join(dir, 's.txt'); writeFileSync(script, 'Hi.');
  await assert.rejects(() => narrate({ scriptFile: script, out: path.join(dir, 'o.wav'), engine: 'command', cmd: `node -e "process.kill(process.pid, 'SIGKILL')"` }), e => /TTS command failed \(exit \w+\)/.test(e.message) && !/exit null/.test(e.message));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { shellQuote } from '../src/util.mjs';

test('shellQuote: single quotes for sh, double quotes for cmd.exe', () => {
  assert.equal(shellQuote('/a b/c.onnx', 'linux'), "'/a b/c.onnx'");
  assert.equal(shellQuote("it's", 'darwin'), "'it'\\''s'");
  assert.equal(shellQuote('C:\\Program Files\\piper\\piper.exe', 'win32'), '"C:\\Program Files\\piper\\piper.exe"');
});

test('shellQuote: sh gets back exactly the text, whatever is in it', { skip: process.platform === 'win32' }, () => {
  for (const text of ['plain', 'two words', "it's", 'a "double" quote', 'cost $HOME `id` $(id)', 'back\\slash', 'semi; colon && more | pipe > file', '*']) {
    const r = spawnSync('sh', ['-c', `printf %s ${shellQuote(text)}`], { encoding: 'utf8' });
    assert.equal(r.stdout, text);
  }
});

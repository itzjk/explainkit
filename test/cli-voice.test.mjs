import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'bin', 'explainkit.mjs'), FAKE = path.join(ROOT, 'fixtures', 'fake-piper.mjs');

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ek cli-'));
  writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ script: 'script.txt', plan: 'plan.js', scenes: [] }));
  writeFileSync(path.join(dir, 'script.txt'), 'Hello there world.');
  const model = path.join(dir, 'voice.onnx');
  writeFileSync(model, 'onnx'); writeFileSync(`${model}.json`, JSON.stringify({ audio: { sample_rate: 22050 } }));
  return { dir, model };
}
const explainkit = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, WHISPER_MODEL: '', ...env } });

test('tts --engine piper takes --voice, --piper-bin and --out and reports where the narration went', () => {
  const { dir, model } = project(), out = path.join(dir, 'made', 'narration.wav');
  const r = explainkit(['tts', dir, '--engine', 'piper', '--voice', model, '--piper-bin', `node "${FAKE}"`, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(`narration -> ${out}`), r.stdout);
  assert.ok(existsSync(out));
});

test('tts --engine piper without a voice fails with the files to download', () => {
  const { dir } = project();
  const r = explainkit(['tts', dir, '--engine', 'piper', '--out', path.join(dir, 'n.wav')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^error: --engine piper needs a voice: pass --voice <file\.onnx>/);
  assert.match(r.stderr, /huggingface\.co\/rhasspy\/piper-voices\/resolve\/v1\.0\.0\/en\/en_US\/ljspeech\/medium\/en_US-ljspeech-medium\.onnx\.json/);
});

test('align --engine whisper without a model fails with the file, the link and the folder', () => {
  const { dir } = project(), home = mkdtempSync(path.join(tmpdir(), 'ek home-'));
  writeFileSync(path.join(dir, 'a.wav'), '');
  const r = explainkit(['align', dir, '--engine', 'whisper', '--audio', path.join(dir, 'a.wav')], { HOME: home, USERPROFILE: home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no whisper model found/);
  assert.ok(r.stderr.includes('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'), r.stderr);
  assert.ok(r.stderr.includes(path.join(home, '.explainkit', 'models', 'ggml-base.bin')), r.stderr);
});

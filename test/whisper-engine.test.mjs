import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { whisperWords } from '../src/align.mjs';
import { modelsFolder } from '../src/whisper-model.mjs';
import { ffmpeg } from '../src/util.mjs';

const posix = { skip: process.platform === 'win32' && 'the fake whisper-cli is a shell script' };
const tmp = () => mkdtempSync(path.join(tmpdir(), 'ek engine-'));
const header = vocab => { const b = Buffer.alloc(64); b.writeUInt32LE(0x67676d6c, 0); b.writeInt32LE(vocab, 4); return b; };
const put = (file, data) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, data); return file; };

function fakeCli(dir, { stderr = '' } = {}) {
  const record = path.join(dir, 'args.txt'), file = path.join(dir, 'whisper-cli');
  put(file, `#!/bin/sh
printf '%s\\n' "$@" > '${record}'
${stderr ? `echo '${stderr}' >&2\nexit 1` : `prev=''
for a in "$@"; do [ "$prev" = '-of' ] && out="$a"; prev="$a"; done
printf '{"transcription":[{"text":" Hi","offsets":{"from":100,"to":400}}]}' > "$out.json"`}
`);
  chmodSync(file, 0o755);
  return { bin: dir, args: () => readFileSync(record, 'utf8').split('\n') };
}
const silence = dir => { const f = path.join(dir, 'a.wav'); ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '0.3', f]); return f; };

test('without whisper-cli and without a model, one error carries both sets of instructions, before any audio is touched', () => {
  const home = tmp();
  assert.throws(() => whisperWords(path.join(home, 'not-even-there.wav'), { env: { PATH: tmp() }, home }), e => {
    assert.match(e.message, /whisper-cli was not found on your PATH/);
    assert.match(e.message, /no whisper model found/);
    assert.ok(e.message.includes('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'), e.message);
    assert.ok(e.message.includes(path.join(modelsFolder(home), 'ggml-base.bin')), e.message);
    return true;
  });
});

test('the model that is found is the one handed to whisper-cli, with the project language', posix, () => {
  const home = tmp(), cli = fakeCli(tmp()), wav = silence(tmp());
  const byDefault = put(path.join(modelsFolder(home), 'ggml-base.bin'), header(51865));
  const words = whisperWords(wav, { language: 'es', env: { PATH: cli.bin }, home });
  assert.deepEqual(words, [{ text: 'Hi', start: 0.1, end: 0.4 }]);
  let a = cli.args();
  assert.equal(a[a.indexOf('-m') + 1], byDefault);
  assert.equal(a[a.indexOf('-l') + 1], 'es');
  const other = put(path.join(tmp(), 'my model.bin'), header(51865));
  whisperWords(wav, { model: other, env: { PATH: cli.bin, WHISPER_MODEL: byDefault }, home });
  a = cli.args();
  assert.equal(a[a.indexOf('-m') + 1], other, '--model wins over WHISPER_MODEL and the default folder');
});

test('an English-only model with a Spanish project stops before whisper-cli runs', posix, () => {
  const home = tmp(), cli = fakeCli(tmp()), wav = silence(tmp());
  const english = put(path.join(tmp(), 'ggml-base.en.bin'), header(51864));
  assert.throws(() => whisperWords(wav, { model: english, language: 'es', env: { PATH: cli.bin }, home }), /English-only model but the project language is "es"/);
});

test('when whisper-cli fails on the model, the error says the file may be incomplete and where to download it again', posix, () => {
  const home = tmp(), cli = fakeCli(tmp(), { stderr: 'whisper_init: failed to load model' }), wav = silence(tmp());
  const model = put(path.join(modelsFolder(home), 'ggml-base.bin'), header(51865));
  assert.throws(() => whisperWords(wav, { env: { PATH: cli.bin }, home }), e => {
    assert.match(e.message, /whisper-cli failed: .*failed to load model/);
    assert.ok(e.message.includes(`${model} is 64 bytes, ggml-base.bin is 147951465`), e.message);
    assert.ok(e.message.includes('Download it again from https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'), e.message);
    return true;
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { narrate } from '../src/tts.mjs';
import { run } from '../src/util.mjs';
import { piperCommand, piperVoice, binaryHelp, voiceUrls, ASSETS, RELEASE, SENTENCE_SILENCE } from '../src/piper.mjs';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'fake-piper.mjs');
const FAKE_BIN = `node "${FAKE}"`;
const tmp = () => mkdtempSync(path.join(tmpdir(), 'ek piper-'));

function voice(dir, { rate = 16000, name = 'my voice' } = {}) {
  const model = path.join(dir, `${name}.onnx`);
  writeFileSync(model, 'onnx');
  writeFileSync(`${model}.json`, JSON.stringify({ audio: { sample_rate: rate, quality: 'medium' }, num_speakers: 1 }));
  return model;
}
function script(text) { const f = path.join(tmp(), 'script.txt'); writeFileSync(f, text); return f; }
async function speak(opts) {
  const log = path.join(tmp(), 'log.jsonl');
  process.env.FAKE_PIPER_LOG = log;
  try { await narrate({ engine: 'piper', ...opts }); } finally { delete process.env.FAKE_PIPER_LOG; }
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
}

test('the command line has the voice, the sentence gap and the file placeholders; paths with spaces are quoted for the shell in use', () => {
  assert.equal(SENTENCE_SILENCE, 0.3);
  assert.equal(piperCommand({ model: '/v/my voice.onnx', platform: 'linux' }), "piper -m '/v/my voice.onnx' --sentence_silence 0.3 -f {out} < {in}");
  assert.equal(piperCommand({ model: '/v/a.onnx', config: '/c/it\'s.json', silence: 0.5, platform: 'darwin' }), "piper -m '/v/a.onnx' -c '/c/it'\\''s.json' --sentence_silence 0.5 -f {out} < {in}");
  assert.equal(piperCommand({ model: 'D:\\my voices\\a.onnx', platform: 'win32' }), 'piper -m "D:\\my voices\\a.onnx" --sentence_silence 0.3 -f {out} < {in}');
  assert.ok(piperCommand({ bin: 'python3 -m piper', model: '/v/a.onnx', platform: 'linux' }).startsWith("python3 -m piper -m '/v/a.onnx' "));
});

test('a program path that exists is made absolute and quoted, even with spaces; a bare name is left for the shell to find', () => {
  const dir = tmp(), prog = path.join(dir, 'piper folder', 'piper');
  mkdirSync(path.dirname(prog)); writeFileSync(prog, '');
  assert.ok(piperCommand({ bin: prog, model: '/v/a.onnx', platform: 'linux' }).startsWith(`'${prog}' -m `));
  assert.ok(piperCommand({ bin: prog, model: '/v/a.onnx', platform: 'win32' }).startsWith(`"${prog}" -m `));
  assert.ok(piperCommand({ bin: 'piper', model: '/v/a.onnx', platform: 'linux' }).startsWith('piper -m '));
});

test('a missing, half-downloaded or wrong voice is explained before anything runs, with the files to download', () => {
  const dir = tmp(), model = voice(dir), [onnx, json] = voiceUrls();
  assert.throws(() => piperVoice(undefined), e => /needs a voice: pass --voice/.test(e.message) && e.message.includes(onnx) && e.message.includes(json));
  assert.throws(() => piperVoice(path.join(dir, 'gone.onnx')), e => /voice file does not exist/.test(e.message) && e.message.includes(onnx));
  const noConfig = path.join(dir, 'lonely.onnx'); writeFileSync(noConfig, 'onnx');
  assert.throws(() => piperVoice(noConfig), e => /voice config does not exist: .*lonely\.onnx\.json/.test(e.message) && e.message.includes(json));
  writeFileSync(`${noConfig}.json`, '<html>Sign in</html>');
  assert.throws(() => piperVoice(noConfig), /not valid JSON/);
  writeFileSync(`${noConfig}.json`, '{"audio":{}}');
  assert.throws(() => piperVoice(noConfig), /no audio\.sample_rate/);
  assert.deepEqual(piperVoice(model), { model, config: `${model}.json`, name: 'my voice', sampleRate: 16000 });
  const other = path.join(dir, 'other.json'); writeFileSync(other, '{"audio":{"sample_rate":22050}}');
  assert.equal(piperVoice(model, other).config, other);
  assert.equal(piperVoice(model, other).sampleRate, 22050);
});

test('piper preset: runs the program on the script text, into a folder that does not exist yet, with spaces in every path', async () => {
  const dir = tmp(), folder = path.join(dir, 'my voices'); mkdirSync(folder);
  const model = voice(folder);
  const out = path.join(dir, 'new folder', 'voice.wav');
  const [call, ...rest] = await speak({ scriptFile: script('# a note\nHello there [pause] world.\n\nSecond paragraph here.'), out, voice: model, piperBin: FAKE_BIN });
  assert.equal(rest.length, 0, 'piper runs once for the whole script');
  assert.equal(call.text, 'Hello there world.  Second paragraph here.');
  assert.equal(call.argv[call.argv.indexOf('-m') + 1], model);
  assert.equal(call.argv[call.argv.indexOf('--sentence_silence') + 1], '0.3');
  assert.ok(!call.argv.includes('-c'), 'the config next to the voice is found by piper itself');
  assert.ok(call.argv[call.argv.indexOf('-f') + 1].endsWith('piper.wav'));
  const wav = readFileSync(out);
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000, 'the sample rate of the voice is what comes out');
});

test('piper preset: a config in another place is passed with -c', async () => {
  const dir = tmp(), model = voice(dir), cfg = path.join(dir, 'elsewhere.json');
  writeFileSync(cfg, JSON.stringify({ audio: { sample_rate: 22050 } }));
  const [call] = await speak({ scriptFile: script('Hi there.'), out: path.join(dir, 'v.wav'), voice: model, piperConfig: cfg, piperBin: FAKE_BIN });
  assert.equal(call.argv[call.argv.indexOf('-c') + 1], cfg);
  assert.equal(readFileSync(path.join(dir, 'v.wav')).readUInt32LE(24), 22050);
});

test('piper preset: an output that is not .wav is converted by ffmpeg to what the name says', async () => {
  const dir = tmp(), model = voice(dir), out = path.join(dir, 'narration.mp3');
  await speak({ scriptFile: script('Hi there.'), out, voice: model, piperBin: FAKE_BIN });
  const codec = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out]).stdout.trim();
  assert.equal(codec, 'mp3');
});

test('piper preset: a bad voice stops before piper is started', async () => {
  const dir = tmp(), log = path.join(dir, 'log.jsonl');
  process.env.FAKE_PIPER_LOG = log;
  try { await assert.rejects(() => narrate({ engine: 'piper', scriptFile: script('Hi.'), out: path.join(dir, 'v.wav'), voice: path.join(dir, 'gone.onnx'), piperBin: FAKE_BIN }), /voice file does not exist/); }
  finally { delete process.env.FAKE_PIPER_LOG; }
  assert.equal(existsSync(log), false);
});

test('piper preset: a program that is not installed says which release file to download for this computer', async () => {
  const dir = tmp(), model = voice(dir);
  await assert.rejects(() => narrate({ engine: 'piper', scriptFile: script('Hi.'), out: path.join(dir, 'v.wav'), voice: model, piperBin: 'piper-that-is-not-installed' }), e => {
    assert.match(e.message, /^piper was not found/);
    const asset = ASSETS[`${process.platform}-${process.arch}`];
    if (asset) assert.ok(e.message.includes(`${RELEASE}/${asset}`), e.message);
    return true;
  });
  assert.ok(binaryHelp({ platform: 'win32', arch: 'x64' }).includes(`${RELEASE}/piper_windows_amd64.zip`));
  assert.ok(binaryHelp({ platform: 'darwin', arch: 'arm64' }).includes(`${RELEASE}/piper_macos_aarch64.tar.gz`));
  assert.ok(binaryHelp({ platform: 'linux', arch: 'x64' }).includes(`${RELEASE}/piper_linux_x86_64.tar.gz`));
  assert.match(binaryHelp({ platform: 'freebsd', arch: 'x64' }), /No Piper release build is listed for freebsd\/x64/);
});

test('piper preset: a program whose own path has spaces is found and run', { skip: process.platform === 'win32' && 'the stand-in program is a shell script' }, async () => {
  const dir = tmp(), model = voice(dir), prog = path.join(dir, 'piper folder', 'piper');
  mkdirSync(path.dirname(prog));
  writeFileSync(prog, `#!/bin/sh\nexec node "${FAKE}" "$@"\n`); chmodSync(prog, 0o755);
  const [call] = await speak({ scriptFile: script('Hi there.'), out: path.join(dir, 'v.wav'), voice: model, piperBin: prog });
  assert.equal(call.text, 'Hi there.');
});

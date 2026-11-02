import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOnPath } from '../src/util.mjs';
import { inspectModel, findWhisperModel, modelsFolder, expandHome, modelHelp, cliHelp, whisperDoctor, modelUrl, RECOMMENDED } from '../src/whisper-model.mjs';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'ek model-'));
const header = (vocab = 51865) => { const b = Buffer.alloc(64); b.writeUInt32LE(0x67676d6c, 0); b.writeInt32LE(vocab, 4); return b; };
const put = (file, data) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, data); return file; };

test('inspectModel accepts a ggml file and knows whether it is multilingual', () => {
  const d = tmp();
  assert.deepEqual(inspectModel(put(path.join(d, 'multi.bin'), header(51865))), { ok: true, bytes: 64, multilingual: true });
  assert.equal(inspectModel(put(path.join(d, 'english.bin'), header(51864))).multilingual, false);
});

test('inspectModel names what is wrong with a file that is not a model', () => {
  const d = tmp();
  const problem = (name, data) => inspectModel(put(path.join(d, name), data)).problem;
  assert.equal(inspectModel(path.join(d, 'nope.bin')).problem, 'missing');
  assert.equal(inspectModel(d).problem, 'folder');
  assert.equal(problem('empty.bin', ''), 'empty');
  assert.equal(problem('lfs.bin', 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 147951465\n'), 'lfs-pointer');
  assert.equal(problem('page.bin', '<!DOCTYPE html><html><body>Sign in</body></html>'), 'web-page');
  assert.equal(problem('zip.bin', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(100)])), 'not-ggml');
  assert.equal(problem('short.bin', header().subarray(0, 20)), 'not-ggml');
});

test('lookup order: --model, then WHISPER_MODEL, then ggml-base.bin in the models folder', () => {
  const home = tmp(), d = tmp();
  const byFlag = put(path.join(d, 'flag.bin'), header()), byEnv = put(path.join(d, 'env.bin'), header());
  const byDefault = put(path.join(modelsFolder(home), RECOMMENDED.file), header());
  const env = { WHISPER_MODEL: byEnv };
  assert.deepEqual([findWhisperModel({ flag: byFlag, env, home }).file, findWhisperModel({ flag: byFlag, env, home }).source], [byFlag, 'flag']);
  assert.deepEqual([findWhisperModel({ env, home }).file, findWhisperModel({ env, home }).source], [byEnv, 'env']);
  const found = findWhisperModel({ env: {}, home });
  assert.deepEqual([found.ok, found.file, found.source], [true, byDefault, 'default']);
});

test('a path you gave is never swapped for the default: a wrong --model is reported', () => {
  const home = tmp(); put(path.join(modelsFolder(home), RECOMMENDED.file), header());
  const wrong = path.join(tmp(), 'typo.bin');
  const r = findWhisperModel({ flag: wrong, env: {}, home });
  assert.deepEqual([r.ok, r.problem, r.source, r.file], [false, 'missing', 'flag', wrong]);
  const viaEnv = findWhisperModel({ env: { WHISPER_MODEL: wrong }, home });
  assert.deepEqual([viaEnv.ok, viaEnv.problem, viaEnv.source], [false, 'missing', 'env']);
});

test('nothing given and nothing downloaded: missing, with the other models that are in the folder', () => {
  const home = tmp();
  const none = findWhisperModel({ env: {}, home });
  assert.deepEqual([none.ok, none.problem, none.source, none.file, none.others], [false, 'missing', 'default', path.join(modelsFolder(home), 'ggml-base.bin'), []]);
  put(path.join(modelsFolder(home), 'ggml-small.bin'), header());
  put(path.join(modelsFolder(home), 'notes.txt'), 'x');
  assert.deepEqual(findWhisperModel({ env: {}, home }).others, ['ggml-small.bin']);
});

test('~ is expanded to the home folder, and a relative path is resolved from where you run the command', () => {
  const home = tmp(), file = put(path.join(home, 'models', 'm.bin'), header());
  assert.equal(expandHome('~/models/m.bin', home), path.join(home, 'models', 'm.bin'));
  assert.equal(findWhisperModel({ flag: '~/models/m.bin', env: {}, home }).file, file);
  assert.equal(expandHome('a~b', home), 'a~b');
  assert.equal(findWhisperModel({ flag: path.join('some', 'm.bin'), env: {}, home }).file, path.resolve('some', 'm.bin'));
});

test('an English-only model is refused for any other language, a multilingual one is not', () => {
  const home = tmp(), english = put(path.join(tmp(), 'ggml-base.en.bin'), header(51864)), multi = put(path.join(tmp(), 'ggml-base.bin'), header(51865));
  assert.equal(findWhisperModel({ flag: english, env: {}, home, language: 'en' }).ok, true);
  const es = findWhisperModel({ flag: english, env: {}, home, language: 'es' });
  assert.deepEqual([es.ok, es.problem, es.language], [false, 'english-only', 'es']);
  assert.equal(findWhisperModel({ flag: multi, env: {}, home, language: 'es' }).ok, true);
});

test('findOnPath finds an executable on PATH and skips files that cannot run', { skip: process.platform === 'win32' }, () => {
  const bin = tmp(), other = tmp();
  const runnable = put(path.join(bin, 'whisper-cli'), '#!/bin/sh\n'); chmodSync(runnable, 0o755);
  put(path.join(other, 'piper'), 'not executable'); chmodSync(path.join(other, 'piper'), 0o644);
  const env = { PATH: [other, bin].join(path.delimiter) };
  assert.equal(findOnPath('whisper-cli', { env }), runnable);
  assert.equal(findOnPath('piper', { env }), null);
  assert.equal(findOnPath('whisper-cli', { env: { PATH: other } }), null);
});

test('findOnPath on Windows tries the extensions in PATHEXT', () => {
  const bin = tmp(), file = put(path.join(bin, 'whisper-cli.exe'), 'MZ');
  assert.equal(findOnPath('whisper-cli', { env: { PATH: bin, PATHEXT: '.COM;.EXE' }, platform: 'win32' }), file);
});


const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

test('nothing configured: the message names the file, where to get it, where to put it and how to point at another place', () => {
  const home = tmp(), m = findWhisperModel({ env: {}, home });
  const { headline, steps } = modelHelp(m, { platform: 'linux' });
  assert.match(headline, /^no whisper model found/);
  assert.ok(headline.includes('--model') && headline.includes('WHISPER_MODEL') && headline.includes(m.fallback));
  assert.ok(steps.includes('ggml-base.bin (141 MiB'), steps);
  assert.ok(steps.includes(`from   ${BASE_URL}`), steps);
  assert.ok(steps.includes(`to     ${path.join(home, '.explainkit', 'models', 'ggml-base.bin')}`), steps);
  assert.ok(steps.includes(`curl -L --create-dirs -o '${m.fallback}' '${BASE_URL}'`), steps);
  assert.ok(steps.includes('--model <file>') && steps.includes('WHISPER_MODEL'), steps);
  assert.ok(steps.includes('https://huggingface.co/ggerganov/whisper.cpp/tree/main'));
  assert.equal(modelUrl('ggml-small.bin'), 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin');
});

test('on Windows the download command is curl.exe with double quotes', () => {
  const m = findWhisperModel({ env: {}, home: tmp() });
  const { steps } = modelHelp(m, { platform: 'win32' });
  assert.ok(steps.includes(`curl.exe -L --create-dirs -o "${m.fallback}" "${BASE_URL}"`), steps);
});

test('every kind of wrong file gets its own explanation and says whether --model or WHISPER_MODEL pointed at it', () => {
  const home = tmp(), d = tmp(), cases = {
    folder: d,
    empty: put(path.join(d, 'empty.bin'), ''),
    'lfs-pointer': put(path.join(d, 'lfs.bin'), 'version https://git-lfs.github.com/spec/v1\n'),
    'web-page': put(path.join(d, 'page.bin'), '<html></html>'),
    'not-ggml': put(path.join(d, 'other.bin'), Buffer.alloc(100, 1)),
    missing: path.join(d, 'gone.bin'),
  };
  const words = { folder: /is a folder/, empty: /is empty/, 'lfs-pointer': /Git LFS pointer/, 'web-page': /saved web page/, 'not-ggml': /not a whisper.cpp ggml model/, missing: /does not exist/ };
  for (const [problem, file] of Object.entries(cases)) {
    const viaFlag = findWhisperModel({ flag: file, env: {}, home }), viaEnv = findWhisperModel({ env: { WHISPER_MODEL: file }, home });
    assert.equal(viaFlag.problem, problem);
    const a = modelHelp(viaFlag).headline, b = modelHelp(viaEnv).headline;
    assert.match(a, words[problem]); assert.match(b, words[problem]);
    assert.ok(a.includes('--model') && a.includes(file), a);
    assert.ok(b.includes('WHISPER_MODEL') && b.includes(file), b);
    assert.ok(modelHelp(viaFlag).steps.includes(BASE_URL));
  }
  const english = put(path.join(d, 'ggml-base.en.bin'), header(51864));
  const h = modelHelp(findWhisperModel({ flag: english, env: {}, home, language: 'es' })).headline;
  assert.ok(/English-only model but the project language is "es"/.test(h), h);
});

test('when the folder already has other models, the message offers the exact --model to use', () => {
  const home = tmp(), small = put(path.join(modelsFolder(home), 'ggml-small.bin'), header());
  const { steps } = modelHelp(findWhisperModel({ env: {}, home }), { platform: 'linux' });
  assert.ok(steps.includes(`Models already in ${modelsFolder(home)}: ggml-small.bin`) && steps.includes(`--model '${small}'`), steps);
});

test('cliHelp says how to get whisper-cli on macOS and elsewhere', () => {
  assert.match(cliHelp({ platform: 'darwin' }), /brew install whisper\.cpp/);
  assert.match(cliHelp({ platform: 'linux' }), /cmake -B build.*cmake --build build -j --config Release/);
  assert.match(cliHelp({ platform: 'linux' }), /github\.com\/ggml-org\/whisper\.cpp/);
});

test('doctor: nothing installed is information with instructions, not a failure', () => {
  const home = tmp(), r = whisperDoctor({ env: { PATH: tmp() }, home, platform: 'linux' });
  assert.equal(r.failed, false);
  const text = r.lines.join('\n');
  assert.match(r.lines[0], /^info whisper-cli: not found/);
  assert.ok(r.lines.some(l => l.startsWith('info whisper model: no whisper model found')), text);
  assert.ok(text.includes(BASE_URL) && text.includes(path.join(home, '.explainkit', 'models', 'ggml-base.bin')), text);
});

test('doctor: a model you configured that does not work is a failure; the default folder being empty is not', () => {
  const home = tmp(), env = { PATH: tmp(), WHISPER_MODEL: path.join(tmp(), 'typo.bin') };
  const bad = whisperDoctor({ env, home, platform: 'linux' });
  assert.equal(bad.failed, true);
  assert.ok(bad.lines.some(l => l.startsWith('FAIL whisper model: WHISPER_MODEL points to a file that does not exist')), bad.lines.join('\n'));
  assert.equal(whisperDoctor({ env: { PATH: tmp() }, home, platform: 'linux' }).failed, false);
});

test('doctor: whisper-cli and a good model are both reported as ok, with the path and size', { skip: process.platform === 'win32' }, () => {
  const home = tmp(), bin = tmp(), cli = put(path.join(bin, 'whisper-cli'), '#!/bin/sh\n'); chmodSync(cli, 0o755);
  const model = put(path.join(modelsFolder(home), 'ggml-base.bin'), header());
  const r = whisperDoctor({ env: { PATH: bin }, home, platform: process.platform });
  assert.deepEqual(r.lines, [`ok   whisper-cli: ${cli}`, `ok   whisper model: ${model} (0 MiB, any language, from the models folder)`]);
  assert.equal(r.failed, false);
});

test('the README gives the same file, link, size and folder as the program', () => {
  const readme = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'README.md'), 'utf8');
  assert.ok(readme.includes(modelUrl(RECOMMENDED.file)), 'download link');
  assert.ok(readme.includes(`~/.explainkit/models/${RECOMMENDED.file}`), 'models folder');
  assert.ok(readme.includes(`\`${RECOMMENDED.file}\` (${Math.round(RECOMMENDED.bytes / 1048576)} MiB`), 'file and size');
});

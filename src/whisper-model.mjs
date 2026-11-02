// Where the whisper.cpp model for `--engine whisper` comes from, and how to tell a good file from a bad one.
// explainkit never downloads the model: this module only looks at files you put on disk.
import { statSync, openSync, readSync, closeSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { shellQuote, findOnPath } from './util.mjs';

export const MODEL_REPO = 'https://huggingface.co/ggerganov/whisper.cpp';
// the model the README examples use: any language, 141 MiB
export const RECOMMENDED = { file: 'ggml-base.bin', bytes: 147951465 };
export const modelUrl = file => `${MODEL_REPO}/resolve/main/${file}`;
export const modelsFolder = (home = homedir()) => path.join(home, '.explainkit', 'models');
export const expandHome = (p, home = homedir()) => p.replace(/^~(?=$|[\\/])/, home);

// every whisper.cpp model starts with the "ggml" magic number, then eleven 32-bit header fields; the first is n_vocab
const GGML_MAGIC = 0x67676d6c;
const HEADER_BYTES = 48;
const MULTILINGUAL_VOCAB = 51865;

export function inspectModel(file) {
  let st;
  try { st = statSync(file); } catch (e) { return { ok: false, problem: e.code === 'ENOENT' || e.code === 'ENOTDIR' ? 'missing' : 'unreadable', code: e.code }; }
  if (st.isDirectory()) return { ok: false, problem: 'folder' };
  if (st.size === 0) return { ok: false, problem: 'empty' };
  const head = Buffer.alloc(Math.min(st.size, 256));
  try { const fd = openSync(file, 'r'); try { readSync(fd, head, 0, head.length, 0); } finally { closeSync(fd); } }
  catch (e) { return { ok: false, problem: 'unreadable', code: e.code }; }
  const text = head.toString('latin1');
  if (/^version https:\/\/git-lfs/.test(text)) return { ok: false, problem: 'lfs-pointer' };
  if (/^\s*<(!doctype|html)/i.test(text)) return { ok: false, problem: 'web-page' };
  if (head.length < HEADER_BYTES || head.readUInt32LE(0) !== GGML_MAGIC) return { ok: false, problem: 'not-ggml' };
  return { ok: true, bytes: st.size, multilingual: head.readInt32LE(4) >= MULTILINGUAL_VOCAB };
}

function otherModels(dir) {
  try { return readdirSync(dir).filter(n => /^ggml-.*\.bin$/.test(n)).sort().slice(0, 5); } catch { return []; }
}

// Order: --model, then WHISPER_MODEL, then ggml-base.bin in the models folder. What you point at explicitly is never
// replaced by something else: a wrong --model is reported, not silently swapped for the default.
export function findWhisperModel({ flag, env = process.env, home = homedir(), language = 'en' } = {}) {
  const asked = flag ? { source: 'flag', raw: flag } : env.WHISPER_MODEL ? { source: 'env', raw: env.WHISPER_MODEL } : null;
  const folder = modelsFolder(home), fallback = path.join(folder, RECOMMENDED.file);
  const file = path.resolve(expandHome(asked ? asked.raw : fallback, home));
  const seen = inspectModel(file);
  const result = { ...seen, file, source: asked ? asked.source : 'default', folder, fallback };
  if (seen.ok && !seen.multilingual && language && language !== 'en') Object.assign(result, { ok: false, problem: 'english-only', language });
  if (result.problem === 'missing' && !asked) result.others = otherModels(folder);
  return result;
}

const mib = n => `${Math.round(n / (1024 * 1024))} MiB`;
const SOURCE_NAME = { flag: '--model', env: 'WHISPER_MODEL' };

export function cliHelp({ platform = process.platform } = {}) {
  const install = platform === 'darwin' ? 'macOS: brew install whisper.cpp' : 'build it: cmake -B build, then cmake --build build -j --config Release, and put build/bin on your PATH';
  return `whisper-cli was not found on your PATH. It is the command-line program of whisper.cpp (https://github.com/ggml-org/whisper.cpp).\n  ${install}`;
}

// { headline, steps }: what is wrong, then exactly what to do about it
export function modelHelp(r, { platform = process.platform } = {}) {
  const asked = SOURCE_NAME[r.source], name = asked ? `${asked} (${r.file})` : r.file;
  const headline = {
    missing: asked ? `${asked} points to a file that does not exist: ${r.file}` : `no whisper model found: not given with --model, WHISPER_MODEL is not set, and ${r.fallback} is not there`,
    unreadable: `${name} cannot be read (${r.code})`,
    folder: `${name} is a folder, not a model file; point it at the .bin file inside`,
    empty: `${name} is empty (0 bytes); the download did not finish`,
    'lfs-pointer': `${name} is a small Git LFS pointer, not the model (cloning the model repository without git-lfs leaves these)`,
    'web-page': `${name} is a saved web page, not the model (the page link was saved instead of the download link)`,
    'not-ggml': `${name} is not a whisper.cpp ggml model; only the ggml-*.bin files from ${MODEL_REPO} work, not .pt, .safetensors, .gguf or Core ML .zip files`,
    'english-only': `${name} is an English-only model but the project language is "${r.language}"; whisper.cpp would listen for English and write the wrong words`,
  }[r.problem];
  const { file, bytes } = RECOMMENDED, dest = path.join(r.folder, file), win = platform === 'win32';
  const steps = [
    'Get a model (explainkit never downloads one for you):',
    `  file   ${file} (${mib(bytes)}, understands every language)`,
    `  from   ${modelUrl(file)}`,
    `  to     ${dest}   (explainkit looks there when you pass nothing)`,
    `  ${win ? 'curl.exe' : 'curl'} -L --create-dirs -o ${shellQuote(dest, platform)} ${shellQuote(modelUrl(file), platform)}`,
    r.others?.length ? `Models already in ${r.folder}: ${r.others.join(', ')}. To use one, add --model ${shellQuote(path.join(r.folder, r.others[0]), platform)}` : null,
    'Keeping it somewhere else? Pass --model <file> or set the WHISPER_MODEL environment variable to the file.',
    `Other sizes: ${MODEL_REPO}/tree/main (files with .en in the name are English only).`,
  ].filter(Boolean).join('\n');
  return { headline, steps };
}

// the whisper lines of `explainkit doctor`; a model you configured yourself and that does not work is a failure
export function whisperDoctor({ env = process.env, home, platform = process.platform } = {}) {
  const lines = [], indent = text => text.split('\n').map(l => `     ${l}`);
  let failed = false;
  const cli = findOnPath('whisper-cli', { env, platform });
  if (cli) lines.push(`ok   whisper-cli: ${cli}`);
  else lines.push('info whisper-cli: not found (optional: --engine whisper needs it, the estimate engine does not)', ...indent(cliHelp({ platform }).split('\n').slice(1).join('\n')));
  const m = findWhisperModel({ env, home });
  if (m.ok) lines.push(`ok   whisper model: ${m.file} (${mib(m.bytes)}, ${m.multilingual ? 'any language' : 'English only'}, from ${SOURCE_NAME[m.source] || 'the models folder'})`);
  else {
    const help = modelHelp(m, { platform }), configured = m.source !== 'default';
    failed = configured;
    lines.push(`${configured ? 'FAIL' : 'info'} whisper model: ${help.headline}${configured ? '' : ' (optional: only --engine whisper needs it)'}`, ...indent(help.steps));
  }
  return { lines, failed };
}

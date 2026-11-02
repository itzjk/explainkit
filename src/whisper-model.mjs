// Where the whisper.cpp model for `--engine whisper` comes from, and how to tell a good file from a bad one.
// explainkit never downloads the model: this module only looks at files you put on disk.
import { statSync, openSync, readSync, closeSync, readdirSync, accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

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

export function findOnPath(cmd, { env = process.env, platform = process.platform } = {}) {
  const win = platform === 'win32';
  const dirs = (env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter(Boolean);
  const exts = win ? ['', ...(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').toLowerCase().split(';')] : [''];
  for (const dir of dirs) for (const ext of exts) {
    const file = path.join(dir, cmd + ext);
    try { if (!statSync(file).isFile()) continue; if (!win) accessSync(file, constants.X_OK); return file; } catch { /* next candidate */ }
  }
  return null;
}

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

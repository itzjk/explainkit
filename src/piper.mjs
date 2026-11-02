// Piper (https://github.com/rhasspy/piper) as a preset of the command adapter in tts.mjs.
// The release builds are one folder with a program and no Python. explainkit never downloads Piper or a voice.
// It runs: <piper> -m <voice.onnx> --sentence_silence 0.3 -f <audio.wav> < <script text>
// Both Piper generations (the archived C++ program and `pip install piper-tts`) accept exactly these options and read the text from stdin.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { shellQuote, findOnPath } from './util.mjs';

// the same gap between sentences as the Kokoro adapter in tts.mjs; Piper alone would use 0.2 s, or 0 in the pip version
export const SENTENCE_SILENCE = 0.3;
export const RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
export const ASSETS = {
  'linux-x64': 'piper_linux_x86_64.tar.gz', 'linux-arm64': 'piper_linux_aarch64.tar.gz', 'linux-arm': 'piper_linux_armv7l.tar.gz',
  'darwin-arm64': 'piper_macos_aarch64.tar.gz', 'darwin-x64': 'piper_macos_x64.tar.gz', 'win32-x64': 'piper_windows_amd64.zip',
};
export const VOICE = {
  name: 'en_US-ljspeech-medium', license: 'public domain', mib: 61,
  base: 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/medium',
  card: 'https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/en/en_US/ljspeech/medium/MODEL_CARD',
};
export const voiceUrls = () => [`${VOICE.base}/${VOICE.name}.onnx`, `${VOICE.base}/${VOICE.name}.onnx.json`];

export function voiceHelp(problem) {
  const [onnx, json] = voiceUrls();
  return `${problem}\nGet a voice (explainkit never downloads one for you). Two files, saved in the same folder:\n  ${onnx}   (${VOICE.mib} MiB)\n  ${json}   (5 KB)\nThen: explainkit tts <project> --engine piper --voice <folder>/${VOICE.name}.onnx\nThe voice's license is in its model card: ${VOICE.card}`;
}

export function binaryHelp({ platform = process.platform, arch = process.arch } = {}) {
  const asset = ASSETS[`${platform}-${arch}`];
  const get = asset ? `Download ${asset} from ${RELEASE}/${asset} and unpack it. Keep the folder together: piper looks for espeak-ng-data next to the program.` : `No Piper release build is listed for ${platform}/${arch}; see ${RELEASE.replace('/download/', '/tag/')}.`;
  return `piper was not found. ${get}\nThen pass the program with --piper-bin <folder>/piper (or put the folder on your PATH). With pip, use --piper-bin "python3 -m piper".`;
}

export function piperVoice(model, config) {
  if (!model) throw new Error(voiceHelp('--engine piper needs a voice: pass --voice <file.onnx>.'));
  const file = path.resolve(model);
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(voiceHelp(`the Piper voice file does not exist: ${file}`));
  const cfg = path.resolve(config || `${file}.json`);
  if (!existsSync(cfg)) throw new Error(voiceHelp(`the voice config does not exist: ${cfg}. Piper needs the .onnx.json file with the same name next to the voice, or pass --piper-config.`));
  let rate;
  try { rate = JSON.parse(readFileSync(cfg, 'utf8'))?.audio?.sample_rate; }
  catch { throw new Error(`${cfg} is not valid JSON. The voice config is the .onnx.json file that comes with the voice, not a web page.`); }
  if (!(rate > 0)) throw new Error(`${cfg} has no audio.sample_rate, so it is not a Piper voice config.`);
  return { model: file, config: cfg, name: path.basename(file).replace(/\.onnx$/, ''), sampleRate: rate };
}

// bin is a program or a command line ("python3 -m piper"); a path to a file that exists is made absolute and quoted, so spaces are safe
export function piperCommand({ bin = 'piper', model, config, silence = SENTENCE_SILENCE, platform = process.platform }) {
  const q = p => shellQuote(p, platform);
  const prog = existsSync(bin) && statSync(bin).isFile() ? q(path.resolve(bin)) : bin;
  return [prog, '-m', q(model), ...(config ? ['-c', q(config)] : []), '--sentence_silence', String(silence), '-f', '{out}', '<', '{in}'].join(' ');
}

export function checkPiperBinary(bin = 'piper', { env = process.env } = {}) {
  if (/\s/.test(bin) || existsSync(bin) || findOnPath(bin, { env })) return;
  throw new Error(binaryHelp());
}

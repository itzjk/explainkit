// Optional narration adapters. The engine never needs one: the voice is just an audio file you provide.
// Pick whichever free or open voice you like; three adapters are included.
//   command  any program that turns text into a wav/mp3 file. Placeholders: {in} text file, {out} audio file, {text} the text (quoted).
//              explainkit tts examples/boat --engine command --cmd 'espeak-ng -f {in} -w {out}'
//   kokoro   Kokoro-82M, an open-weights voice (Apache-2.0) through the optional `kokoro-js` package. Runs locally;
//            the model (about 90 MB) is downloaded from Hugging Face the first time you use it.
//              npm install kokoro-js && explainkit tts examples/boat --engine kokoro --voice af_heart
//   piper    Piper, a fast local voice with no Python in its release builds, as a preset of `command` (see piper.mjs and docs/piper.md).
//              explainkit tts examples/boat --engine piper --voice voices/en_US-ljspeech-medium.onnx
// Check the license of the voice you choose before you publish what it says.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, ffmpeg } from './util.mjs';
import { scriptText } from './align.mjs';
import { piperVoice, piperCommand, checkPiperBinary } from './piper.mjs';

export function sentences(text) {
  return text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .map(p => p.split(/(?<=[.!?])\s+/).filter(Boolean));
}

// runs a command line with {in}, {out} and {text} filled in; a command that exits 0 without writing {out} is an error too
function runCommand({ cmd, text, out, tmp }) {
  const input = path.join(tmp, 'in.txt'); writeFileSync(input, text);
  const line = cmd.replaceAll('{in}', `"${input}"`).replaceAll('{out}', `"${out}"`).replaceAll('{text}', JSON.stringify(text));
  const r = run(line, [], { shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`the TTS command failed (exit ${r.status ?? r.signal}): ${line.slice(0, 120)}`);
  if (!existsSync(out) || statSync(out).size === 0) throw new Error(`the TTS command finished but wrote no audio to ${out}. It has to write its audio to {out}: ${line.slice(0, 120)}`);
}

export async function narrate({ scriptFile, out, engine = 'kokoro', voice, cmd = null, piperBin, piperConfig }) {
  const text = scriptText(readFileSync(scriptFile, 'utf8'));
  if (!text) throw new Error('the script is empty');
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = mkdtempSync(path.join(tmpdir(), 'explainkit-tts-'));
  try {
    if (engine === 'command') {
      if (!cmd) throw new Error('--engine command needs --cmd "<program> {in} {out}"');
      runCommand({ cmd, text, out, tmp });
      return out;
    }
    if (engine === 'piper') {
      const v = piperVoice(voice, piperConfig), wav = path.join(tmp, 'piper.wav');
      checkPiperBinary(piperBin);
      runCommand({ cmd: piperCommand({ bin: piperBin, model: v.model, config: piperConfig && v.config }), text, out: wav, tmp });
      if (/\.wav$/i.test(out)) copyFileSync(wav, out); else ffmpeg(['-i', wav, out], 'audio conversion');
      return out;
    }
    if (engine === 'kokoro') {
      let KokoroTTS;
      try { ({ KokoroTTS } = await import('kokoro-js')); }
      catch { throw new Error('the kokoro engine needs the optional package: npm install kokoro-js (the model downloads from Hugging Face on first use)'); }
      const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
      const parts = []; let n = 0;
      const silence = s => { const f = path.join(tmp, `s${n++}.wav`); ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(s), '-c:a', 'pcm_s16le', f]); return f; };
      for (const para of sentences(text)) {
        for (const s of para) {
          const raw = path.join(tmp, `r${n}.wav`), fixed = path.join(tmp, `p${n++}.wav`);
          (await tts.generate(s, { voice: voice || 'af_heart' })).save(raw);
          ffmpeg(['-i', raw, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', fixed]); parts.push(fixed, silence(0.3));
        }
        parts.push(silence(0.4));
      }
      const list = path.join(tmp, 'list.txt');
      writeFileSync(list, parts.map(f => `file '${f.replaceAll('\\', '/')}'`).join('\n'));
      ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c:a', out.endsWith('.mp3') ? 'libmp3lame' : 'pcm_s16le', out]);
      return out;
    }
    throw new Error(`unknown TTS engine "${engine}". Use "kokoro", "piper" or "command".`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

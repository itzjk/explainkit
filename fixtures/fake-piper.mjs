// Stands in for the piper program. It follows what Piper's own source does, so a test exercises the same command line:
// -m/--model, -c/--config (default: model + ".json"), -f/--output_file, --sentence_silence; the text comes from stdin and all
// lines are joined with a space; a missing model or config aborts with exit 134; it prints the output path on success.
// It writes a real WAV (mono, 16-bit, the sample rate from the voice config) and, when FAKE_PIPER_LOG is set, a JSON log of what it got.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';

const argv = process.argv.slice(2), opt = {};
const take = (names) => { for (const n of names) { const i = argv.indexOf(n); if (i >= 0) return argv[i + 1]; } };
opt.model = take(['-m', '--model']);
opt.config = take(['-c', '--config']) || (opt.model && `${opt.model}.json`);
opt.out = take(['-f', '--output_file', '--output-file']);
opt.silence = Number(take(['--sentence_silence', '--sentence-silence']) ?? 0.2);

const abort = what => { console.error(`terminate called after throwing an instance of 'std::runtime_error'\n  what():  ${what}`); process.exit(134); };
if (!opt.model || !existsSync(opt.model)) abort("Model file doesn't exist");
if (!existsSync(opt.config)) abort("Model config doesn't exist");

const text = readFileSync(0, 'utf8').split(/\r?\n/).join(' ').trim();
const rate = JSON.parse(readFileSync(opt.config, 'utf8')).audio.sample_rate;
const samples = Math.round(rate * (0.1 + opt.silence));
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
writeFileSync(opt.out, wav);
if (process.env.FAKE_PIPER_LOG) appendFileSync(process.env.FAKE_PIPER_LOG, JSON.stringify({ argv, text, rate }) + '\n');
console.log(opt.out);

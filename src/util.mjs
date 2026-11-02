import { spawnSync } from 'node:child_process';

// lower-case, no accents or punctuation; apostrophes vanish without leaving a gap ("you're" -> "youre")
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new Error(`${cmd} was not found on your PATH. Run "explainkit doctor" for install help.`);
    throw r.error;
  }
  return r;
}

export function ffmpeg(args, label = 'ffmpeg') {
  const r = run('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

export function duration(file) {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  const d = Number(r.stdout.trim());
  if (!(d > 0)) throw new Error(`could not read the duration of ${file}`);
  return d;
}

export function have(cmd) {
  const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

// one argument for a shell command line: single quotes for sh, double quotes for cmd.exe
export const shellQuote = (s, platform = process.platform) => platform === 'win32' ? `"${s}"` : `'${String(s).replaceAll("'", `'\\''`)}'`;

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { layoutFor } from './output.mjs';
import { openStage } from './render.mjs';
import { ffmpeg } from './util.mjs';

// params that produce a recognisable tile for scenes that draw nothing meaningful with {}
export const SCENE_PARAMS = {
  thermometer: { from: -10, to: 40 },
  title: { lines: ['EXPLAINKIT'], stars: true },
  dialogue: { lines: ['Hello!'] },
};

const COLS = 4;

export async function gallery(outFile) {
  const outDir = path.dirname(outFile);
  mkdirSync(outDir, { recursive: true });
  const layout = layoutFor('9:16');
  const dummy = {
    shots: [{ s: 0, e: 2, scene: 'planet', params: {}, label: null }],
    caps: [],
    fin: 2,
    layout,
    config: { captions: false, pulse: false, reframes: false, layout },
    sceneFiles: [],
  };
  const st = await openStage(dummy);
  const tmp = mkdtempSync(path.join(tmpdir(), 'ek-gallery-'));
  let names;
  try {
    names = await st.page.evaluate(() => Object.keys(ESC));
    const shots = names.map((name, i) => ({
      s: i * 2, e: (i + 1) * 2, scene: name,
      params: SCENE_PARAMS[name] || {}, label: null,
    }));
    await st.page.evaluate(d => window.load(d), {
      shots, caps: [], fin: names.length * 2,
      config: { captions: false, pulse: false, reframes: false, layout },
    });
    for (let i = 0; i < names.length; i++) {
      const buf = await st.page.evaluate(([t, name]) => {
        window.render(t);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,.75)';
        ctx.fillRect(0, 1800, 1080, 120);
        text(name, 540, 1862, 80, '#ffd166');
        return document.getElementById('c').toDataURL('image/jpeg', .92);
      }, [i * 2 + 1, names[i]]).then(u => Buffer.from(u.split(',')[1], 'base64'));
      writeFileSync(path.join(tmp, `${String(i).padStart(4, '0')}.jpg`), buf);
    }
  } finally {
    if (st.errors.length) console.error('ERRORS IN THE PAGE:\n' + [...new Set(st.errors)].slice(0, 10).join('\n'));
    await st.close();
  }
  ffmpeg([
    '-framerate', '1', '-i', path.join(tmp, '%04d.jpg'),
    '-vf', `scale=270:-2,tile=${COLS}x${Math.ceil(names.length / COLS)}`,
    '-frames:v', '1', outFile,
  ], 'gallery');
  rmSync(tmp, { recursive: true, force: true });
  return { file: outFile, scenes: names };
}

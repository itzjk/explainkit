import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openStage } from '../src/render.mjs';
import { layoutFor } from '../src/output.mjs';
import { SCENE_PARAMS } from '../src/gallery.mjs';

const GOLDEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'scenes-golden.json');
const UPDATE = !!process.env.UPDATE_GOLDEN;

// Renders every built-in scene at p=0.5 with its canonical params and checks the SHA-256
// of the raw pixel data against a stored hash. To accept intentional visual changes run:
//   UPDATE_GOLDEN=1 node --test test/scenes-golden.test.mjs
test('each built-in scene matches its golden frame (UPDATE_GOLDEN=1 to refresh)', async () => {
  const stored = JSON.parse(readFileSync(GOLDEN, 'utf8'));
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
  const fresh = {};
  try {
    const names = await st.page.evaluate(() => Object.keys(ESC));
    assert.ok(names.length >= 1, 'no built-in scenes found in ESC');
    const shots = names.map((name, i) => ({
      s: i * 2, e: (i + 1) * 2, scene: name,
      params: SCENE_PARAMS[name] || {}, label: null,
    }));
    await st.page.evaluate(d => window.load(d), {
      shots, caps: [], fin: names.length * 2,
      config: { captions: false, pulse: false, reframes: false, layout },
    });
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      // SHA-256 of the full RGBA pixel data, computed in the page to avoid transferring 8 MB
      const hash = await st.page.evaluate(async t => {
        window.render(t);
        const canvas = document.getElementById('c');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const buf = await crypto.subtle.digest('SHA-256', data.buffer);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }, i * 2 + 1);
      fresh[name] = hash;
      if (!UPDATE) {
        assert.notEqual(
          stored[name],
          undefined,
          `scene "${name}" has no stored golden frame — run: UPDATE_GOLDEN=1 node --test test/scenes-golden.test.mjs`,
        );
        assert.equal(
          hash,
          stored[name],
          `scene "${name}" no longer matches its golden frame\n  new: ${hash}\n  was: ${stored[name]}\n  to accept: UPDATE_GOLDEN=1 node --test test/scenes-golden.test.mjs`,
        );
      }
    }
    assert.deepEqual(st.errors, [], `page errors: ${st.errors.join('; ')}`);
  } finally {
    await st.close();
  }
  if (UPDATE) writeFileSync(GOLDEN, JSON.stringify(fresh, null, 2) + '\n');
});

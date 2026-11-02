import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStage } from '../src/render.mjs';
import { layoutFor } from '../src/output.mjs';
import { gallery } from '../src/gallery.mjs';

test('every built-in scene renders without errors using empty params', async () => {
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
  try {
    const names = await st.page.evaluate(() => Object.keys(ESC));
    assert.ok(names.length >= 1, 'no built-in scenes found in ESC');
    const shots = names.map((name, i) => ({
      s: i * 2, e: (i + 1) * 2, scene: name, params: {}, label: null,
    }));
    await st.page.evaluate(d => window.load(d), {
      shots, caps: [], fin: names.length * 2,
      config: { captions: false, pulse: false, reframes: false, layout },
    });
    for (let i = 0; i < names.length; i++) {
      const buf = await st.frame(i * 2 + 1);
      assert.ok(buf.length > 8000, `scene "${names[i]}" with empty params produced a nearly-blank frame`);
    }
    assert.deepEqual(st.errors, [], `page errors while rendering built-in scenes: ${st.errors.join('; ')}`);
  } finally {
    await st.close();
  }
});

test('gallery writes a JPEG contact sheet with a tile for every built-in scene', async () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'ek-gal-')), 'gallery.jpg');
  const r = await gallery(out);
  assert.ok(existsSync(r.file), `gallery file not found: ${r.file}`);
  assert.ok(r.scenes.length >= 1, 'gallery returned no scenes');
  const buf = readFileSync(r.file);
  assert.equal(buf[0], 0xff, 'not a JPEG (first byte)');
  assert.equal(buf[1], 0xd8, 'not a JPEG (second byte)');
  assert.ok(buf.length > 10000, `gallery.jpg is too small: ${buf.length} bytes`);
});

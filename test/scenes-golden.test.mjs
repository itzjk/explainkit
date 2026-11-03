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
// The stored golden is a raw-pixel SHA, which is only reproducible within one OS: Chromium's
// canvas anti-aliasing (thin alpha-blended strokes, arcs, gradients) rasterizes differently on
// Linux, macOS and Windows, so the exact-match check runs only on the canonical platform (Linux,
// the OS this project also renders the end-to-end example on). On macOS and Windows the test still
// renders every scene and checks the portable invariants (each scene draws, scenes stay distinct,
// no page errors). Regenerate the golden on Linux:  UPDATE_GOLDEN=1 node --test test/scenes-golden.test.mjs
const CANONICAL = process.platform === 'linux';
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
    // Replace glyph rasterization with a deterministic, platform-independent stand-in.
    // The same loaded font is rasterized differently by Skia/FreeType (Linux), CoreText
    // (macOS) and DirectWrite (Windows) — even two machines on the same OS disagree — so a
    // raw-pixel SHA of rendered text can never match across the CI matrix. Drawing each text
    // call as a solid box sized from its length and font size keeps the golden sensitive to
    // scene geometry and to text LAYOUT (position, size, moved/removed/relengthened text)
    // while dropping the one non-portable input: the glyphs themselves. Pure-vector scenes
    // already hash identically on every OS, so with this in place every scene does.
    await st.page.evaluate(() => {
      window.text = (s, px, py, size, color, o = {}) => {
        s = String(s ?? '');
        if (!s) return;
        const w = Math.round(s.length * size * 0.55); // nominal advance, no measureText
        const h = Math.round(size);
        const align = o.align || 'center';
        let x = px;
        if (align === 'center') x = px - w / 2;
        else if (align === 'right' || align === 'end') x = px - w;
        const base = o.base || 'middle';
        let y = py - h / 2;
        if (base === 'top' || base === 'hanging') y = py;
        else if (base === 'bottom' || base === 'alphabetic' || base === 'ideographic') y = py - h;
        ctx.fillStyle = color || '#000';
        ctx.fillRect(Math.round(x), Math.round(y), w, h);
      };
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
      assert.match(hash, /^[0-9a-f]{64}$/, `scene "${name}" did not render a frame`);
      if (!UPDATE && CANONICAL) {
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
    // Portable on every OS: no two scenes may collapse to the same frame (a scene that silently
    // stops drawing would otherwise pass unnoticed where the exact hash is not checked).
    const frames = Object.values(fresh);
    assert.equal(new Set(frames).size, frames.length, 'two built-in scenes produced an identical frame');
    assert.deepEqual(st.errors, [], `page errors: ${st.errors.join('; ')}`);
  } finally {
    await st.close();
  }
  if (UPDATE) writeFileSync(GOLDEN, JSON.stringify(fresh, null, 2) + '\n');
});

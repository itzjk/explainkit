// What goes on top of every shot: reframes inside long shots, the label, word-by-word captions and the optional pulse monitor.
// The renderer calls window.render(t) for every frame; DATA is loaded by render.mjs through window.load().
// Scenes draw the 1080x1920 stage. For 4:5 and 1:1 its middle is copied into a smaller frame, and the vignette, label,
// captions and pulse are drawn on that frame (see src/output.mjs).
let DATA = null, STAGE_CTX = null, FRAME_CTX = null;
window.load = d => {
  DATA = d;
  const L = d.config.layout, canvas = document.getElementById('c');
  canvas.width = L.width; canvas.height = L.height;
  canvas.style.width = L.width / 2 + 'px'; canvas.style.height = L.height / 2 + 'px';
  FRAME_CTX = canvas.getContext('2d');
  if (L.height === H) STAGE_CTX = FRAME_CTX;
  else { const stage = document.createElement('canvas'); stage.width = W; stage.height = H; STAGE_CTX = stage.getContext('2d'); }
};
const REFRAME_EVERY = 2.3; // seconds; inside a long shot the camera re-frames this often, which reads as a cut
const FRAMES = [[1, 0, 0], [1.1, -30, -60], [1.05, 20, 30], [1.14, 0, -90], [1.08, 30, -40]]; // [zoom, dx, dy]

function label(txt, t0, t) {
  const a = easeOut((t - t0) * 5); if (a <= 0) return;
  ctx.font = `bold 92px ${FONT}`; const w = ctx.measureText(txt).width + 70;
  ctx.save(); ctx.translate(DATA.config.layout.width / 2, DATA.config.layout.labelY); ctx.scale(.8 + .2 * a, .8 + .2 * a); ctx.globalAlpha = a;
  rrect(-w / 2, -66, w, 132, 22, 'rgba(10,12,18,.82)', 'rgba(255,255,255,.9)', 5);
  text(txt, 0, 6, 92, C.white); ctx.restore(); ctx.globalAlpha = 1;
}
function caption(t) {
  const c = DATA.caps.find(k => t >= k.s && t < k.e); if (!c) return;
  const a = clamp((t - c.s) * 9), s = 1.12 - .12 * easeOut(a);
  ctx.save(); ctx.translate(DATA.config.layout.width / 2, DATA.config.layout.captionY); ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18;
  let size = 96; ctx.font = `bold ${size}px ${FONT}`; while (ctx.measureText(c.txt).width > 900) { size -= 4; ctx.font = `bold ${size}px ${FONT}`; }
  text(c.txt, 0, 0, size, C.white, { outline: 16 });
  ctx.restore();
}
function pulse(t, bpm) {
  const px = 800, py = DATA.config.layout.pulseY, w = 230, h = 86, hot = bpm > 118;
  rrect(px, py, w, h, 18, 'rgba(8,10,14,.78)', 'rgba(255,255,255,.12)', 3);
  const col = hot ? '#ff5a5f' : '#39ff88';
  ctx.save(); ctx.beginPath(); ctx.rect(px + 50, py + 8, 120, h - 16); ctx.clip();
  ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath();
  const per = 60 / bpm;
  for (let i = 0; i <= 120; i += 2) { const tt = t - (120 - i) / 120 * 1.6, f = (tt % per) / per; let v = 0;
    if (f > .1 && f < .14) v = -6; else if (f > .14 && f < .18) v = 30; else if (f > .18 && f < .22) v = -18; else if (f > .3 && f < .4) v = 6 * Math.sin((f - .3) * 31);
    const yy = py + h / 2 - v; i ? ctx.lineTo(px + 50 + i, yy) : ctx.moveTo(px + 50 + i, yy); }
  ctx.stroke(); ctx.restore();
  const beat = 1 + .2 * Math.max(0, Math.sin(((t % per) / per) * Math.PI * 2));
  ctx.save(); ctx.translate(px + 27, py + h / 2); ctx.scale(beat * .55, beat * .55); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(-60, -20, -34, -66, 0, -34); ctx.bezierCurveTo(34, -66, 60, -20, 0, 30); ctx.fill(); ctx.restore();
  text(String(Math.round(bpm)), px + 200, py + 36, 44, C.white); text('BPM', px + 200, py + 66, 18, '#9aa3b0', { font: FONT2 });
}
function vignette(L) {
  const k = Math.hypot(L.width, L.height) / Math.hypot(W, H), cx = L.width / 2, cy = L.height / 2;
  const g = ctx.createRadialGradient(cx, cy, 500 * k, cx, cy, 1250 * k); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, L.width, L.height);
}
window.render = t => {
  const sh = DATA.shots, cfg = DATA.config, L = cfg.layout; let i = sh.length - 1; for (let k = 0; k < sh.length; k++) if (t < sh[k].e) { i = k; break; }
  const s = sh[i], d = s.e - s.s, lt = t - s.s, p = clamp(lt / d);
  bind(STAGE_CTX);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const long = cfg.reframes && d > 3.4 && i < sh.length - 1, sub = long ? Math.floor(lt / REFRAME_EVERY) : 0, st = long ? lt - sub * REFRAME_EVERY : lt;
  const enc = long ? FRAMES[(sub + i) % FRAMES.length] : FRAMES[0];
  const push = 1 + .045 * clamp(st / (long ? REFRAME_EVERY : d)), pop = st < .14 ? 1 + .035 * (1 - st / .14) : 1, sc = enc[0] * push * pop;
  ctx.save(); ctx.translate(540 + enc[1], 960 + enc[2]); ctx.scale(sc, sc); ctx.translate(-540, -960);
  if (!ESC[s.scene]) throw new Error(`unknown scene: ${s.scene}`);
  ESC[s.scene](p, s.params || {}, t);
  ctx.restore();
  bind(FRAME_CTX);
  if (STAGE_CTX !== FRAME_CTX) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(STAGE_CTX.canvas, 0, L.cropY, L.width, L.height, 0, 0, L.width, L.height); }
  vignette(L);
  if (s.label) label(s.label, s.s + .05, t);
  if (cfg.captions) caption(t);
  if (cfg.pulse) { const prev = sh[i - 1] ? sh[i - 1].bpm : s.bpm; pulse(t, lerp(prev, s.bpm || 90, clamp(lt / 1.5))); }
};

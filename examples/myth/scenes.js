// Custom scenes for the myth-busting example.
// Topic: "Lightning never strikes the same place twice."

function mkBolt(cx, top, bot, seed, alpha) {
  if (alpha <= 0) return;
  const r = rng(seed), steps = 7;
  const pts = [[cx, top]];
  for (let i = 1; i < steps; i++) {
    pts.push([cx + (r() - .5) * 220, top + (bot - top) * i / steps]);
  }
  pts.push([cx, bot]);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.lineWidth = 9; ctx.strokeStyle = '#c8d8ff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

function stormClouds() {
  for (let i = 0; i < 7; i++) {
    const r = rng(50 + i);
    circle(60 + i * 160, 160 + r() * 80, 90 + r() * 70, '#121620');
  }
}

function antennaTower(cx, base) {
  ctx.fillStyle = '#3a445e';
  ctx.beginPath(); ctx.moveTo(cx - 90, base); ctx.lineTo(cx + 90, base);
  ctx.lineTo(cx + 55, base - 290); ctx.lineTo(cx - 55, base - 290); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#4a5470'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.rect(cx - 90, base - 290, 180, 290); ctx.stroke();
  for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
    rrect(cx - 48 + col * 54, base - 56 - row * 65, 38, 44, 5, 'rgba(255,230,160,.2)');
  }
  ctx.lineWidth = 8; ctx.strokeStyle = '#5a647e';
  ctx.beginPath(); ctx.moveTo(cx, base - 290); ctx.lineTo(cx, base - 490); ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx, base - 490); ctx.lineTo(cx, base - 540); ctx.stroke();
  circle(cx, base - 495, 8, '#7a8aaa');
}

ESC.claim = (p, P, T) => {
  const myth = P.kind === 'MYTH', col = myth ? '#e5484d' : '#3fbf7f';
  background(myth ? '#14080a' : '#060e0a', '#06090f');
  glow(540, 900, 700, myth ? 'rgba(229,72,77,.22)' : 'rgba(63,191,127,.22)');
  const f = easeOut(p * 4);
  ctx.save(); ctx.translate(540, 820); ctx.scale(.85 + .15 * f, .85 + .15 * f); ctx.globalAlpha = f;
  rrect(-360, -300, 720, 600, 50, 'rgba(0,0,0,.55)', col, 10);
  text(P.kind, 0, -195, 108, col);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.moveTo(-290, -120); ctx.lineTo(290, -120); ctx.stroke();
  const lines = (P.line || '').split('|');
  lines.forEach((l, i, a) => {
    const size = l.length > 16 ? 72 : 86;
    text(l, 0, -40 + (i - (a.length - 1) / 2) * 108, size, C.white);
  });
  ctx.restore(); ctx.globalAlpha = 1;
};

ESC.stormsky = (p, P, T) => {
  background('#030508', '#0c0e18');
  stars(17, 60, T, 800);
  stormClouds();
  city(31, 1600, 400, '#0a0e16', .02, C.light);
  if (P.strike) {
    const period = 2.8, dur = .22;
    const phase = T % period, seed = Math.floor(T / period);
    if (phase < dur) {
      const br = phase < dur / 2 ? phase / (dur / 2) : 1 - (phase - dur / 2) / (dur / 2);
      ctx.globalAlpha = br * .45; ctx.fillStyle = '#c8d4f0'; ctx.fillRect(-200, -200, W + 400, H + 400); ctx.globalAlpha = 1;
      mkBolt(400 + (seed % 3) * 150, 320, 1600, seed * 13 + 7, br);
    }
  }
};

ESC.tower = (p, P, T) => {
  background('#030508', '#080c16');
  stars(23, 60, T, 800);
  stormClouds();
  city(41, 1700, 440, '#0a0e16', .04, C.light);
  const cx = 540, base = 1700;
  antennaTower(cx, base);
  const period = 2.4, dur = .3;
  const phase = T % period, seed = Math.floor(T / period);
  if (phase < dur) {
    const br = phase < dur / 2 ? phase / (dur / 2) : 1 - (phase - dur / 2) / (dur / 2);
    ctx.globalAlpha = br * .45; ctx.fillStyle = '#c0ccf0'; ctx.fillRect(-200, -200, W + 400, H + 400); ctx.globalAlpha = 1;
    mkBolt(cx, 100, base - 540, seed * 11 + 3, br);
    glow(cx, base - 495, 260, `rgba(255,230,120,${br * .9})`);
  }
  if (P.n > 1) {
    text(String(P.n) + '×', 540, 420, 220, '#ffd166', { outline: 14 });
    text(P.label || 'PER YEAR', 540, 598, 72, '#9aa3b0', { outline: 10 });
  }
};

ESC.pathmap = (p, P, T) => {
  background('#03070e', '#080e1e');
  stars(23, 50, T, 700);
  stormClouds();
  ctx.fillStyle = '#0e1420'; ctx.fillRect(-200, 1620, W + 400, 400);
  circle(190, 1480, 55, '#1a2a14'); circle(228, 1456, 44, '#1f3018'); circle(152, 1468, 42, '#1a2a14');
  ctx.fillStyle = '#1a2a14'; ctx.fillRect(177, 1536, 26, 84);
  silhouette(540, 1660, .9);
  ctx.fillStyle = '#3a445e';
  ctx.beginPath(); ctx.moveTo(810, 1620); ctx.lineTo(890, 1620); ctx.lineTo(878, 1420); ctx.lineTo(822, 1420); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#5a647e';
  ctx.beginPath(); ctx.moveTo(850, 1420); ctx.lineTo(850, 1300); ctx.stroke();
  circle(850, 1305, 6, '#7a8aaa');
  if (!P.highlight) {
    ctx.setLineDash([14, 12]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(200,210,255,.3)';
    [[190, 1480], [540, 1570], [850, 1300]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x, y); ctx.stroke();
    });
    ctx.setLineDash([]);
    text('SHORTEST PATH?', 540, 1780, 76, '#7c8696');
  } else {
    const f = easeOut(p * 2);
    mkBolt(190, 300, 1480, 71, .15 * f);
    mkBolt(540, 300, 1570, 73, .15 * f);
    mkBolt(850, 300, 1300, 75, f);
    glow(850, 1300, 220, `rgba(255,220,100,${f * .8})`);
    text('TALLEST WINS', 540, 1790, 76, '#ffd166');
  }
};

ESC.vote = (p, P, T) => {
  background('#03070e', '#080e1e');
  stars(23, 50, T, 800);
  text('BUST NEXT', 540, 340, 140, C.white);
  text('COMMENT ONE WORD', 540, 490, 70, '#7c8696');
  [[P.a, 760, '#e0a63a'], [P.b, 1160, '#4a7fc0']].forEach(([w, y, col], i) => {
    const f = easeOut(p * 3 - i * .4), s = 1 + Math.sin(T * 4 + i) * .015;
    ctx.save(); ctx.translate(540, y); ctx.scale(f * s, f * s);
    rrect(-340, -140, 680, 280, 40, col, '#fff', 6); text(w, 0, 6, 160, '#10151f');
    ctx.restore();
  });
};

// Reads a project folder and turns script + timings + plan into what the renderer needs:
// shots (where each one starts and ends), captions and the overlay config.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { norm } from './util.mjs';
import { scriptText, estimateWords, readWords } from './align.mjs';

// words that never end a caption on their own: they move to the next caption
export const FUNCTION_WORDS = {
  en: /^(THE|A|AN|OF|TO|IN|ON|AT|FOR|AND|OR|BUT|WITH|FROM|BY|HIS|HER|ITS|THEIR|YOUR|MY|OUR|IS|WAS|THAT|THIS|NO|NOT)$/,
  es: /^(DE|DEL|A|AL|EN|QUE|Y|EL|LA|LOS|LAS|UN|UNA|POR|PARA|CON|SU|TU|SUS|MI|SE|LO|LE|NO|MÁS|UNOS|UNAS|MIS|TUS|ESTE|ESTA|ESTOS|ESTAS|ESE|ESA|ESOS|ESAS|SIN|SOBRE|ENTRE|DESDE|HASTA|HACIA|SEGÚN|O|E|U|NI|PERO|COMO|SI|CUANDO|PORQUE|AUNQUE|MIENTRAS|ME|TE|NOS|LES|ES|ERA|FUE|MUY|TAN)$/,
  pt: /^(O|A|OS|AS|UM|UMA|UNS|UMAS|AO|AOS|À|ÀS|DO|DA|DOS|DAS|NO|NA|NOS|NAS|NUM|NUMA|NUNS|NUMAS|PELO|PELA|PELOS|PELAS|DUM|DUMA|PRA|PRO|ESTE|ESTA|ESSE|ESSA|NESTE|NESTA|NESSE|NESSA|DESTE|DESTA|DESSE|DESSA|DE|EM|POR|PARA|COM|SEM|SOB|SOBRE|ENTRE|ATÉ|DESDE|E|OU|MAS|NEM|QUE|SE|COMO|QUANDO|PORQUE|POIS|EMBORA|ENQUANTO|MEU|MINHA|MEUS|MINHAS|TEU|TUA|TEUS|TUAS|SEU|SUA|SEUS|SUAS|NOSSO|NOSSA|NOSSOS|NOSSAS|ME|TE|LHE|LHES|NÃO|MAIS|TÃO|É|ERA|FOI)$/,
  fr: /^(LE|LA|LES|UN|UNE|DES|DU|AU|AUX|DE|À|EN|DANS|SUR|SOUS|PAR|POUR|AVEC|SANS|CHEZ|ENTRE|VERS|PENDANT|DEPUIS|SELON|ET|OU|MAIS|NI|CAR|QUE|SI|QUAND|COMME|LORSQUE|PUISQUE|CE|CET|CETTE|CES|MON|MA|MES|TON|TA|TES|SON|SA|SES|NOTRE|VOTRE|LEUR|NOS|VOS|LEURS|JE|TU|IL|ILS|ON|ME|TE|SE|NE|QUI|DONT|EST|ÉTAIT|TRÈS|QU['’](IL|ILS|ELLE|ELLES|ON|UN|UNE)|D['’](UN|UNE)|S['’](IL|ILS|EST)|J['’]AI|C['’]EST|N['’](EST|A|ONT))$/,
};

export const DEFAULTS = {
  script: 'script.txt', audio: null, words: null, plan: 'plan.js', scenes: [], fixes: [],
  captions: true, pulse: false, reframes: true, labelY: 300, captionY: 1395, tail: 1.8, language: 'en', wordsPerSecond: 2.6,
};

export function loadConfig(dir, overrides = {}) {
  const file = path.join(dir, 'project.json');
  if (!existsSync(file)) throw new Error(`${file} not found. Is "${dir}" an explainkit project? Create one with: explainkit new ${dir}`);
  const cfg = Object.assign({}, DEFAULTS, JSON.parse(readFileSync(file, 'utf8')), overrides);
  const abs = p => (p ? path.resolve(dir, p) : null);
  const audio = abs(cfg.audio);
  return { ...cfg, dir, audioFile: audio && existsSync(audio) ? audio : null,
    scriptFile: abs(cfg.script), planFile: abs(cfg.plan), sceneFiles: cfg.scenes.map(abs),
    wordsFile: cfg.words ? abs(cfg.words) : path.join(dir, 'out', 'words.json') };
}

// words: the file if there is one, otherwise an estimate from the script (and the audio length when there is audio)
export function loadWords(cfg) {
  if (existsSync(cfg.wordsFile)) return { words: readWords(cfg.wordsFile), source: 'file' };
  if (!existsSync(cfg.scriptFile)) throw new Error(`no words file and no script at ${cfg.scriptFile}`);
  const text = scriptText(readFileSync(cfg.scriptFile, 'utf8'));
  return { words: estimateWords(text, { audio: cfg.audioFile, wps: cfg.wordsPerSecond }), source: cfg.audioFile ? 'estimate-from-audio' : 'estimate-from-script' };
}

export function parsePlan(source) {
  const plan = new Function(source + ';return PLAN;')();
  if (!Array.isArray(plan) || !plan.length) throw new Error('plan.js must define const PLAN = [ ... ] with at least one shot');
  return plan.map((row, i) => {
    const r = Array.isArray(row) ? { at: row[0], scene: row[1], params: row[2], label: row[3], pulse: row[4] } : row;
    if (!r.at || !r.scene) throw new Error(`plan.js row ${i + 1}: needs an anchor (the words where the shot starts) and a scene name`);
    return r;
  });
}

export function prepare(dir, overrides = {}) {
  const cfg = loadConfig(dir, overrides);
  const { words: raw, source } = loadWords(cfg);
  const pal = raw.map(w => ({ txt: w.text, s: w.start, e: w.end }));
  // a hyphenated word ("twenty-eight") counts as two tokens, so anchors can be written the way the script reads
  const tok = [], owner = [];
  pal.forEach((w, i) => norm(w.txt).split(' ').filter(Boolean).forEach(t => { tok.push(t); owner.push(i); }));
  const end = pal[pal.length - 1].e + cfg.tail;
  const plan = parsePlan(readFileSync(cfg.planFile, 'utf8'));
  // each shot starts where its anchor is spoken, always searching after the previous anchor
  let from = 0; const shots = [];
  for (const r of plan) {
    const a = norm(r.at).split(' ');
    let idx = -1;
    for (let i = from; i <= tok.length - a.length; i++) if (a.every((t, k) => tok[i + k] === t)) { idx = i; break; }
    if (idx < 0) throw new Error(`Anchor not found after word ${owner[from] ?? from} ("${pal[owner[from] ?? 0]?.txt}"): "${r.at}". Anchors are consecutive words from the script, in order. Word timings come from: ${source}.`);
    shots.push({ s: Math.max(0, pal[owner[idx]].s - .08), scene: r.scene, params: r.params, label: r.label || null, bpm: r.pulse });
    from = idx + a.length;
  }
  shots[0].s = 0;
  shots.forEach((sh, i) => { sh.e = i + 1 < shots.length ? shots[i + 1].s : end; });
  return { shots, caps: captions(pal, cfg), fin: end, source, config: { captions: cfg.captions, pulse: cfg.pulse, reframes: cfg.reframes, labelY: cfg.labelY, captionY: cfg.captionY }, sceneFiles: cfg.sceneFiles, cfg };
}

// captions: 1-3 words, cut at punctuation, at pauses longer than 0.35 s and past 15 characters
export function captions(pal, cfg) {
  const used = cfg.fixes.map(() => 0), caps = []; let cur = null;
  const FUNC = FUNCTION_WORDS[cfg.language] || FUNCTION_WORDS.en;
  pal.forEach((w, i) => {
    let t = w.txt.toUpperCase();
    const bare = t.replace(/[.,;:?!"']/g, '');
    // fixes: change how a word is written in captions. wholeWord matches the entire word, otherwise any part of it. First match wins.
    const r = cfg.fixes.findIndex((a, k) => (a.wholeWord ? bare === a.from.toUpperCase() : t.includes(a.from.toUpperCase())) && (!a.times || used[k] < a.times));
    if (r >= 0) { used[r]++; const a = cfg.fixes[r]; t = a.wholeWord ? t.replace(bare, a.to.toUpperCase()) : t.replace(a.from.toUpperCase(), a.to.toUpperCase()); }
    if (cfg.language === 'es') t = t.replace(/(\d),(\d{3})/g, '$1.$2');
    t = t.replace(/[.,;:]+$/, '');
    if (!t.replace(/[.,;:?!"']/g, '')) return; // a fix to "" removes the word
    if (!cur) cur = { s: w.s, e: w.e, ws: [], ts: [] };
    cur.ws.push(t); cur.ts.push(w.s); cur.e = w.e;
    const next = pal[i + 1], punct = /[.,;:?!]$/.test(w.txt);
    const cut = punct || cur.ws.length >= 3 || cur.ws.join(' ').length > 15 || !next || next.s - w.e > .35;
    if (cut && next && !punct && cur.ws.length > 1 && FUNC.test(cur.ws[cur.ws.length - 1])) {
      let k = cur.ws.length - 1;
      while (k > 1 && FUNC.test(cur.ws[k - 1])) k--;
      caps.push({ s: cur.s, e: cur.ts[k], txt: cur.ws.slice(0, k).join(' ') });
      cur = { s: cur.ts[k], e: w.e, ws: cur.ws.slice(k), ts: cur.ts.slice(k) }; return;
    }
    if (cut) { caps.push({ s: cur.s, e: next ? Math.min(next.s, cur.e + .6) : cur.e + .6, txt: cur.ws.join(' ') }); cur = null; }
  });
  return caps;
}

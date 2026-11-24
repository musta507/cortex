/* ---------- subtítulos fiables: Gemini escucha el audio y corrige lo que la IA del navegador oyó mal o se saltó ----------
   La IA del navegador (Whisper) da el momento exacto de cada palabra, pero se equivoca o se inventa frases con ruido o música.
   Gemini da el texto bueno; se emparejan las dos listas palabra a palabra y cada palabra buena se queda con el tiempo bueno. */
const LANG_NAME = { spanish: 'español', english: 'inglés', portuguese: 'portugués', french: 'francés', italian: 'italiano', arabic: 'árabe' };
function levDist(a, b) {
  if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return m + n;
  let prev = new Array(n + 1), cur = new Array(n + 1); for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
// empareja las palabras de Gemini (G) con las de Whisper (W): devuelve, para cada palabra de G, el índice en W o -1
function alignWords(G, W) {
  const n = G.length, m = W.length, GAP = -0.6, cols = m + 1;
  const sc = new Float32Array((n + 1) * cols), tb = new Uint8Array((n + 1) * cols);
  // parecido del texto y que estén en el mismo momento (los tiempos de Gemini son aproximados)
  const sim = (g, w) => {
    const dt = Math.abs(g.es - w.start); if (dt > 3) return -3;
    const a = g.n, b = w.n, L = Math.max(a.length, b.length);
    const txt = a && b ? (a === b ? 2 : L > 3 && levDist(a, b) <= Math.max(1, Math.floor(L * 0.34)) ? 1.2 : 0) : 0;
    if (txt) return txt - (dt > 1.5 ? 0.5 : 0);
    return dt < 0.8 ? -0.4 : -1.5;   // otra palabra en el mismo sitio: Whisper la oyó mal
  };
  for (let i = 1; i <= n; i++) { sc[i * cols] = i * GAP; tb[i * cols] = 1; }
  for (let j = 1; j <= m; j++) { sc[j] = j * GAP; tb[j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const d = sc[(i - 1) * cols + j - 1] + sim(G[i - 1], W[j - 1]), u = sc[(i - 1) * cols + j] + GAP, l = sc[i * cols + j - 1] + GAP;
    if (d >= u && d >= l) { sc[i * cols + j] = d; tb[i * cols + j] = 0; } else if (u >= l) { sc[i * cols + j] = u; tb[i * cols + j] = 1; } else { sc[i * cols + j] = l; tb[i * cols + j] = 2; }
  }
  const pair = new Int32Array(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const t = i > 0 && j > 0 ? tb[i * cols + j] : i > 0 ? 1 : 2;
    if (t === 0) { if (sim(G[i - 1], W[j - 1]) > -1) pair[i - 1] = j - 1; i--; j--; }
    else if (t === 1) i--; else j--;
  }
  return pair;
}
// palabras de Whisper (tiempos absolutos) + audio 16 kHz desde a0 → palabras corregidas (mismo formato)
async function geminiFixWords(ws, au, a0, say) {
  const dur = au.length / 16000;
  if (dur < 1.2 || !getGemKey()) return ws;
  const out = [];
  // trozos de 90 s como mucho (cortando en una pausa entre palabras)
  const cuts = [0];
  while (dur - cuts[cuts.length - 1] > 100) {
    const want = cuts[cuts.length - 1] + 90;
    let best = want, gap = 0;
    for (let i = 0; i + 1 < ws.length; i++) { const t0 = ws[i].end - a0, t1 = ws[i + 1].start - a0; if (t0 > want - 15 && t1 < want + 10 && t1 - t0 > gap) { gap = t1 - t0; best = (t0 + t1) / 2; } }
    cuts.push(best);
  }
  cuts.push(dur);
  for (let c = 0; c + 1 < cuts.length; c++) {
    const s = cuts[c], e = cuts[c + 1];
    const W = ws.filter(w => (w.start + w.end) / 2 - a0 >= s && (w.start + w.end) / 2 - a0 < e);
    try { out.push(...await geminiFixPart(W, au.subarray(Math.floor(s * 16000), Math.ceil(e * 16000)), a0 + s, say, cuts.length > 2 ? ` (parte ${c + 1} de ${cuts.length - 1})` : '')); }
    catch (err) { console.warn('Gemini no pudo revisar los subtítulos', err); out.push(...W); if (err.message === 'BADKEY' || err.message === 'QUOTA') { out.push(...ws.filter(w => (w.start + w.end) / 2 - a0 >= e)); break; } }
  }
  return out;
}
async function geminiFixPart(W, au, t0, say, tag) {
  const dur = au.length / 16000;
  say('Gemini está escuchando el audio para corregir los subtítulos…' + tag);
  const lang = LANG_NAME[$('lang').value] || 'español';
  const draft = W.map(w => `[${(w.start - t0).toFixed(1)}] ${w.text.trim()}`).join(' ').slice(0, 9000);
  const o = await gemRetry(() => geminiJSON([{ inline_data: { mime_type: 'audio/wav', data: wavB64(au, 16000) } }, { text: `Transcribe EXACTAMENTE lo que se dice en este audio de ${dur.toFixed(1)} s. Es un streamer hablando en ${lang}: puede haber jerga, palabrotas, nombres de personas o de juegos, risas, gritos y varias personas a la vez.
- Escribe las palabras tal cual se dicen, sin corregir la forma de hablar, sin resumir, sin traducir y sin añadir nada que no se diga.
- No transcribas la letra de canciones ni la música de fondo. Si algo no se entiende, sáltalo (no lo inventes).
- Usa la ortografía correcta (tildes, ¿?, ¡!) y puntuación normal.
Te paso un borrador automático con el segundo en que empieza cada palabra. Puede tener palabras mal oídas, frases inventadas y partes que faltan: úsalo solo como pista de tiempos.
BORRADOR: ${draft || '(vacío)'}
Devuelve la transcripción en frases cortas (de 2 a 10 palabras), en orden, con el segundo de inicio y de fin de cada una (segundos desde el principio del audio, con un decimal).
Responde solo JSON: {"frases":[{"s":0.0,"e":1.8,"t":"texto"}]}` }], 0), m => say(m + tag));
  const F = (o && Array.isArray(o.frases) ? o.frases : []).map(f => ({ s: Math.max(0, Math.min(dur, +f.s)), e: Math.max(0, Math.min(dur, +f.e)), t: String(f.t || '').replace(/\s+/g, ' ').trim() })).filter(f => f.t && isFinite(f.s));
  if (!F.length) return W;   // Gemini no oye nada: mejor dejar lo que había
  // palabras de Gemini con un tiempo aproximado (repartido dentro de su frase)
  const G = [];
  F.forEach((f, k) => {
    const toks = f.t.split(' ').filter(Boolean), e = isFinite(f.e) && f.e > f.s ? f.e : Math.min(dur, f.s + toks.length * 0.35);
    const tot = toks.reduce((x, p) => x + p.length + 1, 0); let t = f.s;
    for (const p of toks) { const d = (e - f.s) * (p.length + 1) / tot; G.push({ t: p, n: normWord(p), es: t + t0, ee: t + d + t0, ph: k }); t += d; }
  });
  const Wn = W.map(w => ({ ...w, n: normWord(w.text) }));
  const pair = alignWords(G, Wn);
  const paired = pair.filter(x => x >= 0).length;
  if (Wn.length > 12 && paired < Math.min(G.length, Wn.length) * 0.2) { console.warn('Gemini y la IA del navegador no coinciden: se deja la IA del navegador'); return W; }
  // tiempos: los emparejados, el de Whisper; los que faltaban, el de Gemini encajado entre los vecinos
  const res = G.map((g, i) => pair[i] >= 0 ? { text: ' ' + g.t, start: Wn[pair[i]].start, end: Wn[pair[i]].end, ok: true } : { text: ' ' + g.t, start: g.es, end: g.ee, ok: false });
  for (let i = 0; i < res.length;) {
    if (res[i].ok) { i++; continue; }
    let j = i; while (j < res.length && !res[j].ok) j++;
    const lo = i > 0 ? res[i - 1].end : t0, hi = j < res.length ? res[j].start : t0 + dur, cnt = j - i;
    const rs = res[i].start, re = res[j - 1].end;
    let s0 = Math.max(lo, rs), e0 = Math.min(hi, re);
    if (e0 - s0 < 0.12 * cnt) { s0 = lo; e0 = Math.min(hi, lo + Math.max(0.12 * cnt, Math.min(hi - lo, 0.4 * cnt))); }
    if (e0 - s0 < 0.12 * cnt) { s0 = lo; e0 = hi; }
    // los tiempos de Gemini, encajados en el hueco (se mantienen las pausas entre frases)
    const k = (e0 - s0) / Math.max(0.01, re - rs);
    for (let q = i; q < j; q++) { res[q].start = s0 + (res[q].start - rs) * k; res[q].end = s0 + (res[q].end - rs) * k; }
    i = j;
  }
  for (let i = 0; i < res.length; i++) {   // en orden y sin solaparse
    if (i && res[i].start < res[i - 1].end) res[i].start = res[i - 1].end;
    if (res[i].end < res[i].start + 0.06) res[i].end = res[i].start + 0.06;
    delete res[i].ok;
  }
  return res;
}
// la IA de voz a veces se queda enganchada repitiendo lo mismo: se deja como mucho dos veces seguidas
function cleanRepeats(ws) {
  const out = [], key = a => a.map(w => normWord(w.text)).join(' ');
  for (let i = 0; i < ws.length;) {
    let skip = 0;
    for (let n = 1; n <= 8 && !skip; n++) {
      if (out.length < 2 * n || i + n > ws.length) continue;
      const cur = key(ws.slice(i, i + n));
      if (cur.replace(/ /g, '') && cur === key(out.slice(-n)) && cur === key(out.slice(-2 * n, -n))) skip = n;
    }
    if (skip) i += skip; else out.push(ws[i++]);
  }
  return out;
}
// partes con voz que se quedaron sin ninguna palabra: se vuelven a escuchar solas (suele ser un fallo al juntar trozos de 30 s)
async function fillGaps(ws, audio, a0, models, onStatus) {
  const sr = 16000, D = audio.length / sr, step = 1600, E = [];
  for (let i = 0; i + step <= audio.length; i += step) { let q = 0; for (let j = i; j < i + step; j += 4) q += audio[j] * audio[j]; E.push(Math.sqrt(q / (step / 4))); }
  if (E.length < 30) return ws;
  const so = [...E].sort((x, y) => x - y), noise = so[Math.floor(so.length * 0.2)], loud = so[Math.floor(so.length * 0.75)], thr = noise + (loud - noise) * 0.35;
  const t = ws.map(w => [w.start - a0, w.end - a0]).sort((x, y) => x[0] - y[0]), gaps = [];
  let prev = 0;
  for (const [s0, e0] of t) { if (s0 - prev >= 2.5) gaps.push([prev, s0]); prev = Math.max(prev, e0); }
  if (D - prev >= 2.5) gaps.push([prev, D]);
  const voiced = ([g0, g1]) => { const a = Math.floor(g0 * 10), b = Math.min(E.length, Math.ceil(g1 * 10)); let n = 0; for (let i = a; i < b; i++) if (E[i] > thr) n++; return b > a ? n / (b - a) : 0; };
  const todo = gaps.filter(g => voiced(g) >= 0.3 && !(g[0] < 0.5 && g[1] > D - 0.5)).slice(0, 8);
  let extra = [];
  for (let k = 0; k < todo.length; k++) {
    const [g0, g1] = todo[k], p0 = Math.max(0, g0 - 0.3), p1 = Math.min(D, g1 + 0.3);
    onStatus(`Repasando una parte sin subtítulos (${k + 1} de ${todo.length})…`);
    try {
      const res = await runAI(audio.subarray(Math.floor(p0 * sr), Math.ceil(p1 * sr)), models, $('lang').value, () => {}, () => {});
      const add = cleanRepeats(chunksToWords(res.chunks, res.mode).map(w => ({ ...w, start: w.start + a0 + p0, end: w.end + a0 + p0 })))
        .filter(w => w.end > w.start && (w.start + w.end) / 2 - a0 >= g0 - 0.05 && (w.start + w.end) / 2 - a0 <= g1 + 0.05);
      extra = extra.concat(add);
    } catch (e) { console.warn('Repaso de un hueco', e); }
  }
  return extra.length ? [...ws, ...extra].sort((x, y) => x.start - y.start) : ws;
}
// trozos del original que usa el clip (cada uno se transcribe aparte: así no se escucha lo que no sale en el clip)
function subRanges() {
  const D = vid.duration || 0, list = (segs.length ? segs : [{ s: 0, e: D }]).map(g => [Math.max(0, g.s - 0.3), Math.min(D, g.e + 0.3)]).sort((a, b) => a[0] - b[0]);
  const out = []; for (const r of list) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + 3) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}
// audio a 16 kHz de un trozo: la voz aislada si la hay (sin música se entiende mucho mejor)
async function voiceAudio16k(a0, a1) {
  const st = typeof isoOn === 'function' && isoOn() ? isoStemFor(a0, a1) : null;
  if (st) {
    const i0 = Math.max(0, Math.round((a0 - st.s) * MDX.RATE)), i1 = Math.min(st.vL.length, Math.round((a1 - st.s) * MDX.RATE)), n = Math.max(1, i1 - i0);
    const len = Math.max(1, Math.round(n / MDX.RATE * 16000)), oac = new OfflineAudioContext(1, len, 16000), b = oac.createBuffer(1, n, MDX.RATE), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (st.vL[i0 + i] + st.vR[i0 + i]) / 2;
    const s = oac.createBufferSource(); s.buffer = b; s.connect(oac.destination); s.start(0);
    return (await oac.startRendering()).getChannelData(0);
  }
  const D = vid.duration || 0;
  return (a0 > 0.5 || a1 < D - 0.5 || file.size > 4e8) ? rangeAudio16k(a0, a1) : decodeAudio16k(file);
}

var voiceDown = 0;   // la IA de voz no se pudo descargar hace poco: no insistir
// la IA de voz suele hacer empezar la primera palabra tras un silencio demasiado pronto (se «come» el hueco):
// se mira el volumen del audio y cada palabra empieza donde de verdad empieza a sonar la voz
function voiceSnap(ws, audio, a0) {
  if (!ws.length || !audio || !audio.length) return ws;
  const F = 160, n = Math.floor(audio.length / F), e = new Float32Array(n);   // energía cada 10 ms
  for (let i = 0; i < n; i++) { let q = 0; for (let j = i * F; j < (i + 1) * F; j++) q += audio[j] * audio[j]; e[i] = Math.sqrt(q / F); }
  const sorted = Array.from(e).sort((x, y) => x - y), floor = sorted[Math.floor(n * 0.15)] || 0, loud = sorted[Math.floor(n * 0.9)] || 0;
  const thr = Math.max(floor * 2.5, floor + (loud - floor) * 0.12, 0.004);
  const fr = t => Math.max(0, Math.min(n - 1, Math.round((t - a0) * 100)));
  const out = ws.map(w => ({ ...w }));
  for (let k = 0; k < out.length; k++) {
    const w = out[k], prevEnd = k ? out[k - 1].end : -1;
    if (w.end - w.start < 0.25) continue;
    let i = fr(w.start); const z = fr(w.end);
    let run = 0; for (; i <= z; i++) { if (e[i] > thr) { if (++run >= 3) { i -= 2; break; } } else run = 0; }   // 30 ms seguidos con voz
    if (i > z) continue;
    const onset = a0 + i / 100 - 0.04;
    if (onset - w.start > 0.12 && onset < w.end - 0.12 && onset > prevEnd) w.start = +onset.toFixed(2);
  }
  return out;
}


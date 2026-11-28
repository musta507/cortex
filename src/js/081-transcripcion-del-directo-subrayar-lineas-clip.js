/* ---------- transcripción del directo: subrayar líneas → clip ---------- */
const lvTr = {};   // por directo: { done: Set(wav), lines: [{a, b, t, w?: [[inicio, fin, palabra]…]}] }
let lvTrBusy = false, lvTrStick = true, lvTrDown = false;
const lvTrOn = () => false;   // la transcripción en directo está quitada (no funcionaba bien): el grabador no la hace y no se enseña
function lvTrSess() { const all = Object.values(liveSessions).filter(x => x.status).sort((a, b) => b.status.started - a.status.started); const f = lvFocus && all.filter(x => String(x.status.slug || '').toLowerCase() === lvFocus); return (f && (f.find(x => x.on) || f[0])) || all.find(x => x.on) || all[0]; }
async function lvTrLoad(S) {
  if (lvTr[S.name]) return lvTr[S.name];
  const T = lvTr[S.name] = { done: new Set(), lines: [] };
  for (const l of rjsonl((await rtext(S.h, 'transcript.jsonl')) || '')) { if (l.wav) T.done.add(l.wav); T.lines.push(...(l.lines || [])); }
  T.lines.sort((x, y) => x.a - y.a);
  { const ok = []; for (const l of T.lines) { l.t = trSquash(l.t); if (!trLoop(l.t, ok) && !TR_FAKE.test(l.t)) ok.push(l); } T.lines = ok; }   // quitar bucles que ya estuvieran guardados
  return T;
}
/* Calidad de la IA de voz. Cuanto mejor el modelo, mejor entiende nombres, jerga y voces con música, pero pide más ordenador.
   «auto»: con tarjeta gráfica usa el modelo medio (mucho más fiable que el pequeño); sin ella, el pequeño. Si el PC no llega, baja solo. */
const TR_TIER = {
  max: [{ id: 'onnx-community/whisper-large-v3-turbo_timestamped', word: true, gpu: true, enc: 'fp16' }],
  small: [{ id: 'onnx-community/whisper-small_timestamped', word: true }],
  base: [{ id: 'onnx-community/whisper-base_timestamped', word: true }, { id: 'Xenova/whisper-base', word: false }],
};
const TR_ORDER = ['max', 'small', 'base'], TR_NAME = { max: 'máxima', small: 'alta', base: 'rápida' };
let trGpu = null, trDown = 0, trRtf = [];
async function trTier() {
  if (trGpu == null) trGpu = await hasWebGPU();
  const want = ezPref('trQ') || 'auto';
  let i = TR_ORDER.indexOf(want === 'auto' ? (trGpu ? 'small' : 'base') : want); if (i < 0) i = 2;
  if (!trGpu && TR_ORDER[i] === 'max') i = 1;
  return TR_ORDER[Math.min(2, i + trDown)];
}
const trModels = tier => TR_ORDER.slice(TR_ORDER.indexOf(tier)).flatMap(k => TR_TIER[k]);   // si uno falla, sigue con el siguiente
// si el ordenador no llega a transcribir a la velocidad del directo, se baja un escalón
function trSpeed(dt, sec, tier) {
  if (sec < 2) return;
  trRtf.push(dt / 1000 / sec); if (trRtf.length > 6) trRtf.shift();
  if (trRtf.length < 5 || tier === 'base') return;
  const m = [...trRtf.slice(1)].sort((a, b) => a - b)[2];     // sin contar la primera (carga el modelo)
  if (m > 0.8) { trDown++; trRtf = []; toast('Tu ordenador va justo con esa calidad de transcripción: bajo un escalón para seguir el directo'); }
}
const TR_GEN = { no_repeat_ngram_size: 4, repetition_penalty: 1.15 };
// frases que la IA de voz se inventa cuando solo hay música o silencio
const TR_FAKE = /subt[ií]tulos? (realizados|por|de la comunidad)|amara\.org|gracias por ver( el v[ií]deo)?\.?$|suscr[ií]bete( al canal)?\.?$|^m[uú]sica\.?$|^\W*$/i;
// la IA de voz a veces se queda en bucle («la gente se ha llegado a la gente…») con música o ruido: se descartan esas líneas
const trWords = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
function trLoop(t, prev) {
  const w = trWords(t); if (!w.length) return true;
  // dentro de la línea: pocas palabras distintas para su largo
  if (w.length >= 6 && new Set(w).size / w.length < 0.45) return true;
  // contra las últimas líneas: casi las mismas palabras
  const S = new Set(w);
  for (const p of prev.slice(-4)) { const P = new Set(trWords(p.t)); let k = 0; S.forEach(x => { if (P.has(x)) k++; }); if (k / Math.max(1, Math.min(S.size, P.size)) >= 0.7 && S.size >= 4) return true; }
  return false;
}
// «no, no, no, no, no, no» → «no, no, no» (como mucho tres veces seguidas lo mismo)
function trSquash(t) {
  const w = String(t || '').split(/\s+/).filter(Boolean), out = [], key = x => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const x of w) { const n = out.length; if (n >= 3 && key(out[n - 1]) === key(x) && key(out[n - 2]) === key(x) && key(out[n - 3]) === key(x)) continue; out.push(x); }
  return out.join(' ');
}
const trClean = t => String(t || '').replace(/\[[^\]]*\]|\([^)]*m[uú]sica[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
/* nombres y palabras del streamer: si la IA escribe algo casi igual («Wescol», «Bles»), se corrige */
const trNorm = x => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ0-9]/g, '');
const trVocabKey = S => 'trVocab:' + String(S.status.slug || '').toLowerCase();
function trVocab(S) {
  const saved = ezPref(trVocabKey(S));
  const list = (saved != null ? saved : [S.status.slug, S.status.client].filter(Boolean).join(', ')).split(/[,\n]/).map(x => x.trim()).filter(x => x.length >= 3);
  return list.map(x => ({ o: x, n: trNorm(x) })).filter(v => v.n.length >= 3);
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const c = [i]; let best = i; for (let j = 1; j <= b.length; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (c[j] < best) best = c[j]; } if (best > max) return max + 1; p = c; }
  return p[b.length];
}
function trFixWord(w, V) {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(w); if (!m || !m[2]) return w;
  const n = trNorm(m[2]); if (n.length < 4) return w;
  for (const v of V) { if (n === v.n) return m[1] + v.o + m[3]; const mx = v.n.length <= 5 ? 1 : 2; if (n[0] === v.n[0] && lev(n, v.n, mx) <= mx) return m[1] + v.o + m[3]; }
  return w;
}
// de palabras con su tiempo a líneas (una frase por línea)
function trLines(words, V, prev) {
  const out = []; let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const t = trSquash(cur.map(w => w.t).join(' '));
    if (!trLoop(t, [...prev, ...out]) && !TR_FAKE.test(t)) out.push({ a: +cur[0].s.toFixed(2), b: +cur[cur.length - 1].e.toFixed(2), t, w: cur.map(w => [+w.s.toFixed(2), +w.e.toFixed(2), w.t]) });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i], pv = words[i - 1];
    if (cur.length && pv && w.s - pv.e > 0.7) flush();
    cur.push({ ...w, t: V.length ? trFixWord(w.t, V) : w.t });
    if (/[.?!…]$/.test(w.t) || cur.length >= 16 || (cur.length >= 8 && /[,;:]$/.test(w.t))) flush();
  }
  flush();
  return out;
}
async function trSave(S, T, meta, lines) {
  if (!lines.length && !meta.wav) return;
  T.lines.push(...lines);
  const old = (await rtext(S.h, 'transcript.jsonl')) || '';
  await wfile(S.h, 'transcript.jsonl', old + JSON.stringify({ ...meta, lines }) + '\n');
}
const trStatus = m => { if (/Descargando|Cargando|Preparando/.test(m)) $('lvTrS').textContent = '⏳ ' + m + ' (solo la primera vez)'; };
// voz baja: se sube el volumen antes de pasársela a la IA (entiende mejor lo que se dice flojo)
function trLoud(a) { const r = trRms(a, 0); if (r <= 0 || r >= 0.06) return a; const g = Math.min(10, 0.08 / r), o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { const x = a[i] * g; o[i] = x > 1 ? 1 : x < -1 ? -1 : x; } return o; }
const trRms = (a, from) => { let q = 0; const s = a.subarray(Math.max(0, from | 0)); for (let i = 0; i < s.length; i++) q += s[i] * s[i]; return Math.sqrt(q / Math.max(1, s.length)); };
// subtítulos en vivo: lee el audio que el grabador va escribiendo segundo a segundo y lo transcribe al momento
async function lvTrLive(S, T) {
  let info; try { info = JSON.parse((await rtext(S.h, 'aud/live.json')) || 'null'); } catch { info = null; }
  if (!info || !info.file) return false;
  if (T.liveFile !== info.file) {   // nuevo audio (al empezar o si el grabador se reconectó)
    const f0 = await fileAt(S.h, info.file);
    T.liveFile = info.file; T.liveT0 = info.t0; T.pos = Math.max(0, f0.size - 16000 * 2 * 4) & ~1; T.buf = new Float32Array(0); T.bufT0 = info.t0 + T.pos / 32000; T.partial = '';
    if (!T.liveStart) T.liveStart = T.bufT0;
  }
  const f = await fileAt(S.h, info.file), end = f.size & ~1;
  if (end > T.pos) {
    const i16 = new Int16Array(await f.slice(T.pos, end).arrayBuffer()), add = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) add[i] = i16[i] / 32768;
    const nb = new Float32Array(T.buf.length + add.length); nb.set(T.buf); nb.set(add, T.buf.length); T.buf = nb; T.pos = end; T.recvAt = performance.now();
    if (T.buf.length > 16000 * 27) { const cut = T.buf.length - 16000 * 27; T.buf = T.buf.slice(cut); T.bufT0 += cut / 16000; }   // si va muy atrasada, salta
  }
  try { await lvSyncTry(S, T, f); } catch (e) { console.warn('sincronizar', e); }
  const sec = T.buf.length / 16000, live = lag => { $('lvTrS').textContent = `🔴 En vivo · calidad ${TR_NAME[T.tier] || ''}` + (lag > 8 ? ` · ${Math.round(lag)} s por detrás` : lvPlayEpoch() != null ? (lvSync.approx ? ' · ≈ casi a la par de la ventanita (afinando…)' : ' · 🎯 a la par de la ventanita') : T.delay != null ? ` · ⚡ texto ${T.delay.toFixed(1).replace('.', ',')} s después de oírse` : ''); };
  if (sec < 1) { live(0); return true; }
  // todo silencio: no se le da a la IA (se inventaría frases)
  if (trRms(T.buf, 0) < 0.0025) { if (sec > 3) { const drop = T.buf.length - 16000; T.buf = T.buf.slice(drop); T.bufT0 += drop / 16000; } T.partial = ''; T.partialW = []; T.knownTo = T.bufT0 + T.buf.length / 16000; live(0); lvTrRender(S); return true; }
  const tier = T.tier = await trTier(), V = trVocab(S), t0 = performance.now(), recv = T.recvAt || t0;
  const res = await runAI(trLoud(T.buf), trModels(tier), 'es', () => {}, trStatus, TR_GEN);
  { const pe = lvPlayEpoch(); if (pe != null && T.knownTo) lvSlack(T.knownTo - 1.0 - pe); }
  const base0 = T.bufT0; T.knownTo = base0 + sec;
  trSpeed(performance.now() - t0, sec, tier);
  { const d = (performance.now() - recv) / 1000; T.delay = T.delay == null ? d : T.delay * 0.6 + d * 0.4; }   // lo que tarda en salir escrito desde que llega el audio
  const quiet = trRms(T.buf, T.buf.length - 12800) < 0.012;   // silencio al final → se puede cerrar todo lo dicho
  const ch = (res.chunks || []).map(c => ({ s: (c.timestamp || [])[0], e: (c.timestamp || [])[1], t: trClean(c.text) })).filter(c => c.t && c.s != null);
  let lines = [], upto = 0, rest = ch;
  if (res.mode === 'word') {
    for (const c of ch) if (c.e == null || c.e < c.s) c.e = c.s + 0.3;
    // se da por buena cada palabra dicha hace más de 1,6 s; se cierra en la última pausa o signo de puntuación
    const lim = quiet ? sec + 1 : sec - 1.1; let n = 0; while (n < ch.length && ch[n].e <= lim) n++;
    let cut = 0;
    if (quiet) cut = n;
    else { for (let i = n - 1; i >= 0; i--) if (/[.?!…,;:]$/.test(ch[i].t) || (ch[i + 1] && ch[i + 1].s - ch[i].e > 0.45)) { cut = i + 1; break; } if (!cut && n && ch[n - 1].e - ch[0].s > 6) cut = n; }
    if (cut) {
      lines = trLines(ch.slice(0, cut).map(c => ({ s: T.bufT0 + c.s, e: T.bufT0 + c.e, t: c.t })), V, T.lines);
      upto = Math.min(sec, ch[cut - 1].e + 0.05); rest = ch.slice(cut);
    }
  } else {
    let keep = ch.length;   // cuántas frases se quedan "en el aire" (pueden cambiar)
    if (quiet) keep = 0; else if (sec >= 4 && ch.length > 1) keep = 1; else if (sec >= 8) keep = 0;
    const fix = ch.slice(0, ch.length - keep);
    for (const c of fix) {
      const t = trSquash(V.length ? c.t.split(' ').map(w => trFixWord(w, V)).join(' ') : c.t);
      if (trLoop(t, [...T.lines, ...lines]) || TR_FAKE.test(t)) continue;
      lines.push({ a: +(T.bufT0 + c.s).toFixed(2), b: +(T.bufT0 + (c.e != null ? c.e : c.s + 2)).toFixed(2), t });
    }
    if (fix.length) upto = keep ? ch[ch.length - keep].s : (fix[fix.length - 1].e != null ? fix[fix.length - 1].e : sec);
    rest = ch.slice(ch.length - keep);
  }
  // se oye a alguien pero la IA no ha sacado palabras: se deja una marca para que sepas que ahí hay algo
  {
    const gaps = [], lim = upto > 0 ? upto : (!ch.length && sec > 5 ? sec - 0.5 : 0); let pv = 0;
    if (lim > 0) { for (const c of ch) { if (c.s >= lim) break; if (c.s - pv > 1.8) gaps.push([pv + 0.2, c.s - 0.2]); pv = Math.max(pv, c.e != null ? c.e : c.s + 0.3); } if (lim - pv > 1.8) gaps.push([pv + 0.2, lim - 0.1]); }
    for (const [g0, g1] of gaps) {
      if (trRms(T.buf.subarray(Math.round(g0 * 16000), Math.round(g1 * 16000)), 0) < 0.02) continue;
      const a = +(base0 + g0).toFixed(2), b = +(base0 + g1).toFixed(2), last = [...T.lines, ...lines].filter(l => l.a <= a).pop();
      if (last && last.u && a - last.b < 3) { last.b = b; continue; }
      lines.push({ a, b, t: '[… no se entiende]', u: 1 });
    }
    lines.sort((x, y) => x.a - y.a);
    if (!upto && lim > 0) { upto = lim; rest = []; }
  }
  if (upto > 0) { const drop = Math.max(0, Math.min(T.buf.length, Math.round(upto * 16000))); T.buf = T.buf.slice(drop); T.bufT0 += drop / 16000; }
  else if (!ch.length && sec > 4 && quiet) { const drop = T.buf.length - 8000; if (drop > 0) { T.buf = T.buf.slice(drop); T.bufT0 += drop / 16000; } }
  await trSave(S, T, { live: info.file }, lines);
  const pt = trSquash(rest.map(c => c.t).join(' '));
  T.partial = TR_FAKE.test(pt) || (trWords(pt).length >= 6 && trLoop(pt, [])) ? '' : pt;
  T.partialW = T.partial ? rest.map(c => [+(base0 + c.s).toFixed(2), +(base0 + (c.e != null && c.e >= c.s ? c.e : c.s + 0.3)).toFixed(2), res.mode === 'word' && V.length ? trFixWord(c.t, V) : c.t]) : [];
  live(T.buf.length / 16000);
  lvTrRender(S);
  return true;
}
// un trozo ya grabado (directo terminado, o «desde antes»)
async function lvTrSeg(S, T, x, left) {
  $('lvTrS').textContent = `🎧 Escribiendo el min ${clockOf(x.t0 - S.status.started)}…` + (left > 1 ? ` (faltan ${left})` : '');
  const w = wavToF32(await (await fileAt(S.h, x.wav)).arrayBuffer());
  const k = 16000 / w.rate, au = new Float32Array(Math.floor(w.a.length * k));   // a 16 kHz para la IA de voz
  for (let i = 0; i < au.length; i++) { const p = i / k, j = Math.floor(p), f = p - j; au[i] = (w.a[j] || 0) * (1 - f) + (w.a[j + 1] || 0) * f; }
  let lines = [];
  if (trRms(au, 0) >= 0.004) {
    const tier = T.tier = await trTier(), V = trVocab(S);
    const res = await runAI(trLoud(au), trModels(tier), 'es', () => {}, trStatus, TR_GEN);
    const ch = (res.chunks || []).map(c => ({ s: (c.timestamp || [])[0], e: (c.timestamp || [])[1], t: trClean(c.text) })).filter(c => c.t && c.s != null);
    if (res.mode === 'word') lines = trLines(ch.map(c => ({ s: x.t0 + c.s, e: x.t0 + (c.e != null && c.e >= c.s ? c.e : c.s + 0.3), t: c.t })), V, T.lines.filter(l => l.a < x.t0).slice(-4));
    else for (const c of ch) {
      const t = trSquash(V.length ? c.t.split(' ').map(q => trFixWord(q, V)).join(' ') : c.t);
      if (trLoop(t, lines) || TR_FAKE.test(t)) continue;
      lines.push({ a: +(x.t0 + c.s).toFixed(2), b: +Math.min(x.t1, x.t0 + (c.e != null ? c.e : c.s + 3)).toFixed(2), t });
    }
  }
  T.done.add(x.wav); await trSave(S, T, { wav: x.wav, t0: x.t0 }, lines);
  T.lines.sort((p, q) => p.a - q.a); T.dirty = true;
  lvTrRender(S);
}
// trozos sin escribir (los que ya tienen texto por el modo en vivo no se repiten)
function trTodo(S, T, from, to) {
  return S.segs.filter(x => {
    if (!x.wav || x.t1 <= from || x.t0 >= to || T.done.has(x.wav)) return false;
    let cov = 0; for (const l of T.lines) cov += Math.max(0, Math.min(l.b, x.t1) - Math.max(l.a, x.t0));
    if (cov > (x.t1 - x.t0) * 0.35) { T.done.add(x.wav); return false; }
    return true;
  });
}
async function lvTrTick() {
  if (lvTrBusy || lvTrDown || !lvTrOn() || (typeof exporting !== 'undefined' && exporting)) return;   // sigue aunque estés editando (se para solo mientras exportas)
  const S = lvTrSess(); if (!S || !S.h || !S.segs || !S.segs.length) return;
  lvTrBusy = true;
  try {
    const T = await lvTrLoad(S);
    if (S.on && await lvTrLive(S, T)) {
      // «desde antes»: en los huecos, cuando el directo va al día, se va escribiendo lo antiguo (de lo más nuevo a lo más viejo)
      if (T.back != null && T.buf.length / 16000 < 5) { const todo = trTodo(S, T, T.back, T.liveStart || 1e12); if (todo.length) await lvTrSeg(S, T, todo[todo.length - 1], todo.length); else T.back = null; }
      return;
    }
    // sin audio en vivo (directo terminado o grabador antiguo): por trozos, desde 5 min antes o desde donde pidas
    const last = S.segs[S.segs.length - 1].t1;
    const from = T.back != null ? T.back : (T.from = T.from || Math.max(S.segs[0].t0, last - 300));
    const todo = trTodo(S, T, from, 1e12);
    if (!todo.length) { $('lvTrS').textContent = T.lines.length ? '✅ Al día' : '⏳ Esperando el siguiente trozo del directo…'; return; }
    await lvTrSeg(S, T, T.back != null ? todo[todo.length - 1] : todo[0], todo.length);
  } catch (e) { console.warn('transcripción', e); $('lvTrS').textContent = '⚠ ' + String(e.message || e).slice(0, 120); }
  finally { lvTrBusy = false; }
}
// con la ventanita a la par: cada línea aparece cuando empieza a sonar
setInterval(() => {
  const box = $('lvTrB'); if (!box || lvTrDown) return;
  const pe = lvPlayEpoch(); box.classList.toggle('sync', pe != null);
  const futs = box.querySelectorAll('.tr-fut'); if (!futs.length) return;
  const nearEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 70; let any = false;
  for (const s of futs) if (pe == null || +s.dataset.g <= pe + 0.15) { s.classList.remove('tr-fut'); s.classList.add('tr-in'); if (+s.dataset.a > (box._seen || 0)) box._seen = +s.dataset.a; const l = s.closest('.futp'); if (l) l.classList.remove('futp'); any = true; }
  if (any && nearEnd) box.scrollTop = box.scrollHeight;
}, 100);
/* pintar: párrafos (lo que se dice seguido va junto) y, dentro, cada palabra con su tiempo */
function lvTrRender(S) {
  const box = $('lvTrB'), T = S && lvTr[S.name]; if (!box) return;
  if (lvTrDown) return;   // mientras arrastras el ratón para subrayar, no se toca nada
  if (!T || (!T.lines.length && !(T.partialW || []).length)) { if (lvTrOn() && !box.querySelector('.tr-l')) box.innerHTML = '<p class="hint">⏳ Escuchando… (la primera vez se descarga la IA de voz y tarda un poco en arrancar).</p>'; return; }
  const selecting = window.getSelection && String(getSelection()).trim() && box.contains(getSelection().anchorNode);
  const fromEnd = box.scrollHeight - box.scrollTop - box.clientHeight, nearEnd = fromEnd < 70;
  if (box._sess !== S.name || T.dirty || !box.querySelector('.tr-l')) {
    if (selecting && box.querySelector('.tr-l')) return;
    box.innerHTML = ''; box._sess = S.name; T.shown = 0; T.dirty = false; box._par = null; box._seen = null;
  }
  let live = box.querySelector('.tr-live');
  const pe = lvPlayEpoch(), fut = a => pe != null && a > pe;   // con la ventanita a la par: lo que aún no ha sonado se guarda escondido
  const anim = !!box.querySelector('.tr-l') && box._seen != null; let seen = box._seen == null ? -1 : box._seen;
  // g = inicio de su línea: la línea entera aparece de una vez cuando empieza a sonar (y entra con una animación)
  const span = (a, b, t, clip, prov, g, un) => { const f = fut(g), s = document.createElement('span'); s.className = 'tr-s' + (clip ? ' clip' : '') + (prov ? ' tr-prov' : '') + (un ? ' tr-u' : '') + (f ? ' tr-fut' : anim && a > box._seen ? ' tr-in' : ''); s.dataset.a = a; s.dataset.b = b; s.dataset.g = g; s.textContent = t + ' '; if (!f && a > seen) seen = a; return s; };
  for (; T.shown < T.lines.length; T.shown++) {
    const l = T.lines[T.shown]; let P = box._par;
    // párrafo nuevo: pausa, fin de frase con el párrafo ya largo, o párrafo muy largo
    if (!P || l.a - P.b > 1.3 || P.n > 230 || (P.n > 90 && /[.?!…]$/.test(P.last)) || l.a < P.b - 0.5) {
      const d = document.createElement('div'); d.className = 'tr-l' + (fut(l.a) ? ' futp' : ''); d.dataset.a = l.a;
      const tm = document.createElement('button'); tm.type = 'button'; tm.className = 'tr-t'; tm.title = 'Clic: seleccionar este párrafo entero';
      tm.innerHTML = '<b></b><i class="tr-m"></i>'; tm.firstChild.textContent = clockOf(l.a - S.status.started);
      const tx = document.createElement('span'); tx.className = 'tr-x';
      d.append(tm, tx); box.insertBefore(d, live || null);
      P = box._par = { el: d, tx, n: 0, b: l.b, last: '' };
    }
    if (l.w && l.w.length) for (const w of l.w) P.tx.append(span(w[0], w[1], w[2], l.clip, false, l.a)); else P.tx.append(span(l.a, l.b, l.t, l.clip, false, l.a, l.u));
    P.n += l.t.length + 1; P.b = l.b; P.last = l.t; P.el.dataset.b = l.b;
  }
  if (!live) { live = document.createElement('div'); live.className = 'tr-l tr-live'; live.innerHTML = '<span class="tr-t"><b>● vivo</b></span><span class="tr-x"></span>'; box.append(live); }
  if (!selecting) {   // lo que aún puede cambiar: sigue en el mismo párrafo, palabra por palabra
    box.querySelectorAll('.tr-prov').forEach(x => x.remove());
    const pw = T.partialW || [], P = box._par, inP = !!(P && pw.length && pw[0][0] - P.b <= 1.3 && P.n <= 230);
    const tgt = inP ? P.tx : live.lastChild; if (!inP) live.lastChild.textContent = '';
    for (const w of pw) tgt.append(span(w[0], w[1], w[2], false, true, pw[0][0]));
    live.hidden = inP || !pw.length; live.classList.toggle('futp', !inP && pw.length > 0 && fut(pw[0][0]));
  }
  box._seen = seen;
  lvTrBadges(S); lvTrSearch(true);
  if (!selecting && (nearEnd || lvTrStick)) { box.scrollTop = box.scrollHeight; lvTrStick = false; }
  else if (!selecting && box._keep != null) { box.scrollTop = box.scrollHeight - box.clientHeight - box._keep; }
  box._keep = null;
  $('lvTrEnd').hidden = box.scrollHeight - box.scrollTop - box.clientHeight < 70;
}
// al lado de la hora: si en ese momento el chat explotó, lo oyó la IA o lo subió otro clipper
function lvTrBadges(S) {
  const ps = [...$('lvTrB').querySelectorAll('.tr-l:not(.tr-live)')].slice(-150), ms = S.moments || [];
  for (const p of ps) {
    const a = +p.dataset.a, b = +(p.dataset.b || p.dataset.a); let x = 0, ia = false, cl = false;
    for (const m of ms) {
      if (m.src === 'chat') { if (m.t1 - 6 > a && m.t1 - 28 < b) x = Math.max(x, chatX(m)); }   // el chat reacciona unos segundos después de lo que se dijo
      else if (m.t1 > a && m.t0 < b) { if (m.src === 'ia') ia = true; else if (m.src === 'clipper') cl = true; }
    }
    const txt = (x >= 2 ? '🔥' + fmtX(x) + ' ' : '') + (cl ? '📱' : '') + (ia ? '🤖' : '');
    const el = p.querySelector('.tr-m'); if (el && el.textContent !== txt) { el.textContent = txt; el.title = [x >= 2 ? 'El chat fue ' + fmtX(x) + ' más rápido de lo normal' : '', cl ? 'Otro clipper subió este momento' : '', ia ? 'La IA marcó este momento' : ''].filter(Boolean).join(' · '); p.classList.toggle('hot', x >= 3 || cl); }
  }
}
// buscar en lo que se ha dicho
let lvTrQi = -1, lvTrQlast = '';
function lvTrSearch(keep) {
  const box = $('lvTrB'), raw = $('lvTrQ').value || '', q = trNorm(raw).trim(), qs = q.split(/\s+/).filter(Boolean);
  box.querySelectorAll('.tr-q,.tr-qc').forEach(x => x.classList.remove('tr-q', 'tr-qc'));
  box.querySelectorAll('.tr-l.hit').forEach(x => x.classList.remove('hit'));
  if (q.length < 2) { $('lvTrQn').textContent = ''; lvTrQi = -1; lvTrQlast = ''; return; }
  // cada vez que salen esas palabras seguidas → un resultado (lista de palabras marcadas)
  const sp = [...box.querySelectorAll('.tr-s:not(.tr-fut)')], tx = sp.map(x => trNorm(x.textContent).replace(/[^\p{L}\p{N}]+/gu, '')), hits = [];
  for (let i = 0; i < sp.length; i++) {
    let ok = true; for (let k = 0; k < qs.length && ok; k++) { const w = tx[i + k]; ok = w != null && (k === qs.length - 1 ? w.startsWith(qs[k]) || (qs.length === 1 && w.includes(qs[k])) : w === qs[k] || (k === 0 && w.endsWith(qs[k]))); }
    if (ok) hits.push(sp.slice(i, i + qs.length));
  }
  for (const h of hits) { for (const x of h) x.classList.add('tr-q'); const l = h[0].closest('.tr-l'); if (l) l.classList.add('hit'); }
  if (!hits.length) { $('lvTrQn').textContent = 'no sale'; lvTrQi = -1; lvTrQlast = q; return; }
  const moved = q !== lvTrQlast; if (moved || lvTrQi < 0 || lvTrQi >= hits.length) { if (keep && !moved && lvTrQi >= hits.length) lvTrQi = hits.length - 1; else if (moved || lvTrQi < 0) lvTrQi = hits.length - 1; }   // empieza por la más reciente
  lvTrQlast = q;
  const cur = hits[lvTrQi]; for (const x of cur) x.classList.add('tr-qc');
  $('lvTrQn').textContent = `${lvTrQi + 1} de ${hits.length} · Intro: anterior`;
  if (!keep || moved) { const r = cur[0].getBoundingClientRect(), br = box.getBoundingClientRect(); box.scrollTop += r.top - br.top - box.clientHeight / 2; }
}
// de la selección del ratón a segundos del directo (exacto a la palabra)
function lvTrPick() {
  const sel = getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const box = $('lvTrB'), r = sel.getRangeAt(0);
  if (!box.contains(r.startContainer) || !box.contains(r.endContainer)) return null;
  const sp = [...box.querySelectorAll('.tr-l:not(.tr-live) .tr-s')].filter(s => r.intersectsNode(s) && !(r.startContainer === s.firstChild && r.startOffset >= s.textContent.length - 1) && !(r.endContainer === s.firstChild && r.endOffset === 0));
  if (!sp.length) return null;
  const first = sp[0], last = sp[sp.length - 1];
  const frac = (s, node, off, dflt) => node === s.firstChild ? Math.max(0, Math.min(1, off / Math.max(1, s.textContent.length - 1))) : dflt;
  const word = s => !/\s/.test(s.textContent.trim());           // una sola palabra: se coge entera
  const fa = word(first) ? 0 : frac(first, r.startContainer, r.startOffset, 0), fb = word(last) ? 1 : frac(last, r.endContainer, r.endOffset, 1);
  let t0 = +first.dataset.a + (+first.dataset.b - +first.dataset.a) * fa, t1 = +last.dataset.a + (+last.dataset.b - +last.dataset.a) * fb;
  if (t1 < t0) [t0, t1] = [t1, t0];
  if (t1 - t0 < 1.5) t1 = t0 + 1.5;
  const text = sp.map(s => s.textContent.trim()).join(' ').replace(/\s+/g, ' ').trim();
  return { t0: Math.max(0, t0 - 0.25), t1: t1 + 0.45, text, rect: r.getBoundingClientRect() };
}
function lvTrShowPop() {
  const P = lvTrPick(), pop = $('lvTrPop');
  if (!P) { pop.hidden = true; return; }
  pop._pick = P; pop.hidden = false;
  $('lvTrPopT').textContent = `${Math.round(P.t1 - P.t0)} s`;
  const top = P.rect.top - 48 < 8 ? P.rect.bottom + 8 : P.rect.top - 48;
  pop.style.top = top + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - 330, P.rect.left + P.rect.width / 2 - 150)) + 'px';
}
async function lvTrMake(edit) {
  const pop = $('lvTrPop'), P = pop._pick, S = lvTrSess(); pop.hidden = true;
  if (!P || !S) return;
  const m = { id: 'tr' + Date.now().toString(36), src: 'agente', t0: P.t0, t1: P.t1, conf: 1, at: Date.now() / 1000, info: P.text.slice(0, 90) + (P.text.length > 90 ? '…' : ''), req: 'Subrayado en la transcripción' };
  const old = (await rtext(S.h, 'moments_agente.jsonl')) || '';
  await wfile(S.h, 'moments_agente.jsonl', old + JSON.stringify(m) + '\n');
  S.moments = [...(S.moments || []), m]; liveSeen.add(m.id);
  const T = lvTr[S.name]; if (T) for (const l of T.lines) if (Math.min(l.b, P.t1) - Math.max(l.a, P.t0) > 0.6) l.clip = true;
  for (const s of $('lvTrB').querySelectorAll('.tr-s')) { const mid = (+s.dataset.a + +s.dataset.b) / 2; if (mid > P.t0 + 0.2 && mid < P.t1 - 0.4) s.classList.add('clip'); }
  getSelection().removeAllRanges(); liveRender();
  toast(`✂️ Clip de ${Math.round(P.t1 - P.t0)} s guardado en «Tus clips»`);
  if (edit) liveEdit(S, mergeMoments([m])[0], null);
}
setTimeout(() => {
  if (!$('lvTrB')) return;
  const box = $('lvTrB');
  const upd = () => { $('lvTrOn').textContent = lvTrOn() ? '⏸ Pausar' : '▶ Activar'; if (!lvTrOn()) $('lvTrS').textContent = ''; };
  $('lvTrOn').onclick = () => { ezPref('liveTr', lvTrOn() ? '0' : '1'); upd(); writeLiveConfig(); lvTrStick = true; if (lvTrOn()) { const S = lvTrSess(); if (S) lvTrLoad(S).then(() => lvTrRender(S)); lvTrTick(); } };
  upd();
  setInterval(lvTrTick, 250);
  box.addEventListener('mousedown', e => { if (e.button === 0) lvTrDown = true; });
  document.addEventListener('mouseup', () => { if (!lvTrDown) return; lvTrDown = false; setTimeout(() => { lvTrShowPop(); const S = lvTrSess(); if (S) lvTrRender(S); }, 0); });
  box.addEventListener('scroll', () => { $('lvTrPop').hidden = true; $('lvTrEnd').hidden = box.scrollHeight - box.scrollTop - box.clientHeight < 70; });
  // clic en la hora: se selecciona el párrafo entero
  box.addEventListener('click', e => { const t = e.target.closest('.tr-t'); if (!t || t.closest('.tr-live')) return; const r = document.createRange(); r.selectNodeContents(t.parentElement.querySelector('.tr-x')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lvTrShowPop(); });
  document.addEventListener('mousedown', e => { if (!$('lvTrPop').contains(e.target)) $('lvTrPop').hidden = true; });
  $('lvTrClip').onclick = () => lvTrMake(false);
  $('lvTrEdit').onclick = () => lvTrMake(true);
  $('lvTrEnd').onclick = () => { box.scrollTop = box.scrollHeight; };
  $('lvTrQ').addEventListener('input', lvTrSearch);
  $('lvTrQ').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const q = trNorm($('lvTrQ').value || '').trim(); if (q.length < 2 || lvTrQi < 0) return; const tot = +(($('lvTrQn').textContent.match(/de (\d+)/) || [])[1] || 0); if (!tot) return; lvTrQi = (lvTrQi + (e.shiftKey ? 1 : -1) + tot) % tot; lvTrSearch(); } });
  $('lvTrBig').onclick = () => { const on = $('lvTrBox').classList.toggle('big'); $('lvTrBig').textContent = on ? '⤡' : '⤢'; lvTrStick = true; };
  const q = $('lvTrQual'); q.value = ezPref('trQ') || 'auto';
  q.onchange = () => { ezPref('trQ', q.value); trDown = 0; trRtf = []; toast(q.value === 'max' ? 'Calidad máxima: la primera vez descarga un modelo grande (más de 1 GB) y necesita tarjeta gráfica' : 'Calidad de la transcripción cambiada'); };
  $('lvTrVoc').onclick = () => {
    const S = lvTrSess(); if (!S) { toast('Aún no hay directo'); return; }
    const cur = trVocab(S).map(v => v.o).join(', ');
    const v = prompt('Nombres y palabras que se dicen mucho en este canal (separados por comas).\nSi la IA escribe algo parecido, lo corrige:', cur);
    if (v != null) { ezPref(trVocabKey(S), v); toast('Guardado: se aplica a lo que se diga a partir de ahora'); }
  };
  $('lvTrBack').onclick = e => {
    e.stopPropagation(); const S = lvTrSess(); if (!S || !S.segs || !S.segs.length) { toast('Aún no hay nada grabado'); return; }
    const r = $('lvTrBack').getBoundingClientRect(), last = S.segs[S.segs.length - 1].t1;
    const go = sec => async () => { const T = await lvTrLoad(S); T.back = sec ? Math.max(S.segs[0].t0, last - sec) : S.segs[0].t0; box._keep = box.scrollHeight - box.scrollTop - box.clientHeight; toast('Voy escribiendo lo de antes sin dejar de seguir el directo'); lvTrTick(); };
    ctxOpen(r.left, r.bottom + 6, 'Escribir también lo de antes', [{ icon: '⏪', label: 'Los últimos 15 minutos', act: go(900) }, { icon: '⏪', label: 'La última hora', act: go(3600) }, { icon: '⏮', label: 'Todo el directo', act: go(0) }]);
  };
}, 0);


/* ---------- utilidades ---------- */
// esperas con un «reloj» en segundo plano: Chrome frena los relojes de las pestañas ocultas o con la pantalla bloqueada, los de un worker no
const tmWorker = (() => { try { const w = new Worker(URL.createObjectURL(new Blob(['onmessage=e=>setTimeout(()=>postMessage(e.data.id),e.data.ms)'], { type: 'text/javascript' }))); const m = new Map(); let n = 0; w.onmessage = e => { const f = m.get(e.data); m.delete(e.data); if (f) f(); }; return (ms, f) => { const id = ++n; m.set(id, f); w.postMessage({ id, ms }); }; } catch { return null; } })();
const sleep = ms => new Promise(r => tmWorker ? tmWorker(ms, r) : setTimeout(r, ms));
const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0'); };
const fmtc = t => fmt(t) + '.' + Math.floor((t % 1) * 10);
const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
function setStatus(el, msg, cls) { el.textContent = msg; el.className = 'status' + (cls ? ' ' + cls : ''); }
function cleanWord(w, upper) {
  let t = w.replace(/[.,;:"“”«»]/g, '').trim();
  return upper ? t.toLocaleUpperCase('es') : t;
}
function setRange(id, v) { const el = $(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  // con límite de tiempo (una descarga colgada dejaba la exportación parada para siempre) y una segunda dirección de reserva
  const one = url => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; let done = false;
    const end = (ok, why) => { if (done) return; done = true; clearTimeout(t); if (ok) res(); else { s.remove(); rej(new Error(why)); } };
    const t = setTimeout(() => end(!!window[globalName], 'No se pudo descargar ' + globalName + ' (internet lento o cortado)'), 20000);
    s.onload = () => end(!!window[globalName], 'No se cargó ' + globalName);
    s.onerror = () => end(!!window[globalName], 'No se pudo descargar ' + globalName + ' (¿hay internet?)');
    document.head.append(s);
  });
  const alt = src.replace('https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/');
  return one(src).catch(e => { if (window[globalName]) return; if (alt === src) throw e; return one(alt); });
}

/* ====== edición: trozos del clip, textos, encuadres por tramos y pistas ====== */
let segs = [];      // trozos del clip en el orden final: {id, s, e} en segundos del original
let texts = [];     // textos libres: {id, text, start, end, x, y, size, font, color, stroke, strokeC, shadow, bg, bgC, rot}
let zones = [];     // Reacción por tramos: {s, e, cr:{cam, content, camFx, fit, kind}} en segundos del original
const TRK0 = () => ({ text: { hide: false, lock: false }, title: { hide: false, lock: false }, caps: { hide: false, lock: false },
  video: { mute: false, lock: false }, audio: { mute: false, lock: false }, logo: { hide: false, lock: false } });
let trk = TRK0();
let mutes = [];      // palabras censuradas: [{s, e}] en segundos del original
let clipMeta = {};   // datos del agente: formato, motivo, imagen que falta, solo cámara…
let pseg = 0, nid = 1, fpsEst = 0;
const srcFpsV = () => Math.min(120, fpsEst || 30);
const newId = () => nid++;
const srcDur = () => vid.duration || 0;
function resetSegs() { segs = srcDur() ? [{ id: newId(), s: 0, e: srcDur() }] : []; pseg = 0; }
function totalDur() { return segs.length ? segs.reduce((a, g) => a + g.e - g.s, 0) : srcDur(); }
function segStart(i) { let T = 0; for (let k = 0; k < i && k < segs.length; k++) T += segs[k].e - segs[k].s; return T; }
// tiempo del vídeo final -> trozo y segundo del original
function locate(T) {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const d = segs[i].e - segs[i].s;
    if (T < acc + d - 1e-6 || i === segs.length - 1) return { i, t: Math.min(segs[i].e, segs[i].s + Math.max(0, T - acc)), T0: acc };
    acc += d;
  }
  return { i: 0, t: T, T0: 0 };
}
function curT() {
  if (!segs.length) return vid.currentTime || 0;
  const i = Math.min(pseg, segs.length - 1), g = segs[i];
  return segStart(i) + Math.min(g.e - g.s, Math.max(0, (vid.currentTime || 0) - g.s));
}
function seekOut(T) {
  if (!segs.length) { if (vid.duration) vid.currentTime = Math.max(0, Math.min(vid.duration - 0.01, T)); return; }
  T = Math.max(0, Math.min(totalDur() - 0.0005, T));
  const L = locate(T); pseg = L.i; vid.currentTime = Math.min(L.t, segs[L.i].e - 0.0005);
}
// ir a un segundo del original (p. ej. al pulsar un subtítulo)
function seekSrc(t) {
  if (!segs.length) { vid.currentTime = t; return; }
  let i = (segs[pseg] && t >= segs[pseg].s && t < segs[pseg].e) ? pseg : segs.findIndex(g => t >= g.s && t < g.e);
  if (i < 0) {   // está en una parte borrada: al trozo más cercano que viene después
    let bd = Infinity; i = 0;
    segs.forEach((g, k) => { const d = g.s >= t ? g.s - t : 1e6 + (t - g.e); if (d < bd) { bd = d; i = k; } });
    t = segs[i].s;
  }
  pseg = i; vid.currentTime = t;
}

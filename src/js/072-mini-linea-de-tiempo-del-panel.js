/* ---------- mini línea de tiempo del panel ----------
   Como la de CapCut y pintada entera en un lienzo, para que nada dé tirones:
   regla · pista de plantillas (el clip por partes) · pista de texto (título y subtítulos) · pista de vídeo (fotogramas + ondas).
   Los trozos se dividen, se recortan por los bordes, se arrastran para cambiarlos de sitio, se duplican y se borran;
   todo lo que cambia se desliza hasta su sitio. Mientras ajustas cualquier cosa, el reproductor va enseñando ese punto. */
let mtSig = '';   // otras partes lo vacían para pedir que se repinte
let mtWave = null, mtFr = null, mtWantFn = null, mtSeekBusy = false;
const MT = { blade: false, pps: 0, ppsT: 0, fit: true, sx: 0, sxT: null, anchor: null, max: 0, span: 0, vw: 0, dpr: 1, disp: new Map(), spawn: new Map(), ghosts: [], fx: [], sel: null, hover: null, drag: null, ptr: null,
  snap: true, snapL: null, snapAt: 0, bub: null, say: null, last: 0, now: 0, sig: '', ver: 0, drawn: 0, file: null, first: true, lastT: -1, fc: 0, fcAt: 0, blocks: [], bounds: [], caps: [], titleR: null, titleHint: null, subHint: null, tip: '', rm: false, inspAt: 0 };
const ML = { ruler: [0, 24], fmt: [29, 24], title: [58, 16], sub: [77, 22], vid: [105, 64], bar: [174, 6], H: 184, padL: 12, padR: 30, th: 44 };
const MT_FC = { podcast: '#FBBF24', reaccion: '#60A5FA', duo: '#F472B6', llamada: '#5865F2', horizontal: '#34D399', horizontal_cam: '#FB923C', dividida: '#A78BFA' };
const mtClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mtDirty = () => { MT.sig = ''; };
const mtSay = t => { MT.say = { text: t, at: performance.now() }; mtDirty(); };
// ondas del audio (100 por segundo), como la pista de CapCut
async function mtWaveLoad() {
  if (!file || (mtWave && mtWave.file === file) || file.size > 4e8) return; const f = file; mtWave = { file: f, p: null };
  try { const a = await decodeAudio16k(f), n = Math.floor(a.length / 160), p = new Float32Array(n); let mx = 1e-4; for (let i = 0; i < n; i++) { let m = 0; for (let j = i * 160; j < (i + 1) * 160; j++) { const v = Math.abs(a[j]); if (v > m) m = v; } p[i] = m; if (m > mx) mx = m; } for (let i = 0; i < n; i++) p[i] = Math.sqrt(p[i] / mx); if (mtWave.file === f) { mtWave.p = p; mtDirty(); } }
  catch (e) { console.warn('ondas', e); }
}
// fotogramas pequeños del clip para la pista de vídeo (primero uno de cada pocos, luego se rellena)
async function mtFramesLoad() {
  if (!file || (mtFr && mtFr.file === file)) return; const f = file, D = vid.duration || 0; if (!D || !vid.src) return;
  const n = Math.max(24, Math.min(240, Math.ceil(D * 3))); mtFr = { file: f, n, D, list: new Array(n).fill(null) };
  const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
  try { await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = rej; setTimeout(res, 4000); }); } catch { return; }
  const fw = 160, fh = Math.max(2, Math.round(fw * (tv.videoHeight || 9) / (tv.videoWidth || 16))), order = [], seen = new Set();
  for (const st of [16, 8, 4, 2, 1]) for (let i = 0; i < n; i += st) if (!seen.has(i)) { seen.add(i); order.push(i); }
  for (const i of order) {
    if (file !== f || !mtFr || mtFr.file !== f) break;
    if (ezFrames && ezFrames.file === f && ezFrames.list.filter(Boolean).length > n) break;   // ya los ha hecho la pantalla de recortar
    await tvSeek(tv, Math.min(D - 0.03, i * D / (n - 1)));
    try { const c = document.createElement('canvas'); c.width = fw; c.height = fh; c.getContext('2d').drawImage(tv, 0, 0, fw, fh); mtFr.list[i] = c; } catch {}
  }
  tv.removeAttribute('src'); tv.load();
}
function mtFrames() {
  const a = ezFrames && ezFrames.file === file ? ezFrames : null, b = mtFr && mtFr.file === file ? mtFr : null;
  if (!a) { if (!b) mtFramesLoad(); return b; }
  return a;
}
// el vídeo salta sin atascarse: solo se pide otro salto cuando ha terminado el anterior
function mtSeek(fn) {
  mtWantFn = fn; if (mtSeekBusy) return;
  const go = () => { const f = mtWantFn; mtWantFn = null; if (!f) { mtSeekBusy = false; return; } mtSeekBusy = true; try { f(); } catch {} const done = () => { clearTimeout(t); go(); }, t = setTimeout(done, 250); vid.addEventListener('seeked', done, { once: true }); };
  go();
}
const mtSeekOut = T => { MT.phHold = { T, at: performance.now() }; pxWantOut(T); mtSeek(() => seekOut(T)); };
// dónde está la línea blanca: lo que pediste aunque el vídeo aún esté saltando, y al reproducir avanza en cada fotograma de la pantalla
function mtPhSync() { const h = MT.phHold; if (h && (mtSeekBusy || performance.now() - h.at < 350) && Math.abs(curT() - h.T) > 1e-3) { try { seekOut(h.T); } catch {} } }
function mtPhNow() { const h = MT.phHold; return h && (mtSeekBusy || (MT.drag && MT.drag.type === 'seek') || performance.now() - h.at < 350) ? h.T : curT(); }
function mtPhStep(now) {
  const D = totalDur() || 0, ct = vid.currentTime, h = MT.phHold;
  if (h && (mtSeekBusy || (MT.drag && MT.drag.type === 'seek') || now - h.at < 350)) { MT.phD = h.T; MT.pm = null; return; }
  const T = curT();
  if (vid.paused || exporting) { MT.phD = T; MT.pm = null; return; }
  if (!MT.pm || MT.pm.ct !== ct) MT.pm = { ct, T, at: now };
  const est = Math.min(D, MT.pm.T + Math.min(0.25, (now - MT.pm.at) / 1000 * (vid.playbackRate || 1)));
  MT.phD = MT.phD == null || Math.abs(est - MT.phD) > 0.3 ? est : Math.max(MT.phD, est);
}
const mtSeekSrc = (k, t) => mtSeek(() => { pseg = k; vid.currentTime = t; });
function mtBlocks() {   // partes de plantilla en tiempo del vídeo final
  const out = [], sc = clipMeta.scenes; let acc = 0;
  const list = segs.length ? segs : [{ s: 0, e: vid.duration || 0 }];
  for (const g of list) {
    if (!sc || !sc.length) { const pv = out[out.length - 1]; if (pv) pv.T1 = acc + g.e - g.s; else out.push({ i: -1, f: curFmtOf(), T0: acc, T1: acc + g.e - g.s }); }
    else sc.forEach((x, i) => { const a = Math.max(x.s, g.s), b = Math.min(x.e, g.e); if (b - a < 0.02) return; const T0 = acc + a - g.s, pv = out[out.length - 1]; if (pv && pv.i === i && Math.abs(pv.T1 - T0) < 0.02) { pv.T1 = acc + b - g.s; pv.srcE = b; } else out.push({ i, f: x.ov ? x.f : curFmtOf(), T0, T1: acc + b - g.s, srcE: b }); });
    acc += g.e - g.s;
  }
  return out;
}
const mtFmtOf = f => { const e = EZ_FMTS.find(x => x[0] === f); return SC_FMT[f] || (e ? [e[1], e[2]] : ['▭', f || 'Horizontal']); };
const mtName = f => mtFmtOf(f)[1];
const mtSubsOn = () => !trk.caps.hide && !clipMeta.noSubs;
const mtTitleOn = () => !titleIsDefault() && !trk.title.hide;

/* ----- dónde va cada cosa ----- */
function mtFitPps() { return Math.max(1, (MT.vw - ML.padL - ML.padR) / Math.max(0.5, totalDur() || 1)); }
const mtMinPps = () => Math.max(0.5, (MT.vw - ML.padL - ML.padR) / Math.max(30, (totalDur() || 1) * 8));   // alejar del todo: el clip ocupa poco y queda hueco a la derecha, como en CapCut
const mtMaxPps = () => { const f = mtFitPps(); return Math.max(f * 1.02, Math.min(1200, Math.max(320, f * 4))); };
const mtX = t => ML.padL + t * MT.pps - MT.sx;            // segundos de la línea → x en pantalla
const mtTofX = vx => (vx - ML.padL + MT.sx) / MT.pps;       // x en pantalla → segundos de la línea
function mtXofSrc(k, t) { const g = segs[k], p = g && MT.disp.get(g.id); if (!g) return mtX(0); if (!p) return mtX(segStart(k) + t - g.s); return mtX(p.anc === 'e' ? p.t0 + p.d - (g.e - t) : p.t0 + (t - g.s)); }
function mtXofOut(T, end) {   // un instante del vídeo final → x (va con su trozo mientras se desliza)
  if (!segs.length) return mtX(T);
  if (end) { const L = locate(Math.max(0, T - 1e-4)); return mtXofSrc(L.i, Math.min(segs[L.i].e, L.t + 1e-4)); }
  const L = locate(T); return mtXofSrc(L.i, L.t);
}
function mtTargets() {   // sitio de cada trozo (en segundos), contando lo que se esté arrastrando
  const d = MT.drag, n = segs.length, order = segs.map((g, k) => k), T = new Array(n);
  if (d && d.type === 'move' && d.to != null && d.k < n) { order.splice(d.k, 1); order.splice(Math.min(d.to, order.length), 0, d.k); }
  let acc = 0; for (const k of order) { const len = segs[k].e - segs[k].s; T[k] = { t0: acc, d: len }; acc += len; }
  // borde izquierdo: el borde sigue al ratón y lo de detrás no se mueve; al soltar, todo se junta
  if (d && d.type === 'trim' && d.h === 's' && d.k < n) { const sh = Math.max(segs[d.k].s - d.s0, -d.T0); for (let k = 0; k < n; k++) T[k].t0 += k >= d.k ? sh : Math.min(0, sh); }
  return T;
}
function mtEase(dt) {
  if (MT.file !== file) { MT.file = file; MT.disp.clear(); MT.ghosts = []; MT.fx = []; MT.sel = null; MT.first = true; MT.fit = true; MT.sx = 0; MT.sxT = null; MT.anchor = null; MT.pps = 0; mtInspClose(); }
  const T = mtTargets(), d = MT.drag, k1 = MT.rm ? 1 : 1 - Math.exp(-dt / 75), k2 = MT.rm ? 1 : 1 - Math.exp(-dt / 120), eps = 0.6 / Math.max(1, MT.pps || 1);
  const rigid = d && d.type === 'trim'; let moving = false; const seen = new Set();
  segs.forEach((g, k) => {
    seen.add(g.id); let p = MT.disp.get(g.id);
    if (!p) { const sp = MT.spawn.get(g.id); p = sp ? { ...sp } : { t0: T[k].t0, d: T[k].d, a: MT.first ? 1 : 0, anc: 's' }; p.lift = 0; p.hv = 0; p.sl = 0; MT.disp.set(g.id, p); }
    p.g = g;
    const drg = d && d.type === 'move' && d.id === g.id;
    if (rigid) { p.t0 = T[k].t0; p.d = T[k].d; p.anc = 's'; }
    else {
      if (drg) p.t0 = d.dispT0; else if (Math.abs(T[k].t0 - p.t0) > eps) { p.t0 += (T[k].t0 - p.t0) * k1; moving = true; } else p.t0 = T[k].t0;
      if (Math.abs(T[k].d - p.d) > eps) { p.d += (T[k].d - p.d) * k1; moving = true; } else { p.d = T[k].d; p.anc = 's'; }
    }
    const tl = drg ? 1 : 0, ts = MT.sel && MT.sel.t === 'seg' && MT.sel.id === g.id ? 1 : 0, hv = MT.hover, thv = !d && hv && hv.k === k && (hv.t === 'seg' || hv.t === 'edge') ? 1 : 0;
    for (const [key, tv, kk] of [['a', 1, k2], ['lift', tl, k1], ['sl', ts, k1], ['hv', thv, k1]]) { if (Math.abs(tv - p[key]) > 0.01) { p[key] += (tv - p[key]) * kk; moving = true; } else p[key] = tv; }
  });
  MT.first = false; MT.spawn.clear();
  for (const [id, p] of MT.disp) if (!seen.has(id)) { MT.disp.delete(id); if (p.a > 0.05 && p.g) MT.ghosts.push({ ...p, lift: 0, sl: 0, hv: 0 }); }
  MT.ghosts = MT.ghosts.filter(q => { q.a -= dt / (MT.rm ? 1 : 170); return q.a > 0; }); if (MT.ghosts.length) moving = true;
  MT.fx = MT.fx.filter(f => MT.now - f.at < 420); if (MT.fx.length) moving = true;
  let span = totalDur() || 0; for (const p of MT.disp.values()) span = Math.max(span, p.t0 + p.d); MT.span = span;
  return moving;
}
function mtViewStep(dt) {   // zoom y desplazamiento (suaves)
  const fit = mtFitPps(), d = MT.drag, kz = MT.rm ? 1 : 1 - Math.exp(-dt / 60), hold = d && (d.type === 'trim' || d.type === 'move'); let moving = false;
  if (!MT.pps) MT.pps = MT.ppsT = fit;
  if (!hold) { if (MT.fit) MT.ppsT = fit; MT.ppsT = mtClamp(MT.ppsT, Math.min(fit, mtMinPps()), mtMaxPps()); }
  if (Math.abs(MT.ppsT - MT.pps) > MT.pps * 0.002) { MT.pps += (MT.ppsT - MT.pps) * kz; moving = true; } else MT.pps = MT.ppsT;
  if (MT.anchor) { MT.sx = ML.padL + MT.anchor.t * MT.pps - MT.anchor.vx; if (MT.pps === MT.ppsT) MT.anchor = null; }
  let max = Math.max(0, ML.padL + MT.span * MT.pps + ML.padR - MT.vw); if (max < 1) max = 0;
  // al arrastrar cerca de un borde, la línea se va moviendo sola
  if (d && MT.ptr && max > 0 && ['seek', 'trim', 'move', 'bound', 'cap'].includes(d.type)) { const e = 36, x = MT.ptr.x; const v = x < e ? x - e : x > MT.vw - e ? x - (MT.vw - e) : 0; if (v) { const o = MT.sx; MT.sx = mtClamp(MT.sx + mtClamp(v, -60, 60) * dt * 0.02, 0, max); if (MT.sx !== o) { MT.sxT = null; try { mtDragMove(); } catch {} moving = true; } } }
  // la vista sigue a la línea blanca cuando se sale
  const T = MT.phD == null ? curT() : MT.phD;
  if (!d && !MT.anchor && max > 0 && Math.abs(T - MT.lastT) > 1e-3) { const px = mtXofOut(T); if (px > MT.vw - 36 || px < ML.padL - 2) MT.sxT = MT.sx + px - (vid.paused ? MT.vw / 2 : 70); }
  MT.lastT = T;
  if (MT.sxT != null) { MT.sxT = mtClamp(MT.sxT, 0, max); if (Math.abs(MT.sxT - MT.sx) > 0.5) { MT.sx += (MT.sxT - MT.sx) * kz; moving = true; } else { MT.sx = MT.sxT; MT.sxT = null; } }
  MT.sx = mtClamp(MT.sx, 0, max); MT.max = max;
  return moving;
}
function mtZoomTo(pps, vx) {
  pps = mtClamp(pps, Math.min(mtFitPps(), mtMinPps()), mtMaxPps()); MT.fit = false; MT.ppsT = pps;
  if (vx == null) { const px = mtXofOut(curT()); vx = px > 0 && px < MT.vw ? px : MT.vw / 2; }
  MT.anchor = { t: mtTofX(vx), vx }; MT.sxT = null; mtDirty();
}
const mtFit = () => { MT.fit = true; MT.anchor = null; MT.ppsT = mtFitPps(); MT.sxT = 0; mtDirty(); };

/* ----- pintar ----- */
function mtRR(x, X, Y, w, h, r) { x.beginPath(); if (w <= 0 || h <= 0) return; const m = Math.min(w, h) / 2; x.roundRect(X, Y, w, h, Array.isArray(r) ? r.map(v => Math.min(v, m)) : Math.min(r, m)); }
function mtPill(x, cx, y, text, o = {}) {   // etiqueta flotante
  x.save(); x.font = o.font || '600 11px ui-monospace,SFMono-Regular,Menlo,monospace'; const w = x.measureText(text).width + 14, h = o.h || 18, X = mtClamp(cx - w / 2, 2, MT.vw - w - 2);
  x.globalAlpha = o.a == null ? 1 : o.a; mtRR(x, X, y, w, h, h / 2); x.fillStyle = o.bg || '#000'; x.fill(); if (o.line) { x.strokeStyle = o.line; x.lineWidth = 1; x.stroke(); }
  x.fillStyle = o.fg || '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(text, X + 7, y + h / 2 + 0.5); x.restore();
}
function mtLabel(x, text, X0, X1, y, h, color, font) {   // texto dentro de un bloque: se queda a la vista aunque el bloque empiece fuera
  const a = Math.max(X0, 0) + 7, b = Math.min(X1, MT.vw) - 5; if (b - a < 14) return;
  x.save(); x.beginPath(); x.rect(a - 2, y, b - a + 2, h); x.clip(); x.font = font; x.fillStyle = color; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(text, a, y + h / 2 + 0.5); x.restore();
}
function mtDrawRuler(x) {
  const pps = MT.pps, VW = MT.vw, steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600], step = steps.find(v => v * pps >= 64) || 600;
  const div = { 0.2: 4, 2: 4, 15: 3, 30: 6, 60: 6, 120: 4 }[step] || 5, minor = step / div, showMinor = minor * pps >= 5;
  const i0 = Math.max(0, Math.floor(mtTofX(0) / minor)), i1 = Math.ceil(mtTofX(VW) / minor), endX = mtX(totalDur() || 0);
  x.font = '600 10px ui-monospace,SFMono-Regular,Menlo,monospace'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  for (let i = i0; i <= i1; i++) {
    const t = i * minor, px = Math.round(mtX(t)) + 0.5, major = i % div === 0, dim = px > endX + 1;
    if (!major && !showMinor) continue;
    x.fillStyle = major ? (dim ? '#3F3F46' : '#71717A') : (dim ? '#27272A' : '#3F3F46'); x.fillRect(px - 0.5, major ? 13 : 18, 1, major ? 10 : 5);
    if (major) { const m = Math.floor(t / 60 + 1e-9), s = t - m * 60; x.fillStyle = dim ? '#52525B' : '#A1A1AA'; x.fillText(m + ':' + (step < 1 ? s.toFixed(1).padStart(4, '0') : String(Math.round(s)).padStart(2, '0')), px + 4, 11); }
  }
}
function mtDrawSeg(x, g, p, k) {
  const pps = MT.pps, VW = MT.vw, [vy, vh] = ML.vid, lift = p.lift || 0, d = MT.drag;
  const x0 = mtX(p.t0), x1 = mtX(p.t0 + p.d), y = vy - lift * 3;
  let il = 1, ir = 1; for (const f of MT.fx) if (f.type === 'cut') { const q = 1 - Math.min(1, (MT.now - f.at) / 320), e = 5 * q * q; if (f.l === g.id) ir += e; if (f.r === g.id) il += e; }
  const X0 = x0 + il, X1 = x1 - ir, w = X1 - X0; if (w < 0.5 || X1 < -2 || X0 > VW + 2) return;
  const a = Math.max(X0, -2), b = Math.min(X1, VW + 2), alpha = mtClamp(p.a, 0, 1);
  x.save(); x.globalAlpha = alpha;
  if (lift > 0.01) { x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 18 * lift; x.shadowOffsetY = 7 * lift; }
  mtRR(x, X0, y, w, vh, 7); x.fillStyle = '#1F1F23'; x.fill(); x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; x.clip();
  const srcAt = px => p.anc === 'e' ? g.e - (x1 - px) / pps : g.s + (px - x0) / pps, F = mtFrames(), th = ML.th;
  if (F) {   // fotogramas: cada uno pegado a su segundo del vídeo, así no se estiran al recortar
    const td = Math.pow(2, Math.round(Math.log2(th * 16 / 9 / pps))), tw = td * pps, tA = srcAt(a), tB = srcAt(b);
    for (let j = Math.floor(tA / td); j * td < tB; j++) {
      const px = a + (j * td - tA) * pps, tm = mtClamp((j + 0.5) * td, 0, F.D); let i = mtClamp(Math.round(tm / F.D * (F.n - 1)), 0, F.n - 1), c = F.list[i];
      for (let q = 1; !c && q < 16; q++) c = F.list[i - q] || F.list[i + q]; if (!c) continue;
      const sc = Math.max(tw / c.width, th / c.height), sw = tw / sc, sh = th / sc; x.drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, px, y, tw + 0.6, th);
    }
  }
  // ondas del audio
  const P = mtWave && mtWave.file === file && mtWave.p, wy = y + th, wh = vh - th; x.fillStyle = '#0B2E24'; x.fillRect(a, wy, b - a, wh);
  if (P) { x.fillStyle = '#34D399'; const mid = wy + wh / 2, amp = wh / 2 - 1.5, stp = 2, ref = p.anc === 'e' ? x1 : x0;
    for (let px = ref + Math.floor((a - ref) / stp) * stp; px < b; px += stp) { const i0 = Math.max(0, Math.floor(srcAt(px) * 100)), i1 = Math.min(P.length - 1, Math.floor(srcAt(px + stp) * 100)), st = Math.max(1, Math.floor((i1 - i0) / 12)); let v = 0; for (let i = i0; i <= i1; i += st) if (P[i] > v) v = P[i]; const hh = Math.max(0.6, v * amp); x.fillRect(px, mid - hh, stp - 0.7, hh * 2); } }
  else { x.fillStyle = '#14532D'; x.fillRect(a, wy + wh / 2 - 0.5, b - a, 1); }
  if (p.hv > 0.01) { x.fillStyle = `rgba(255,255,255,${0.07 * p.hv})`; x.fillRect(a, y, b - a, vh); }
  x.restore();
  x.save(); x.globalAlpha = alpha;
  mtRR(x, X0 + 0.5, y + 0.5, w - 1, vh - 1, 7); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1; x.stroke();
  const act = d && d.type === 'trim' && d.id === g.id ? d.h : null, ha = Math.max(p.sl, p.hv * 0.6, act ? 1 : 0), hw = Math.min(9, w / 3);
  if (p.sl > 0.01) { x.globalAlpha = alpha * p.sl; mtRR(x, X0 + 1, y + 1, w - 2, vh - 2, 6); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); }
  if (ha > 0.01 && hw > 2) {   // asas para recortar
    for (const side of ['s', 'e']) {
      const hx = side === 's' ? X0 : X1 - hw, on = act === side || (!d && MT.hover && MT.hover.t === 'edge' && MT.hover.k === k && MT.hover.h === side);
      x.globalAlpha = alpha * (on ? 1 : ha); if (on) { x.shadowColor = '#22D3EE'; x.shadowBlur = 10; }
      mtRR(x, hx, y, hw, vh, side === 's' ? [7, 0, 0, 7] : [0, 7, 7, 0]); x.fillStyle = '#fff'; x.fill(); x.shadowBlur = 0; x.shadowColor = 'transparent';
      x.fillStyle = '#18181B'; mtRR(x, hx + hw / 2 - 1, y + vh / 2 - 8, 2, 16, 1); x.fill();
    }
  }
  x.globalAlpha = alpha;
  if (w > 62) { const txt = (g.e - g.s).toFixed(1).replace('.', ',') + ' s', lx = Math.max(X0, 0) + 5 + (ha > 0.3 ? hw : 0); if (lx + 46 < X1) { x.font = '600 10px system-ui,sans-serif'; const tw2 = x.measureText(txt).width; mtRR(x, lx, y + 4, tw2 + 8, 15, 4); x.fillStyle = 'rgba(0,0,0,.6)'; x.fill(); x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillText(txt, lx + 4, y + 12); } }
  x.restore();
}
function mtDraw() {
  const cv = $('mtCv'), x = cv.getContext('2d'), VW = MT.vw, D = totalDur() || 0, d = MT.drag, hv = d ? null : MT.hover, now = MT.now;
  x.setTransform(MT.dpr, 0, 0, MT.dpr, 0, 0); x.clearRect(0, 0, VW, ML.H);
  const cx0 = Math.max(0, mtX(0)), cx1 = Math.min(VW, mtX(MT.span));
  for (const l of ['fmt', 'title', 'sub', 'vid']) { x.fillStyle = 'rgba(255,255,255,.028)'; mtRR(x, cx0, ML[l][0], Math.max(0, cx1 - cx0), ML[l][1], 6); x.fill(); }
  mtDrawRuler(x);
  // --- plantillas ---
  { const [y, h] = ML.fmt, bl = mtBlocks(); MT.blocks = []; MT.bounds = [];
    bl.forEach((b, n) => {
      const x0 = mtXofOut(b.T0), x1 = mtXofOut(b.T1, true), o = { n, i: b.i, f: b.f, x0, x1, T0: b.T0, T1: b.T1 }; MT.blocks.push(o);
      const nx = bl[n + 1];
      if (nx && nx.i !== b.i && b.i >= 0 && Math.abs(nx.T0 - b.T1) < 0.03 && clipMeta.scenes && clipMeta.scenes[b.i] && Math.abs(clipMeta.scenes[b.i].e - b.srcE) < 0.05) MT.bounds.push({ i: b.i, x: x1, T: b.T1 });
      if (x1 < -4 || x0 > VW + 4 || x1 - x0 < 1) return;
      const sel = MT.sel && MT.sel.t === 'part' && MT.sel.i === b.i, hot = hv && hv.t === 'part' && hv.n === n, col = MT_FC[b.f] || '#A78BFA';
      x.save(); mtRR(x, x0 + 1, y, x1 - x0 - 2, h, 6); x.fillStyle = col; x.globalAlpha = hot || sel ? 1 : 0.88; x.fill(); x.globalAlpha = 1;
      if (hot) { x.fillStyle = 'rgba(255,255,255,.22)'; x.fill(); }
      if (sel) { mtRR(x, x0 + 2, y + 1, x1 - x0 - 4, h - 2, 5); x.strokeStyle = '#fff'; x.lineWidth = 2; x.shadowColor = 'rgba(255,255,255,.7)'; x.shadowBlur = 8; x.stroke(); }
      x.restore();
      const [ic, nm] = mtFmtOf(b.f); mtLabel(x, ic + ' ' + nm, x0 + 1, x1 - 1, y, h, '#0B0B0D', '700 11px system-ui,sans-serif');
    });
    for (const b of MT.bounds) {   // límite entre dos partes: se arrastra
      const on = (d && d.type === 'bound' && d.i === b.i), hot = hv && hv.t === 'bound' && hv.i === b.i, w = on || hot ? 8 : 5;
      x.save(); if (on) { x.shadowColor = '#FDE047'; x.shadowBlur = 10; }
      mtRR(x, b.x - w / 2, y - 3, w, h + 6, w / 2); x.fillStyle = on ? '#FDE047' : '#fff'; x.fill(); x.shadowBlur = 0; x.strokeStyle = '#121214'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = '#18181B'; x.fillRect(b.x - 0.5, y + 5, 1, h - 10); x.restore();
    }
  }
  // --- título ---
  { const [y, h] = ML.title; MT.titleR = MT.titleHint = null;
    if (mtTitleOn()) { const x0 = mtX(0), x1 = mtX(MT.span), hot = hv && hv.t === 'title'; MT.titleR = [x0, x1]; mtRR(x, x0 + 1, y, x1 - x0 - 2, h, 4); x.fillStyle = hot ? '#8B5CF6' : '#7C3AED'; x.fill(); mtLabel(x, 'T  ' + $('title').value.replace(/\s+/g, ' ').trim(), x0, x1, y, h, '#fff', '600 10px system-ui,sans-serif'); }
    else { const hx = Math.max(mtX(0), 0) + 2, hot = hv && hv.t === 'titleadd'; MT.titleHint = [hx, hx + 74]; mtRR(x, hx, y, 74, h, 4); x.fillStyle = hot ? 'rgba(139,92,246,.35)' : 'rgba(139,92,246,.16)'; x.fill(); mtLabel(x, '＋ Título', hx - 2, hx + 78, y, h, '#C4B5FD', '600 10px system-ui,sans-serif'); }
  }
  // --- subtítulos ---
  { const [y, h] = ML.sub; MT.caps = []; MT.subHint = null;
    if (mtSubsOn() && captions.length) {
      segs.forEach((g, k) => { for (let i = 0; i < captions.length; i++) { const c = captions[i]; if (c.end <= g.s || c.start >= g.e) continue; const a = Math.max(c.start, g.s), b = Math.min(c.end, g.e); if (b - a < 0.01) continue; MT.caps.push({ i, k, x0: mtXofSrc(k, a), x1: mtXofSrc(k, b), first: a === c.start, last: b === c.end }); } });
      x.font = '600 10.5px system-ui,sans-serif';
      for (const q of MT.caps) {
        if (q.x1 < -2 || q.x0 > VW + 2) continue; const c = captions[q.i], sel = MT.sel && MT.sel.t === 'cap' && MT.sel.i === q.i, hot = hv && hv.t === 'cap' && hv.i === q.i, w = Math.max(2, q.x1 - q.x0 - 1.5);
        mtRR(x, q.x0 + 0.75, y, w, h, 4); x.fillStyle = sel ? '#F59E0B' : hot ? '#EA8A0C' : '#C2680A'; x.fill();
        if (sel) { mtRR(x, q.x0 + 1.75, y + 1, w - 2, h - 2, 3); x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); }
        if ((sel || hot) && w > 22) { x.fillStyle = 'rgba(255,255,255,.9)'; if (q.first) x.fillRect(q.x0 + 3.5, y + 6, 1.5, h - 12); if (q.last) x.fillRect(q.x1 - 5.5, y + 6, 1.5, h - 12); }
        if (w > 20) mtLabel(x, (c.words || []).map(w2 => (w2.text || '').trim()).join(' ').trim() || c.text || '', q.x0 + (sel || hot ? 3 : 0), q.x1 - (sel || hot ? 3 : 0), y, h, '#fff', '600 10.5px system-ui,sans-serif');
      }
    } else { const hx = Math.max(mtX(0), 0) + 2, hot = hv && hv.t === 'subadd'; MT.subHint = [hx, hx + 98]; mtRR(x, hx, y + 2, 98, h - 4, 4); x.fillStyle = hot ? 'rgba(217,119,6,.4)' : 'rgba(217,119,6,.18)'; x.fill(); mtLabel(x, '＋ Subtítulos', hx - 2, hx + 102, y + 2, h - 4, '#FCD34D', '600 10px system-ui,sans-serif'); }
  }
  // --- vídeo ---
  for (const q of MT.ghosts) if (q.g) mtDrawSeg(x, q.g, q, -1);
  let lifted = null; segs.forEach((g, k) => { const p = MT.disp.get(g.id); if (!p) return; if (p.lift > 0.02) { lifted = [g, p, k]; return; } mtDrawSeg(x, g, p, k); });
  if (lifted) mtDrawSeg(x, ...lifted);
  const bot = ML.vid[0] + ML.vid[1] + 2;
  // destello del corte
  for (const f of MT.fx) { const q = 1 - Math.min(1, (now - f.at) / 380); let px; if (f.type === 'cut') { const k = segs.findIndex(g => g.id === f.r); if (k < 0) continue; px = mtXofSrc(k, segs[k].s); } else if (f.type === 'flash') px = mtXofOut(f.T); else continue; { x.save(); x.globalAlpha = q; x.strokeStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 14 * q; x.lineWidth = 2; x.beginPath(); x.moveTo(px, ML.fmt[0] - 2); x.lineTo(px, bot); x.stroke(); x.restore(); } }
  // línea del imán
  if (MT.snapL && (d || now - MT.snapAt < 260)) { const s = MT.snapL, px = s.src != null ? mtXofSrc(s.k, s.src) : mtXofOut(s.out, s.end), q = d ? 1 : 1 - (now - MT.snapAt) / 260, pulse = 1 + Math.max(0, 1 - (now - MT.snapAt) / 180) * 1.5;
    x.save(); x.globalAlpha = q; x.strokeStyle = '#FDE047'; x.shadowColor = '#FDE047'; x.shadowBlur = 8; x.lineWidth = 1.5 * pulse; x.beginPath(); x.moveTo(px, 14); x.lineTo(px, bot); x.stroke(); x.restore(); }
  // modo cuchilla: línea roja donde va a cortar
  if (MT.blade && !d && MT.ptr && MT.hover && (MT.hover.t === 'seg' || MT.hover.t === 'edge')) { const px = Math.round(MT.ptr.x) + 0.5, vy0 = ML.vid[0]; x.save(); x.strokeStyle = '#F43F5E'; x.lineWidth = 2; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(px, vy0 - 4); x.lineTo(px, vy0 + ML.vid[1] + 4); x.stroke(); x.restore(); mtPill(x, px, vy0 - 21, '✂ ' + fmtS(mtTofX(px)), { bg: '#F43F5E', h: 17 }); }
  // línea fantasma bajo el ratón
  else if (!d && MT.ptr && MT.ptr.y < ML.bar[0] - 4 && MT.hover && MT.hover.t !== 'bar') { const px = MT.ptr.x, T = mtTofX(px); if (T >= 0 && T <= MT.span) { x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(Math.round(px) - 0.5, 14, 1, bot - 14); if (Math.abs(px - mtXofOut(curT())) > 30) mtPill(x, px, 0, fmtS(T), { bg: '#27272A', fg: '#D4D4D8', h: 15, font: '600 10px ui-monospace,SFMono-Regular,Menlo,monospace' }); } }
  // línea blanca (por dónde va el vídeo)
  { const T = MT.phD == null ? curT() : MT.phD, sn = MT.phSnap && d && d.type === 'seek' ? MT.phSnap : null, px = Math.round((T >= D - 1e-3 && D ? mtXofOut(D, true) : mtXofOut(T)) * 2) / 2;
    if (px > -8 && px < VW + 8) { const col = sn ? '#FDE047' : '#fff', pop = sn ? 1 + 0.4 * Math.max(0, 1 - (now - sn.at) / 220) : 1;   // al pegarse a un corte: se pone amarilla y da un pequeño salto
      x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(px - 2, 12, 4, bot - 12); x.fillStyle = col; x.fillRect(px - 1, 10, 2, bot - 10);
      x.save(); x.translate(px, 1); x.scale(pop, pop); x.beginPath(); x.moveTo(-6, 2); x.arcTo(-6, 0, -4, 0, 2); x.lineTo(4, 0); x.arcTo(6, 0, 6, 2, 2); x.lineTo(6, 9); x.lineTo(0, 15); x.lineTo(-6, 9); x.closePath(); x.fillStyle = col; if (sn) { x.shadowColor = '#FDE047'; x.shadowBlur = 10; } x.fill(); x.shadowBlur = 0; x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1; x.stroke(); x.restore(); }
  }
  if (MT.bub && d) mtPill(x, MT.bub.x, MT.bub.y == null ? 2 : MT.bub.y, MT.bub.text, { bg: '#000', line: 'rgba(255,255,255,.35)', h: 19 });
  if (MT.say) { const q = (now - MT.say.at) / 1900; if (q >= 1) MT.say = null; else mtPill(x, VW / 2, ML.vid[0] + 20, MT.say.text, { bg: 'rgba(0,0,0,.88)', line: 'rgba(255,255,255,.25)', h: 26, font: '600 12px system-ui,sans-serif', a: q < 0.08 ? q / 0.08 : q > 0.8 ? (1 - q) / 0.2 : 1 }); }
  // barra para moverse por la línea
  if (MT.max > 0) { const [y, h] = ML.bar, tw = Math.max(40, VW * VW / (VW + MT.max)), tx = MT.sx / MT.max * (VW - tw), on = (d && d.type === 'scroll') || (hv && hv.t === 'bar'); x.fillStyle = 'rgba(255,255,255,.06)'; mtRR(x, 0, y, VW, h, 3); x.fill(); x.fillStyle = on ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.28)'; mtRR(x, tx, y, tw, h, 3); x.fill(); MT.thumb = [tx, tw]; }
}
function mtRender() {
  const cv = $('mtCv'); if (!cv || !loaded) return;
  const view = cv.parentNode, w = view.clientWidth, dpr = Math.min(2, devicePixelRatio || 1); if (!w) return;
  const now = performance.now(), dt = mtClamp(now - (MT.last || now), 0, 50); MT.last = now; MT.now = now;
  if (w !== MT.vw || dpr !== MT.dpr) { MT.vw = w; MT.dpr = dpr; cv.width = Math.round(w * dpr); cv.height = Math.round(ML.H * dpr); mtDirty(); }
  if (mtSig === '') { mtSig = '1'; MT.ver++; }
  mtWaveLoad(); mtPhStep(now);
  let moving = mtEase(dt); if (mtViewStep(dt)) moving = true;
  if (MT.say || (MT.snapL && now - MT.snapAt < 300) || (MT.phSnap && now - MT.phSnap.at < 260)) moving = true;
  if (now - MT.fcAt > 300) { MT.fcAt = now; const F = mtFrames(); MT.fc = F ? F.list.reduce((n, c) => n + (c ? 1 : 0), 0) : 0; }
  if (mtInspI != null) mtInspSync();
  const T = MT.phD == null ? curT() : MT.phD, D = totalDur() || 0, sc = clipMeta.scenes, cl = captions.length, hv = MT.hover, s = MT.sel;
  const sig = [MT.pps.toFixed(3), MT.sx.toFixed(1), T.toFixed(3), MT.ver, MT.fc, mtWave && mtWave.p ? 1 : 0, segs.map(g => g.id + ':' + g.s.toFixed(3) + ':' + g.e.toFixed(3)).join(), sc ? sc.map(q => q.s.toFixed(2) + q.f + (q.ov ? 1 : 0)).join() : curFmtOf(), cl, cl ? captions[0].start + captions[cl - 1].end : 0, mtSubsOn(), mtTitleOn() ? $('title').value : '', hv ? [hv.t, hv.k, hv.i, hv.n, hv.h, hv.mode].join() : '', MT.ptr ? Math.round(MT.ptr.x) + ',' + (MT.ptr.y < ML.bar[0] - 4) : '', s ? s.t + (s.id ?? s.i) : '', MT.drag ? MT.drag.type : ''].join('|');
  if (moving || sig !== MT.sig || now - MT.drawn > 500) { MT.sig = sig; MT.drawn = now; try { mtDraw(); } catch (e) { if (!mtDraw.w) { mtDraw.w = 1; console.warn('línea de tiempo', e); } } }
  // barra de botones
  const tt = `<b>${fmtS(T)}</b><i> / ${fmtS(D)}</i>`, ct = $('ccTime'); if (ct.dataset.v !== tt) { ct.dataset.v = tt; ct.innerHTML = tt; }
  $('tlUndo').disabled = hi <= 0; $('tlRedo').disabled = hi >= hist.length - 1; $('tlSnap').classList.toggle('on', MT.snap);
  const zr = $('mtZr'); if (document.activeElement !== zr) { const f = Math.min(mtFitPps(), mtMinPps()), v = Math.round(100 * Math.log(Math.max(1, MT.ppsT / f)) / Math.log(mtMaxPps() / f)); if (+zr.value !== v) zr.value = v; }
  $('tlBlade').classList.toggle('on', MT.blade);
}

/* ----- qué hay bajo el ratón ----- */
function mtPt(ev) { const r = $('mtCv').getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function mtHit(vx, vy) {
  const inL = (l, m = 2) => vy >= ML[l][0] - m && vy < ML[l][0] + ML[l][1] + m;
  if (MT.max > 0 && vy >= ML.bar[0] - 3) return { t: 'bar' };
  if (vy < ML.fmt[0] - 3) return { t: 'ruler' };
  if (vy >= ML.vid[0] - 2) {
    let best = null, body = null;
    segs.forEach((g, k) => { const p = MT.disp.get(g.id); if (!p) return; const x0 = mtX(p.t0), x1 = mtX(p.t0 + p.d), w = x1 - x0, ez = Math.min(10, w / 3);
      if (vx >= x0 && vx < x1) body = { t: 'seg', k, id: g.id };
      const tryE = (h, ex, inside) => { const dist = Math.abs(vx - ex) + (inside ? 0 : 50); if (!best || dist < best.dist) best = { t: 'edge', k, id: g.id, h, dist }; };
      if (vx >= x0 - 3 && vx <= x0 + ez) tryE('s', x0, vx >= x0); if (vx >= x1 - ez && vx <= x1 + 3) tryE('e', x1, vx <= x1); });
    return best || body || { t: 'empty', lane: 'vid' };
  }
  if (inL('fmt', 3)) { for (const b of MT.bounds) if (Math.abs(vx - b.x) <= 6) return { t: 'bound', i: b.i }; for (const b of MT.blocks) if (vx >= b.x0 && vx < b.x1) return { t: 'part', n: b.n, i: b.i }; return { t: 'empty', lane: 'fmt' }; }
  if (inL('title', 1)) { if (MT.titleR && vx >= MT.titleR[0] && vx < MT.titleR[1]) return { t: 'title' }; if (MT.titleHint && vx >= MT.titleHint[0] && vx < MT.titleHint[1]) return { t: 'titleadd' }; return { t: 'empty', lane: 'title' }; }
  if (inL('sub', 1)) {
    if (MT.subHint) return vx >= MT.subHint[0] && vx < MT.subHint[1] ? { t: 'subadd' } : { t: 'empty', lane: 'sub' };
    for (const q of MT.caps) if (vx >= q.x0 && vx < q.x1) { const w = q.x1 - q.x0, ez = Math.min(6, w / 3); return { t: 'cap', i: q.i, k: q.k, mode: q.first && vx <= q.x0 + ez ? 's' : q.last && vx >= q.x1 - ez ? 'e' : 'move' }; }
    return { t: 'empty', lane: 'sub' };
  }
  return { t: 'empty' };
}
const MT_TIP = { bound: 'Arrastra para mover el cambio de plantilla', part: 'Clic: cambiar o ajustar la plantilla de esta parte · arrastra para moverla · Ctrl+B: partirla en la línea', title: 'Clic para cambiar el título', titleadd: 'Poner un título', subadd: 'Poner subtítulos (la IA los escribe)', cap: 'Arrastra para moverlo · los bordes cambian cuánto dura · doble clic para cambiar el texto' };
function mtBladeSet(on) { MT.blade = !!on; mtSay(on ? '✂️ Modo cuchilla: cada clic en el vídeo lo corta (A para volver)' : 'Modo normal'); mtHoverSet(MT.hover); mtDirty(); }
function mtHoverSet(h) {
  MT.hover = h; const cv = $('mtCv'); let cur = 'default', tip = '';
  if (MT.blade && h && (h.t === 'seg' || h.t === 'edge')) { if (cv.style.cursor !== 'crosshair') cv.style.cursor = 'crosshair'; if (MT.tip !== 'c') { MT.tip = 'c'; cv.title = 'Clic para cortar aquí'; } return; }
  if (h) { tip = MT_TIP[h.t] || '';
    cur = h.t === 'edge' || h.t === 'bound' || (h.t === 'cap' && h.mode !== 'move') ? 'ew-resize' : h.t === 'seg' ? (segs.length > 1 ? 'grab' : 'pointer') : h.t === 'part' && clipMeta.scenes && clipMeta.scenes.length > 1 ? 'grab' : ['part', 'title', 'titleadd', 'subadd', 'cap', 'ruler'].includes(h.t) ? 'pointer' : 'default'; }
  if (cv.style.cursor !== cur) cv.style.cursor = cur; if (MT.tip !== tip) { MT.tip = tip; cv.title = tip; }
}

/* ----- imán ----- */
function mtSnapSet(L) { const was = MT.snapL; MT.snapL = L; if (L && (!was || was.out !== L.out || was.src !== L.src)) MT.snapAt = performance.now(); if (!L && was) MT.snapAt = performance.now() - 1000; }
function mtSnapOut(T, kinds, skipCap) {   // pega T (tiempo del vídeo final) a un corte, un cambio de plantilla, un subtítulo o la línea blanca
  if (!MT.snap) { mtSnapSet(null); return T; } let best = null, bd = 7 / MT.pps; const tryT = (c, end) => { const dd = Math.abs(c - T); if (dd < bd) { bd = dd; best = { out: c, end }; } };
  if (kinds.includes('cuts')) { let acc = 0; tryT(0); for (const g of segs) { acc += g.e - g.s; tryT(acc, true); } }
  if (kinds.includes('parts')) for (const b of MT.bounds) tryT(b.T, true);
  if (kinds.includes('caps')) for (const q of MT.caps) { if (q.i === skipCap) continue; const c = captions[q.i], g = segs[q.k]; if (!c || !g) continue; const T0 = segStart(q.k); if (q.first) tryT(T0 + c.start - g.s); if (q.last) tryT(T0 + c.end - g.s, true); }
  if (kinds.includes('ph')) tryT(curT());
  mtSnapSet(best); return best ? best.out : T;
}
function mtSnapSrc(k, t, d, more, skipCap) {   // lo mismo, en segundos del vídeo original (para recortar)
  if (!MT.snap) { mtSnapSet(null); return t; } let best = null, bd = 7 / MT.pps; const tryT = c => { if (c == null) return; const dd = Math.abs(c - t); if (dd < bd) { bd = dd; best = c; } };
  tryT(d.phSrc); for (const q of clipMeta.scenes || []) { tryT(q.s); tryT(q.e); }
  if (mtSubsOn()) captions.forEach((c, i) => { if (i === skipCap) return; tryT(c.start); tryT(c.end); });
  for (const c of more || []) tryT(c);
  mtSnapSet(best != null ? { k, src: best } : null); return best != null ? best : t;
}

/* ----- lo que se puede hacer ----- */
const mtSelSeg = () => MT.sel && MT.sel.t === 'seg' ? segs.findIndex(g => g.id === MT.sel.id) : -1;
function mtCut() {   // partir el trozo en la línea blanca (las dos mitades siguen con su plantilla)
  mtPhSync();
  if (!loaded || !segs.length || exporting) return; const L = locate(curT()), g = segs[L.i];
  if (L.t - g.s < 0.1 || g.e - L.t < 0.1) { mtSay('La línea está pegada al borde de un trozo: muévela un poco'); return; }
  const a = { id: newId(), s: g.s, e: L.t }, b = { id: newId(), s: L.t, e: g.e }, p = MT.disp.get(g.id);
  if (p) { MT.disp.delete(g.id); MT.spawn.set(a.id, { t0: p.t0, d: a.e - a.s, a: 1, anc: 's' }); MT.spawn.set(b.id, { t0: p.t0 + a.e - a.s, d: b.e - b.s, a: 1, anc: 's' }); }
  segs.splice(L.i, 1, a, b); pseg = L.i + 1; MT.sel = { t: 'seg', id: b.id }; MT.fx.push({ type: 'cut', l: a.id, r: b.id, at: performance.now() }); mtInspClose(); pushHistory(); mtDirty();
}
function mtTrimSide(side) {   // Q: quitar lo de antes de la línea · W: quitar lo de después (solo en el trozo donde está)
  mtPhSync();
  if (!loaded || !segs.length || exporting) return; const L = locate(curT()), g = segs[L.i];
  if (side === 's') { if (L.t - g.s < 0.05) { mtSay('En este trozo no hay nada antes de la línea'); return; } if (g.e - L.t < 0.2) { mtSay('Quedaría vacío: mueve la línea'); return; } const p = MT.disp.get(g.id); if (p) p.anc = 'e'; g.s = L.t; pseg = L.i; }
  else { if (g.e - L.t < 0.05) { mtSay('En este trozo no hay nada después de la línea'); return; } if (L.t - g.s < 0.2) { mtSay('Quedaría vacío: mueve la línea'); return; } g.e = L.t; pseg = L.i; mtSeek(() => { vid.currentTime = Math.max(g.s, g.e - 0.03); }); }
  MT.sel = { t: 'seg', id: g.id }; pushHistory(); try { renderFlags(); } catch {} mtDirty();
}
function mtDel() {
  mtPhSync();
  if (!loaded || exporting) return; const s = MT.sel;
  if (s && s.t === 'cap') { mtCapDel(s.i); return; }
  if (s && s.t === 'part' && s.i >= 0 && clipMeta.scenes && clipMeta.scenes.length > 1) { mtPartMerge(s.i, s.i > 0 ? -1 : 1); return; }
  if (segs.length < 2) { if (!$('stEd').hidden) { stEdEmpty(); return; } mtSay('Solo hay un trozo: divide primero (S) lo que quieras quitar'); return; }
  let k = mtSelSeg(); if (k < 0) k = locate(curT()).i;
  segs.splice(k, 1); MT.sel = null; pseg = Math.min(k, segs.length - 1); seekOut(Math.min(totalDur() - 0.01, segStart(pseg))); pushHistory(); try { renderFlags(); } catch {} mtDirty();
}
function mtDup() {
  mtPhSync();
  if (!loaded || !segs.length || exporting) return; let k = mtSelSeg(); if (k < 0) k = locate(curT()).i;
  const g = segs[k], n = { id: newId(), s: g.s, e: g.e }, p = MT.disp.get(g.id); if (p) MT.spawn.set(n.id, { t0: p.t0 + p.d, d: 0, a: 0, anc: 's' });
  segs.splice(k + 1, 0, n); if (pseg > k) pseg++; MT.sel = { t: 'seg', id: n.id }; pushHistory(); try { renderFlags(); } catch {} mtSay('Trozo duplicado'); mtDirty();
}
let mtClip = null;
function mtCopy(cut) {
  mtPhSync();
  if (!loaded || !segs.length || exporting) return; let k = mtSelSeg(); if (k < 0) k = locate(curT()).i; const g = segs[k];
  mtClip = { s: g.s, e: g.e }; MT.sel = { t: 'seg', id: g.id };
  if (cut) { if (segs.length < 2) { mtSay('Copiado (es el único trozo, no se quita)'); return; } segs.splice(k, 1); MT.sel = null; pseg = Math.min(k, segs.length - 1); seekOut(Math.min(totalDur() - 0.01, segStart(pseg))); pushHistory(); try { renderFlags(); } catch {} mtSay('✂️ Trozo cortado: pégalo con Ctrl+V'); }
  else mtSay('📋 Trozo copiado: pégalo con Ctrl+V donde esté la línea'); mtDirty();
}
function mtPaste() {   // se mete en la línea blanca (si cae en medio de un trozo, lo parte)
  mtPhSync();
  if (!loaded || exporting) return; if (!mtClip) { mtSay('Primero copia un trozo (Ctrl+C)'); return; }
  const T = curT(), L = locate(T), g = segs[L.i]; let at;
  if (!g || L.t - g.s < 0.05) at = L.i; else if (g.e - L.t < 0.05) at = L.i + 1;
  else { const a = { id: newId(), s: g.s, e: L.t }, b = { id: newId(), s: L.t, e: g.e }, p = MT.disp.get(g.id); if (p) { MT.disp.delete(g.id); MT.spawn.set(a.id, { t0: p.t0, d: a.e - a.s, a: 1, anc: 's' }); MT.spawn.set(b.id, { t0: p.t0 + a.e - a.s, d: b.e - b.s, a: 1, anc: 's' }); } segs.splice(L.i, 1, a, b); at = L.i + 1; }
  const n = { id: newId(), s: mtClip.s, e: mtClip.e }, T0 = segStart(at); MT.spawn.set(n.id, { t0: T0, d: 0, a: 0, anc: 's' });
  segs.splice(at, 0, n); pseg = at; vid.currentTime = n.s; MT.sel = { t: 'seg', id: n.id }; pushHistory(); try { renderFlags(); } catch {} mtSay('Trozo pegado'); mtDirty();
}
function mtScene(open = true) {   // desde la línea blanca, otra parte (empieza con la misma plantilla y se abre para elegir otra)
  mtPhSync();
  if (!loaded || exporting) return; const t = vid.currentTime || 0, base = curFmtOf();
  if (layoutMode === 'split') { mtSay('La pantalla dividida va en todo el clip: elige otro formato para partirlo'); return; }
  if (!clipMeta.scenes || !clipMeta.scenes.length) clipMeta.scenes = [{ s: 0, e: (vid.duration || 0) + 1, f: SC_FMT[base] ? base : 'horizontal', ov: null }];
  const i = clipMeta.scenes.findIndex(x => t >= x.s && t < x.e); if (i < 0) return; const x = clipMeta.scenes[i];
  if (t - x.s < 0.3 || x.e - t < 0.3) { mtSay('Ya hay un cambio de plantilla justo aquí'); if (clipMeta.scenes.length < 2 && !x.ov) delete clipMeta.scenes; return; }
  clipMeta.scenes.splice(i, 1, { ...x, e: +t.toFixed(3) }, { ...x, s: +t.toFixed(3), ov: x.ov ? JSON.parse(JSON.stringify(x.ov)) : null });
  pushHistory(); scSig = ''; MT.fx.push({ type: 'flash', T: curT(), at: performance.now() }); mtDirty();
  if (!open) { MT.sel = { t: 'part', i: i + 1 }; mtSay('✂️ Formato partido en la línea: ahora puedes cambiar la plantilla de cada parte'); return; }
  vid.pause(); mtSeek(() => { vid.currentTime = Math.min(clipMeta.scenes[i + 1].e - 0.05, t + 0.04); });   // la línea, ya dentro de la parte nueva
  mtInsp(i + 1);
}
function mtPartMerge(i, dir) {   // quitar un cambio de plantilla: la parte se une a la de al lado
  const sc = clipMeta.scenes; if (!sc || !sc[i] || !sc[i + dir]) return;
  if (dir < 0) sc[i - 1].e = sc[i].e; else sc[i + 1].s = sc[i].s; sc.splice(i, 1);
  if (sc.length < 2 && !sc[0].ov) delete clipMeta.scenes;
  pushHistory(); scSig = ''; MT.sel = null; mtInspClose(); mtDirty();
}
function mtJump(dir) {   // a el corte o cambio de plantilla anterior / siguiente
  const T = mtPhNow(), pts = [0, totalDur() - 0.001]; let acc = 0; for (const g of segs) { acc += g.e - g.s; pts.push(acc); } for (const b of MT.bounds) pts.push(b.T);
  pts.sort((a, b) => a - b); const c = dir > 0 ? pts.find(v => v > T + 0.02) : [...pts].reverse().find(v => v < T - 0.02); if (c != null) { vid.pause(); mtSeekOut(Math.min(c, totalDur() - 0.001)); }
}
async function mtSubsAdd() {
  if (!loaded || exporting) return; trk.caps.hide = false; clipMeta.noSubs = false; try { syncTrackUI(); } catch {}
  if (!captions.length) { const say = t => { $('seS').textContent = t; }; say('💬 Escribiendo los subtítulos…'); mtSay('Escribiendo los subtítulos…'); try { const ok = await doTranscribe(m => say('💬 ' + m)); if (ok) clipMeta.subR = srcRange(); say(ok ? '✅ Subtítulos listos: arrástralos en la línea de tiempo para ajustarlos.' : '⚠ No se pudieron hacer los subtítulos'); } catch (e) { console.warn(e); say('⚠ No se pudieron hacer los subtítulos'); } }
  pushHistory(); mtDirty();
}
function mtSubsHide() { trk.caps.hide = true; clipMeta.noSubs = true; try { syncTrackUI(); } catch {} if (MT.sel && MT.sel.t === 'cap') MT.sel = null; pushHistory(); mtDirty(); }
// subtítulos: mover, cambiar cuánto duran, cambiar el texto, borrar
function mtCapFix() { allWords = captions.flatMap(c => (c.words || []).filter(w => w.text)); MT.ver++; }
function mtCapDel(i) { if (!captions[i]) return; captions.splice(i, 1); mtCapFix(); try { renderCapList(); } catch {} MT.sel = null; pushHistory(); }
let mtCapI = -1;
function mtCapEdit(i) {
  const c = captions[i], q = MT.caps.find(v => v.i === i), inp = $('mtCapIn'); if (!c || !q) return;
  mtCapI = i; MT.sel = { t: 'cap', i }; inp.value = (c.words || []).map(w => (w.text || '').trim()).join(' ').trim();
  const w = Math.max(220, Math.min(420, q.x1 - q.x0 + 20)); inp.style.width = w + 'px'; inp.style.left = mtClamp(q.x0 - 4, 4, Math.max(4, MT.vw - w - 4)) + 'px'; inp.style.top = (ML.sub[0] - 4) + 'px'; inp.hidden = false; inp.focus(); inp.select();
}
function mtCapCommit(cancel) {
  const inp = $('mtCapIn'); if (!inp || inp.hidden) return; const i = mtCapI; mtCapI = -1; inp.hidden = true; if (cancel || !captions[i]) return;
  const v = inp.value.trim(); if (!v) { mtCapDel(i); return; }
  editCaption(i, v); MT.ver++; try { renderCapList(); } catch {} pushHistory();
}

/* ----- arrastrar ----- */
function mtScrub(vx) {   // la línea va pegada al ratón y tiene un pequeño imán en los cortes (se suelta al alejarte un poco)
  const D = totalDur() || 0; let T = mtClamp(mtTofX(vx), 0, D); const pts = [0, D]; let acc = 0;
  for (const g of segs) { acc += g.e - g.s; pts.push(acc); } for (const b of MT.bounds) pts.push(b.T);
  const was = MT.phSnap, r = px => px / MT.pps; let best = null, bd = r(7);
  for (const c of pts) { const dd = Math.abs(c - T), lim = was && Math.abs(was.T - c) < 1e-6 ? r(11) : bd; if (dd < lim && (!best || dd < Math.abs(best - T))) best = c; }
  if (best != null) { T = best; if (!was || Math.abs(was.T - best) > 1e-6) MT.phSnap = { T: best, at: performance.now() }; mtSnapSet({ out: best, end: best > 0 }); } else { MT.phSnap = null; mtSnapSet(null); }
  const Ts = Math.min(T, D - 0.001); mtSeekOut(Ts); MT.phD = Ts; MT.bub = { x: mtX(T) + 34, text: fmtS(T) };
}
function mtDown(ev) {
  if (!loaded || exporting || stPend) return;
  if (!PX.ready && !PX.busy) pxBuild();
  try { $('seTl').focus({ preventScroll: true }); } catch {}   // para que funcionen S, Q, W, Supr, espacio…
  ctxClose(); mtCapCommit(); MT.fit = false; const [vx, vy] = mtPt(ev), h = mtHit(vx, vy), cv = $('mtCv'); MT.ptr = { x: vx, y: vy };
  if (ev.button === 1) { ev.preventDefault(); MT.drag = { type: 'pan', x0: vx, sx0: MT.sx }; try { cv.setPointerCapture(ev.pointerId); } catch {} return; }
  if (ev.button !== 0) return; ev.preventDefault(); try { cv.setPointerCapture(ev.pointerId); } catch {}
  if (h.t === 'bar') { const [tx, tw] = MT.thumb || [0, 40]; if (vx < tx || vx > tx + tw) MT.sx = mtClamp((vx - tw / 2) / (MT.vw - tw) * MT.max, 0, MT.max); MT.sxT = null; MT.drag = { type: 'scroll', x0: vx, sx0: MT.sx, tw }; return; }
  vid.pause(); clearTimeout(histTimer); window.mtHoldHist = true; MT.bub = null; mtSnapSet(null);
  const base = { x0: vx, sx0: MT.sx, phSrc: vid.currentTime || 0 };
  if (MT.blade && (h.t === 'seg' || h.t === 'edge')) {   // modo cuchilla: el clic corta justo ahí
    window.mtHoldHist = false; const T = mtSnapOut(mtClamp(mtTofX(vx), 0, totalDur()), ['ph', 'caps', 'parts']); seekOut(Math.min(T, totalDur() - 0.001)); mtCut(); mtSnapSet(null); MT.drag = { type: 'blade' }; mtDirty(); return;
  }
  if (h.t === 'edge') { const g = segs[h.k]; MT.sel = { t: 'seg', id: g.id }; mtInspClose(); MT.drag = { ...base, type: 'trim', k: h.k, id: g.id, h: h.h, s0: g.s, e0: g.e, T0: segStart(h.k) }; cv.style.cursor = 'ew-resize'; }
  else if (h.t === 'seg') { const g = segs[h.k], p = MT.disp.get(g.id); MT.sel = { t: 'seg', id: g.id }; mtInspClose(); MT.drag = { ...base, type: 'pseg', k: h.k, id: g.id, grab: mtTofX(vx) - (p ? p.t0 : segStart(h.k)) }; }
  else if (h.t === 'bound') { MT.drag = { ...base, type: 'bound', i: h.i }; }
  else if (h.t === 'part') { const sc = clipMeta.scenes || [], x = sc[h.i]; MT.drag = { ...base, type: 'ppart', i: h.i, s0: x ? x.s : 0, e0: x ? x.e : 0, pe0: sc[h.i - 1] ? sc[h.i - 1].s : null, ne0: sc[h.i + 1] ? sc[h.i + 1].e : null }; }
  else if (h.t === 'cap') { const c = captions[h.i]; MT.sel = { t: 'cap', i: h.i }; mtInspClose(); MT.drag = { ...base, type: 'cap', i: h.i, mode: h.mode, start0: c.start, end0: c.end, w0: (c.words || []).map(w => ({ ...w })), moved: false }; const k = segs.findIndex(g => c.start >= g.s - 1e-3 && c.start < g.e); }
  else if (h.t === 'title' || h.t === 'titleadd' || h.t === 'subadd') { MT.drag = { ...base, type: 'pclick', what: h.t }; }
  else { if (h.t === 'empty') { if (MT.sel && MT.sel.t !== 'part') MT.sel = null; } MT.drag = { ...base, type: 'seek' }; mtScrub(vx); }
  mtDirty();
}
function mtDragMove() {
  const d = MT.drag, P = MT.ptr; if (!d || !P) return; const vx = P.x, dts = ((vx + MT.sx) - (d.x0 + d.sx0)) / MT.pps;
  if (d.type === 'seek') { mtScrub(vx); return; }
  if (d.type === 'pan') { MT.sx = mtClamp(d.sx0 - (vx - d.x0), 0, MT.max); MT.sxT = null; return; }
  if (d.type === 'scroll') { MT.sx = mtClamp(d.sx0 + (vx - d.x0) / Math.max(1, MT.vw - d.tw) * MT.max, 0, MT.max); MT.sxT = null; return; }
  if (d.type === 'pclick') { if (Math.abs(vx - d.x0) > 5) { d.type = 'seek'; mtScrub(vx); } return; }
  if (d.type === 'ppart') { if (Math.abs(vx - d.x0) < 6) return; const sc = clipMeta.scenes; if (!sc || sc.length < 2) { d.type = 'none'; return; } d.type = 'mpart'; mtInspClose(); MT.sel = { t: 'part', i: d.i }; $('mtCv').style.cursor = 'grabbing'; }
  if (d.type === 'mpart') {   // mover una parte de plantilla (como un texto): las de al lado se acortan o se alargan
    const sc = clipMeta.scenes, x = sc && sc[d.i], a = sc && sc[d.i - 1], b = sc && sc[d.i + 1]; if (!x) return; const len = d.e0 - d.s0;
    if (a && b) { const s1 = mtClamp(d.s0 + dts, d.pe0 + 0.3, d.ne0 - 0.3 - len); x.s = a.e = +s1.toFixed(3); x.e = b.s = +(s1 + len).toFixed(3); }
    else if (b) { const e1 = mtClamp(d.e0 + dts, d.s0 + 0.3, d.ne0 - 0.3); x.e = b.s = +e1.toFixed(3); }
    else if (a) { const s1 = mtClamp(d.s0 + dts, d.pe0 + 0.3, d.e0 - 0.3); x.s = a.e = +s1.toFixed(3); }
    scSig = ''; MT.bub = { x: vx, text: mtName(x.f) + ' · ' + (x.e - x.s > 900 ? '' : (Math.min(x.e, vid.duration || x.e) - x.s).toFixed(1).replace('.', ',') + ' s') }; mtDirty(); return;
  }
  if (d.type === 'pseg') { if (Math.abs(vx - d.x0) < 6) return; if (segs.length < 2) { d.type = 'none'; return; } d.type = 'move'; d.to = d.k; MT.bub = null; mtSnapSet(null); $('mtCv').style.cursor = 'grabbing'; }
  if (d.type === 'move') {   // cambiar el trozo de sitio: los demás le van haciendo hueco
    const g = segs[d.k]; if (!g) return; const len = g.e - g.s; d.dispT0 = mtTofX(vx) - d.grab; const c = d.dispT0 + len / 2; let to = 0, acc = 0;
    segs.forEach((o, k) => { if (k === d.k) return; const l = o.e - o.s; if (c > acc + l / 2) to++; acc += l; }); d.to = to; return;
  }
  if (d.type === 'trim') {
    const g = segs[d.k]; if (!g) return; const Dv = vid.duration || d.e0;
    if (d.h === 's') { let s = mtClamp(d.s0 + dts, 0, g.e - 0.2); s = mtClamp(mtSnapSrc(d.k, s, d), 0, g.e - 0.2); g.s = s; mtSeekSrc(d.k, s); }
    else { let e = mtClamp(d.e0 + dts, g.s + 0.2, Dv); e = mtClamp(mtSnapSrc(d.k, e, d), g.s + 0.2, Dv); g.e = e; mtSeekSrc(d.k, Math.max(g.s, e - 0.04)); }
    const len = g.e - g.s, dl = len - (d.e0 - d.s0), T = mtTargets()[d.k], ex = d.h === 's' ? ML.padL + T.t0 * MT.pps - MT.sx : ML.padL + (T.t0 + T.d) * MT.pps - MT.sx;
    MT.bub = { x: ex, text: len.toFixed(1).replace('.', ',') + ' s' + (Math.abs(dl) >= 0.05 ? '  ' + (dl > 0 ? '+' : '−') + Math.abs(dl).toFixed(1).replace('.', ',') : '') }; mtDirty(); return;
  }
  if (d.type === 'bound') {   // límite entre dos partes de plantilla
    const sc = clipMeta.scenes, a = sc && sc[d.i], b = sc && sc[d.i + 1]; if (!a || !b) return;
    const T = mtSnapOut(mtClamp(mtTofX(vx), 0, totalDur()), ['cuts', 'caps']), L = locate(T), t = mtClamp(L.t, a.s + 0.3, b.e - 0.3); a.e = b.s = +t.toFixed(3); scSig = ''; mtDirty();
    const k = segs.findIndex(g => t >= g.s && t <= g.e); if (k >= 0) mtSeekSrc(k, t); MT.bub = { x: vx, text: fmtS(T) }; return;
  }
  if (d.type === 'cap') {
    const c = captions[d.i]; if (!c) return; if (!d.moved && Math.abs(vx - d.x0) < 4) return; d.moved = true;
    const pv = captions[d.i - 1], nx = captions[d.i + 1], lo = pv ? Math.min(pv.end, d.start0) : 0, hi = nx ? Math.max(nx.start, d.end0) : Math.max(d.end0, vid.duration || d.end0), len = d.end0 - d.start0, cuts = segs.flatMap(g => [g.s, g.e]);
    let s = d.start0, e = d.end0;
    if (d.mode === 'move') { s = mtClamp(d.start0 + dts, lo, Math.max(lo, hi - len)); const s1 = mtSnapSrc(-1, s, d, cuts, d.i); if (s1 !== s) s = mtClamp(s1, lo, Math.max(lo, hi - len)); else { const e1 = mtSnapSrc(-1, s + len, d, cuts, d.i); if (e1 !== s + len) s = mtClamp(e1 - len, lo, Math.max(lo, hi - len)); } e = s + len; }
    else if (d.mode === 's') s = mtClamp(mtSnapSrc(-1, mtClamp(d.start0 + dts, lo, d.end0 - 0.15), d, cuts, d.i), lo, d.end0 - 0.15);
    else e = mtClamp(mtSnapSrc(-1, mtClamp(d.end0 + dts, d.start0 + 0.15, hi), d, cuts, d.i), d.start0 + 0.15, hi);
    const f = (e - s) / Math.max(0.01, len); c.start = s; c.end = e; c.words = d.w0.map(w => ({ ...w, start: s + (w.start - d.start0) * f, end: s + (w.end - d.start0) * f })); MT.ver++;
    if (MT.snapL && MT.snapL.src != null) { const kk = segs.findIndex(g => MT.snapL.src >= g.s - 1e-3 && MT.snapL.src <= g.e + 1e-3); if (kk >= 0) MT.snapL.k = kk; else mtSnapSet(null); }
    const show = d.mode === 'e' ? e - 0.05 : s + 0.03, k = segs.findIndex(g => show >= g.s && show < g.e); if (k >= 0) mtSeekSrc(k, show);
    MT.bub = { x: vx, text: (e - s).toFixed(1).replace('.', ',') + ' s' }; return;
  }
}
function mtMove(ev) {
  const [vx, vy] = mtPt(ev); MT.ptr = { x: vx, y: vy };
  if (!MT.drag) { if (loaded && !exporting && !stPend) mtHoverSet(mtHit(vx, vy)); return; }
  mtDragMove();
}
function mtUp(ev) {
  const d = MT.drag; MT.drag = null; window.mtHoldHist = false; MT.bub = null; mtDirty(); if (!d) return;
  if (ev && ev.type !== 'pointercancel') { const [vx, vy] = mtPt(ev); MT.ptr = { x: vx, y: vy }; mtHoverSet(mtHit(vx, vy)); }
  if (d.type === 'blade') return;
  if (d.type === 'seek' || d.type === 'pan' || d.type === 'scroll' || d.type === 'pseg') { MT.snapAt = performance.now(); return; }
  if (d.type === 'ppart') { mtInsp(d.i); return; }
  if (d.type === 'none') return;
  if (d.type === 'mpart') { pushHistory(); MT.sel = { t: 'part', i: d.i }; return; }
  if (d.type === 'pclick') { if (d.what === 'subadd') mtSubsAdd(); else { const t = $('seTitle'); t.focus(); t.select(); } return; }
  if (d.type === 'move') {
    const [g] = segs.splice(d.k, 1), to = Math.min(d.to == null ? d.k : d.to, segs.length); segs.splice(to, 0, g); pseg = to; seekOut(segStart(to));
    if (to !== d.k) { pushHistory(); try { renderFlags(); } catch {} } return;
  }
  if (d.type === 'cap') { if (d.moved) { mtCapFix(); try { renderCapList(); } catch {} pushHistory(); } MT.snapAt = performance.now(); return; }
  pushHistory(); try { renderFlags(); } catch {} MT.snapAt = performance.now();
  if (d.type === 'bound') { vid.play().catch(() => {}); return; }   // al soltar un cambio de plantilla: se ve cómo pasa de una a otra
  const g = segs[d.k]; if (!g) return; pseg = d.k;
  if (Math.abs(g.s - d.s0) < 1e-3 && Math.abs(g.e - d.e0) < 1e-3) return;
  mtSeek(() => { vid.currentTime = d.h === 's' ? g.s : Math.max(g.s, g.e - 1); }); setTimeout(() => vid.play().catch(() => {}), 30);   // al soltar: el principio, o el último segundo
}
function mtCtx(ev) {   // botón derecho
  ev.preventDefault(); if (!loaded || exporting || stPend) return; const [vx, vy] = mtPt(ev), h = mtHit(vx, vy), items = []; let title = 'Línea de tiempo';
  const T = mtClamp(mtTofX(vx), 0, Math.max(0, totalDur() - 0.001));
  if (h.t === 'seg' || h.t === 'edge') { vid.pause(); seekOut(T); MT.sel = { t: 'seg', id: segs[h.k].id }; title = 'Trozo de vídeo';
    items.push({ icon: '✂️', label: 'Dividir aquí', key: 'Ctrl+B', act: mtCut }, { icon: '⇤', label: 'Quitar lo de antes de aquí', key: 'Q', act: () => mtTrimSide('s') }, { icon: '⇥', label: 'Quitar lo de después de aquí', key: 'W', act: () => mtTrimSide('e') }, { icon: '⧉', label: 'Duplicar', key: 'Ctrl+D', act: mtDup }, { icon: '📋', label: 'Copiar', key: 'Ctrl+C', act: () => mtCopy(false) }, { icon: '✂', label: 'Cortar', key: 'Ctrl+X', dis: segs.length < 2, act: () => mtCopy(true) }, mtClip ? { icon: '📥', label: 'Pegar en la línea', key: 'Ctrl+V', act: mtPaste } : null, { sep: 1 }, { icon: '🗑️', label: 'Eliminar', key: 'Supr', danger: true, dis: segs.length < 2, act: mtDel }); }
  else if (h.t === 'part' || h.t === 'bound') { const i = h.i, sc = clipMeta.scenes; vid.pause(); if (h.t === 'part') seekOut(T); title = 'Plantilla';
    items.push({ icon: '🎛️', label: 'Cambiar o ajustar esta plantilla', act: () => mtInsp(i) }, { icon: '▦', label: 'Otra plantilla desde aquí', act: mtScene });
    if (sc && i > 0) items.push({ icon: '⟵', label: 'Unir con la parte anterior', act: () => mtPartMerge(i, -1) }); if (sc && i >= 0 && i < sc.length - 1) items.push({ icon: '⟶', label: 'Unir con la parte siguiente', act: () => mtPartMerge(i, 1) }); }
  else if (h.t === 'cap') { MT.sel = { t: 'cap', i: h.i }; title = 'Subtítulo'; items.push({ icon: '✏️', label: 'Cambiar el texto', act: () => mtCapEdit(h.i) }, { icon: '🗑️', label: 'Eliminar este subtítulo', key: 'Supr', danger: true, act: () => mtCapDel(h.i) }, { sep: 1 }, { icon: '🙈', label: 'Quitar todos los subtítulos', act: mtSubsHide }); }
  else if (h.t === 'title') { title = 'Título'; items.push({ icon: '✏️', label: 'Cambiar el título', act: () => { $('seTitle').focus(); $('seTitle').select(); } }); }
  else { items.push({ icon: '↔', label: 'Ver todo el clip', key: 'Mayús+Z', act: mtFit }, { icon: '🧲', label: MT.snap ? 'Quitar el imán' : 'Poner el imán', key: 'N', act: mtSnapToggle });
    if (mtSubsOn() && captions.length) items.push({ icon: '🙈', label: 'Quitar los subtítulos', act: mtSubsHide }); else items.push({ icon: '💬', label: 'Poner subtítulos', act: mtSubsAdd }); }
  mtDirty(); ctxOpen(ev.clientX, ev.clientY, title, items);
}
function mtBlank() { const cv = $('mtCv'); if (!cv) return; const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); const ct = $('ccTime'); ct.innerHTML = ''; ct.dataset.v = ''; mtDirty(); mtInspClose(); mtCapCommit(true); }
function mtHelp(ev) {   // los atajos, a la vista (y cada uno hace lo suyo si lo pulsas)
  const r = ev.currentTarget.getBoundingClientRect(), D = () => totalDur() || 0;
  ctxOpen(r.left, r.top - 8, 'Atajos de la línea de tiempo', [{ icon: '▶', label: 'Reproducir / parar', key: 'Espacio', act: togglePlay }, { icon: '✂️', label: 'Dividir en la línea', key: 'Ctrl+B', act: mtCut }, { icon: '🔪', label: MT.blade ? 'Volver al modo normal' : 'Modo cuchilla (cada clic corta)', key: MT.blade ? 'A' : 'B', act: () => mtBladeSet(!MT.blade) }, { icon: '⇤', label: 'Quitar lo de antes de la línea', key: 'Q', act: () => mtTrimSide('s') }, { icon: '⇥', label: 'Quitar lo de después', key: 'W', act: () => mtTrimSide('e') }, { icon: '🗑️', label: 'Eliminar lo seleccionado', key: 'Supr', act: mtDel }, { icon: '⧉', label: 'Duplicar el trozo', key: 'Ctrl+D', act: mtDup }, { icon: '📋', label: 'Copiar / cortar / pegar', key: 'Ctrl+C · X · V', act: () => mtCopy(false) }, { sep: 1 },
    { icon: '◀', label: 'Fotograma a fotograma', key: '← →', act: () => {} }, { icon: '⏩', label: 'De segundo en segundo', key: 'Mayús + ← →', act: () => {} }, { icon: '⤒', label: 'Al corte anterior / siguiente', key: '↑ ↓', act: () => mtJump(1) }, { icon: '⇱', label: 'Al principio / al final', key: 'Inicio · Fin', act: () => mtSeekOut(0) }, { sep: 1 },
    { icon: '🔍', label: 'Acercar / alejar', key: 'Ctrl + / Ctrl −', act: () => mtZoomTo(MT.ppsT * 1.5) }, { icon: '↔', label: 'Ver todo el clip', key: 'Mayús+Z', act: mtFit }, { icon: '🧲', label: MT.snap ? 'Quitar el imán' : 'Poner el imán', key: 'N', act: mtSnapToggle }, { icon: '↩', label: 'Deshacer / rehacer', key: 'Ctrl+Z · Ctrl+Y', act: () => goHistory(-1).then(mtDirty) }]);
}
function mtSnapToggle() { MT.snap = !MT.snap; ezPref('mtSnap', MT.snap ? '1' : '0'); mtSay(MT.snap ? '🧲 Imán puesto' : 'Imán quitado'); }
function mtKey(e) {   // atajos, como en CapCut
  if (!loaded || exporting || stPend) return false; const t = e.target;
  if (t && t.closest && t.closest('input,textarea,select,[contenteditable]')) return false;
  const k = e.key, c = e.ctrlKey || e.metaKey, lk = k.length === 1 ? k.toLowerCase() : k, D = totalDur() || 0;
  if (!['Shift', 'Control', 'Meta', 'Alt'].includes(k)) MT.fit = false;   // desde que editas, la escala se queda quieta (como en CapCut)
  if (c && lk === 'z') goHistory(e.shiftKey ? 1 : -1).then(mtDirty);
  else if (c && lk === 'y') goHistory(1).then(mtDirty);
  else if (c && lk === 'b') { if (MT.sel && MT.sel.t === 'part') mtScene(false); else mtCut(); }   // Ctrl+B y Ctrl+Mayús+B: dividir (aquí solo hay una pista de vídeo)
  else if (c && lk === 'd') mtDup();
  else if (c && lk === 'c') mtCopy(false); else if (c && lk === 'x') mtCopy(true); else if (c && lk === 'v') mtPaste();
  else if (c && (k === '+' || k === '=' || e.code === 'NumpadAdd')) mtZoomTo(MT.ppsT * 1.5); else if (c && (k === '-' || e.code === 'NumpadSubtract')) mtZoomTo(MT.ppsT / 1.5);
  else if (c && k === '0') mtFit();
  else if (c || e.altKey) return false;
  else if (lk === 'z' && e.shiftKey) mtFit();
  else if (lk === 'b') mtBladeSet(true); else if (lk === 'a') { if (MT.blade) mtBladeSet(false); }
  else if (lk === 's') mtCut(); else if (lk === 'q') mtTrimSide('s'); else if (lk === 'w') mtTrimSide('e'); else if (lk === 'n') mtSnapToggle();
  else if (k === 'Delete' || (k === 'Backspace' && MT.sel)) mtDel();
  else if (k === ' ') { if (t && t.tagName === 'BUTTON') t.blur(); togglePlay(); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { vid.pause(); mtSeekOut(mtClamp(mtPhNow() + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / Math.max(24, srcFpsV())), 0, D - 0.001)); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') mtJump(k === 'ArrowUp' ? -1 : 1);
  else if (k === 'Home') { vid.pause(); mtSeekOut(0); } else if (k === 'End') { vid.pause(); mtSeekOut(D - 0.001); }
  else if (k === '+' || k === '=') mtZoomTo(MT.ppsT * 1.5); else if (k === '-') mtZoomTo(MT.ppsT / 1.5);
  else if (k === 'Escape') { if (MT.blade) mtBladeSet(false); else if (mtInspI != null) mtInspClose(); else if (MT.sel) { MT.sel = null; mtDirty(); } else return false; }
  else return false;
  e.preventDefault(); return true;
}

/* ----- inspector de la plantilla de una parte: elegir formato y ajustar el encuadre ----- */
let mtInspI = null, mtInspBusy = false, mtInspRows = [], mtInspRef = null;
function mtInspTarget() {   // qué encuadre se toca: el de la parte o el del clip entero
  const i = mtInspI, sc = i != null && i >= 0 && clipMeta.scenes ? clipMeta.scenes[i] : null, ov = sc && sc.ov;
  if (ov) return ov.mode === 'react' ? { kind: 'crops', cr: ov.crops, own: true } : { kind: 'ov', s: ov.s || (ov.s = {}), own: true };
  if (layoutMode === 'react') return { kind: 'crops', cr: crops }; if (layoutMode === 'split') return { kind: 'none' };
  return { kind: 'global' };
}
function mtInsp(i) {
  if (!loaded || exporting) return; let pop = $('mtPop'); if (!pop) { pop = document.createElement('div'); pop.id = 'mtPop'; pop.className = 'mt-pop'; pop.hidden = true; document.body.append(pop); pop.addEventListener('keydown', e => { if (e.key === 'Escape') { mtInspClose(); try { $('seTl').focus({ preventScroll: true }); } catch {} } e.stopPropagation(); }); }
  const was = mtInspI; mtInspI = i; MT.sel = { t: 'part', i }; mtInspBuild(); pop.hidden = false; mtInspPlace();
  if (was == null) { pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = ''; } mtDirty();
}
function mtInspClose() { if (mtInspI == null) return; mtInspI = null; const p = $('mtPop'); if (p) p.hidden = true; if (MT.sel && MT.sel.t === 'part') MT.sel = null; mtDirty(); }
function mtInspPlace() {
  const pop = $('mtPop'), tl = $('seTl').getBoundingClientRect(), col = document.querySelector('#stEd .se-ctl').getBoundingClientRect(), vw = innerWidth;
  const w = vw < 820 ? vw - 16 : mtClamp(col.width, 320, 440), left = vw < 820 ? 8 : mtClamp(col.right - w, 8, vw - w - 8);
  pop.style.width = w + 'px'; pop.style.left = left + 'px'; pop.style.bottom = Math.max(8, innerHeight - tl.top + 8) + 'px'; pop.style.maxHeight = Math.max(200, tl.top - 20) + 'px';
}
function mtInspBuild() {
  const pop = $('mtPop'), i = mtInspI, sc = i >= 0 && clipMeta.scenes ? clipMeta.scenes[i] : null; if (!pop || i == null) return;
  if (i >= 0 && !sc) { mtInspClose(); return; }
  const whole = i < 0, cur = whole ? curFmtOf() : (sc.ov ? sc.f : 'base'), mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  pop.innerHTML = ''; mtInspRows = [];
  const head = mk('div', 'mp-h'), nth = whole ? 0 : [...new Set(MT.blocks.map(b => b.i))].indexOf(i) + 1; head.append(mk('b', '', whole ? 'Plantilla del clip' : 'Parte ' + (nth || i + 1)), mk('span', 'mp-r'));
  const xb = mk('button', 'mp-x', '✕'); xb.title = 'Cerrar (Esc)'; xb.onclick = mtInspClose; head.append(xb); pop.append(head);
  // formatos, con su miniatura
  const fm = mk('div', 'mp-fm'), list = whole ? EZ_FMTS.map(([id, ic, n]) => [id, ic, n]) : [...Object.entries(SC_FMT).map(([id, [ic, n]]) => [id, ic, n]), ['base', '↩', 'Como el resto']];
  for (const [id, ic, n] of list) { const b = mk('button', 'mp-t' + (cur === id ? ' on' : '')); b.type = 'button'; b.title = id === 'base' ? 'Esta parte va igual que el resto del clip' : n;
    let pv = null; if (id !== 'base') { try { pv = mockFrom(fmtStyle(id), false, id); } catch {} } if (!pv) { pv = mk('span', 'mp-base', ic); }
    b.append(pv, mk('b', '', n)); b.onclick = () => mtInspFmt(id); fm.append(b); }
  pop.append(fm, Object.assign(mk('div', 'mp-st'), { hidden: true }));
  // encuadre
  const tg = mtInspTarget(), sec = mk('div', 'mp-sec'); mtInspRef = { sc, ov: sc && sc.ov, kind: tg.kind, cr: tg.cr || null }; sec.append(mk('span', '', whole || !tg.own ? 'Encuadre del clip' : 'Encuadre de esta parte'));
  const adj = mk('div', 'mp-adj'), row = (label, min, max, get, set, fmtV) => { const r = mk('label', 'mp-row'), inp = mk('input'), out = mk('output'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = 1; inp.value = get(); out.textContent = fmtV(+inp.value);
    inp.oninput = () => { set(+inp.value); out.textContent = fmtV(+inp.value); mtInspShow(); }; inp.onchange = () => pushHistory(); r.append(mk('span', '', label), inp, out); adj.append(r); mtInspRows.push({ inp, out, get, fmtV }); };
  const pct = v => v + '%', px = v => (v > 0 ? '+' : '') + v;
  if (tg.kind === 'global') {
    const rs = mk('button', '', '↺ Restablecer'); rs.onclick = () => { setRange('offX', 0); setRange('offY', 0); setRange('zoom', curFmtOf() === 'podcast' ? fillZoom() : 100); pushHistory(); mtInspSync(true); }; sec.append(rs);
    row('Zoom', 30, +$('zoom').max || 800, () => +$('zoom').value, v => setRange('zoom', v), pct);
    row('Mover ← →', -1700, 1700, () => +$('offX').value, v => setRange('offX', v), px); row('Mover ↑ ↓', -1000, 1000, () => +$('offY').value, v => setRange('offY', v), px);
    const r = mk('label', 'mp-row'), se = mk('select'); for (const o of $('bg').options) se.append(new Option(o.textContent, o.value)); se.value = $('bg').value; se.onchange = () => { $('bg').value = se.value; $('bg').dispatchEvent(new Event('change', { bubbles: true })); pushHistory(); }; r.append(mk('span', '', 'Fondo'), se); adj.append(r);
  } else if (tg.kind === 'ov') {
    const s = tg.s, rs = mk('button', '', '↺ Restablecer'); rs.onclick = () => mtInspFmt(sc.f); sec.append(rs);
    row('Zoom', 30, Math.max(800, +$('zoom').max || 800), () => Math.round((s.zoom || 1) * 100), v => { s.zoom = v / 100; }, pct);
    row('Mover ← →', -1700, 1700, () => Math.round(s.offX || 0), v => { s.offX = v; }, px); row('Mover ↑ ↓', -1000, 1000, () => Math.round(s.offY || 0), v => { s.offY = v; }, px);
    const r = mk('label', 'mp-row'), se = mk('select'); se.append(new Option('El del clip', '')); for (const o of $('bg').options) se.append(new Option(o.textContent, o.value)); se.value = s.bg || ''; se.onchange = () => { if (se.value) s.bg = se.value; else delete s.bg; pushHistory(); mtDirty(); }; r.append(mk('span', '', 'Fondo'), se); adj.append(r);
  } else if (tg.kind === 'crops' && tg.cr) {
    const zrow = (label, key) => { const c = cget(tg.cr, key); if (!c || !(c.w > 0)) return; const maxW = () => c.w * Math.min(1 / c.w, 1 / c.h);
      row(label, 100, 3000, () => Math.round(maxW() / c.w * 100), v => { const f = Math.max(0.025 / c.w, (maxW() / (v / 100)) / c.w), cx = c.x + c.w / 2, cy = c.y + c.h / 2; c.w = Math.min(1, c.w * f); c.h = Math.min(1, c.h * f); c.x = mtClamp(cx - c.w / 2, 0, 1 - c.w); c.y = mtClamp(cy - c.h / 2, 0, 1 - c.h); try { tlSig = ''; } catch {} }, pct); };
    if (tg.own) { const rs = mk('button', '', '↺ Restablecer'); rs.onclick = () => mtInspFmt(sc.f); sec.append(rs); }
    if (callOn() && (tg.cr.n || 2) > 2) { zrow('Zoom persona 1', 'cam'); zrow('Zoom persona 2', 'content'); for (let i = 2; i < (tg.cr.n || 2); i++) zrow('Zoom persona ' + (i + 1), 'p' + i); }
    else { zrow('Zoom de arriba', 'cam'); zrow('Zoom de abajo', 'content'); }
  }
  adj.append(mk('p', 'mp-hint', tg.kind === 'none' ? 'Este formato se ajusta en el reproductor: arrastra el vídeo o la imagen, y usa la rueda del ratón para el zoom.' : tg.kind === 'crops' ? 'Para mover cada mitad, arrástrala en el reproductor. La rueda del ratón también hace zoom.' : 'También puedes arrastrar el vídeo en el reproductor y usar la rueda del ratón.'));
  pop.append(sec, adj);
  // acciones
  const act = mk('div', 'mp-act'), btn = (txt, fn, tip) => { const b = mk('button', '', txt); b.type = 'button'; if (tip) b.title = tip; b.onclick = fn; act.append(b); };
  btn('▦ Otra plantilla desde la línea', mtScene, 'Parte el clip en la línea blanca: lo de después puede llevar otra plantilla');
  if (!whole) { const n = clipMeta.scenes.length; if (i > 0) btn('⟵ Unir con la anterior', () => mtPartMerge(i, -1)); if (i < n - 1) btn('Unir con la siguiente ⟶', () => mtPartMerge(i, 1));
    btn('Usar en todo el clip', async () => { const f = sc.ov ? sc.f : curFmtOf(), s = sc.ov && sc.ov.mode === 'single' && sc.ov.s ? { ...sc.ov.s } : null; stNoScenes(); mtInspBusy = true; try { if (sc.ov) { await ezSetFormat(f); if (s) { setRange('zoom', Math.round((s.zoom || 1) * 100)); setRange('offX', s.offX || 0); setRange('offY', s.offY || 0); } stEdFmts(f); } } catch (e) { console.warn(e); } mtInspBusy = false; pushHistory(); mtInsp(-1); }, 'Quita las partes: todo el clip va con esta plantilla'); }
  pop.append(act); mtInspSync(true);
}
function mtInspShow() {   // al tocar el encuadre de una parte, que se vea esa parte
  mtDirty(); const i = mtInspI; if (i == null || i < 0) return; const bs = MT.blocks.filter(v => v.i === i), T = curT(); if (bs.length && !bs.some(b => T >= b.T0 + 0.02 && T < b.T1 - 0.01)) { vid.pause(); mtSeekOut(Math.min(bs[0].T1 - 0.02, bs[0].T0 + 0.05)); }
}
function mtInspSync(force) {
  const pop = $('mtPop'); if (mtInspI == null || !pop || pop.hidden) return;
  if (mtInspI >= 0 && !(clipMeta.scenes && clipMeta.scenes[mtInspI])) { if (clipMeta.scenes || mtInspBusy) { if (!mtInspBusy) mtInspClose(); } else mtInsp(-1); return; }
  if (mtInspI < 0 && clipMeta.scenes && !mtInspBusy) { mtInspClose(); return; }
  if (!mtInspBusy && mtInspRef) { const sc2 = mtInspI >= 0 ? clipMeta.scenes[mtInspI] : null, tg2 = mtInspTarget(), a = document.activeElement; if (sc2 !== mtInspRef.sc || (sc2 && sc2.ov) !== mtInspRef.ov || tg2.kind !== mtInspRef.kind || (tg2.cr || null) !== mtInspRef.cr) { if (!(a && pop.contains(a) && a.type === 'range')) { mtInspBuild(); return; } } }
  const bs = MT.blocks.filter(v => v.i === mtInspI), r = pop.querySelector('.mp-r'); if (r && bs.length) { const a = bs[0].T0, b = bs[bs.length - 1].T1; r.textContent = `${fmtS(a)} → ${fmtS(b)} · ${(bs.reduce((n, v) => n + v.T1 - v.T0, 0)).toFixed(1).replace('.', ',')} s`; }
  for (const q of mtInspRows) { if (!force && document.activeElement === q.inp) continue; let v; try { v = q.get(); } catch { continue; } if (+q.inp.value !== v) { q.inp.value = v; q.out.textContent = q.fmtV(+q.inp.value); } }
  if (performance.now() - MT.inspAt > 1500) { MT.inspAt = performance.now(); mtInspPlace(); }
}
async function mtInspFmt(id) {
  if (mtInspBusy || exporting || mtInspI == null) return; mtInspBusy = true; const i = mtInspI, pop = $('mtPop'), st = pop.querySelector('.mp-st'); st.hidden = false; st.textContent = '⏳ Cambiando la plantilla…'; pop.classList.add('busy');
  try { if (i < 0) { stNoScenes(); await ezSetFormat(id); stCenter(); stEdFmts(id); $('seS').textContent = fmtNeedsImage() ? '🖼️ Este formato lleva una imagen abajo: cópiala y pulsa Ctrl+V' : ''; } else { await scSetFmt(i, id); mtInspShow(); } } catch (e) { console.warn(e); }
  mtInspBusy = false; pop.classList.remove('busy'); if (mtInspI != null) mtInspBuild(); mtDirty();
}
// la parte del clip (con encuadre propio) que hay bajo la línea blanca: el reproductor la ajusta a ella
function sceneAdj() { try { if (cropMode || layoutMode === 'split') return null; const sc = sceneAt(vid.currentTime || 0); return sc && sc.ov ? sc : null; } catch { return null; } }

setTimeout(() => {
  const cv = $('mtCv'), cv0 = $('cv'); if (!cv) return;
  try { MT.rm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
  MT.snap = ezPref('mtSnap') !== '0';
  { const labs = $('mtLabs'); for (const [l, ic, tip] of [['fmt', '▦', 'Plantillas: el clip por partes'], ['title', 'T', 'Título'], ['sub', '≡', 'Subtítulos'], ['vid', '▶', 'Vídeo']]) { const s = document.createElement('span'); s.textContent = ic; s.title = tip; s.style.top = ML[l][0] + 'px'; s.style.height = ML[l][1] + 'px'; labs.append(s); } }
  cv.addEventListener('pointerdown', mtDown); cv.addEventListener('pointermove', mtMove); cv.addEventListener('pointerup', mtUp); cv.addEventListener('pointercancel', mtUp);
  cv.addEventListener('pointerleave', () => { if (!MT.drag) { MT.ptr = null; mtHoverSet(null); } });
  cv.addEventListener('contextmenu', mtCtx);
  cv.addEventListener('auxclick', e => e.preventDefault());
  cv.addEventListener('dblclick', e => { if (!loaded || exporting || stPend) return; const [vx, vy] = mtPt(e), h = mtHit(vx, vy); if (h.t === 'cap') mtCapEdit(h.i); else if (h.t === 'part') mtScene(); });
  cv.addEventListener('wheel', e => {
    const [vx] = mtPt(e);
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); mtZoomTo(MT.ppsT * Math.exp(-mtClamp(e.deltaY, -240, 240) * 0.0022), vx); return; }
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (MT.max <= 0) return;   // nada que mover: la rueda sigue moviendo la página
    e.preventDefault(); MT.anchor = null; MT.sxT = mtClamp((MT.sxT == null ? MT.sx : MT.sxT) + dx * (e.deltaMode === 1 ? 30 : 1), 0, MT.max);
  }, { passive: false });
  const inp = $('mtCapIn'); inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); mtCapCommit(); try { $('seTl').focus({ preventScroll: true }); } catch {} } else if (e.key === 'Escape') { e.preventDefault(); mtCapCommit(true); try { $('seTl').focus({ preventScroll: true }); } catch {} } });
  inp.addEventListener('blur', () => mtCapCommit()); inp.addEventListener('pointerdown', e => e.stopPropagation());
  $('mtZin').onclick = () => mtZoomTo(MT.ppsT * 1.5); $('mtZout').onclick = () => mtZoomTo(MT.ppsT / 1.5); $('mtFitB').onclick = mtFit;
  $('mtZr').oninput = () => { const f = Math.min(mtFitPps(), mtMinPps()); mtZoomTo(f * Math.pow(mtMaxPps() / f, +$('mtZr').value / 100)); };
  $('tlBlade').onclick = () => mtBladeSet(!MT.blade);
  $('seTl').addEventListener('pointerdown', () => { MT.fit = false; }, true);
  $('tlCut').onclick = mtCut; $('tlTrimL').onclick = () => mtTrimSide('s'); $('tlTrimR').onclick = () => mtTrimSide('e'); $('tlDel').onclick = mtDel; $('tlDup').onclick = mtDup; $('tlScene').onclick = mtScene; $('tlSnap').onclick = mtSnapToggle; $('mtHelpB').onclick = e => { e.stopPropagation(); mtHelp(e); };
  $('tlUndo').onclick = () => goHistory(-1).then(mtDirty); $('tlRedo').onclick = () => goHistory(1).then(mtDirty);
  $('stEd').addEventListener('keydown', mtKey);
  // con el panel a pantalla completa, los atajos valen aunque el foco se haya quedado fuera
  document.addEventListener('keydown', e => { const ed = $('stEd'); if (ed.hidden || ed.contains(e.target)) return; const inPop = e.target.closest && e.target.closest('#mtPop'); if (!inPop && !(ed.classList.contains('full') && e.target === document.body)) return; if (!$('ctxMenu').hidden) return; if (mtKey(e)) e.stopImmediatePropagation(); }, true);
  document.addEventListener('pointerdown', e => { if (mtInspI == null) return; const t = e.target; if (t === cv0 || (t.closest && (t.closest('#mtPop') || t.closest('#seTl') || t.closest('.se-pv') || t.closest('#ctxMenu')))) return; mtInspClose(); }, true);
  addEventListener('resize', () => { mtDirty(); if (mtInspI != null) mtInspPlace(); });
}, 0);
/* deslizadores: la parte recorrida se pinta de color (también cuando la cambia el programa, p. ej. al reproducir) */
{ const fill = el => { const a = +el.min || 0, b = el.max === '' ? 100 : +el.max, v = ((+el.value - a) / ((b - a) || 1)) * 100, t = Math.max(0, Math.min(100, v)).toFixed(1) + '%'; if (el.style.getPropertyValue('--p') !== t) el.style.setProperty('--p', t); };
  document.addEventListener('input', e => { if (e.target && e.target.type === 'range') fill(e.target); }, true);
  window.rangeFill = fill;
  setInterval(() => { if (document.hidden) return; for (const el of document.querySelectorAll('input[type=range]')) if (el.offsetParent) fill(el); }, 700); }

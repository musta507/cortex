/* ---------- Reacción: detección automática de la cámara (IA de caras + bordes del recuadro) ---------- */
const FACEAPI_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js';
const FACE_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
let faceapi = null, camDetectedFor = null, camDetecting = false;
async function loadFaceApi() {
  if (faceapi) return faceapi;
  // la librería y su modelo se guardan en este ordenador la primera vez: después funciona sin internet
  let m;
  try { const code = await libFetch(FACEAPI_URL, true); m = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))); }
  catch (e) { console.warn('detección de caras: sin copia guardada', e); m = await import(FACEAPI_URL); }
  faceapi = m.default && m.default.nets ? m.default : m;
  // el modelo lo piden dos partes distintas (la lista de piezas y las piezas): las dos pasan por lo guardado
  const cached = of => async (u, o) => {
    const url = String(u && u.url || u); if (!url.startsWith(FACE_MODELS)) return of(u, o);
    const v = await libFetch(url); return new Response(v, { status: 200, headers: { 'Content-Type': /\.json$/.test(url) ? 'application/json' : 'application/octet-stream' } });
  };
  try { const of = faceapi.env.getEnv().fetch; faceapi.env.monkeyPatch({ fetch: cached(of) }); } catch (e) { console.warn('detección de caras: lista del modelo sin guardar', e); }
  try { const pf = faceapi.tf.env().platform, of2 = pf.fetch.bind(pf); pf.fetch = cached(of2); } catch (e) { console.warn('detección de caras: piezas del modelo sin guardar', e); }
  // tarjeta gráfica si se puede; si no, procesador (más lento pero siempre funciona)
  const tf = faceapi.tf;
  let ok = false;
  try { ok = await tf.setBackend('webgl'); await tf.ready(); } catch { ok = false; }
  if (!ok || tf.getBackend() !== 'webgl') {
    // sin tarjeta gráfica: WebAssembly (rápido); si tampoco, procesador puro
    let wok = false;
    try { if (tf.setWasmPaths) tf.setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/'); wok = await tf.setBackend('wasm'); await tf.ready(); } catch { wok = false; }
    if (!wok || tf.getBackend() !== 'wasm') { await tf.setBackend('cpu'); await tf.ready(); }
  }
  await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS);   // modelo preciso (menos caras falsas que el «tiny»)
  return faceapi;
}
async function sampleFrames(n) {
  const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
  await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = () => rej(new Error('vídeo')); });
  const [r0, r1] = srcRange(), d = (r1 - r0) || tv.duration || 1, out = [];
  for (let i = 0; i < n; i++) {
    tv.currentTime = Math.min(r1 - 0.05, r0 + d * (i + 0.5) / n);
    await new Promise(r => { tv.onseeked = r; setTimeout(r, 1500); });
    const c = document.createElement('canvas'); c.width = 1280; c.height = Math.round(1280 * tv.videoHeight / tv.videoWidth);
    c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height);
    out.push(c);
  }
  return out;
}
async function facesIn(c) {
  const found = [];
  const add = (dets, ox, oy, sx, sy) => { for (const d of dets) { const b = d.box; found.push({ x: (ox + b.x * sx) / c.width, y: (oy + b.y * sy) / c.height, w: b.width * sx / c.width, h: b.height * sy / c.height, s: d.score }); } };
  const opt = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6, maxResults: 10 });
  add(await faceapi.detectAllFaces(c, opt), 0, 0, 1, 1);
  // las cámaras de directo suelen ser pequeñas: miramos también cada cuarto ampliado
  const q = document.createElement('canvas'); q.width = c.width; q.height = c.height; const qx = q.getContext('2d');
  // las cámaras están pegadas a los bordes: miramos esquinas y lados ampliados (caras pequeñas)
  const tw = c.width / 3, th = c.height / 3;
  for (const [ox, oy] of [[0, 0], [c.width - tw, 0], [0, c.height - th], [c.width - tw, c.height - th], [0, th], [c.width - tw, th]]) {
    qx.drawImage(c, ox, oy, tw, th, 0, 0, q.width, q.height);
    add(await faceapi.detectAllFaces(q, opt), ox, oy, 1 / 3, 1 / 3);
  }
  // quitar duplicados
  found.sort((a, b) => b.s - a.s);
  const keep = [];
  for (const f of found) {
    const dup = keep.some(k => { const ix = Math.max(0, Math.min(f.x + f.w, k.x + k.w) - Math.max(f.x, k.x)), iy = Math.max(0, Math.min(f.y + f.h, k.y + k.h) - Math.max(f.y, k.y)); return ix * iy > 0.3 * Math.min(f.w * f.h, k.w * k.h); });
    if (!dup) keep.push(f);
  }
  return keep;
}
// bordes que no cambian en todo el clip (los del recuadro de la cámara)
function persistentEdges(frames) {
  // gradiente medio de todos los fotogramas: el borde entre la cámara y el contenido aparece aunque ambos cambien
  const w = 480, h = Math.round(480 * frames[0].height / frames[0].width), n = w * h;
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const tx = tmp.getContext('2d', { willReadFrequently: true });
  const gx = new Float32Array(n), gy = new Float32Array(n), g = new Float32Array(n);
  for (const f of frames) {
    tx.drawImage(f, 0, 0, w, h);
    const d = tx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < n; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; gx[i] += Math.abs(g[i + 1] - g[i - 1]) / frames.length; gy[i] += Math.abs(g[i + w] - g[i - w]) / frames.length;
    }
  }
  return { w, h, gx, gy };
}
function lineCandidates(E, vertical, from, to, frameEdge) {
  // posiciones con línea recta fija larga; cada una guarda sumas acumuladas para medir tramos
  const { w, h, gx, gy } = E, N = vertical ? w : h, M = vertical ? h : w;
  const lo = Math.max(1, Math.round(Math.min(from, to) * N)), hi = Math.min(N - 2, Math.round(Math.max(from, to) * N));
  const cands = [];
  for (let p = lo; p <= hi; p++) {
    const pre = new Uint16Array(M + 1); let run = 0, longest = 0;
    for (let q = 0; q < M; q++) {
      const v = Math.max(vertical ? gx[q * w + p] : gy[p * w + q], vertical ? gx[q * w + p + 1] : gy[(p + 1) * w + q]);
      const on = v > 16 ? 1 : 0;
      pre[q + 1] = pre[q] + on;
      run = on ? run + 1 : 0; if (run > longest) longest = run;
    }
    cands.push({ pos: p / N, pre, longest, M });
  }
  cands.sort((a, b) => b.longest - a.longest);
  const pick = [];
  for (const c of cands) { if (pick.length >= 8) break; if (c.longest < 12) break; if (pick.every(p => Math.abs(p.pos - c.pos) * N > 3)) pick.push(c); }
  if (frameEdge != null) pick.push({ pos: frameEdge, frame: true });
  return pick;
}
const coverage = (c, a, b) => {
  if (c.frame) return 1;
  const i0 = Math.max(0, Math.round(a * c.M)), i1 = Math.min(c.M, Math.round(b * c.M));
  return i1 - i0 < 4 ? 0 : (c.pre[i1] - c.pre[i0]) / (i1 - i0);
};
function camRectFromFace(f, E) {
  const cx = f.x + f.w / 2;
  const Ls = lineCandidates(E, true, f.x - f.w * 0.1, Math.max(0, f.x - f.w * 14), 0);
  const Rs = lineCandidates(E, true, f.x + f.w * 1.1, Math.min(1, f.x + f.w * 15), 1);
  const Ts = lineCandidates(E, false, f.y - f.h * 0.1, Math.max(0, f.y - f.h * 10), 0);
  const Bs = lineCandidates(E, false, f.y + f.h * 1.5, Math.min(1, f.y + f.h * 14), 1);
  // el recuadro de la cámara: 4 bordes completos (o el borde del vídeo) que rodean la cara
  let best = null;
  for (const L of Ls) for (const R of Rs) for (const T of Ts) for (const B of Bs) {
    const cov = Math.min(coverage(L, T.pos, B.pos), coverage(R, T.pos, B.pos), coverage(T, L.pos, R.pos), coverage(B, L.pos, R.pos));
    if (cov < 0.92) continue;
    const area = (R.pos - L.pos) * (B.pos - T.pos);
    const real = [L, R, T, B].filter(x => !x.frame).length;
    if (real < 2) continue;
    // más bordes reales primero; a igualdad, el recuadro más grande (los muebles del fondo quedan dentro)
    if (!best || real > best.real || (real === best.real && area > best.area)) best = { L, R, T, B, cov, area, real };
  }
  if (best) {
    const ins = 0.004;
    return { x: best.L.pos + (best.L.frame ? 0 : ins), y: best.T.pos + (best.T.frame ? 0 : ins),
             w: best.R.pos - best.L.pos - (best.L.frame ? 0 : ins) - (best.R.frame ? 0 : ins),
             h: best.B.pos - best.T.pos - (best.T.frame ? 0 : ins) - (best.B.frame ? 0 : ins), edges: best.real };
  }
  // sin recuadro claro: estimación por el tamaño de la cara
  const l = Math.max(0, cx - f.w * 1.9), r = Math.min(1, cx + f.w * 1.9), t = Math.max(0, f.y - f.h * 1.1), b = Math.min(1, f.y + f.h * 2.6);
  return { x: l, y: t, w: r - l, h: b - t, edges: 0 };
}
// plan B: búsqueda completa en cada esquina de un recuadro cuyos 4 lados sean líneas rectas (o el borde del vídeo)
function cornerRects(E) {
  const { w, h, gx, gy } = E, T = 16;
  const colPre = [], rowPre = [];
  for (let x = 0; x < w - 1; x++) { const p = new Uint16Array(h + 1); for (let y = 0; y < h; y++) p[y + 1] = p[y] + (Math.max(gx[y * w + x], gx[y * w + x + 1]) > T ? 1 : 0); colPre.push(p); }
  for (let y = 0; y < h - 1; y++) { const p = new Uint16Array(w + 1); for (let x = 0; x < w; x++) p[x + 1] = p[x] + (Math.max(gy[y * w + x], gy[(y + 1) * w + x]) > T ? 1 : 0); rowPre.push(p); }
  const colCov = (x, y0, y1) => (x <= 0 || x >= w - 1) ? 1 : (y1 - y0 < 4 ? 0 : (colPre[x][y1] - colPre[x][y0]) / (y1 - y0));
  const rowCov = (y, x0, x1) => (y <= 0 || y >= h - 1) ? 1 : (x1 - x0 < 4 ? 0 : (rowPre[y][x1] - rowPre[y][x0]) / (x1 - x0));
  const strongest = (isCol, from, to, n) => {   // líneas más marcadas de una banda, más el borde del vídeo
    const out = [];
    for (let p = Math.max(1, from); p <= Math.min((isCol ? w : h) - 2, to); p++) out.push({ p, s: isCol ? colPre[p][h] : rowPre[p][w] });
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, n).map(o => o.p);
  };
  const res = [];
  for (const [cx, cy, name] of [[0, 0, 'tl'], [1, 0, 'tr'], [0, 1, 'bl'], [1, 1, 'br']]) {
    const innerC = cx ? [Math.round(w * 0.45), Math.round(w * 0.9)] : [Math.round(w * 0.1), Math.round(w * 0.55)];
    const innerR = cy ? [Math.round(h * 0.38), Math.round(h * 0.88)] : [Math.round(h * 0.12), Math.round(h * 0.62)];
    const outerC = cx ? [w, ...strongest(true, Math.round(w * 0.93), w - 2, 3)] : [0, ...strongest(true, 1, Math.round(w * 0.07), 3)];
    const outerR = cy ? [h, ...strongest(false, Math.round(h * 0.9), h - 2, 3)] : [0, ...strongest(false, 1, Math.round(h * 0.1), 3)];
    let best = null;
    for (let ic = innerC[0]; ic <= innerC[1]; ic++) for (let ir = innerR[0]; ir <= innerR[1]; ir++) for (const oc of outerC) for (const orr of outerR) {
      const x0 = cx ? ic : oc, x1 = cx ? oc : ic, y0 = cy ? ir : orr, y1 = cy ? orr : ir;
      const rw = (x1 - x0) / w, rh = (y1 - y0) / h;
      if (rw < 0.1 || rh < 0.12) continue;
      const area = rw * rh, asp = (rw * 16 / 9) / rh;
      if (area < 0.02 || area > 0.3 || asp < 0.7 || asp > 2.6) continue;
      const cIn = Math.min(colCov(ic, y0, y1), rowCov(ir, x0, x1));
      if (cIn < 0.75) continue;
      // el borde de la cámara se acaba en su esquina; una línea del contenido sigue de largo
      const ey = Math.round(h * 0.15), ex = Math.round(w * 0.15);
      const extC = cy ? colCov(ic, Math.max(0, y0 - ey), Math.max(0, y0 - 2)) : colCov(ic, Math.min(h, y1 + 2), Math.min(h, y1 + ey));
      const extR = cx ? rowCov(ir, Math.max(0, x0 - ex), Math.max(0, x0 - 2)) : rowCov(ir, Math.min(w, x1 + 2), Math.min(w, x1 + ex));
      if (extC > 0.92 || extR > 0.92) continue;   // solo descarta líneas que siguen de largo casi perfectas
      const cov = Math.min(cIn, colCov(oc, y0, y1), rowCov(orr, x0, x1));
      if (cov < 0.75) continue;
      res.push({ x: x0 / w, y: y0 / h, w: rw, h: rh, area, cov, corner: name, real: 2 + (oc > 0 && oc < w ? 1 : 0) + (orr > 0 && orr < h ? 1 : 0) });
    }
  }
  // quitar casi-duplicados (líneas de 2 px de grosor): nos quedamos con el de más cobertura
  res.sort((a, b) => b.cov - a.cov || b.area - a.area);
  const keep = [];
  for (const r of res) if (!keep.some(k => Math.abs(k.x - r.x) < 0.01 && Math.abs(k.y - r.y) < 0.015 && Math.abs(k.w - r.w) < 0.012 && Math.abs(k.h - r.h) < 0.02)) keep.push(r);
  return keep.slice(0, 40);
}
// plan C: la cámara suele ser una zona de esquina que cambia distinto que el resto (el juego/partido cambia mucho, la cámara poco)
function varianceRects(frames) {
  const w = 240, h = Math.round(240 * frames[0].height / frames[0].width), n = w * h, F = frames.length;
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; const tx = tmp.getContext('2d', { willReadFrequently: true });
  const mean = new Float32Array(n), m2 = new Float32Array(n);
  frames.forEach((f, k) => {
    tx.drawImage(f, 0, 0, w, h);
    const d = tx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < n; i++) { const v = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11, dl = v - mean[i]; mean[i] += dl / (k + 1); m2[i] += dl * (v - mean[i]); }
  });
  const I = new Float64Array((w + 1) * (h + 1));   // imagen integral de "píxel quieto"
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += Math.sqrt(m2[y * w + x] / F) < 14 ? 1 : 0; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const sum = (x0, y0, x1, y1) => { x0 = Math.max(0, Math.min(w, x0)); x1 = Math.max(0, Math.min(w, x1)); y0 = Math.max(0, Math.min(h, y0)); y1 = Math.max(0, Math.min(h, y1));
    if (x1 <= x0 || y1 <= y0) return [0, 0]; return [I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0], (x1 - x0) * (y1 - y0)]; };
  const frac = r => r[1] ? r[0] / r[1] : 0;
  const totalStatic = frac(sum(0, 0, w, h));
  if (totalStatic > 0.85) return [];   // todo quieto: este método no sirve
  const out = [], B = 5;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    let best = null;
    for (let rw = Math.round(w * 0.12); rw <= w * 0.55; rw += 2) for (let rh = Math.round(h * 0.15); rh <= h * 0.65; rh += 2) {
      const x0 = cx ? w - rw : 0, y0 = cy ? h - rh : 0, x1 = x0 + rw, y1 = y0 + rh;
      const inside = frac(sum(x0, y0, x1, y1));
      const sideV = cx ? sum(x0 - B, y0, x0, y1) : sum(x1, y0, x1 + B, y1);
      const sideH = cy ? sum(x0, y0 - B, x1, y0) : sum(x0, y1, x1, y1 + B);
      const outside = (sideV[0] + sideH[0]) / Math.max(1, sideV[1] + sideH[1]);
      const score = inside - outside;
      if (inside > 0.55 && outside < 0.5 && (!best || score > best.score + 0.01 || (score > best.score - 0.01 && rw * rh > best.rw * best.rh))) best = { score, rw, rh, x0, y0 };
    }
    const m = 0.008;   // un pelín hacia dentro para no coger el borde del contenido
    if (best && best.score > 0.3) out.push({ x: best.x0 / w + m, y: best.y0 / h + m, w: best.rw / w - 2 * m, h: best.rh / h - 2 * m, area: best.rw * best.rh / n, cov: best.score, real: 0, kind: 'var' });
  }
  return out;
}
// cámaras pegadas a un lado (no en esquina): recuadro que toca un solo borde del vídeo
function sideRects(E) {
  const { w, h, gx, gy } = E, T = 16, res = [];
  const colPre = [], rowPre = [];
  for (let x = 0; x < w - 1; x++) { const p = new Uint16Array(h + 1); for (let y = 0; y < h; y++) p[y + 1] = p[y] + (Math.max(gx[y * w + x], gx[y * w + x + 1]) > T ? 1 : 0); colPre.push(p); }
  for (let y = 0; y < h - 1; y++) { const p = new Uint16Array(w + 1); for (let x = 0; x < w; x++) p[x + 1] = p[x] + (Math.max(gy[y * w + x], gy[(y + 1) * w + x]) > T ? 1 : 0); rowPre.push(p); }
  const colCov = (x, y0, y1) => (x <= 0 || x >= w - 1) ? 1 : (y1 - y0 < 4 ? 0 : (colPre[x][y1] - colPre[x][y0]) / (y1 - y0));
  const rowCov = (y, x0, x1) => (y <= 0 || y >= h - 1) ? 1 : (x1 - x0 < 4 ? 0 : (rowPre[y][x1] - rowPre[y][x0]) / (x1 - x0));
  const push = (x0, y0, x1, y1, cov) => { const rw = (x1 - x0) / w, rh = (y1 - y0) / h, area = rw * rh, asp = (rw * 16 / 9) / rh;
    if (rw < 0.1 || rh < 0.12 || area < 0.02 || area > 0.3 || asp < 0.7 || asp > 2.6) return; res.push({ x: x0 / w, y: y0 / h, w: rw, h: rh, area, cov, real: 3 }); };
  // izquierda / derecha
  for (const left of [true, false]) {
    const edge = left ? 0 : w;
    for (let ic = Math.round(w * (left ? 0.1 : 0.45)); ic <= Math.round(w * (left ? 0.55 : 0.9)); ic += 2)
      for (let y0 = Math.round(h * 0.06); y0 <= Math.round(h * 0.8); y0 += 2) {
        const r0 = rowCov(y0, left ? 0 : ic, left ? ic : w); if (r0 < 0.75) continue;
        for (let y1 = y0 + Math.round(h * 0.12); y1 <= Math.round(h * 0.94); y1 += 2) {
          const x0 = left ? edge : ic, x1 = left ? ic : edge;
          const c = Math.min(r0, rowCov(y1, x0, x1), colCov(ic, y0, y1)); if (c >= 0.75) push(x0, y0, x1, y1, c);
        }
      }
  }
  // arriba / abajo
  for (const top of [true, false]) {
    const edge = top ? 0 : h;
    for (let ir = Math.round(h * (top ? 0.12 : 0.38)); ir <= Math.round(h * (top ? 0.62 : 0.88)); ir += 2)
      for (let x0 = Math.round(w * 0.06); x0 <= Math.round(w * 0.8); x0 += 2) {
        const c0 = colCov(x0, top ? 0 : ir, top ? ir : h); if (c0 < 0.75) continue;
        for (let x1 = x0 + Math.round(w * 0.1); x1 <= Math.round(w * 0.94); x1 += 2) {
          const y0 = top ? edge : ir, y1 = top ? ir : edge;
          const c = Math.min(c0, colCov(x1, y0, y1), rowCov(ir, x0, x1)); if (c >= 0.75) push(x0, y0, x1, y1, c);
        }
      }
  }
  res.sort((a, b) => b.cov - a.cov || b.area - a.area);
  const keep = [];
  for (const r of res) { if (keep.length >= 40) break; if (!keep.some(k => Math.abs(k.x - r.x) < 0.01 && Math.abs(k.y - r.y) < 0.015 && Math.abs(k.w - r.w) < 0.012 && Math.abs(k.h - r.h) < 0.02)) keep.push(r); }
  return keep;
}
/* aviso con animación de IA encima de la vista previa */
let aiovT0 = 0;
function aiov(state, title, sub) {
  const ov = $('aiov');
  if (state === 'hide') { ov.hidden = true; return; }
  ov.hidden = false; ov.dataset.state = state;
  $('aiovT').textContent = title; $('aiovS').textContent = sub || '';
  $('aiovActions').hidden = state !== 'fail';
  if (state === 'work' && !aiovT0) aiovT0 = performance.now();
}
async function aiovDone(ok, title, sub) {
  const wait = Math.max(0, 1600 - (performance.now() - aiovT0)); aiovT0 = 0;   // que se vea el análisis aunque sea rápido
  await sleep(wait);
  aiov(ok ? 'ok' : 'fail', title, sub);
  if (ok) setTimeout(() => aiov('hide'), 1400);
}
$('aiovManual').onclick = () => { aiov('hide'); enterCrop('cam'); };
$('aiovClose').onclick = () => aiov('hide');
function contentAround(cam) {
  const opts = [
    { x: 0, y: 0, w: cam.x, h: 1 }, { x: cam.x + cam.w, y: 0, w: 1 - cam.x - cam.w, h: 1 },
    { x: 0, y: 0, w: 1, h: cam.y }, { x: 0, y: cam.y + cam.h, w: 1, h: 1 - cam.y - cam.h },
  ].filter(o => o.w > 0.25 && o.h > 0.25);
  if (!opts.length) return { x: 0, y: 0, w: 1, h: 1 };
  opts.sort((a, b) => b.w * b.h - a.w * a.h);
  const o = opts[0], m = 0.01;
  return { x: o.x + m, y: o.y + m, w: Math.max(0.1, o.w - 2 * m), h: Math.max(0.1, o.h - 2 * m) };
}
// encuadre de la cámara: sin marco, con la proporción de la zona de arriba y la persona en el centro
function computeCam(cam, face) {
  const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080;
  // 1) recortar hacia dentro para que nunca se vea el marco del recuadro ni nada de fuera
  const ix = Math.max(cam.w * 0.04, 12 / vw), iy = Math.max(cam.h * 0.04, 12 / vh);
  const L = cam.x <= 0.002 ? 0 : ix, R = cam.x + cam.w >= 0.998 ? 0 : ix;
  const T = cam.y <= 0.002 ? 0 : iy, B = cam.y + cam.h >= 0.998 ? 0 : iy;
  cam = { x: cam.x + L, y: cam.y + T, w: cam.w - L - R, h: cam.h - T - B };
  // 2) la proporción exacta de la zona de arriba
  const fcx = Math.min(cam.x + cam.w, Math.max(cam.x, face.x + face.w / 2));
  const outAsp = W / (H * (+$('ratio').value / 100));
  const k = (vh / vw) * outAsp;            // ancho normalizado = alto normalizado * k
  const bottom = cam.y + cam.h;
  const wide = face.h / cam.h < 0.18;
  let h = wide ? Math.min(cam.h, Math.max(face.h / 0.34, bottom - (face.y - face.h * 0.8))) : cam.h;
  let w = h * k;
  if (w > cam.w) { w = cam.w; h = w / k; }
  // 3) si la persona no queda centrada, acercamos lo justo para centrarla (sin pasarnos de zoom)
  const room = 2 * Math.min(fcx - cam.x, cam.x + cam.w - fcx);
  const minW = Math.min(w, face.w / 0.42, face.h / 0.55 * k);
  if (w > room) w = Math.max(minW, room), h = w / k;
  const x = Math.min(Math.max(fcx - w / 2, cam.x), cam.x + cam.w - w);
  // 4) abajo pegado (no se corta el cuerpo), pero sin cortar la cabeza
  let y = bottom - h;
  const headTop = face.y - face.h * 0.45;
  if (headTop < y) y = Math.max(cam.y, headTop);
  if (y + h > bottom) y = bottom - h;
  return { cam: { x, y, w, h }, camFx: Math.min(1, Math.max(0, (face.x + face.w / 2 - x) / w)), wide };
}
function applyCamResult(cam, face, source) {
  const st = $('camStatus');
  const r = computeCam(cam, face);
  zones = [];
  crops.cam = r.cam; crops.camFx = r.camFx; crops.content = contentAround(cam); delete crops.fit; delete crops.zk; delete crops.kind;
  setRange('offX', 0); setRange('offY', 0); setRange('zoom', 100);
  camDetectedFor = file;
  setStatus(st, (r.wide ? 'Cámara gran angular detectada: he acercado a la persona sin cortar la parte de abajo. ' : 'Cámara detectada. ')
    + (source === 'Gemini' ? '(Gemini) ' : '') + 'Si no es exacta, doble clic arriba para ajustarla.', 'ok');
  pushHistory();
  aiovDone(true, r.wide ? 'Cámara detectada · zoom a la persona' : 'Cámara detectada', 'Si no es exacta, doble clic arriba para ajustarla.');
}


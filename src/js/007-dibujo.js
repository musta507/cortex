/* ---------- dibujo ---------- */
const blurCv = document.createElement('canvas'); blurCv.width = 54; blurCv.height = 96;
const blurCtx = blurCv.getContext('2d');
const midCv = document.createElement('canvas'), midCtx = midCv.getContext('2d');
// fondo difuminado estable: se reduce en dos pasos con filtro de calidad (sin parpadeo ni «ruido» de píxeles)
function blurInto(src, sx, sy, sw, sh, R, lvl) {
  const bw = Math.max(8, Math.round([0, 216, 108, 54, 27][lvl] * R.w / W)), bh = Math.max(8, Math.round(bw * R.h / R.w));
  const mw = Math.min(Math.round(R.w / 2), bw * 4), mh = Math.round(mw * R.h / R.w);
  if (midCv.width !== mw || midCv.height !== mh) { midCv.width = mw; midCv.height = mh; }
  if (blurCv.width !== bw || blurCv.height !== bh) { blurCv.width = bw; blurCv.height = bh; }
  const r = Math.max(mw / sw, mh / sh) * 1.15;
  midCtx.imageSmoothingEnabled = true; midCtx.imageSmoothingQuality = 'high';
  midCtx.drawImage(src, sx, sy, sw, sh, (mw - sw * r) / 2, (mh - sh * r) / 2, sw * r, sh * r);
  blurCtx.imageSmoothingEnabled = true; blurCtx.imageSmoothingQuality = 'high';
  blurCtx.filter = 'blur(2px)';
  blurCtx.drawImage(midCv, 0, 0, bw, bh);
  blurCtx.filter = 'none';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(blurCv, 0, 0, bw, bh, R.x, R.y, R.w, R.h);
  ctx.fillStyle = `rgba(0,0,0,${[0, .3, .38, .45, .5][lvl]})`; ctx.fillRect(R.x, R.y, R.w, R.h);
}

function wrapWords(words, maxW) {
  const space = ctx.measureText(' ').width;
  const lines = []; let line = [], lw = 0;
  for (const w of words) {
    const ww = measR(w.t);
    if (line.length && lw + space + ww > maxW) { lines.push({ words: line, w: lw }); line = []; lw = 0; }
    lw += (line.length ? space : 0) + ww; line.push({ ...w, w: ww });
  }
  if (line.length) lines.push({ words: line, w: lw });
  return { lines, space };
}
// igual, pero con las líneas lo más parecidas posible de largo (mismo número de líneas, sin una última línea corta)
function wrapBalanced(words, maxW) {
  const g = wrapWords(words, maxW); if (g.lines.length < 2) return g;
  const n = g.lines.length;
  let lo = Math.max(...g.lines.flatMap(l => l.words.map(w => w.w))), hi = maxW;
  for (let i = 0; i < 18 && hi - lo > 1; i++) { const mid = (lo + hi) / 2; if (wrapWords(words, mid).lines.length <= n) hi = mid; else lo = mid; }
  return wrapWords(words, hi + 0.5);
}
// desplazamiento vertical para centrar ópticamente el texto en una línea
function textMid() { const m = ctx.measureText('HÁgj'); return (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2; }
// centrado del «cuerpo» de las letras, sin contar tildes ni letras largas (l, t, g, p…): misma separación arriba y abajo.
// En MAYÚSCULAS se centra la altura de las mayúsculas; si no, la de las minúsculas (la x)
const hasLower = t => /\p{Ll}/u.test(String(t || ''));
function bodyMid(upperish) { const m = ctx.measureText(upperish ? 'H' : 'x'); return 0.9 * (m.actualBoundingBoxAscent / 2) + 0.1 * textMid(); }
function roundBox(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  ctx.fill();
}

// cajas por línea unidas como en CapCut: las líneas que se tocan forman una sola forma,
// con las esquinas de fuera redondeadas y las de dentro (donde cambia el ancho) redondeadas hacia dentro
function drawRowBoxes(rs, r) {
  // cada línea conserva su caja entera (con su margen); donde se tocan, se dibuja la unión de todas
  const groups = [];
  for (const q0 of rs) {
    const q = { ...q0 }, g = groups[groups.length - 1], p = g && g[g.length - 1];
    if (p && q.y0 <= p.y1 + 1) g.push(q); else groups.push([q]);
  }
  for (const g of groups) {
    // anchos casi iguales: mismo borde (sin escalones diminutos)
    // (escalones pequeños, hasta ~32 px o el radio de la esquina: se hace una línea recta con la caja más ancha)
    const TOL = Math.max(32, (r || 0) * 1.2);
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < g.length; i++) {
      if (Math.abs(g[i].x0 - g[i - 1].x0) < TOL) g[i].x0 = g[i - 1].x0 = Math.min(g[i].x0, g[i - 1].x0);
      if (Math.abs(g[i].x1 - g[i - 1].x1) < TOL) g[i].x1 = g[i - 1].x1 = Math.max(g[i].x1, g[i - 1].x1);
    }
    const n = g.length, V = [];
    // lado derecho, de arriba abajo: el escalón va en el borde de la caja más ancha
    V.push([g[0].x1, g[0].y0]);
    for (let i = 0; i < n - 1; i++) {
      const u = g[i], l = g[i + 1];
      if (l.x1 < u.x1) V.push([u.x1, u.y1], [l.x1, u.y1]);
      else if (l.x1 > u.x1) V.push([u.x1, l.y0], [l.x1, l.y0]);
    }
    V.push([g[n - 1].x1, g[n - 1].y1], [g[n - 1].x0, g[n - 1].y1]);
    // lado izquierdo, de abajo arriba
    for (let i = n - 1; i > 0; i--) {
      const l = g[i], u = g[i - 1];
      if (u.x0 < l.x0) V.push([l.x0, u.y1], [u.x0, u.y1]);
      else if (u.x0 > l.x0) V.push([l.x0, l.y0], [u.x0, l.y0]);
    }
    V.push([g[0].x0, g[0].y0]);
    const m = V.length, d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    ctx.beginPath(); ctx.moveTo((g[0].x0 + g[0].x1) / 2, g[0].y0);
    for (let k = 0; k < m; k++) {
      const v = V[k], nx = V[(k + 1) % m], pv = V[(k - 1 + m) % m];
      ctx.arcTo(v[0], v[1], nx[0], nx[1], Math.max(0, Math.min(r, d(v, nx) / 2, d(v, pv) / 2)));
    }
    ctx.closePath(); ctx.fill();
  }
}

/* geometría de la composición: dónde va el vídeo, la imagen y la línea divisoria */
const DEFAULT_CROPS = { cam: { x: 0.74, y: 0.66, w: 0.26, h: 0.34 }, content: { x: 0.05, y: 0.05, w: 0.68, h: 0.9 }, camFx: 0.5 };
const crops = JSON.parse(JSON.stringify(DEFAULT_CROPS));   // zonas del clip (0-1) para el formato Reacción
// llamada (Discord): de 2 a 5 personas, cada una en su franja
const callOn = () => layoutMode === 'react' && $('duo').checked && $('call').checked;
const cget = (CR, w) => !CR ? null : /^p\d$/.test(w) ? (CR.more || [])[+w.slice(1) - 2] : CR[w];
function layout(s, vw, vh, t) {
  const eT = Math.max(0, s.edgeT || 0), eB = Math.max(0, s.edgeB || 0), T0 = eT, AH = Math.max(200, H - eT - eB);
  if (layoutMode === 'react') {
    const cr0 = cropsAt(t || 0), nC = callOn() ? Math.max(2, Math.min(5, cr0.n || 2)) : 0;
    const cH = nC ? Math.round(AH / nC) : Math.round(AH * s.ratio);
    const ir = { x: 0, y: T0, w: W, h: cH }, vr = { x: 0, y: T0 + cH, w: W, h: nC ? cH : AH - cH };
    const more = [];
    if (nC > 2) for (let i = 2; i < nC; i++) { const y = T0 + Math.round(AH * i / nC), y2 = T0 + Math.round(AH * (i + 1) / nC); more.push({ R: { x: 0, y, w: W, h: y2 - y }, k: (cr0.more || [])[i - 2] || cr0.cam }); }
    const cr = cr0, k = cr.content, sw = vw * k.w, sh = vh * k.h;
    const contain = cr.fit === 'contain';
    const sc = (contain ? Math.min(vr.w / sw, vr.h / sh) : Math.max(vr.w / sw, vr.h / sh)) * (cr.zk || 1) * s.zoom;
    const dw = sw * sc, dh = sh * sc;
    const cx = vr.x + vr.w / 2 + s.offX, cy = vr.y + vr.h / 2 + s.offY;
    // el vídeo no se corta: se dibuja entero (el recorte solo dice el encuadre de partida), así al moverlo o alejarlo se ve el resto
    // (con un tweet o una web «entera» se queda como estaba, con el fondo difuminado, hasta que lo muevas o cambies el zoom)
    const crop = { x: vw * k.x, y: vh * k.y, w: sw, h: sh }, v0 = { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh };
    const whole = !contain || s.zoom !== 1 || s.offX || s.offY;
    return { split: true, react: true, vr, ir, seam: T0 + cH, top: T0, bot: T0 + AH, more: more.length ? more : null, call: nC, cr, contain, crop,
             src: whole ? { x: 0, y: 0, w: vw, h: vh } : crop,
             video: whole ? { x: v0.x - vw * k.x * sc, y: v0.y - vh * k.y * sc, w: vw * sc, h: vh * sc } : v0, subArea: vr };
  }
  if (layoutMode === 'split') {
    const vH = Math.round(AH * s.ratio), iH = AH - vH;
    const vr = imgPos === 'bottom' ? { x: 0, y: T0, w: W, h: vH } : { x: 0, y: T0 + iH, w: W, h: vH };
    const ir = imgPos === 'bottom' ? { x: 0, y: T0 + vH, w: W, h: iH } : { x: 0, y: T0, w: W, h: iH };
    const sc = Math.max(vr.w / vw, vr.h / vh) * s.zoom;     // el vídeo llena su parte
    const dw = vw * sc, dh = vh * sc;
    const cx = vr.x + vr.w / 2 + s.offX, cy = vr.y + vr.h / 2 + s.offY;
    return { split: true, vr, ir, seam: T0 + (imgPos === 'bottom' ? vH : iH), top: T0, bot: T0 + AH,
             video: { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh }, subArea: vr };
  }
  if (clipMeta.cam) {   // solo la cámara del streamer (p. ej. casino: el juego no se enseña)
    const k = clipMeta.cam, sw = vw * k.w, sh = vh * k.h, sc = (W / sw) * s.zoom, dw = sw * sc, dh = sh * sc;
    const v = { x: W / 2 + s.offX - dw / 2, y: H / 2 + s.offY - dh / 2, w: dw, h: dh };
    return { split: false, vr: v, video: v, subArea: v, src: { x: vw * k.x, y: vh * k.y, w: sw, h: sh } };
  }
  const sc = (W / vw) * s.zoom;
  const dw = vw * sc, dh = vh * sc;
  const v = { x: W / 2 + s.offX - dw / 2, y: H / 2 + s.offY - dh / 2, w: dw, h: dh };
  // seguimiento de cara: el encuadre se mueve (suave) para que la persona quede centrada
  const tr = clipMeta.track;
  if (tr && tr.on && tr.p && tr.p.length && dw > W + 2) v.x = Math.min(0, Math.max(W - dw, W / 2 + s.offX - trackAt(tr, t || 0) * dw));
  return { split: false, vr: v, video: v, subArea: v };
}


/* ---------- giro de 1° (botón «Girar 1°») ----------
   El vídeo se gira sobre su centro y se esconde el giro con lo mínimo:
   · si llena su hueco: el zoom justo para que no asomen las esquinas;
   · si tiene fondo a la vista arriba y abajo (o a los lados): casi sin zoom, y el borde inclinado se recorta recto (el fondo hace de tira). */
const rotDeg = () => { const v = parseFloat(ezPref('antiRotDeg')); return isFinite(v) && v ? Math.max(-10, Math.min(10, v)) : 1; };   // grados elegidos (se quedan guardados); negativo = hacia la izquierda
const antiRot = () => ezPref('antiRot') === '1';
const rotFit = new Map();
function rotPlan(dx, dy, dw, dh, cR) {
  const deg = rotDeg(), key = [dx, dy, dw, dh, cR.x, cR.y, cR.w, cR.h].map(v => Math.round(v * 2)).join(',') + ',' + deg;
  let p = rotFit.get(key); if (p) return p;
  const th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), cx = dx + dw / 2, cy = dy + dh / 2;
  // lo que se ve del vídeo dentro de su hueco
  const V = { x: Math.max(dx, cR.x), y: Math.max(dy, cR.y) }; V.w = Math.min(dx + dw, cR.x + cR.w) - V.x; V.h = Math.min(dy + dh, cR.y + cR.h) - V.y;
  if (V.w <= 2 || V.h <= 2) { p = { th, s: 1, C: V, cx, cy }; rotFit.set(key, p); return p; }
  const need = C => { let m = 0; for (const [px, py] of [[C.x, C.y], [C.x + C.w, C.y], [C.x, C.y + C.h], [C.x + C.w, C.y + C.h]]) { const x = px - cx, y = py - cy; m = Math.max(m, Math.abs(x * c + y * sn) * 2 / dw, Math.abs(-x * sn + y * c) * 2 / dh); } return m; };   // zoom que hace falta para tapar C
  // bordes del vídeo que quedan a la vista dentro del hueco (detrás hay fondo): esos se pueden recortar rectos en vez de meter zoom
  const eT = dy > cR.y + 1, eB = dy + dh < cR.y + cR.h - 1, eL = dx > cR.x + 1, eR = dx + dw < cR.x + cR.w - 1;
  const sFull = Math.max(1, need(V));
  let best = { s: sFull, C: V, cost: 2 * (sFull - 1) };
  if (eT || eB || eL || eR) for (let i = 0; i <= 100; i++) {
    const s = 1 + (sFull - 1) * i / 100;
    let x0 = V.x, x1 = V.x + V.w, y0 = V.y, y1 = V.y + V.h;
    for (let k = 0; k < 3; k++) {   // cada borde se mete hacia dentro solo lo que hace falta para quedar recto
      const R = sn >= 0;   // hacia qué lado gira: cambia qué esquina es la que más se mete
      if (eT) y0 = Math.max(V.y, cy + (((R ? x1 : x0) - cx) * sn - s * dh / 2) / c);
      if (eB) y1 = Math.min(V.y + V.h, cy + (((R ? x0 : x1) - cx) * sn + s * dh / 2) / c);
      if (eL) x0 = Math.max(V.x, cx + (-s * dw / 2 - ((R ? y0 : y1) - cy) * sn) / c);
      if (eR) x1 = Math.min(V.x + V.w, cx + (s * dw / 2 - ((R ? y1 : y0) - cy) * sn) / c);
    }
    const C = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; if (C.w < V.w * 0.5 || C.h < V.h * 0.5 || need(C) > s + 1e-7) continue;
    const cost = 2 * (s - 1) + (V.h - C.h) / V.h + (V.w - C.w) / V.w;   // el zoom quita imagen por los cuatro lados: cuenta doble
    if (cost < best.cost - 1e-7) best = { s, C, cost };
  }
  p = { th, s: best.s * 1.0008, C: best.C, cx, cy };   // (una pizca de margen para que no asome ni una línea)
  if (rotFit.size > 300) rotFit.clear(); rotFit.set(key, p); return p;
}
function rotDraw(src, sr, dx, dy, dw, dh, cR) {
  const p = rotPlan(dx, dy, dw, dh, cR);
  ctx.save(); ctx.beginPath(); ctx.rect(p.C.x, p.C.y, p.C.w, p.C.h); ctx.clip();
  ctx.translate(p.cx, p.cy); ctx.rotate(p.th); ctx.scale(p.s, p.s);
  if (sr) ctx.drawImage(src, sr.x, sr.y, sr.w, sr.h, -dw / 2, -dh / 2, dw, dh); else ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
function drawCam(R, src, vw, vh, ready, cr) {
  cr = cr || crops;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.fillStyle = '#111318'; ctx.fillRect(R.x, R.y, R.w, R.h);
  if (ready) {
    const k = cr.cam, sw = vw * k.w, sh = vh * k.h;
    const sc = Math.max(R.w / sw, R.h / sh), dw = sw * sc, dh = sh * sc;
    // se ancla abajo (no se corta el cuerpo) y se centra en la persona
    const fx = cr.camFx == null ? 0.5 : cr.camFx;
    const dx = Math.min(R.x, Math.max(R.x + R.w - dw, R.x + R.w / 2 - fx * dw));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (antiRot()) rotDraw(src, { x: vw * k.x, y: vh * k.y, w: sw, h: sh }, dx, R.y + R.h - dh, dw, dh, R);
    else ctx.drawImage(src, vw * k.x, vh * k.y, sw, sh, dx, R.y + R.h - dh, dw, dh);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '600 36px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Aquí irá la cámara del streamer', R.x + R.w / 2, R.y + R.h / 2);
  }
  ctx.restore();
}
// botón «Pegar imagen» dibujado en el hueco (al hacer clic pega la imagen copiada)
function drawPasteBtn(R, y) {
  const bw = Math.min(R.w - 80, 560), bh = 96, bx = R.x + (R.w - bw) / 2;
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = 'rgba(110,151,255,.6)'; ctx.shadowBlur = 30;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, y - bh / 2, bw, bh, 26); else ctx.rect(bx, y - bh / 2, bw, bh); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#08080A'; ctx.font = '800 40px Inter, sans-serif';
  ctx.fillText('Pegar imagen', R.x + R.w / 2, y + 2);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '600 26px Inter, sans-serif';
  ctx.fillText('Copia una imagen y haz clic aquí · o Ctrl+V · o arrástrala', R.x + R.w / 2, y + bh / 2 + 40);
  ctx.restore();
}
function drawImageIn(R, s) {
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
  ctx.fillStyle = '#16181f'; ctx.fillRect(R.x, R.y, R.w, R.h);
  if (img) {
    const c = crop || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const sc = Math.max(R.w / c.w, R.h / c.h) * s.imgZoom;
    const dw = c.w * sc, dh = c.h * sc;
    const cx = R.x + R.w / 2 + imgOff.x, cy = R.y + R.h / 2 + imgOff.y;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const im = img === rxVid && rxFrame ? rxFrame : img;   // al exportar, el fotograma exacto del segundo vídeo
    if (im !== rxVid || rxVid.readyState >= 2) ctx.drawImage(im, c.x, c.y, c.w, c.h, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (clipMeta.imgPrompt) {   // el agente dice qué imagen hace falta
      ctx.strokeStyle = 'rgba(255,210,63,.8)'; ctx.lineWidth = 4; ctx.setLineDash([18, 12]); ctx.strokeRect(R.x + 30, R.y + 30, R.w - 60, R.h - 60); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd23f'; ctx.font = '800 40px Inter, sans-serif'; ctx.fillText('Pega aquí una imagen de:', R.x + R.w / 2, R.y + R.h / 2 - 70);
      ctx.fillStyle = '#fff'; ctx.font = '700 38px Inter, sans-serif';
      const { lines } = wrapWords(clipMeta.imgPrompt.split(/\s+/).map(t => ({ t })), R.w - 140);
      lines.slice(0, 4).forEach((l, i) => ctx.fillText(l.words.map(w => w.t).join(' '), R.x + R.w / 2, R.y + R.h / 2 - 10 + i * 48));
      drawPasteBtn(R, R.y + R.h - 120);
    } else drawPasteBtn(R, R.y + R.h / 2 - 30);
  }
  ctx.restore();
}

function drawCropUI() {
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
  const g = cropGeom();
  const CS = cropSrc();
  ctx.drawImage(CS.el, g.ox, g.oy, CS.w * g.s, CS.h * g.s);
  const r = { x: g.ox + cropTmp.x * g.s, y: g.oy + cropTmp.y * g.s, w: cropTmp.w * g.s, h: cropTmp.h * g.s };
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(r.x, r.y, r.w, r.h); ctx.fill('evenodd');
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = 'rgba(255,210,63,.45)'; ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(r.x + r.w * i / 3, r.y); ctx.lineTo(r.x + r.w * i / 3, r.y + r.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h * i / 3); ctx.lineTo(r.x + r.w, r.y + r.h * i / 3); ctx.stroke();
  }
  ctx.fillStyle = '#ffd23f';
  for (const [hx, hy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) ctx.fillRect(hx - 14, hy - 14, 28, 28);
  ctx.restore();
}

// formato por escenas: cada tramo del clip puede llevar su propio encuadre (se guarda en clipMeta.scenes)
let sceneOv = null;
const S = () => { const s = S0(); if (sceneOv && sceneOv.s) Object.assign(s, sceneOv.s); return s; };
function sceneAt(t) { const sc = clipMeta.scenes; if (!sc || !sc.length) return null; for (const x of sc) if (t >= x.s - 1e-3 && t < x.e) return x; return null; }
function draw(t, forExport, src, T) {
  const sc = (!cropMode || forExport) && layoutMode !== 'split' ? sceneAt(t) : null, ov = sc && sc.ov;
  if (!ov) return draw0(t, forExport, src, T);
  const k = [layoutMode, clipMeta.cam, clipMeta.track];
  layoutMode = ov.mode; if (ov.cam) clipMeta.cam = ov.cam; else delete clipMeta.cam;
  if (ov.track) clipMeta.track = ov.track; else delete clipMeta.track;
  sceneOv = ov;
  try { return draw0(t, forExport, src, T); }
  finally {
    layoutMode = k[0]; sceneOv = null;
    if (k[1]) clipMeta.cam = k[1]; else delete clipMeta.cam;
    if (k[2]) clipMeta.track = k[2]; else delete clipMeta.track;
  }
}
function draw0(t, forExport, src, T) {
  if (cropMode && !forExport) { drawCropUI(); return; }
  if (T == null) T = forExport ? t : curT();
  const s = S();
  src = src || vid;
  const isFrame = typeof VideoFrame !== 'undefined' && src instanceof VideoFrame;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

  const vw = (isFrame ? src.displayWidth : vid.videoWidth) || 1920;
  const vh = (isFrame ? src.displayHeight : vid.videoHeight) || 1080;
  const L = layout(s, vw, vh, t);
  lastLayout = L;
  const { x: dx, y: dy, w: dw, h: dh } = L.video;
  boxes.video = L.vr;
  const ready = isFrame || (src !== vid && !!src) || (loaded && vid.readyState >= 2);   // con la copia ligera (al arrastrar) hay imagen aunque el vídeo aún esté saltando

  // bandas de arriba y abajo (si se han movido los bordes): negras o con el vídeo difuminado
  if (L.split && (L.top > 0 || L.bot < H) && ready && String(s.bg).startsWith('blur')) blurInto(src, 0, 0, vw, vh, { x: 0, y: 0, w: W, h: H }, +s.bg.slice(4) || 2);
  if (L.react) drawCam(L.ir, src, vw, vh, ready, L.cr);
  else if (L.split) drawImageIn(L.ir, s);
  if (L.more) for (const m of L.more) drawCam(m.R, src, vw, vh, ready, { cam: m.k, camFx: 0.5 });
  if (L.split) {
    ctx.save(); ctx.beginPath(); ctx.rect(L.vr.x, L.vr.y, L.vr.w, L.vr.h); ctx.clip();
  }
  if (ready) {
    if (s.bg.startsWith('blur') && !L.split) {
      // fondo: el vídeo a pantalla completa, reducido y desenfocado (más reducido = más difuminado)
      if (L.src) blurInto(src, L.src.x, L.src.y, L.src.w, L.src.h, { x: 0, y: 0, w: W, h: H }, +s.bg.slice(4));
      else blurInto(src, 0, 0, vw, vh, { x: 0, y: 0, w: W, h: H }, +s.bg.slice(4));
    }
    // Reacción con contenido entero (tweet, web, YouTube): fondo difuminado del propio contenido
    if (L.react && L.contain) { const c0 = L.crop || L.src; blurInto(src, c0.x, c0.y, c0.w, c0.h, L.vr, 2); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (antiRot()) rotDraw(src, L.src || null, dx, dy, dw, dh, L.split || L.react ? L.vr : { x: 0, y: 0, w: W, h: H });
    else if (L.src) ctx.drawImage(src, L.src.x, L.src.y, L.src.w, L.src.h, dx, dy, dw, dh);
    else ctx.drawImage(src, dx, dy, dw, dh);
  } else if (!loaded) {
    const g = ctx.createLinearGradient(0, dy, W, dy + dh);
    g.addColorStop(0, '#1d2747'); g.addColorStop(1, '#3a2a55');
    ctx.fillStyle = g; ctx.fillRect(dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '600 34px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Tu clip horizontal aparecerá aquí', L.vr.x + L.vr.w / 2, L.vr.y + L.vr.h * 0.32);
  }
  if (L.split) ctx.restore();

  /* título */
  boxes.title = null;
  if (s.title.trim() && !trk.title.hide) {
    const isBox = titleStyle === 'box';
    const size = s.titleSize, lh = size * s.titleLH;
    const padX = isBox ? s.boxPX : 0, padY = isBox ? s.boxPY : 0;
    ctx.font = `${s.titleWeight} ${size}px "${s.titleFont}", Inter, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = (s.tLS || 0) + 'px';
    const maxW = s.titleW > 0 ? Math.max(120, s.titleW) : Math.max(320, W - 140 - padX * 2);   // ancho elegido con las asas de los lados
    const lines = []; let gi = 0;
    for (const para of s.title.split('\n')) {
      const ws = para.split(/\s+/).filter(Boolean).map(t => ({ t: s.titleUpper ? t.toLocaleUpperCase('es') : t, red: titleHL.has(gi++) }));
      if (ws.length) lines.push(...wrapBalanced(ws, maxW).lines);
    }
    const n = lines.length;
    const blockH = (n - 1) * lh + size;
    let top;
    if (L.split) {
      top = L.seam - blockH / 2;                 // pegado a la línea divisoria
    } else if (s.titleY >= 0) {
      top = H * s.titleY / 100 - blockH / 2;     // altura fija (p. ej. plantilla Podcast)
    } else {
      top = Math.max(0, dy) - 34 - blockH - padY;
      if (top < 150 + padY) top = 150 + padY;
    }
    top += pos.ty;
    const cx = W / 2 + pos.tx;
    const maxLW = Math.max(...lines.map(l => l.w));
    const space = ctx.measureText(' ').width, mid = bodyMid(s.titleUpper || !hasLower(s.title));
    boxes.title = { x: cx - maxLW / 2 - padX, y: top - padY, w: maxLW + 2 * padX, h: blockH + 2 * padY };

    if (isBox) {
      ctx.save();
      ctx.fillStyle = s.boxColor; ctx.globalAlpha = s.boxOp == null ? 1 : s.boxOp;
      const drawBoxes = () => {
        if (boxMode === 'single') { const b = boxes.title; roundBox(b.x, b.y, b.w, b.h, s.boxR); }
        else drawRowBoxes(lines.map((l, i) => { const c = top + size / 2 + i * lh; return { x0: cx - l.w / 2 - padX, x1: cx + l.w / 2 + padX, y0: c - size / 2 - padY, y1: c + size / 2 + padY }; }), s.boxR);
      };
      // 1) la sombra solo por fuera; 2) las cajas encima, para que no quede sombra dentro entre líneas
      if (ctx.globalAlpha > 0.98) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4; drawBoxes(); }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      drawBoxes();
      ctx.restore();
    } else {
      const k = s.tShadow == null ? 0.6 : s.tShadow; ctx.shadowColor = `rgba(0,0,0,${Math.min(1, k * 1.1).toFixed(2)})`; ctx.shadowBlur = k ? 4 + 12 * k : 0;
    }
    if (s.tStrokeW > 0) {   // contorno: va debajo de las letras, con su misma sombra
      ctx.save(); ctx.strokeStyle = s.tStrokeC || '#000'; ctx.lineWidth = s.tStrokeW * 2; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      lines.forEach((l, i) => { const c = top + size / 2 + i * lh; let x = cx - l.w / 2; for (const w of l.words) { drawR(w.t, x, c + mid, true); x += w.w + space; } });
      ctx.restore(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }
    lines.forEach((l, i) => {
      const c = top + size / 2 + i * lh;
      let x = cx - l.w / 2;
      for (const w of l.words) {
        ctx.fillStyle = w.red ? s.titleHl : (isBox ? s.boxText : s.titleColor);
        drawR(w.t, x, c + mid); x += w.w + space;
      }
    });
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.letterSpacing = '0px';
  }

  /* subtítulos */
  let cap = null, ci = -1;
  if (trk.caps.hide) { /* pista oculta */ }
  else if (captions.length) {
    for (let i = 0; i < captions.length; i++) { const c = captions[i]; if (t >= c.start && t < c.end) { cap = c; ci = i; break; } }
  } else if (!loaded) {
    cap = { start: -1, end: 1e9, words: [{ text: 'subtítulos', start: -1, end: 1e9 }] };
  }
  if (ci !== activeCap && !forExport) markActive(ci);
  let ghost = false;
  if (!cap && !forExport && loaded && !trk.caps.hide && !clipMeta.noSubs && (vid.paused || drag)) {
    cap = captions[0] || { start: -1, end: 1e9, words: [{ text: 'subtítulos', start: -1, end: 1e9 }] };
    ghost = true;
  }
  boxes.sub = null;
  if (cap) {
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.5;
    ctx.font = `${s.subItalic ? 'italic ' : ''}${s.subBold ? s.subWeight : 400} ${s.subSize}px "${s.subFont}", Impact, sans-serif`;
    ctx.letterSpacing = (s.subLS || 0) + 'px';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const ws = [];
    for (const w of cap.words) for (const part of w.text.split(/\s+/).filter(Boolean)) {
      const t2 = caseText(cleanWord(part, false), s.subCase); if (t2) ws.push({ t: t2, start: w.start, end: w.end });
    }
    const { lines, space } = wrapWords(ws, W - 140);
    const lh = s.subSize * s.subLH;
    const A = L.subArea;
    const cy = A.y + A.h * s.subY;
    const cx = W / 2 + pos.sx;
    const maxLW = Math.max(0, ...lines.map(l => l.w));
    const blockH = (lines.length - 1) * lh + s.subSize;
    const lx = l => s.subAlign === 'left' ? cx - maxLW / 2 : s.subAlign === 'right' ? cx + maxLW / 2 - l.w : cx - l.w / 2;
    const bpx = s.subBg ? s.subSize * s.subBgW / 100 : 0, bpy = s.subBg ? s.subSize * s.subBgH / 100 : 0;
    boxes.sub = { x: cx - maxLW / 2 - bpx, y: cy - blockH / 2 - bpy, w: maxLW + 2 * bpx, h: blockH + 2 * bpy };
    if (!forExport && !drag) lastSubBox = boxes.sub;
    const mid = bodyMid(s.subCase === 'upper' || !ws.some(w => hasLower(w.t)));
    let k = 1;
    if (s.pop && !ghost) { const p = Math.min(1, Math.max(0, (t - cap.start) / 0.1)); k = 0.86 + 0.14 * (1 - Math.pow(1 - p, 3)); }
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    const sw = s.subSize * s.strokeW / 100;
    const top0 = cy - (lines.length - 1) * lh / 2;
    const each = fn => { let y = top0 + mid; for (const l of lines) { let x = lx(l); for (const w of l.words) { fn(w, x, y); x += w.w + space; } y += lh; } };
    // 0) fondo (una caja por línea o un bloque)
    if (s.subBg && s.subBgOp > 0) {
      ctx.save(); ctx.fillStyle = rgbaOf(s.subBgC, s.subBgOp);
      const rr = h => Math.min(h / 2, h / 2 * s.subBgR / 100);
      if (s.subBgMode === 'block') { const b = boxes.sub, h = b.h; roundBox(b.x + s.subBgX, b.y + s.subBgY, b.w, h, rr(h)); }
      else { const h = s.subSize + 2 * bpy; drawRowBoxes(lines.map((l, i) => { const c = top0 + i * lh; return { x0: lx(l) - bpx + s.subBgX, x1: lx(l) + l.w + bpx + s.subBgX, y0: c - s.subSize / 2 - bpy + s.subBgY, y1: c + s.subSize / 2 + bpy + s.subBgY }; }), rr(h)); }
      ctx.restore();
    }
    // 1) sombra (densa, con color, distancia y ángulo)
    if (s.subShOn && s.shOp > 0) {
      ctx.save();
      const o = shOff(s.subShD, s.subShA);
      ctx.shadowColor = rgbaOf(s.subShC, s.shOp); ctx.shadowBlur = s.subSize * s.shBlur; ctx.shadowOffsetX = o.x; ctx.shadowOffsetY = o.y;
      ctx.fillStyle = s.subColor; ctx.strokeStyle = s.strokeC; ctx.lineWidth = sw;
      for (let pass = 0; pass < (s.subShD > 0 ? 1 : 3); pass++) each((w, x, y) => { if (s.strokeOn) drawR(w.t, x, y, true); else drawR(w.t, x, y); });
      ctx.restore();
    }
    // 2) contorno opcional
    if (s.strokeOn) { ctx.strokeStyle = s.strokeC; ctx.lineWidth = sw; each((w, x, y) => drawR(w.t, x, y, true)); }
    // 3) relleno (+ subrayado)
    each((w, x, y) => {
      ctx.fillStyle = s.hl && t >= w.start && t < w.end ? s.hlColor : s.subColor; drawR(w.t, x, y);
      if (s.subUnder) ctx.fillRect(x, y + s.subSize * 0.1, w.w, Math.max(3, s.subSize * 0.06));
    });
    ctx.restore();
  }

  /* textos libres */
  txtBoxes = {};
  if (!trk.text.hide) for (const tx of texts) if (T >= tx.start && T < tx.end) drawText(tx);

  /* logo */
  boxes.logo = null;
  if (logo && !trk.logo.hide) {
    const lw = W * s.logoSize, lh = lw * logo.img.naturalHeight / logo.img.naturalWidth;
    const x = logoPos.x - lw / 2, y = logoPos.y + logoAuto.dy - lh / 2;
    const rot = (s.logoRot || 0) * Math.PI / 180;
    ctx.save(); ctx.globalAlpha = s.logoOp;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (rot) { ctx.translate(x + lw / 2, y + lh / 2); ctx.rotate(rot); ctx.drawImage(logo.img, -lw / 2, -lh / 2, lw, lh); }
    else ctx.drawImage(logo.img, x, y, lw, lh);
    ctx.restore();
    if (rot) { const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)), bw = lw * c + lh * sn, bh = lw * sn + lh * c; boxes.logo = { x: x + lw / 2 - bw / 2, y: y + lh / 2 - bh / 2, w: bw, h: bh }; }
    else boxes.logo = { x, y, w: lw, h: lh };
  }
  ctx.restore();

  if (forExport) return;

  /* marcos de selección, línea divisoria y guías (solo en la vista previa) */
  const sel = drag ? drag.k : (hover || selected);
  if (sel && (sel === 'title' || sel === 'sub' || sel === 'logo') && boxes[sel]) {
    const b = boxes[sel];
    ctx.save(); ctx.strokeStyle = '#20d5c8'; ctx.lineWidth = 4; ctx.setLineDash(sel === hover || drag ? [16, 10] : []);
    ctx.strokeRect(b.x - 20, b.y - 16, b.w + 40, b.h + 32);
    if (sel === 'title' && !trk.title.lock) {
      ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
      for (const x of [b.x - 20, b.x + b.w + 20]) { roundBox(x - 7, b.y + b.h / 2 - 22, 14, 44, 7); ctx.stroke(); }
    }
    ctx.restore();
  }
  const stS = selTextId();
  if (stS != null && txtBoxes[stS]) drawTextSel(txtBoxes[stS], !!drag);
  if (hover && hover.startsWith('txt:') && +hover.slice(4) !== stS && txtBoxes[hover.slice(4)]) { const b = txtBoxes[hover.slice(4)]; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot * Math.PI / 180); ctx.strokeStyle = '#20d5c8'; ctx.lineWidth = 3; ctx.setLineDash([16, 10]); ctx.strokeRect(-b.w / 2 - 18, -b.h / 2 - 16, b.w + 36, b.h + 32); ctx.restore(); }
  if (L.split && L.top != null && ['edgeT', 'edgeB'].some(x => sel === x || hover === x || (drag && drag.k === x))) {
    const ey = (sel === 'edgeT' || hover === 'edgeT' || (drag && drag.k === 'edgeT')) ? L.top : L.bot;
    ctx.save(); ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, Math.max(0, Math.min(H - 6, ey - 3)), W, 6);
    ctx.beginPath(); ctx.arc(W / 2, Math.max(22, Math.min(H - 22, ey)), 22, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  if (L.split && (sel === 'seam')) {
    ctx.save(); ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, L.seam - 3, W, 6);
    ctx.beginPath(); ctx.arc(60, L.seam, 22, 0, Math.PI * 2); ctx.arc(W - 60, L.seam, 22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (drag && (snapX || snapY) && drag.g) {
    ctx.save(); ctx.strokeStyle = '#ff3fd2'; ctx.lineWidth = 3; ctx.globalAlpha = .9;
    if (snapX) { ctx.beginPath(); ctx.moveTo(drag.g.x, drag.g.y0); ctx.lineTo(drag.g.x, drag.g.y1); ctx.stroke(); }
    if (snapY) { ctx.beginPath(); ctx.moveTo(0, drag.g.y); ctx.lineTo(W, drag.g.y); ctx.stroke(); }
    ctx.restore();
  }
  if (s.safe) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,107,107,.18)'; ctx.strokeStyle = 'rgba(255,107,107,.8)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
    ctx.fillRect(0, H - 420, W, 420); ctx.strokeRect(0, H - 420, W, 420);
    ctx.fillRect(W - 150, 700, 150, H - 1120); ctx.strokeRect(W - 150, 700, 150, H - 1120);
    ctx.fillRect(0, 0, W, 150); ctx.strokeRect(0, 0, W, 150);
    ctx.restore();
  }
}

/* la vista previa solo se vuelve a pintar cuando algo cambia: al reproducir, al tocar algo (ratón, teclado, deslizadores),
   cuando el vídeo salta o carga, y por si acaso cada 0,4 s. Antes se pintaba 60 veces por segundo aunque estuviera en pausa. */
let pvDirty = 0, pvLast = 0;
const pvMark = () => { pvDirty = performance.now(); };
{
  const opt = { capture: true, passive: true };
  for (const ev of ['pointerdown', 'pointerup', 'pointercancel', 'wheel', 'keydown', 'keyup', 'input', 'change', 'drop', 'paste', 'dragover']) document.addEventListener(ev, pvMark, opt);
  document.addEventListener('pointermove', e => { if (e.buttons || e.target === cv) pvMark(); }, opt);
  for (const ev of ['seeked', 'seeking', 'loadeddata', 'loadedmetadata', 'canplay', 'play', 'pause', 'ratechange', 'emptied', 'resize']) vid.addEventListener(ev, pvMark);
  addEventListener('resize', pvMark); document.addEventListener('visibilitychange', pvMark);
  try { document.fonts.addEventListener('loadingdone', pvMark); } catch {}
}
function loop() {
  const now = performance.now();
  const jumping = loaded && !exporting && !cropMode && vid.paused && (vid.seeking || mtSeekBusy || vid.readyState < 2);
  const pxT = jumping ? (mtSeekBusy && PX.want != null ? PX.want : vid.currentTime || 0) : 0, pxC = jumping ? pxFrame(pxT) : null;
  const playing = (!vid.paused && !vid.ended) || !!rewT;
  const want = pxC || playing || jumping || now - pvDirty < 350 || (now - pvLast > 400 && (now - pvLast > 1500 || cv.offsetParent !== null));
  if (want && (pxC || (!exporting && !(loaded && vid.readyState < 2 && !cropMode)))) {   // mientras busca, se queda el último fotograma
    pvLast = now;
    if (pxC) draw(pxT, false, pxC);   // el vídeo de verdad aún está saltando: se ve ya el fotograma exacto de la copia ligera
    else { advancePlayback(); rxSync(); draw(vid.currentTime || 0, false); }
    if (logoAuto.due && performance.now() > logoAuto.due && !drag) computeLogoAvoid();
    scTick();
    if (vid.duration) {
      const T = curT(), D = totalDur();
      const sv = Math.round(T / Math.max(0.001, D) * 1000); if (+$('seek').value !== sv) { $('seek').value = sv; if (window.rangeFill) rangeFill($('seek')); }
      $('time').textContent = fmt(T) + ' / ' + fmt(D);
    }
  }
  if (actx) {
    const ct = vid.currentTime || 0, muted = mutes.some(m => ct >= m.s && ct < m.e);
    const vv = trk.video.mute || muted ? 0 : +$('vVol').value / 100, iso = typeof isoTick === 'function' && isoTick();
    voiceGain.gain.value = iso ? 0 : vv;
    if (iso && isoNode) isoNode.g.gain.value = vv;
    musicGain.gain.value = music.cur && !vid.paused && !trk.audio.mute ? musicLevel(curT(), totalDur()) : 0;
  }
  requestAnimationFrame(loop);
}


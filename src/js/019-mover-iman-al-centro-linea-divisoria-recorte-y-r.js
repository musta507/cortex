/* ---------- mover, imán al centro, línea divisoria, recorte y redimensionar en la vista previa ---------- */
const SNAP = 26;
function canvasPt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
const inR = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function hit(p) {
  const tk = hitText(p); if (tk) return tk;
  if (inR(p, boxes.logo)) return 'logo';
  for (const k of ['sub', 'title']) {
    const b = boxes[k];
    if (b && p.x >= b.x - 30 && p.x <= b.x + b.w + 30 && p.y >= b.y - 25 && p.y <= b.y + b.h + 25) return k;
  }
  return null;
}
function hitAny(p) {
  const k = hit(p); if (k) return k;
  const L = lastLayout;
  if (L && L.split && L.top != null && Math.abs(p.y - L.top) < 24 && p.y < L.top + 24) return 'edgeT';
  if (L && L.split && L.bot != null && Math.abs(p.y - L.bot) < 24 && p.y > L.bot - 24) return 'edgeB';
  if (L && L.split && !L.call && Math.abs(p.y - L.seam) < 28) return 'seam';
  if (L && L.more) for (let i = 0; i < L.more.length; i++) if (inR(p, L.more[i].R)) return 'p' + (i + 2);
  if (L && L.react && inR(p, L.ir)) return 'cam';
  if (L && L.split && inR(p, L.ir)) return 'image';
  if (loaded && inR(p, boxes.video)) return 'video';
  return null;
}
const CURSOR = new Proxy({ cam: 'grab', logo: 'grab', title: 'grab', sub: 'grab', video: 'grab', image: 'grab', seam: 'ns-resize', edgeT: 'ns-resize', edgeB: 'ns-resize' }, { get: (o, k) => typeof k === 'string' && /^p\d$/.test(k) ? 'grab' : typeof k === 'string' && k.startsWith('txt:') ? 'grab' : o[k] });

/* recorte */
let cropMode = false, cropTmp = null, cropDrag = null;
let cropTarget = 'image';   // 'image' | 'cam' | 'content'
let cropObj = null;         // encuadre que se está editando (el general o el del tramo actual)
function cropSrc() {
  return cropTarget === 'image' ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : { el: vid, w: vid.videoWidth, h: vid.videoHeight };
}
function cropGeom() {
  const S = cropSrc(), m = 70, s = Math.min((W - 2 * m) / S.w, (H - 2 * m) / S.h);
  return { s, ox: (W - S.w * s) / 2, oy: (H - S.h * s) / 2 };
}
function enterCrop(target) {
  cropTarget = target || 'image';
  if (exporting) return;
  if (cropTarget === 'image' && !img) return;
  if (cropTarget !== 'image' && !loaded) return;
  vid.pause();
  const S = cropSrc();
  if (cropTarget === 'image') cropTmp = { ...(crop || { x: 0, y: 0, w: S.w, h: S.h }) };
  else { cropObj = activeCrops(); const k = cropObj[cropTarget]; cropTmp = { x: k.x * S.w, y: k.y * S.h, w: k.w * S.w, h: k.h * S.h }; }
  $('cropHint').textContent = cropTarget === 'cam' ? 'Marca dónde está la cámara del streamer' : cropTarget === 'content' ? 'Marca la parte del contenido que quieres abajo' : 'Arrastra las esquinas o el marco';
  cropMode = true; $('cropBar').hidden = false; hover = null;
}
function exitCrop(apply) {
  if (!cropMode) return;
  if (apply && cropTarget === 'image') {
    const full = cropTmp.x <= 0 && cropTmp.y <= 0 && cropTmp.w >= img.naturalWidth && cropTmp.h >= img.naturalHeight;
    crop = full ? null : { x: Math.round(cropTmp.x), y: Math.round(cropTmp.y), w: Math.round(cropTmp.w), h: Math.round(cropTmp.h) };
    imgOff.x = imgOff.y = 0;
    pushHistory();
  } else if (apply) {
    const S = cropSrc();
    const o = cropObj || crops;
    o[cropTarget] = { x: cropTmp.x / S.w, y: cropTmp.y / S.h, w: cropTmp.w / S.w, h: cropTmp.h / S.h };
    if (cropTarget === 'cam') o.camFx = 0.5;
    if (cropTarget === 'content') { o.fit = 'cover'; o.zk = 1; }
    if (cropTarget === 'content') { setRange('offX', 0); setRange('offY', 0); }
    pushHistory();
  }
  cropMode = false; cropTmp = null; cropDrag = null; $('cropBar').hidden = true;
}
$('cropApply').onclick = () => exitCrop(true);
$('cropCancel').onclick = () => exitCrop(false);
document.addEventListener('keydown', e => {
  if (!cropMode) return;
  if (e.key === 'Enter') { e.preventDefault(); exitCrop(true); }
  if (e.key === 'Escape') { e.preventDefault(); exitCrop(false); }
});
function cropHandle(p) {
  const g = cropGeom(), c = cropTmp;
  const x0 = g.ox + c.x * g.s, y0 = g.oy + c.y * g.s, x1 = x0 + c.w * g.s, y1 = y0 + c.h * g.s, R = 40;
  const nx = Math.abs(p.x - x0) < R, fx = Math.abs(p.x - x1) < R, ny = Math.abs(p.y - y0) < R, fy = Math.abs(p.y - y1) < R;
  const inX = p.x > x0 - R && p.x < x1 + R, inY = p.y > y0 - R && p.y < y1 + R;
  let h = '';
  if (ny && inX) h += 'n'; else if (fy && inX) h += 's';
  if (nx && inY) h += 'w'; else if (fx && inY) h += 'e';
  if (h) return h;
  if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) return 'move';
  return null;
}
const CROP_CURSOR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', move: 'move' };

cv.addEventListener('dblclick', e => {
  const p = canvasPt(e);
  const hk = hit(p);
  if (!cropMode && hk && (hk === 'title' || hk === 'sub' || (ezMode && hk.startsWith('txt:')))) { ezEdit(hk); return; }
  if (hk && hk.startsWith('txt:')) { selectText(+hk.slice(4)); setTimeout(() => { $('txtText').focus(); $('txtText').select(); }, 20); return; }
  if (cropMode || !lastLayout || hk) return;
  if (lastLayout.react && inR(p, lastLayout.ir)) enterCrop('cam');
  else if (lastLayout.react && inR(p, lastLayout.vr)) enterCrop('content');
  else if (lastLayout.split && inR(p, lastLayout.ir)) enterCrop('image');
});

cv.addEventListener('pointerdown', e => {
  if (exporting || e.button !== 0) return;
  ctxClose();
  const p = canvasPt(e);
  if (cropMode) {
    const h = cropHandle(p); if (!h) return;
    cropDrag = { h, p0: p, c: { ...cropTmp }, s: cropGeom().s };
    cv.setPointerCapture(e.pointerId); e.preventDefault(); return;
  }
  // asas del texto seleccionado (girar / tamaño)
  const stid = selTextId(), sb = stid != null && txtBoxes[stid];
  if (sb && !trk.text.lock) {
    const h = txtHandle(sb, p);
    if (h === 'del') { texts = texts.filter(x => x.id !== stid); selected = null; tsel.clear(); fillTextPanel(); tlSig = ''; pushHistory(); if (typeof stKey !== 'undefined' && stKey && stKey.startsWith('txt:')) stHide(); e.preventDefault(); return; }
    if (h) { const tx = txtById(stid); drag = { k: 'txt' + h, id: stid, p0: p, size: tx.size, rot: tx.rot || 0, d0: Math.hypot(p.x - tx.x, p.y - tx.y), a0: Math.atan2(p.y - tx.y, p.x - tx.x) };
      cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  }
  // asas de los lados del título: ancho (las palabras pasan a otra línea)
  if (selected === 'title' && boxes.title && !trk.title.lock) {
    const b = boxes.title, my = b.y + b.h / 2;
    if (Math.abs(p.y - my) < Math.max(34, b.h / 2) && (Math.abs(p.x - (b.x - 20)) < 24 || Math.abs(p.x - (b.x + b.w + 20)) < 24)) {
      drag = { k: 'titlew', p0: p, cx: W / 2 + pos.tx }; cv.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
  }
  const k = hitAny(p);
  if (k === 'image' && !img) { pasteImageBtn(true); return; }   // sin imagen: clic para pegar la copiada (o elegir archivo si no hay)
  if (k && k.startsWith('txt:')) selectText(+k.slice(4), true); else { selected = k; if (selTextId() == null) { tsel.forEach(x => { if (x.startsWith('t:')) tsel.delete(x); }); fillTextPanel(); } }
  if (k && INSP_FOR[k]) showInsp(INSP_FOR[k]);
  if (!k) return;
  // pistas bloqueadas: se puede seleccionar pero no mover
  const lockOf = { title: trk.title.lock, sub: trk.caps.lock, logo: trk.logo.lock };
  if (lockOf[k] || (k.startsWith('txt:') && trk.text.lock)) { if (k === 'logo') toast('Logo bloqueado: quita el candado para moverlo'); return; }
  const L = lastLayout;
  // dos personas: cada mitad se arrastra para encuadrar a su persona (y la rueda acerca o aleja)
  // (si la línea está en una parte del clip con su propia plantilla, lo que se ajusta es el encuadre de esa parte)
  const scA = sceneAdj(), scCr = scA && scA.ov.mode === 'react' && scA.ov.crops ? scA.ov.crops : null, scS = scA && scA.ov.mode !== 'react' ? (scA.ov.s || (scA.ov.s = {})) : null;
  // (en Reacción normal, la cámara de arriba también se arrastra y se acerca igual)
  if (L && L.react && (scCr || $('duo').checked || k === 'cam') && (k === 'cam' || k === 'video' || /^p\d$/.test(k))) {
    const CR = scCr || crops, which = k === 'cam' ? 'cam' : k === 'video' ? 'content' : k, r = k === 'cam' ? L.ir : k === 'video' ? boxes.video : L.more && L.more[+k.slice(1) - 2] && L.more[+k.slice(1) - 2].R, c0 = cget(CR, which);
    if (r && r.w && c0) { drag = { k: 'duo', which, cr: CR, p0: p, c: { ...c0 }, rw: r.w, rh: r.h }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; e.preventDefault(); return; }
  }
  const A = L.subArea;
  drag = { k, p0: p, tx: pos.tx, ty: pos.ty, sx: pos.sx, subY: +$('subY').value, dh: A.h,
           offX: +$('offX').value, offY: +$('offY').value, ratio: +$('ratio').value, ix: imgOff.x, iy: imgOff.y,
           lx: logoPos.x, ly: logoPos.y, et: +$('edgeT').value, eb: +$('edgeB').value };
  if (k === 'video' && scS) { drag.scS = scS; drag.offX = scS.offX || 0; drag.offY = scS.offY || 0; }
  if (k.startsWith('txt:')) { const tx = txtById(+k.slice(4)); drag.tx0 = tx.x; drag.ty0 = tx.y; }
  // dónde dibujar las guías del imán
  if (k === 'video') drag.g = { x: L.vr.x + L.vr.w / 2, y: L.vr.y + L.vr.h / 2, y0: L.vr.y, y1: L.vr.y + L.vr.h };
  else if (k === 'image') drag.g = { x: L.ir.x + L.ir.w / 2, y: L.ir.y + L.ir.h / 2, y0: L.ir.y, y1: L.ir.y + L.ir.h };
  else drag.g = { x: W / 2, y: H / 2, y0: 0, y1: H };
  cv.setPointerCapture(e.pointerId); cv.style.cursor = k === 'seam' || k === 'edgeT' || k === 'edgeB' ? 'ns-resize' : 'grabbing'; e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  const p = canvasPt(e);
  if (cropMode) {
    if (!cropDrag) { const h = cropHandle(p); cv.style.cursor = h ? CROP_CURSOR[h] : 'default'; return; }
    const d = cropDrag, dx = (p.x - d.p0.x) / d.s, dy = (p.y - d.p0.y) / d.s, c = { ...d.c };
    const CS = cropSrc(), IW = CS.w, IH = CS.h, MIN = Math.max(20, Math.min(IW, IH) * 0.05);
    if (d.h === 'move') {
      c.x = Math.min(Math.max(0, d.c.x + dx), IW - c.w); c.y = Math.min(Math.max(0, d.c.y + dy), IH - c.h);
    } else {
      if (d.h.includes('w')) { const nx = Math.min(Math.max(0, d.c.x + dx), d.c.x + d.c.w - MIN); c.w = d.c.w + (d.c.x - nx); c.x = nx; }
      if (d.h.includes('e')) c.w = Math.min(Math.max(MIN, d.c.w + dx), IW - d.c.x);
      if (d.h.includes('n')) { const ny = Math.min(Math.max(0, d.c.y + dy), d.c.y + d.c.h - MIN); c.h = d.c.h + (d.c.y - ny); c.y = ny; }
      if (d.h.includes('s')) c.h = Math.min(Math.max(MIN, d.c.h + dy), IH - d.c.y);
    }
    cropTmp = c; return;
  }
  if (!drag) {
    hover = exporting ? null : hitAny(p);
    const stid = selTextId(), hb = stid != null && !trk.text.lock && txtBoxes[stid] && txtHandle(txtBoxes[stid], p);
    const tb = selected === 'title' && boxes.title && !trk.title.lock ? boxes.title : null;
    if (tb && Math.abs(p.y - (tb.y + tb.h / 2)) < Math.max(34, tb.h / 2) && (Math.abs(p.x - (tb.x - 20)) < 24 || Math.abs(p.x - (tb.x + tb.w + 20)) < 24)) { cv.style.cursor = 'ew-resize'; return; }
    cv.style.cursor = hb === 'rot' ? 'alias' : hb === 'scale' ? 'nwse-resize' : hb === 'wl' || hb === 'wr' ? 'ew-resize' : hb === 'del' ? 'pointer' : hover ? CURSOR[hover] : 'default'; return;
  }
  const ddx = p.x - drag.p0.x, ddy = p.y - drag.p0.y;
  const snap = (v, flag) => { const on = Math.abs(v) < SNAP; if (flag === 'x') snapX = on; else snapY = on; return on ? 0 : v; };
  if (drag.k.startsWith('txt:')) {
    const tx = txtById(+drag.k.slice(4)); if (!tx) return;
    tx.x = W / 2 + snap(drag.tx0 + ddx - W / 2, 'x'); tx.y = H / 2 + snap(drag.ty0 + ddy - H / 2, 'y'); return;
  }
  if (drag.k === 'titlew') {
    const S0 = S(), pad = titleStyle === 'box' ? S0.boxPX : 0;
    setRange('titleW', Math.round(Math.max(120, Math.min(1000, 2 * Math.abs(p.x - drag.cx) - 2 * pad - 40)) / 10) * 10);
    return;
  }
  if (drag.k === 'txtwl' || drag.k === 'txtwr') {   // ancho de la caja: el texto se recoloca en más o menos líneas
    const tx = txtById(drag.id), b = txtBoxes[drag.id]; if (!tx || !b) return;
    const q = txtLocal(b, p);
    tx.boxW = Math.round(Math.max(tx.size * 1.2, 2 * Math.abs(q.x) - 2 * (b.px + 18)));
    fillTextPanel(); return;
  }
  if (drag.k === 'txtrot' || drag.k === 'txtscale') {
    const tx = txtById(drag.id); if (!tx) return;
    if (drag.k === 'txtrot') {
      let r = drag.rot + (Math.atan2(p.y - tx.y, p.x - tx.x) - drag.a0) * 180 / Math.PI;
      r = ((r + 540) % 360) - 180; for (const m of [-180, -90, 0, 90, 180]) if (Math.abs(r - m) < 4) r = m;   // imán a 0° y 90°
      tx.rot = Math.round(r);
    } else tx.size = Math.round(Math.min(400, Math.max(16, drag.size * Math.hypot(p.x - tx.x, p.y - tx.y) / Math.max(10, drag.d0))));
    fillTextPanel(); return;
  }
  if (drag.k === 'duo') {
    const d = drag, c = cget(d.cr || crops, d.which); if (!c) return;
    c.x = Math.min(Math.max(0, d.c.x - ddx / d.rw * d.c.w), 1 - c.w);
    c.y = Math.min(Math.max(0, d.c.y - ddy / d.rh * d.c.h), 1 - c.h);
    tlSig = ''; return;
  }
  if (drag.k === 'video' && drag.scS) {
    drag.scS.offX = Math.round(snap(drag.offX + ddx, 'x')); drag.scS.offY = Math.round(snap(drag.offY + ddy, 'y'));
  } else if (drag.k === 'video') {
    setRange('offX', Math.round(snap(drag.offX + ddx, 'x')));
    setRange('offY', Math.round(snap(drag.offY + ddy, 'y')));
  } else if (drag.k === 'logo') {
    if (!logoAuto.manual) { logoAuto.manual = true; drag.ly += logoAuto.dy; logoAuto.dy = 0; }
    logoPos.x = W / 2 + snap(drag.lx + ddx - W / 2, 'x'); logoPos.y = H / 2 + snap(drag.ly + ddy - H / 2, 'y');
  } else if (drag.k === 'image') {
    imgOff.x = snap(drag.ix + ddx, 'x'); imgOff.y = snap(drag.iy + ddy, 'y');
  } else if (drag.k === 'cam') {
    return;
  } else if (drag.k === 'edgeT' || drag.k === 'edgeB') {   // borde de arriba o de abajo de la composición
    const top = drag.k === 'edgeT', other = top ? +$('edgeB').value : +$('edgeT').value;
    let v = Math.round(top ? drag.et + ddy : drag.eb - ddy); if (v < 24) v = 0;
    setRange(top ? 'edgeT' : 'edgeB', Math.max(0, Math.min(H - other - 700, v))); tlSig = '';
  } else if (drag.k === 'seam') {
    const sign = layoutMode === 'react' || imgPos === 'bottom' ? 1 : -1;
    setRange('ratio', Math.round(Math.min(85, Math.max(25, drag.ratio + sign * ddy / H * 100))));
  } else if (drag.k === 'title') {
    pos.tx = snap(drag.tx + ddx, 'x'); snapY = false; pos.ty = drag.ty + ddy;
  } else {
    pos.sx = snap(drag.sx + ddx, 'x'); snapY = false;
    setRange('subY', Math.round(drag.subY + ddy / drag.dh * 100));
  }
});
const endDrag = () => { if (drag) { pushHistory(); if (drag.k === 'logo') saveLogoCfg(); if (drag.k.startsWith('txt')) fillTextPanel(); } drag = null; cropDrag = null; snapX = snapY = false; cv.style.cursor = hover ? CURSOR[hover] : 'default'; };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', () => { if (!drag) hover = null; });
let duoWheelT = 0;
cv.addEventListener('wheel', e => {
  if (exporting || cropMode) return;
  const p = canvasPt(e), k = hitAny(p);
  if (k && k.startsWith('txt:')) {
    e.preventDefault(); if (trk.text.lock) return;
    const tx = txtById(+k.slice(4)); tx.size = Math.min(400, Math.max(16, tx.size + (e.deltaY < 0 ? 4 : -4))); fillTextPanel(); pushHistory(); return;
  }
  if (k === 'logo' && trk.logo.lock) { e.preventDefault(); return; }
  if (k === 'logo' && e.shiftKey) { e.preventDefault(); let v = +$('logoRot').value + (e.deltaY < 0 ? 5 : -5); if (v > 180) v -= 360; if (v < -180) v += 360; setRange('logoRot', v); return; }
  if (k === 'title' || k === 'sub' || k === 'logo') {
    e.preventDefault();
    const id = { title: 'titleSize', sub: 'subSize', logo: 'logoSize' }[k];
    setRange(id, +$(id).value + (e.deltaY < 0 ? (k === 'logo' ? 1 : 2) : (k === 'logo' ? -1 : -2))); return;
  }
  const scA = sceneAdj(), scCr = scA && scA.ov.mode === 'react' && scA.ov.crops ? scA.ov.crops : null;
  if (scA && !scCr && k === 'video') {   // parte con su propia plantilla: el zoom es el de esa parte
    e.preventDefault(); const s = scA.ov.s || (scA.ov.s = {}); s.zoom = Math.max(0.3, Math.min(Math.max(800, +$('zoom').max || 800) / 100, Math.round(((s.zoom || 1) * 100 + (e.deltaY < 0 ? 5 : -5))) / 100));
    clearTimeout(duoWheelT); duoWheelT = setTimeout(pushHistory, 400); return;
  }
  if ((scCr || (layoutMode === 'react' && ($('duo').checked || k === 'cam'))) && (k === 'cam' || k === 'video' || /^p\d$/.test(k))) {
    e.preventDefault(); const c = cget(scCr || crops, k === 'cam' ? 'cam' : k === 'video' ? 'content' : k); if (!c) return;
    let f = e.deltaY < 0 ? 0.94 : 1 / 0.94; f = Math.min(f, 1 / c.w, 1 / c.h); if (c.w * f < 0.025) return;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2; c.w *= f; c.h *= f;
    c.x = Math.min(Math.max(0, cx - c.w / 2), 1 - c.w); c.y = Math.min(Math.max(0, cy - c.h / 2), 1 - c.h);
    tlSig = ''; clearTimeout(duoWheelT); duoWheelT = setTimeout(pushHistory, 400); return;
  }
  if (k === 'video') { e.preventDefault(); setRange('zoom', +$('zoom').value + (e.deltaY < 0 ? 5 : -5)); }
  if (k === 'image') { e.preventDefault(); setRange('imgZoom', +$('imgZoom').value + (e.deltaY < 0 ? 5 : -5)); }
}, { passive: false });

/* Reacción: acercar o alejar la cámara de arriba (sobre lo que se ve ahora) */
function camZoom(f) {
  const sa = sceneAdj(), CR = sa && sa.ov.mode === 'react' && sa.ov.crops ? sa.ov.crops : crops, c = cget(CR, 'cam'); if (!c) return;
  f = Math.min(f, 1 / c.w, 1 / c.h); if (c.w * f < 0.025) return;
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2; c.w *= f; c.h *= f;
  c.x = Math.min(Math.max(0, cx - c.w / 2), 1 - c.w); c.y = Math.min(Math.max(0, cy - c.h / 2), 1 - c.h);
  tlSig = ''; pushHistory();
}
setTimeout(() => { const b = $('seEmpty'); if (b) b.onclick = () => stEdEmpty(); }, 0);
// Ctrl+E: exportar el clip del panel
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || (e.key || '').toLowerCase() !== 'e') return;
  const ed = $('stEd'); if (!ed || ed.hidden) return;
  e.preventDefault(); const b = $('seExp'); if (exporting) { toast('Ya se está exportando'); return; } if (b && !b.disabled) b.click(); else if (b) toast(b.title || 'Todavía no se puede exportar');
}, true);
/* «Desactivar todo lo automático»: la IA no toca nada sola (directo y vídeos subidos); queda guardado */
const AUTO_KEYS = ['stAutoT', 'stAutoF', 'stAutoS', 'stAutoX', 'stAutoE', 'stAutoO'];
const autoOff = () => ezPref('stAutoOff') === '1';
function setAutoOff(on) {
  if (on && !autoOff()) { const prev = {}; for (const k of AUTO_KEYS) prev[k] = ezPref(k) || ''; ezPref('stAutoPrev', JSON.stringify(prev)); for (const k of AUTO_KEYS) ezPref(k, '0'); }
  if (!on && autoOff()) { let prev = {}; try { prev = JSON.parse(ezPref('stAutoPrev') || '{}'); } catch {} for (const k of AUTO_KEYS) ezPref(k, prev[k] || ''); }
  ezPref('stAutoOff', on ? '1' : '0');
  try { stEdAutoUI(); $('seAutoO').checked = ezPref('stAutoO') !== '0'; } catch {}
  for (const id of ['seAutoT', 'seAutoF', 'seAutoE', 'seAutoS', 'seAutoX', 'seAutoO']) { const el = $(id); if (el) el.disabled = on; }
  const c = $('seOffAll'); if (c) c.checked = on;
}
// «Otras opciones» del panel: se recuerda si lo dejas abierto, y avisa en el título si hay algo activado dentro
setTimeout(() => {
  const d = $('seAdv'); if (!d) return; d.open = ezPref('seAdv') === '1';
  d.addEventListener('toggle', () => ezPref('seAdv', d.open ? '1' : '0'));
  const h = d.querySelector('summary .hint'), base = h.textContent;
  setInterval(() => { if ($('stEd').hidden) return; const on = []; if ($('seOffAll') && $('seOffAll').checked) on.push('🚫 automático apagado'); if ($('seRot') && $('seRot').checked) on.push('↻ girado'); const t = on.length ? on.join(' · ') : base; if (h.textContent !== t) h.textContent = t; }, 800);
}, 0);
setTimeout(() => { const d = $('seRotDeg'); if (!d) return; d.value = rotDeg();
  const set = () => { let v = parseFloat(String(d.value).replace(',', '.')); if (!isFinite(v) || !v) v = 1; v = Math.max(-10, Math.min(10, Math.round(v * 10) / 10)); d.value = v; ezPref('antiRotDeg', String(v)); try { draw(vid.currentTime || 0, false); } catch {} };
  d.oninput = () => { const v = parseFloat(String(d.value).replace(',', '.')); if (isFinite(v) && v) { ezPref('antiRotDeg', String(Math.max(-10, Math.min(10, v)))); try { draw(vid.currentTime || 0, false); } catch {} } };
  d.onchange = set; d.addEventListener('keydown', e => e.stopPropagation()); }, 0);
setTimeout(() => { const c = $('seRot'); if (!c) return; c.checked = antiRot();
  c.onchange = () => { ezPref('antiRot', c.checked ? '1' : '0'); try { draw(vid.currentTime || 0, false); } catch {} toast(c.checked ? 'Vídeo girado ' + String(rotDeg()).replace('.', ',') + '°: queda así en este clip y en los siguientes' : 'Giro quitado'); }; }, 0);
setTimeout(() => { const c = $('seOffAll'); if (!c) return; c.onchange = () => { setAutoOff(c.checked); toast(c.checked ? 'Todo lo automático, desactivado: la IA solo actúa si pulsas «Editar con IA»' : 'La IA vuelve a preparar los clips sola'); }; setAutoOff(autoOff()); }, 0);
/* pantalla dividida: controles */
function setLayout(v, user) {
  layoutMode = v; if (typeof zoomMax === 'function') zoomMax(); setSeg([$('lyNormal'), $('lySplit'), $('lyReact')], v === 'split' ? $('lySplit') : v === 'react' ? $('lyReact') : $('lyNormal'));
  $('splitOpts').hidden = v !== 'split';
  $('reactOpts').hidden = v !== 'react';
  $('ratioWrap').hidden = v === 'single';
  $('ratioLbl').textContent = v === 'react' ? 'Espacio para la cámara' : 'Espacio para el vídeo';
  $('s7').classList.toggle('done', v === 'split' && !!img);
  if (user) {
    setRange('zoom', 100); setRange('offX', 0); setRange('offY', 0);
    // en pantalla dividida el título va sobre la línea: la caja blanca se lee mejor
    if (v !== 'single' && titleStyle === 'plain') setTitleStyle('box');
    if (v === 'react') setRange('ratio', 42); else if (v === 'split') setRange('ratio', 55);
    if (v === 'react') { camDetectedFor = null; autoDetectCam(false); }
    pushHistory();
  }
}
function setImgPos(v) { imgPos = v; setSeg([$('ipBottom'), $('ipTop')], v === 'top' ? $('ipTop') : $('ipBottom')); }
[$('lyNormal'), $('lySplit'), $('lyReact')].forEach(b => b.onclick = () => setLayout(b.dataset.ly, true));
[$('ipBottom'), $('ipTop')].forEach(b => b.onclick = () => { setImgPos(b.dataset.ip); pushHistory(); });
async function setImageFile(f) {
  if (!f || !/^(image|video)\//.test(f.type)) return false;
  if (await loadImageBlob(f, f.name || 'imagen pegada', false)) { kv.set('image:' + curProj, f).catch(() => {}); pushHistory(); toast(/^video/.test(f.type) ? 'Vídeo puesto' : 'Imagen puesta'); return true; }
  return false;
}
$('imgFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  e.target.value = '';
  await setImageFile(f);
});
// pegar una imagen con Ctrl+V (copiada de Google, etc.) o arrastrarla encima de la vista previa
// imagen desde una dirección (cuando se copia de una web y solo llega el enlace)
async function imageFromUrl(u) {
  try { const r = await fetch(u); if (r.ok) { const b = await r.blob(); if (/^image\//.test(b.type)) return new File([b], 'imagen-pegada', { type: b.type }); } } catch {}
  return await new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(b => res(b ? new File([b], 'imagen-pegada.png', { type: 'image/png' }) : null), 'image/png'); } catch { res(null); } };
    im.onerror = () => res(null); im.src = u; });
}
async function putPastedImage(f) {
  if (!f) return false;
  if (layoutMode !== 'split') { setLayout('split', true); toast('Cambio a pantalla dividida con la imagen'); }
  return await setImageFile(f);
}
document.addEventListener('paste', async e => {
  if (!loaded || !$('home').hidden) return;
  if (typingIn(document.activeElement)) return;
  const items = [...(e.clipboardData ? e.clipboardData.items : [])];
  const it = items.find(x => x.kind === 'file' && /^image\//.test(x.type));
  if (it) { e.preventDefault(); await putPastedImage(it.getAsFile()); return; }
  // copiado de una web: a veces solo llega el HTML con la imagen o su enlace
  const html = e.clipboardData && e.clipboardData.getData('text/html'), txt = e.clipboardData && e.clipboardData.getData('text/plain');
  const src = ((/<img[^>]+src="([^"]+)"/i.exec(html || '') || [])[1] || '').replace(/&amp;/g, '&') || (/^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif)(\?\S*)?$/i.test((txt || '').trim()) ? txt.trim() : '');
  if (src && (layoutMode === 'split' || !clipBoard)) {
    e.preventDefault(); toast('Cargando la imagen…');
    const f = /^data:image\//.test(src) ? await (await fetch(src)).blob().then(b => new File([b], 'imagen-pegada', { type: b.type })) : await imageFromUrl(src);
    if (!(await putPastedImage(f))) toast('Esa web no deja coger la imagen: haz clic derecho en ella → «Copiar imagen» (no «copiar dirección»)');
    return;
  }
  if (clipBoard) { e.preventDefault(); pasteAt(); }
  else if (layoutMode === 'split' && !img) toast('No hay ninguna imagen copiada: en la web, clic derecho sobre la imagen → «Copiar imagen»');
});
// botón «Pegar imagen» (lee el portapapeles sin tener que pulsar Ctrl+V)
async function pasteImageBtn(orPick) {
  try {
    for (const ci of await navigator.clipboard.read()) {
      const t = ci.types.find(x => /^image\//.test(x));
      if (t) { const b = await ci.getType(t); return await putPastedImage(new File([b], 'imagen-pegada', { type: t })); }
    }
    if (orPick) { toast('No hay ninguna imagen copiada: elige un archivo (o copia una con clic derecho → «Copiar imagen»)'); $('imgFile').click(); }
    else toast('No hay ninguna imagen copiada: en la web, clic derecho sobre la imagen → «Copiar imagen»');
  } catch (e) { console.warn(e); if (orPick) $('imgFile').click(); else toast('Pulsa Ctrl+V para pegar la imagen'); }
  return false;
}
cv.addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(x => /^image\//.test(x.type))) e.preventDefault(); });
cv.addEventListener('drop', async e => { const f = [...e.dataTransfer.files].find(x => /^image\//.test(x.type)); if (!f) return; e.preventDefault(); if (layoutMode !== 'split') setLayout('split', true); await setImageFile(f); });
$('cropBtn').onclick = () => enterCrop('image');
$('camBtn').onclick = () => enterCrop('cam');
$('contentBtn').onclick = () => enterCrop('content');
$('cropsReset').onclick = () => { zones = []; Object.assign(crops, JSON.parse(JSON.stringify(DEFAULT_CROPS))); delete crops.fit; delete crops.zk; pushHistory(); };
$('cropReset').onclick = () => { crop = null; imgOff.x = imgOff.y = 0; setRange('imgZoom', 100); pushHistory(); };
$('imgCenter').onclick = () => { imgOff.x = imgOff.y = 0; pushHistory(); };

function fillZoom() { const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080; return Math.min(560, Math.ceil(H / (W * vh / vw) * 100)); }
// zoom: se puede pasar un poco de la pantalla completa, y al acercarse a ella se queda pegado (imán)
let zPrev = 100;
function zoomMax() { if (!loaded) return; const z = $('zoom'), mx = layoutMode === 'single' ? Math.max(800, Math.round(fillZoom() * 1.6)) : 800; if (+z.max !== mx) { z.max = mx; zPrev = +z.value; } }
$('zoom').addEventListener('input', () => {
  const z = $('zoom'); let v = +z.value;
  if (layoutMode === 'single' && loaded) {
    const fz = fillZoom();
    if (v !== fz && (zPrev === fz ? Math.abs(v - fz) <= 3 : Math.abs(v - fz) <= 6)) { v = fz; z.value = fz; }
    $('zoomV').textContent = v + '%' + (v === fz ? ' · pantalla completa 🧲' : v > fz ? ' · más que la pantalla' : '');
  }
  zPrev = v;
});
$('zFit').onclick = () => { setRange('zoom', 100); setRange('offX', 0); setRange('offY', 0); };
$('z150').onclick = () => setRange('zoom', 150);
$('zFill').onclick = () => { setRange('zoom', layoutMode === 'split' ? 100 : fillZoom()); setRange('offX', 0); setRange('offY', 0); };
$('zCenter').onclick = () => { setRange('offX', 0); setRange('offY', 0); };
$('resetPos').onclick = () => { pos.tx = pos.ty = pos.sx = 0; setRange('subY', 60); setRange('titleSize', 54); setRange('subSize', 72); setRange('titleLH', 118); setRange('subLH', 112); };


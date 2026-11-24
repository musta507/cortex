/* ---------- 4) editar con el ratón: menú del clic derecho ---------- */
// botón visible para cambiar el formato (además del clic derecho)
setTimeout(() => { const tb = $('tplBtn'); if (tb) tb.addEventListener('click', e => {
  e.stopPropagation(); const r = tb.getBoundingClientRect(), names = Object.keys(templates || {});
  ctxOpen(r.left, r.bottom + 6, 'Plantillas de este creador', names.length ? names.map(n => ({ icon: '🎨', label: n, act: async () => { await applyStyle(JSON.parse(JSON.stringify(templates[n]))); pushHistory(); toast('Plantilla «' + n + '» aplicada'); } }))
    : [{ icon: 'ℹ️', label: 'Este creador aún no tiene plantillas guardadas', act: () => {} }]);
}); }, 0);
setTimeout(() => { const fb = $('fmtBtn'); if (fb) fb.addEventListener('click', e => { e.stopPropagation(); const r = fb.getBoundingClientRect(); ctxOpen(r.left, r.bottom + 6, 'Cambiar el formato', fmtItems()); }); }, 0);
function ctxClose() { const m = $('ctxMenu'); if (m) { m.hidden = true; m.innerHTML = ''; } }
let ctxStack = [];
function ctxOpen(x, y, title, items) { ctxStack = []; ctxAt = { x, y }; ctxRender(title, items); }
let ctxAt = { x: 0, y: 0 };
function ctxRender(title, items) {
  const m = $('ctxMenu'); m.innerHTML = '';
  if (ctxStack.length) {
    const back = document.createElement('button'); back.innerHTML = '<span class="ci">←</span><span>Atrás</span>';
    back.onclick = ev => { ev.stopPropagation(); const p = ctxStack.pop(); ctxRender(p.title, p.items); }; m.append(back);
  }
  if (title) { const h = document.createElement('div'); h.className = 'ch'; h.textContent = title; m.append(h); }
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(document.createElement('hr')); continue; }
    if (it.swatches) {
      const row = document.createElement('div'); row.className = 'sw';
      const l = document.createElement('span'); l.textContent = it.label; row.append(l);
      for (const c of it.swatches) { const b = document.createElement('button'); b.style.background = c; b.title = c; if ((it.cur || '').toLowerCase() === c.toLowerCase()) b.className = 'on'; b.onclick = ev => { ev.stopPropagation(); it.act(c); ctxClose(); }; row.append(b); }
      m.append(row); continue;
    }
    const b = document.createElement('button'); b.type = 'button';
    if (it.on) b.classList.add('on'); if (it.danger) b.classList.add('danger'); if (it.dis) b.disabled = true;
    b.innerHTML = '<span class="ci"></span><span class="cl"></span><span class="ck"></span>';
    b.querySelector('.ci').textContent = it.icon || '';
    b.querySelector('.cl').textContent = it.label;
    b.querySelector('.ck').textContent = it.sub ? '›' : it.on ? '✓' : (it.key || '');
    b.onclick = ev => {
      ev.stopPropagation();
      if (it.sub) { ctxStack.push({ title, items }); ctxRender(it.label, typeof it.sub === 'function' ? it.sub() : it.sub); return; }
      ctxClose(); it.act();
    };
    m.append(b);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  m.style.left = Math.max(8, Math.min(ctxAt.x, vw - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(ctxAt.y, vh - r.height - 8)) + 'px';
}
document.addEventListener('pointerdown', e => {
  if (!$('ctxMenu').hidden && !$('ctxMenu').contains(e.target)) ctxClose();
  if (!$('ezPop').hidden && !$('ezPop').contains(e.target) && !$('emojiPop').contains(e.target)) ezPopDone(true);
}, true);
addEventListener('resize', ctxClose);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ctxMenu').hidden) { ctxClose(); e.stopImmediatePropagation(); } }, true);

const SW_HL = ['#ff1f1f', '#ffd400', '#22e06b', '#20d5c8', '#3b82f6', '#ff4fd8', '#ff8a00'];
const SW_TXT = ['#ffffff', '#ffd400', '#22e06b', '#20d5c8', '#ff1f1f', '#000000'];
const step = (id, d) => { setRange(id, +$(id).value + d); pushHistory(); };
const toggleBox = id => { const el = $(id); el.checked = !el.checked; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); pushHistory(); };
const needKey = fn => () => { if (!getGemKey()) { ezAskKey(fn); return; } fn(); };
const fmtItems = () => { const cur = curFmtOf(); const it = EZ_FMTS.filter(([k]) => fixFmt(k) === k).map(([k, ic, n]) => ({ icon: ic, label: n, on: cur === k, act: () => ezSetFormat(k) })); it.push({ icon: '🎬', label: clipMeta.scenes && clipMeta.scenes.length ? 'Volver a detectar las escenas' : 'Formato por escenas (detectar)', act: () => scenesAuto(false) }); if (clipMeta.scenes && clipMeta.scenes.length) it.push({ icon: '✖️', label: 'Quitar el formato por escenas', act: () => { delete clipMeta.scenes; scSig = ''; pushHistory(); toast('Un solo formato para todo el clip'); } }); return it; };
const commonTail = () => [
  { sep: true },
  { icon: vid.paused ? '▶' : '❚❚', label: vid.paused ? 'Reproducir' : 'Pausar', key: 'Espacio', act: togglePlay },
  { icon: '↶', label: 'Deshacer', key: 'Ctrl+Z', dis: hi <= 0, act: () => goHistory(-1) },
];
const isoItems = () => isoOn() ? [
  { icon: '🎙️', label: 'Voz aislada (quitar)', on: true, act: () => isoSet(false) },
  { icon: '🎚️', label: 'Nivel del fondo', sub: () => [0, 15, 30, 50].map(v => ({ icon: v ? v + '%' : '0', label: v ? `Fondo al ${v} %` : 'Solo la voz', on: Math.round((clipMeta.iso.lvl || 0)) === v, act: () => isoSet(null, v) })) },
] : [{ icon: '🎙️', label: 'Aislar la voz (quitar música y fondo)', act: () => clipMeta.iso ? isoSet(true) : isoRun() }];
function ctxItems(k) {
  if (k === 'title') return ['Título', [
    { icon: '✏️', label: 'Cambiar el texto', key: 'doble clic', act: () => ezEdit('title') },
    { icon: '✨', label: 'Otro título con IA', act: needKey(() => aiTitle(false)) },
    { icon: '🔴', label: 'Palabras en color…', act: ezHLPop },
    { icon: '😀', label: 'La IA añade un emoji al final', on: $('titleEmoji').checked, act: () => { const v = !$('titleEmoji').checked; repSet('titleEmoji', v); pushHistory(); toast(v ? 'Los títulos automáticos llevarán un emoji al final' : 'Los títulos automáticos irán sin emoji'); } },
    { icon: '🤖', label: 'La IA destaca palabras sola', on: autoHLOn(), act: () => { const v = !autoHLOn(); repSet('titleAutoHL', v); if (!v) { titleHL.clear(); renderChips(); } pushHistory(); toast(v ? 'La IA pondrá palabras en color al escribir el título' : 'La IA ya no pondrá palabras en color (tú sí puedes)'); } },
    { swatches: SW_HL, label: 'Color', cur: $('titleHl').value, act: c => { setRange('titleHl', c); pushHistory(); } },
    { icon: '▢', label: 'Estilo', sub: () => [
      { icon: '⬜', label: 'Con caja', on: titleStyle === 'box', act: () => { setTitleStyle('box'); pushHistory(); } },
      { icon: 'T', label: 'Sin caja', on: titleStyle !== 'box', act: () => { setTitleStyle('plain'); pushHistory(); } },
      { icon: 'AA', label: 'MAYÚSCULAS', on: $('titleUpper').checked, act: () => toggleBox('titleUpper') },
    ] },
    +$('titleW').value > 0 ? { icon: '↔', label: 'Ancho automático', act: () => { setRange('titleW', 0); pushHistory(); } } : { icon: '↔', label: 'Ajustar el ancho: arrastra los lados', dis: true, act: () => {} },
    { icon: 'A+', label: 'Más grande', act: () => step('titleSize', 4) },
    { icon: 'A−', label: 'Más pequeño', act: () => step('titleSize', -4) },
    { icon: '⟲', label: 'Volver a su sitio', act: () => { pos.tx = 0; pos.ty = 0; pushHistory(); } },
    { sep: true },
    { icon: '👁', label: 'Quitar el título', danger: true, act: () => { trk.title.hide = true; syncTrackUI(); pushHistory(); toast('Título quitado (clic derecho en el vídeo para volver a ponerlo)'); } },
  ]];
  if (k === 'sub') return ['Subtítulos', [
    { icon: '🎨', label: 'Personalizar estilo…', act: () => stShow('sub') },
    { icon: '✏️', label: 'Corregir esta frase', key: 'doble clic', act: () => ezEdit('sub') },
    { icon: '≡', label: 'Palabras por frase', sub: () => [1, 2, 3, 4, 5].map(n => ({ icon: String(n), label: n === 1 ? '1 palabra' : n + ' palabras', on: +$('wpc').value === n, act: () => { setRange('wpc', n); pushHistory(); } })) },
    { swatches: SW_TXT, label: 'Color', cur: $('subColor').value, act: c => { setRange('subColor', c); pushHistory(); } },
    { icon: 'AA', label: 'MAYÚSCULAS', on: $('upper').checked, act: () => toggleBox('upper') },
    { icon: 'A+', label: 'Más grandes', act: () => step('subSize', 4) },
    { icon: 'A−', label: 'Más pequeños', act: () => step('subSize', -4) },
    { icon: '🎙️', label: captions.length ? 'Volver a escribirlos' : 'Escribir los subtítulos', act: ezResubs },
    { icon: '🚫', label: 'Esta plantilla va sin subtítulos', act: () => { repSet('subsGen', false); toast('Esta plantilla ya no lleva subtítulos: la IA no los generará (guárdala en la plantilla del creador)'); } },
    { sep: true },
    { icon: '👁', label: 'Quitar los subtítulos', danger: true, act: () => { trk.caps.hide = true; syncTrackUI(); pushHistory(); toast('Subtítulos quitados (clic derecho en el vídeo para volver a ponerlos)'); } },
  ]];
  if (k === 'logo') return ['Logo', [
    { icon: 'A+', label: 'Más grande', act: () => { step('logoSize', 2); saveLogoCfg(); } },
    { icon: 'A−', label: 'Más pequeño', act: () => { step('logoSize', -2); saveLogoCfg(); } },
    { icon: '↻', label: 'Girar 90°', key: 'Mayús + rueda', act: () => { let v = +$('logoRot').value + 90; if (v > 180) v -= 360; setRange('logoRot', v); saveLogoCfg(); pushHistory(); } },
    +$('logoRot').value ? { icon: '⟲', label: 'Quitar el giro', act: () => { setRange('logoRot', 0); saveLogoCfg(); pushHistory(); } } : null,
    { icon: '⬇', label: 'Abajo, en el centro', act: () => { logoAuto.manual = true; logoAuto.dy = 0; logoPos.x = W / 2; logoPos.y = H - 230; saveLogoCfg(); pushHistory(); } },
    { icon: '↗', label: 'Arriba a la derecha', act: () => { logoAuto.manual = true; logoAuto.dy = 0; logoPos.x = W - 170; logoPos.y = 240; saveLogoCfg(); pushHistory(); } },
    { icon: trk.logo.lock ? '🔓' : '🔒', label: trk.logo.lock ? 'Desbloquear (poder moverlo)' : 'Bloquear en su sitio', act: () => { trk.logo.lock = !trk.logo.lock; syncTrackUI(); saveLogoCfg(); pushHistory(); } },
    { icon: '🖼️', label: 'Cambiar el logo…', act: () => $('logoFile').click() },
    { sep: true },
    { icon: '👁', label: 'Quitar el logo de este clip', danger: true, act: () => { trk.logo.hide = true; syncTrackUI(); pushHistory(); } },
  ]];
  if (k && k.startsWith('txt:')) {
    const tx = txtById(+k.slice(4)); if (!tx) return null;
    return ['Texto', [
      { icon: '🎨', label: 'Personalizar estilo…', act: () => stShow(k) },
      { icon: '✏️', label: 'Cambiar el texto', key: 'doble clic', act: () => ezEdit(k) },
      { swatches: SW_TXT, label: 'Color', cur: tx.color, act: c => { tx.color = c; fillTextPanel(); pushHistory(); } },
      { icon: 'A+', label: 'Más grande', act: () => { tx.size = Math.min(400, tx.size + 8); fillTextPanel(); pushHistory(); } },
      { icon: 'A−', label: 'Más pequeño', act: () => { tx.size = Math.max(16, tx.size - 8); fillTextPanel(); pushHistory(); } },
      { icon: '▢', label: tx.bg ? 'Quitar el fondo' : 'Poner fondo', act: () => { tx.bg = !tx.bg; fillTextPanel(); pushHistory(); } },
      { sep: true },
      { icon: '🗑', label: 'Borrar el texto', danger: true, act: () => { texts = texts.filter(x => x !== tx); selected = null; tsel.clear(); fillTextPanel(); tlSig = ''; pushHistory(); } },
    ]];
  }
  if (/^p\d$/.test(k)) k = 'video';
  const callItems = () => callOn() ? [{ sep: true },
    { icon: '👥', label: 'Personas en la llamada', sub: () => [2, 3, 4, 5].map(n => ({ icon: n === (crops.n || 2) ? '●' : '○', label: n + ' personas', on: n === (crops.n || 2), act: () => setCallN(n) })) },
    { icon: '🔍', label: 'Buscar las cámaras otra vez', act: () => { camDetectedFor = null; callDetect().then(() => pushHistory()); } }] : [];
  const edgeItems = () => (+$('edgeT').value || +$('edgeB').value) ? [{ icon: '↕', label: 'Quitar las bandas de arriba y abajo', act: () => { setRange('edgeT', 0); setRange('edgeB', 0); pushHistory(); } }] : [];
  if (k === 'edgeT' || k === 'edgeB') return ['Borde', [
    { icon: '↕', label: 'Arrastra el borde para dejar una banda', dis: true },
    { icon: '⬛', label: 'Banda negra', on: !String($('bg').value).startsWith('blur'), act: () => { setRange('bg', 'black'); pushHistory(); } },
    { icon: '🌫️', label: 'Banda con el vídeo difuminado', on: String($('bg').value).startsWith('blur'), act: () => { setRange('bg', 'blur2'); pushHistory(); } },
    ...edgeItems(), ...callItems(),
  ]];
  if (k === 'cam') return ['Cámara', [
    { icon: '🔍', label: 'Acercar la cámara', act: () => camZoom(0.88) },
    { icon: '🔎', label: 'Alejar la cámara', act: () => camZoom(1 / 0.88) },
    { icon: '✂️', label: 'Marcar dónde está la cámara', act: () => enterCrop('cam') },
    { icon: '✨', label: 'Que la IA la vuelva a buscar', act: () => { camDetectedFor = null; autoDetectCam(true); } },
    { icon: '⬆', label: 'Más espacio para la cámara', act: () => step('ratio', 5) },
    { icon: '⬇', label: 'Menos espacio para la cámara', act: () => step('ratio', -5) },
    { sep: true }, { icon: '🎞️', label: 'Cambiar el formato', sub: fmtItems },
  ]];
  if (k === 'image' || k === 'seam') return ['Imagen', [
    { icon: '🖼️', label: img ? 'Cambiar la imagen…' : 'Poner una imagen…', act: () => $('imgFile').click() },
    { icon: '📋', label: 'Pegar la imagen copiada (Ctrl+V)', act: () => pasteImageBtn() },
    { icon: '✂️', label: 'Recortar la imagen', dis: !img, act: () => enterCrop('image') },
    { icon: '🔍', label: 'Acercar la imagen', dis: !img, act: () => step('imgZoom', 10) },
    { icon: '🔎', label: 'Alejar la imagen', dis: !img, act: () => step('imgZoom', -10) },
    { icon: '⬆', label: 'Más espacio para el vídeo', act: () => step('ratio', 5) },
    { icon: '⬇', label: 'Menos espacio para el vídeo', act: () => step('ratio', -5) },
    { sep: true }, { icon: '🎞️', label: 'Cambiar el formato', sub: fmtItems },
  ]];
  if (k === 'video') return [layoutMode === 'react' ? 'Contenido' : 'Vídeo', [
    { icon: '🔍', label: 'Acercar', act: () => step('zoom', 10) },
    { icon: '🔎', label: 'Alejar', act: () => step('zoom', -10) },
    { icon: '⛶', label: 'Llenar la pantalla', act: () => { $('zFill').click(); pushHistory(); } },
    { icon: '▭', label: 'Ver entero', act: () => { $('zFit').click(); pushHistory(); } },
    { icon: '✛', label: 'Centrar', act: () => { $('zCenter').click(); pushHistory(); } },
    layoutMode === 'react' ? { icon: '✂️', label: 'Elegir qué parte se ve', act: () => enterCrop('content') } : null,
    layoutMode === 'react' ? { icon: '✨', label: 'Que la IA lo vuelva a encuadrar', act: () => { camDetectedFor = null; autoDetectCam(true); } } : null,
    clipMeta.cam ? { icon: '✨', label: 'Volver a recortar la cámara con IA', act: needKey(detectCamOnly) } : null,
    layoutMode === 'single' && !clipMeta.cam ? { icon: '🎯', label: 'Seguir la cara', on: !!(clipMeta.track && clipMeta.track.on), act: toggleTrack } : null,
    clipMeta.track && clipMeta.track.on ? { icon: '↻', label: 'Volver a analizar la cara', act: () => faceTrack() } : null,
    ...callItems(), ...edgeItems(),
    { sep: true }, ...isoItems(), { icon: '🎞️', label: 'Cambiar el formato', sub: fmtItems },
    ...commonTail(),
  ]];
  // fondo / nada en concreto
  return ['Clip', [
    { icon: '🎞️', label: 'Cambiar el formato', sub: fmtItems },
    { icon: '✂️', label: 'Cambiar la duración', act: () => { if (clipMeta.hook) ezUnhook(); ezRetrimOpen(); } },
    clipMeta.hook ? { icon: '↺', label: 'Quitar el gancho', act: ezUnhook } : { icon: '🪝', label: 'Buscar un gancho al principio', act: () => ezHook(false) },
    clipMeta.hook ? { icon: '🪝', label: 'Probar otro gancho', act: () => ezHook(false) } : null,
    { icon: '✨', label: 'Rehacer todo con IA', act: () => ezRunAI() },
    Object.keys(templates).length ? { icon: '🎨', label: 'Plantillas de este creador', sub: () => Object.keys(templates).map(n => ({ icon: '•', label: n, act: async () => { await applyStyle(JSON.parse(JSON.stringify(templates[n]))); pushHistory(); toast('Plantilla «' + n + '» aplicada'); } })) } : null,
    !$('subsGen').checked ? { icon: '💬', label: 'Esta plantilla lleva subtítulos', act: () => repSet('subsGen', true) } : null,
    { icon: '🧪', label: 'Probar ganchos y estructuras', act: () => ezVariants() },
    ...isoItems(),
    { icon: '🧬', label: 'Replicar un clip viral de este vídeo…', act: repFromCurrent },
    { icon: 'T', label: 'Añadir un texto', act: ezAddText },
    { icon: '🔇', label: clipMeta.flagsDone ? 'Buscar palabras malas otra vez' : 'Buscar palabras malas', act: () => clipMeta.flagsDone ? rescanFlags() : ezCensor(false) },
    mutes.length ? { icon: '🔊', label: `Quitar los silencios (${mutes.length})`, act: () => { mutes = []; (clipMeta.flags || []).forEach(f => f.on = false); renderFlags(); tlSig = ''; pushHistory(); toast('Ya no se silencia nada'); } } : null,
    trk.title.hide ? { icon: '👁', label: 'Volver a poner el título', act: () => { trk.title.hide = false; syncTrackUI(); pushHistory(); } } : null,
    trk.caps.hide || (clipMeta.noSubs && !captions.length) ? { icon: '💬', label: 'Poner subtítulos', act: () => { trk.caps.hide = false; syncTrackUI(); if (!captions.length) ezResubs(); else { clipMeta.noSubs = false; pushHistory(); } } } : null,
    trk.logo.hide ? { icon: '👁', label: 'Volver a poner el logo', act: () => { trk.logo.hide = false; syncTrackUI(); pushHistory(); } } : null,
    !logo ? { icon: '🖼️', label: 'Poner un logo…', act: () => $('logoFile').click() } : null,
    ...commonTail(),
    { icon: '⤓', label: 'Exportar el vídeo', act: () => $('export').click() },
    ezMode ? { icon: '⚙️', label: 'Abrir el editor avanzado', act: () => setEasy(false) } : null,
  ]];
}
cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (exporting || cropMode || !loaded) return;
  ezPopDone(true);
  const p = canvasPt(e), k = hitAny(p);
  if (k && k.startsWith('txt:')) selectText(+k.slice(4), true); else selected = k;
  const r = ctxItems(k); if (!r) return;
  ctxOpen(e.clientX + 2, e.clientY + 2, r[0], r[1]);
});

/* editar un texto ahí mismo */
let ezPopState = null;
function ezPopClose() { const p = $('ezPop'); if (p) { p.hidden = true; p.innerHTML = ''; } ezPopState = null; }
function ezPopDone(keep) {
  if (!ezPopState) return;
  const s = ezPopState; ezPopState = null;
  if (!keep && s.restore) s.restore(); else if (s.changed) pushHistory();
  $('ezPop').hidden = true; $('ezPop').innerHTML = '';
}
const seOpen = () => { const e = $('stEd'); return !!(e && !e.hidden); };
const cvRect = () => seOpen() ? $('seCv').getBoundingClientRect() : cv.getBoundingClientRect();
function ezPlacePop(k) {
  const pop = $('ezPop'), r = cvRect();
  let b = k === 'title' ? boxes.title : k === 'sub' ? boxes.sub : k && k.startsWith('txt:') ? txtBoxes[+k.slice(4)] : null;
  let x = r.left + r.width / 2, y = r.top + r.height * 0.3;
  if (b) { x = r.left + (b.x + b.w / 2) * r.width / W; y = r.top + (b.y + b.h) * r.height / H + 10; }
  const pr = pop.getBoundingClientRect();
  pop.style.left = Math.max(12, Math.min(x - pr.width / 2, innerWidth - pr.width - 12)) + 'px';
  pop.style.top = Math.max(12, Math.min(y, innerHeight - pr.height - 12)) + 'px';
}
function capIndexNow() {
  if (!captions.length) return -1;
  const t = vid.currentTime || 0;
  let i = captions.findIndex(c => t >= c.start && t < c.end);
  if (i < 0 && activeCap >= 0) i = activeCap;
  if (i < 0) { let bd = Infinity; captions.forEach((c, j) => { const d = Math.min(Math.abs(c.start - t), Math.abs(c.end - t)); if (d < bd) { bd = d; i = j; } }); }
  return i;
}
function ezEdit(k) {
  ctxClose(); ezPopDone(true); vid.pause();
  let label, get, set;
  if (k === 'title') { label = 'Título'; get = () => $('title').value; set = v => { $('title').value = v; $('title').dispatchEvent(new Event('input', { bubbles: true })); }; }
  else if (k === 'sub') {
    const i = capIndexNow();
    if (i < 0) { toast('Este clip aún no tiene subtítulos: clic derecho → Escribir los subtítulos'); return; }
    seekSrc(captions[i].start + 0.01);
    label = 'Subtítulo'; get = () => captions[i].words.map(w => w.text.trim()).join(' '); set = v => { editCaption(i, v); renderCapList(); };
  } else if (k && k.startsWith('txt:')) {
    const tx = txtById(+k.slice(4)); if (!tx) return;
    label = 'Texto'; get = () => tx.text; set = v => { tx.text = v; fillTextPanel(); };
  } else return;
  const orig = get(), pop = $('ezPop');
  pop.innerHTML = `<strong></strong><textarea rows="2"></textarea><div class="row"><span class="hint">Enter: línea nueva · Ctrl+Enter guarda · Esc cancela</span><button class="emobtn" type="button" title="Emojis">😀</button><button type="button" data-a="no">Cancelar</button><button type="button" class="primary" data-a="ok">Listo</button></div>`;
  pop.querySelector('strong').textContent = label;
  const ta = pop.querySelector('textarea'); ta.value = orig;
  ezPopState = { restore: () => set(orig), changed: false };
  ta.addEventListener('input', () => { set(ta.value); ezPopState && (ezPopState.changed = true); });
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ezPopDone(true); }
    if (e.key === 'Escape') { e.preventDefault(); ezPopDone(false); }
  });
  pop.querySelector('[data-a=ok]').onclick = () => ezPopDone(true);
  pop.querySelector('[data-a=no]').onclick = () => ezPopDone(false);
  pop.querySelector('.emobtn').onclick = ev => {
    ev.stopPropagation(); emojiTarget = ta;
    const ep = $('emojiPop'), r = ev.currentTarget.getBoundingClientRect();
    ep.hidden = false; renderEmojiGrid();
    ep.style.position = 'fixed'; ep.style.zIndex = 62;
    ep.style.left = Math.max(8, Math.min(r.left - 150, innerWidth - ep.offsetWidth - 8)) + 'px';
    ep.style.top = Math.max(8, r.top - ep.offsetHeight - 8) + 'px';
  };
  pop.hidden = false; ezPlacePop(k);
  ta.focus(); ta.select();
}
function ezHLPop() {
  ctxClose(); ezPopDone(true);
  const pop = $('ezPop');
  pop.innerHTML = `<strong>Toca las palabras que quieres en color</strong><div class="chips"></div><div class="row"><button type="button" class="primary" data-a="ok">Listo</button></div>`;
  pop.style.setProperty('--hlc', $('titleHl').value);
  const box = pop.querySelector('.chips');
  const draw = () => {
    box.innerHTML = '';
    $('title').value.split(/\s+/).filter(Boolean).forEach((w, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (titleHL.has(i) ? ' on' : ''); b.textContent = w;
      b.onclick = () => { titleHL.has(i) ? titleHL.delete(i) : titleHL.add(i); renderChips(); draw(); ezPopState.changed = true; };
      box.append(b);
    });
  };
  ezPopState = { changed: false }; draw();
  pop.querySelector('[data-a=ok]').onclick = () => ezPopDone(true);
  pop.hidden = false; ezPlacePop('title');
}
function ezAddText() {
  addText();
  const id = selTextId();
  if (ezMode) { showLeft('media'); setTimeout(() => { if (id != null) ezEdit('txt:' + id); }, 60); }
}
function ezAskKey(then) {
  ctxClose(); ezPopDone(true);
  const pop = $('ezPop');
  pop.innerHTML = `<strong>Pega tu clave de Gemini</strong><span class="hint">Hace falta para que la IA escriba títulos y elija el formato. Se guarda solo en este ordenador.</span><input type="password" autocomplete="off" placeholder="Clave de Gemini"><div class="row"><button type="button" data-a="no">Cancelar</button><button type="button" class="primary" data-a="ok">Guardar</button></div>`;
  const inp = pop.querySelector('input');
  const save = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } try { localStorage.setItem('clipzi-gemini', v); } catch {} if ($('gemKey')) $('gemKey').value = v; ezPopClose(); toast('Clave guardada'); if (then) then(); };
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') ezPopClose(); });
  pop.querySelector('[data-a=ok]').onclick = save; pop.querySelector('[data-a=no]').onclick = ezPopClose;
  ezPopState = { changed: false };
  pop.hidden = false; ezPlacePop(null); inp.focus();
}



/* ==================== REPLICAR UN CLIP VIRAL + PROBAR GANCHOS Y ESTRUCTURAS ====================
   Replicar: le das el vídeo en crudo y un clip viral hecho de ese vídeo. Cortex escucha los dos (huella del audio,
   como Shazam), encuentra cada trozo que usa el clip viral y en qué orden, y copia la edición desde el original:
   cortes, formato, título, estilo de subtítulos y palabras silenciadas.
   Variantes: del mismo clip saca varias versiones con otro gancho, otro principio, otro final o más corto. */


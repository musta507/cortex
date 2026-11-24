/* ---------- 2) recortar la duración ---------- */
function ezTrimOpen() {
  if (!loaded) { ezShow('insert'); return; }
  if (ezVid.src !== vid.src) ezVid.src = vid.src;
  const D = ezDur();
  if (!(ezB > ezA)) { ezA = 0; ezB = D; }
  $('ezTrimT').textContent = ezRetrim ? 'Cambia la duración del clip' : 'Recorta la duración';
  $('ezGo').textContent = ezRetrim ? '✓ Aplicar recorte' : '✨ Editar con IA';
  $('ezManual').hidden = ezRetrim; $('ezBack').hidden = ezRetrim; $('ezOpts').hidden = ezRetrim; $('ezTpls').hidden = ezRetrim; ezOptsUI(); ezTplUI();
  $('ezBack').textContent = 'Cambiar de clip';
  $('ezKeyWrap').hidden = ezRetrim || !!getGemKey();
  $('ezKey').value = '';
  try { ezVid.currentTime = ezA + 0.01; } catch {}
  ezTrimUI();
  if (ezThumbsFor !== file) ezMakeThumbs();
}
async function ezMakeThumbs() {
  ezThumbsFor = file; const box = $('ezThumbs'); box.innerHTML = '';
  const n = 12, tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
  try { await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = rej; setTimeout(res, 4000); }); } catch { return; }
  const cs = [];
  for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = 160; c.height = 90; box.append(c); cs.push(c); }
  for (let i = 0; i < n; i++) {
    if (ezThumbsFor !== file) return;
    await tvSeek(tv, Math.min(ezDur() - 0.05, ezDur() * (i + 0.5) / n));
    try { const x = cs[i].getContext('2d'), r = Math.max(160 / tv.videoWidth, 90 / tv.videoHeight), w = tv.videoWidth * r, h = tv.videoHeight * r; x.drawImage(tv, (160 - w) / 2, (90 - h) / 2, w, h); } catch {}
  }
  // fotogramas pequeños para que al arrastrar la barra la imagen vaya fluida (primero uno de cada pocos, luego se rellena)
  const D = ezDur(), fn = Math.max(40, Math.min(260, Math.ceil(D * 6))), fw = 256, fh = Math.round(fw * (tv.videoHeight || 9) / (tv.videoWidth || 16));
  ezFrames = { file, n: fn, D, list: new Array(fn).fill(null) };
  const sc = $('ezScrub'); sc.width = fw; sc.height = fh;
  const order = [], seen = new Set();
  for (const st of [16, 8, 4, 2, 1]) for (let i = 0; i < fn; i += st) if (!seen.has(i)) { seen.add(i); order.push(i); }
  for (const i of order) {
    if (ezThumbsFor !== file || ezFrames.file !== file) break;
    await tvSeek(tv, Math.min(D - 0.03, i * D / (fn - 1)));
    try { const c = document.createElement('canvas'); c.width = fw; c.height = fh; c.getContext('2d').drawImage(tv, 0, 0, fw, fh); ezFrames.list[i] = c; } catch {}
  }
  tv.removeAttribute('src'); tv.load();
}
let ezFrames = null, ezSeekBusy = false, ezSeekWant = null;
function ezScrubShow(t) {
  const F = ezFrames; if (!F || F.file !== file) return;
  let i = Math.round(t / F.D * (F.n - 1)); i = Math.max(0, Math.min(F.n - 1, i));
  let c = F.list[i];
  for (let d = 1; !c && d < F.n; d++) c = F.list[i - d] || F.list[i + d];
  if (!c) return;
  const sc = $('ezScrub'); sc.getContext('2d').drawImage(c, 0, 0, sc.width, sc.height); sc.hidden = false;
}
// el vídeo de verdad se coloca sin atascarse: solo se pide otro salto cuando acaba el anterior
function ezSeekTo(t) {
  ezSeekWant = t; if (ezSeekBusy) return;
  ezSeekBusy = true; const go = ezSeekWant; ezSeekWant = null;
  try { ezVid.currentTime = go; } catch { ezSeekBusy = false; }
}
ezVid.addEventListener('seeked', () => { ezSeekBusy = false; if (ezSeekWant != null) ezSeekTo(ezSeekWant); else if (!ezDrag) $('ezScrub').hidden = true; });
ezVid.addEventListener('play', () => { $('ezScrub').hidden = true; });
function ezTrimUI() {
  const D = ezDur() || 1, a = ezA / D * 100, b = ezB / D * 100;
  $('ezSel').style.left = a + '%'; $('ezSel').style.width = (b - a) + '%';
  $('ezDimL').style.width = a + '%'; $('ezDimR').style.width = (100 - b) + '%';
  $('ezPh').style.left = ((ezDrag ? ezScrubT : (ezVid.currentTime || 0)) / D * 100) + '%';
  $('ezTipA').textContent = fmtS(ezA); $('ezTipB').textContent = fmtS(ezB);
  $('ezTimes').innerHTML = `Empieza <b>${fmtS(ezA)}</b> · acaba <b>${fmtS(ezB)}</b> · dura <b>${(ezB - ezA).toFixed(1)} s</b>`;
}
function ezBarT(e) { const r = $('ezBarIn').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ezDur(); }
$('ezBar').addEventListener('pointerdown', e => {
  const h = e.target.dataset && e.target.dataset.h;
  ezDrag = h || 'seek'; ezLastH = h || ezLastH;
  document.querySelectorAll('.ez-sel i').forEach(x => x.classList.toggle('on', x.dataset.h === h));
  $('ezBar').setPointerCapture(e.pointerId); e.preventDefault();
  if (ezDrag === 'seek') { ezVid.pause(); const t = Math.max(ezA, Math.min(ezB - 0.05, ezBarT(e))); ezScrubShow(t); ezSeekTo(t); ezScrubT = t; ezTrimUI(); }
});
$('ezBar').addEventListener('pointermove', e => {
  if (!ezDrag) return;
  const t = ezBarT(e), MIN = 1;
  let at;
  if (ezDrag === 'a') { ezA = Math.max(0, Math.min(t, ezB - MIN)); at = ezA; }
  else if (ezDrag === 'b') { ezB = Math.min(ezDur(), Math.max(t, ezA + MIN)); at = Math.max(ezA, ezB - 0.05); }
  else at = Math.max(ezA, Math.min(ezB - 0.05, t));
  ezVid.pause(); ezScrubT = at; ezScrubShow(at); ezSeekTo(ezDrag === 'b' ? Math.max(ezA, ezB - 1) : at);
  ezTrimUI();
});
let ezScrubT = 0;
let ezLastH = null;
// al soltar: el asa de inicio reproduce desde el principio; la del final, solo el último segundo
function ezPreview(h) {
  const to = h === 'b' ? Math.max(ezA, ezB - 1) : ezA;
  ezSeekWant = null; ezSeekBusy = false;
  // si el vídeo ya está ahí (se fue colocando mientras arrastrabas), arranca al instante, sin volver a buscar
  if (Math.abs((ezVid.currentTime || 0) - to) > 0.04) { try { ezVid.currentTime = to; } catch {} }
  $('ezScrub').hidden = true; ezVid.play().catch(() => {});
}
const ezEndDrag = () => { const was = ezDrag; ezDrag = null; document.querySelectorAll('.ez-sel i.on').forEach(x => x.classList.remove('on')); if (was === 'a' || was === 'b') ezPreview(was); else ezSeekTo(ezScrubT); ezTrimUI(); };
// afinar con el teclado: ← → mueven el último extremo tocado 0,1 s (con Mayús, 1 s)
document.addEventListener('keydown', e => {
  if (!ezMode || ezStep !== 'trim' || !ezLastH || !/^Arrow(Left|Right)$/.test(e.key) || (e.target.closest && e.target.closest('input,textarea,select'))) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
  if (ezLastH === 'a') ezA = Math.max(0, Math.min(ezA + d, ezB - 1)); else ezB = Math.min(ezDur(), Math.max(ezB + d, ezA + 1));
  ezTrimUI(); clearTimeout(ezPreview.t); ezVid.pause();   ezScrubShow(ezLastH === 'a' ? ezA : ezB); ezSeekTo(ezLastH === 'b' ? Math.max(ezA, ezB - 1) : ezA); ezPreview.t = setTimeout(() => ezPreview(ezLastH), 350);
}, true);
$('ezBar').addEventListener('pointerup', ezEndDrag);
$('ezBar').addEventListener('pointercancel', ezEndDrag);
function ezTogglePlay() {
  if (ezVid.paused) { if (ezVid.currentTime < ezA || ezVid.currentTime >= ezB - 0.06) ezVid.currentTime = ezA; ezVid.play().catch(() => {}); }
  else ezVid.pause();
}
$('ezPlay').onclick = ezTogglePlay;
ezVid.addEventListener('click', ezTogglePlay);
ezVid.addEventListener('play', () => { $('ezPlay').textContent = '❚❚'; const tick = () => { if (ezVid.paused) return; if (ezVid.currentTime >= ezB) { ezVid.pause(); ezVid.currentTime = ezB; } ezTrimUI(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
ezVid.addEventListener('pause', () => { $('ezPlay').textContent = '▶'; ezTrimUI(); });
ezVid.addEventListener('seeked', ezTrimUI);
$('ezAll').onclick = () => { ezA = 0; ezB = ezDur(); ezTrimUI(); };
$('ezKey').addEventListener('input', () => { const v = $('ezKey').value.trim(); try { localStorage.setItem('clipzi-gemini', v); } catch {} if ($('gemKey')) $('gemKey').value = v; });
$('ezBack').onclick = () => { ezShow('insert'); };
document.addEventListener('keydown', e => {
  if (!ezMode || ezStep !== 'trim') return;
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); ezTogglePlay(); }
  else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); $('ezGo').click(); }
  else e.stopImmediatePropagation();   // en este paso no hay atajos del editor
}, true);
function ezApplyTrim() {
  const a = Math.max(0, ezA), b = Math.min(ezDur(), ezB);
  segs = [{ id: newId(), s: a, e: b }]; pseg = 0;
  // los subtítulos y textos que se queden fuera no molestan: solo se ven dentro del clip
  tsel.clear(); tlSig = '';
  seekOut(0); pushHistory(); renderFlags();
}
$('ezManual').onclick = async () => { ezApplyTrim(); ezShow('edit'); clipMeta.noSubs = !(await ezAgentCfg()).subs; await ezClipApply(); toast('Haz clic derecho sobre el vídeo para ver las opciones'); };
$('ezGo').onclick = async () => {
  if (!ezRetrim && !$('ezTitleAuto').checked && !$('ezTitleIn').value.trim()) { toast('Escribe el título o marca «Automático»'); $('ezTitleIn').focus(); return; }
  if (!ezRetrim && !$('ezFmtAuto').checked && !ezFmtSel) { toast('Elige un formato o marca «Automático»'); return; }
  if (ezRetrim) {
    const [o0, o1] = clipMeta.subR || [0, 0];
    ezApplyTrim(); ezShow('edit');
    await retrackIfNeeded();
    // si ahora el clip llega a partes sin subtítulos, se vuelven a escribir
    if (captions.length && !clipMeta.noSubs && (ezA < o0 - 0.3 || ezB > o1 + 0.3)) await ezResubs();
    toast('Duración cambiada'); return;
  }
  ezApplyTrim(); ezShow('edit');
  ezSkip.subs = ezClip.s === 'no';
  try { await ezRunAI(); } finally { ezSkip.subs = false; }
  await ezClipApply();
};

// formato elegido para los clips del directo ('auto' = lo elige la IA)
function lvFmtUI() {
  const box = $('lvFmtPick'); if (!box) return; box.innerHTML = '';
  const cur = ezPref('liveFmt') || 'auto';
  for (const [id, ic, name] of [['auto', '✨', 'Automático (la IA elige)'], ...EZ_FMTS]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ez-fmt' + (cur === id ? ' on' : '');
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(cur === id));
    b.innerHTML = '<span></span><b></b>'; b.firstChild.textContent = ic; b.lastChild.textContent = name;
    b.onclick = () => { ezPref('liveFmt', id); lvFmtUI(); toast(id === 'auto' ? 'La IA elegirá el formato de cada clip' : 'Los clips del directo saldrán en ' + name); };
    box.append(b);
  }
}
/* elegir título y formato antes de editar (o dejarlo en automático) */
let ezFmtSel = null;
const ezPref = (k, v) => { try { if (v === undefined) return localStorage.getItem('cortex-' + k); localStorage.setItem('cortex-' + k, v); } catch {} return null; };
function ezOptsUI() {
  const ta = $('ezTitleAuto'), fa = $('ezFmtAuto');
  if (!ezOptsUI.done) {
    ezOptsUI.done = true;
    ta.checked = ezPref('titleAuto') !== '0'; fa.checked = ezPref('fmtAuto') !== '0'; ezFmtSel = ezPref('fmt') || null;
    ta.onchange = () => { ezPref('titleAuto', ta.checked ? '1' : '0'); ezOptsUI(); if (!ta.checked) $('ezTitleIn').focus(); };
    fa.onchange = () => { ezPref('fmtAuto', fa.checked ? '1' : '0'); ezOptsUI(); };
    $('ezTitleIn').addEventListener('keydown', e => { e.stopPropagation(); });   // Enter: baja a la línea de abajo
    $('emojiEzTitle').onclick = e => openEmoji(e.currentTarget, $('ezTitleIn'));
  }
  $('ezTitleIn').disabled = ta.checked; $('emojiEzTitle').disabled = ta.checked;
  $('ezTitleIn').placeholder = ta.checked ? 'Lo escribirá la IA al editar' : 'Escribe el título del clip';
  const box = $('ezFmtPick'); box.innerHTML = ''; box.classList.toggle('off', fa.checked);
  for (const [id, ic, name] of EZ_FMTS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ez-fmt' + (!fa.checked && ezFmtSel === id ? ' on' : '');
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(!fa.checked && ezFmtSel === id)); b.disabled = fa.checked;
    b.innerHTML = '<span></span><b></b>'; b.firstChild.textContent = ic; b.lastChild.textContent = name;
    try { b.prepend(mockFrom(fmtStyle(id), false, id)); } catch {}
    b.onclick = () => { ezFmtSel = id; ezPref('fmt', id); ezClip.f = ''; ezOptsUI(); ezTplUI(); };
    box.append(b);
  }
}

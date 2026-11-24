/* ---------- pantalla de revisión: clip a clip, ajustar con el ratón, aprobar o descartar ---------- */
let reviewBatch = null;
const revClips = () => projIndex.filter(x => x.batch === reviewBatch).sort((a, b) => (b.score || 0) - (a.score || 0));
async function openAgentClip(e) {
  const f = await batchFile(e.batch); if (!f) return false;
  curClient = e.client; await loadClientStore(e.client); resetEditor(); curProj = e.id;
  let saved = null, im = null;
  try { saved = await kv.get('proj:' + e.id); im = await kv.get('image:' + e.id); } catch {}
  hideHome(); setCrumb();
  const p = saved ? JSON.parse(saved.snap) : null;
  if (p) { segs = p.segs || []; }
  await loadFile(f, true);
  if (im) await loadImageBlob(im, im.name, true);
  if (p) { await applyProject(p); hist = [saved.snap]; hi = 0; updUndo(); }
  seekOut(0); activePreset = null; renderPresets(); renderReview();
  // lo que el agente deja para cuando se abre: detectar la cámara
  if (clipMeta.needDetect && layoutMode === 'react') { clipMeta.needDetect = false; camDetectedFor = null; await autoDetectCam(true); pushHistory(); }
  if (clipMeta.needDuo) { clipMeta.needDuo = false; await duoDetect(); pushHistory(); }
  if (clipMeta.needCam) { clipMeta.needCam = false; await detectCamOnly(); }
  if (clipMeta.needTrack) { clipMeta.needTrack = false; await faceTrack(true); }
  return true;
}
async function detectCamOnly() {
  if (!getGemKey()) { toast('Para recortar la cámara hace falta la clave de Gemini'); return; }
  try {
    aiov('work', 'Recortando la cámara del streamer', 'La IA está buscando su cámara…');
    const fr = await sampleFrames(2);
    const res = await gemRetry(() => geminiAnalyze(fr.map(c => c.toDataURL('image/jpeg', 0.85).split(',')[1])), m => aiov('work', 'Recortando la cámara del streamer', m));
    const r = res.find(x => x && x.found), b = r && box2(r.webcam_box_2d);
    if (!b) { await aiovDone(false, 'No he encontrado la cámara', 'Puedes dejarlo en horizontal o cambiar de formato.'); return; }
    const cam = snapToEdges(b, persistentEdges(fr));
    const ix = cam.w * 0.04, iy = cam.h * 0.04;
    clipMeta.cam = { x: cam.x + (cam.x > 0.002 ? ix : 0), y: cam.y + (cam.y > 0.002 ? iy : 0), w: cam.w - (cam.x > 0.002 ? ix : 0) - (cam.x + cam.w < 0.998 ? ix : 0), h: cam.h - (cam.y > 0.002 ? iy : 0) - (cam.y + cam.h < 0.998 ? iy : 0) };
    setRange('zoom', 100); setRange('offX', 0); setRange('offY', 0);
    pushHistory(); renderReview(); await aiovDone(true, 'Cámara recortada', 'Solo se ve su cámara');
  } catch (e) { console.warn(e); await aiovDone(false, 'No se pudo recortar la cámara', 'Revisa tu clave de Gemini o tu conexión.'); }
}
async function enterReview(bid) {
  reviewBatch = bid; await loadBatches();
  const list = revClips(); if (!list.length) { toast('Este lote no tiene clips'); return; }
  ezLeave(); $('app').classList.add('review'); $('revBack').hidden = true;
  const first = list.find(x => x.status === 'pending') || list[0];
  await openAgentClip(first);
}
async function exitReview() { await saveNow(); $('app').classList.remove('review'); reviewBatch = null; $('revBack').hidden = true; goHome(); }
function curFmtOf() { return layoutMode === 'react' ? ($('duo').checked ? ($('call').checked ? 'llamada' : 'duo') : 'reaccion') : layoutMode === 'split' ? 'dividida' : clipMeta.cam ? 'horizontal_cam' : (+$('titleY').value >= 0 ? 'podcast' : 'horizontal'); }
async function addFeedback(e, kind) {
  const cl = clientOf(e.client); if (!cl) return;
  const a = await getAgent(cl), to = curFmtOf();
  a.feedback = [...(a.feedback || []), { t: kind, title: $('title').value.trim() || e.name, fmt: e.fmt, to: kind === 'aprobado' && to !== e.fmt ? to : '', reason: e.reason }].slice(-40);
  await saveAgent(cl, a);
}
async function revNext(dir = 1, onlyPending = true) {
  const list = revClips(), i = list.findIndex(x => x.id === curProj);
  for (let k = 1; k <= list.length; k++) {
    const c = list[(i + dir * k + list.length * 2) % list.length];
    if (!onlyPending || c.status === 'pending') { await saveNow(); await openAgentClip(c); return; }
  }
  renderReview(); toast('No quedan clips por revisar');
}
async function revSet(status) {
  const e = projIndex.find(x => x.id === curProj); if (!e) return;
  if (status === 'approved' && layoutMode === 'split' && !img) { toast('Falta la imagen: pégala antes de aprobar'); return; }
  e.status = status; await saveNow(); await saveIndex();
  if (status === 'discarded') await addFeedback(e, 'descartado');
  if (status === 'approved' && curFmtOf() !== e.fmt) await addFeedback(e, 'aprobado');
  toast(status === 'approved' ? '✓ Aprobado' : '✕ Descartado');
  await revNext(1, true);
}
function renderReview() {
  if (!$('app').classList.contains('review') && $('revBack').hidden) return;
  const list = revClips(), b = batches.find(x => x.id === reviewBatch) || {};
  const done = list.filter(x => x.status !== 'pending').length, ok = list.filter(x => x.status === 'approved').length;
  $('revTitle').textContent = b.name || 'Revisión';
  $('revCount').textContent = `${done} de ${list.length} revisados · ${ok} aprobados`;
  const e = list.find(x => x.id === curProj);
  $('revInfo').innerHTML = '';
  if (e) {
    const h = document.createElement('div'); h.className = 'revcur';
    h.innerHTML = `<span class="sc">${e.score || '–'}</span><div><strong></strong><span class="hint"></span></div>`;
    h.querySelector('strong').textContent = (AG_FORMATS[e.fmt] || {}).name || e.fmt;
    h.querySelector('.hint').textContent = e.reason || '';
    $('revInfo').append(h);
    if (layoutMode === 'split' && !img) { const w = document.createElement('p'); w.className = 'status err'; w.textContent = '⚠ Falta la imagen de abajo: ' + (clipMeta.imgPrompt || '') + ' — pégala con Ctrl+V o arrástrala.'; $('revInfo').append(w); }
  }
  // cambiar de formato con un clic
  const fb = $('revFmts'); fb.innerHTML = '';
  for (const [k, F] of Object.entries(AG_FORMATS)) {
    const bt = document.createElement('button'); bt.textContent = F.name; bt.className = curFmtOf() === k ? 'on' : '';
    bt.onclick = async () => {
      const pr = PRESETS.find(x => x.name === F.preset); if (!pr) return;
      const keepT = $('title').value, keepHL = [...titleHL];
      await applyStyle(cleanForPreset(effectivePreset(pr)));
      if (k === 'podcast') setRange('titleY', 13);
      clipMeta.cam = k === 'horizontal_cam' ? clipMeta.cam : null;
      $('title').value = keepT; titleHL.clear(); keepHL.forEach(x => titleHL.add(x)); renderChips();
      logoPos.x = W / 2; logoPos.y = H - 230;
      if (k === 'reaccion') { camDetectedFor = null; autoDetectCam(true).then(renderReview); }
      if (k === 'duo' || k === 'llamada') duoDetect().then(() => { pushHistory(); renderReview(); });
      if (k === 'horizontal_cam' && !clipMeta.cam) detectCamOnly();
      if (k === 'dividida' && !clipMeta.imgPrompt) clipMeta.imgPrompt = 'algo que represente lo que dice';
      pushHistory(); renderReview();
    };
    fb.append(bt);
  }
  // título y palabras en rojo
  if (document.activeElement !== $('revTitleIn')) $('revTitleIn').value = $('title').value;
  renderRevChips();
  const L = $('revList'); L.innerHTML = '';
  for (const c of list) {
    const r = document.createElement('button'); r.className = 'revrow' + (c.id === curProj ? ' on' : '') + ' st-' + c.status;
    r.innerHTML = `<span class="sc"></span><span class="rt"></span><span class="rm hint"></span><span class="rs"></span>`;
    r.querySelector('.sc').textContent = c.score || '–';
    r.querySelector('.rt').textContent = c.name;
    r.querySelector('.rm').textContent = `${(AG_FORMATS[c.fmt] || {}).name || c.fmt} · ${Math.round(c.dur || 0)} s${c.needImg ? ' · imagen' : ''}`;
    r.querySelector('.rs').textContent = c.status === 'approved' ? '✓' : c.status === 'discarded' ? '✕' : '';
    r.onclick = async () => { await saveNow(); await openAgentClip(c); };
    L.append(r);
  }
  $('revExport').textContent = `⤓ Exportar aprobados (${ok})`; $('revExport').disabled = !ok;
}
async function exportApproved() {
  const list = revClips().filter(x => x.status === 'approved'); if (!list.length) return;
  for (let i = 0; i < list.length; i++) {
    if (!(await openAgentClip(list[i]))) return;
    if (layoutMode === 'split' && !img) { toast(`«${list[i].name}» no tiene imagen: me lo salto`); continue; }
    toast(`Exportando ${i + 1} de ${list.length}…`);
    const out = await doExport();
    if (out) { const a = document.createElement('a'); a.href = URL.createObjectURL(out.blob); a.download = `${String(i + 1).padStart(2, '0')}_` + exportName(out); document.body.append(a); a.click(); a.remove(); }
  }
  toast('Exportación terminada');
}
function renderRevChips() {
  const box = $('revChips'); box.innerHTML = '';
  $('title').value.split(/\s+/).filter(Boolean).forEach((w, i) => {
    const b = document.createElement('button'); b.className = 'chip' + (titleHL.has(i) ? ' on' : ''); b.textContent = w; b.type = 'button';
    b.onclick = () => { titleHL.has(i) ? titleHL.delete(i) : titleHL.add(i); renderChips(); renderRevChips(); pushHistory(); };
    box.append(b);
  });
}
$('revTitleIn').addEventListener('input', () => { $('title').value = $('revTitleIn').value; $('title').dispatchEvent(new Event('input', { bubbles: true })); renderRevChips(); });
$('revOk').onclick = () => revSet('approved');
$('revNo').onclick = () => revSet('discarded');
$('revPrev').onclick = () => revNext(-1, false);
$('revNextB').onclick = () => revNext(1, false);
$('revEdit').onclick = () => { $('app').classList.remove('review'); $('revBack').hidden = false; showLeft('media'); showInsp('video'); tlSig = ''; };
$('revBack').onclick = () => { $('app').classList.add('review'); $('revBack').hidden = true; renderReview(); };
$('revExit').onclick = exitReview;
$('revExport').onclick = exportApproved;
document.addEventListener('keydown', e => {
  if (!$('app').classList.contains('review') || !$('home').hidden || typingIn(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'a') { e.preventDefault(); e.stopImmediatePropagation(); revSet('approved'); }
  else if (k === 'x') { e.preventDefault(); e.stopImmediatePropagation(); revSet('discarded'); }
  else if (e.key === 'PageDown') { e.preventDefault(); revNext(1, false); }
  else if (e.key === 'PageUp') { e.preventDefault(); revNext(-1, false); }
}, true);


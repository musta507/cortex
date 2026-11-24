/* ---------- botón «Editar con IA» con sus casillas (se guardan) ---------- */
let stAiBusy = false;
async function stAiRun() {
  if (!loaded || exporting || stPend || stAiBusy) return;
  stAiBusy = true; const b = $('seAi'); b.disabled = true; b.textContent = '⏳ La IA está editando…'; $('seAiD').hidden = true;
  const aT = ezPref('stAutoT') !== '0', aF = ezPref('stAutoF') !== '0', aS = ezPref('stAutoS') !== '0', aE = ezPref('stAutoE') === '1', aX = ezPref('stAutoX') !== '0';
  try {
    const fa = $('ezFmtAuto'); fa.checked = aF; if (!aF) ezFmtSel = clipMeta.fmt || ezFmtSel || ezPref('stFmtDef') || 'horizontal';
    ezSkip.title = !aT; ezSkip.subs = !aS; ezSkip.scenes = !aE;
    try { await ezRunAI(); } finally { ezSkip.title = ezSkip.subs = ezSkip.scenes = false; }
    if (aX && !titleIsDefault()) await stAiTrim();
    stCenter(); stEdFmts(clipMeta.fmt || ''); stEdTT(); mtSig = ''; $('seS').textContent = '✅ Listo. Cambia lo que quieras y exporta.';
  } catch (e) { console.warn(e); $('seS').textContent = '⚠ ' + (e.message || e); }
  finally { stAiBusy = false; b.disabled = false; b.textContent = '✨ Editar con IA'; }
}
setTimeout(() => {
  if (!$('seAi')) return;
  $('seAi').onclick = stAiRun;
  $('seAiMore').onclick = e => { e.stopPropagation(); $('seAiD').hidden = !$('seAiD').hidden; };
  document.addEventListener('pointerdown', e => { if (!$('seAiD').hidden && !e.target.closest('.se-ai')) $('seAiD').hidden = true; });
  $('seAutoO').checked = ezPref('stAutoO') !== '0'; $('seAutoO').onchange = () => ezPref('stAutoO', $('seAutoO').checked ? '1' : '0');
}, 0);
function stEdAutoUI() {
  $('seAutoE').checked = ezPref('stAutoE') === '1';
  $('seAutoX').checked = ezPref('stAutoX') !== '0';
  $('seAutoT').checked = ezPref('stAutoT') !== '0'; $('seAutoF').checked = ezPref('stAutoF') !== '0'; $('seAutoS').checked = ezPref('stAutoS') !== '0';
  const d = ezPref('stFmtDef'), n = (EZ_FMTS.find(x => x[0] === d) || [])[2];
  $('seAutoFh').textContent = $('seAutoF').checked ? '' : `(si no, usa ${n || 'Horizontal'})`;
  for (const b of $('seFmts').children) b.classList.toggle('def', b.dataset.id === d && !$('seAutoF').checked);
}
// el mismo panel, a pantalla completa, nada más meter un clip (subido o por enlace): la IA lo prepara y tú solo corriges
let stQuick = false;
async function stQuickOpen(fresh = true) {
  stExpFail = false;
  const ed = $('stEd'); if (ed.parentNode !== document.body) document.body.append(ed);   // fuera del panel en directo, para que se vea en cualquier pantalla
  stQuick = true; stDock = true; ed.classList.add('full'); ed.hidden = false;
  stEdSound = true; $('seSnd').textContent = '🔊';   // aquí no hay directo que escuchar: el clip suena
  $('seT').innerHTML = `<i></i>Tu clip <em>${Math.round(ezDur())} s</em>`; $('seRes').innerHTML = ''; $('seBarW').hidden = true; $('seTitle').value = ''; $('seExp').disabled = true;
  const auto = ezPref('stAutoO') !== '0', aT = auto && ezPref('stAutoT') !== '0', aF = auto && ezPref('stAutoF') !== '0', aS = auto && ezPref('stAutoS') !== '0';
  $('seS').textContent = aT || aF || aS ? '✨ La IA está preparando el clip… puedes ir escribiendo el título' : '⏳ Abriendo el clip…';
  stEdFmts(''); stEdTT(); stEdAutoUI(); cancelAnimationFrame(stEdRaf); stEdLoop(); setTimeout(() => $('seTitle').focus(), 60);
  if (fresh && autoOff()) {   // todo lo automático desactivado: el clip se queda tal cual, sin IA
    ezA = 0; ezB = ezDur(); ezApplyTrim(); ezShow('edit'); fresh = false;
  }
  if (!fresh) {   // clip ya hecho: solo se enseña como está
    stPend = null; stEdR = [0, ezDur()]; for (const id of ['seA', 'seB']) { $(id).min = 0; $(id).max = ezDur(); }
    stEdTrimUI(); stEdTT(); stEdFmts(clipMeta.fmt || ''); vid.muted = !stEdSound; $('seS').textContent = ''; $('seExp').disabled = false; return;
  }
  ezA = 0; ezB = ezDur(); ezApplyTrim(); ezShow('edit');
  ezSkip.title = !aT; ezSkip.subs = !aS; ezSkip.scenes = !(auto && ezPref('stAutoE') === '1');
  const fmt0 = aF ? null : (ezPref('stFmtDef') || 'horizontal');
  if (fmt0) { $('ezFmtAuto').checked = false; ezFmtSel = fmt0; }
  stPend = 'quick';   // mientras la IA trabaja, lo que escribas no se pisa
  try { await ezRunAI(); } catch (e) { console.warn(e); } finally { ezSkip.title = ezSkip.subs = ezSkip.scenes = false; stPend = null; }
  if (!stQuick) return;
  const mine = $('seTitle').value.trim();
  if (mine) { try { titleHL.clear(); } catch {} $('title').value = mine; $('title').dispatchEvent(new Event('input', { bubbles: true })); try { renderChips(); pushHistory(); } catch {} }
  if (stPendFmt && clipMeta.fmt !== stPendFmt) { try { stNoScenes(); await ezSetFormat(stPendFmt); } catch (e) { console.warn(e); } } stPendFmt = '';
  stCenter(); stEdR = [0, ezDur()];
  for (const id of ['seA', 'seB']) { $(id).min = 0; $(id).max = ezDur(); }
  stEdTrimUI(); stEdTT(); stEdFmts(clipMeta.fmt || ''); vid.muted = !stEdSound; $('seS').textContent = ''; stTrimDone = false;
  if (auto && ezPref('stAutoX') !== '0' && !titleIsDefault() && ezDur() > 40) await stAiTrim();
  mtSig = '';
  $('seExp').disabled = false;
  if (titleIsDefault()) $('seS').textContent = '✍️ Escribe el título y pulsa Ctrl+Enter' + (ezDur() > 40 ? ': la IA recorta el clip y te lo deja listo.' : '.');
}
async function stEdClose(full) {
  try { mtInspClose(); mtCapCommit(true); } catch {}
  if (stQuick) {   // panel rápido: ✕ guarda y vuelve al inicio; «Editor completo» se queda en el editor
    stEdSound = false; $('seSnd').textContent = '🔇'; stQuick = false; stPend = null; cancelAnimationFrame(stEdRaf); $('stEd').hidden = true; $('stEd').classList.remove('full'); vid.muted = false; stDock = false;
    if (!full) { try { vid.pause(); await saveNow(); } catch (e) { console.warn(e); } try { $('homeBtn').click(); } catch {} }
    return;
  }
  if (stPend === 'prep') { const t = $('seTitle').value; stPrepKeep = t.trim() || stPendFmt ? { t, f: stPendFmt } : null; if (stPrepKeep) toast('✏️ Título guardado para el próximo clip'); }
  if (stPend) { stPend = null; cancelAnimationFrame(stEdRaf); $('stEd').hidden = true; $('livePage').classList.remove('dock'); stDock = false; $('stS').textContent = ''; return; }
  cancelAnimationFrame(stEdRaf); $('stEd').hidden = true; $('livePage').classList.remove('dock'); vid.muted = false;
  if (full) { stDock = false; $('livePage').hidden = true; $('liveBack').hidden = false; return; }
  try { vid.pause(); await saveNow(); } catch (e) { console.warn(e); }
  stDock = false;
}
setTimeout(() => {
  if (!$('stEd')) return;
  $('stEd').addEventListener('keydown', e => e.stopPropagation());
  $('seX').onclick = () => { if (exporting) { toast('Espera a que termine de exportar'); return; } stEdClose(); };
  $('seFull').onclick = () => { if (stPend) { toast('Espera a que el clip esté listo'); return; } if (!exporting) stEdClose(true); };
  $('sePlay').onclick = () => togglePlay();
  { // el reproductor del panel se maneja como el del editor: arrastrar mueve (vídeo, título, logo…), la rueda hace zoom
    const m = $('seCv'); let down = null;
    const fwd = (type, e) => {
      const r = cv.getBoundingClientRect(), q = m.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, view: window, clientX: r.left + (e.clientX - q.left) / q.width * r.width, clientY: r.top + (e.clientY - q.top) / q.height * r.height,
        button: e.button, buttons: e.buttons, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, pointerId: e.pointerId || 1, pointerType: e.pointerType || 'mouse', isPrimary: true, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode };
      cv.setPointerCapture = cv.releasePointerCapture = () => {};   // el ratón está sobre la copia, no sobre el lienzo de verdad
      try { cv.dispatchEvent(type === 'wheel' ? new WheelEvent(type, init) : new PointerEvent(type, init)); } finally { delete cv.setPointerCapture; delete cv.releasePointerCapture; }
    };
    const ok = () => loaded && !exporting && !stPend;
    m.addEventListener('pointerdown', e => { if (!ok() || e.button !== 0) return; e.preventDefault(); let k0 = null; try { const r = cv.getBoundingClientRect(), q = m.getBoundingClientRect(); k0 = hitAny(canvasPt({ clientX: r.left + (e.clientX - q.left) / q.width * r.width, clientY: r.top + (e.clientY - q.top) / q.height * r.height })); } catch {} down = { x: e.clientX, y: e.clientY, moved: false, k: k0 }; try { m.setPointerCapture(e.pointerId); } catch {} fwd('pointerdown', e); });
    m.addEventListener('pointermove', e => { if (!ok()) return; if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) down.moved = true; fwd('pointermove', e); m.style.cursor = cv.style.cursor || 'grab'; });
    const up = e => { if (!down) return; const d = down; down = null; fwd('pointerup', e); if (!d.moved && !(d.k === 'image' && !img)) togglePlay(); };
    m.addEventListener('pointerup', up); m.addEventListener('pointercancel', e => { if (down) { down = null; fwd('pointercancel', e); } });
    m.addEventListener('wheel', e => { if (!ok()) return; e.preventDefault(); fwd('wheel', e); }, { passive: false });
    m.addEventListener('contextmenu', e => {
      e.preventDefault(); if (!ok() || cropMode) return; ezPopDone(true);
      const r = cv.getBoundingClientRect(), q = m.getBoundingClientRect(), p = canvasPt({ clientX: r.left + (e.clientX - q.left) / q.width * r.width, clientY: r.top + (e.clientY - q.top) / q.height * r.height }), k = hitAny(p);
      if (k && k.startsWith('txt:')) selectText(+k.slice(4), true); else selected = k;
      const it = ctxItems(k); if (it) ctxOpen(e.clientX + 2, e.clientY + 2, it[0], it[1]);
    });
  }
  $('seSnd').onclick = () => { stEdSound = !stEdSound; vid.muted = !stEdSound; $('seSnd').textContent = stEdSound ? '🔊' : '🔇'; lvMiniCheck(); };
  $('seTitle').addEventListener('input', () => { if (stPend) return; try { titleHL.clear(); } catch {} $('title').value = $('seTitle').value; $('title').dispatchEvent(new Event('input', { bubbles: true })); });
  $('seTitle').addEventListener('change', () => { try { renderChips(); pushHistory(); } catch {} });
  $('seTitle').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('seTitle').blur(); if (stPend) { $('seS').textContent = stQuick ? '👍 Título puesto: se aplica en cuanto la IA termine.' : '👍 Título puesto. En cuanto el clip esté guardado, la IA lo recorta y te lo deja listo.'; return; } if ($('seTitle').value.trim() && ezPref('stAutoX') !== '0' && !stTrimDone) stAiTrim(); } });
  $('seAiTrim').onclick = () => stAiTrim();
  $('seSubSt').onclick = () => { if (!loaded || stPend) return; if (!mtSubsOn()) { toast('Este clip no tiene subtítulos: pulsa «+ Subtítulos» en la línea de tiempo'); return; } stShow('sub'); };
  $('seSubsOn').onchange = async () => {
    const on = $('seSubsOn').checked; ezPref('stAutoS', on ? '1' : '0'); try { stEdAutoUI(); } catch {}
    if (!loaded || stPend) { toast(on ? 'Los clips saldrán con subtítulos' : 'Los clips saldrán sin subtítulos'); return; }
    if (!on) { mtSubsHide(); toast('Subtítulos quitados (los siguientes clips también saldrán sin ellos)'); return; }
    trk.caps.hide = false; clipMeta.noSubs = false; try { syncTrackUI(); } catch {}
    if (!captions.length) { $('seS').textContent = '💬 Escribiendo los subtítulos…'; await mtSubsAdd(); $('seS').textContent = ''; } else pushHistory();
    mtDirty(); toast('Subtítulos puestos');
  };
  setInterval(() => { const c = $('seSubsOn'); if (c && document.activeElement !== c && !$('stEd').hidden) c.checked = loaded && !stPend ? mtSubsOn() : ezPref('stAutoS') !== '0'; }, 700);
  $('seTxtAdd').onclick = () => { if (!loaded || stPend) return; ezAddText(); };
  $('seLogoT').onclick = e => { if (!loaded || stPend) return; const it = ctxItems(logo ? 'logo' : null); if (!it) return; const r = e.currentTarget.getBoundingClientRect(); if (logo) ctxOpen(r.left, r.bottom + 4, it[0], it[1]); else $('logoFile').click(); };
  $('seMoreM').onclick = e => { if (!loaded || stPend) return; const it = ctxItems(null); const r = e.currentTarget.getBoundingClientRect(); if (it) ctxOpen(r.left, r.bottom + 4, it[0], it[1]); };
  $('seTT').onchange = async () => { const n = $('seTT').value; if (!loaded) return; if (n) { await ttPick(n); stCenter(); } else { titleDef = null; await saveTypeStore(); toast('Título del formato: se verá al cambiar de formato'); } };
  const trim = which => { if (!loaded || exporting) return; let a = +$('seA').value, b = +$('seB').value; if (b - a < 2) { if (which === 'a') a = b - 2; else b = a + 2; } ezA = a; ezB = b; ezApplyTrim(); stEdTrimUI(); if (which === 'b') { try { seekOut(Math.max(0, b - a - 2)); } catch {} } };
  for (const [id, k] of [['seAutoT', 'stAutoT'], ['seAutoF', 'stAutoF'], ['seAutoS', 'stAutoS'], ['seAutoX', 'stAutoX'], ['seAutoE', 'stAutoE']]) $(id).onchange = () => { ezPref(k, $(id).checked ? '1' : '0'); stEdAutoUI(); };
  // guardar en la plantilla todo como está colocado ahora (vídeo, zoom, recortes, textos y logo)
  window.stTplUI = () => { const r = $('seFmtReset'); if (r) r.hidden = !(activePreset && presetOverrides[activePreset]); const s = $('seFmtSave'); if (s && activePreset) s.textContent = '💾 Guardar cómo está en «' + fmtLbl(activePreset) + '»'; };
  $('seFmtSave').onclick = async () => {
    if (!loaded) { toast('Abre primero un clip'); return; }
    if (!activePreset) { toast('Elige primero un formato'); return; }
    const m = cleanForPreset(getStyle()); m.fixed = true; m.logo = { x: logoPos.x, y: logoPos.y, size: $('logoSize').value, op: $('logoOp').value, rot: $('logoRot').value };
    presetOverrides[activePreset] = m;
    const ok = await savePresetStore(); try { renderPresets(); } catch {} stTplUI();
    toast(ok ? '💾 Guardado: «' + fmtLbl(activePreset) + '» saldrá siempre así. Solo tendrás que poner el título.' : 'No se pudo guardar la plantilla');
  };
  $('seFmtReset').onclick = async () => {
    if (!activePreset || !presetOverrides[activePreset]) return;
    const nm = activePreset; delete presetOverrides[nm]; await savePresetStore();
    const p = PRESETS.find(x => x.name === nm); if (p && loaded) await applyPreset(p);
    stTplUI(); toast('«' + fmtLbl(nm) + '» vuelve a como venía');
  };
  setInterval(() => { try { if (!$('stEd').hidden) stTplUI(); } catch {} }, 1500);
  $('seFmtDef').onclick = () => { const cur = ($('seFmts').querySelector('.on') || {}).dataset; if (!cur || !cur.id) { toast('Elige primero un formato'); return; } ezPref('stFmtDef', cur.id); ezPref('stAutoF', '0'); stEdAutoUI(); toast('Los próximos clips se abrirán con ese formato'); };
  $('seA').onchange = () => trim('a'); $('seB').onchange = () => trim('b');
  $('seA').oninput = $('seB').oninput = () => { $('seTrimT').textContent = `· dura ${Math.max(2, +$('seB').value - +$('seA').value).toFixed(1).replace('.', ',')} s`; };
  { // el botón Exportar: se puede pulsar siempre que haya un clip cargado (aunque la IA siga trabajando: entonces sale como se ve en ese momento)
    const b = $('seExp');
    const can = () => !exporting && loaded && stPend !== 'prep' && (stPend == null || stPend === 'quick');
    const lab = () => {
      if (exporting) { if (b.disabled) b.disabled = false; }   // mientras exporta, el mismo botón sirve para cancelar
      const rd = $('seRedo'); if (rd) { const show = !!loaded && (exporting || stExpFail); if (rd.hidden === show) rd.hidden = !show; }
      else if (b.disabled && can() && !b.dataset.busy) b.disabled = false;
      const t = b.lastChild; if (!t || t.nodeType !== 3) return;
      const w = exporting ? 'Cancelar (exportando…)' : b.disabled ? (stPend === 'prep' || !loaded ? 'Sin clip todavía' : 'Guardando el clip…') : 'Exportar';
      if (t.textContent !== w) t.textContent = w;
      b.title = exporting ? 'Pulsa para cancelar la exportación' : b.disabled ? (stPend === 'prep' || !loaded ? 'Saca un clip del directo o sube un vídeo para poder exportar' : 'El clip se está guardando. En cuanto acabe podrás exportar.') : '';
    };
    new MutationObserver(lab).observe(b, { attributes: true, attributeFilter: ['disabled'] }); setInterval(lab, 800);
  }
  // «Volver a exportar»: corta lo que esté en marcha (aunque esté parado) y empieza de cero
  $('seRedo').onclick = async () => {
    const rd = $('seRedo'); if (rd.dataset.busy) return; rd.dataset.busy = '1';
    try {
      if (exporting && expAbort) expAbort();
      for (let i = 0; i < 100 && exporting; i++) await sleep(50);
      await sleep(80);
      if (exporting) { toast('No he podido parar la exportación: recarga con F5'); return; }
      toast('Exportando otra vez desde cero…'); $('seExp').click();
    } finally { delete rd.dataset.busy; }
  };
  $('seExp').onclick = async () => {
    if (exporting) { if (expAbort) expAbort(); return; }
    if (!loaded || (stPend && stPend !== 'quick')) return;
    if (stPend === 'quick') toast('La IA aún no había terminado: exporto el clip tal y como se ve ahora');
    $('seRes').innerHTML = ''; stExpFail = false;
    const out = await doExport(); $('seBarW').hidden = true; $('seExp').disabled = false;
    if (!out) { stExpFail = true; $('seS').textContent = $('eStatus').textContent || 'No se pudo exportar'; return; }
    // se descarga solo en la carpeta Descargas (sin ventana de «Guardar como»)
    const src = $('result').querySelector('a'), name = (src && src.download) || ('clip-' + Date.now() + '.mp4');
    const a = document.createElement('a'); a.href = src ? src.href : URL.createObjectURL(out.blob); a.download = name; a.click();
    a.textContent = '✅ En Descargas: ' + name + ' · descargar otra vez'; $('seRes').append(a);
    if (window.cortexApp && window.cortexApp.openFolder) { const o = document.createElement('button'); o.type = 'button'; o.textContent = '📂 Abrir Descargas'; o.style.cssText = 'width:auto;margin-top:6px;padding:6px 12px'; o.onclick = () => window.cortexApp.openFolder('descargas'); $('seRes').append(o); }
    toast('✅ Exportado: está en tu carpeta de Descargas');
    $('seS').textContent = 'Exportado. Cierra con ✕ para seguir con el directo.';
  };
}, 0);
setTimeout(() => {
  if (!$('lvStage')) return;
  $('lvModeSt').onclick = () => stMode('stage'); $('lvModeTr').onclick = () => { if (!$('stEd').hidden && stPend !== 'prep') { toast('Cierra primero el clip que tienes abierto al lado'); return; } stMode('tr'); };
  for (const b of document.querySelectorAll('.st-b')) {
    const n = +b.dataset.n; b.onclick = () => stCut(null, n);
    b.onmouseenter = () => { const z = $('stZone'); z.style.width = (n / ST_W * 100) + '%'; z.hidden = false; }; b.onmouseleave = () => { $('stZone').hidden = true; };
  }
  $('stDetGo').onclick = () => { if (stDetM) stCut(stDetM); };
  { // arrastrar la marca para ajustar el inicio
    const f = $('stFlag'), tl = $('stTl'); let ref0 = 0;
    const at = e => { const r = tl.getBoundingClientRect(), t = ref0 - ST_W + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * ST_W; return Math.min(ref0 - 1, t); };
    f.addEventListener('pointerdown', e => { e.preventDefault(); stDrag = true; ref0 = stRef(); f.classList.add('drag'); f.setPointerCapture(e.pointerId); });
    f.addEventListener('pointermove', e => { if (!stDrag) return; stMarkAt = at(e); stFlagUI(ref0); });
    const up = () => { if (!stDrag) return; stDrag = false; f.classList.remove('drag'); stTick(); };
    f.addEventListener('pointerup', up); f.addEventListener('pointercancel', up);
  }
  const mark = () => { const S = lvTrSess(); if (!S || !S.on) return; stMarkAt = stRef(); stTick(); toast('📍 Inicio marcado'); };
  $('stMark').onclick = mark; $('stMarkX').onclick = () => { stMarkAt = null; stTick(); };
  $('stMarkCut').onclick = () => { if (stMarkAt != null) stCut(null, 'mark'); };
  document.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && stOn() && !$('livePage').hidden && ($('stEd').hidden || stPend === 'prep') && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) { e.preventDefault(); mark(); } });
  stMode();
}, 0);


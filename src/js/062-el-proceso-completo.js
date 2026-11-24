/* ---------- el proceso completo ---------- */
let repQueue = [], repTotal = 0, repRaw = null, repVir = [];
async function repRun(vf) {
  const key = !!getGemKey();
  vid.pause(); ezShow('edit');
  busy('Replicando el clip viral', [['raw', 'Escuchar el vídeo en crudo'], ['find', 'Encontrar los trozos del clip viral'], ['look', 'Copiar el formato y el estilo'], ['subs', 'Subtítulos'], ['mute', 'Silencios del clip viral'], ['title', 'Título']]);
  clipMeta.replica = { from: vf.name, busy: true }; renderSide();
  try {
    busyStep('raw', 'work');
    const R = await fpOfFile(file, p => busyMsg(`Escuchando el vídeo en crudo… ${Math.round(p * 100)} % (solo la primera vez)`));
    busyStep('raw', 'ok', fmtS(R.n * FP_HOP)); busyMsg('');
    busyStep('find', 'work'); busyMsg('Escuchando el clip viral…');
    const C = await fpOfClip(vf);
    const m = await fpMatch(R, C, p => busyMsg(`Buscando el clip viral en el vídeo en crudo… ${Math.round(p * 100)} %`));
    if (!m.pieces.length || m.cover < 0.3) throw new Error('NOFOUND');
    segs = m.pieces.map(g => ({ id: newId(), s: g.s, e: g.e })); pseg = 0; tlSig = ''; clipMeta.hook = null; delete clipMeta.variants;
    busyStep('find', 'ok', `${m.pieces.length} trozo${m.pieces.length > 1 ? 's' : ''} · ${Math.round(m.cover * 100)} % del clip`); busyMsg('');
    // formato y estilo mirando el clip viral
    let L = null;
    if (key) {
      busyStep('look', 'work');
      try { L = await repLook(vf, m2 => busyMsg(m2)); } catch (e) { console.warn('Estilo del viral', e); if (e.message === 'BADKEY') toast('La clave de Gemini no es válida'); }
    }
    const fmt = L && AG_FORMATS[L.formato] ? L.formato : null;
    $('ezBusy').hidden = true;     // que se vea la detección de la cámara
    if (fmt) await ezApplyFormat(fmt, { image: L.imagen || '' });
    if ($('aiov').dataset.state !== 'fail') aiov('hide');
    $('ezBusy').hidden = false;
    if (L) repApplyLook(L, fmt);
    busyStep('look', fmt ? 'ok' : key ? 'fail' : 'skip', fmt ? (EZ_FMTS.find(x => x[0] === fmt) || [])[2] : key ? 'no se pudo' : 'falta la clave'); busyMsg('');
    // subtítulos (solo si el viral los lleva)
    const wantSubs = !(L && L.subtitulos && L.subtitulos.hay === false);
    clipMeta.noSubs = !wantSubs; trk.caps.hide = !wantSubs; syncTrackUI();
    if (wantSubs) {
      busyStep('subs', 'work');
      const ok = await doTranscribe(m2 => busyMsg(m2));
      if (ok) clipMeta.subR = srcRange();
      busyStep('subs', ok ? 'ok' : 'fail', ok ? captions.length + ' frases' : 'no se pudo'); busyMsg('');
    } else busyStep('subs', 'skip', 'el viral no lleva');
    // las palabras que el viral silenció o tapó con un pitido
    busyStep('mute', 'work');
    const [a, b] = srcRange();
    clipMeta.flags = m.mutes.map((x, i) => {
      const w = allWords.filter(w => w.end > x.s && w.start < x.e).map(w => w.text.trim()).join(' ').replace(/[.,!?¡¿;:…"«»]/g, '');
      return { id: 8000 + i, s: x.s, e: x.e, w: w || '(silencio del viral)', cat: 'copiado', lvl: 'alta', on: true };
    });
    clipMeta.flagsDone = [a, b];
    mutes = clipMeta.flags.map(f => ({ s: f.s, e: f.e, w: f.w, fid: f.id }));
    busyStep('mute', m.mutes.length ? 'ok' : 'skip', m.mutes.length ? m.mutes.length + ' copiados' : 'no tenía'); busyMsg('');
    // título: el del viral; si no se pudo leer, uno con IA
    if (L && L.titulo && L.titulo.hay !== false && String(L.titulo.texto || '').trim()) busyStep('title', 'ok', 'copiado del viral');
    else if (L && L.titulo && L.titulo.hay === false) busyStep('title', 'skip', 'el viral no lleva');
    else if (key) { busyStep('title', 'work'); $('title').value = DEFAULT_TITLE; titleHL.clear(); renderChips(); await aiTitle(true); busyStep('title', titleIsDefault() ? 'fail' : 'ok', 'escrito con IA'); }
    else busyStep('title', 'skip', 'falta la clave');
    clipMeta.replica = { from: vf.name, cover: m.cover, pieces: m.pieces.map(g => ({ s: g.s, e: g.e, c0: g.c0, c1: g.c1 })), gaps: m.gaps, nMutes: m.mutes.length,
      notes: (L && Array.isArray(L.no_replicable) ? L.no_replicable : []).map(String).filter(Boolean).slice(0, 6) };
    pushHistory(); renderFlags(); renderSide(); await sleep(600);
    toast('🧬 Clip replicado desde el vídeo en crudo. Revisa a la izquierda qué se ha copiado.');
  } catch (e) {
    console.error(e);
    const why = e.message === 'NOFOUND' ? 'No he encontrado este clip en el vídeo en crudo. ¿Es del mismo directo? Si el clip está acelerado o con la voz cambiada, no se puede encontrar.'
      : e.message === 'SHORT' ? 'El clip viral es demasiado corto.' : e.message === 'SILENT' ? 'El clip viral casi no tiene sonido: no puedo buscarlo por el audio.'
      : e.message === 'QUOTA' ? 'Se ha acabado el límite de Gemini por ahora.' : 'Error: ' + e.message;
    clipMeta.replica = { from: vf.name, fail: why }; renderSide(); toast(why);
  } finally { busy(false); seekOut(0); }
}
async function repStart(raw, virals) {
  repQueue = [...virals]; repTotal = virals.length;
  if (raw && raw !== file) {
    ezHold = true;
    try { await loadFile(raw); } catch (e) { toast('No se pudo abrir el vídeo en crudo'); ezShow('rep'); return; } finally { ezHold = false; }
  }
  ezShow('edit');
  await repRun(repQueue.shift());
}
// el siguiente clip viral del mismo vídeo en crudo, en un clip nuevo
async function repNext() {
  if (!repQueue.length) return;
  await saveNow();
  curProj = 'p' + Date.now().toString(36);
  captions = []; allWords = []; renderCapList(); mutes = []; clipMeta = {}; texts = []; zones = [];
  const lk = trk.logo.lock; trk = TRK0(); trk.logo.lock = lk; tsel.clear(); syncTrackUI();
  $('title').value = DEFAULT_TITLE; titleHL.clear(); renderChips();
  hist = []; hi = -1; clearTimeout(histTimer);
  if (file) kv.set('clip:' + curProj, file).catch(() => {});
  await repRun(repQueue.shift());
}
// replicar sobre el vídeo que ya está abierto
function repFromCurrent() {
  const inp = $('repVirFile'); inp.value = '';
  inp.onchange = () => { const fs = [...inp.files]; if (fs.length) repStart(null, fs); };
  inp.click();
}


/* ---------- modo automático ----------
   Cada clip que sube otro clipper se saca del directo (mismo inicio y final), se monta en horizontal con el fondo
   difuminado, y se exporta solo a la carpeta «exportados» del grabador. Uno detrás de otro, sin tocar nada. */
let auBusy = false, auDone = null, auFrom = 0, auN = 0, auFail = new Map();
const auOn = () => ezPref('autoMode') === '1';
function auUI(msg) {
  const b = $('auBtn'); if (!b) return; const on = auOn();
  b.textContent = '🤖 Modo automático: ' + (on ? 'ENCENDIDO' : 'apagado'); b.classList.toggle('on', on);
  if (msg != null) $('auS').textContent = msg;
  else if (!on) $('auS').textContent = 'Saca, monta con fondo difuminado y exporta solo cada clip que suben los otros clippers. No tienes que tocar nada.';
}
// los clips automáticos se guardan en la carpeta «exportados» del grabador (si no se puede, se descargan en el navegador)
async function auSave(out, name) {
  try {
    const d = await getLiveDir(false); if (!d) throw new Error('sin carpeta');
    const ex = await d.getDirectoryHandle('exportados', { create: true });
    await wfile(ex, name, out.blob); return 'exportados/' + name;
  } catch (e) {
    console.warn('auto: no se pudo guardar en la carpeta', e);
    const a = document.createElement('a'), u = URL.createObjectURL(out.blob); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 120000);
    return 'Descargas/' + name;
  }
}
// título de reserva para el modo automático: si Gemini no lo ha escrito (sin clave, sin saldo o fallo), se intenta otra vez
// y, si no, se saca de lo que se dice en el clip (transcrito en este PC)
let auNoAI = 0;
// busca el vídeo que subió el clipper (lo descarga el grabador) y lee el texto fijo que lleva encima
async function auClipperTitle(S, m) {
  const vid = (String(m.url || '').match(/video\/(\d+)/) || [])[1]; if (!vid) return '';
  let dir; try { dir = await S.h.getDirectoryHandle('clippers'); } catch { return ''; }
  let fh = null; for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.includes(vid) && /\.(mp4|webm|mov|m4v)$/i.test(name)) { fh = h; break; }
  if (!fh) return '';
  const file = await fh.getFile(); if (!file.size) return '';
  // con la primera imagen basta casi siempre: si todo el texto está en un solo bloque, ese es el título
  const { frames } = await vlFrames(file, D => [Math.min(0.4, D * 0.05), D * 0.5]);
  const w = await ocrWorker(), read = async c => { const { data } = await w.recognize(c), ls = []; for (const l of data.lines || []) { const t = vlCleanWords(l.words); if (vlNorm(t).length < 3 || !/\p{L}{2}/u.test(t) || (l.confidence || 0) < 55) continue; const b = l.bbox || { y0: 0, y1: 0 }; ls.push({ t, y: b.y0 / c.height, y1: b.y1 / c.height, h: (b.y1 - b.y0) / c.height }); } return ls.sort((p, q) => p.y - q.y); };
  let ls = await read(frames[0]); if (!ls.length) return '';
  let blocks = 1; for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y1 > Math.max(ls[i].h, ls[i - 1].h) * 1.6) blocks++;
  if (blocks > 1 && frames[1]) {   // hay más de un texto (título y subtítulos): el título es el que sigue igual a mitad del vídeo
    const ls2 = await read(frames[1]), keep = ls.filter(l => ls2.some(x => vlSim(x.t, l.t) >= 0.75));
    if (keep.length) ls = keep; else return '';
  }
  const t = ls.map(l => l.t).join(' ').replace(/\s+/g, ' ').trim();
  return t.length >= 6 && t.split(' ').length <= 22 ? t : '';
}
async function auTitle() {
  const put = t => { try { titleHL.clear(); } catch {} $('title').value = t; $('title').dispatchEvent(new Event('input', { bubbles: true })); try { renderChips(); pushHistory(); } catch {} };
  if (getGemKey() && auNoAI < 3) { try { await aiTitle(true); } catch (e) { console.warn('auto título', e); } if (!titleIsDefault()) { auNoAI = 0; return; } auNoAI++; }
  try {
    if (!captions.length) { await doTranscribe(() => {}); if (clipMeta.noSubs) { trk.caps.hide = true; syncTrackUI(); } }
    const [a, b] = srcRange(), W = []; for (const c of captions) for (const w of c.words || []) if (w.start >= a - 0.1 && w.end <= b + 0.1) W.push(String(w.text).trim());
    // la frase más larga de las primeras (suele ser la que cuenta algo), recortada a 9 palabras
    const sents = []; let cur = []; for (const w of W) { cur.push(w); if (/[.?!…]$/.test(w) || cur.length >= 12) { sents.push(cur); cur = []; } } if (cur.length) sents.push(cur);
    const pick = sents.slice(0, 4).sort((x, y) => y.length - x.length)[0] || W.slice(0, 9);
    let t = pick.slice(0, 9).join(' ').replace(/[.,;:…]+$/, '').trim();
    if (t.length >= 6) put(t.charAt(0).toUpperCase() + t.slice(1));
  } catch (e) { console.warn('auto título local', e); }
}
async function auTick() {
  if (!auOn() || auBusy || stBusy || stPend || exporting) return;
  if ($('livePage').hidden || (!$('stEd').hidden && stPend !== 'prep') || !$('pvModal').hidden) { if (auOn()) auUI('⏸ En pausa mientras editas o miras un clip. Sigue solo al volver al directo.'); return; }
  const S = lvTrSess(); if (!S || !S.on) { auUI('Esperando a que haya un directo grabándose…'); return; }
  if (!auDone) { try { auDone = new Set((await kv.get('auto-done')) || []); } catch { auDone = new Set(); } }
  const last = S.segs && S.segs.length ? S.segs[S.segs.length - 1].t1 : 0, now = performance.now();
  const todo = (S.moments || []).filter(m => m.src === 'clipper' && !auDone.has(m.id) && (m.at || m.t1) >= auFrom && m.t1 <= last - 0.3 && m.t1 - m.t0 >= 4 && (auFail.get(m.id) || 0) < 2).sort((x, y) => (y.at || y.t1) - (x.at || x.t1));   // el más reciente primero: lo nuevo no espera detrás de lo atrasado
  if (!todo.length) { auUI(`✅ Al día · ${auN} exportado${auN === 1 ? '' : 's'} en C:\\Clipzi Grabador\\exportados · esperando el siguiente clip de los clippers…`); return; }
  const m = todo[0]; auBusy = true;
  try {
    const g = mergeMoments([m])[0]; g.tight = true; const tA = performance.now();
    auUI(`⚙️ Sacando el clip de ${m.who || 'un clipper'} (${Math.round(m.t1 - m.t0)} s)…` + (todo.length > 1 ? ` · quedan ${todo.length - 1}` : ''));
    // a la vez: el grabador corta el trozo y Cortex lee el título de la imagen del clip del clipper
    const T = { clip: Math.round(m.t1 - m.t0), cola: +(Date.now() / 1000 - (m.at || m.t1)).toFixed(1) }; let tP = tA; const lap = k => { const n = performance.now(); T[k] = +((n - tP) / 1000).toFixed(1); tP = n; };
    const [c, seen] = await Promise.all([liveCutFile(S, g), auClipperTitle(S, m).catch(e => { console.warn('auto: leer título', e); return ''; })]); lap('cortar_y_leer');
    stDock = true; ezSkip.scenes = true; ezSkip.title = !!seen; ezSkip.subs = ezPref('auSubs') !== '1'; ezSkip.speech = true;
    try { await openLiveClip(S, g, c.f, c.off, c.dur, ezPref('auFmt') || 'horizontal'); } finally { ezSkip.scenes = ezSkip.title = ezSkip.subs = ezSkip.speech = false; }
    lap('abrir');
    stNoScenes();
    if (seen) { try { titleHL.clear(); } catch {} $('title').value = seen; $('title').dispatchEvent(new Event('input', { bubbles: true })); try { renderChips(); pushHistory(); } catch {} }
    if (titleIsDefault()) { auUI(`✍️ Poniendo título al clip de ${m.who || 'un clipper'}…`); await auTitle(); }
    { const bg = ezPref('auBg') || 'blur3'; if (bg !== 'tpl' && $('bg').value !== bg) { $('bg').value = bg; $('bg').dispatchEvent(new Event('change', { bubbles: true })); } }
    { const tt = ezPref('auTT'); if (tt && ttGet(tt)) { try { await ttApply(tt, true); } catch (e) { console.warn(e); } } }
    stCenter(); lap('titulo_y_fondo');
    auUI(`⚙️ Exportando el clip de ${m.who || 'un clipper'}…`);
    const out = await doExport(); if (!out) throw new Error($('eStatus').textContent || 'no se pudo exportar'); lap('exportar');
    const tE = performance.now(); const where = await auSave(out, `${S.status.slug}_min${clockOf(m.t0 - S.status.started).replace(/:/g, '-')}_${exportName(out)}`.replace(/[\\/:*?"<>|]/g, '_'));
    lap('guardar'); T.total = +((performance.now() - tA) / 1000).toFixed(1); T.modo = out.mode || 'tiempo real'; T.fps = out.fps; T.codec = out.codec; T.mb = +(out.blob.size / 1048576).toFixed(1); T.titulo = seen ? 'leído' : 'otro'; T.hora = new Date().toLocaleTimeString('es-ES');
    // registro de tiempos (para ver dónde se va cada segundo)
    try { const d = await getLiveDir(false), ex = await d.getDirectoryHandle('exportados', { create: true }); let old = ''; try { old = await (await (await ex.getFileHandle('tiempos.txt')).getFile()).text(); } catch {} await wfile(ex, 'tiempos.txt', old + JSON.stringify(T) + '\n'); } catch (e) { console.warn(e); }
    saveNow().catch(() => {});   // el guardado del proyecto no retrasa el siguiente clip
    auDone.add(m.id); try { await kv.set('auto-done', [...auDone].slice(-3000)); } catch {}
    auN++; auUI(`✅ Exportado en ${T.total} s (abrir ${T.abrir} s · exportar ${T.exportar} s, modo ${T.modo}): ${where}`);
  } catch (e) { console.warn('auto', e); auFail.set(m.id, (auFail.get(m.id) || 0) + 1); auUI('⚠ Un clip falló (' + String(e.message || e).slice(0, 80) + '). Sigo con el siguiente.'); }
  finally { stDock = false; auBusy = false; }
}
setInterval(() => { auTick().catch(e => console.warn('auto', e)); }, 800);
setTimeout(() => {
  if (!$('auBtn')) return;
  $('auBtn').onclick = () => { const on = !auOn(); ezPref('autoMode', on ? '1' : '0'); if (on) { auFrom = Date.now() / 1000 - 600; auN = 0; auFail.clear(); try { ocrWorker().catch(() => {}); } catch {} toast('Modo automático encendido: deja esta página abierta.'); } auUI(on ? 'Arrancando…' : null); };
  if (auOn()) auFrom = Date.now() / 1000 - 600; auUI();
  // la plantilla del modo automático: formato, fondo, diseño del título y subtítulos
  const fs = $('auFmt'); for (const [id, ic, n] of EZ_FMTS) fs.append(new Option(ic + ' ' + n, id)); fs.value = ezPref('auFmt') || 'horizontal'; fs.onchange = () => ezPref('auFmt', fs.value);
  const bs = $('auBg'); bs.value = ezPref('auBg') || 'blur3'; bs.onchange = () => ezPref('auBg', bs.value);
  const ts = $('auTT'), fillTT = () => { const cur = ezPref('auTT') || ''; ts.innerHTML = ''; ts.append(new Option('El fijo del streamer', '')); for (const n of [...Object.keys(titleTpls), ...Object.keys(TT_BUILTIN).filter(n => !titleTpls[n])]) ts.append(new Option(n, n)); ts.value = [...ts.options].some(o => o.value === cur) ? cur : ''; };
  fillTT(); ts.onfocus = fillTT; ts.onmousedown = () => { if (ts.options.length < 2 + Object.keys(titleTpls).length) fillTT(); }; ts.onchange = () => ezPref('auTT', ts.value);
  const sb = $('auSubs'); sb.checked = ezPref('auSubs') === '1'; sb.onchange = () => ezPref('auSubs', sb.checked ? '1' : '0');
  $('auTplEd').onclick = () => { if (auBusy) { toast('Espera a que termine el clip que está exportando'); return; } $('livePage').hidden = true; $('home').hidden = false; try { renderHome(); setHomeSec('plantillas'); } catch (e) { console.warn(e); } toast('Edita aquí el formato «' + ((EZ_FMTS.find(x => x[0] === fs.value) || [])[2] || '') + '»: el modo automático usará tu versión'); };
}, 0);

/* editar y exportar el clip al lado, sin salir de la pantalla del directo: el panel maneja el editor de verdad, que sigue detrás */
let stDock = false, stEdSound = false, stEdR = null, stEdRaf = 0;
function stEdFmts(cur) {
  const box = $('seFmts'); box.innerHTML = '';
  setTimeout(stEdAutoUI, 0);
  for (const [id, ic, n] of EZ_FMTS) { const b = document.createElement('button'); b.type = 'button'; b.title = n; b.dataset.id = id; b.className = cur === id ? 'on' : ''; let pv = null; try { pv = mockFrom(fmtStyle(id), false, id); } catch {} if (!pv) { pv = document.createElement('span'); pv.className = 'se-fi'; pv.textContent = ic; } const lb = document.createElement('b'); lb.textContent = n; b.append(pv, lb);
    b.onclick = async () => { if (stPend) { stPendFmt = id; for (const o of box.children) o.classList.toggle('on', o === b); return; } if (!loaded || exporting) return; $('seS').textContent = '⏳ Cambiando de formato…'; try { stNoScenes(); await ezSetFormat(id); stCenter(); stEdFmts(id); } catch (e) { console.warn(e); } $('seS').textContent = fmtNeedsImage() ? '🖼️ Este formato lleva una imagen abajo: cópiala y pulsa Ctrl+V' : ''; }; box.append(b); }
  // y las plantillas propias de este creador
  for (const n of Object.keys(templates || {})) {
    const b = document.createElement('button'); b.type = 'button'; b.title = 'Plantilla: ' + n; b.dataset.tpl = n; b.className = 'own' + (clipMeta.tpl === n ? ' on' : '');
    let pv = null; try { pv = mockFrom(templates[n], false); } catch {} if (!pv) { pv = document.createElement('span'); pv.className = 'se-fi'; pv.textContent = '⭐'; }
    const lb = document.createElement('b'); lb.textContent = '⭐ ' + n; b.append(pv, lb);
    b.onclick = async () => { if (!loaded || exporting || stPend) { if (stPend) toast('Espera a que el clip esté listo'); return; } $('seS').textContent = '⏳ Poniendo la plantilla…';
      try { stNoScenes(); await applyStyle(JSON.parse(JSON.stringify(templates[n]))); clipMeta.tpl = n; if (layoutMode === 'react') { camDetectedFor = null; await autoDetectCam(true); } pushHistory(); stCenter(); } catch (e) { console.warn(e); }
      for (const o of box.children) o.classList.toggle('on', o === b); $('seS').textContent = '⭐ Plantilla «' + n + '» puesta'; };
    box.append(b);
  }
}
function stEdTT() {
  const sel = $('seTT'); sel.innerHTML = '';
  const names = [...Object.keys(titleTpls), ...Object.keys(TT_BUILTIN).filter(n => !titleTpls[n])];
  sel.append(new Option('El del formato', ''));
  for (const n of names) sel.append(new Option(n, n));
  sel.value = titleDef && ttGet(titleDef) ? titleDef : '';
  // cada plantilla se ve como queda (no solo su nombre), con un lápiz para editarla ahí mismo
  const box = $('seTTG'); if (!box) return; box.innerHTML = '';
  const pick = async n => { sel.value = n; try { if (sel.onchange) await sel.onchange(); } catch (e) { console.warn(e); } stEdTT(); };
  const card = (n, tp) => {
    const b = document.createElement('div'); b.className = 'se-ttc' + (sel.value === (n || '') ? ' on' : ''); b.tabIndex = 0; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', sel.value === (n || ''));
    const pv = document.createElement('div'); pv.className = 'se-ttpv'; const t = document.createElement('span');
    if (tp) { const k = tp.c || {}; t.textContent = 'Título'; ttcStyle(t, tp, Math.max(11, Math.min(17, (+k.titleSize || 54) / 3.4)) / (+k.titleSize || 54)); t.style.whiteSpace = 'nowrap'; t.style.maxWidth = '94%'; t.style.overflow = 'hidden'; t.style.display = 'inline-block'; if (tp.titleStyle === 'box') { t.style.padding = '3px 8px'; t.style.borderRadius = Math.min(8, (+k.boxR || 20) / 3) + 'px'; } }
    else { t.textContent = 'El del formato'; t.style.fontSize = '11px'; t.style.color = '#A1A1AA'; }
    pv.append(t); const nm = document.createElement('div'); nm.className = 'se-ttn'; nm.textContent = n || 'Del formato'; nm.title = n || 'Cada formato usa su propio título';
    b.append(pv, nm);
    if (n && tp) { const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'se-tted'; ed.textContent = '✏️'; ed.title = titleTpls[n] ? 'Editar esta plantilla' : 'Hacer una copia tuya y editarla';
      ed.onclick = e => { e.stopPropagation(); ttcOpen(titleTpls[n] ? n : null, tp, titleTpls[n] ? n : n + ' (mía)'); }; b.append(ed); }
    b.onclick = () => pick(n || ''); b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(n || ''); } };
    box.append(b);
  };
  card('', null); for (const n of names) card(n, ttGet(n));
  const nw = document.createElement('button'); nw.type = 'button'; nw.className = 'se-ttnew'; nw.textContent = '＋ Nueva'; nw.title = 'Crear una plantilla de título nueva'; nw.onclick = () => ttcOpen(null, null, ''); box.append(nw);
}
function stEdTrimUI() {
  const [a, b] = srcRange(); $('seA').value = a; $('seB').value = b;
  $('seTrimT').textContent = `· dura ${(b - a).toFixed(1).replace('.', ',')} s`;
}
// palabras del título para ponerlas en el color destacado (las mismas que en el editor avanzado)
function seChipsSync() {
  const box = $('seChips'); if (!box) return; const words = $('title').value.split(/\s+/).filter(Boolean), sig = words.join(' ') + '|' + [...titleHL].join();
  if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.innerHTML = ''; $('seHlW').hidden = !words.length;
  words.forEach((w, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (titleHL.has(i) ? ' on' : ''); b.textContent = w; b.setAttribute('aria-pressed', titleHL.has(i));
    b.onclick = () => { titleHL.has(i) ? titleHL.delete(i) : titleHL.add(i); try { renderChips(); } catch {} pushHistory(); seChipsSync(); }; box.append(b); });
}
function stEdLoop() {
  if ($('stEd').hidden) return;
  if (stPend) { stEdRaf = requestAnimationFrame(stEdLoop); return; }   // aún se está preparando: no se pisa lo que escribes
  try { const c = $('seCv'), src = $('cv'); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); } catch {}
  try { mtRender(); } catch (e) { if (!mtRender.w) { mtRender.w = 1; console.warn('línea de tiempo', e); } }
  try { seChipsSync(); } catch {}
  $('sePlay').textContent = vid.paused ? '▶' : '❚❚';
  { const tv = titleIsDefault() ? '' : $('title').value; if (document.activeElement !== $('seTitle') && $('seTitle').value !== tv) $('seTitle').value = tv; }
  if (exporting) { $('seBarW').hidden = false; $('seBar').style.width = $('eBar').style.width; $('seS').textContent = $('eStatus').textContent; }
  stEdRaf = requestAnimationFrame(stEdLoop);
}
// el panel se abre en cuanto pulsas: mientras el clip se guarda ya puedes escribir el título y elegir el formato
let stPend = null, stPendFmt = '', stPrepKeep = null;
// abrir el panel sin clip para ir preparando el título y el formato del próximo clip
function stEdPrep() {
  if (!$('stEd').hidden && stPend !== 'prep') return;
  const k = stPrepKeep; stPrepKeep = null;
  stPend = 'prep'; stPendFmt = k ? k.f : ''; stDock = true; $('livePage').classList.add('dock'); $('stEd').classList.remove('full'); $('stEd').hidden = false;
  $('seT').innerHTML = '<i></i>Tu clip <em>vacío</em>'; $('seRes').innerHTML = ''; $('seBarW').hidden = true; $('seTitle').value = k ? k.t : ''; $('seExp').disabled = true;
  $('seS').textContent = 'Editor vacío: saca un clip del directo o sube un vídeo (➕ Subir un vídeo, o arrástralo aquí). El título, el formato y la plantilla que pongas se usan en él.';
  stEdFmts(stPendFmt); stPrepDraw(); stEdTT(); try { mtBlank(); } catch {} cancelAnimationFrame(stEdRaf); stEdLoop(); setTimeout(() => $('seTitle').focus(), 50);
}
// vaciar el panel sin cerrarlo: el reproductor queda vacío y listo para el siguiente clip (se guardan el título y el formato)
function stEdEmpty() {
  stExpFail = false;
  if ($('stEd').hidden || exporting) return;
  if (stPend === 'prep') { toast('El editor ya está vacío'); return; }
  const t = $('seTitle').value, f = clipMeta.fmt || stPendFmt || '';
  try { vid.pause(); } catch {}
  stPend = 'prep'; stPendFmt = f; stPrepKeep = null;
  $('seT').innerHTML = '<i></i>Tu clip <em>vacío</em>'; $('seRes').innerHTML = ''; $('seBarW').hidden = true; $('seTitle').value = t; $('seExp').disabled = true;
  $('seS').textContent = 'Editor vacío: saca un clip del directo o sube un vídeo (arrástralo aquí). El título y el formato que tengas se usan en él.';
  stEdFmts(f); stPrepDraw(); stEdTT(); try { mtBlank(); } catch {}
  toast('Editor vaciado: el clip sigue guardado en Tus clips');
}
// lo que se ve en el panel mientras preparas el próximo clip: el formato elegido y tu título con su plantilla
let stPrepTC = null;
function stPrepDraw() {
  if (stPend !== 'prep') return;
  const c = $('seCv'), x = c.getContext('2d'), w = c.width, h = c.height, k = w / 1080;
  const fmt = stPendFmt || ezPref('stFmtDef') || 'horizontal'; let st = null; try { st = fmtStyle(fmt); } catch {}
  const lay = st ? st.layoutMode : 'single', cc = (st && st.c) || {};
  const gr = () => {};
  const lbl = (t, y) => { return; x.save(); x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `800 ${Math.round(46 * k)}px Inter, system-ui`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, w / 2, y * h); x.restore(); };
  x.fillStyle = '#0d0d12'; x.fillRect(0, 0, w, h);
  let ty = 0.5;
  if (lay === 'split') { const r = +cc.ratio ? +cc.ratio / 100 : 0.55; gr(0, r, '#5B8CFF', '#7C4DFF'); gr(r, 1, '#FF5FA2', '#FF8A4C'); lbl('VÍDEO', r / 2); lbl('IMAGEN', (1 + r) / 2); ty = r; }
  else if (lay === 'react') {
    if (fmt === 'llamada') { const g3 = [['#5B8CFF', '#7C4DFF'], ['#FFC24B', '#FF6A3D'], ['#22D3B6', '#2F80ED']]; g3.forEach((g, i) => { gr(i / 3, (i + 1) / 3, g[0], g[1]); lbl('PERSONA ' + (i + 1), (i + 0.5) / 3); }); ty = 1 / 3; }
    else { const r = +cc.ratio ? +cc.ratio / 100 : 0.42; gr(0, r, '#FFC24B', '#FF6A3D'); gr(r, 1, fmt === 'duo' ? '#22D3B6' : '#A66BFF', fmt === 'duo' ? '#2F80ED' : '#5B4BFF'); lbl(fmt === 'duo' ? 'PERSONA 1' : 'CÁMARA', r / 2); lbl(fmt === 'duo' ? 'PERSONA 2' : 'VÍDEO', (1 + r) / 2); ty = r; }
  } else if (fmt === 'podcast' || +cc.zoom >= 250) { gr(0, 1, '#22D3B6', '#2F80ED'); lbl('PRIMER PLANO', 0.62); ty = +cc.titleY >= 0 ? +cc.titleY / 100 : 0.3; }
  else { gr(0.34, 0.66, '#5B8CFF', '#7C4DFF'); lbl('VÍDEO', 0.5); ty = +cc.titleY >= 0 ? +cc.titleY / 100 : 0.26; }
  // el título con la plantilla de título elegida (o la del formato)
  const text = $('seTitle').value.trim() || 'Escribe tu título';
  let tp = null; try { tp = (titleDef && ttGet(titleDef)) || st; } catch {}
  if (tp && typeof ttcPaint === 'function') {
    if (!stPrepTC) { stPrepTC = document.createElement('canvas'); stPrepTC.style.cssText = 'position:fixed;left:-9999px;top:0;width:360px;height:640px'; document.body.append(stPrepTC); }
    try { ttcPaint(stPrepTC, tp, text, 'transparent');
      const T = stPrepTC, band = 520, sy = T.height / 2 - band / 2, dh = band * (w / T.width);
      x.drawImage(T, 0, sy, T.width, band, 0, ty * h - dh / 2, w, dh);
    } catch (e) { console.warn('vista previa del título', e); }
  }
  x.save(); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, h - 64 * k, w, 64 * k); x.fillStyle = '#e4e4e7'; x.font = `600 ${Math.round(28 * k)}px Inter, system-ui`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Sin vídeo', w / 2, h - 32 * k); x.restore();
}
setTimeout(() => {
  const t = $('seTitle'); if (t) t.addEventListener('input', () => { if (stPend === 'prep') stPrepDraw(); });
  const s2 = $('seTT'); if (s2) s2.addEventListener('change', () => setTimeout(stPrepDraw, 50));
  const f = $('seFmts'); if (f) f.addEventListener('click', () => setTimeout(stPrepDraw, 30));
  document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => stPrepDraw());
}, 0);
function stEdPend(m) {
  const prep = stPend === 'prep' ? { t: $('seTitle').value, f: stPendFmt } : stPrepKeep; stPrepKeep = null;
  stPend = m.id; stPendFmt = prep ? prep.f : ''; stDock = true; $('livePage').classList.add('dock'); $('stEd').classList.remove('full'); $('stEd').hidden = false;
  $('seT').innerHTML = `<i></i>Tu clip <em>${Math.round(m.t1 - m.t0)} s</em>`; $('seRes').innerHTML = ''; $('seBarW').hidden = true; $('seTitle').value = prep ? prep.t : ''; $('seExp').disabled = true;
  $('seS').textContent = prep && (prep.t.trim() || prep.f) ? '⏳ Guardando el clip… Le pongo el título y el formato que preparaste.' : '⏳ Guardando el clip… Mientras, ve poniendo el título y el formato.';
  const c = $('seCv'), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#A1A1AA'; x.font = '600 26px system-ui'; x.textAlign = 'center'; x.fillText('⏳ Guardando el clip…', c.width / 2, c.height / 2);
  stEdFmts(stPendFmt); stEdTT(); try { mtBlank(); } catch {} cancelAnimationFrame(stEdRaf); stEdLoop(); setTimeout(() => $('seTitle').focus(), 50);
}
async function stEdOpen(S, g, c) {
  const aT = ezPref('stAutoT') !== '0', aF = ezPref('stAutoF') !== '0', aS = ezPref('stAutoS') !== '0';
  const say = t => { $('seS').textContent = t; }; say('✨ Montando el clip… Puedes seguir escribiendo.');
  try {
    const mine0 = $('seTitle').value.trim();
    ezSkip.title = !aT || !!mine0; ezSkip.subs = !aS; ezSkip.scenes = ezPref('stAutoE') === '1' ? false : true;   // un formato por escena solo si lo pides
    ezSkip.speech = autoOff();   // todo lo automático desactivado: el clip empieza donde lo cortaste
    if (stPendFmt || !aF) ezSkip.scenes = true;
    try { await openLiveClip(S, g, c.f, c.off, c.dur, stPendFmt || (aF ? 'auto' : (ezPref('stFmtDef') || 'horizontal'))); } finally { ezSkip.title = ezSkip.subs = ezSkip.scenes = ezSkip.speech = false; }
    // lo que hayas puesto mientras se preparaba
    const mine = $('seTitle').value.trim(), pf = stPendFmt; stPend = null;
    if (mine) { try { titleHL.clear(); } catch {} $('title').value = mine; $('title').dispatchEvent(new Event('input', { bubbles: true })); try { renderChips(); pushHistory(); } catch {} }
    if (pf && clipMeta.fmt !== pf) { try { stNoScenes(); await ezSetFormat(pf); } catch (e) { console.warn(e); } }
    stCenter();
    const D = ezDur(); stEdR = [Math.max(0, c.off - 45), Math.min(D, c.off + c.dur + 30)];
    for (const id of ['seA', 'seB']) { $(id).min = stEdR[0]; $(id).max = stEdR[1]; }
    stEdTrimUI(); stEdTT(); stEdFmts(clipMeta.fmt || '');
    vid.muted = !stEdSound; say(''); stTrimDone = false;
    if (ezPref('stAutoX') !== '0') { if (!titleIsDefault()) await stAiTrim(); else if (document.activeElement !== $('seTitle')) { say('✍️ Escribe el título y pulsa Ctrl+Enter: la IA recorta el clip y te lo deja listo.'); $('seTitle').focus(); } else say('✍️ Clip listo. Cuando acabes el título pulsa Intro y la IA lo recorta.'); }
    if (typeof fmtNeedsImage === 'function' && fmtNeedsImage()) say('🖼️ Este formato lleva una imagen abajo: cópiala y pulsa Ctrl+V');
  } catch (e) { console.warn(e); say('⚠ ' + (e.message || e)); }
  stPend = null; $('seExp').disabled = false;
}
// la IA recorta el clip: con lo que se dice (y el título) elige dónde empieza y dónde acaba
let stTrimBusy = false, stTrimDone = false;
async function stAiTrim() {
  if (!loaded || exporting || stTrimBusy) return; stTrimBusy = true;
  const say = t => { $('seS').textContent = t; };
  try {
    say('✂️ La IA está recortando el clip…');
    if (!captions.length) { try { await doTranscribe(() => {}); if (clipMeta.noSubs) { trk.caps.hide = true; syncTrackUI(); } } catch (e) { console.warn(e); } }
    const [a, b] = srcRange(), W = []; for (const c of captions) for (const w of c.words || []) if (w.end > a - 0.2 && w.start < b + 0.2) W.push(w);
    if (W.length < 6) { say('No hay voz suficiente para recortarlo solo: ajústalo con las barras.'); return; }
    const isEnd = w => /[.?!…]$/.test(w.text.trim());
    let i0 = 0, i1 = W.length - 1, how = '';
    const title = titleIsDefault() ? '' : $('title').value.trim();
    if (getGemKey()) {
      try {
        const lines = []; let cur = [], st = 0; W.forEach((w, i) => { if (!cur.length) st = i; cur.push(w.text.trim()); if (isEnd(w) || cur.length >= 14 || i === W.length - 1) { lines.push(`[${st}-${i}] ${cur.join(' ')}`); cur = []; } });
        const o = await geminiJSON([{ text: `Eres editor de clips virales de un streamer para TikTok. Esto es lo que se dice en un trozo del directo, con el número de la primera y la última palabra de cada frase entre corchetes:\n\n${lines.join('\n')}\n\n${title ? `El clip se va a titular: «${title}». Elige el trozo que cuenta justo eso.` : 'Elige el mejor momento.'}\nReglas: empieza al principio de una frase, sin paja ni saludos antes; acaba justo después del remate o la reacción, nunca a mitad de frase; que se entienda solo. Mejor corto (8-35 s) que largo, pero no cortes el remate.\nResponde solo JSON: {"first": número de la primera palabra, "last": número de la última palabra}` }], 0.2);
        const f = Math.round(+o.first), l = Math.round(+o.last);
        if (f >= 0 && l < W.length && l - f >= 5) { i0 = f; i1 = l; how = 'ia'; }
      } catch (e) { console.warn('recorte IA', e); }
    }
    if (!how) {   // sin Gemini: de principio de frase a final de frase
      for (let i = W.length - 1; i > W.length / 2; i--) if (isEnd(W[i])) { i1 = i; break; }
      for (let i = 0; i < W.length / 3; i++) if (i === 0 || isEnd(W[i - 1])) { i0 = i; break; }
      how = 'frases';
    }
    let na = Math.max(stEdR ? stEdR[0] : 0, W[i0].start - 0.12), nb = Math.min(stEdR ? stEdR[1] : ezDur(), W[i1].end + 0.4);
    if (nb - na < 5) { say('El trozo que salía era demasiado corto: lo dejo como estaba.'); return; }
    ezA = na; ezB = nb; ezApplyTrim(); stEdTrimUI(); stCenter(); stTrimDone = true;
    say(`✅ Recortado ${how === 'ia' ? 'por la IA' : 'de frase a frase (sin clave de Gemini)'}: ${(nb - na).toFixed(0)} s. Listo para exportar.`);
  } catch (e) { console.warn(e); say('⚠ No se pudo recortar: ' + (e.message || e)); }
  finally { stTrimBusy = false; }
}
// al elegir tú el formato, vale para todo el clip (se quita el «un formato por escena»)
function stNoScenes() { try { if (clipMeta.scenes) { delete clipMeta.scenes; scSig = ''; } sceneOv = null; } catch (e) { console.warn(e); } }
function stCenter() { pos.tx = 0; try { draw(vid.currentTime || 0, false); } catch {} }

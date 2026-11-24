/* ---------- acciones de edición ---------- */
function underPlayhead() { const L = locate(curT()); return L.i; }
function splitAt() {
  if (!loaded) return;
  const T = curT(), done = [];
  // textos seleccionados que estén bajo el cabezal
  for (const id of selItems('t')) { const t = txtById(+id); if (t && T > t.start + 0.05 && T < t.end - 0.05) { const b = { ...t, id: newId(), start: T }; t.end = T; texts.push(b); done.push('t'); } }
  // subtítulos seleccionados
  for (const i of selItems('c').map(Number).sort((a, b) => b - a)) {
    const c = captions[i], ts = locate(T).t; if (!c || !(ts > c.start + 0.05 && ts < c.end - 0.05)) continue;
    let L = c.words.filter(w => (w.start + w.end) / 2 < ts), R = c.words.filter(w => (w.start + w.end) / 2 >= ts);
    if (!L.length || !R.length) { const h = Math.ceil(c.words.length / 2); L = c.words.slice(0, h); R = c.words.slice(h); }
    if (!R.length) R = [{ text: '', start: ts, end: c.end }];
    captions.splice(i, 1, { start: c.start, end: ts, words: L }, { start: ts, end: c.end, words: R });
    done.push('c');
  }
  if (done.length) { allWords = captions.flatMap(c => c.words.filter(w => w.text)); renderCapList(); tsel.clear(); }
  // si no había nada de eso, se divide el clip
  if (!done.length) {
    const L = locate(T), g = segs[L.i];
    if (L.t - g.s < 0.05 || g.e - L.t < 0.05) { toast('Mueve el cabezal dentro del clip para dividir'); return; }
    const b = { id: newId(), s: L.t, e: g.e }; g.e = L.t; segs.splice(L.i + 1, 0, b);
    pseg = L.i + 1; vid.currentTime = b.s; tsel.clear(); tsel.add('v:' + b.id);
  }
  toast('Dividido'); pushHistory(); tlSig = '';
}
function deleteSel() {
  if (!tsel.size) { toast('Selecciona algo en la línea de tiempo'); return; }
  const T = curT();
  const tIds = selItems('t').map(Number), cIdx = selItems('c').map(Number), vIds = selItems('v').map(Number);
  if (tIds.length) { texts = texts.filter(t => !tIds.includes(t.id)); if (tIds.includes(selTextId())) selectText(null, true); }
  if (cIdx.length) { captions = captions.filter((c, i) => !cIdx.includes(i)); allWords = captions.flatMap(c => c.words.filter(w => w.text)); renderCapList(); }
  if (vIds.length) {
    const keep = segs.filter(g => !vIds.includes(g.id));
    if (!keep.length) { toast('Tiene que quedar al menos un trozo del clip'); }
    else { segs = keep; seekOut(Math.min(T, totalDur() - 0.001)); }
  }
  if (tsel.has('title')) { $('title').value = ''; $('title').dispatchEvent(new Event('input', { bubbles: true })); }
  if (tsel.has('audio')) removeMusic();
  if (tsel.has('logo')) { trk.logo.hide = true; syncTrackUI(); toast('Logo oculto en este clip (el ojo lo vuelve a mostrar)'); }
  tsel.clear(); pushHistory(); tlSig = '';
}
// Q / W: borrar lo que hay antes / después del cabezal
function trimSide(left) {
  if (!loaded) return;
  const T = curT();
  const tIds = selItems('t').map(Number).filter(id => { const t = txtById(id); return t && T > t.start && T < t.end; });
  if (tIds.length) { tIds.forEach(id => { const t = txtById(id); if (left) t.start = T; else t.end = T; }); pushHistory(); tlSig = ''; return; }
  const L = locate(T), g = segs[L.i];
  if (L.t - g.s < 0.02 && left || g.e - L.t < 0.02 && !left) return;
  if (left) { g.s = L.t; pseg = L.i; vid.currentTime = g.s; } else { g.e = L.t; seekOut(Math.min(T, totalDur() - 0.001)); }
  toast(left ? 'Borrado lo de antes del cabezal' : 'Borrado lo de después del cabezal'); pushHistory(); tlSig = '';
}
function copySel(silent) {
  if (!tsel.size) { if (!silent) toast('Selecciona algo para copiar'); return false; }
  clipBoard = {
    segs: segs.filter(g => tsel.has('v:' + g.id)).map(g => ({ ...g })),
    texts: texts.filter(t => tsel.has('t:' + t.id)).map(t => ({ ...t })),
    caps: captions.filter((c, i) => tsel.has('c:' + i)).map(c => JSON.parse(JSON.stringify(c))),
  };
  if (!silent) toast('Copiado'); return true;
}
function pasteAt(after) {
  const cb = clipBoard; if (!cb || !loaded) { toast('No hay nada copiado'); return; }
  const T = curT(); tsel.clear();
  if (cb.segs.length) {
    // se insertan en el cabezal (o detrás de lo duplicado)
    let at;
    if (after != null) at = after;
    else {
      const L = locate(T), g = segs[L.i];
      if (L.t - g.s > 0.05 && g.e - L.t > 0.05) { const b = { id: newId(), s: L.t, e: g.e }; g.e = L.t; segs.splice(L.i + 1, 0, b); at = L.i + 1; }
      else at = L.t - g.s <= 0.05 ? L.i : L.i + 1;
    }
    const ins = cb.segs.map(g => ({ ...g, id: newId() }));
    segs.splice(at, 0, ...ins); ins.forEach(g => tsel.add('v:' + g.id));
    pseg = at; vid.currentTime = ins[0].s;
  }
  if (cb.texts.length) {
    const base = Math.min(...cb.texts.map(t => t.start)), D = totalDur();
    const off = after != null ? Math.max(...cb.texts.map(t => t.end)) - base : T - base;
    cb.texts.forEach(t => { const n = { ...t, id: newId(), start: t.start + off, end: t.end + off }; n.start = Math.min(n.start, D - 0.1); n.end = Math.min(D, n.end); texts.push(n); tsel.add('t:' + n.id); });
  }
  if (cb.caps.length) {
    const base = Math.min(...cb.caps.map(c => c.start));
    const off = after != null ? Math.max(...cb.caps.map(c => c.end)) - base : locate(T).t - base;
    cb.caps.forEach(c => captions.push({ start: c.start + off, end: c.end + off, words: c.words.map(w => ({ ...w, start: w.start + off, end: w.end + off })) }));
    captions.sort((a, b) => a.start - b.start); allWords = captions.flatMap(c => c.words.filter(w => w.text)); renderCapList();
  }
  toast('Pegado'); pushHistory(); tlSig = '';
}
function duplicateSel() {
  const saved = clipBoard;
  if (!copySel(true)) { toast('Selecciona algo para duplicar'); return; }
  const lastSeg = Math.max(-1, ...segs.map((g, i) => tsel.has('v:' + g.id) ? i : -1));
  pasteAt(lastSeg >= 0 ? lastSeg + 1 : 1e9);
  clipBoard = saved; toast('Duplicado');
}
function selectAll() { tsel.clear(); segs.forEach(g => tsel.add('v:' + g.id)); texts.forEach(t => tsel.add('t:' + t.id)); captions.forEach((c, i) => tsel.add('c:' + i)); tlSig = ''; }
function cutPoints() { const p = new Set([0, totalDur()]); let acc = 0; segs.forEach(g => { acc += g.e - g.s; p.add(+acc.toFixed(4)); }); texts.forEach(t => { p.add(t.start); p.add(t.end); }); return [...p].sort((a, b) => a - b); }
$('tbSplit').onclick = splitAt; $('tbDel').onclick = deleteSel;
$('tbDelLeft').onclick = () => trimSide(true); $('tbDelRight').onclick = () => trimSide(false);
$('tbCopy').onclick = () => copySel(); $('tbPaste').onclick = () => pasteAt(); $('tbDup').onclick = duplicateSel;
$('tbMagnet').onclick = () => { magnet = !magnet; $('tbMagnet').classList.toggle('on', magnet); toast(magnet ? 'Imán activado' : 'Imán desactivado'); };


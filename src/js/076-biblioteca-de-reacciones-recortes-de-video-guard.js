/* ---------- biblioteca de reacciones: recortes de vídeo guardados por streamer (en este ordenador) ---------- */
const RX = { lib: null, urls: [] };
async function rxLib() { if (!RX.lib) { try { RX.lib = (await kv.get('rxLib')) || []; } catch { RX.lib = []; } } return RX.lib; }
async function rxUse(blob, name) {
  if (!loaded) { toast('Abre primero un clip'); return false; }
  if (layoutMode !== 'split') { const p = PRESETS.find(x => x.name === 'Pantalla dividida'); if (p) await applyPreset(p); }
  const f = blob instanceof File ? blob : new File([blob], name || 'reaccion.mp4', { type: blob.type || 'video/mp4' });
  if (!(await loadImageBlob(f, f.name, false))) { toast('Ese vídeo no se puede abrir'); return false; }
  kv.set('image:' + curProj, f).catch(() => {}); pushHistory(); toast('Vídeo puesto abajo (en bucle y sin sonido)'); return true;
}
async function rxRender() {
  const lib = await rxLib(), box = $('rxList'); RX.urls.forEach(u => URL.revokeObjectURL(u)); RX.urls = []; box.innerHTML = '';
  $('rxWhoL').innerHTML = ''; for (const w of [...new Set(lib.map(x => x.who))].sort()) { const o = document.createElement('option'); o.value = w; $('rxWhoL').append(o); }
  if (!lib.length) { const e = document.createElement('div'); e.className = 'lh-e'; e.textContent = 'Aún no hay recortes. Escribe el nombre del streamer y pulsa «＋ Añadir recortes».'; box.append(e); return; }
  let who = null;
  for (const it of [...lib].sort((a, b) => a.who.localeCompare(b.who) || a.name.localeCompare(b.name))) {
    if (it.who !== who) { who = it.who; const g = document.createElement('div'); g.className = 'rx-g'; g.textContent = who; box.append(g); }
    const r = document.createElement('div'); r.className = 'rx-r';
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    kv.get('rxClip:' + it.id).then(b => { if (b && r.isConnected) { const u = URL.createObjectURL(b); RX.urls.push(u); v.src = u + '#t=0.5'; } }).catch(() => {});
    r.onmouseenter = () => v.play().catch(() => {}); r.onmouseleave = () => v.pause();
    const n = document.createElement('span'); n.textContent = it.name; n.title = it.name;
    const s = document.createElement('small'); s.textContent = (it.size / 1048576).toFixed(1) + ' MB';
    const use = document.createElement('button'); use.className = 'primary'; use.textContent = 'Usar';
    use.onclick = async () => { if (!loaded) { toast('Abre primero un clip: el recorte se pone debajo de él'); return; } const b = await kv.get('rxClip:' + it.id).catch(() => null); if (!b) { toast('No encuentro ese recorte'); return; } if (await rxUse(b, it.name)) $('rxBk').hidden = true; };
    const del = document.createElement('button'); del.textContent = '🗑'; del.title = 'Borrar de la biblioteca';
    del.onclick = async () => { if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '¿Borrar?'; setTimeout(() => { del.dataset.sure = ''; del.textContent = '🗑'; }, 3000); return; }
      RX.lib = lib.filter(x => x.id !== it.id); await kv.set('rxLib', RX.lib).catch(() => {}); kv.del('rxClip:' + it.id).catch(() => {}); rxRender(); };
    r.append(v, n, s, use, del); box.append(r);
  }
}
// la biblioteca vive en su sección del menú (Reacciones) y, desde el editor, se abre en una ventana
function rxPlace(inPage) { const pop = document.querySelector('.rx-pop'), host = inPage ? $('rxHome') : $('rxBk'); if (!pop || !host) return; if (pop.parentNode !== host) host.append(pop); pop.classList.toggle('inpage', inPage); if (inPage) { $('rxBk').hidden = true; rxRender(); } }
setTimeout(() => {
  if (!$('seRx')) return;
  document.body.append($('rxBk'));   // fuera de la página del directo: tiene que verse también desde el editor
  $('seRx').onclick = () => { rxPlace(false); $('rxBk').hidden = false; rxRender(); };
  $('seRxUp').onclick = () => { if (!loaded) { toast('Abre primero un clip'); return; } const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = () => { if (i.files[0]) rxUse(i.files[0], i.files[0].name); }; i.click(); };
  $('rxX').onclick = () => { $('rxBk').hidden = true; };
  $('rxBk').addEventListener('pointerdown', e => { if (e.target === $('rxBk')) $('rxBk').hidden = true; });
  $('rxWho').addEventListener('keydown', e => e.stopPropagation());
  $('rxAdd').onclick = () => { if (!$('rxWho').value.trim()) { toast('Escribe primero el nombre del streamer'); $('rxWho').focus(); return; } $('rxFileIn').click(); };
  $('rxFileIn').onchange = async e => {
    const who = $('rxWho').value.trim(), files = [...e.target.files]; e.target.value = ''; const lib = await rxLib(); let n = 0;
    for (const f of files) {
      if (!/^video\//.test(f.type)) continue;
      if (f.size > 300e6) { toast('«' + f.name + '» pesa demasiado (máximo 300 MB): recórtalo antes'); continue; }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { await kv.set('rxClip:' + id, f); lib.push({ id, who, name: f.name.replace(/\.[a-z0-9]+$/i, ''), size: f.size, at: Date.now() }); n++; } catch (err) { toast('No se pudo guardar «' + f.name + '»'); }
    }
    await kv.set('rxLib', lib).catch(() => {}); rxRender(); if (n) toast(n + (n > 1 ? ' recortes guardados' : ' recorte guardado') + ' en ' + who);
  };
}, 0);

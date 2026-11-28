/* ---------- «¿A quién clipeas hoy?»: lo primero de «En directo». Buscas un streamer o eliges uno de los que están en directo
   y entras en su panel. Quién está en directo lo pregunta el grabador a Kick (Kick no deja preguntarlo desde la página). ---------- */
const LS = { live: null, liveAt: 0, liveErr: '', mine: null, cat: '', q: '', dd: [], sel: 0, seq: 0, tick: null };
const lsFmtV = n => { n = +n || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' M'; if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil'; return String(n); };
const lsDur = s => { if (!s) return ''; const t = Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')); if (!t) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
const lsEsc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lsHue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

// preguntar al grabador: deja la petición en su carpeta y espera la respuesta
async function ksAsk(body, ms = 9000) {
  const d = await getLiveDir(false); if (!d) return { err: 'dir' };
  let kd; try { kd = await d.getDirectoryHandle('kick', { create: true }); } catch { return { err: 'dir' }; }
  let alive = false; try { const v = JSON.parse((await rtext(kd, 'vivo.json')) || 'null'); alive = !!v && Date.now() / 1000 - v.t < 15; } catch {}
  if (!alive) return { err: 'grab' };
  const id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    const rq = await kd.getDirectoryHandle('req', { create: true }), out = await kd.getDirectoryHandle('out', { create: true });
    await wfile(rq, id + '.json', JSON.stringify(body));
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await sleep(250);
      const txt = await rtext(out, id + '.json');
      if (txt) { try { await out.removeEntry(id + '.json'); } catch {} try { return JSON.parse(txt); } catch { return { err: 'mal' }; } }
    }
    try { await rq.removeEntry(id + '.json'); } catch {}
  } catch (e) { console.warn('kick', e); }
  return { err: 'tarde' };
}

function lsAvatar(x, cls) {
  const s = document.createElement('span'); s.className = cls; s.style.background = `linear-gradient(135deg,hsl(${lsHue(x.slug)} 70% 58%),hsl(${(lsHue(x.slug) + 50) % 360} 55% 28%))`;
  s.textContent = (x.name || x.slug || '?').slice(0, 1).toUpperCase();
  if (x.avatar) { const i = new Image(); i.alt = ''; i.referrerPolicy = 'no-referrer'; i.onload = () => { s.textContent = ''; s.append(i); }; i.src = x.avatar; }
  return s;
}
function lsCard(x, mine) {
  const b = document.createElement('div'); b.className = 'ls-card' + (x.live ? ' live' : ' off') + (x.wait ? ' wait' : ''); b.tabIndex = 0; b.setAttribute('role', 'button');
  b.title = x.live ? `Clipear a ${x.name}` : `Abrir el panel de ${x.name}: se graba solo en cuanto entre en directo`;
  const h = lsHue(x.slug);
  b.innerHTML = `<div class="ls-th" style="background:radial-gradient(120% 90% at 20% 10%,hsl(${h} 70% 55% / .35),transparent 60%),linear-gradient(135deg,hsl(${h} 45% 22%),#0b0b0e)">
    ${x.wait ? '<span class="ls-b gray">Comprobando…</span>' : x.live ? '<span class="ls-b red">EN DIRECTO</span>' : '<span class="ls-b gray">Sin directo</span>'}
    ${mine ? '<span class="ls-mine">Tu canal</span>' : ''}
    ${x.live ? `<span class="ls-vw"><i></i>${lsFmtV(x.viewers)}</span>` : ''}${x.live && x.started ? `<span class="ls-du">${lsDur(x.started)}</span>` : ''}</div>
    <div class="ls-ci"><div class="ls-tx"><strong>${lsEsc(x.name)}</strong><span class="t">${lsEsc(x.live ? (x.title || 'En directo') : x.wait ? 'Mirando si está en directo…' : 'Se graba solo cuando entre')}</span><span class="c">${lsEsc(x.live ? x.cat : 'kick.com/' + x.slug)}</span></div></div>`;
  b.querySelector('.ls-ci').prepend(lsAvatar(x, 'ls-av'));
  if (x.thumb) { const i = new Image(); i.alt = ''; i.referrerPolicy = 'no-referrer'; i.className = 'ls-img'; i.onload = () => b.querySelector('.ls-th').prepend(i); i.src = x.thumb; }
  if (mine) {
    const del = document.createElement('button'); del.type = 'button'; del.className = 'ls-del'; del.textContent = '✕'; del.title = 'Dejar de seguir (ya no se graba)';
    twoStep(del, `Pulsa otra vez para dejar de seguir a ${x.name}`, async () => { await lvChanDrop(x.slug); toast(`Ya no sigues a ${x.name}`); lsRenderMine(); });
    del.addEventListener('click', e => e.stopPropagation()); b.querySelector('.ls-th').append(del);
  }
  const go = () => lsPick(x.slug, x.name);
  b.addEventListener('click', go); b.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  return b;
}
async function lsMineSlugs() { const o = []; for (const c of clients) { const k = lvSlug((await getLive(c)).kick); if (k && !o.includes(k)) o.push(k); } return o; }
async function lsRenderMine(fetch = true) {
  const box = $('lsMine'); if (!box) return;
  const slugs = await lsMineSlugs();
  $('lsMineH').hidden = box.hidden = !slugs.length;
  const known = new Map((LS.mine || []).map(x => [x.slug, x]));
  const draw = () => { box.innerHTML = ''; const arr = slugs.map(s => known.get(s) || { slug: s, name: s, wait: !LS.mine }); arr.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.viewers - a.viewers); for (const x of arr) box.append(lsCard(x, true)); };
  draw();
  if (!fetch || !slugs.length) return;
  const r = await ksAsk({ kind: 'canales', slugs }, 15000);
  if (r.items) { LS.mine = r.items; for (const x of r.items) known.set(x.slug, x); for (const s of slugs) if (!known.has(s)) known.set(s, { slug: s, name: s }); draw(); }
  else { for (const s of slugs) if (!known.get(s) || known.get(s).wait) known.set(s, { slug: s, name: s }); draw(); }
}
function lsRenderLive() {
  const box = $('lsLive'), cats = $('lsCats'); if (!box) return;
  box.innerHTML = ''; cats.innerHTML = '';
  if (!LS.live) { box.innerHTML = '<div class="ls-empty">' + (LS.liveErr || 'Mirando quién está en directo…') + '</div>'; return; }
  const counts = {}; for (const x of LS.live) if (x.cat) counts[x.cat] = (counts[x.cat] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0]);
  if (LS.cat && !top.includes(LS.cat)) LS.cat = '';
  for (const c of ['', ...top]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ls-chip' + (LS.cat === c ? ' on' : ''); b.textContent = c || 'Todos'; b.onclick = () => { LS.cat = c; lsRenderLive(); }; cats.append(b); }
  const mine = new Set(LS.mine ? LS.mine.map(x => x.slug) : []);
  const list = LS.live.filter(x => !LS.cat || x.cat === LS.cat);
  if (!list.length) { box.innerHTML = '<div class="ls-empty">Ahora mismo Kick no da ningún directo en español.</div>'; return; }
  for (const x of list.slice(0, 24)) box.append(lsCard(x, mine.has(x.slug)));
}
function lsAgo() { const e = $('lsRf'); if (!e) return; const s = LS.liveAt ? Math.round((Date.now() - LS.liveAt) / 1000) : 0; e.textContent = LS.liveAt ? '↻ ' + (s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`) : '↻ Actualizar'; }
function lsMsg(kind) {
  const m = $('lsMsg'); if (!m) return; m.hidden = !kind; m.innerHTML = '';
  if (!kind) return;
  const p = document.createElement('span');
  if (kind === 'dir') { p.textContent = 'Para ver quién está en directo, Cortex necesita la carpeta del grabador.'; const b = document.createElement('button'); b.textContent = '📁 Elegir la carpeta'; b.onclick = async () => { if (await pickLiveDir()) lsRender(true); }; m.append(p, b); }
  else if (kind === 'grab') { p.textContent = 'Abre el grabador («Grabador Clipzi.bat» o la app de Cortex) para ver los directos de Kick. Mientras, puedes escribir el canal y empezar.'; m.append(p); }
  else if (kind === 'old') { p.textContent = 'Tu grabador es de una versión anterior: ciérralo y vuelve a abrirlo para que pueda ver los directos de Kick.'; m.append(p); }
  else { p.textContent = kind; m.append(p); }
}
async function lsRender(force) {
  if (!$('ls')) return;
  lsRenderMine(true);
  if (!force && LS.live && Date.now() - LS.liveAt < 45000) { lsRenderLive(); lsAgo(); return; }
  if (!LS.live) lsRenderLive();
  const seq = ++LS.seq, r = await ksAsk({ kind: 'live' }, 20000); if (seq !== LS.seq) return;
  if (r.items) { LS.live = r.items; LS.liveAt = Date.now(); LS.liveErr = ''; lsMsg(''); if (!r.items.length) LS.liveErr = 'Kick no ha dado la lista de directos ahora mismo. Prueba a actualizar en un momento.'; }
  else {
    let old = false; try { const d = await getLiveDir(false); const v = d && JSON.parse((await rtext(d, 'descargas/vivo.json')) || 'null'); old = r.err === 'grab' && v && Date.now() / 1000 - v.t < 20; } catch {}
    lsMsg(old ? 'old' : r.err === 'dir' || r.err === 'grab' ? r.err : ''); LS.live = null;
    LS.liveErr = r.err === 'tarde' ? 'Kick tarda en contestar. Prueba a actualizar en un momento.' : r.err === 'mal' ? 'Kick ha contestado algo raro. Prueba a actualizar.' : 'Sin el grabador abierto no puedo ver quién está en directo.';
  }
  lsRenderLive(); lsAgo();
}
// buscador: lo que ya se tiene sale al momento y lo que contesta Kick se añade
function lsDdRender() {
  const dd = $('lsDd'); dd.innerHTML = '';
  const q = LS.q.trim(); if (!q) { dd.hidden = true; return; }
  const live = LS.dd.filter(x => x.live), off = LS.dd.filter(x => !x.live), typed = lvSlug(q);
  let i = 0; const row = (x) => {
    const r = document.createElement('div'); r.className = 'ls-r' + (i === LS.sel ? ' on' : ''); const k = i++; r.setAttribute('role', 'option');
    r.append(lsAvatar(x, 'ls-av sm'));
    const t = document.createElement('div'); t.innerHTML = `<b>${lsEsc(x.name)}</b><small>kick.com/${lsEsc(x.slug)}${x.live && x.title ? ' · ' + lsEsc(x.title) : ''}</small>`; r.append(t);
    const st = document.createElement('span'); st.className = 'ls-st' + (x.live ? '' : ' off'); st.innerHTML = x.live ? `<i></i>${lsFmtV(x.viewers)}` : '<i></i>Seguir · se graba cuando entre'; r.append(st);
    if (k === LS.sel) { const e = document.createElement('kbd'); e.textContent = 'Enter'; r.append(e); }
    r.onmousedown = e => { e.preventDefault(); lsPick(x.slug, x.name); };
    r.onmousemove = () => { if (LS.sel !== k) { LS.sel = k; lsDdRender(); } };
    return r;
  };
  const g = t => { const h = document.createElement('div'); h.className = 'ls-g'; h.textContent = t; dd.append(h); };
  if (live.length) { g('En directo'); live.forEach(x => dd.append(row(x))); }
  if (off.length) { g('Sin directo ahora'); off.forEach(x => dd.append(row(x))); }
  if (!LS.dd.some(x => x.slug === typed) && /^[a-z0-9_\-]{2,30}$/.test(typed)) { g(LS.ddBusy ? 'Buscando en Kick…' : 'Usar el nombre tal cual'); dd.append(row({ slug: typed, name: typed, live: false })); }
  else if (LS.ddBusy) g('Buscando en Kick…');
  dd.hidden = !dd.children.length;
}
function lsLocal(q) {
  const s = lvSlug(q), all = [...(LS.mine || []), ...(LS.live || [])], seen = new Set();
  return all.filter(x => (x.slug.includes(s) || (x.name || '').toLowerCase().includes(s)) && !seen.has(x.slug) && seen.add(x.slug)).sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.viewers - a.viewers).slice(0, 8);
}
let lsQT = null;
function lsOnInput() {
  LS.q = $('lsQ').value; LS.sel = 0; LS.dd = lsLocal(LS.q); LS.ddBusy = !!LS.q.trim(); lsDdRender();
  clearTimeout(lsQT); if (!LS.q.trim()) return;
  const q = LS.q;
  lsQT = setTimeout(async () => {
    const r = await ksAsk({ kind: 'buscar', q }, 12000); if (q !== LS.q) return;
    LS.ddBusy = false;
    if (r.items) { const m = new Map(LS.dd.map(x => [x.slug, x])); for (const x of r.items) m.set(x.slug, { ...m.get(x.slug), ...x }); LS.dd = [...m.values()].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.viewers - a.viewers).slice(0, 10); }
    lsDdRender();
  }, 300);
}
function lsDdItems() { const live = LS.dd.filter(x => x.live), off = LS.dd.filter(x => !x.live), typed = lvSlug(LS.q); const a = [...live, ...off]; if (!a.some(x => x.slug === typed) && /^[a-z0-9_\-]{2,30}$/.test(typed)) a.push({ slug: typed, name: typed }); return a; }
async function lsPick(slug, name) {
  slug = lvSlug(slug);
  if (!/^[a-z0-9_\-]{2,30}$/.test(slug)) { toast('Escribe el nombre del canal de Kick o pega su enlace'); $('lsQ').focus(); return; }
  $('lsDd').hidden = true; $('lsQ').blur();
  try { await lvChanEnsure(slug); } catch (e) { console.warn(e); }
  lvFocus = slug; try { localStorage.setItem('cortex-lvFocus', slug); } catch {}
  toast(`Abriendo el directo de ${name || slug}…`);
  await openLive();
}
setTimeout(() => {
  const q = $('lsQ'); if (!q) return;
  q.addEventListener('input', lsOnInput);
  q.addEventListener('focus', () => { $('lsBar').classList.add('foc'); if (LS.q.trim()) lsDdRender(); });
  q.addEventListener('blur', () => { $('lsBar').classList.remove('foc'); setTimeout(() => { $('lsDd').hidden = true; }, 120); });
  q.addEventListener('keydown', e => {
    e.stopPropagation();
    const items = lsDdItems();
    if (e.key === 'ArrowDown') { e.preventDefault(); LS.sel = Math.min(items.length - 1, LS.sel + 1); lsDdRender(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); LS.sel = Math.max(0, LS.sel - 1); lsDdRender(); }
    else if (e.key === 'Enter') { e.preventDefault(); const x = items[LS.sel] || items[0]; x ? lsPick(x.slug, x.name) : lsPick(q.value); }
    else if (e.key === 'Escape') { $('lsDd').hidden = true; q.blur(); }
  });
  $('lsGo').onclick = () => { const items = lsDdItems(); const x = LS.q.trim() && (items[LS.sel] || items[0]); x ? lsPick(x.slug, x.name) : (LS.q.trim() ? lsPick(q.value) : q.focus()); };
  $('lsRf').onclick = () => lsRender(true);
  // mientras se ve la pantalla: la lista se actualiza sola cada minuto
  setInterval(() => { if ($('home').hidden || homeSec !== 'directo') return; lsAgo(); if (Date.now() - LS.liveAt > 60000 && document.visibilityState === 'visible') lsRender(true); }, 5000);
}, 0);

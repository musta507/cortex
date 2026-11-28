/* ---------- canales del directo dentro del panel: ver cuál está en directo, elegir cuál sigues y añadir uno ---------- */
let liveWant = [], lvFocus = '', lvChanBarOn = true;
try { lvFocus = localStorage.getItem('cortex-lvFocus') || ''; } catch {}
const lvSlug = k => String(k || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0].toLowerCase();
function lvFocusSet(slug) {
  lvFocus = slug; try { localStorage.setItem('cortex-lvFocus', slug); } catch {}
  liveRender(); try { const S = lvTrSess(); if (S) lvTrRender(S); } catch {} try { stMode(); } catch {}
}
function lvChanBar(st, S) {
  const bar = document.createElement('div'); bar.className = 'lv-chans lv-cbar'; bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', 'Canales');
  const cur = lvTrSess(), curSlug = cur ? String(cur.status.slug || '').toLowerCase() : lvFocus;
  const slugs = liveWant.length ? liveWant.slice() : [...new Set(S.map(s => String(s.status.slug || '').toLowerCase()))];
  // primero los que están en directo
  slugs.sort((a, b) => (S.some(s => s.on && String(s.status.slug).toLowerCase() === b) ? 1 : 0) - (S.some(s => s.on && String(s.status.slug).toLowerCase() === a) ? 1 : 0));
  for (const slug of slugs) {
    const ss = S.filter(s => String(s.status.slug || '').toLowerCase() === slug), s = ss.find(x => x.on) || ss[0];
    const on = !!(s && s.on), b = document.createElement('button'); b.type = 'button';
    b.className = 'lv-chip' + (slug === curSlug ? ' on' : '') + (on ? ' live' : '');
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', slug === curSlug ? 'true' : 'false');
    let info = 'sin directo';
    if (s && on) { const mins = Math.round(((s.segs && s.segs.length ? s.segs[s.segs.length - 1].t1 : s.status.started) - s.status.started) / 60); info = `en directo · ${mins} min`; }
    else if (s && Date.now() / 1000 - s.status.updated < 3600 * 3) info = 'terminó hace poco';
    b.innerHTML = '<i class="lv-dot"></i><span></span><em></em>'; b.children[1].textContent = slug; b.children[2].textContent = info;
    b.title = on ? `Seguir el directo de ${slug}: transcripción, pantalla y momentos` : `${slug} no está en directo ahora. El grabador empieza solo cuando entre.`;
    b.onclick = () => { if (!on && !s) { const c = lvTrSess(); toast(`${slug} no está en directo ahora${c && c.on ? ': sigues a ' + c.status.slug : ''}. Cuando entre, aparecerá en rojo y podrás pulsarlo.`); return; } lvFocusSet(slug); };
    bar.append(b);
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'lv-chip add'; add.textContent = '＋ Añadir canal'; add.title = 'Graba y sigue otro canal de Kick';
  add.onclick = () => lvChanAdd(add); bar.append(add);
  const cfg = document.createElement('button'); cfg.type = 'button'; cfg.className = 'lv-chip ghost'; cfg.textContent = '⚙ Ajustes del directo'; cfg.title = 'Cuentas de clippers, IA que escucha, quitar canales y carpeta del grabador';
  cfg.onclick = () => $('lvCfg').click(); bar.append(cfg);
  st.append(bar);
}
function lvChanAdd(btn) {
  const old = document.querySelector('.lv-addpop'); if (old) { old.remove(); return; }
  const p = document.createElement('div'); p.className = 'lv-addpop';
  p.innerHTML = '<input type="text" placeholder="Canal de Kick, por ejemplo: westcol" autocomplete="off" spellcheck="false"><button type="button" class="primary">Añadir</button>';
  const r = btn.getBoundingClientRect(); p.style.left = Math.max(12, Math.min(innerWidth - 340, r.left)) + 'px'; p.style.top = (r.bottom + 8) + 'px';
  document.body.append(p); const inp = p.firstChild, go = p.lastChild; inp.focus();
  const close = () => { p.remove(); document.removeEventListener('pointerdown', out, true); };
  const out = e => { if (!p.contains(e.target) && e.target !== btn) close(); };
  document.addEventListener('pointerdown', out, true);
  const save = async () => {
    const slug = lvSlug(inp.value); if (!slug) { inp.focus(); return; }
    if (liveWant.includes(slug)) { close(); lvFocusSet(slug); toast(`${slug} ya estaba en tus canales`); return; }
    go.disabled = true;
    try {
      await lvChanEnsure(slug);
      close(); liveRender(); livePoll();
      toast(`${slug} añadido: el grabador lo grabará en cuanto entre en directo`);
    } catch (e) { console.warn(e); go.disabled = false; toast('No se pudo añadir el canal'); }
  };
  go.onclick = save;
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') close(); });
}

// añadir un canal (si ya está, no hace nada) y quitarlo: el grabador graba todos los canales que tengas
async function lvChanEnsure(slug) {
  for (const c of clients) if (lvSlug((await getLive(c)).kick) === slug) { if (!liveWant.includes(slug)) liveWant.push(slug); return c; }
  let cl = null; for (const c of clients) { if (!lvSlug((await getLive(c)).kick)) { cl = c; break; } }   // si hay un hueco vacío se usa ese
  if (!cl) { cl = { id: 'c' + Date.now().toString(36), name: slug, created: Date.now(), tg: groupOf(clients[0].id), chan: true }; clients.push(cl); }
  else if (cl !== clients[0]) cl.name = slug;
  await saveClients();
  const L = await getLive(cl); await saveLive(cl, { ...L, kick: slug });
  if (!liveWant.includes(slug)) liveWant.push(slug);
  await writeLiveConfig();
  return cl;
}
async function lvChanDrop(slug) {
  for (const c of clients.slice()) {
    if (lvSlug((await getLive(c)).kick) !== slug) continue;
    if (c === clients[0]) { const L = await getLive(c); await saveLive(c, { ...L, kick: '' }); }
    else clients = clients.filter(x => x !== c);
  }
  await saveClients(); liveWant = liveWant.filter(x => x !== slug); if (lvFocus === slug) lvFocus = '';
  await writeLiveConfig();
}

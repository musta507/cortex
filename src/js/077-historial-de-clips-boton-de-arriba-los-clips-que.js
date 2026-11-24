/* ---------- historial de clips (botón de arriba): los clips que has sacado, del más nuevo al más antiguo ---------- */
function lhOpen() {
  const pop = $('lhPop'), btn = $('lvHistB'), r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + 8) + 'px'; pop.style.left = Math.max(12, Math.min(innerWidth - 372, r.left)) + 'px';
  const items = [];
  for (const S of Object.values(liveSessions)) for (const m of S.moments || []) if (m.src === 'agente' && !liveHidden.has(m.id)) items.push({ S, m });
  items.sort((x, y) => (y.m.at || y.m.t1) - (x.m.at || x.m.t1));
  pop.innerHTML = '';
  if (!items.length) { const e = document.createElement('div'); e.className = 'lh-e'; e.textContent = 'Todavía no has sacado ningún clip. Los que saques aparecerán aquí para volver a abrirlos.'; pop.append(e); }
  let day = '';
  for (const { S, m } of items.slice(0, 80)) {
    const at = new Date((m.at || m.t1) * 1000), d = at.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== day) { day = d; const h = document.createElement('div'); h.className = 'lh-d'; h.textContent = at.toDateString() === new Date().toDateString() ? 'Hoy' : d; pop.append(h); }
    const b = document.createElement('button'); b.className = 'lh-r'; b.type = 'button';
    const t = document.createElement('b'); t.textContent = `✂️ ${Math.round(m.t1 - m.t0)} s · ${at.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${S.status.slug || ''}`;
    const i = document.createElement('span'); i.textContent = `${m.info || m.req || 'Clip'} · minuto ${clockOf(m.t0 - S.status.started)} del directo`;
    b.append(t, i);
    b.onclick = () => {
      pop.hidden = true; $('lvHistB').classList.remove('on');
      if (!$('stEd').hidden && stPend !== 'prep') { toast('Termina o cierra (✕) el clip que tienes abierto antes de abrir otro'); return; }
      try { if (stOn() && S.on && S === lvTrSess()) stCut(m); else liveEdit(S, mergeMoments([m])[0], null); } catch (e) { toast('No se pudo abrir el clip: ' + (e.message || e)); }
    };
    pop.append(b);
  }
  pop.hidden = false;
}
setTimeout(() => {
  if (!$('lvHistB')) return;
  const close = () => { $('lhPop').hidden = true; $('lvHistB').classList.remove('on'); };
  $('lvHistB').onclick = e => { e.stopPropagation(); if ($('lhPop').hidden) lhOpen(); else close(); };
  document.addEventListener('click', e => { if (!$('lhPop').hidden && !$('lhPop').contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('lhPop').hidden) close(); });
}, 0);

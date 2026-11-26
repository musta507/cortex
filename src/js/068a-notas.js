/* ---------- 📝 notas: apuntes libres (ideas, cosas que hacer, lo que sea), guardados en este ordenador ---------- */
const NT = { list: null, cur: null, t: 0 };
async function ntLoad() { if (!NT.list) { try { NT.list = (await kv.get('notas')) || []; } catch { NT.list = []; } } return NT.list; }
function ntSave() { clearTimeout(NT.t); NT.t = setTimeout(() => { kv.set('notas', NT.list).catch(() => toast('No se pudieron guardar las notas')); }, 400); }
const ntTitle = n => (n.title || '').trim() || (n.text || '').trim().split('\n')[0].slice(0, 60) || 'Nota sin título';
const ntWhen = ts => { const d = new Date(ts), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
async function notesOpen() {
  await ntLoad();
  let m = $('ntModal'); if (m) m.remove();
  m = document.createElement('div'); m.id = 'ntModal'; m.className = 'pv-modal'; m.style.zIndex = 9000;
  m.innerHTML = `<div class="pv-card nt-card" role="dialog" aria-label="Notas">
    <div class="pv-head"><strong>📝 Notas</strong><span class="hint">Se guardan solas en este ordenador</span><button class="ib" id="ntX" aria-label="Cerrar">✕</button></div>
    <div class="nt-body">
      <div class="nt-side"><div class="nt-tools"><input id="ntQ" type="search" placeholder="Buscar…" aria-label="Buscar en las notas"><button class="primary" id="ntNew">＋ Nueva</button></div><div class="nt-list" id="ntList"></div></div>
      <div class="nt-ed" id="ntEd"><input id="ntT" placeholder="Título" maxlength="120" aria-label="Título de la nota"><textarea id="ntTx" placeholder="Escribe aquí…" aria-label="Texto de la nota"></textarea>
        <div class="nt-foot"><span class="hint" id="ntInfo"></span><span style="flex:1"></span><button id="ntDel">🗑 Borrar nota</button></div></div>
      <div class="nt-empty hint" id="ntEmpty">Aún no tienes notas. Pulsa «＋ Nueva» para escribir una.</div>
    </div></div>`;
  document.body.append(m);
  for (const id of ['ntQ', 'ntT', 'ntTx']) $(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  const close = () => { clearTimeout(NT.t); kv.set('notas', NT.list).catch(() => {}); m.remove(); };
  $('ntX').onclick = close; m.addEventListener('mousedown', e => { if (e.target === m) close(); });
  const cur = () => NT.list.find(n => n.id === NT.cur);
  const list = () => {
    const q = $('ntQ').value.trim().toLowerCase(), box = $('ntList'); box.innerHTML = '';
    const ns = [...NT.list].sort((a, b) => b.at - a.at).filter(n => !q || (n.title + '\n' + n.text).toLowerCase().includes(q));
    for (const n of ns) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'nt-it' + (n.id === NT.cur ? ' on' : '');
      const t = document.createElement('b'), s = document.createElement('span'); t.textContent = ntTitle(n); s.textContent = ntWhen(n.at) + ' · ' + ((n.text || '').replace(/\s+/g, ' ').trim().slice(0, 70) || 'vacía');
      b.append(t, s); b.onclick = () => { NT.cur = n.id; show(); }; box.append(b);
    }
    if (!ns.length && NT.list.length) { const e = document.createElement('div'); e.className = 'hint'; e.style.padding = '10px'; e.textContent = 'Ninguna nota tiene eso.'; box.append(e); }
    $('ntEmpty').hidden = !!NT.list.length; $('ntEd').hidden = !cur();
  };
  const show = () => { const n = cur(); if (n) { $('ntT').value = n.title || ''; $('ntTx').value = n.text || ''; $('ntInfo').textContent = 'Cambiada ' + ntWhen(n.at); } list(); };
  const edit = () => { const n = cur(); if (!n) return; n.title = $('ntT').value; n.text = $('ntTx').value; n.at = Date.now(); $('ntInfo').textContent = 'Guardada'; ntSave(); list(); };
  $('ntT').oninput = edit; $('ntTx').oninput = edit; $('ntQ').oninput = list;
  $('ntNew').onclick = () => { const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: '', text: '', at: Date.now() }; NT.list.push(n); NT.cur = n.id; $('ntQ').value = ''; ntSave(); show(); $('ntT').focus(); };
  $('ntDel').onclick = () => {
    const b = $('ntDel'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; setTimeout(() => { if ($('ntDel')) { b.dataset.sure = ''; b.textContent = '🗑 Borrar nota'; } }, 3000); return; }
    NT.list = NT.list.filter(n => n.id !== NT.cur); NT.cur = (NT.list.slice().sort((a, b) => b.at - a.at)[0] || {}).id || null; b.dataset.sure = ''; b.textContent = '🗑 Borrar nota'; ntSave(); show();
  };
  if (!cur()) NT.cur = (NT.list.slice().sort((a, b) => b.at - a.at)[0] || {}).id || null;
  show();
}

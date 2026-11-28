/* ---------- buscador de toda la app (Ctrl+K): secciones, acciones, clips y plantillas en un solo sitio ---------- */
let cmdkSel = 0, cmdkItems = [];
function cmdkAll() {
  const out = [];
  for (const [k, l] of HSECS) out.push({ g: 'Ir a', t: l, run: () => setHomeSec(k) });
  out.push({ g: 'Acciones', t: 'Nuevo clip', k: 'crear subir editar', run: () => newClip() });
  out.push({ g: 'Acciones', t: 'Notas', k: 'apuntes', run: () => notesOpen() });
  out.push({ g: 'Acciones', t: 'Limpiar CapCut', k: 'disco espacio borrar', run: () => ccCleanOpen() });
  out.push({ g: 'Acciones', t: 'Claves de la IA', k: 'gemini elevenlabs api key ajustes', run: () => setHomeSec('ajustes') });
@@solo-pc
  out.push({ g: 'Acciones', t: 'Replicar un viral', k: 'copiar clip vod crudo', run: async () => { await newClip(); repOpen(); } });
@@fin
@@solo-pc
  out.push({ g: 'Acciones', t: 'Canales de Kick y grabador', k: 'directo cuentas clippers carpeta ajustes', run: () => setHomeSec('ajustes') });
  out.push({ g: 'Acciones', t: 'Analizar un directo con el agente', k: 'vod clips virales', run: () => { setHomeSec('agente'); } });
@@fin
  out.push({ g: 'Acciones', t: document.querySelector('#home.navmin') ? 'Ensanchar el menú' : 'Encoger el menú', k: 'barra lateral', run: () => document.querySelector('#hnav .hmin').click() });
  for (const p of PRESETS) if (!(presetHidden || []).includes(p.name)) out.push({ g: 'Plantillas', t: fmtLbl(p.name), k: 'formato', run: () => setHomeSec('plantillas') });
  for (const n of Object.keys(templates || {})) out.push({ g: 'Plantillas', t: n, k: 'guardada', run: () => setHomeSec('plantillas') });
  for (const e of projIndex.filter(x => !x.batch)) out.push({ g: 'Clips', t: e.name || 'Clip sin nombre', s: new Date(e.time).toLocaleDateString('es-ES'), run: () => openProject(e) });
  return out;
}
function cmdkRender() {
  const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), q = norm($('cmdkQ').value.trim()), words = q.split(/\s+/).filter(Boolean), box = $('cmdkList'); box.innerHTML = '';
  let all = cmdkAll().filter(x => { const h = norm(x.t + ' ' + (x.k || '') + ' ' + x.g); return words.every(w => h.includes(w)); });
  if (!q) all = all.filter(x => x.g !== 'Plantillas').filter((x, i, a) => x.g !== 'Clips' || a.filter(y => y.g === 'Clips').indexOf(x) < 6);
  cmdkItems = all.slice(0, 40); cmdkSel = Math.max(0, Math.min(cmdkSel, cmdkItems.length - 1));
  if (!cmdkItems.length) { const p = document.createElement('p'); p.className = 'hint'; p.style.padding = '14px'; p.textContent = 'Nada con ese nombre.'; box.append(p); return; }
  let g = null;
  cmdkItems.forEach((x, i) => {
    if (x.g !== g) { g = x.g; const h = document.createElement('div'); h.className = 'cmdk-g'; h.textContent = g; box.append(h); }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cmdk-i' + (i === cmdkSel ? ' on' : ''); const a = document.createElement('span'); a.textContent = x.t; b.append(a);
    if (x.s) { const s = document.createElement('em'); s.textContent = x.s; b.append(s); }
    b.onclick = () => cmdkRun(i); b.onmousemove = () => { if (cmdkSel !== i) { cmdkSel = i; box.querySelectorAll('.cmdk-i').forEach((el, k) => el.classList.toggle('on', k === i)); } };
    box.append(b);
  });
  const on = box.querySelector('.cmdk-i.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function cmdkRun(i) { const x = cmdkItems[i]; if (!x) return; cmdkClose(); try { x.run(); } catch (e) { console.warn(e); } }
function cmdkOpen() { if ($('home').hidden) return; $('cmdk').hidden = false; $('cmdkQ').value = ''; cmdkSel = 0; cmdkRender(); $('cmdkQ').focus(); }
function cmdkClose() { $('cmdk').hidden = true; }
setTimeout(() => {
  const d = document.createElement('div'); d.id = 'cmdk'; d.className = 'cmdk'; d.hidden = true;
  d.innerHTML = '<div class="cmdk-pop" role="dialog" aria-label="Buscar"><input id="cmdkQ" type="text" placeholder="Busca un clip, una sección o una acción…" autocomplete="off" spellcheck="false"><div class="cmdk-list" id="cmdkList"></div><div class="cmdk-f"><span>↑↓ moverse</span><span>Enter abrir</span><span>Esc cerrar</span></div></div>';
  document.body.append(d);
  d.addEventListener('pointerdown', e => { if (e.target === d) cmdkClose(); });
  $('cmdkQ').addEventListener('input', () => { cmdkSel = 0; cmdkRender(); });
  $('cmdkQ').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkSel = Math.min(cmdkItems.length - 1, cmdkSel + 1); cmdkRender(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkSel = Math.max(0, cmdkSel - 1); cmdkRender(); }
    else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(cmdkSel); }
    else if (e.key === 'Escape') { e.preventDefault(); cmdkClose(); }
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' && !$('home').hidden) { e.preventDefault(); e.stopImmediatePropagation(); $('cmdk').hidden ? cmdkOpen() : cmdkClose(); } }, true);
}, 0);

/* ---------- Ajustes: lo que se configura una vez (claves, mantenimiento) en un solo sitio ---------- */
function setRender() {
  const web = typeof CORTEX_PROXY !== 'undefined' && CORTEX_PROXY; $('setKeys').hidden = !!web;
  const st = (id, v) => { $(id).textContent = v ? '· puesta' : '· falta'; $(id).className = v ? 'set-ok' : 'set-no'; };
  let g = '', e = ''; try { g = (localStorage.getItem('clipzi-gemini') || '').trim(); e = (localStorage.getItem('clipzi-eleven') || '').trim(); } catch {}
  if (document.activeElement !== $('setGem')) $('setGem').value = g; if (document.activeElement !== $('setEl')) $('setEl').value = e;
  st('setGemSt', g); st('setElSt', e);
  keysSync();
@@solo-pc
  $('setToApp').hidden = !!(window.cortexApp && window.cortexApp.isApp);
@@fin
}
setTimeout(() => {
  if (!$('setGem')) return;
  $('setGem').addEventListener('input', () => { const v = $('setGem').value.trim(); try { localStorage.setItem('clipzi-gemini', v); } catch {} for (const id of ['gemKey', 'gemKey2', 'ezKey']) if ($(id)) $(id).value = v; setRender(); });
  $('setEl').addEventListener('input', () => { const v = $('setEl').value.trim(); try { localStorage.setItem('clipzi-eleven', v); } catch {} if ($('elKey')) $('elKey').value = v; setRender(); });
  $('setCC').onclick = () => ccCleanOpen(); $('setLog').onclick = () => { try { clipLogDownload(); } catch (e) { toast('Todavía no hay datos de clips'); } };
@@solo-pc
  $('setLiveHost').append($('liveBox'));   // canales, cuentas y carpeta: se configuran una vez, van en Ajustes
  $('lvCfg').onclick = () => { $('lvBackHome').click(); setHomeSec('ajustes'); setTimeout(() => $('liveBox').scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); };
@@fin
@@solo-web
  $('lvCfg').hidden = true;
@@fin
  keysSync();
@@solo-pc
  $('setToApp').onclick = () => cxToApp();
@@fin
}, 0);

// «En directo» en un paso: si ya hay un canal puesto abre el panel; si no, lleva a ponerlo
async function liveGo() {
  try { document.activeElement.blur(); } catch {}
  let any = false; try { for (const c of clients) if (((await getLive(c)).kick || '').trim()) { any = true; break; } } catch {}
  if (!any) { setHomeSec('ajustes'); toast('Pon primero tu canal de Kick y la carpeta del grabador'); setTimeout(() => { $('liveBox').scrollIntoView({ block: 'center' }); $('lvKick').focus(); }, 60); return; }
  $('lvOpen').click();
}
// las casillas de clave repartidas por el editor solo salen si la clave falta: una vez puesta, se cambia en Ajustes
function keysSync() {
  let g = '', e = ''; try { g = (localStorage.getItem('clipzi-gemini') || '').trim(); e = (localStorage.getItem('clipzi-eleven') || '').trim(); } catch {}
  const gl = $('gemKey') && $('gemKey').closest('label'); if (gl && document.activeElement !== $('gemKey')) gl.hidden = !!g;
  if ($('elKeyW') && document.activeElement !== $('elKey') && !$('elKeyW').dataset.web) { const web = typeof elWeb === 'function' && elWeb(); if (!web) { $('elKeyW').hidden = !!e; if ($('elKeyH')) $('elKeyH').hidden = !!e; } }
}

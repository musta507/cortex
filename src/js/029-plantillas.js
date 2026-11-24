/* ---------- plantillas ---------- */
let templates = {};
let titleTpls = {}, titleDef = null;   // plantillas de título de este creador y cuál usa siempre
async function loadTemplates() { try { templates = (await kv.get('templates')) || {}; } catch { templates = {}; } renderTpl(); }
async function saveTemplates() { return saveTypeStore(); }
function renderTpl(sel) {
  const s = $('tplSel'), names = Object.keys(templates).sort((a, b) => a.localeCompare(b, 'es'));
  s.innerHTML = names.length ? '' : '<option value="">Aún no tienes plantillas</option>';
  for (const n of names) { const o = document.createElement('option'); o.value = n; o.textContent = n; s.append(o); }
  if (sel && templates[sel]) s.value = sel;
  ['tplApply', 'tplUpdate', 'tplDel'].forEach(id => $(id).disabled = !names.length);
}
$('tplSave').onclick = async () => {
  const name = $('tplName').value.trim();
  if (!name) { setStatus($('tplStatus'), 'Escribe un nombre para la plantilla.', 'err'); $('tplName').focus(); return; }
  const exists = !!templates[name];
  templates[name] = getStyle();
  const ok = await saveTemplates();
  renderTpl(name); $('tplName').value = '';
  setStatus($('tplStatus'), ok ? (exists ? `Plantilla «${name}» actualizada.` : `Plantilla «${name}» guardada.`) : 'No se pudo guardar en este navegador.', ok ? 'ok' : 'err');
};
$('tplApply').onclick = async () => {
  const n = $('tplSel').value; if (!templates[n]) return;
  await applyStyle(templates[n]);
  const st = templates[n];
  const miss = st.music && !music.lib.some(m => m.id === st.music);
  setStatus($('tplStatus'), `Plantilla «${n}» aplicada.` + (miss ? ' Su canción ya no está en tu biblioteca.' : ''), 'ok');
  setTimeout(pushHistory, 10);
};
$('tplUpdate').onclick = async () => {
  const n = $('tplSel').value; if (!n) return;
  templates[n] = getStyle(); const ok = await saveTemplates();
  setStatus($('tplStatus'), ok ? `Plantilla «${n}» actualizada con el estilo actual.` : 'No se pudo guardar.', ok ? 'ok' : 'err');
};
let delArmed = null;
$('tplDel').onclick = async () => {
  const n = $('tplSel').value; if (!n) return;
  if (delArmed !== n) {   // confirmación en dos pasos, sin ventanas emergentes
    delArmed = n; $('tplDel').textContent = '¿Seguro? Pulsa otra vez';
    setTimeout(() => { delArmed = null; $('tplDel').textContent = 'Borrar'; }, 3000); return;
  }
  delArmed = null; $('tplDel').textContent = 'Borrar';
  delete templates[n]; await saveTemplates(); renderTpl();
  setStatus($('tplStatus'), `Plantilla «${n}» borrada.`);
};


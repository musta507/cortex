/* ---------- pantalla para elegir el crudo y los virales ---------- */
function repRender() {
  $('repRawInfo').textContent = repRaw ? `${repRaw.name} · ${(repRaw.size / 1048576).toFixed(0)} MB` : (loaded && file ? `Se usará el vídeo abierto: ${file.name}` : 'El directo o vídeo largo original');
  const list = $('repVirList'); list.innerHTML = '';
  repVir.forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'rep-item';
    const s = document.createElement('span'); s.textContent = '🎬 ' + f.name;
    const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Quitar'; x.onclick = () => { repVir.splice(i, 1); repRender(); };
    row.append(s, x); list.append(row);
  });
  $('repVirInfo').textContent = repVir.length ? `${repVir.length} clip${repVir.length > 1 ? 's' : ''} viral${repVir.length > 1 ? 'es' : ''}` : 'Uno o varios clips hechos de ese vídeo';
  $('repGo').disabled = !(repRaw || (loaded && file)) || !repVir.length;
}
function repOpen() { repRaw = null; repVir = []; ezShow('rep'); repRender(); }
async function repLink(which) {
  const inp = $(which === 'raw' ? 'repRawUrl' : 'repVirUrl'), info = $(which === 'raw' ? 'repRawInfo' : 'repVirInfo'), url = inp.value.trim();
  if (!/^https?:\/\/\S+\.\S+/.test(url)) { toast('Pega primero el enlace'); inp.focus(); return; }
  const btn = $(which === 'raw' ? 'repRawGo' : 'repVirGo'); btn.disabled = true;
  try {
    const r = await grabFetch(url, null, null, m => info.textContent = m);
    if (which === 'raw') repRaw = r.file; else repVir.push(r.file);
    inp.value = ''; toast('Descargado: ' + (r.title || r.file.name));
  } catch (e) { toast(e.auth ? e.message : 'No se pudo descargar: ' + e.message); }
  finally { btn.disabled = false; repRender(); }
}
$('ezRepBtn').onclick = ev => { ev.stopPropagation(); repOpen(); };
$('repRawPick').onclick = () => { const i = $('repRawFile'); i.value = ''; i.click(); };
$('repRawFile').onchange = () => { const f = $('repRawFile').files[0]; if (f) { repRaw = f; repRender(); } };
$('repVirPick').onclick = () => { const i = $('repVirFile'); i.value = ''; i.onchange = () => { repVir.push(...i.files); repRender(); }; i.click(); };
$('repRawGo').onclick = () => repLink('raw');
$('repVirGo').onclick = () => repLink('vir');
$('repBack').onclick = () => ezShow(loaded ? 'edit' : 'insert');
$('repGo').onclick = () => { if (!$('repGo').disabled) repStart(repRaw, repVir.slice()); };
for (const [zone, which] of [['repRawZone', 'raw'], ['repVirZone', 'vir']]) {
  const z = $(zone);
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => {
    e.preventDefault(); z.classList.remove('over');
    const fs = [...e.dataTransfer.files].filter(f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (!fs.length) return;
    if (which === 'raw') repRaw = fs[0]; else repVir.push(...fs);
    repRender();
  });
}


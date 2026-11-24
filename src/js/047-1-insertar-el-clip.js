/* ---------- 1) insertar el clip ---------- */
@@solo-web
// web: lo que abre y exporta cada clipper queda en su cuenta (lo ve el administrador en /panel)
async function webLog(data) { if (!CORTEX_PROXY) return null; try { const r = await fetch('/api/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (r.status === 401) { location.reload(); return null; } return (await r.json()).id || null; } catch (e) { console.warn('registro web', e); return null; } }
function webThumb() { try { const c = $('cv'), w = 270, h = Math.round(w * c.height / c.width), t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').drawImage(c, 0, 0, w, h); return t.toDataURL('image/jpeg', 0.72); } catch { return null; } }
async function webExported(out) {
  if (!CORTEX_PROXY || !out || !out.blob) return;
  let meta = {}; try { meta = clipLogSnap(); } catch {}
  meta.enlace = window.__cxLink || null;
  const id = await webLog({ tipo: 'exportado', proyecto: curProj, meta, thumb: webThumb() }); if (!id) return;
  try { const r = await fetch('/api/subir/' + id, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: out.blob }); if (!r.ok) console.warn('subir', r.status); } catch (e) { console.warn('subir', e); }
}
// al abrir un clip: se sube el vídeo original (así se ve en el panel aunque no se exporte)
async function webOpened(f) {
  if (!CORTEX_PROXY) return; const proj = curProj, link = window.__cxLink || null; window.__cxLink = null;
  await new Promise(r => setTimeout(r, 700));
  const id = await webLog({ tipo: 'abierto', proyecto: proj, meta: { archivo: f.name, enlace: link, duracion_s: +ezDur().toFixed(1) }, thumb: webThumb() }); if (!id) return;
  try { await fetch('/api/subir/' + id, { method: 'PUT', headers: { 'Content-Type': f.type || 'video/mp4' }, body: f }); } catch (e) { console.warn('subir original', e); }
}
// mientras edita: cómo va (título, formato, duración) para verlo en el panel, como mucho cada 15 s
let webStT = 0, webStLast = '';
function webState() {
  if (!CORTEX_PROXY || !curProj || !loaded) return; clearTimeout(webStT);
  webStT = setTimeout(() => { let m = {}; try { m = clipLogSnap(); } catch { return; } const k = JSON.stringify([m.titulo, m.formato, m.duracion_s]); if (k === webStLast) return; webStLast = k; webLog({ tipo: 'estado', proyecto: curProj, meta: m, thumb: webThumb() }); }, 15000);
}
if (CORTEX_PROXY) fetch('/api/yo').then(r => r.status === 401 ? location.reload() : r.json()).then(j => { if (j && j.name) { window.__cxMe = j.name; try { renderHome(); } catch {} } }).catch(() => {});
@@fin
async function ezInsertFile(f) {
  if (!f || !(/^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name))) { toast('Eso no parece un vídeo'); return; }
  ezHold = true;
  try { await loadFile(f); } catch (e) { toast('No se pudo abrir el vídeo'); return; } finally { ezHold = false; }
  if (tplEditing) { await tplAfterLoad(); return; }
  ezRetrim = false; ezA = 0; ezB = ezDur(); renderFlags(); ezClip = { f: '', t: '', s: '' };
@@solo-web
  webOpened(f);
@@fin
  ezShow('trim');
  if (ezPref('quickEd') !== '0' && !stDock && !auBusy) stQuickOpen();
}
$('ezPick').onclick = ev => { ev.stopPropagation(); $('ezFile').value = ''; $('ezFile').click(); };
$('ezInsert').onclick = () => { $('ezFile').value = ''; $('ezFile').click(); };
$('ezFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) ezInsertFile(f); });
// insertar desde un enlace: lo descarga el Grabador Clipzi del PC
/* barra de descarga: va rápida al principio y cada vez más lenta (nunca llega sola al final);
   cuando la descarga termina de verdad, sale disparada hasta el 100 %. Hay 5 diseños (ezPref('dlBar') = 1…5). */
function dlBar(host, label) {
  const v = Math.min(5, Math.max(1, +ezPref('dlBar') || 1)), el = document.createElement('div');
  el.className = 'dlb v' + v; el.innerHTML = `<div class="t"><span></span><em>0 %</em></div><div class="tr"><div class="f"></div><b></b></div>`;
  host.innerHTML = ''; host.append(el);
  const f = el.querySelector('.f'), pc = el.querySelector('em'), inn = el.querySelector('b'), lab = el.querySelector('.t span');
  let real = 0, shown = 0, stop = false; const t0 = performance.now();
  lab.textContent = label || 'Descargando el clip…';
  const paint = x => { shown = x; const w = (x * 100).toFixed(1) + '%'; f.style.width = w; if (v === 5) f.style.setProperty('--w', (100 / Math.max(x, .01)).toFixed(1) + '%'); const n = Math.floor(x * 100) + ' %'; pc.textContent = n; inn.textContent = n; };
  (function tick() { if (stop) return; const t = (performance.now() - t0) / 1000, fake = 0.93 * (1 - Math.exp(-t / 3.5)); paint(Math.max(shown, Math.min(0.97, Math.max(fake, real * 0.97)))); requestAnimationFrame(tick); })();
  return {
    set(p, text) { if (p > 0) real = Math.min(1, p); if (text) lab.textContent = text; },
    async done(text) { stop = true; el.classList.add('end', 'ok'); lab.textContent = text || '¡Listo!'; paint(1); await sleep(450); },
    fail() { stop = true; el.classList.add('ko'); },
    el,
  };
}
async function ezLinkInsert() {
  const inp = $('ezLinkUrl'), info = $('ezLinkInfo'), btn = $('ezLinkGo'), url = inp.value.trim();
  if (!/^https?:\/\/\S+\.\S+/.test(url)) { toast('Pega primero el enlace del clip'); inp.focus(); return; }
  btn.disabled = true;
  const bar = dlBar(info, 'Descargando el clip…');
  try {
    // el texto se queda en «Descargando el clip…»: solo cambia si hay que abrir el grabador o esperar cola
    const r = await grabFetch(url, null, null, (m, p) => bar.set(p || 0, /grabador|cola/i.test(m) ? m : null));
    await bar.done(); info.innerHTML = ''; inp.value = '';
    await ezInsertFile(r.file);
  } catch (e) { bar.fail(); await sleep(500); info.innerHTML = ''; toast(e.auth ? e.message : 'No se pudo descargar: ' + e.message); }
  finally { btn.disabled = false; }
}
$('ezLinkRow').onclick = ev => ev.stopPropagation();
$('ezLinkGo').onclick = ezLinkInsert;
$('ezLinkUrl').onkeydown = e => { if (e.key === 'Enter') ezLinkInsert(); };
$('ezInsert').addEventListener('dragover', e => { e.preventDefault(); $('ezInsert').classList.add('over'); });
$('ezInsert').addEventListener('dragleave', () => $('ezInsert').classList.remove('over'));
$('ezInsert').addEventListener('drop', e => { e.preventDefault(); $('ezInsert').classList.remove('over'); const f = [...e.dataTransfer.files][0]; if (f) ezInsertFile(f); });


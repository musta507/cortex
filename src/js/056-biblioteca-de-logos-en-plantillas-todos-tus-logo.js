/* ---------- biblioteca de logos (en Plantillas): todos tus logos, y cada creador elige el suyo ---------- */
async function lgLib() { let l = null; try { l = await kv.get('logoLib'); } catch {} return Array.isArray(l) ? l : []; }
async function lgAdd(src, name) {
  if (!src) return; const l = await lgLib(); if (l.some(x => x.src === src)) return;
  l.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: (name || 'Logo ' + (l.length + 1)).slice(0, 40), src, at: Date.now() }); try { await kv.set('logoLib', l); } catch {}
}
// los logos se guardan pequeños (máx. 600 px), que van de sobra para el vídeo
function lgShrink(file) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const k = Math.min(1, 600 / Math.max(im.width, im.height)); if (k >= 1 && fr.result.length < 900000) { res(fr.result); return; } const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/png')); }; im.src = fr.result; }; fr.readAsDataURL(file); }); }
let lgRenderN = 0;
async function lgRender() {
  const box = $('lgGrid'); if (!box) return; const my = ++lgRenderN, c = clientOf(curClient); $('lgWho').textContent = 'tus clips';
  let lib = await lgLib(); const have = new Set(lib.map(x => x.src)); let added = false;
  for (const o of clients) { let st = null; try { st = await kv.get('client:' + o.id); } catch {} const src = st && st.logo && st.logo.src; if (src && !have.has(src)) { have.add(src); lib.push({ id: 'c' + o.id + Date.now().toString(36), name: 'Logo de ' + o.name, src, at: Date.now() }); added = true; } }
  if (added) { try { await kv.set('logoLib', lib); } catch {} }
  if (my !== lgRenderN) return;
  const cur = logo ? logo.src : null; box.innerHTML = '';
  const card = (x) => {
    const b = document.createElement('div'); b.className = 'lg-card' + ((x ? cur === x.src : !cur) ? ' on' : ''); b.tabIndex = 0;
    const pv = document.createElement('div'); pv.className = 'lg-pv'; if (x) { const im = document.createElement('img'); im.src = x.src; im.alt = ''; pv.append(im); } else { pv.classList.add('none'); pv.textContent = 'Sin logo'; }
    const nm = document.createElement('div'); nm.className = 'tt-n'; nm.textContent = x ? x.name : 'Ninguno'; b.append(pv, nm);
    if (b.classList.contains('on')) { const f = document.createElement('div'); f.className = 'tt-fix'; f.textContent = '✓ El de ' + (c ? c.name : 'este creador'); b.append(f); }
    if (x) {
      const ed = document.createElement('button'); ed.className = 'lg-ren'; ed.title = 'Cambiar el nombre'; ed.textContent = '🏷️';
      ed.onclick = async e => { e.stopPropagation(); const n = (prompt('Nombre del logo:', x.name) || '').trim(); if (!n) return; const l = await lgLib(), it = l.find(y => y.id === x.id); if (it) { it.name = n.slice(0, 40); await kv.set('logoLib', l); } lgRender(); };
      const d = document.createElement('button'); d.className = 'tt-del'; d.title = 'Quitar de la biblioteca'; d.textContent = '🗑';
      d.onclick = async e => { e.stopPropagation(); if (!confirm(`¿Quitar «${x.name}» de tus logos?` + (cur === x.src ? ' (Este creador lo seguirá teniendo hasta que elijas otro.)' : ''))) return; await kv.set('logoLib', (await lgLib()).filter(y => y.id !== x.id)); lgRender(); };
      const ad = document.createElement('button'); ad.type = 'button'; ad.className = 'lg-edit'; ad.textContent = '✏️ Editar'; ad.title = 'Ajustar opacidad, tamaño y posición';
      ad.onclick = async e => { e.stopPropagation(); if (!curClient) { toast('Elige primero un creador'); return; } if (cur !== x.src) { await setLogo(x.src, false); await saveTypeStore(); } LGX.open = true; await lgRender(); const bx = $('lgx'); if (bx) bx.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
      b.append(ed, d, ad);
    }
    b.onclick = async () => { if (!curClient) { toast('Elige primero un creador'); return; }
      if (x) await setLogo(x.src, false); else clearLogo(false); await saveTypeStore(); lgRender(); toast(x ? `«${x.name}» puesto para ${c ? c.name : 'este creador'}` : 'Sin logo para ' + (c ? c.name : 'este creador')); };
    b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } };
    box.append(b);
  };
  for (const x of lib) card(x);
  card(null);
  const up = document.createElement('button'); up.type = 'button'; up.className = 'lg-card lg-up'; up.innerHTML = '<div class="lg-pv none"><span>＋</span></div><div class="tt-n">Subir logos</div>'; up.onclick = () => $('lgFile').click(); box.append(up);
  lgxSync();
}
setTimeout(() => { const f = $('lgFile'); if (!f) return; f.addEventListener('change', async () => {
  const files = [...f.files]; f.value = ''; let n = 0;
  for (const x of files) { try { await lgAdd(await lgShrink(x), x.name.replace(/\.[^.]+$/, '')); n++; } catch (e) { console.warn('logo', e); } }
  if (n) toast(n === 1 ? 'Logo añadido: púlsalo para ponérselo a este creador' : `${n} logos añadidos`); lgRender();
}); }, 0);

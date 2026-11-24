/* ---------- fuentes propias ---------- */
function fontAvailable(name) {
  const c = document.createElement('canvas').getContext('2d');
  const txt = 'mmmmmmwwwwlliIQ@';
  return ['monospace', 'serif'].some(fb => {
    c.font = `72px ${fb}`; const a = c.measureText(txt).width;
    c.font = `72px "${name}", ${fb}`; return c.measureText(txt).width !== a;
  });
}
function checkFonts() {
  const missing = [...new Set(['titleFont', 'subFont'].map(id => $(id).value.split('|')[0]))].filter(n => !fontAvailable(n));
  if (missing.length) setStatus($('fontStatus'), `No tienes ${missing.join(' ni ')} en este ordenador. Súbela aquí y se usará sola; mientras tanto se ve una fuente parecida.`, 'err');
  else if ($('fontStatus').classList.contains('err')) setStatus($('fontStatus'), '');
}
async function registerFont(name, buf) {
  const face = new FontFace(name, buf, { weight: '100 900' });
  await face.load(); document.fonts.add(face);
  document.querySelectorAll('.fontSel').forEach(sel => {
    const known = [...sel.options].find(o => o.value.split('|')[0].toLowerCase() === name.toLowerCase());
    if (!known) { const o = document.createElement('option'); o.value = name + '|400'; o.textContent = name; sel.append(o); }
  });
  renderFontTiles();
}
function fontNameFromFile(fname) {
  const base = fname.replace(/\.(ttf|otf|woff2?)$/i, '');
  if (/coolvetica/i.test(base)) return 'Coolvetica';
  if (/sf.?pro.?display/i.test(base)) return 'SF Pro Display';
  return base.replace(/[-_]+(regular|bold|black|heavy|medium|semibold|rg|bd)$/i, '').replace(/[-_]+/g, ' ').trim();
}
const toB64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
$('fontFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const name = fontNameFromFile(f.name);
  try {
    const buf = await f.arrayBuffer();
    await registerFont(name, buf);
    await fontLibAdd(name, buf, f.name);
    setStatus($('fontStatus'), `Fuente «${name}» añadida. Elígela en Fuente título o Fuente de subtítulos.`, 'ok');
    checkFonts();
  } catch (err) {
    setStatus($('fontStatus'), 'Ese archivo no es una fuente válida. Usa un .ttf u .otf.', 'err');
  }
  e.target.value = '';
});
document.querySelectorAll('.fontSel').forEach(sel => sel.addEventListener('change', checkFonts));
// ---- biblioteca de fuentes de cada usuario (se guarda en este navegador, en la base de datos de Cortex) ----
async function fontLib() { let l = null; try { l = await kv.get('fontLib'); } catch {} return Array.isArray(l) ? l : []; }
async function fontLibAdd(name, buf, file) {
  const l = (await fontLib()).filter(x => x.name.toLowerCase() !== name.toLowerCase()); l.push({ name, file: file || name, buf, at: Date.now(), size: buf.byteLength });
  try { await kv.set('fontLib', l); } catch (e) { console.warn('fuente', e); }
}
async function fontAddFiles(files, say) {
  let ok = 0, bad = []; say = say || toast;
  for (const f of files) { const name = fontNameFromFile(f.name); try { const buf = await f.arrayBuffer(); await registerFont(name, buf); await fontLibAdd(name, buf, f.name); ok++; } catch { bad.push(f.name); } }
  say((ok ? (ok === 1 ? 'Fuente añadida: ya la puedes elegir en el título y los subtítulos' : ok + ' fuentes añadidas') : '') + (bad.length ? (ok ? ' · ' : '') + '⚠ No son fuentes válidas: ' + bad.join(', ') : ''));
  try { fontsRender(); } catch {} return ok;
}
let fontsRenderN = 0;
async function fontsRender() {
  const box = $('fontGrid'); if (!box) return; const my = ++fontsRenderN, l = await fontLib(); if (my !== fontsRenderN) return; box.innerHTML = '';
  for (const x of l) {
    const c = document.createElement('div'); c.className = 'fn-card';
    c.innerHTML = '<div class="fn-pv"><span>Aa Bb 123</span></div><div class="tt-n"></div><div class="tt-fix"></div>';
    c.querySelector('.fn-pv span').style.fontFamily = `"${x.name}", system-ui`; c.querySelector('.tt-n').textContent = x.name; c.querySelector('.tt-fix').textContent = (x.size / 1024).toFixed(0) + ' KB';
    const d = document.createElement('button'); d.className = 'tt-del'; d.textContent = '🗑'; d.title = 'Quitar esta fuente';
    d.onclick = async () => { if (!confirm(`¿Quitar la fuente «${x.name}»? Los títulos que la usen pasarán a una letra parecida.`)) return; await kv.set('fontLib', (await fontLib()).filter(y => y.name !== x.name)); fontsRender(); };
    c.append(d); box.append(c);
  }
  const up = document.createElement('button'); up.type = 'button'; up.className = 'fn-card fn-up'; up.innerHTML = '<div class="fn-pv"><span>＋</span></div><div class="tt-n">Subir fuentes</div><div class="tt-fix">.ttf · .otf · .woff</div>'; up.onclick = () => $('fnFile').click(); box.append(up);
}
setTimeout(() => { const f = $('fnFile'); if (f) f.addEventListener('change', async () => { const fs2 = [...f.files]; f.value = ''; if (fs2.length) await fontAddFiles(fs2); }); }, 0);
async function restoreFonts() {
  try { for (const x of await fontLib()) await registerFont(x.name, x.buf.slice ? x.buf.slice(0) : x.buf).catch(() => {}); } catch {}
  try {
    const saved = JSON.parse(localStorage.getItem('clipzi-fonts') || '{}');
    for (const [name, b64] of Object.entries(saved)) {
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await registerFont(name, u.buffer).catch(() => {});
      if (!(await fontLib()).some(x => x.name === name)) await fontLibAdd(name, u.buffer.slice(0), name);
    }
  } catch {}
}


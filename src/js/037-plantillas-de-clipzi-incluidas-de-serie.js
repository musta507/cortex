/* ---------- plantillas de Clipzi (incluidas de serie) ---------- */
const PRESETS = [
  { name: 'Título y subtítulos', desc: 'Clip horizontal centrado, título arriba y subtítulos',
    s: { titleStyle: 'plain', layoutMode: 'single', c: { titleY: '-1', titleUpper: false, titleFont: 'Inter|700', titleSize: '54', titleColor: '#ffffff',
      subFont: 'Montserrat|900', subSize: '72', subColor: '#ffffff', upper: false, hl: false, pop: true, strokeOn: false, shOp: '85', shBlur: '18', subY: '60', bg: 'black', zoom: '130', wpc: '3' } }, noHL: true },
  { name: 'Pantalla dividida', desc: 'Vídeo arriba, imagen abajo y título en caja',
    s: { titleStyle: 'box', boxMode: 'single', layoutMode: 'split', imgPos: 'bottom', c: { titleY: '-1', titleUpper: false, ratio: '55', zoom: '100', titleFont: 'Inter|700', titleSize: '48',
      boxColor: '#ffffff', boxText: '#111111', titleHl: '#ff1f1f', subFont: 'Montserrat|900', subSize: '70', upper: false, subY: '60', wpc: '3' } } },
  { name: 'Podcast', desc: 'Pantalla completa, título en caja abajo y subtítulos pequeños',
    fill: true,
    s: { titleStyle: 'box', boxMode: 'single', layoutMode: 'single', c: { titleY: '64', titleUpper: true, titleFont: 'Montserrat|800', titleSize: '58', titleLH: '112',
      boxR: '18', boxPX: '28', boxPY: '14', boxColor: '#ffffff', boxText: '#111111', titleHl: '#ff1f1f',
      subFont: 'Inter|800', subSize: '50', subColor: '#ffffff', upper: false, hl: false, pop: true, strokeOn: false, shOp: '80', shBlur: '18', subY: '56', wpc: '1', bg: 'black' } } },
  { name: 'Reacción', desc: 'Cámara del streamer arriba y lo que ve abajo',
    s: { titleStyle: 'box', boxMode: 'single', layoutMode: 'react', c: { titleY: '-1', titleUpper: true, ratio: '42', zoom: '100', titleFont: 'Montserrat|800', titleSize: '52', titleLH: '112',
      boxR: '18', boxPX: '28', boxPY: '14', boxColor: '#ffffff', boxText: '#111111', titleHl: '#ff1f1f',
      subFont: 'Inter|800', subSize: '56', subColor: '#ffffff', upper: false, subY: '75', wpc: '2' },
      crops: { cam: { x: 0.74, y: 0.66, w: 0.26, h: 0.34 }, content: { x: 0.05, y: 0.05, w: 0.68, h: 0.9 } } } },
  { name: 'Dos personas', desc: 'Dos personas del set: una arriba y otra abajo, título en medio',
    s: { titleStyle: 'box', boxMode: 'single', layoutMode: 'react', c: { duo: true, titleY: '-1', titleUpper: false, ratio: '50', zoom: '100', titleFont: 'Inter|700', titleSize: '50', titleLH: '112',
      boxR: '18', boxPX: '28', boxPY: '14', boxColor: '#ffffff', boxText: '#111111', titleHl: '#ff1f1f',
      subFont: 'Inter|800', subSize: '56', subColor: '#ffffff', upper: false, subY: '75', wpc: '2' },
      crops: { cam: { x: 0.05, y: 0.1, w: 0.42, h: 0.8 }, content: { x: 0.53, y: 0.1, w: 0.42, h: 0.8 }, fit: 'cover' } } },
  { name: 'Llamada', desc: 'Llamada de Discord: de 2 a 5 personas, una debajo de otra, título entre la primera y la segunda',
    s: { titleStyle: 'box', boxMode: 'single', layoutMode: 'react', c: { duo: true, call: true, titleY: '-1', titleUpper: false, ratio: '50', zoom: '100', titleFont: 'Inter|700', titleSize: '50', titleLH: '112',
      boxR: '18', boxPX: '28', boxPY: '14', boxColor: '#ffffff', boxText: '#111111', titleHl: '#ff1f1f',
      subFont: 'Inter|800', subSize: '56', subColor: '#ffffff', upper: false, subY: '75', wpc: '2' },
      crops: { cam: { x: 0.02, y: 0.05, w: 0.47, h: 0.45 }, content: { x: 0.51, y: 0.05, w: 0.47, h: 0.45 }, fit: 'cover' } } },
];
let BASE_STYLE = null;
let presetOverrides = {}, presetDefault = null, activePreset = null, presetHidden = [];
// formatos que este creador ha quitado: la IA nunca los usa (se usa el siguiente que sí tiene)
function fixFmt(fmt) {
  const ok = f => AG_FORMATS[f] && !presetHidden.includes(AG_FORMATS[f].preset);
  if (ok(fmt)) return fmt;
  return ['podcast', 'horizontal', 'reaccion', 'dividida', 'duo', 'llamada', 'horizontal_cam'].find(ok) || fmt;
}
function effectivePreset(p) {
  const m0 = effectivePreset0(p), ov = presetOverrides[p.name];
  if (m0.c && (!ov || !ov.c || ov.c.titleAutoHL == null)) m0.c.titleAutoHL = false;   // por defecto sin palabras en rojo (se activa en la plantilla)   // sin ajustar: lo que trae el formato
  return m0;
}
const autoHLOn = () => $('titleAutoHL').checked;
function effectivePreset0(p) {
  if (presetOverrides[p.name]) return JSON.parse(JSON.stringify(presetOverrides[p.name]));
  const base = JSON.parse(JSON.stringify(BASE_STYLE));
  const m = { ...base, ...p.s, c: { ...base.c, ...p.s.c } };
  m.pos = { tx: 0, ty: 0, sx: 0 }; m.imgOff = { x: 0, y: 0 };
  if (!m.crops) m.crops = JSON.parse(JSON.stringify(DEFAULT_CROPS));
  return m;
}
function cleanForPreset(st) {
  const m = JSON.parse(JSON.stringify(st));
  delete m.fixed; delete m.logo;   // (lo del panel se guarda aparte y se aplica después)
  delete m.music; delete m.logoPos; delete m.c.logoSize; delete m.c.logoOp; delete m.c.quality; delete m.c.fps;
  return m;
}
async function applyPreset(p) {
  const m = cleanForPreset(effectivePreset(p));
  await applyStyle(m);
  const ov = presetOverrides[p.name], fixed = !!(ov && ov.fixed);   // «fixed»: guardada desde el panel con todo colocado (vídeo, cámara y logo)
  if (p.fill && layoutMode === 'single' && !ov) setRange('zoom', fillZoom());
  if (layoutMode === 'react' && !fixed) { camDetectedFor = null; autoDetectCam(false); }
  if (fixed && ov.logo && !trk.logo.lock) { const g = ov.logo; logoPos.x = g.x; logoPos.y = g.y; $('logoSize').value = g.size; $('logoOp').value = g.op; $('logoRot').value = g.rot || 0; try { ['logoSize', 'logoOp'].forEach(id => $(id).dispatchEvent(new Event('input'))); } catch {} }
  activePreset = p.name; renderPresets(); try { stTplUI(); } catch {}
  if (!autoHLOn()) { titleHL.clear(); renderChips(); }   // esta plantilla va sin palabras destacadas
  if (loaded && titleIsDefault()) aiTitle(true);   // título automático con IA
  if (loaded && p.name === 'Podcast') faceTrack(true); else if (clipMeta.track) clipMeta.track.on = false;
  setStatus($('tplStatus'), `Plantilla «${p.name}» aplicada.` + (layoutMode === 'split' && !img ? ' Sube la imagen en Diseño.' : ''), 'ok');
  setTimeout(pushHistory, 10);
}
async function savePresetStore() {
  return saveTypeStore();   // cada tipo de proyecto guarda sus propias plantillas
}
// miniatura de un formato: bloques de color con degradado y un icono grande (persona, vídeo o «IMAGEN»), barra de título y rayitas de subtítulos
const PMX_IC = {
  per: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="22" r="12" fill="#fff"/><path d="M8 60c0-14 10.7-24 24-24s24 10 24 24z" fill="#fff"/></svg>',
  play: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="12" width="56" height="40" rx="10" fill="#fff"/><path d="M27 23v18l15-9z" fill="#5B4BFF"/></svg>',
  pic: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="10" width="52" height="44" rx="9" fill="none" stroke="#fff" stroke-width="5"/><circle cx="22" cy="25" r="5" fill="#fff"/><path d="M10 50l15-15 10 10 8-8 15 13z" fill="#fff"/></svg>'
};
const fmtLbl = n => n === 'Podcast' ? 'Primer plano' : n === 'Título y subtítulos' ? 'Horizontal' : n;
function mockFrom(st, isDefault, kind) {
  const c = st.c || {}, lay = st.layoutMode, k = String(kind || '');
  const pm = document.createElement('span'); pm.className = 'pm pmx';
  const zone = (top, h, g, html, cls) => { const z = document.createElement('span'); z.className = 'pmx-z ' + g + (cls ? ' ' + cls : ''); z.style.top = top + '%'; z.style.height = h + '%'; z.innerHTML = html; pm.append(z); };
  const imgLbl = PMX_IC.pic + '<b>Imagen</b>';
  let ty, sy;
  if (lay === 'split') {
    const r = Math.max(25, Math.min(75, +c.ratio || 55)), imgTop = st.imgPos === 'top';
    if (imgTop) { zone(0, 100 - r, 'pmx-pink', imgLbl, 'lbl'); zone(100 - r, r, 'pmx-blue', PMX_IC.per, 'pb'); }
    else { zone(0, r, 'pmx-blue', PMX_IC.per, 'pb'); zone(r, 100 - r, 'pmx-pink', imgLbl, 'lbl'); }
    ty = imgTop ? 100 - r : r; sy = imgTop ? 100 - r - 8 : r + 8;
  } else if (lay === 'react') {
    const r = Math.max(25, Math.min(75, +c.ratio || 42));
    if (c.call === true || c.call === 'true' || k === 'llamada' || k === 'Llamada') { const g3 = ['pmx-blue', 'pmx-amber', 'pmx-teal']; for (let i = 0; i < 3; i++) zone(i * 100 / 3, 100 / 3, g3[i], PMX_IC.per, 'pb'); }
    else if (c.duo || k === 'duo' || k === 'Dos personas') { zone(0, r, 'pmx-teal', PMX_IC.per, 'pb'); zone(r, 100 - r, 'pmx-amber', PMX_IC.per, 'pb'); }
    else { zone(0, r, 'pmx-amber', PMX_IC.per, 'pb'); zone(r, 100 - r, 'pmx-violet', PMX_IC.play); }
    const isCall = c.call === true || c.call === 'true' || k === 'llamada' || k === 'Llamada';
    ty = isCall ? 100 / 3 : r; sy = isCall ? 100 / 3 + 7 : (c.duo || k === 'duo' || k === 'Dos personas') ? r + 8 : 91;
  } else {
    const close = k === 'podcast' || k === 'Podcast' || +c.zoom >= 250;
    if (close) { zone(0, 100, 'pmx-teal', PMX_IC.per, 'close'); ty = 26; sy = 35; }
    else {
      const big = +c.zoom >= 150, top = big ? 20 : 26, h = big ? 60 : 48;
      zone(0, 100, 'pmx-dark', ''); zone(top, h, k === 'horizontal_cam' ? 'pmx-teal' : 'pmx-blue', PMX_IC.per, 'pb zm');
      ty = top; sy = +c.titleY >= 0 ? Math.min(92, +c.titleY + 12) : top + h + (100 - top - h) / 3;
    }
  }
  const t = document.createElement('span'); t.className = 'pmx-t'; t.textContent = 'TÍTULO'; t.style.top = ty + '%';
  const s = document.createElement('span'); s.className = 'pmx-s'; s.innerHTML = '<i></i><i></i>'; s.style.top = sy + '%';
  if (c.subsGen === false || c.subsGen === 'false') s.hidden = true;
  pm.append(t, s);
  if (isDefault) { const st2 = document.createElement('span'); st2.className = 'pm-def'; st2.textContent = '★ Al abrir'; pm.append(st2); }
  return pm;
}
function renderPresets() {
  const box = $('presetGrid'); box.innerHTML = '';
  for (const p of PRESETS) {
    const eff = effectivePreset(p);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pcard' + (activePreset === p.name ? ' on' : ''); b.dataset.n = p.name;
    const n = document.createElement('span'); n.className = 'pn'; n.textContent = fmtLbl(p.name) + (presetOverrides[p.name] ? ' ·' : '');
    if (presetOverrides[p.name]) n.title = 'Ajustada por ti';
    const d = document.createElement('span'); d.className = 'pd'; d.textContent = p.desc;
    b.append(mockFrom(eff, presetDefault === p.name, p.name), n, d);
    b.onclick = () => applyPreset(p);
    box.append(b);
  }
  const bar = $('presetBar');
  if (activePreset) {
    bar.hidden = false;
    $('presetBarName').textContent = activePreset;
    $('presetDefaultBtn').textContent = presetDefault === activePreset ? '★ Se usa al abrir (quitar)' : '☆ Usar al abrir';
    $('presetResetBtn').disabled = !presetOverrides[activePreset];
  } else bar.hidden = true;
}
$('presetSaveBtn').onclick = async () => {
  if (!activePreset) return;
  presetOverrides[activePreset] = cleanForPreset(getStyle());
  const ok = await savePresetStore(); renderPresets();
  setStatus($('tplStatus'), ok ? `«${activePreset}» guardada con tu estilo actual.` : 'No se pudo guardar en este navegador.', ok ? 'ok' : 'err');
};
$('presetDefaultBtn').onclick = async () => {
  if (!activePreset) return;
  presetDefault = presetDefault === activePreset ? null : activePreset;
  await savePresetStore(); renderPresets();
  setStatus($('tplStatus'), presetDefault ? `«${presetDefault}» se aplicará sola en cada clip nuevo de este cliente.` : 'Los clips nuevos de este cliente empezarán sin plantilla.', 'ok');
};
$('presetResetBtn').onclick = async () => {
  if (!activePreset || !presetOverrides[activePreset]) return;
  delete presetOverrides[activePreset]; await savePresetStore();
  const p = PRESETS.find(x => x.name === activePreset); if (p) await applyPreset(p);
  setStatus($('tplStatus'), `«${activePreset}» vuelve a su versión original.`, 'ok');
};
$('presetExportBtn').onclick = () => {
  const data = { app: 'clipzi', version: 1, exported: new Date().toISOString(),
    presets: PRESETS.map(p => ({ name: p.name, desc: p.desc, style: cleanForPreset(effectivePreset(p)) })),
    defaultPreset: presetDefault, userTemplates: templates };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'clipzi-plantillas.json'; document.body.append(a); a.click(); a.remove();
  setStatus($('tplStatus'), 'Archivo «clipzi-plantillas.json» descargado. Pásamelo para dejarlas fijas en el código.', 'ok');
};
async function loadPresetStore() { renderPresets(); }   // las plantillas se cargan al elegir el tipo de proyecto

/* ====== inicio: clientes (cada uno con sus propias plantillas) y sus clips ====== */
@@solo-pc
const SEED_CLIENTS = ['Pablo', 'Arz.Urus', 'WestCOL'];
@@fin
@@solo-web
const SEED_CLIENTS = ['Mi espacio'];
@@fin
let clients = [], curClient = null, curProj = null, projIndex = [];
const DROP0 = { t: $('dropTitle').textContent, i: $('dropInfo').textContent }, IMG0 = $('imgTitle').textContent;
const clientOf = id => clients.find(c => c.id === id);
async function loadClientStore(id) {
  let st = null;
  try { st = await kv.get('client:' + id); } catch {}
  if (!st) {   // cliente nuevo: empieza con las plantillas que ya tenías ajustadas
    let ov = {}, tp = {};
    try { ov = (await kv.get('presetOverrides')) || {}; tp = (await kv.get('templates')) || {}; } catch {}
    st = { overrides: ov, def: null, templates: tp };
    try { await kv.set('client:' + id, st); } catch {}
  }
  presetOverrides = st.overrides || {}; presetDefault = st.def || null; templates = st.templates || {};
  // logo de este cliente (la primera vez, el que ya tenías)
  if (st.logo === undefined) {
    let src = null, cfg = null;
    try { src = localStorage.getItem('clipzi-logo'); cfg = JSON.parse(localStorage.getItem('clipzi-logo-cfg') || 'null'); } catch {}
    st.logo = { src, cfg: cfg || { size: '18', op: '85', x: W - 170, y: 240, lock: false } };
    try { await kv.set('client:' + id, st); } catch {}
  }
  clearTimeout(persistT);
  applyLogoCfg(st.logo.cfg);
  if (st.logo.src) { if (!logo || logo.src !== st.logo.src) await setLogo(st.logo.src, false); } else if (logo) clearLogo(false);
  syncTrackUI();
  // cambio para todos los clientes: «Título y subtítulos» con zoom 130 %
  const ov = presetOverrides['Título y subtítulos'];
  if (!st.mig130) { if (ov && ov.c) ov.c.zoom = '130'; st.mig130 = true; try { await kv.set('client:' + id, { ...st, overrides: presetOverrides }); } catch {} }
  // plantillas compartidas: los clientes enlazados usan el mismo juego de plantillas
  const gid = groupOf(id);
  let g = null; try { g = await kv.get('tplg:' + gid); } catch {}
  if (!g) { g = { overrides: presetOverrides, def: presetDefault, templates }; try { await kv.set('tplg:' + gid, g); } catch {} }
  presetOverrides = g.overrides || {}; presetDefault = g.def || null; templates = g.templates || {}; presetHidden = g.hidden || []; titleTpls = g.titleTpls || {}; titleDef = g.titleDef || null; if (titleDef && TT_ALIAS[titleDef] && !titleTpls[titleDef]) titleDef = TT_ALIAS[titleDef];
  activePreset = null; renderPresets(); renderTpl(); renderStreamers();
}
let persistT = null;
const groupOf = id => { const c = clientOf(id); return (c && c.tg) || id; };
async function saveTypeStore() {
  if (!curClient) return false;
  try {
    await kv.set('tplg:' + groupOf(curClient), { overrides: presetOverrides, def: presetDefault, templates, hidden: presetHidden, titleTpls, titleDef });   // plantillas (compartidas si está enlazado)
    const old = (await kv.get('client:' + curClient)) || {};
    await kv.set('client:' + curClient, { ...old, overrides: presetOverrides, def: presetDefault, templates, mig130: true, logo: { src: logo ? logo.src : null, cfg: logoCfgNow() } });
    return true;
  } catch { return false; }
}
// enlazar las plantillas de un cliente con las de otro
async function linkClient(cl, otherId) {
  const oldG = groupOf(cl.id);
  if (!otherId) {   // deja de compartir: se queda con una copia de las plantillas actuales
    let g = null; try { g = await kv.get('tplg:' + oldG); } catch {}
    const mates = clients.filter(o => o.id !== cl.id && groupOf(o.id) === oldG);
    if (oldG === cl.id && mates.length) {   // los demás siguen compartiendo entre ellos
      const ng = mates[0].id;
      if (g) try { await kv.set('tplg:' + ng, JSON.parse(JSON.stringify(g))); } catch {}
      mates.forEach(m => m.tg = m.id === ng ? null : ng);
    }
    cl.tg = null;
    if (g) try { await kv.set('tplg:' + cl.id, JSON.parse(JSON.stringify(g))); } catch {}
  } else {
    const other = clientOf(otherId); if (!other) return;
    const target = groupOf(other.id);
    let g = null; try { g = await kv.get('tplg:' + target); } catch {}
    if (!g) { let st = null; try { st = await kv.get('client:' + other.id); } catch {} if (st) try { await kv.set('tplg:' + target, { overrides: st.overrides || {}, def: st.def || null, templates: st.templates || {} }); } catch {} }
    cl.tg = target;
  }
  await saveClients();
}
function persistClient() { clearTimeout(persistT); persistT = setTimeout(saveTypeStore, 250); }
async function saveClients() { try { await kv.set('clients', clients); } catch {} }
function resetEditor() {
  vid.pause(); stopRewind(); if (typeof isoStop === 'function') isoStop(); if (typeof stHide === 'function') stHide();
  file = null; loaded = false; vid.removeAttribute('src'); vid.load();
  captions = []; allWords = []; renderCapList();
  segs = []; texts = []; zones = []; pseg = 0; mutes = []; clipMeta = {};
  const lk = trk.logo.lock; trk = TRK0(); trk.logo.lock = lk; tsel.clear(); selected = null; hover = null;
  rxClear(); img = null; crop = null; imgOff.x = imgOff.y = 0; $('imgTitle').textContent = IMG0; ['cropBtn', 'cropReset', 'imgCenter'].forEach(id => $(id).disabled = true);
  $('title').value = DEFAULT_TITLE; titleHL.clear(); renderChips(); $('streamer').value = '';
  setStatus($('aiTitleStatus'), ''); setStatus($('camStatus'), ''); setStatus($('eStatus'), ''); $('result').innerHTML = '';
  thumbs = []; thumbsFor = null; camDetectedFor = null; restoredClipName = null; logoAuto.dy = 0; logoAuto.manual = false; lastSubBox = null;
  $('dropTitle').textContent = DROP0.t; $('dropInfo').textContent = DROP0.i; $('s1').classList.remove('done');
  ['transcribe', 'play', 'seek', 'export'].forEach(id => $(id).disabled = true);
  syncTrackUI(); fillTextPanel(); tlSig = ''; flagsMsg = null; if (typeof renderFlags === 'function') renderFlags();
}
function setCrumb() { const c = clientOf(curClient); $('crumb').textContent = c ? '› ' + c.name : ''; $('crumb').hidden = !c; }
async function newClip() {
  await loadClientStore(curClient); resetEditor();
  curProj = 'p' + Date.now().toString(36);
  const p = presetDefault && PRESETS.find(x => x.name === presetDefault);
  if (p) await applyPreset(p); else await applyStyle(JSON.parse(JSON.stringify(BASE_STYLE)));   // nada heredado de otro cliente
  hist = []; hi = -1; clearTimeout(histTimer); setTimeout(commitHistory, 50);
  hideHome(); setCrumb(); showLeft('media'); showInsp('video');
  setStatus($('tStatus'), 'Sube el clip para empezar.');
  setEasy(true); ezShow('insert');
}
async function openProject(e) {
  curClient = e.client; await loadClientStore(e.client); resetEditor(); curProj = e.id;
  let saved = null, clip = null, im = null;
  try { saved = await kv.get('proj:' + e.id); clip = await kv.get('clip:' + e.id); im = await kv.get('image:' + e.id); } catch {}
  hideHome(); setCrumb(); showLeft('media'); setEasy(true); ezShow('edit');
  try {
    if (clip) await loadFile(clip, true);
    if (im) await loadImageBlob(im, im.name, true);
    if (saved) {
      const p = JSON.parse(saved.snap);
      await applyProject(p);
      if (!clip) { restoredClipName = p.clipName; setStatus($('tStatus'), `El clip pesaba demasiado para guardarlo: vuelve a subir «${p.clipName || 'el clip'}».`, 'err'); }
      hist = [saved.snap]; hi = 0; updUndo();
    }
    activePreset = null; renderPresets();
    if (!loaded) ezShow('insert');
    else if (ezPref('quickEd') !== '0') stQuickOpen(false);
  } catch (err) { console.error(err); toast('No se pudo abrir el clip'); }
}
async function saveIndex() { try { await kv.set('projects', projIndex); } catch {} }
function projThumb() {
  if (!loaded) return null;
  try { const c = document.createElement('canvas'); c.width = 108; c.height = 192; c.getContext('2d').drawImage(cv, 0, 0, 108, 192); return c.toDataURL('image/jpeg', 0.6); } catch { return null; }
}
async function upsertProject() {
  if (!curProj || curProj === 'tplsample' || !curClient || !(file || captions.length)) return;
  const t = $('title').value.trim();
  const e = projIndex.find(x => x.id === curProj) || { id: curProj, client: curClient };
  e.name = t && t !== DEFAULT_TITLE ? t : (file ? file.name.replace(/\.[^.]+$/, '') : 'Clip sin nombre');
  e.time = Date.now(); e.client = curClient; const th = projThumb(); if (th) e.thumb = th;
  projIndex = [e, ...projIndex.filter(x => x.id !== e.id)];
  // como mucho 30 clips guardados por cliente (los más viejos se borran)
  const mine = projIndex.filter(x => x.client === curClient);
  for (const old of mine.slice(30)) { projIndex = projIndex.filter(x => x !== old); await delProjectData(old.id); }
  await saveIndex();
}
async function delProjectData(id) { for (const k of ['proj:', 'clip:', 'image:']) try { await kv.del(k + id); } catch {} }
async function saveNow() {
@@solo-web
  try { webState(); } catch {}
@@fin
  if (histTimer) { clearTimeout(histTimer); commitHistory(); }
  clearTimeout(saveTimer);
  if (!curProj || curProj === 'tplsample') return;
  const snap = hist[hi] || JSON.stringify(getProject());
  try { await kv.set('proj:' + curProj, { snap, time: Date.now() }); } catch {}
  await upsertProject();
}
function hideHome() { $('home').hidden = true; }
async function goHome() {
  if (exporting) { toast('Espera a que termine la exportación'); return; }
  if (typeof tplEditing !== 'undefined' && tplEditing) { tplEditing = null; $('tplBar').hidden = true; document.body.classList.remove('tpl-edit'); curProj = null; }
  $('app').classList.remove('review'); $('revBack').hidden = true; reviewBatch = null;
  await saveNow(); vid.pause(); ezLeave(); $('livePage').hidden = true; $('liveBack').hidden = true;
  renderHome(); $('home').hidden = false;
}
const twoStep = (btn, msg, fn) => { let armed = false; btn.onclick = async ev => { ev.stopPropagation(); if (!armed) { armed = true; btn.classList.add('off'); toast(msg); setTimeout(() => { armed = false; btn.classList.remove('off'); }, 3000); return; } await fn(); }; };
const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const PEN = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>';
// ---------- menú lateral y secciones del inicio ----------
let homeSec = 'inicio', homeSecFor = null;
const HSECS = [
  ['inicio', 'Inicio', '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ['plantillas', 'Plantillas', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
@@solo-pc
  ['agente', 'Agente de clips', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/>'],
  ['viral', 'Qué peta', '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'],
  ['directo', 'En directo', '<circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>']
@@fin
@@solo-web
  ['viral', 'Qué hace viral un clip', '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'],
  ['agente', 'Clips de un vídeo largo', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/>'],
  ['directo', 'Clips en directo', '<circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>']
@@fin
];
const hIcon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
@@solo-web
document.addEventListener('click', e => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); setHomeSec(a.dataset.go); } });
@@fin
function setHomeSec(k) {
  homeSec = k;
  document.querySelectorAll('#homeClient .hsec').forEach(el => el.hidden = el.dataset.sec !== k);
  const it = HSECS.find(x => x[0] === k); $('hSecName').textContent = it ? it[1] : '';
  document.querySelectorAll('#hnav .hi[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === k));
  $('home').scrollTop = 0;
}
function renderHnav(c) {
  const n = $('hnav'); n.innerHTML = '';
  const brand = document.createElement('button'); brand.className = 'hb'; brand.innerHTML = '<i><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></i>Cortex';
@@solo-pc
  brand.onclick = () => { curClient = null; renderHome(); }; n.append(brand);
@@fin
@@solo-web
  brand.onclick = () => setHomeSec('inicio'); n.append(brand);
@@fin
  const item = (label, icon, on, fn, sec) => { const b = document.createElement('button'); b.className = 'hi' + (on ? ' on' : ''); b.innerHTML = hIcon(icon) + '<span></span>'; b.lastChild.textContent = label; if (sec) b.dataset.sec = sec; b.onclick = fn; n.append(b); return b; };
  const lbl = t => { const d = document.createElement('div'); d.className = 'hlbl'; d.textContent = t; n.append(d); };
  if (c) {
@@solo-web
    for (const [k, l, ic] of HSECS) { const b = item(l, ic, homeSec === k, () => setHomeSec(k), k); if (k === 'agente' || k === 'directo') { const t = document.createElement('em'); t.className = 'hpro'; t.textContent = 'Pronto'; b.append(t); } }
  } else if (false) {
@@fin
    const cl = document.createElement('div'); cl.className = 'hcl'; cl.innerHTML = '<b></b><span></span>'; cl.firstChild.textContent = c.name.slice(0, 1).toUpperCase(); cl.lastChild.textContent = c.name; n.append(cl);
    for (const [k, l, ic] of HSECS) item(l, ic, homeSec === k, () => setHomeSec(k), k);
    lbl('Clientes');
    for (const o of clients.filter(o => o.id !== c.id).slice(0, 8)) item(o.name, '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', false, () => { curClient = o.id; renderHome(); });
    item('Todos los clientes', '<path d="M15 18l-6-6 6-6"/>', false, () => { curClient = null; renderHome(); });
  } else {
    item('Clientes', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', true, () => {});
    lbl('Tus clientes');
    for (const o of clients) item(o.name, '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>', false, () => { curClient = o.id; renderHome(); });
  }
  const sp = document.createElement('div'); sp.className = 'hsp'; n.append(sp);
@@solo-pc
  if (!(window.cortexApp && window.cortexApp.isApp)) item('Pasar mis datos a la app', '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', false, cxToApp);
@@fin
  item('Reacciones', '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M10 15.5l4 1.5-4 1.5z"/>', false, () => { $('rxBk').hidden = false; rxRender(); });
  item('Notas', '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>', false, notesOpen);
  item('Limpiar CapCut', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>', false, ccCleanOpen);
@@solo-pc
  const f = document.createElement('div'); f.className = 'hfoot'; f.textContent = 'Todo se guarda en este ordenador'; n.append(f);
@@fin
@@solo-web
  const f = document.createElement('div'); f.className = 'hfoot'; f.innerHTML = 'Versión de prueba' + (window.__cxMe ? ` · ${String(window.__cxMe).replace(/[<>&]/g, '')} · <a href="/salir" style="color:inherit">Salir</a>` : ''); n.append(f);
@@fin
}
// lo que más rinde de cada creador (datos reales del análisis de clips virales)
@@solo-web
const QUE_PETA_GEN = [['Acción / sustos', 2.8, '#FB923C'], ['Revelación', 1.5, '#A78BFA'], ['Polémica', 1.46, '#F87171'], ['Invitados', 1.36, '#60A5FA'], ['Humor de relleno', 0.89, '#FACC15'], ['Juego / fútbol', 0.85, '#9CA3AF']];
@@fin
const QUE_PETA = { westcol: [['Acción / robot', 2.8, '#FB923C'], ['Revelación', 1.5, '#A78BFA'], ['Polémica', 1.46, '#F87171'], ['Invitados', 1.36, '#60A5FA'], ['Pareja', 0.96, '#F472B6'], ['Juego / fútbol', 0.85, '#9CA3AF']] };
function renderBento(c) {
  const b = $('hBento'); b.innerHTML = '';
  const mine = projIndex.filter(x => x.client === c.id && !x.batch), week = mine.filter(x => Date.now() - x.time < 7 * 864e5).length;
  const ag = projIndex.filter(x => x.client === c.id && x.batch), agOk = ag.filter(x => x.status === 'approved').length;
  const hero = document.createElement('section'); hero.className = 'hero';
@@solo-pc
  hero.innerHTML = `<div><span class="k">EDITOR CON IA</span><h2>Sube tu clip.<br><span>Sale listo para petar.</span></h2></div>
    <div style="display:grid;gap:10px"><div class="hin"><input type="url" id="hUrl" placeholder="Pega un enlace de Kick, Twitch, YouTube o TikTok…" aria-label="Enlace del clip"><button class="primary" id="hGo">Hacer clip</button></div>
    <span class="hint">o <a href="#" id="hFile" style="color:#fff">sube un archivo</a> · MP4 o MOV</span><input type="file" id="hFileIn" accept="video/*" hidden></div>`;
@@fin
@@solo-web
  hero.innerHTML = `<div><span class="k">EDITOR CON IA</span><h2>Sube tu clip.<br><span>Sale listo para petar.</span></h2><p class="hint" style="margin-top:10px;font-size:15px">Lo pone en vertical, le escribe el título que engancha y le añade subtítulos. Tú solo lo revisas.</p></div>
    <div style="display:grid;gap:10px"><div class="hin hdrop" id="hDrop"><span class="hint" style="flex:1;padding:12px">Arrastra aquí tu clip ya cortado</span><button class="primary" id="hFile">Subir clip</button></div>
    <div class="hin"><input type="url" id="hUrl" placeholder="…o pega el enlace de un clip de Kick, Twitch, YouTube o TikTok" aria-label="Enlace del clip"><button class="primary" id="hGo">Usar enlace</button></div>
    <span class="hint">MP4 o MOV · hasta 3 minutos · tus clips exportados se guardan en tu cuenta</span><input type="file" id="hFileIn" accept="video/*" hidden></div>`;
@@fin
  const st1 = document.createElement('section');
  st1.innerHTML = `<span class="lb">Clips hechos</span><span class="big">${mine.length}</span><span class="${week ? 'up' : 'hint'}">${week ? '+' + week + ' esta semana' : 'Ninguno esta semana'}</span>`;
  const st2 = document.createElement('section');
@@solo-pc
  st2.innerHTML = `<span class="lb">Clips del agente</span><span class="big">${agOk}<small> / ${ag.length}</small></span><span class="hint">aprobados</span>`;
@@fin
@@solo-web
  st2.innerHTML = `<span class="lb">Clips de un vídeo largo</span><span class="big" style="font-size:24px">Próximamente</span><button id="hToAg" style="align-self:flex-start;padding:6px 12px;font-size:13px">Ver cómo será</button>`;
@@fin
  const qp = document.createElement('section'); qp.className = 'wide';
@@solo-pc
  const data = QUE_PETA[(c.name || '').toLowerCase().replace(/[^a-z]/g, '')];
@@fin
@@solo-web
  const data = QUE_PETA_GEN;
@@fin
  if (data) {
    const mx = Math.max(...data.map(d => d[1]));
@@solo-pc
    qp.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><strong style="font-size:14px">Qué peta de ${c.name}</strong><span class="hint" style="font-size:11px">rinde frente a un clip normal</span></div>` +
@@fin
@@solo-web
    qp.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><strong style="font-size:14px">Qué hace petar un clip</strong><span class="hint" style="font-size:11px">3.714 clips virales analizados</span></div>` +
@@fin
      data.map(([n, v, col]) => `<div class="qp"><span>${n}</span><i><b style="width:${Math.round(v / mx * 100)}%;background:${col}"></b></i><span style="color:${col}">×${String(v).replace('.', ',')}</span></div>`).join('');
  } else {
    qp.innerHTML = `<strong style="font-size:14px">Qué peta de ${c.name}</strong><span class="hint">Analiza los clips virales de este creador para saber qué temas funcionan mejor.</span><button id="hToViral" style="justify-self:start;align-self:flex-start">Ir a «Qué peta»</button>`;
  }
  b.append(hero, st1, st2, qp);
@@solo-pc
  const go = async () => { const v = $('hUrl').value.trim(); await newClip(); if (v) { $('ezLinkUrl').value = v; $('ezLinkGo').click(); } };
  $('hGo').onclick = go; $('hUrl').onkeydown = ev => { if (ev.key === 'Enter') go(); };
@@fin
@@solo-web
  $('hToAg').onclick = () => setHomeSec('agente');
  const goUrl = async () => { const v = $('hUrl').value.trim(); if (!/^https?:\/\/\S+\.\S+/.test(v)) { toast('Pega el enlace del clip'); $('hUrl').focus(); return; } await newClip(); $('ezLinkUrl').value = v; $('ezLinkGo').click(); };
  $('hGo').onclick = goUrl; $('hUrl').onkeydown = ev => { if (ev.key === 'Enter') goUrl(); };
@@fin
  $('hFile').onclick = ev => { ev.preventDefault(); $('hFileIn').click(); };
@@solo-web
  const hd = $('hDrop'); hd.ondragover = ev => { ev.preventDefault(); hd.classList.add('over'); }; hd.ondragleave = () => hd.classList.remove('over');
  hd.ondrop = ev => { ev.preventDefault(); hd.classList.remove('over'); const f = [...ev.dataTransfer.files][0]; if (f) useFile(f); };
  const useFile = async f => { await newClip();
    try { const dt = new DataTransfer(); dt.items.add(f); $('ezFile').files = dt.files; $('ezFile').dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { console.warn(e); toast('Pulsa «Insertar clip» para elegirlo'); } };
@@fin
  $('hFileIn').onchange = async () => { const f = $('hFileIn').files[0]; if (!f) return; await newClip();
    try { const dt = new DataTransfer(); dt.items.add(f); $('ezFile').files = dt.files; $('ezFile').dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { console.warn(e); toast('Pulsa «Insertar clip» para elegirlo'); } };
  if ($('hToViral')) $('hToViral').onclick = () => setHomeSec('viral');
}
function renderHome() {
@@solo-web
  if (!clientOf(curClient) && clients[0]) curClient = clients[0].id;
@@fin
  const c = clientOf(curClient);
  $('homeClients').hidden = !!c; $('homeClient').hidden = !c;
  if (c && homeSecFor !== c.id) { homeSecFor = c.id; homeSec = 'inicio'; }
  renderHnav(c);
  if (!c) {
    const g = $('clientGrid'); g.innerHTML = '';
    for (const cl of clients) {
      const clips = projIndex.filter(x => x.client === cl.id && (!x.batch || x.status === 'approved'));
      const card = document.createElement('div'); card.className = 'ccard'; card.tabIndex = 0;
      const av = document.createElement('div'); av.className = 'cav';
      const th = clips.find(x => x.thumb);
      if (th) { const im = document.createElement('img'); im.src = th.thumb; im.alt = ''; av.append(im); } else av.textContent = cl.name.slice(0, 1).toUpperCase();
      const n = document.createElement('strong'); n.textContent = cl.name;
      const m = document.createElement('span'); m.className = 'hint';
      m.textContent = clips.length ? `${clips.length} clip${clips.length > 1 ? 's' : ''} · ${new Date(clips[0].time).toLocaleDateString('es-ES')}` : 'Sin clips todavía';
      const mates = clients.filter(o => o.id !== cl.id && groupOf(o.id) === groupOf(cl.id));
      if (mates.length) m.textContent += ` · 🔗 plantillas con ${mates.map(x => x.name).join(', ')}`;
      const ren = document.createElement('button'); ren.className = 'ib cren'; ren.title = 'Cambiar nombre'; ren.innerHTML = PEN;
      ren.onclick = async ev => { ev.stopPropagation(); const nn = prompt('Nuevo nombre del cliente', cl.name); if (nn && nn.trim()) { cl.name = nn.trim(); await saveClients(); renderHome(); } };
      const del = document.createElement('button'); del.className = 'ib cdel'; del.title = 'Borrar cliente y sus clips'; del.innerHTML = TRASH;
      twoStep(del, `Pulsa otra vez para borrar «${cl.name}» y sus clips`, async () => {
        for (const x of clips) await delProjectData(x.id);
        projIndex = projIndex.filter(x => x.client !== cl.id); clients = clients.filter(x => x !== cl);
        try { await kv.del('client:' + cl.id); } catch {}
        await saveIndex(); await saveClients(); renderHome();
      });
      const open = () => { curClient = cl.id; renderHome(); };
      card.onclick = open; card.onkeydown = ev => { if (ev.key === 'Enter') open(); };
      card.append(av, n, m, ren, del); g.append(card);
    }
    const add = document.createElement('div'); add.className = 'ccard cadd';
    add.innerHTML = '<span class="cav">+</span><input type="text" id="newClientName" placeholder="Nuevo cliente" aria-label="Nombre del nuevo cliente"><button class="primary" id="newClientBtn">Crear</button>';
    g.append(add);
    const create = async () => { const v = $('newClientName').value.trim(); if (!v) { $('newClientName').focus(); return; }
      clients.push({ id: 'c' + Date.now().toString(36), name: v, created: Date.now() }); await saveClients(); renderHome(); };
    $('newClientBtn').onclick = create; $('newClientName').onkeydown = ev => { if (ev.key === 'Enter') create(); };
    return;
  }
  $('clientName').textContent = c.name;
  setHomeSec(homeSec); renderBento(c);
  tplRender();
  // con quién comparte plantillas
  const sel = $('linkSel'); sel.innerHTML = '<option value="">Nadie (plantillas solo de este cliente)</option>';
  for (const o of clients) if (o.id !== c.id) { const op = document.createElement('option'); op.value = o.id; op.textContent = o.name; sel.append(op); }
  const mates = clients.filter(o => o.id !== c.id && groupOf(o.id) === groupOf(c.id));
  sel.value = mates[0] ? mates[0].id : '';
  $('linkHint').textContent = mates.length ? `Los cambios en las plantillas de ${c.name} también se aplican en ${mates.map(m => m.name).join(', ')}, y al revés.` : 'Las plantillas que guardes aquí dentro son solo de este cliente.';
  sel.onchange = async () => { await linkClient(c, sel.value || null); toast(sel.value ? 'Plantillas compartidas' : 'Plantillas separadas'); renderHome(); };
  const r = $('recents'); r.innerHTML = '';
  const nb = document.createElement('button'); nb.className = 'rcard rnew'; nb.innerHTML = '<span class="rthumb">+</span><strong>Nuevo clip</strong>';
  nb.onclick = newClip; r.append(nb);
  renderAgentBox(c); renderLiveBox(c); renderViral(c);
  for (const e of projIndex.filter(x => x.client === c.id && !x.batch)) {
    const card = document.createElement('div'); card.className = 'rcard';
    const open = document.createElement('button'); open.className = 'rthumb'; open.title = 'Abrir';
    if (e.thumb) { const im = document.createElement('img'); im.src = e.thumb; im.alt = ''; open.append(im); } else open.textContent = '🎬';
    open.onclick = () => openProject(e);
    const info = document.createElement('div'); info.className = 'rinfo';
    const n = document.createElement('strong'); n.textContent = e.name; n.title = e.name;
    const m = document.createElement('span'); m.className = 'hint'; m.textContent = new Date(e.time).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    const del = document.createElement('button'); del.className = 'ib rdel'; del.title = 'Borrar clip'; del.innerHTML = TRASH;
    twoStep(del, 'Pulsa otra vez la papelera para borrarlo', async () => { projIndex = projIndex.filter(x => x.id !== e.id); await delProjectData(e.id); await saveIndex(); renderHome(); });
    info.append(n, m); card.append(open, info, del); r.append(card);
  }
}
$('backClients').onclick = () => { curClient = null; renderHome(); };
async function initProjects() {
  try { clients = (await kv.get('clients')) || null; } catch { clients = null; }
  if (!clients) { clients = SEED_CLIENTS.map((name, i) => ({ id: 'c' + (Date.now() + i).toString(36), name, created: Date.now() })); await saveClients(); }
  try { projIndex = (await kv.get('projects')) || []; } catch { projIndex = []; }
  // Pablo y Arz.Urus comparten plantillas (lo que cambies en uno vale para el otro)
  try {
    if (!(await kv.get('mig-link-pablo-arz'))) {
      const pa = clients.find(c => c.name.toLowerCase() === 'pablo'), az = clients.find(c => c.name.toLowerCase().replace(/[^a-z]/g, '') === 'arzurus');
      if (pa && az) await linkClient(az, pa.id);
      await kv.set('mig-link-pablo-arz', 1);
    }
  } catch (e) { console.warn(e); }
  // clips de versiones anteriores: van al primer cliente
  try {
    const saved = await kv.get('project');
    if (saved && saved.snap) {
      const clip = await kv.get('clip'), im = await kv.get('image'), p = JSON.parse(saved.snap), id = 'p' + Date.now().toString(36);
      await kv.set('proj:' + id, saved); if (clip) await kv.set('clip:' + id, clip); if (im) await kv.set('image:' + id, im);
      projIndex.unshift({ id, time: saved.time || Date.now(), name: (p.title && p.title.trim()) || p.clipName || 'Clip anterior' });
      for (const k of ['project', 'clip', 'image']) await kv.del(k).catch(() => {});
    }
  } catch (e) { console.warn(e); }
  for (const e of projIndex) if (!clientOf(e.client)) e.client = clients[0] && clients[0].id;
  await saveIndex();
  await loadBatches();
@@solo-pc
  curClient = null; renderHome(); $('home').hidden = false;
@@fin
@@solo-web
  curClient = clients[0] && clients[0].id; renderHome(); $('home').hidden = false;
@@fin
}
$('brandHome').onclick = goHome;
$('homeBtn').onclick = goHome;



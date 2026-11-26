/* ---------- plantillas de título: solo el diseño del título (letra, tamaño, caja, colores), aparte de las plantillas de formato ----------
   Cada creador tiene las suyas y una «fija», que se pone sola en cada clip nuevo. */
// estilos de subtítulos listos para usar
const SUB_BUILTIN = {
  'Blanco con sombra': { subFont: 'Montserrat|900', subSize: '72', subColor: '#ffffff', upper: false, hl: false, pop: true, strokeOn: false, shOp: '85', shBlur: '18' },
  'Palabra en amarillo': { subFont: 'Montserrat|900', subSize: '74', subColor: '#ffffff', upper: false, hl: true, hlColor: '#ffe600', pop: true, strokeOn: false, shOp: '85', shBlur: '18' },
  'Palabra en verde': { subFont: 'Montserrat|900', subSize: '74', subColor: '#ffffff', upper: false, hl: true, hlColor: '#4ade80', pop: true, strokeOn: false, shOp: '85', shBlur: '18' },
  'MAYÚSCULAS con borde': { subFont: 'Montserrat|900', subSize: '70', subColor: '#ffffff', upper: true, hl: false, pop: true, strokeOn: true, strokeC: '#000000', strokeW: '12', shOp: '0', shBlur: '0' },
  'Pequeño y limpio': { subFont: 'Inter|800', subSize: '56', subColor: '#ffffff', upper: false, hl: false, pop: false, strokeOn: false, shOp: '70', shBlur: '14' },
};
// plantillas elegidas solo para el clip que se va a editar (no cambian las de por defecto)
let ezClip = { f: '', t: '', s: '' };
function ttPv(tp, txt) {   // muestra de un diseño de título
  const pv = document.createElement('span'); pv.className = 'pv'; const t = document.createElement('span');
  const k = tp.c || {}, [fam, wt] = (k.titleFont || 'Inter|800').split('|');
  t.textContent = k.titleUpper ? (txt || 'TÍTULO').toUpperCase() : (txt || 'Título');
  t.style.fontFamily = `"${fam}", system-ui, sans-serif`; t.style.fontWeight = wt || 800; t.style.fontSize = Math.max(11, Math.min(17, (+k.titleSize || 54) / 3.6)) + 'px';
  if (tp.titleStyle === 'box') { t.style.background = k.boxColor || '#fff'; t.style.color = k.boxText || '#111'; t.style.padding = '3px 8px'; t.style.borderRadius = Math.min(8, (+k.boxR || 20) / 3) + 'px'; }
  else { t.style.color = k.titleColor || '#fff'; t.style.textShadow = '0 1px 4px rgba(0,0,0,.7)'; }
  pv.append(t); return pv;
}
function subPv(k) {   // muestra de un estilo de subtítulos (con la palabra que suena resaltada)
  const pv = document.createElement('span'); pv.className = 'pv'; const t = document.createElement('span'), [fam, wt] = (k.subFont || 'Montserrat|900').split('|');
  t.style.fontFamily = `"${fam}", system-ui, sans-serif`; t.style.fontWeight = wt || 900; t.style.fontSize = Math.max(11, Math.min(16, (+k.subSize || 72) / 5)) + 'px'; t.style.color = k.subColor || '#fff';
  t.style.textShadow = +k.shOp ? '0 1px 5px rgba(0,0,0,.9)' : 'none'; if (k.strokeOn) t.style.webkitTextStroke = '1px ' + (k.strokeC || '#000');
  const w = ['no', 'me', 'lo', 'creo'].map(x => k.upper ? x.toUpperCase() : x);
  t.innerHTML = w.map((x, i) => i === 2 && k.hl ? `<b style="color:${k.hlColor || '#ffe600'}">${x}</b>` : x).join(' ');
  pv.append(t); return pv;
}
function ezPick(box, opts, cur, onPick) {
  box.innerHTML = '';
  for (const o of opts) {
    const b = document.createElement('button'); b.type = 'button'; b.className = o.v === cur ? 'on' : '';
    b.append(o.el); const n = document.createElement('span'); n.textContent = o.label; b.append(n);
    b.onclick = () => { onPick(o.v); for (const x of box.children) x.classList.toggle('on', x === b); };
    box.append(b);
  }
}
function ezTplUI() {
  const F = $('ezTplF'), T = $('ezTplT'), S = $('ezTplS'); if (!F) return;
  const none = txt => { const e = document.createElement('span'); e.className = 'pv none'; e.textContent = txt; return e; };
  const fa = $('ezFmtAuto'), curF = ezClip.f || (!fa.checked && ezFmtSel ? 'f:' + ezFmtSel : '');
  ezPick(F, [{ v: '', label: fa.checked ? 'La que elija la IA' : 'La de arriba', el: none('✨') },
    ...EZ_FMTS.map(([id, ic, n]) => ({ v: 'f:' + id, label: n, el: mockFrom(fmtStyle(id), false, id) })),
    ...Object.keys(templates || {}).map(n => ({ v: 't:' + n, label: '⭐ ' + n, el: mockFrom(templates[n], false) }))],
    curF, v => { ezClip.f = v; if (v.startsWith('f:')) { fa.checked = false; ezFmtSel = v.slice(2); } else if (!v) fa.checked = ezPref('fmtAuto') !== '0'; ezOptsUI(); });
  const tnames = [...Object.keys(titleTpls), ...Object.keys(TT_BUILTIN).filter(n => !titleTpls[n])];
  ezPick(T, [{ v: '', label: 'La fija del streamer', el: titleDef && ttGet(titleDef) ? ttPv(ttGet(titleDef)) : none('★') }, ...tnames.map(n => ({ v: n, label: n, el: ttPv(ttGet(n)) }))], ezClip.t, v => { ezClip.t = v; });
  ezPick(S, [{ v: '', label: 'Los del formato', el: none('Aa') }, ...Object.keys(SUB_BUILTIN).map(n => ({ v: n, label: n, el: subPv(SUB_BUILTIN[n]) })), { v: 'no', label: 'Sin subtítulos', el: none('🚫') }], ezClip.s, v => { ezClip.s = v; });
}
// se aplican al terminar de editar el clip (después de lo que haga la IA)
async function ezClipApply() {
  const c = ezClip; let ch = false;
  if (c.f.startsWith('t:') && templates[c.f.slice(2)]) { await applyStyle(JSON.parse(JSON.stringify(templates[c.f.slice(2)]))); ch = true; }
  if (c.t && ttGet(c.t)) { await ttApply(c.t, true); ch = true; }
  if (c.s && SUB_BUILTIN[c.s]) { const st = getStyle(); st.c = { ...st.c, ...SUB_BUILTIN[c.s] }; await applyStyle(st); ch = true; }
  if (c.s === 'no') { clipMeta.noSubs = true; try { trk.caps.hide = true; syncTrackUI(); } catch {} ch = true; }
  if (ch) pushHistory();
}
const TT_BUILTIN = {
  'Caja blanca': { titleStyle: 'box', boxMode: 'single', c: { titleFont: 'TikTok Sans|800', titleSize: '54', titleUpper: false, boxColor: '#ffffff', boxText: '#111111', boxR: '22', boxPX: '34', boxPY: '20' } },
  'Caja negra': { titleStyle: 'box', boxMode: 'single', c: { titleFont: 'TikTok Sans|800', titleSize: '54', titleUpper: false, boxColor: '#0b0b0b', boxText: '#ffffff', boxR: '22', boxPX: '34', boxPY: '20' } },
  'Caja amarilla': { titleStyle: 'box', boxMode: 'single', c: { titleFont: 'Montserrat|800', titleSize: '52', titleUpper: false, boxColor: '#ffe600', boxText: '#111111', boxR: '14', boxPX: '30', boxPY: '18' } },
  'Blanco clásico': { titleStyle: 'plain', boxMode: 'single', c: { titleFont: 'Inter|700', titleSize: '56', titleUpper: false, titleColor: '#ffffff' } },
  'Amarillo': { titleStyle: 'plain', boxMode: 'single', c: { titleFont: 'Montserrat|800', titleSize: '58', titleUpper: true, titleColor: '#ffe600' } },
  'Coolvetica': { titleStyle: 'plain', boxMode: 'single', c: { titleFont: 'Coolvetica|400', titleSize: '66', titleUpper: false, titleColor: '#ffffff' } },
  'TikTok': { titleStyle: 'box', boxMode: 'single', c: { titleFont: 'Anton|400', titleSize: '58', titleUpper: true, boxColor: '#e4e4e4', boxText: '#111111', boxR: '10', boxPX: '26', boxPY: '14' } },
  'Impacto': { titleStyle: 'plain', boxMode: 'single', c: { titleFont: 'Anton|400', titleSize: '64', titleUpper: true, titleColor: '#ffffff' } },
  'Caja mayúsculas': { titleStyle: 'box', boxMode: 'single', c: { titleFont: 'Montserrat|800', titleSize: '56', titleUpper: true, titleHl: '#ff1f1f', titleLH: '112', boxR: '18', boxPX: '28', boxPY: '14', boxColor: '#ffffff', boxText: '#111111' } },
};
// nombres de antes (para quien ya tenía una fija)
const TT_ALIAS = { 'MAYÚSCULAS amarillo': 'Amarillo', 'Coolvetica grande': 'Coolvetica', 'TikTok TALLHAUS': 'TikTok', 'TALLHAUS blanco': 'Impacto', 'Del formato «Podcast»': 'Caja mayúsculas', 'Del formato «Reacción»': 'Caja mayúsculas',
  'Del formato «Título y subtítulos»': 'Blanco clásico', 'Del formato «Pantalla dividida»': 'Caja blanca', 'Del formato «Dos personas»': 'Caja blanca' };
// parecido a simple vista: mismo tipo, letra, mayúsculas y colores (el tamaño o los márgenes no cuentan)
const ttLook = tp => { const c = (tp && tp.c) || {}, box = tp && tp.titleStyle === 'box'; return [box ? 'box' : 'plain', String(c.titleFont || '').split('|')[0], !!c.titleUpper && c.titleUpper !== 'false', String(box ? c.boxText || '#111111' : c.titleColor || '#ffffff').toLowerCase(), box ? String(c.boxColor || '#ffffff').toLowerCase() : '', +c.tStrokeW > 0 ? c.tStrokeC : ''].join('|'); };
const ttGet = n => titleTpls[n] || TT_BUILTIN[n] || (TT_ALIAS[n] && TT_BUILTIN[TT_ALIAS[n]]) || null;
async function ttApply(n, quiet) {
  const tp = ttGet(n); if (!tp || !loaded) return false;
  await applyStyle(mergeTitle(getStyle(), JSON.parse(JSON.stringify(tp))));
  if (!quiet) pushHistory();
  return true;
}
// al elegir una, se pone en este clip y queda fija para los clips nuevos de este creador
async function ttPick(n) {
  if (!(await ttApply(n))) return;
  titleDef = n; await saveTypeStore();
  const c = clientOf(curClient); toast(`Título «${n}» puesto y fijo para los clips nuevos`);
}
// en cada clip nuevo: el título fijo del creador (si tiene)
async function ttApplyDef() { if (titleDef && ttGet(titleDef)) { try { await ttApply(titleDef, true); } catch (e) { console.warn('título', e); } } }
async function ttSave() {
  const n = (prompt('Nombre para esta plantilla de título (se guarda el diseño que tiene ahora: letra, tamaño, caja y colores):', '') || '').trim();
  if (!n) return;
  titleTpls[n] = titlePart(getStyle()); titleDef = n; await saveTypeStore();
  const c = clientOf(curClient); toast(`Plantilla de título «${n}» guardada y fija para los clips nuevos`);
}
// en la página de Plantillas: verlas todas y elegir la fija de este creador sin abrir un clip
async function ttRender() {
  const box = $('ttGrid'); if (!box) return;
  const c = clientOf(curClient); $('ttWho').textContent = '';
  box.innerHTML = '';
  const names = [...Object.keys(titleTpls), ...Object.keys(TT_BUILTIN).filter(n => !titleTpls[n])];
  const card = (n, tp) => {
    const b = document.createElement('div'); b.className = 'tt-card' + ((n === null ? !titleDef : titleDef === n) ? ' on' : ''); b.tabIndex = 0;
    const pv = document.createElement('div'); pv.className = 'tt-pv'; const t = document.createElement('span');
    if (tp) {
      const k = tp.c || {}; t.textContent = 'Título del clip';
      ttcStyle(t, tp, Math.max(13, Math.min(22, (+k.titleSize || 54) / 3)) / (+k.titleSize || 54)); t.style.whiteSpace = 'nowrap'; t.style.maxWidth = '92%'; t.style.display = 'inline-block';
      if (tp.titleStyle === 'box') { t.style.padding = '4px 10px'; t.style.borderRadius = Math.min(10, (+k.boxR || 20) / 3) + 'px'; }
    } else { t.textContent = 'El de cada formato'; t.style.fontSize = '13px'; t.style.opacity = '.8'; }
    pv.append(t);
    const nm = document.createElement('div'); nm.className = 'tt-n'; nm.textContent = n === null ? 'Sin título fijo' : n;
    b.append(pv, nm);
    if (b.classList.contains('on')) { const f = document.createElement('div'); f.className = 'tt-fix'; f.textContent = n === null ? '✓ En uso' : '✓ Fija para este creador'; b.append(f); }
    if (n !== null && typeof n === 'string' && !n.startsWith('\u0000') && tp) {
      const ed = document.createElement('button'); ed.className = 'tt-ed'; ed.textContent = '✏️'; ed.title = titleTpls[n] ? 'Editar esta plantilla' : 'Hacer una copia tuya y editarla';
      ed.onclick = e => { e.stopPropagation(); ttcOpen(titleTpls[n] ? n : null, tp, titleTpls[n] ? n : n + ' (mía)'); }; b.append(ed);
    }
    if (n !== null && titleTpls[n]) {
      const d = document.createElement('button'); d.className = 'tt-del'; d.textContent = '🗑'; d.title = 'Borrar esta plantilla de título';
      d.onclick = async e => { e.stopPropagation(); if (!confirm(`¿Borrar la plantilla de título «${n}»?`)) return; delete titleTpls[n]; if (titleDef === n) titleDef = null; await saveTypeStore(); ttRender(); };
      b.append(d);
    }
    b.onclick = async () => { titleDef = n; await saveTypeStore(); ttRender(); toast(n === null ? 'Cada formato vuelve a usar su propio título' : `Título «${n}» fijo` + (c ? ` para ${c.name}` : '')); };
    box.append(b);
  };
  for (const n of names) card(n, ttGet(n));
  card(null, null);
  // los títulos que ya has diseñado dentro de tus plantillas de formato (de este creador y de los demás)
  const my = ++ttRenderN, sig = ttLook;   // se comparan a simple vista: si se ve igual que otra, no se repite
  const seen = new Set(names.map(n => sig(ttGet(n)))), found = [], used = new Set(names);
  const add = (name, st) => { if (!st || !st.c) return; const tp = st.c && st.titleStyle !== undefined && !st.layoutMode && !st.crops ? st : titlePart(st), g = sig(tp); if (seen.has(g)) return; seen.add(g); let k = ttShortName(tp, used); used.add(k); found.push([k, tp]); };
  const me = c ? c.name : '';
  for (const p of PRESETS) if (presetOverrides[p.name]) add(me ? `${p.name} · ${me}` : p.name, presetOverrides[p.name]);
  for (const n of Object.keys(templates)) add(me ? `${n} · ${me}` : n, templates[n]);
  for (const o of clients) {
    if (!c || o.id === c.id || groupOf(o.id) === groupOf(c.id)) continue;
    let st; try { st = await tplStoreOf(o.id); } catch { continue; }
    if (my !== ttRenderN) return;
    for (const n of Object.keys(st.titleTpls || {})) if (!ttGet(n)) { const g = sig(st.titleTpls[n]); if (!seen.has(g)) { seen.add(g); const k = used.has(n) || n.length > 22 ? ttShortName(st.titleTpls[n], used) : n; used.add(k); found.push([k, st.titleTpls[n]]); } }
    for (const p of PRESETS) if (st.overrides && st.overrides[p.name]) add(`${p.name} · ${o.name}`, st.overrides[p.name]);
    for (const n of Object.keys(st.templates || {})) add(`${n} · ${o.name}`, st.templates[n]);
  }
  const old = $('ttFound'); if (old) old.remove();
  if (my !== ttRenderN || !found.length) return;
  const w = document.createElement('div'); w.id = 'ttFound';
  w.innerHTML = '<div class="tpl-h" style="margin-top:6px"><strong>✏️ Títulos de tus plantillas</strong><span class="hint">Los diseños de título que ya has hecho dentro de tus plantillas de formato. Pulsa uno para guardarlo como plantilla de título y dejarlo fijo.</span></div>';
  const g2 = document.createElement('div'); g2.className = 'tt-grid'; w.append(g2);
  for (const [n, tp] of found) {
    const save = box.lastChild; card('\u0000' + n, tp); const b = box.lastChild; if (b === save) continue;
    b.querySelector('.tt-n').textContent = n; b.classList.remove('on');
    b.onclick = async () => { let k = n, i = 2; while (ttGet(k)) k = `${n} ${i++}`; titleTpls[k] = JSON.parse(JSON.stringify(tp)); titleDef = k; await saveTypeStore(); ttRender(); toast(`Título «${k}» guardado y fijo` + (c ? ` para ${c.name}` : '')); };
    g2.append(b);
  }
  box.after(w);
}
let ttRenderN = 0;

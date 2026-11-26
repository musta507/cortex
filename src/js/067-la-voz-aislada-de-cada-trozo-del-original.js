/* ---------- la voz aislada de cada trozo del original ---------- */
var isoStems = new Map();   // clave → {file, s, e, vL, vR, mL, mR} a 44,1 kHz
var isoBusy = false, isoNode = null;
const isoFileId = () => file ? file.name + ':' + file.size : '';
const isoKey = (s, e) => isoFileId() + ':' + s.toFixed(2) + ':' + e.toFixed(2);
function isoRanges() {
  const D = srcDur(), list = (segs.length ? segs : [{ s: 0, e: D }]).map(g => [Math.max(0, g.s - 0.3), Math.min(D, g.e + 0.3)]).sort((a, b) => a[0] - b[0]);
  const out = []; for (const r of list) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else out.push([...r]); }
  return out;
}
function isoStemFor(a, b) { for (const st of isoStems.values()) if (st.file === file && st.s <= a + 0.02 && st.e >= b - 0.02) return st; return null; }
const isoOn = () => !!(clipMeta.iso && clipMeta.iso.on);
const isoLvl = () => Math.max(0, Math.min(1, ((clipMeta.iso && clipMeta.iso.lvl) || 0) / 100));
const isoMissing = () => isoRanges().filter(([a, b]) => !isoStemFor(a, b));
// mezcla voz + un poco de fondo (el fondo = original − voz)
function isoBuffer(st, lvl) {
  if (st.buf && st.bufLvl === lvl) return st.buf;
  const n = st.vL.length, ab = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: MDX.RATE });
  for (const [c, v, m] of [[0, st.vL, st.mL], [1, st.vR, st.mR]]) {
    const o = ab.getChannelData(c);
    if (lvl > 0) for (let i = 0; i < n; i++) o[i] = v[i] + lvl * (m[i] - v[i]); else o.set(v);
  }
  st.buf = ab; st.bufLvl = lvl;
  return ab;
}
async function isoSave(st) {
  try {
    const q = a => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-1, Math.min(1, a[i])) * 32767; return o.buffer; };
    let keys = (await kv.get('isoKeys')) || []; const k = 'iso:' + isoKey(st.s, st.e);
    keys = [k, ...keys.filter(x => x !== k)];
    for (const old of keys.slice(12)) try { await kv.del(old); } catch {}
    await kv.set(k, { s: st.s, e: st.e, L: q(st.vL), R: q(st.vR) }); await kv.set('isoKeys', keys.slice(0, 12));
  } catch (e) { console.warn('No se pudo guardar la voz aislada', e); }
}
// al abrir un clip que ya tenía la voz aislada: recuperarla sin volver a pasar la IA
async function isoRestore() {
  if (!isoOn() || !file) return;
  for (const [a, b] of isoMissing()) {
    try {
      let keys = (await kv.get('isoKeys')) || [];
      for (const k of keys) {
        if (!k.startsWith('iso:' + isoFileId() + ':')) continue;
        const c = await kv.get(k); if (!c || c.s > a + 0.02 || c.e < b - 0.02) continue;
        const buf = await decodeAudioRange(file, c.s, c.e, MDX.RATE, 2), mL = buf.getChannelData(0), mR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : mL;
        const f = x => { const i = new Int16Array(x), o = new Float32Array(i.length); for (let j = 0; j < i.length; j++) o[j] = i[j] / 32768; return o; };
        const vL = f(c.L), vR = f(c.R), n = Math.min(vL.length, mL.length);
        isoStems.set(isoKey(c.s, c.e), { file, s: c.s, e: c.e, vL: vL.subarray(0, n), vR: vR.subarray(0, n), mL: mL.slice(0, n), mR: mR.slice(0, n) });
        break;
      }
    } catch (e) { console.warn('Voz aislada', e); }
  }
  renderSide();
}
async function isoRun(quiet) {
  if (!loaded || isoBusy) return;
  isoBusy = true; vid.pause();
  const own = !quiet;
  if (own) busy('Aislando la voz', [['model', 'Preparar la IA de voz'], ['sep', 'Quitar la música y el fondo']]);
  const say = m => { if (own) busyMsg(m); };
  try {
    await isoRestore();
    const todo = isoMissing();
    if (todo.length) {
      if (own) busyStep('model', 'work');
      const runner = await isoRunner(say);
      if (own) busyStep('model', 'ok', runner.name);
      if (own) busyStep('sep', 'work');
      const total = todo.reduce((x, [a, b]) => x + b - a, 0); let done = 0;
      if (runner.slow) say(`Sin tarjeta gráfica esto va lento (unos ${Math.ceil(total * 7 / 60)} min). Si abres el Grabador Clipzi irá mucho más rápido.`);
      const t0 = Date.now();
      for (const [a, b] of todo) {
        const buf = await decodeAudioRange(file, a, b, MDX.RATE, 2);
        const mL = buf.getChannelData(0), mR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : mL;
        const [vL, vR] = await runner.sep(mL, mR, p => {
          const f = (done + p * (b - a)) / total, el = (Date.now() - t0) / 1000, left = f > 0.03 ? el / f - el : 0;
          say(`Separando la voz… ${Math.round(f * 100)} %${left > 5 ? ` · quedan unos ${left > 90 ? Math.round(left / 60) + ' min' : Math.round(left) + ' s'}` : ''} · con ${runner.name}`);
        });
        const n = Math.min(vL.length, mL.length);
        const st = { file, s: a, e: b, vL: vL.subarray(0, n), vR: vR.subarray(0, n), mL: mL.slice(0, n), mR: mR.slice(0, n) };
        isoStems.set(isoKey(a, b), st); isoSave(st);
        done += b - a;
      }
      if (own) busyStep('sep', 'ok');
    } else if (own) { busyStep('model', 'skip', 'ya estaba'); busyStep('sep', 'ok'); }
    clipMeta.iso = { on: true, lvl: clipMeta.iso && clipMeta.iso.lvl != null ? clipMeta.iso.lvl : 0 };
    pushHistory(); renderSide();
    if (own) { await sleep(400); toast('🎙️ Voz aislada: ya no se oye la música ni el fondo'); }
    return true;
  } catch (e) {
    console.error(e);
    toast('No se pudo aislar la voz: ' + e.message);
    return false;
  } finally { isoBusy = false; if (own) busy(false); renderSide(); }
}
function isoSet(on, lvl) {
  if (!clipMeta.iso) clipMeta.iso = { on: false, lvl: 0 };
  if (on != null) clipMeta.iso.on = on;
  if (lvl != null) clipMeta.iso.lvl = lvl;
  isoStop(); pushHistory(); renderSide();
  if (clipMeta.iso.on && isoMissing().length) isoRun();
}
function isoStop() { if (isoNode) { try { isoNode.src.stop(); } catch {} try { isoNode.g.disconnect(); } catch {} isoNode = null; } }
// en cada fotograma: si la voz aislada cubre este momento, suena ella (sincronizada con el vídeo) en vez del audio original
function isoTick() {
  if (!actx || !isoOn() || trk.video.mute || vid.muted || (vid.playbackRate || 1) !== 1) { isoStop(); return false; }
  const t = vid.currentTime || 0;
  let st = null; for (const x of isoStems.values()) if (x.file === file && t >= x.s && t < x.e - 0.05) { st = x; break; }
  if (!st) { isoStop(); return false; }
  if (vid.paused) { isoStop(); return true; }
  const lvl = isoLvl(), exp = t - st.s;
  if (isoNode && isoNode.st === st && isoNode.lvl === lvl && Math.abs(actx.currentTime - isoNode.t0 + isoNode.off - exp) < 0.12) return true;
  isoStop();
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = isoBuffer(st, lvl); src.connect(g); g.connect(speaker); g.connect(recDest);
  src.start(0, exp); isoNode = { src, g, st, lvl, t0: actx.currentTime, off: exp };
  return true;
}


/* ==================== PANEL DE ESTILO DEL TEXTO (subtítulos y textos, como en CapCut) ====================
   Arriba lo fácil (estilos de un clic, color y tamaño). Texto, Fondo y Sombra van plegados: solo se abren si los pulsas. */
const SUBMAP = { color: 'subColor', size: 'subSize', font: 'subFont', bold: 'subBold', italic: 'subItalic', under: 'subUnder', ls: 'subLS', lh: 'subLH', align: 'subAlign',
  stroke: 'strokeOn', strokeC: 'strokeC', strokeW: 'strokeW', bg: 'subBg', bgMode: 'subBgMode', bgC: 'subBgC', bgOp: 'subBgOp', bgR: 'subBgR', bgH: 'subBgH', bgW: 'subBgW',
  bgX: 'subBgX', bgY: 'subBgY', sh: 'subShOn', shC: 'subShC', shOp: 'shOp', shBlur: 'shBlur', shD: 'subShD', shA: 'subShA', hl: 'hl', hlC: 'hlColor' };
const ST_DEF = { bold: true, italic: false, under: false, tcase: 'none', ls: 0, lh: 112, align: 'center', stroke: false, strokeC: '#000000', strokeW: 12,
  bg: false, bgMode: 'line', bgC: '#000000', bgOp: 70, bgR: 30, bgH: 18, bgW: 30, bgX: 0, bgY: 0, sh: true, shC: '#000000', shOp: 85, shBlur: 18, shD: 0, shA: -45 };
const ST_GROUPS = { texto: ['bold', 'italic', 'under', 'tcase', 'ls', 'lh', 'align'], contorno: ['strokeC', 'strokeW'], fondo: ['bgMode', 'bgC', 'bgOp', 'bgR', 'bgH', 'bgW', 'bgX', 'bgY'], sombra: ['shC', 'shOp', 'shBlur', 'shD', 'shA'] };
// estilos de un clic (lo que no ponen, se queda como está)
const ST_PRESETS = [
  { n: 'Clásico', css: 'color:#fff;text-shadow:0 0 6px #000,0 0 3px #000', p: { color: '#ffffff', stroke: false, bg: false, sh: true, shC: '#000000', shOp: 85, shBlur: 18, shD: 0, under: false, italic: false } },
  { n: 'Contorno', css: 'color:#fff;-webkit-text-stroke:1.5px #000;paint-order:stroke', p: { color: '#ffffff', stroke: true, strokeC: '#000000', strokeW: 14, bg: false, sh: true, shC: '#000000', shOp: 60, shBlur: 10, shD: 0 } },
  { n: 'Amarillo', css: 'color:#ffd23f;-webkit-text-stroke:1.5px #000;paint-order:stroke', p: { color: '#ffd23f', stroke: true, strokeC: '#000000', strokeW: 14, bg: false, sh: true, shOp: 60, shBlur: 10, shD: 0 } },
  { n: 'Caja negra', css: 'color:#fff;background:rgba(0,0,0,.75);border-radius:6px;padding:0 6px', p: { color: '#ffffff', stroke: false, bg: true, bgMode: 'line', bgC: '#000000', bgOp: 75, bgR: 30, bgH: 18, bgW: 30, sh: false } },
  { n: 'Caja blanca', css: 'color:#111;background:#fff;border-radius:6px;padding:0 6px', p: { color: '#111111', stroke: false, bg: true, bgMode: 'line', bgC: '#ffffff', bgOp: 100, bgR: 30, bgH: 18, bgW: 30, sh: false } },
  { n: 'Caja roja', css: 'color:#fff;background:#e53935;border-radius:6px;padding:0 6px', p: { color: '#ffffff', stroke: false, bg: true, bgMode: 'line', bgC: '#e53935', bgOp: 100, bgR: 30, bgH: 18, bgW: 30, sh: false } },
  { n: 'Neón', css: 'color:#39ff14;text-shadow:0 0 8px #39ff14,0 0 2px #39ff14', p: { color: '#39ff14', stroke: false, bg: false, sh: true, shC: '#39ff14', shOp: 90, shBlur: 40, shD: 0 } },
  { n: 'Sombra 3D', css: 'color:#fff;text-shadow:3px 3px 0 #000', p: { color: '#ffffff', stroke: false, bg: false, sh: true, shC: '#000000', shOp: 100, shBlur: 4, shD: 10, shA: -45 } },
];
const ST_SW = ['#ffffff', '#000000', '#ffd23f', '#ff3b30', '#39ff14', '#1e90ff', '#ff2d95', '#ff9500'];
var stKey = null;
function stModel(k) {
  if (k === 'sub') {
    const el = p => $(SUBMAP[p]);
    return {
      kind: 'sub', title: '🎨 Estilo de los subtítulos', def: p => ST_DEF[p], fonts: [...$('subFont').options].map(o => [o.value, o.textContent]), sizeMin: 40, sizeMax: 130,
      get(p) {
        if (p === 'tcase') return $('subCase').value !== 'none' ? $('subCase').value : ($('upper').checked ? 'upper' : 'none');
        const e = el(p); if (!e) return ST_DEF[p];
        return e.type === 'checkbox' ? e.checked : e.type === 'range' ? +e.value : e.value;
      },
      set(p, v) {
        if (p === 'tcase') { repSet('upper', v === 'upper'); repSet('subCase', v === 'upper' ? 'none' : v); return; }
        const e = el(p); if (!e) return;
        if (e.type === 'checkbox') { e.checked = !!v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
        else { setRange(SUBMAP[p], v); if (p === 'font') { checkFonts(); syncTiles(); } }
      },
    };
  }
  const tx = k && k.startsWith('txt:') ? txtById(+k.slice(4)) : null; if (!tx) return null;
  return {
    kind: 'txt', title: '🎨 Estilo del texto', def: p => p === 'lh' ? 115 : p === 'sh' ? true : p === 'stroke' ? false : p === 'strokeC' ? '#000000' : TX_DEF[p] != null ? TX_DEF[p] : ST_DEF[p], fonts: [...$('txtFont').options].map(o => [o.value, o.textContent]), sizeMin: 16, sizeMax: 400,
    get(p) {
      if (p === 'sh') return !!tx.shadow;
      if (p === 'lh') return Math.round((tx.lh || 1.15) * 100);
      if (p === 'stroke' || p === 'bg') return !!tx[p];
      if (p === 'bgC' || p === 'strokeC' || p === 'color' || p === 'size' || p === 'font') return tx[p];
      return txv(tx, p);
    },
    set(p, v) {
      if (p === 'sh') tx.shadow = !!v; else if (p === 'lh') tx.lh = v / 100; else tx[p] = v;
      fillTextPanel();
    },
  };
}
function stShow(k) {
  if (!stModel(k)) return;
  stKey = k; $('stPanel').hidden = false; $('stPanel').classList.toggle('st-float', seOpen()); document.body.classList.add('st-open');
  if (k === 'sub') selected = 'sub'; else if (k.startsWith('txt:')) selectText(+k.slice(4), true);
  stRender();
}
function stHide() { stKey = null; $('stPanel').hidden = true; document.body.classList.remove('st-open'); }
const stSecOpen = id => { try { return JSON.parse(localStorage.getItem('clipzi-stsec') || '{}')[id] === true; } catch { return false; } };
function stSecSet(id, v) { let o = {}; try { o = JSON.parse(localStorage.getItem('clipzi-stsec') || '{}'); } catch {} o[id] = v; try { localStorage.setItem('clipzi-stsec', JSON.stringify(o)); } catch {} }
function stSecToggle(id) { stSecSet(id, !stSecOpen(id)); stRefresh(); }
let stHistT = null;
const stCommit = () => { clearTimeout(stHistT); stHistT = setTimeout(() => pushHistory(), 300); };
// valores para que «activar con un clic» se vea siempre (si estaba a cero, se pone algo visible)
const ST_ON = { sh: { shOp: 85, shBlur: 18 }, bg: { bgOp: 70 }, stroke: { strokeW: 12 } };
// piezas del panel (las usan el panel flotante y los apartados del editor avanzado)
function stKit(M, rerender) {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const set = (p, v, re) => { M.set(p, v); stCommit(); if (re) rerender(); };
  const row = (label, ...ctl) => { const r = el('div', 'st-row'); r.append(el('span', 'st-l', label), ...ctl); return r; };
  const num = (p, min, max, unit = '', step = 1) => {
    const w = el('div', 'st-num'), rg = document.createElement('input'), nb = document.createElement('input');
    rg.type = 'range'; rg.min = min; rg.max = max; rg.step = step; rg.value = M.get(p);
    nb.type = 'number'; nb.min = min; nb.max = max; nb.step = step; nb.value = M.get(p);
    rg.oninput = () => { nb.value = rg.value; set(p, +rg.value); };
    nb.onchange = () => { const v = Math.max(min, Math.min(max, +nb.value || 0)); nb.value = v; rg.value = v; set(p, v); };
    w.append(rg, nb); if (unit) w.append(el('span', 'st-u', unit)); return w;
  };
  const color = p => {
    const w = el('div', 'st-col'), c = document.createElement('input'); c.type = 'color'; c.value = M.get(p) || '#ffffff';
    c.oninput = () => set(p, c.value); w.append(c);
    for (const h of ST_SW) { const b = el('button', 'st-sw' + (String(M.get(p)).toLowerCase() === h ? ' on' : '')); b.type = 'button'; b.style.background = h; b.title = h; b.onclick = () => set(p, h, true); w.append(b); }
    return w;
  };
  const seg = (p, opts) => { const w = el('div', 'st-seg'); for (const [v, lab, tip] of opts) { const b = el('button', M.get(p) === v ? 'on' : '', lab); b.type = 'button'; if (tip) b.title = tip; b.onclick = () => set(p, v, true); w.append(b); } return w; };
  const tog = (p, lab, tip, css) => { const b = el('button', 'st-tog' + (M.get(p) ? ' on' : ''), lab); b.type = 'button'; b.title = tip; if (css) b.style.cssText = css; b.onclick = () => set(p, !M.get(p), true); return b; };
  // apartado como en CapCut: casilla para activarlo con un clic, el nombre con ▸ para desplegar sus ajustes y ↺ para volver a lo de antes
  const section = (id, title, onKey, body) => {
    const sec = el('div', 'st-sec' + (stSecOpen(id) ? ' open' : '')), h = el('div', 'st-sh');
    if (onKey) {
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!M.get(onKey); cb.title = cb.checked ? 'Quitar' : 'Añadir con un clic';
      cb.onchange = () => {
        M.set(onKey, cb.checked);
        if (cb.checked) for (const [k, v] of Object.entries(ST_ON[onKey] || {})) if (!(+M.get(k) > 0)) M.set(k, v);
        stCommit(); rerender();
      };
      h.append(cb);
    } else h.append(el('span', 'st-dot'));
    const t = el('button', 'st-st', title); t.type = 'button'; t.onclick = () => { stSecSet(id, !stSecOpen(id)); rerender(); }; h.append(t);
    const rs = el('button', 'st-rs', '↺'); rs.type = 'button'; rs.title = 'Volver a como estaba por defecto'; rs.onclick = () => { for (const p of ST_GROUPS[id]) M.set(p, M.def(p)); stCommit(); rerender(); }; h.append(rs);
    sec.append(h);
    if (stSecOpen(id)) { const b = el('div', 'st-sb'); body(b); sec.append(b); }
    return sec;
  };
  return { el, set, row, num, color, seg, tog, section };
}
// los apartados plegables: Texto, Contorno, Fondo y Sombra
function stSections(box, M, rerender) {
  const { el, set, row, num, color, seg, tog, section } = stKit(M, rerender);
  box.append(section('texto', 'Texto', null, b => {
    const fs = document.createElement('select'); for (const [v, n] of M.fonts) { const o = document.createElement('option'); o.value = v; o.textContent = n; fs.append(o); } fs.value = M.get('font'); fs.onchange = () => set('font', fs.value);
    b.append(row('Fuente', fs));
    const d = el('div', 'st-seg');
    d.append(tog('bold', 'B', 'Negrita', 'font-weight:800'), tog('under', 'U', 'Subrayado', 'text-decoration:underline'), tog('italic', 'I', 'Cursiva', 'font-style:italic'));
    b.append(row('Diseño', d));
    b.append(row('May./min.', seg('tcase', [['upper', 'TT', 'TODO EN MAYÚSCULAS'], ['lower', 'tt', 'todo en minúsculas'], ['title', 'Tt', 'Cada Palabra Con Mayúscula'], ['none', 'Aa', 'Como se escribió']])));
    b.append(row('Carácter', num('ls', -5, 40)));
    b.append(row('Línea', num('lh', 80, 200, '%')));
    b.append(row('Alineación', seg('align', [['left', '⇤', 'A la izquierda'], ['center', '↔', 'Centrado'], ['right', '⇥', 'A la derecha']])));
  }));
  box.append(section('contorno', 'Contorno', 'stroke', b => {
    b.append(row('Color', color('strokeC')));
    b.append(row('Grosor', num('strokeW', 2, 30)));
  }));
  box.append(section('fondo', 'Fondo', 'bg', b => {
    b.append(row('Estilo', seg('bgMode', [['line', '▤ Por línea', 'Una caja detrás de cada línea'], ['block', '▣ Bloque', 'Una sola caja que lo envuelve todo']])));
    b.append(row('Color', color('bgC')));
    b.append(row('Opacidad', num('bgOp', 0, 100, '%')));
    b.append(row('Redondeado', num('bgR', 0, 100, '%')));
    b.append(row('Alto', num('bgH', 0, 100, '%')));
    b.append(row('Ancho', num('bgW', 0, 150, '%')));
    b.append(row('Despl. Y', num('bgY', -200, 200)));
    b.append(row('Despl. X', num('bgX', -200, 200)));
  }));
  box.append(section('sombra', 'Sombra', 'sh', b => {
    b.append(row('Color', color('shC')));
    b.append(row('Opacidad', num('shOp', 0, 100, '%')));
    b.append(row('Desenfoque', num('shBlur', 0, 60, '%')));
    b.append(row('Distancia', num('shD', 0, 60)));
    b.append(row('Ángulo', num('shA', -180, 180, '°')));
  }));
}
// todo lo que muestra estos ajustes se vuelve a pintar cuando cambian
function stRefresh() { stRender(); stInlineRender(); }
function stInlineRender() {
  const sb = $('subStyleInline'); if (sb) { sb.innerHTML = ''; const M = stModel('sub'); if (M) stSections(sb, M, stRefresh); }
  const tb = $('txtStyleInline'); if (tb) { tb.innerHTML = ''; const id = selTextId(), M = id != null ? stModel('txt:' + id) : null; if (M) stSections(tb, M, stRefresh); }
}
function stRender() {
  const box = $('stPanel');
  if (!stKey) return;
  const M = stModel(stKey);
  if (!M) { stHide(); return; }
  box.innerHTML = '';
  const { el, row, num, color, tog } = stKit(M, stRefresh);
  // cabecera
  const hd = el('div', 'st-hd'); hd.append(el('strong', null, M.title)); const x = el('button', 'ib', '✕'); x.title = 'Cerrar'; x.onclick = stHide; hd.append(x); box.append(hd);
  // lo fácil
  box.append(el('span', 'st-cap', 'Estilos rápidos'));
  const pr = el('div', 'st-pre');
  for (const P of ST_PRESETS) { const b = el('button', 'st-pb'); const sp = el('span', null, 'Abc'); sp.style.cssText = P.css; b.append(sp, el('em', null, P.n)); b.onclick = () => { for (const [k2, v] of Object.entries(P.p)) M.set(k2, v); stCommit(); stRefresh(); }; pr.append(b); }
  box.append(pr);
  box.append(row('Color', color('color')));
  box.append(row('Tamaño', num('size', M.sizeMin, M.sizeMax)));
  if (M.kind === 'sub') {
    const pw = el('div', 'st-seg');
    for (const n of [1, 2, 3, 4, 5, 6]) { const bt = el('button', +$('wpc').value === n ? 'on' : '', String(n)); bt.title = n === 1 ? '1 palabra en pantalla' : n + ' palabras en pantalla'; bt.onclick = () => { setRange('wpc', n); stCommit(); stRefresh(); }; pw.append(bt); }
    box.append(row('Palabras', pw));
    const r = row('Resaltar', tog('hl', 'Palabra que suena', 'La palabra que se está diciendo va en otro color'));
    if (M.get('hl')) r.append(color('hlC'));
    box.append(r);
  }
  // lo avanzado, plegado
  stSections(box, M, stRefresh);
  if (M.kind === 'sub') box.append(el('p', 'hint', 'Para que este estilo sea el de siempre en este creador, guárdalo en su plantilla.'));
}
// clic sin arrastrar en un subtítulo o un texto (modo fácil): se abre su panel de estilo
let stDown = null;
cv.addEventListener('pointerdown', e => { stDown = { x: e.clientX, y: e.clientY }; }, true);
cv.addEventListener('click', e => {
  if (!ezMode || exporting || cropMode || !loaded || !stDown) return;
  if (Math.hypot(e.clientX - stDown.x, e.clientY - stDown.y) > 6) return;
  const k = hitAny(canvasPt(e));
  if (k === 'sub' || (k && k.startsWith('txt:'))) stShow(k);
  else if (!k && stKey) stHide();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stKey && !typingIn(document.activeElement)) stHide(); });
stInlineRender();


/* ==================== PLANTILLAS DE CADA CREADOR (lo primero que se ve al entrar en su proyecto) ====================
   Cada creador tiene su estilo: sus 4 formatos (Podcast, Reacción, Pantalla dividida, Título y subtítulos) ajustados a su gusto
   y las plantillas propias que quiera. Se editan viendo un clip de ejemplo y se pueden copiar de otros creadores. */
var tplEditing = null;   // {kind: 'format'|'custom', name}
async function tplStoreOf(id) {
  let g = null; try { g = await kv.get('tplg:' + groupOf(id)); } catch {}
  if (!g) { let st = null; try { st = await kv.get('client:' + id); } catch {} g = st ? { overrides: st.overrides || {}, def: st.def || null, templates: st.templates || {} } : { overrides: {}, def: null, templates: {} }; }
  return { overrides: g.overrides || {}, def: g.def || null, templates: g.templates || {}, titleTpls: g.titleTpls || {} };
}
function tplCard(st, name, sub, isDef, btns) {
  const card = document.createElement('div'); card.className = 'tpl-card';
  card.append(mockFrom(st, isDef, name));
  const n = document.createElement('strong'); n.textContent = fmtLbl(name); card.append(n);
  const h = document.createElement('span'); h.className = 'hint'; h.textContent = sub; card.append(h);
  const row = document.createElement('div'); row.className = 'tpl-b'; if (!btns.length) row.hidden = true;
  for (const [lab, fn, cls, tip] of btns) { const b = document.createElement('button'); b.textContent = lab; if (cls) b.className = cls; if (tip) b.title = tip; b.onclick = ev => { ev.stopPropagation(); fn(b); }; row.append(b); }
  card.append(row);
  return card;
}
async function tplRender() {
  ttRender().catch(e => console.warn('títulos', e)); fontsRender().catch(() => {});
  const c = clientOf(curClient), box = $('tplBox'); if (!c || !box) { lgRender().catch(() => {}); return; }
  await loadClientStore(c.id); lgRender().catch(e => console.warn('logos', e));
  $('tplWho').textContent = '';
  const g = $('tplGrid'); g.innerHTML = '';
  const AW = await getAgent(c);
  const whenFields = (card, keys) => {
    for (const k of keys) {
      const w = document.createElement('label'); w.className = 'tpl-when';
      const s = document.createElement('span'); s.textContent = keys.length > 1 ? 'Cuándo usar «' + AG_FORMATS[k].name + '»' : 'Cuándo usarla';
      const ta = document.createElement('textarea'); ta.value = (AW.when || {})[k] || ''; ta.dataset.when = k;
      ta.placeholder = { llamada: 'Ej.: cuando están en una llamada de Discord con varias cámaras', podcast: 'Ej.: cuando habla a cámara sin reaccionar a nada', reaccion: 'Ej.: cuando reacciona a un vídeo, un tweet o está jugando', dividida: 'Ej.: cuando una imagen ayuda a entender lo que cuenta', horizontal: 'Ej.: grabaciones normales sin cámara aparte', horizontal_cam: 'Ej.: cuando juega al casino (el casino no se enseña)', duo: 'Ej.: cuando hay dos o más personas en el set hablando entre ellas' }[k] || '';
      let t = null; ta.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const a = await getAgent(c); a.when = a.when || {}; a.when[k] = ta.value; await saveAgent(c, a); }, 400); };
      ta.onclick = e => e.stopPropagation();
      w.append(s, ta); card.append(w);
    }
  };
  const confirm2 = (b, fn) => { if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = '¿Seguro?'; b.classList.add('danger'); setTimeout(() => { delete b.dataset.ok; b.textContent = '🗑 Eliminar'; b.classList.remove('danger'); }, 3000); return; } fn(); };
  const lock = typeof CORTEX_PROXY !== 'undefined' && CORTEX_PROXY;   // web: los clippers no las cambian, las sugieren
  $('tplAct').hidden = lock; $('tplSugW').hidden = !lock;
  if (lock) { const h = box.querySelector('.tpl-h .hint'); if (h) h.textContent = 'Cada tipo de clip tiene su plantilla y la IA elige sola cuál usar en cada clip. ¿Quieres otra o un cambio? Sugiérela abajo.'; }
  for (const p of PRESETS) {
    if (presetHidden.includes(p.name)) continue;
    const fmt = Object.keys(AG_FORMATS).find(k => AG_FORMATS[k].preset === p.name);
    if (lock) { g.append(tplCard(effectivePreset(p), p.name, 'Formato', presetDefault === p.name, [])); continue; }
    const btns = [
      ['✏️ Editar', () => tplEdit({ kind: 'format', name: p.name, fmt }), 'primary'],
      [presetDefault === p.name ? '★' : '☆', async () => { presetDefault = presetDefault === p.name ? null : p.name; await saveTypeStore(); tplRender(); }, '', 'Usarla al abrir un clip nuevo'],
    ];
    btns.push(['📋 Título a las demás', () => tplCopyTitle(cleanForPreset(effectivePreset(p)), p.name), '', 'Copiar el estilo de este título (fuente, caja, colores, emoji…) a las demás plantillas']);
    if (presetOverrides[p.name]) btns.push(['↺', async () => { delete presetOverrides[p.name]; await saveTypeStore(); toast(`«${p.name}» vuelve a como venía`); tplRender(); }, '', 'Volver a como venía (quitar tus cambios)']);
    btns.push(['🗑 Eliminar', b => confirm2(b, async () => {
      if (PRESETS.filter(x => !presetHidden.includes(x.name)).length <= 1) { toast('Tiene que quedar al menos un formato'); return; }
      presetHidden = [...presetHidden, p.name]; if (presetDefault === p.name) presetDefault = null;
      await saveTypeStore(); toast(`«${p.name}» eliminada: la IA ya no la usará con ${c.name}`); tplRender();
    }), 'tpl-del', 'Quitar este formato a este creador (la IA ya no lo usará)']);
    const card = tplCard(effectivePreset(p), p.name, presetOverrides[p.name] ? 'Formato · ajustado a ' + c.name : 'Formato · sin ajustar todavía', presetDefault === p.name, btns);
    whenFields(card, ['horizontal', ...AG_WHEN_KEYS].filter((k, i, a) => a.indexOf(k) === i && AG_FORMATS[k].preset === p.name));
    g.append(card);
  }
  for (const n of Object.keys(templates).sort((a, b) => a.localeCompare(b, 'es'))) {
    if (lock) { g.append(tplCard(templates[n], n, 'Plantilla', false, [])); continue; }
    g.append(tplCard(templates[n], n, 'Plantilla propia', false, [
      ['✏️ Editar', () => tplEdit({ kind: 'custom', name: n }), 'primary'],
      ['📋 Título a las demás', () => tplCopyTitle(JSON.parse(JSON.stringify(templates[n])), n), '', 'Copiar el estilo de este título a las demás plantillas'],
      ['🗑 Eliminar', b => confirm2(b, async () => { delete templates[n]; await saveTypeStore(); toast(`Plantilla «${n}» eliminada`); tplRender(); }), 'tpl-del', 'Eliminar esta plantilla'],
    ]));
  }
  const hid = $('tplHidden'); hid.innerHTML = '';
  if (presetHidden.length) {
    hid.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: 'Eliminadas: ' }));
    for (const n of presetHidden) { const bt = document.createElement('button'); bt.textContent = '↩ ' + n; bt.title = 'Recuperar este formato'; bt.onclick = async () => { presetHidden = presetHidden.filter(x => x !== n); await saveTypeStore(); tplRender(); }; hid.append(bt); }
  }
  $('tplNew').hidden = true; $('tplImp').hidden = true;
}
// copiar el estilo del título de una plantilla a las demás (de este creador o de todos)
const TITLE_KEYS = ['titleFont', 'titleSize', 'titleUpper', 'titleColor', 'titleHl', 'titleLH', 'boxR', 'boxPX', 'boxPY', 'boxColor', 'boxText', 'titleW', 'titleAutoHL', 'titleEmoji', 'boxOp', 'tLS', 'tStrokeW', 'tStrokeC', 'tShadow'];
function titlePart(st) { const c = {}; for (const k of TITLE_KEYS) if (st.c && st.c[k] !== undefined) c[k] = st.c[k]; return { titleStyle: st.titleStyle, boxMode: st.boxMode, c }; }
function mergeTitle(st, tp) { const m = JSON.parse(JSON.stringify(st)); m.c = { ...(m.c || {}), ...tp.c }; if (tp.titleStyle) m.titleStyle = tp.titleStyle; if (tp.boxMode) m.boxMode = tp.boxMode; return m; }
function tplCopyTitle(src, name) {
  const box = $('tplImp'); $('tplNew').hidden = true; box.hidden = false; box.innerHTML = '';
  const c = clientOf(curClient), tp = titlePart(src);
  const p = document.createElement('p'); p.className = 'hint';
  p.textContent = `Se copiará el título de «${name}» (fuente, tamaño, mayúsculas, caja, colores, palabras en rojo y emoji) a las demás plantillas. La posición del título de cada formato no cambia.`;
  const row = document.createElement('div'); row.className = 'tpl-act';
  const mk = (lab, cls, fn) => { const b = document.createElement('button'); b.textContent = lab; if (cls) b.className = cls; b.onclick = fn; row.append(b); };
  mk(`A todas las de ${c.name}`, 'primary', async () => {
    for (const q of PRESETS) if (q.name !== name) presetOverrides[q.name] = mergeTitle(cleanForPreset(effectivePreset(q)), tp);
    for (const n of Object.keys(templates)) if (n !== name) templates[n] = mergeTitle(templates[n], tp);
    await saveTypeStore(); toast(`Título de «${name}» copiado a todas las plantillas de ${c.name}`); tplRender();
  });
  mk('A las de todos los creadores', '', async () => {
    const done = new Set(), cur = curClient;
    for (const o of clients) {
      const gid = groupOf(o.id); if (done.has(gid)) continue; done.add(gid);
      curClient = o.id; await loadClientStore(o.id);
      for (const q of PRESETS) if (!(o.id === cur && q.name === name)) presetOverrides[q.name] = mergeTitle(cleanForPreset(effectivePreset(q)), tp);
      for (const n of Object.keys(templates)) if (!(o.id === cur && n === name)) templates[n] = mergeTitle(templates[n], tp);
      await saveTypeStore();
    }
    curClient = cur; await loadClientStore(cur); toast(`Título de «${name}» copiado a las plantillas de todos los creadores`); tplRender();
  });
  mk('Cancelar', '', () => { box.hidden = true; });
  box.append(p, row);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
// nueva plantilla: un nombre y en qué se basa
function tplNewOpen() {
  const f = $('tplNew'); f.hidden = !f.hidden; $('tplImp').hidden = true; if (f.hidden) return;
  const sel = $('tplNewBase'); sel.innerHTML = '';
  for (const p of PRESETS) { const o = document.createElement('option'); o.value = 'f:' + p.name; o.textContent = 'Formato ' + fmtLbl(p.name); sel.append(o); }
  for (const n of Object.keys(templates)) { const o = document.createElement('option'); o.value = 't:' + n; o.textContent = 'Plantilla ' + n; sel.append(o); }
  $('tplNewName').value = ''; $('tplNewName').focus();
}
async function tplNewCreate() {
  const name = $('tplNewName').value.trim(), base = $('tplNewBase').value;
  if (!name) { toast('Ponle un nombre a la plantilla'); $('tplNewName').focus(); return; }
  if (templates[name] || PRESETS.some(p => p.name === name)) { toast('Ya hay una plantilla con ese nombre'); return; }
  const src = base.startsWith('f:') ? cleanForPreset(effectivePreset(PRESETS.find(p => p.name === base.slice(2)))) : JSON.parse(JSON.stringify(templates[base.slice(2)]));
  templates[name] = src; await saveTypeStore();
  tplEdit({ kind: 'custom', name });
}
// copiar plantillas de otro creador
async function tplImpOpen() {
  const box = $('tplImp'); box.hidden = !box.hidden; $('tplNew').hidden = true; if (box.hidden) return;
  box.innerHTML = '<p class="hint">Elige una plantilla de otro creador para copiarla aquí. Es una copia: si luego la cambias aquí, la del otro no cambia.</p>';
  const me = clientOf(curClient); let any = false;
  for (const o of clients) {
    if (o.id === me.id || groupOf(o.id) === groupOf(me.id)) continue;
    const st = await tplStoreOf(o.id), items = [];
    for (const p of PRESETS) if (st.overrides[p.name]) items.push({ name: p.name, style: st.overrides[p.name], fmt: true });
    for (const n of Object.keys(st.templates)) items.push({ name: n, style: st.templates[n], fmt: false });
    if (!items.length) continue;
    any = true;
    const h = document.createElement('strong'); h.textContent = o.name; box.append(h);
    const grid = document.createElement('div'); grid.className = 'tpl-grid sm';
    for (const it of items) {
      const copy = () => JSON.parse(JSON.stringify(it.style));
      const btns = [['➕ Añadir', async () => { let n = `${it.name} · ${o.name}`, k = 2; while (templates[n]) n = `${it.name} · ${o.name} ${k++}`; templates[n] = copy(); await saveTypeStore(); toast(`Plantilla «${n}» añadida`); tplRender(); }, 'primary', 'Añadirla como plantilla propia']];
      if (it.fmt) btns.push([`Usar como mi ${it.name}`, async () => { presetOverrides[it.name] = copy(); await saveTypeStore(); toast(`Tu formato ${it.name} ahora es como el de ${o.name}`); tplRender(); }, '', `Sustituye tu formato ${it.name} por este`]);
      grid.append(tplCard(it.style, it.name, it.fmt ? 'Formato de ' + o.name : 'Plantilla de ' + o.name, false, btns));
    }
    box.append(grid);
  }
  if (!any) box.innerHTML += '<p class="hint">Los demás creadores aún no tienen plantillas ajustadas.</p>';
}
// editar una plantilla viendo un clip de ejemplo
async function tplSample() {
  const mine = projIndex.filter(x => x.client === curClient), rest = projIndex.filter(x => x.client !== curClient);
  for (const e of [...mine, ...rest].slice(0, 25)) { try { const f = await kv.get('clip:' + e.id); if (f && f.size) return f; } catch {} }
  try { const f = await kv.get('clip:tplsample'); if (f && f.size) return f; } catch {}
  return null;
}
async function tplEdit(t) {
  const c = clientOf(curClient); if (!c) return;
  await newClip();
  curProj = 'tplsample';   // no se guarda como un clip del creador
  tplEditing = t;
  $('tplBarName').textContent = t.name; $('tplBarWho').textContent = c.name; $('tplBar').hidden = false; document.body.classList.add('tpl-edit');
  const f = await tplSample();
  if (f) { ezHold = true; try { await loadFile(f instanceof File ? f : new File([f], 'ejemplo.mp4', { type: f.type || 'video/mp4' }), true); } catch { toast('No se pudo abrir el clip de ejemplo'); } finally { ezHold = false; } await tplAfterLoad(); }
  else toast('Inserta un clip cualquiera para ver cómo queda la plantilla');
}
async function tplAfterLoad() {
  const t = tplEditing; if (!t) return;
  const D = vid.duration || 8, a = Math.min(Math.max(0, D * 0.3), Math.max(0, D - 8));
  segs = [{ id: newId(), s: a, e: Math.min(D, a + 8) }]; pseg = 0; tlSig = ''; texts = []; mutes = []; clipMeta = {};
  if (t.kind === 'format') { const p = PRESETS.find(x => x.name === t.name); await applyStyle(cleanForPreset(effectivePreset(p))); if (p.fill && layoutMode === 'single' && !presetOverrides[p.name]) setRange('zoom', fillZoom()); activePreset = p.name; }
  else await applyStyle(JSON.parse(JSON.stringify(templates[t.name])));
  $('title').value = 'Así se verá el título de este creador'; titleHL.clear(); if (autoHLOn()) { titleHL.add(3); titleHL.add(4); } renderChips(); trk.title.hide = false; trk.caps.hide = false;
  const words = 'así se verán los subtítulos de los clips de este creador'.split(' ');
  allWords = words.map((w, i) => ({ text: ' ' + w, start: a + 0.3 + i * 0.6, end: a + 0.3 + i * 0.6 + 0.5 })); clipMeta.noSubs = false; buildCaptions();
  ezShow('edit'); syncTrackUI(); seekOut(0.5); vid.pause();
  if (layoutMode === 'react') { camDetectedFor = null; autoDetectCam(true); }
  hist = []; hi = -1; pushHistory();
  toast('Cambia lo que quieras (pulsa el título o los subtítulos) y dale a «Guardar plantilla»');
}
async function tplSaveEdit() {
  const t = tplEditing; if (!t) return;
  if (t.kind === 'format') presetOverrides[t.name] = cleanForPreset(getStyle()); else templates[t.name] = getStyle();
  const ok = await saveTypeStore();
  toast(ok ? `Plantilla «${t.name}» guardada` : 'No se pudo guardar');
  tplEditing = null; $('tplBar').hidden = true; document.body.classList.remove('tpl-edit'); curProj = null;
  await goHome(); tplRender();
}
async function tplCancelEdit() { tplEditing = null; $('tplBar').hidden = true; document.body.classList.remove('tpl-edit'); curProj = null; await goHome(); tplRender(); }
$('tplNewBtn').onclick = tplNewOpen;
$('tplNewGo').onclick = tplNewCreate;
$('tplNewName').onkeydown = e => { if (e.key === 'Enter') tplNewCreate(); };
$('tplImportBtn').onclick = tplImpOpen;
$('tplBarSave').onclick = tplSaveEdit;
$('tplBarCancel').onclick = tplCancelEdit;

/* ==================== CLIPEO EN DIRECTO ====================
   El «Grabador» (un programa pequeño en tu PC) graba Kick en trozos, lee el chat, mira los clips de Kick
   y vigila a otros clippers. Cortex lee esa carpeta, te propone los momentos y, con un clic, los edita. */
let liveDir = null, liveTimer = null, liveSessions = {}, liveSeen = new Set(), liveHidden = new Set(), liveNew = 0, liveFrom = null;
const liveDiag = []; const ldg = t => { liveDiag.push(new Date().toLocaleTimeString('es-ES') + ' ' + t); if (liveDiag.length > 40) liveDiag.shift(); };
function liveDiagShow() {
  let b = $('lvDiag'); if (!b) { b = document.createElement('div'); b.id = 'lvDiag'; b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99999;max-width:560px;background:#16161b;border:1px solid #FBBF24;border-radius:12px;padding:12px 14px;font:12.5px/1.5 ui-monospace,monospace;color:#F4F4F5;white-space:pre-wrap;box-shadow:0 10px 40px rgba(0,0,0,.6)'; document.body.append(b); }
  b.textContent = '🔎 Carpeta del grabador (haz una captura de esto y mándasela a Claude)\n' + ((navigator.userAgent.match(/Edg\/[\d.]+/) || navigator.userAgent.match(/Electron\/[\d.]+/) || navigator.userAgent.match(/Chrome\/[\d.]+/) || ['?'])[0].replace('Edg/', 'Edge ').replace('Electron/', 'Aplicación Cortex ').replace('Chrome/', 'Chrome ')) + ' · ' + location.protocol + '\n' + liveDiag.join('\n');
  const x = document.createElement('button'); x.textContent = 'Cerrar'; x.style.cssText = 'display:block;margin-top:8px;width:auto;padding:4px 12px'; x.onclick = () => b.remove(); b.append(x);
}
async function getLiveDir(ask) {
  if (!liveDir) { try { liveDir = await kv.get('grabDir'); if (ask) ldg('carpeta guardada: ' + (liveDir ? '«' + liveDir.name + '» (' + (liveDir.kind || typeof liveDir) + ')' : 'NINGUNA')); } catch (e) { if (ask) ldg('no puedo leer la carpeta guardada: ' + e.name + ' ' + e.message); } }
  if (!liveDir) return null;
  try {
    let p = await liveDir.queryPermission({ mode: 'readwrite' }); if (ask) ldg('permiso ahora: ' + p);
    if (p !== 'granted' && ask) { p = await liveDir.requestPermission({ mode: 'readwrite' }); ldg('al pedir permiso: ' + p); }
    liveDirWhy = p === 'granted' ? '' : p;
    return p === 'granted' ? liveDir : null;
  } catch (e) { liveDirWhy = (e && e.name) || 'error'; if (ask) ldg('fallo al pedir permiso: ' + e.name + ' · ' + e.message); console.warn('carpeta del grabador', e); return null; }
}
let liveDirWhy = '';   // por qué el navegador no dio permiso la última vez (para poder explicarlo)
const BROWSER_FILES = /Edg\//.test(navigator.userAgent) ? 'edge://settings/content/fileEditing' : 'chrome://settings/content/filesystem';
async function wfile(dir, name, data) { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); }
async function subDir(dir, path) { let d = dir; for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p); return d; }
async function fileAt(dir, path) { const parts = path.split('/').filter(Boolean), name = parts.pop(); const d = await subDir(dir, parts.join('/')); return (await d.getFileHandle(name)).getFile(); }
async function handleAt(dir, path) { const parts = path.split('/').filter(Boolean), name = parts.pop(); const d = await subDir(dir, parts.join('/')); return d.getFileHandle(name); }
/* pegar un enlace → el grabador lo descarga en «descargas/» → el agente saca los clips */
// si ese enlace (y ese trozo) ya se descargó entero, se usa el archivo que hay en «descargas» en vez de bajarlo otra vez
async function agReuseDownload(url, dlKey, whole) {
  try {
    const dir = await getLiveDir(true); if (!dir) return null;
    const m = await kv.get(dlKey);
    if (m && m.file) { try { const h = await handleAt(dir, m.file), f = await h.getFile(); if (f.size === m.size) return { file: f, handle: h, title: m.title || '' }; } catch {} }
    if (!whole) return null;
    // descargas de antes de esta versión: se busca por el enlace en sus .info.json (el vídeo completo es el más grande)
    const dd = await dir.getDirectoryHandle('descargas'), names = new Set();
    for await (const [n, h] of dd.entries()) if (h.kind === 'file') names.add(n);
    const norm = u => String(u || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    let best = null;
    for (const n of names) {
      if (!n.endsWith('.info.json')) continue;
      const base = n.slice(0, -10);
      if (!names.has(base + '.mp4') || names.has(base + '.mp4.ytdl') || [...names].some(x => x.startsWith(base + '.mp4-Frag') || x.startsWith(base + '.mp4.part'))) continue;
      let j; try { j = JSON.parse(await (await (await dd.getFileHandle(n)).getFile()).text()); } catch { continue; }
      if (![j.webpage_url, j.original_url, j.url].some(u => norm(u) === norm(url))) continue;
      const h = await dd.getFileHandle(base + '.mp4'), f = await h.getFile();
      if (f.size > 1e6 && (!best || f.size > best.file.size)) best = { file: f, handle: h, title: j.title || '' };
    }
    return best;
  } catch (e) { console.warn('reusar descarga', e); return null; }
@@solo-web
}
// web: el servidor descarga el vídeo del enlace y la página lo recibe
async function webFetch(url, from, to, say) {
  window.__cxLink = url;
  say('Descargando el clip…', 0);
  const r = await fetch('/api/clip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, from: from ?? null, to: to ?? null }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.id) throw new Error(j.error || 'no se pudo descargar');
  let st = null; const t0 = Date.now();
  for (;;) {
    await sleep(900);
    st = await (await fetch('/api/clip/' + j.id)).json().catch(() => null);
    if (!st) { if (Date.now() - t0 > 60000) throw new Error('el servidor no responde'); continue; }
    if (st.status === 'error') throw new Error(st.error || 'no se pudo descargar');
    if (st.status === 'done') break;
    if (Date.now() - t0 > 8 * 60000) throw new Error('la descarga tardó demasiado');
    say(st.status === 'queued' ? `Descargando el clip… (en cola: ${st.queue})` : 'Descargando el clip…', st.p || 0);
  }
  say('Descargando el clip…', 0.99);
  const b = await (await fetch('/api/clip/' + j.id + '/file')).blob();
  if (!b.size) throw new Error('el vídeo llegó vacío');
  const name = ((st.title || 'clip').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'clip') + '.mp4';
  return { file: new File([b], name, { type: 'video/mp4' }), handle: null, title: st.title || '', out: { file: name } };
@@fin
}
async function grabFetchSaved(dlKey, ...args) {
  const r = await grabFetch(...args);
  try { await kv.set(dlKey, { file: r.out.file, size: r.file.size, title: r.title || '', at: Date.now() }); } catch {}
  return r;
}
async function agFromLink(cl) {
  const url = $('agUrl').value.trim();
  if (!/^https?:\/\/\S+\.\S+/.test(url)) { toast('Pega primero el enlace del vídeo'); $('agUrl').focus(); return; }
  if (agentJob) { toast('El agente ya está trabajando'); return; }
  const btn = $('agLinkGo'); btn.disabled = true;
  try {
    const rg = agRange(); if (rg === false) return;
    const dlKey = 'agdl:' + url + '|' + (rg ? Math.round(rg.from) : '') + '|' + (rg && rg.to != null ? Math.round(rg.to) : '');
    const old = await agReuseDownload(url, dlKey, !rg);
    if (old) { toast('Este directo ya estaba descargado: uso el archivo que tienes'); btn.disabled = false; runAgent(cl, old.file, old.handle, old.title ? '🔗 ' + old.title : null); return; }
    const r = await grabFetchSaved(dlKey, url, rg ? String(Math.round(rg.from)) : '', rg && rg.to != null ? String(Math.round(rg.to)) : '', (m, p) => agProg(m.startsWith('Abre') ? 'Abre el Grabador Clipzi' : 'Descargando el vídeo…', p == null ? null : 0.95 * p, m.startsWith('Abre') ? m : url));
    toast('Descargado: ' + (r.title || r.file.name));
    btn.disabled = false;
    runAgent(cl, r.file, r.handle, r.title ? '🔗 ' + r.title : null);
  } catch (e) {
    console.warn(e);
    agProg('No se pudo descargar', null, e.auth ? e.message : e.message + ' — revisa que el enlace sea público y que la ventana del grabador siga abierta.');
  } finally { btn.disabled = false; }
}
async function rtext(dir, path) { try { return await (await fileAt(dir, path)).text(); } catch { return null; } }
const rjsonl = t => (t || '').split('\n').map(l => { try { return l.trim() ? JSON.parse(l) : null; } catch { return null; } }).filter(Boolean);
async function writeGrabadorFiles() {
  const d = await getLiveDir(false); if (!d) return;
  const py = $('grabPy').textContent.replace(/^\n/, ''), ver = t => +((/GRABADOR_VERSION = (\d+)/.exec(t || '') || [])[1] || 0);
  const old = await rtext(d, 'clipzi_grabador.py');
  if (!old || ver(old) <= ver(py)) await wfile(d, 'clipzi_grabador.py', py);   // nunca se pone una versión más vieja encima
  await wfile(d, 'Grabador Clipzi.bat', $('grabBat').textContent.replace(/^\n/, '').replace(/\r?\n/g, '\r\n'));
  await wfile(d, 'Probar con un video.bat', $('grabTest').textContent.replace(/^\n/, '').replace(/\r?\n/g, '\r\n'));
}
async function getLive(cl) {
  const st = await getClientStore(cl.id);
  const L = Object.assign({ kick: /westcol/i.test(cl.name) ? 'westcol' : '', clippers: '', ai: false }, st.live || {});
  return L;
}
async function saveLive(cl, L) { const st = await getClientStore(cl.id); st.live = L; try { await kv.set('client:' + cl.id, st); } catch {} await writeLiveConfig(); }
async function writeLiveConfig() {
  const d = await getLiveDir(false); if (!d) return;
  const canales = []; let anyAI = false;
  for (const c of clients) {
    const L = await getLive(c); if (L.ai && L.kick && L.kick.trim()) anyAI = true;
    if (L.kick && L.kick.trim()) canales.push({ kick: L.kick.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0], client: c.name, clippers: (L.clippers || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean) });
  }
  // lo que no se está usando se le dice al grabador, para que no trabaje para nada
  const apagados = [...critOff()];
  if (!anyAI && !apagados.includes('ia')) apagados.push('ia');   // la IA que escucha no está puesta en ningún cliente
  let trOn = true; try { trOn = lvTrOn(); } catch {}
  if (!trOn) apagados.push('voz');   // transcripción en directo en pausa
  try { await wfile(d, 'config.json', JSON.stringify({ canales, apagados, actualizado: new Date().toISOString() }, null, 2)); } catch (e) { console.warn(e); }
}
// el grabador tiene que saber siempre qué está encendido: se revisa cada 10 s y se le escribe si ha cambiado o si aún no se le ha dicho
let liveCfgSeen = null, liveCfgBusy = false;
setInterval(async () => {
  if (liveCfgBusy) return; liveCfgBusy = true;
  try {
    const d = await getLiveDir(false); if (!d) return;
    let trOn = true; try { trOn = lvTrOn(); } catch {}
    const cur = JSON.stringify([[...critOff()], trOn]);
    if (cur !== liveCfgSeen) { await writeLiveConfig(); liveCfgSeen = cur; }
  } catch {} finally { liveCfgBusy = false; }
}, 10000);

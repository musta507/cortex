/* ---------- pasar todos tus datos (creadores, plantillas, logos, fuentes, música, claves) de Chrome a la aplicación ---------- */
const CX_APP = !!(window.cortexApp && window.cortexApp.isApp);
// la app se actualiza sola: cuando deja lista una versión nueva de Cortex, se avisa (se usa al recargar)
try { if (CX_APP && window.cortexApp.onUpdate) window.cortexApp.onUpdate(d => { if (d && d.que === 'cortex') toastLong('✨ Hay una versión nueva de Cortex lista. Se usará cuando pulses F5 o vuelvas a abrir la app (termina antes lo que estés haciendo).'); }); } catch {}
async function cxEnc(v) {
  if (v instanceof Blob) return { __b: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(v); }), __n: v.name || null };
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) { const u = new Uint8Array(v.buffer ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return { __ab: btoa(s), __t: ArrayBuffer.isView(v) ? v.constructor.name : 'ArrayBuffer' }; }
  if (typeof FileSystemHandle !== 'undefined' && v instanceof FileSystemHandle) return null;   // las carpetas se vuelven a elegir en la app
  if (Array.isArray(v)) return Promise.all(v.map(cxEnc));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await cxEnc(v[k]); return o; }
  return v;
}
async function cxDec(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (v.__b) { const b = await (await fetch(v.__b)).blob(); return v.__n ? new File([b], v.__n, { type: b.type }) : b; }
    if (v.__ab != null) { const bin = atob(v.__ab), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return v.__t === 'ArrayBuffer' ? u.buffer : v.__t === 'Uint8Array' ? u : (window[v.__t] ? new window[v.__t](u.buffer) : u.buffer); }
    const o = {}; for (const k of Object.keys(v)) o[k] = await cxDec(v[k]); return o;
  }
  if (Array.isArray(v)) return Promise.all(v.map(cxDec));
  return v;
}
async function cxDump() {
  const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(clipzi|cortex)/.test(k)) ls[k] = localStorage.getItem(k); }
  const kvAll = await db.tx('kv', 'readonly', st => st.getAll()), kvKeys = await db.tx('kv', 'readonly', st => st.getAllKeys());
  const kvOut = []; for (let i = 0; i < kvKeys.length; i++) { const e = await cxEnc(kvAll[i]); if (e !== null) kvOut.push([kvKeys[i], e]); }
  const mus = []; for (const m of (await db.all()) || []) mus.push(await cxEnc(m));
  return { v: 1, at: Date.now(), ls, kv: kvOut, music: mus };
}
async function cxLoad(d) {
  if (!d || d.v !== 1) throw new Error('archivo no válido');
  for (const [k, v] of Object.entries(d.ls || {})) { try { localStorage.setItem(k, v); } catch {} }
  for (const [k, v] of d.kv || []) { const x = await cxDec(v); await db.tx('kv', 'readwrite', st => st.put(x, k)); }
  for (const m of d.music || []) { try { await db.put(await cxDec(m)); } catch {} }
}
// en Chrome: guardar la copia en la carpeta del grabador (la app la lee sola al abrirse por primera vez)
async function cxToApp() {
  let dir = await getLiveDir(true);
  if (!dir) { try { dir = await window.showDirectoryPicker({ id: 'grabador', mode: 'readwrite' }); } catch { return; } }
  toast('📦 Preparando tus datos…');
  try { const d = await cxDump(); await wfile(dir, 'cortex-datos.json', JSON.stringify(d)); toast('✅ Datos listos: abre la aplicación Cortex y se cargarán solos'); }
  catch (e) { console.warn(e); toast('No se pudieron guardar tus datos: ' + (e.message || e)); }
}
// en la app: la primera vez se cargan solos los datos que dejaste en la carpeta del grabador
setTimeout(async () => {
  const bt = $('cxToAppB'); if (bt) { bt.hidden = CX_APP; bt.onclick = cxToApp; }
  if (!CX_APP) return;
  try {
    if (localStorage.getItem('cortex-app-datos')) return;
    const txt = await window.cortexApp.readDatos(); if (!txt) return;
    const d = JSON.parse(txt); await cxLoad(d); localStorage.setItem('cortex-app-datos', String(d.at || Date.now()));
    toast('✅ Tus datos de Chrome ya están en la app'); setTimeout(() => location.reload(), 900);
  } catch (e) { console.warn('datos de Chrome', e); }
}, 1200);
@@fin
// configuración del logo: se recuerda siempre, aparte de plantillas y proyectos
const logoCfgNow = () => ({ size: $('logoSize').value, op: $('logoOp').value, rot: $('logoRot').value, x: logoPos.x, y: logoPos.y, lock: trk.logo.lock });
function saveLogoCfg() { persistClient(); }   // posición, tamaño, opacidad y candado: de cada cliente
function applyLogoCfg(c) {
  if (!c) return;
  $('logoSize').value = c.size; $('logoOp').value = c.op; $('logoRot').value = c.rot || 0; logoPos.x = c.x; logoPos.y = c.y; trk.logo.lock = !!c.lock;
  ['logoSize', 'logoOp'].forEach(id => $(id + 'V').textContent = $(id).value + '%'); $('logoRotV').textContent = $('logoRot').value + '°';
}
function loadLogoCfg() {
  try {
    const c = JSON.parse(localStorage.getItem('clipzi-logo-cfg') || 'null'); if (!c) return;
    $('logoSize').value = c.size; $('logoOp').value = c.op; logoPos.x = c.x; logoPos.y = c.y; trk.logo.lock = !!c.lock;
    ['logoSize', 'logoOp'].forEach(id => $(id + 'V').textContent = $(id).value + '%');
  } catch {}
}
['logoSize', 'logoOp', 'logoRot'].forEach(id => $(id).addEventListener('input', saveLogoCfg));
// el giro se pega a 0°, 90°, −90° y 180°
$('logoRot').addEventListener('input', () => { const v = +$('logoRot').value; for (const m of [-180, -90, 0, 90, 180]) if (v !== m && Math.abs(v - m) <= 3) { $('logoRot').value = m; $('logoRotV').textContent = m + '°'; } });

/* ====== editor tipo CapCut: paneles, pestañas y línea de tiempo ====== */
const LEFT = { media: ['s1'], subs: ['s3'], text: ['sX'], audio: ['s6'], tpl: ['sT'] };
const RIGHT = { video: ['s5', 's7'], title: ['s2'], style: ['s4'], logo: ['sL'] };
for (const [tab, ids] of Object.entries(LEFT)) ids.forEach(id => document.querySelector(`.tabp[data-tab="${tab}"]`).append($(id)));
for (const [tab, ids] of Object.entries(RIGHT)) ids.forEach(id => document.querySelector(`.itabp[data-itab="${tab}"]`).append($(id)));
$('resumeSlot').append($('resume'));
document.querySelectorAll('.sec').forEach(s => s.classList.add('open'));
function showLeft(tab) {
  document.querySelectorAll('#rail button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tabp').forEach(p => p.hidden = p.dataset.tab !== tab);
}
function showInsp(tab) {
  document.querySelectorAll('.itabs button').forEach(b => b.classList.toggle('on', b.dataset.itab === tab));
  document.querySelectorAll('.itabp').forEach(p => p.hidden = p.dataset.itab !== tab);
  if (tab === 'video') setTimeout(() => typeof renderBgThumbs === 'function' && renderBgThumbs(), 30);
}
document.querySelectorAll('#rail button').forEach(b => b.onclick = () => showLeft(b.dataset.tab));
document.querySelectorAll('.itabs button').forEach(b => b.onclick = () => showInsp(b.dataset.itab));
// compatibilidad con el código anterior: "abrir sección" = mostrar su pestaña
function openSec(id) {
  for (const [t, ids] of Object.entries(LEFT)) if (ids.includes(id)) return showLeft(t);
  for (const [t, ids] of Object.entries(RIGHT)) if (ids.includes(id)) return showInsp(t);
}
let selected = null;   // elemento elegido en la vista previa
const INSP_FOR = { title: 'title', sub: 'style', logo: 'logo', video: 'video', image: 'video', seam: 'video', cam: 'video', edgeT: 'video', edgeB: 'video', p2: 'video', p3: 'video', p4: 'video' };

/* ====== línea de tiempo (tipo CapCut): trozos, cortes, textos, subtítulos, pistas y atajos ====== */
let tlSig = '', thumbs = [], thumbStep = 1, thumbT0 = 0, thumbsFor = null, magnet = true;
const tsel = new Set();          // seleccionados: 'v:id' (clip), 't:id' (texto), 'c:i' (subtítulo), 'title', 'audio', 'logo'
let clipBoard = null;
const tlPad = 8;
const TRACKS = [
  { id: 'text', name: 'Texto', el: 'trText', eye: true },
  { id: 'title', name: 'Título', el: 'trTitle', eye: true },
  { id: 'caps', name: 'Subtítulos', el: 'trCaps', eye: true },
  { id: 'video', name: 'Clip', el: 'trVideo', mute: true },
  { id: 'audio', name: 'Música', el: 'trAudio', mute: true },
  { id: 'logo', name: 'Logo', el: 'trLogo', eye: true },
];
const ICON = {
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
};
// etiquetas de las pistas con ojo / altavoz / candado
(function buildLabels() {
  const L = $('tlLabels'); L.innerHTML = '<div class="lb"></div>';
  for (const t of TRACKS) {
    const d = document.createElement('div'); d.className = 'lb'; d.dataset.tr = t.id;
    d.innerHTML = `<span>${t.name}</span>` + (t.eye ? `<button class="ib" data-act="hide"></button>` : '') + (t.mute ? `<button class="ib" data-act="mute"></button>` : '') + `<button class="ib" data-act="lock"></button>`;
    d.querySelectorAll('button').forEach(b => b.onclick = () => {
      const a = b.dataset.act; trk[t.id][a] = !trk[t.id][a];
      if (t.id === 'logo' && a === 'lock') saveLogoCfg();
      toast({ hide: trk[t.id].hide ? `${t.name}: oculto` : `${t.name}: visible`, mute: trk[t.id].mute ? `${t.name}: silenciado` : `${t.name}: con sonido`, lock: trk[t.id].lock ? `${t.name}: bloqueado` : `${t.name}: desbloqueado` }[a]);
      if (trk[t.id].lock) [...tsel].forEach(k => { if (selTrack(k) === t.id) tsel.delete(k); });
      syncTrackUI(); pushHistory();
    });
    L.append(d);
  }
})();
function syncTrackUI() {
  for (const t of TRACKS) {
    const d = document.querySelector(`.lb[data-tr="${t.id}"]`), st = trk[t.id];
    const set = (act, on, icOn, icOff, tOn, tOff) => { const b = d.querySelector(`[data-act="${act}"]`); if (!b) return; b.innerHTML = on ? icOn : icOff; b.classList.toggle('off', on); b.title = on ? tOn : tOff; };
    set('hide', st.hide, ICON.eyeOff, ICON.eye, 'Oculto: pulsa para mostrar', 'Ocultar en el vídeo');
    set('mute', st.mute, ICON.mute, ICON.vol, 'Silenciado: pulsa para activar el sonido', 'Silenciar');
    set('lock', st.lock, ICON.lock, ICON.unlock, 'Bloqueado: pulsa para desbloquear', 'Bloquear (no se puede editar)');
    const tr = $(t.el); tr.classList.toggle('hid', !!(st.hide || st.mute)); tr.classList.toggle('lock', !!st.lock);
  }
  $('logoLock').checked = trk.logo.lock; $('logoShow').checked = !trk.logo.hide;
  $('logoSize').disabled = trk.logo.lock; ['logoCenter', 'logoCorner'].forEach(id => $(id).disabled = trk.logo.lock);
  $('logoLockHint').hidden = !trk.logo.lock;
  tlSig = '';
}
const selTrack = k => k.startsWith('v:') ? 'video' : k.startsWith('t:') ? 'text' : k.startsWith('c:') ? 'caps' : k;

/* geometría */
let ppsLock = null;   // mientras arrastras, la escala no cambia
function pps() { if (ppsLock) return ppsLock; const D = totalDur() || 10; return Math.max(2, ($('tlScroll').clientWidth - 40) / D * +$('tlZoom').value); }
const xOf = T => T * pps();                                   // dentro de una pista
function tAtClient(clientX) { const r = $('tlInner').getBoundingClientRect(); return (clientX - r.left - tlPad) / pps(); }

/* miniaturas: una por segundo (o menos en clips largos), se generan poco a poco */
async function buildThumbs() {
  if (!file || thumbsFor === file) return;
  const my = file; thumbsFor = file; thumbs = [];
  const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
  await new Promise(r => { tv.onloadeddata = r; tv.onerror = r; });
  const d = tv.duration || vid.duration || 1, [r0, r1] = srcRange();
  thumbT0 = r0; thumbStep = Math.max(0.5, ((r1 - r0) || d) / 160);
  const n = Math.ceil(((r1 - r0) || d) / thumbStep);
  for (let i = 0; i < n; i++) {
    if (thumbsFor !== my) return;
    tv.currentTime = Math.min(d - 0.05, r0 + (i + 0.5) * thumbStep);
    await new Promise(r => { tv.onseeked = r; setTimeout(r, 800); });
    const c = document.createElement('canvas'); c.height = 52; c.width = Math.round(52 * (tv.videoWidth || 16) / (tv.videoHeight || 9));
    try { c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height); } catch {}
    thumbs[i] = c;
    if (i % 6 === 5) drawTlCanvas();
  }
  drawTlCanvas();
}

/* regla y miniaturas: se dibujan solo en la parte visible (rápido con cualquier zoom) */
const rulerCv = document.createElement('canvas'), vidCv = document.createElement('canvas');
rulerCv.style.cssText = 'position:absolute;top:0;height:100%;pointer-events:none';
vidCv.style.cssText = 'position:absolute;top:0;height:100%;pointer-events:none;border-radius:5px';
$('ruler').append(rulerCv);
function drawTlCanvas() {
  const sc = $('tlScroll'), k = pps(), D = totalDur(), dpr = devicePixelRatio || 1;
  const vis0 = Math.max(0, sc.scrollLeft - tlPad), visW = sc.clientWidth;
  // regla
  const rh = $('ruler').clientHeight || 22;
  rulerCv.style.left = vis0 + 'px'; rulerCv.style.width = visW + 'px';
  rulerCv.width = Math.round(visW * dpr); rulerCv.height = Math.round(rh * dpr);
  const r = rulerCv.getContext('2d'); r.scale(dpr, dpr); r.clearRect(0, 0, visW, rh);
  const fps = srcFpsV();
  const steps = [1 / fps, 2 / fps, 5 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const major = steps.find(s => s * k >= 70) || 300;
  const minor = steps.slice().reverse().find(s => s < major && s * k >= 9 && Math.abs(major / s - Math.round(major / s)) < 1e-6) || major / 5;
  r.font = '500 10px "JetBrains Mono", monospace'; r.textBaseline = 'bottom';
  const i0 = Math.floor(vis0 / k / minor), ratio = Math.round(major / minor);
  for (let i = i0; ; i++) {
    const t = i * minor;
    if (t > Math.min(D, (vis0 + visW) / k) + minor || t > D + 1e-6) break;
    const x = t * k - vis0, isMaj = i % ratio === 0;
    r.fillStyle = isMaj ? '#8e8e96' : '#3a3a40'; r.fillRect(Math.round(x), rh - (isMaj ? 10 : 5), 1, isMaj ? 10 : 5);
    if (isMaj) { r.fillStyle = '#8e8e96'; r.fillText(major < 1 ? fmtTC(t) : fmt(t), x + 3, rh - 9); }
  }
  // miniaturas del clip (cada trozo con lo que muestra del original)
  const tr = $('trVideo'), th = tr.clientHeight || 52;
  if (vidCv.parentNode !== tr) tr.prepend(vidCv);
  vidCv.style.left = vis0 + 'px'; vidCv.style.width = visW + 'px';
  vidCv.width = Math.round(visW * dpr); vidCv.height = Math.round(th * dpr);
  const v = vidCv.getContext('2d'); v.scale(dpr, dpr); v.clearRect(0, 0, visW, th);
  let acc = 0;
  for (const g of segs) {
    const x0 = acc * k - vis0, x1 = (acc + g.e - g.s) * k - vis0; acc += g.e - g.s;
    if (x1 < 0 || x0 > visW) continue;
    v.save(); v.beginPath(); (v.roundRect ? v.roundRect(x0 + 1, 0, Math.max(2, x1 - x0 - 2), th, 5) : v.rect(x0 + 1, 0, x1 - x0 - 2, th)); v.clip();
    v.fillStyle = '#1e3a5a'; v.fillRect(x0, 0, x1 - x0, th);
    const tw = thumbs.find(Boolean)?.width || Math.round(th * 16 / 9);
    for (let px = Math.max(x0, x0 + Math.floor((0 - x0) / tw) * tw); px < Math.min(x1, visW); px += tw) {
      const tSrc = g.s + (px + tw / 2 - x0) / k, im = thumbs[Math.min(thumbs.length - 1, Math.max(0, Math.floor((tSrc - thumbT0) / thumbStep)))];
      if (im) v.drawImage(im, px, 0, tw, th);
    }
    v.restore();
  }
}
const fmtF = t => { const m = Math.floor(t / 60), s = t % 60; return m + ':' + s.toFixed(s < 10 ? 2 : 2).padStart(5, '0'); };
const fmtTC = t => { const fps = Math.round(srcFpsV()), F = Math.round(Math.max(0, t) * fps * 1000) / 1000, fr = Math.floor(F + 1e-6), tot = Math.floor(fr / fps), f = fr - tot * fps;
  return String(Math.floor(tot / 60)).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0') + ':' + String(f).padStart(2, '0'); };

/* bloques */
function renderTimeline() {
  const D = totalDur(), k = pps();
  $('tlInner').style.width = Math.max($('tlScroll').clientWidth, D * k + 40) + 'px';
  TRACKS.forEach(t => [...$(t.el).children].forEach(c => { if (c !== vidCv) c.remove(); }));
  const block = (track, cls, a, b, text, key, opts = {}) => {
    const el = document.createElement('div'); el.className = 'clipb ' + cls + (key && tsel.has(key) ? ' sel' : '');
    el.style.left = (a * k) + 'px'; el.style.width = Math.max(3, (b - a) * k - 2) + 'px';
    if (text) { const sp = document.createElement('span'); sp.textContent = text; sp.style.cssText = 'overflow:hidden;text-overflow:ellipsis;pointer-events:none;position:relative;z-index:1'; el.append(sp); }
    if (key) el.dataset.key = key;
    if (opts.trim) { const l = document.createElement('i'); l.className = 'hd l'; l.dataset.edge = 'l'; const r = document.createElement('i'); r.className = 'hd r'; r.dataset.edge = 'r'; el.append(l, r); }
    $(track).append(el); return el;
  };
  const empty = (track, text, onclick) => { const e = document.createElement('div'); e.className = 'empty'; e.textContent = text; e.addEventListener('pointerdown', ev => { ev.stopPropagation(); onclick(); }); $(track).append(e); };
  if (!loaded || !D) { empty('trVideo', 'Sube un clip desde Medios', () => showLeft('media')); drawTlCanvas(); return; }
  // textos
  texts.forEach(t => block('trText', 'txt', t.start, t.end, t.text.replace(/\n/g, ' '), 't:' + t.id, { trim: true }));
  if (!texts.length) empty('trText', '+ Añadir texto', addText);
  // título
  if ($('title').value.trim()) block('trTitle', 'title', 0, D, $('title').value.trim(), 'title');
  else empty('trTitle', 'Sin título', () => showInsp('title'));
  // subtítulos (se ven donde está su trozo del clip)
  if (captions.length) {
    let acc = 0;
    for (const g of segs) {
      captions.forEach((c, i) => {
        const a = Math.max(c.start, g.s), b = Math.min(c.end, g.e);
        if (b - a > 0.01) block('trCaps', 'cap', acc + a - g.s, acc + b - g.s, c.words.map(w => w.text.trim()).join(' '), 'c:' + i, { trim: true }).dataset.i = i;
      });
      acc += g.e - g.s;
    }
  } else empty('trCaps', 'Sin subtítulos · genéralos en Subtítulos', () => showLeft('subs'));
  // clip: un bloque por trozo
  let acc = 0;
  segs.forEach((g, i) => {
    const el = block('trVideo', 'vid', acc, acc + g.e - g.s, '', 'v:' + g.id, { trim: true });
    el.style.background = 'transparent';
    const lb = document.createElement('span'); lb.className = 'lbl'; lb.textContent = fmt(g.e - g.s); el.append(lb);
    // palabras censuradas (silencio): marca roja, clic para quitarla
    mutes.forEach((m, mi) => { if (m.e > g.s && m.s < g.e) {
      const mk = document.createElement('i'); mk.className = 'mu'; mk.style.left = ((Math.max(m.s, g.s) - g.s) * k) + 'px'; mk.style.width = Math.max(3, (Math.min(m.e, g.e) - Math.max(m.s, g.s)) * k) + 'px';
      mk.title = 'Palabra silenciada' + (m.w ? ` («${m.w}»)` : '') + ' · clic para quitar el silencio'; mk.dataset.mute = mi; el.append(mk); } });
    // marcas de cambio de encuadre (Reacción por tramos)
    if (layoutMode === 'react') zones.forEach((z, zi) => { if (zi === 0) return; if (z.s > g.s + 0.01 && z.s < g.e - 0.01) {
      const m = document.createElement('i'); m.className = 'zm'; m.style.left = ((z.s - g.s) * k) + 'px'; m.dataset.zone = zi;
      m.title = 'Cambio de encuadre: arrástralo para moverlo'; el.append(m); } });
    acc += g.e - g.s;
  });
  // música
  if (music.cur) {
    const avail = Math.max(0, (music.cur.dur || D) - +$('mStart').value);
    block('trAudio', 'aud', 0, $('mLoop').checked ? D : Math.min(D, avail), '♪ ' + music.cur.name, 'audio');
  } else empty('trAudio', 'Sin música', () => showLeft('audio'));
  if (logo) block('trLogo', 'logo', 0, D, trk.logo.lock ? '🔒 Logo' : 'Logo', 'logo');
  else empty('trLogo', 'Sin logo', () => showInsp('logo'));
  drawTlCanvas();
}

/* selección */
function selectKey(key, e) {
  const multi = e && (e.ctrlKey || e.metaKey || e.shiftKey);
  if (!multi) tsel.clear();
  if (multi && tsel.has(key)) tsel.delete(key); else tsel.add(key);
  // la vista previa y el panel siguen a lo seleccionado
  if (key.startsWith('t:')) { selected = 'txt:' + key.slice(2); showLeft('text'); fillTextPanel(); }
  else if (key.startsWith('c:')) { selected = 'sub'; showInsp('style'); }
  else if (key === 'title') { selected = 'title'; showInsp('title'); }
  else if (key === 'logo') { selected = 'logo'; showInsp('logo'); }
  else if (key === 'audio') showLeft('audio');
  else if (key.startsWith('v:')) { selected = 'video'; showInsp('video'); }
  if (!key.startsWith('t:') && selTextId() != null) { selected = selected && selected.startsWith('txt:') ? null : selected; fillTextPanel(); }
  tlSig = '';
}
function selItems(type) { return [...tsel].filter(k => k.startsWith(type + ':')).map(k => k.slice(2)); }

/* puntos del imán */
function snapPoints(exclude) {
  const pts = [0, totalDur(), curT()];
  let acc = 0; for (const g of segs) { acc += g.e - g.s; pts.push(acc); }
  texts.forEach(t => { if (exclude !== 't:' + t.id) pts.push(t.start, t.end); });
  return pts;
}
function snapT(T, exclude) {
  if (!magnet) { $('snapline').hidden = true; return T; }
  const k = pps(); let best = null;
  for (const p of snapPoints(exclude)) if (Math.abs(p - T) * k < 9 && (best == null || Math.abs(p - T) < Math.abs(best - T))) best = p;
  $('snapline').hidden = best == null; if (best != null) $('snapline').style.left = (tlPad + best * k) + 'px';
  return best == null ? T : best;
}

/* arrastrar en la línea de tiempo */
let tlDrag = null;
$('tlInner').addEventListener('pointerdown', e => {
  if (!loaded || exporting || e.button !== 0) return;
  const mu = e.target.closest('.mu');
  if (mu) { const m = mutes[+mu.dataset.mute]; mutes.splice(+mu.dataset.mute, 1); toast('Silencio quitado' + (m && m.w ? ` («${m.w}»)` : '')); pushHistory(); tlSig = ''; e.stopPropagation(); return; }
  const blk = e.target.closest('.clipb'), zm = e.target.closest('.zm');
  $('tlInner').setPointerCapture(e.pointerId);
  if (zm) { const zi = +zm.dataset.zone; tlDrag = { mode: 'zone', zi, x0: e.clientX, s0: zones[zi].s, moved: false }; ppsLock = pps(); e.preventDefault(); return; }
  if (!blk || !blk.dataset.key) {   // regla o hueco: mover el cabezal
    if (!(e.ctrlKey || e.metaKey) && !e.target.closest('.playhead') && e.target.closest('.tlt')) { tsel.clear(); tlSig = ''; }
    tlDrag = { mode: 'scrub' }; vid.pause(); playEnd = false; seekOut(tAtClient(e.clientX)); return;
  }
  const key = blk.dataset.key, tr = selTrack(key);
  if (trk[tr] && trk[tr].lock) { toast('Pista bloqueada: quita el candado para editarla'); tlDrag = null; return; }
  if (!tsel.has(key) || e.ctrlKey || e.metaKey || e.shiftKey) selectKey(key, e);
  const edge = e.target.dataset.edge || null;
  tlDrag = { mode: edge ? 'trim' : 'move', edge, key, x0: e.clientX, moved: false };
  ppsLock = pps();
  if (key.startsWith('v:')) { const g = segs.find(x => x.id === +key.slice(2)); tlDrag.g0 = { ...g }; tlDrag.i = segs.indexOf(g); }
  if (key.startsWith('t:')) tlDrag.t0 = { ...txtById(+key.slice(2)) };
  if (key.startsWith('c:')) { const c = captions[+key.slice(2)]; tlDrag.c0 = JSON.parse(JSON.stringify(c)); }
  e.preventDefault();
});
$('tlInner').addEventListener('pointermove', e => {
  const d = tlDrag; if (!d) return;
  if (d.mode === 'scrub') { seekOut(tAtClient(e.clientX)); return; }
  const k = pps(), dT = (e.clientX - d.x0) / k;
  if (Math.abs(e.clientX - d.x0) > 2) d.moved = true;
  if (!d.moved) return;
  if (d.mode === 'zone') {
    const z = zones[d.zi], p = zones[d.zi - 1];
    let s = Math.min(z.e - 0.1, Math.max(p.s + 0.1, d.s0 + dT));
    z.s = s; p.e = s; tlSig = ''; return;
  }
  if (d.key.startsWith('v:')) {
    const g = segs[d.i]; if (!g) return;
    if (d.mode === 'trim' && d.edge === 'l') g.s = Math.min(g.e - 0.1, Math.max(0, d.g0.s + dT));
    else if (d.mode === 'trim') {
      const outEnd = snapT(segStart(d.i) + (d.g0.e - d.g0.s) + dT, d.key);
      g.e = Math.max(g.s + 0.1, Math.min(srcDur(), d.g0.s + outEnd - segStart(d.i)));
    }
    if (d.mode === 'trim') { const T0 = segStart(d.i); pseg = d.i; vid.currentTime = d.edge === 'l' ? g.s : Math.max(g.s, g.e - 0.001); void T0; }
    tlSig = ''; return;
  }
  if (d.key.startsWith('t:')) {
    const t = txtById(+d.key.slice(2)), o = d.t0, D = totalDur();
    if (d.mode === 'move') {
      const len = o.end - o.start; let a = Math.max(0, Math.min(D - len, o.start + dT));
      const sa = snapT(a, d.key); if (sa !== a) a = sa; else { const sb = snapT(a + len, d.key); a = sb - len; }
      t.start = Math.max(0, a); t.end = t.start + len;
    } else if (d.edge === 'l') t.start = Math.max(0, Math.min(t.end - 0.1, snapT(o.start + dT, d.key)));
    else t.end = Math.min(D, Math.max(t.start + 0.1, snapT(o.end + dT, d.key)));
    fillTextPanel(); tlSig = ''; return;
  }
  if (d.key.startsWith('c:')) {
    const c = captions[+d.key.slice(2)], o = d.c0;
    if (d.mode === 'move') { const sh = Math.max(-o.start, dT); c.start = o.start + sh; c.end = o.end + sh; c.words = o.words.map(w => ({ ...w, start: w.start + sh, end: w.end + sh })); }
    else {
      if (d.edge === 'l') c.start = Math.min(o.end - 0.1, Math.max(0, o.start + dT)); else c.end = Math.max(o.start + 0.1, o.end + dT);
      const sp0 = o.end - o.start, sp = c.end - c.start;
      c.words = o.words.map(w => ({ ...w, start: c.start + (w.start - o.start) * sp / sp0, end: c.start + (w.end - o.start) * sp / sp0 }));
    }
    tlSig = ''; return;
  }
});
function endTlDrag() {
  const d = tlDrag; tlDrag = null; $('snapline').hidden = true; ppsLock = null; tlSig = '';
  if (!d || d.mode === 'scrub') return;
  if (!d.moved) {   // clic sin arrastrar: seleccionar solo esto
    if (d.key && tsel.size > 1 && tsel.has(d.key)) selectKey(d.key);
    return;
  }
  if (d.key && d.key.startsWith('c:')) { captions.sort((a, b) => a.start - b.start); allWords = captions.flatMap(c => c.words.filter(w => w.text)); renderCapList(); tsel.clear(); }
  pushHistory(); tlSig = '';
}
$('tlInner').addEventListener('pointerup', endTlDrag);
$('tlInner').addEventListener('pointercancel', endTlDrag);
$('tlInner').addEventListener('dblclick', e => {
  const blk = e.target.closest('.clipb'); if (!blk || !blk.dataset.key) return;
  const key = blk.dataset.key;
  if (key.startsWith('c:')) { const i = +key.slice(2), c = captions[i]; seekSrc(c.start + 0.01); showLeft('subs'); const inp = $('cap' + i); if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); inp.select(); } }
  if (key.startsWith('t:')) { const t = txtById(+key.slice(2)); seekOut(t.start + 0.01); selectText(t.id); setTimeout(() => { $('txtText').focus(); $('txtText').select(); }, 20); }
  if (key === 'title') { showInsp('title'); $('title').focus(); }
});

/* zoom: Ctrl + rueda (centrado en el ratón), rueda sola = desplazar */
function setTlZoom(z, anchorClientX) {
  const sc = $('tlScroll'), el = $('tlZoom');
  z = Math.min(+el.max, Math.max(+el.min, z));
  const ax = anchorClientX != null ? anchorClientX : null;
  const T = ax != null ? tAtClient(ax) : curT();
  const vx = ax != null ? ax - sc.getBoundingClientRect().left : (xOf(curT()) + tlPad - sc.scrollLeft);
  el.value = z; renderTimeline(); tlSig = sigNow();
  sc.scrollLeft = Math.max(0, T * pps() + tlPad - vx);
  drawTlCanvas();
}
$('tlScroll').addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); setTlZoom(+$('tlZoom').value * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX); return; }
  const sc = $('tlScroll');
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && sc.scrollWidth > sc.clientWidth) { e.preventDefault(); sc.scrollLeft += e.deltaY; }
}, { passive: false });
$('tlScroll').addEventListener('scroll', drawTlCanvas);
$('tlZoom').addEventListener('input', () => setTlZoom(+$('tlZoom').value));
$('tlZoomIn').onclick = () => setTlZoom(+$('tlZoom').value * 1.5);
$('tlZoomOut').onclick = () => setTlZoom(+$('tlZoom').value / 1.5);
$('tlFit').onclick = () => { setTlZoom(1); $('tlScroll').scrollLeft = 0; };
new ResizeObserver(() => { tlSig = ''; }).observe($('tlScroll'));


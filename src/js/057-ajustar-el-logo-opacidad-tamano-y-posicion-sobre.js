/* ---------- ajustar el logo (opacidad, tamaño y posición) sobre fondos verticales 9:16 de prueba ---------- */
const LGX = { bg: 'stream', img: null, drag: null, cache: {}, open: false };
const LGX_BGS = [
  { id: 'stream', n: 'Stream', sw: 'linear-gradient(135deg,#1e2a4a,#5b3b6e)' },
  { id: 'futbol', n: 'Fútbol', sw: '#2f7d3a' },
  { id: 'claro', n: 'Claro', sw: '#eeeeee' },
  { id: 'oscuro', n: 'Oscuro', sw: '#0b0b0d' },
  { id: 'color', n: 'Colorido', sw: 'linear-gradient(135deg,#ff3d6e,#ffcc33,#28d7ff)' },
  { id: 'mio', n: 'Tu imagen', sw: 'repeating-conic-gradient(#888 0 25%,#555 0 50%) 0 0/8px 8px' }
];
function lgxBg(id) {
  if (id === 'mio' && LGX.img) return LGX.img;
  if (LGX.cache[id]) return LGX.cache[id];
  const c = document.createElement('canvas'); c.width = 540; c.height = 960; const g = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 540, 960); };
  if (id === 'stream' || id === 'mio') {
    const l = g.createLinearGradient(0, 0, 540, 960); l.addColorStop(0, '#16203a'); l.addColorStop(.5, '#3a2c55'); l.addColorStop(1, '#1b2a2a'); g.fillStyle = l; g.fillRect(0, 0, 540, 960);
    for (let i = 0; i < 9; i++) blob(rnd() * 540, rnd() * 960, 80 + rnd() * 160, `hsla(${200 + rnd() * 140},70%,${45 + rnd() * 20}%,.55)`);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 300, 540, 360);            // la franja del juego
    for (let i = 0; i < 40; i++) { g.fillStyle = `hsla(${rnd() * 360},60%,60%,.5)`; g.fillRect(rnd() * 540, 300 + rnd() * 340, 4 + rnd() * 30, 4 + rnd() * 18); }
    g.fillStyle = '#c99a7b'; g.beginPath(); g.ellipse(270, 820, 70, 86, 0, 0, 7); g.fill();   // la cámara del streamer
    g.fillStyle = '#2b2b33'; g.fillRect(150, 890, 240, 70);
  } else if (id === 'futbol') {
    const l = g.createLinearGradient(0, 0, 0, 960); l.addColorStop(0, '#2c7a37'); l.addColorStop(1, '#1f5f2a'); g.fillStyle = l; g.fillRect(0, 0, 540, 960);
    for (let i = 0; i < 960; i += 80) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, i, 540, 40); }
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 480); g.lineTo(540, 480); g.stroke();
    g.beginPath(); g.arc(270, 480, 90, 0, 7); g.stroke(); g.strokeRect(150, -4, 240, 120); g.strokeRect(150, 844, 240, 120);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e33' : '#fff'; g.beginPath(); g.arc(60 + rnd() * 420, 140 + rnd() * 680, 10, 0, 7); g.fill(); }
  } else if (id === 'claro') {
    g.fillStyle = '#f1f1f1'; g.fillRect(0, 0, 540, 960);
    for (let i = 0; i < 6; i++) blob(rnd() * 540, rnd() * 960, 120 + rnd() * 120, 'rgba(200,205,215,.7)');
    g.fillStyle = '#ffffff'; g.fillRect(60, 320, 420, 300);
  } else if (id === 'oscuro') {
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 540, 960); blob(270, 480, 360, 'rgba(40,40,52,.8)');
  } else {
    const l = g.createLinearGradient(0, 0, 540, 960); l.addColorStop(0, '#ff3d6e'); l.addColorStop(.5, '#ffcc33'); l.addColorStop(1, '#28d7ff'); g.fillStyle = l; g.fillRect(0, 0, 540, 960);
    for (let i = 0; i < 10; i++) blob(rnd() * 540, rnd() * 960, 60 + rnd() * 140, `hsla(${rnd() * 360},95%,60%,.7)`);
  }
  if (id !== 'mio') LGX.cache[id] = c; return c;
}
function lgxBox() {
  if (!logo) return null; const lw = W * (+$('logoSize').value) / 100, lh = lw * logo.img.naturalHeight / logo.img.naturalWidth;
  return { x: logoPos.x - lw / 2, y: logoPos.y - lh / 2, w: lw, h: lh };
}
// la pantalla de prueba puede verse al 100 % o al 200 % (centrada en el logo)
function lgxView() {
  const z = LGX.zoom ? 2 : 1; if (z === 1) return { x: 0, y: 0, z };
  if (LGX.drag && LGX.drag.view) return LGX.drag.view;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  return { x: cl(logoPos.x - W / (2 * z), 0, W - W / z), y: cl(logoPos.y - H / (2 * z), 0, H - H / z), z };
}
function lgxDraw() {
  const cv = $('lgxCv'); if (!cv) return; const g = cv.getContext('2d'), v = lgxView(), m = cv.width / W * v.z, px = 1 / m;
  const bg = lgxBg(LGX.bg); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(m, 0, 0, m, -v.x * m, -v.y * m);
  const s = Math.max(W / bg.width, H / bg.height); g.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
  if ($('lgxTk').checked) {
    g.font = `700 ${22 * px}px Inter, system-ui, sans-serif`; g.textBaseline = 'middle';
    const z = (x, y, w, h, t) => { g.fillStyle = 'rgba(0,0,0,.42)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = px; g.setLineDash([6 * px, 5 * px]); g.strokeRect(x + px / 2, y + px / 2, w - px, h - px); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(t, x + 12 * px, y + 22 * px); };
    z(0, 0, W, 170, 'Arriba: Siguiendo · Para ti');
    z(930, 820, 150, 760, '');
    z(0, 1560, W, 360, 'Abajo: nombre, descripción y música');
    g.save(); g.translate(1005, 1200); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText('Botones', 0, 0); g.restore();
  }
  const b = lgxBox();
  if (b) {
    g.globalAlpha = (+$('logoOp').value) / 100; const rr = (+$('logoRot').value || 0) * Math.PI / 180; g.save(); g.translate(b.x + b.w / 2, b.y + b.h / 2); g.rotate(rr); g.drawImage(logo.img, -b.w / 2, -b.h / 2, b.w, b.h); g.restore(); g.globalAlpha = 1;
    if (LGX.drag || LGX.hover) { g.strokeStyle = trk.logo.lock ? 'rgba(255,190,80,.9)' : 'rgba(255,255,255,.9)'; g.lineWidth = 2 * px; g.setLineDash([5 * px, 4 * px]); g.strokeRect(b.x - 3 * px, b.y - 3 * px, b.w + 6 * px, b.h + 6 * px); g.setLineDash([]); }
    if (LGX.drag && LGX.drag.sx) { g.strokeStyle = 'rgba(110,151,255,.9)'; g.lineWidth = 1.5 * px; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); }
  }
  g.restore();
}
function lgxSync() {
  const box = $('lgx'); if (!box) return; const c = clientOf(curClient), has = !!logo, lk = !!trk.logo.lock;
  if (!has) LGX.open = false; box.hidden = !LGX.open; if (!LGX.open) return;
  $('lgxWho').textContent = ''; $('lgxEmpty').hidden = has;
  $('lgxOp').value = $('logoOp').value; $('lgxOpV').textContent = $('logoOp').value + '%';
  $('lgxSz').value = $('logoSize').value; $('lgxSzV').textContent = $('logoSize').value + '%';
  $('lgxRot').value = $('logoRot').value; $('lgxRotV').textContent = $('logoRot').value + '°';
  $('lgxLock').checked = lk;
  ['lgxOp', 'lgxSz', 'lgxRot'].forEach(id => $(id).disabled = !has || lk); $('lgxLock').disabled = !has;
  box.querySelectorAll('.lgx-pos button').forEach(x => x.disabled = !has || lk);
  $('lgxCv').className = has && !lk ? 'grab' : '';
  lgxDraw();
}
function lgxSave() { logoAuto.manual = false; logoAuto.dy = 0; saveLogoCfg(); lgxDraw(); }
setTimeout(() => {
  const cv = $('lgxCv'); if (!cv) return;
  const bgs = $('lgxBgs'), fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true; bgs.after(fi);
  const paintBgs = () => { bgs.innerHTML = ''; for (const o of LGX_BGS) { const b = document.createElement('button'); b.type = 'button'; b.className = LGX.bg === o.id ? 'on' : ''; b.innerHTML = `<i style="background:${o.sw}"></i>${o.n}`; b.title = o.id === 'mio' ? 'Sube una captura de un clip tuyo para probar encima' : 'Probar el logo sobre este fondo'; b.onclick = () => { if (o.id === 'mio' && !LGX.img) { fi.click(); return; } LGX.bg = o.id; paintBgs(); lgxDraw(); }; if (o.id === 'mio' && LGX.img) b.ondblclick = () => fi.click(); bgs.append(b); } };
  fi.onchange = () => { const f = fi.files[0]; fi.value = ''; if (!f) return; const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { LGX.img = im; LGX.bg = 'mio'; paintBgs(); lgxDraw(); toast('Fondo cargado (doble clic en «Tu imagen» para cambiarlo)'); }; im.onerror = () => toast('Esa imagen no se pudo abrir'); im.src = u; };
  paintBgs();
  const pos = $('lgxPos');
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = '<i></i>'; b.title = ['Arriba', 'En medio', 'Abajo'][r] + ' ' + ['a la izquierda', 'en el centro', 'a la derecha'][q];
    b.onclick = () => { const bx = lgxBox(); if (!bx || trk.logo.lock) return; const mx = 60, top = 190, bot = 1540;
      logoPos.x = [mx + bx.w / 2, W / 2, W - mx - bx.w / 2][q]; logoPos.y = [top + bx.h / 2, H / 2, bot - bx.h / 2][r]; pushHistory(); lgxSave(); };
    pos.append(b);
  }
  $('lgxOp').addEventListener('input', e => { setRange('logoOp', e.target.value); $('lgxOpV').textContent = e.target.value + '%'; lgxDraw(); });
  $('lgxRot').addEventListener('input', e => { setRange('logoRot', e.target.value); $('lgxRotV').textContent = $('logoRot').value + '°'; $('lgxRot').value = $('logoRot').value; lgxDraw(); });
  $('lgxSz').addEventListener('input', e => { setRange('logoSize', e.target.value); $('lgxSzV').textContent = e.target.value + '%'; lgxDraw(); });
  ['logoOp', 'logoSize', 'logoRot'].forEach(id => $(id).addEventListener('input', () => { if (document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('lgx')) return; lgxSync(); }));
  $('lgxTk').addEventListener('change', lgxDraw);
  $('lgxZm').onclick = () => { LGX.zoom = !LGX.zoom; $('lgxZm').textContent = LGX.zoom ? '↺ 100 %' : '🔍 200 %'; $('lgxZm').classList.toggle('on', !!LGX.zoom); lgxDraw(); };
  $('lgxOk').onclick = () => { LGX.open = false; lgxSync(); toast('Logo guardado'); };
  $('lgxLock').addEventListener('change', () => { trk.logo.lock = $('lgxLock').checked; $('logoLock').checked = trk.logo.lock; syncTrackUI(); saveLogoCfg(); lgxSync(); toast(trk.logo.lock ? 'Logo bloqueado' : 'Logo desbloqueado'); });
  $('logoLock').addEventListener('change', lgxSync);
  const at = e => { const r = cv.getBoundingClientRect(), v = lgxView(); return { x: v.x + (e.clientX - r.left) / r.width * W / v.z, y: v.y + (e.clientY - r.top) / r.height * H / v.z }; };
  const inB = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  cv.addEventListener('pointerdown', e => { const p = at(e), b = lgxBox(); if (!inB(p, b)) return;
    if (trk.logo.lock) { toast('Logo bloqueado: quita el candado para moverlo'); return; }
    cv.setPointerCapture(e.pointerId); LGX.drag = { px: p.x, py: p.y, lx: logoPos.x, ly: logoPos.y, view: lgxView() }; cv.className = 'grabbing'; });
  cv.addEventListener('pointermove', e => { const p = at(e);
    if (!LGX.drag) { const h = inB(p, lgxBox()); if (h !== !!LGX.hover) { LGX.hover = h; lgxDraw(); } return; }
    const d = LGX.drag, b = lgxBox(); let x = d.lx + p.x - d.px, y = d.ly + p.y - d.py;
    d.sx = Math.abs(x - W / 2) < 22; if (d.sx) x = W / 2;
    x = Math.max(b.w / 2 - b.w * .4, Math.min(W - b.w / 2 + b.w * .4, x)); y = Math.max(b.h / 2 - b.h * .4, Math.min(H - b.h / 2 + b.h * .4, y));
    logoPos.x = x; logoPos.y = y; lgxDraw(); });
  const up = () => { if (!LGX.drag) return; LGX.drag = null; cv.className = 'grab'; pushHistory(); lgxSave(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (LGX.hover && !LGX.drag) { LGX.hover = false; lgxDraw(); } });
  cv.addEventListener('wheel', e => { if (!inB(at(e), lgxBox()) || trk.logo.lock) return; e.preventDefault(); const v = Math.max(2, Math.min(100, +$('logoSize').value + (e.deltaY < 0 ? 1 : -1))); setRange('logoSize', v); lgxSync(); }, { passive: false });
  lgxSync();
}, 0);
// copia de todas las plantillas (títulos y formatos de cada creador) en la carpeta del grabador: plantillas-cortex.json
let cxTplDone = false;
async function cxExportTpls() {
  if (cxTplDone || typeof CORTEX_PROXY !== 'undefined') return; const d = await getLiveDir(false); if (!d) return;
  const out = { app: 'Cortex', generado: new Date().toISOString(), clientes: [] };
  for (const c of clients) { let g = null, st = null; try { g = await kv.get('tplg:' + groupOf(c.id)); } catch {} try { st = await kv.get('client:' + c.id); } catch {}
    out.clientes.push({ nombre: c.name, grupo: groupOf(c.id), titleTpls: (g && g.titleTpls) || {}, titleDef: (g && g.titleDef) || null, templates: (g && g.templates) || (st && st.templates) || {}, overrides: (g && g.overrides) || (st && st.overrides) || {}, def: (g && g.def) || (st && st.def) || null }); }
  try { await wfile(d, 'plantillas-cortex.json', JSON.stringify(out, null, 1)); cxTplDone = true; } catch (e) { console.warn('plantillas', e); }
}
setInterval(() => { cxExportTpls().catch(() => {}); }, 20000); setTimeout(() => cxExportTpls().catch(() => {}), 4000);
function ttMenu(x, y) {
  const c = clientOf(curClient), own = Object.keys(titleTpls), it = [];
  for (const n of own) it.push({ icon: '⭐', label: n, on: titleDef === n, act: () => ttPick(n) });
  for (const n of Object.keys(TT_BUILTIN)) if (!titleTpls[n]) it.push({ icon: '🔤', label: n, on: titleDef === n, act: () => ttPick(n) });
  it.push({ icon: '💾', label: 'Guardar el título actual como plantilla…', act: ttSave });
  if (titleDef) it.push({ icon: '↩️', label: 'Sin título fijo (el de cada formato)', act: async () => { titleDef = null; await saveTypeStore(); toast('Cada formato vuelve a usar su propio título'); } });
  for (const n of own) it.push({ icon: '🗑', label: `Borrar «${n}»`, act: async () => { delete titleTpls[n]; if (titleDef === n) titleDef = null; await saveTypeStore(); toast(`Plantilla de título «${n}» borrada`); } });
  ctxOpen(x, y, 'Plantilla de título' + (c ? ' · ' + c.name : ''), it);
}
setTimeout(() => { const b = $('ttBtn'); if (b) b.addEventListener('click', e => { e.stopPropagation(); const r = b.getBoundingClientRect(); ttMenu(r.left, r.bottom + 6); }); }, 0);


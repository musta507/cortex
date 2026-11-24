/* ---------- crear / editar una plantilla de título: todo a mano y viéndolo al momento ---------- */
const TTC_DEF = { titleStyle: 'box', boxMode: 'single', c: { titleFont: 'Anton|400', titleSize: '58', titleUpper: false, titleColor: '#ffffff', titleHl: '#ff1f1f', titleLH: '118', boxR: '14', boxPX: '28', boxPY: '16', boxColor: '#ffffff', boxText: '#111111', boxOp: '100', tLS: '0', tStrokeW: '0', tStrokeC: '#000000', tShadow: '60', titleW: '0' } };
let ttc = null;
function ttcStyle(t, tp, k) {   // pinta el título de muestra con CSS, a escala k del vídeo (1080 px de ancho)
  const c = { ...TTC_DEF.c, ...(tp.c || {}) }, [fam, wt] = String(c.titleFont).split('|'), size = +c.titleSize, box = tp.titleStyle === 'box';
  t.style.fontFamily = `"${fam}", Inter, system-ui, sans-serif`; t.style.fontWeight = wt || 800; t.style.fontSize = size * k + 'px'; t.style.lineHeight = (+c.titleLH / 100).toFixed(2);
  t.style.letterSpacing = (+c.tLS || 0) * k + 'px'; t.style.textTransform = c.titleUpper ? 'uppercase' : 'none';
  t.style.color = box ? c.boxText : c.titleColor;
  const sw = +c.tStrokeW || 0; t.style.webkitTextStroke = sw ? `${sw * 2 * k}px ${c.tStrokeC}` : '0'; t.style.paintOrder = 'stroke fill';
  const sh = c.tShadow == null ? 0.6 : +c.tShadow / 100; t.style.textShadow = !box && sh > 0 ? `0 0 ${(4 + 12 * sh) * k}px rgba(0,0,0,${Math.min(1, sh * 1.1).toFixed(2)})` : 'none';
  const hex = c.boxColor || '#ffffff', op = c.boxOp == null ? 1 : +c.boxOp / 100, rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) || 0).join(',');
  t.style.background = box ? `rgba(${rgb},${op})` : 'none'; t.style.padding = box ? `${+c.boxPY * k}px ${+c.boxPX * k}px` : '0'; t.style.borderRadius = box ? Math.min(+c.boxR * k, 60) + 'px' : '0';
  t.style.display = box && tp.boxMode === 'lines' ? 'inline' : 'inline-block'; t.style.boxDecorationBreak = t.style.webkitBoxDecorationBreak = 'clone';
  t.style.boxShadow = box && op > 0.98 ? `0 ${4 * k}px ${18 * k}px rgba(0,0,0,.28)` : 'none';
  t.style.maxWidth = (+c.titleW > 0 ? +c.titleW : 940) * k + 'px'; t.style.whiteSpace = 'normal'; t.style.textAlign = 'center';
}
// la vista previa del creador se pinta con el mismo dibujo que el vídeo (cajas por línea incluidas)
function ttcPaint(canvas, tp, text, bg, hl) {
  const cw = canvas.clientWidth || 360, ch = canvas.clientHeight || 480, W2 = 1080, H2 = Math.round(Math.max(360, Math.min(2400, W2 * ch / cw)));   // el lienzo toma la forma del hueco, así el título nunca se corta
  if (canvas.width !== W2 || canvas.height !== H2) { canvas.width = W2; canvas.height = H2; }
  const real = ctx, x2 = canvas.getContext('2d'); ctx = x2;
  try {
    x2.setTransform(1, 0, 0, 1, 0, 0); x2.clearRect(0, 0, W2, H2);
    if (bg === 'dark') x2.fillStyle = '#0b0b0d'; else if (bg === 'light') x2.fillStyle = '#f2f2f2'; else { const g = x2.createLinearGradient(0, 0, W2, H2); g.addColorStop(0, '#3b4658'); g.addColorStop(0.45, '#6b5a4a'); g.addColorStop(1, '#2c3b2f'); x2.fillStyle = g; }
    if (bg !== 'transparent') x2.fillRect(0, 0, W2, H2);
    const c = { ...TTC_DEF.c, ...(tp.c || {}) }, [fam, wt] = String(c.titleFont).split('|'), isBox = tp.titleStyle === 'box', mode = tp.boxMode || 'single';
    const size = +c.titleSize, lh = size * (+c.titleLH / 100), padX = isBox ? +c.boxPX : 0, padY = isBox ? +c.boxPY : 0, tW = +c.titleW || 0;
    x2.font = `${wt || 800} ${size}px "${fam}", Inter, "Helvetica Neue", Arial, sans-serif`; x2.textAlign = 'left'; x2.textBaseline = 'alphabetic'; x2.letterSpacing = (+c.tLS || 0) + 'px';
    const rgbOf = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16) || 0), hd = (a, b) => { const A = rgbOf(a), B = rgbOf(b); return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]); };
    const maxW = tW > 0 ? Math.max(120, tW) : Math.max(320, W2 - 140 - padX * 2), lines = []; let gi = 0;
    for (const para of String(text || 'Título').split('\n')) { const ws = para.split(/\s+/).filter(Boolean).map(t => ({ t: c.titleUpper ? t.toLocaleUpperCase('es') : t, red: !!(hl && hl.has(gi++)) })); if (ws.length) lines.push(...wrapBalanced(ws, maxW).lines); }
    if (!lines.length) return;
    const n = lines.length, blockH = (n - 1) * lh + size, top = H2 / 2 - blockH / 2, cx = W2 / 2, maxLW = Math.max(...lines.map(l => l.w)), space = x2.measureText(' ').width, mid = bodyMid(c.titleUpper || !hasLower(text));
    if (isBox) {
      x2.save(); x2.fillStyle = c.boxColor; x2.globalAlpha = c.boxOp == null ? 1 : +c.boxOp / 100;
      const drawBoxes = () => { if (mode === 'single') roundBox(cx - maxLW / 2 - padX, top - padY, maxLW + 2 * padX, blockH + 2 * padY, +c.boxR); else drawRowBoxes(lines.map((l, i) => { const m2 = top + size / 2 + i * lh; return { x0: cx - l.w / 2 - padX, x1: cx + l.w / 2 + padX, y0: m2 - size / 2 - padY, y1: m2 + size / 2 + padY }; }), +c.boxR); };
      if (x2.globalAlpha > 0.98) { x2.shadowColor = 'rgba(0,0,0,.28)'; x2.shadowBlur = 18; x2.shadowOffsetY = 4; drawBoxes(); }
      x2.shadowColor = 'transparent'; x2.shadowBlur = 0; x2.shadowOffsetY = 0; drawBoxes(); x2.restore();
    } else { const k = c.tShadow == null ? 0.6 : +c.tShadow / 100; x2.shadowColor = `rgba(0,0,0,${Math.min(1, k * 1.1).toFixed(2)})`; x2.shadowBlur = k ? 4 + 12 * k : 0; }
    if (+c.tStrokeW > 0) { x2.save(); x2.strokeStyle = c.tStrokeC || '#000'; x2.lineWidth = +c.tStrokeW * 2; x2.lineJoin = 'round'; x2.miterLimit = 2; lines.forEach((l, i) => { const m2 = top + size / 2 + i * lh; let x = cx - l.w / 2; for (const w of l.words) { drawR(w.t, x, m2 + mid, true); x += w.w + space; } }); x2.restore(); x2.shadowColor = 'transparent'; x2.shadowBlur = 0; }
    lines.forEach((l, i) => { const m2 = top + size / 2 + i * lh; let x = cx - l.w / 2; for (const w of l.words) { x2.fillStyle = w.red ? c.titleHl : (isBox ? c.boxText : c.titleColor); drawR(w.t, x, m2 + mid); x += w.w + space; } });
  } finally { try { ctx.letterSpacing = '0px'; ctx.shadowBlur = 0; } catch {} ctx = real; }
}
function ttcOpen(editName, base, suggest) {
  const tp = JSON.parse(JSON.stringify(base || TTC_DEF)); tp.c = { ...TTC_DEF.c, ...(tp.c || {}) }; if (!tp.titleStyle) tp.titleStyle = 'plain'; if (!tp.boxMode) tp.boxMode = 'single';
  ttc = { edit: editName, tp }; const ttcHL = new Set();
  let ov = $('ttcOv'); if (ov) ov.remove(); ov = document.createElement('div'); ov.id = 'ttcOv'; ov.className = 'ttc-ov';
  const fonts = [...$('titleFont').options].map(o => [o.value, o.textContent]);
  ov.innerHTML = `<div class="ttc" role="dialog" aria-label="Plantilla de título">
    <div class="ttc-h"><b>${editName ? 'Editar plantilla de título' : 'Nueva plantilla de título'}</b><button class="ttc-x" title="Cerrar (Esc)">✕</button></div>
    <div class="ttc-b">
      <div class="ttc-pv"><div class="ttc-stage" data-bg="vid"><canvas class="ttc-cv"></canvas></div>
        <div class="ttc-bgs"><span>Fondo de prueba</span><button data-bg="vid" class="on">Vídeo</button><button data-bg="dark">Oscuro</button><button data-bg="light">Claro</button></div>
        <label class="ttc-f">Texto de prueba <em>(Enter: línea nueva)</em><textarea id="ttcTxt" rows="2" maxlength="160">Westcol no se lo puede creer 🔥</textarea></label>
        <div class="ttc-f">Destacar palabras <em>(toca una para verla con el color destacado)</em><div class="chips" id="ttcChips"></div></div></div>
      <div class="ttc-c">
        <label class="ttc-f">Nombre<input type="text" id="ttcName" maxlength="40" placeholder="Por ejemplo: Caja roja WestCOL"></label>
        <div class="ttc-s"><span>Letra</span><div class="ttc-fonts" id="ttcFonts"></div></div>
        <div class="ttc-s"><span>Texto</span>
          <label class="ttc-r">Tamaño<input type="range" data-k="titleSize" min="20" max="180"><output></output></label>
          <label class="ttc-r">Entre letras<input type="range" data-k="tLS" min="-6" max="30"><output></output></label>
          <label class="ttc-r">Entre líneas<input type="range" data-k="titleLH" min="80" max="200"><output></output></label>
          <label class="ttc-r">Ancho<input type="range" data-k="titleW" min="0" max="1000" step="10"><output></output></label>
          <div class="ttc-row"><label class="ttc-ck"><input type="checkbox" data-k="titleUpper"> MAYÚSCULAS</label>
            <label class="ttc-col">Color<input type="color" data-k="__txt"></label><label class="ttc-col" title="Color de las palabras destacadas">Destacado<input type="color" data-k="titleHl"></label></div>
        </div>
        <div class="ttc-s"><span>Contorno y sombra</span>
          <label class="ttc-r">Contorno<input type="range" data-k="tStrokeW" min="0" max="24"><output></output></label>
          <div class="ttc-row"><label class="ttc-col">Color del contorno<input type="color" data-k="tStrokeC"></label></div>
          <label class="ttc-r" id="ttcShR">Sombra<input type="range" data-k="tShadow" min="0" max="100"><output></output></label>
        </div>
        <div class="ttc-s"><span>Fondo</span>
          <div class="ttc-seg" id="ttcBox"><button data-v="none">Sin fondo</button><button data-v="single">Una caja</button><button data-v="lines">Una por línea</button></div>
          <div id="ttcBoxO">
            <div class="ttc-row"><label class="ttc-col">Color de la caja<input type="color" data-k="boxColor"></label></div>
            <label class="ttc-r">Opacidad<input type="range" data-k="boxOp" min="0" max="100"><output></output></label>
            <label class="ttc-r">Esquinas<input type="range" data-k="boxR" min="0" max="80"><output></output></label>
            <label class="ttc-r">Margen lados<input type="range" data-k="boxPX" min="0" max="160"><output></output></label>
            <label class="ttc-r">Margen arriba/abajo<input type="range" data-k="boxPY" min="0" max="120"><output></output></label>
          </div>
        </div>
      </div>
    </div>
    <div class="ttc-a"><label class="ttc-ck"><input type="checkbox" id="ttcFix" checked> Dejarla fija para <b id="ttcWho"></b></label><span class="ttc-msg" id="ttcMsg"></span><button id="ttcCancel">Cancelar</button><button class="primary" id="ttcSave">Guardar plantilla</button></div>
  </div>`;
  document.body.append(ov);
  const q = sel => ov.querySelector(sel), c = tp.c, cl = clientOf(curClient);
  q('#ttcName').value = editName || suggest || ''; q('#ttcWho').textContent = cl ? cl.name : 'este creador';
  const fb = q('#ttcFonts');
  const addFontTile = () => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ttc-addf'; b.innerHTML = '<i>＋</i><span>Subir fuente</span>'; b.title = 'Sube tu propia letra (.ttf, .otf o .woff)';
    b.onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ttf,.otf,.woff,.woff2'; inp.multiple = true; inp.onchange = async () => { const fl = [...inp.files]; if (!fl.length) return; const before = new Set([...$('titleFont').options].map(o => o.value));
      await fontAddFiles(fl, t => { q('#ttcMsg').textContent = t.startsWith('⚠') ? t : ''; }); const nw = [...$('titleFont').options].map(o => [o.value, o.textContent]).filter(([v]) => !before.has(v));
      for (const [v, n] of nw) fb.insertBefore(mkFont(v, n), b); if (nw.length) { c.titleFont = nw[nw.length - 1][0]; draw(); } }; inp.click(); }; return b; };
  const mkFont = (v, n) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; const [fam, wt] = v.split('|'); b.innerHTML = '<i>Aa</i><span></span>'; b.querySelector('i').style.cssText = `font-family:"${fam}",system-ui;font-weight:${wt}`; b.querySelector('span').textContent = n.replace(/ \(.*\)$/, ''); b.title = n; b.onclick = () => { c.titleFont = v; draw(); }; return b; };
  for (const [v, n] of fonts) fb.append(mkFont(v, n));
  fb.append(addFontTile());
  const fmtV = { titleSize: v => v, tLS: v => v, titleLH: v => (v / 100).toFixed(2), titleW: v => +v ? v + ' px' : 'auto', tStrokeW: v => v, tShadow: v => v + '%', boxOp: v => v + '%', boxR: v => v, boxPX: v => v, boxPY: v => v };
  const draw = () => {
    const box = tp.titleStyle === 'box';
    for (const el of ov.querySelectorAll('[data-k]')) { const k = el.dataset.k; if (document.activeElement === el && el.type === 'range') { el.nextElementSibling.textContent = fmtV[k](el.value); continue; }
      if (k === '__txt') el.value = box ? c.boxText : c.titleColor; else if (el.type === 'checkbox') el.checked = !!c[k]; else el.value = c[k]; if (el.type === 'range') el.nextElementSibling.textContent = fmtV[k](el.value); }
    for (const b of fb.children) b.classList.toggle('on', b.dataset.v === c.titleFont);
    const mode = box ? tp.boxMode : 'none'; for (const b of q('#ttcBox').children) b.classList.toggle('on', b.dataset.v === mode);
    q('#ttcBoxO').hidden = !box; q('#ttcShR').hidden = box;
    const words = (q('#ttcTxt').value || '').split(/\s+/).filter(Boolean), chb = q('#ttcChips'), sig = words.join(' ') + '|' + [...ttcHL].join();
    if (chb.dataset.sig !== sig) { chb.dataset.sig = sig; chb.innerHTML = ''; for (const i of [...ttcHL]) if (i >= words.length) ttcHL.delete(i);
      words.forEach((w, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (ttcHL.has(i) ? ' on' : ''); b.textContent = w; b.onclick = () => { ttcHL.has(i) ? ttcHL.delete(i) : ttcHL.add(i); draw(); }; chb.append(b); }); }
    ttcPaint(q('.ttc-cv'), tp, q('#ttcTxt').value || 'Título', q('.ttc-stage').dataset.bg, ttcHL);
  };
  ov.addEventListener('input', e => { const el = e.target, k = el.dataset && el.dataset.k; if (k) { const v = el.type === 'checkbox' ? el.checked : el.value; if (k === '__txt') { c.titleColor = v; c.boxText = v; } else c[k] = v; } draw(); });
  q('#ttcBox').onclick = e => { const v = e.target.dataset && e.target.dataset.v; if (!v) return; if (v === 'none') tp.titleStyle = 'plain'; else { if (tp.titleStyle !== 'box') { const tc = c.titleColor; c.boxText = c.boxText && c.boxText.toLowerCase() !== (c.boxColor || '').toLowerCase() ? c.boxText : (tc && tc.toLowerCase() !== '#ffffff' ? tc : '#111111'); } tp.titleStyle = 'box'; tp.boxMode = v; } draw(); };
  ov.querySelector('.ttc-bgs').onclick = e => { const v = e.target.dataset && e.target.dataset.bg; if (!v) return; q('.ttc-stage').dataset.bg = v; for (const b of ov.querySelectorAll('.ttc-bgs button')) b.classList.toggle('on', b === e.target); draw(); };
  q('#ttcTxt').addEventListener('keydown', e => e.stopPropagation());
  const emoT = setInterval(() => { if (!document.body.contains(ov)) { clearInterval(emoT); return; } draw(); }, 700);   // los emojis llegan un poco después
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); ttc = null; document.removeEventListener('keydown', esc, true); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', esc, true);
  q('.ttc-x').onclick = close; q('#ttcCancel').onclick = close; ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  q('#ttcSave').onclick = async () => {
    const msg = q('#ttcMsg'), name = q('#ttcName').value.trim().slice(0, 40);
    if (!curClient) { msg.textContent = 'Elige primero un creador'; return; }
    if (!name) { msg.textContent = 'Ponle un nombre'; q('#ttcName').focus(); return; }
    if (name !== editName && (titleTpls[name] || TT_BUILTIN[name])) { msg.textContent = 'Ya hay una plantilla con ese nombre'; q('#ttcName').focus(); return; }
    const out = { titleStyle: tp.titleStyle, boxMode: tp.boxMode, c: {} }; for (const k of TITLE_KEYS) if (c[k] !== undefined) out.c[k] = c[k];
    if (editName && editName !== name) { delete titleTpls[editName]; if (titleDef === editName) titleDef = name; }
    titleTpls[name] = out; if (q('#ttcFix').checked) titleDef = name; await saveTypeStore();
    if (loaded && q('#ttcFix').checked) { try { await ttApply(name); } catch {} }
    close(); ttRender(); try { stEdTT(); } catch {} toast(`Plantilla de título «${name}» guardada` + (q('#ttcFix').checked && cl ? ` y fija para ${cl.name}` : ''));
  };
  requestAnimationFrame(draw); setTimeout(draw, 300); try { document.fonts.ready.then(draw); } catch {}
  setTimeout(() => q('#ttcName').focus(), 50);
}
setTimeout(() => { const b = $('ttNewBtn'); if (b) b.onclick = () => ttcOpen(null, null, ''); }, 0);

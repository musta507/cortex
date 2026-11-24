/* ---------- textos libres («Texto predeterminado») ---------- */
let txtBoxes = {};
const txtById = id => texts.find(x => x.id === +id);
function txtFontParts(tx) { const [f, w] = (tx.font || 'Montserrat|900').split('|'); return { f, w: w || '700' }; }
const TX_DEF = { bold: true, italic: false, under: false, tcase: 'none', ls: 0, align: 'center', strokeW: 14, bgMode: 'block', bgOp: 100, bgR: 28, bgH: 28, bgW: 28, bgX: 0, bgY: 0,
  shC: '#000000', shOp: 65, shBlur: 20, shD: 0, shA: -45 };
const txv = (tx, k) => tx[k] != null ? tx[k] : TX_DEF[k];
function drawText(tx) {
  const { f, w } = txtFontParts(tx), size = tx.size;
  ctx.save();
  ctx.font = `${txv(tx, 'italic') ? 'italic ' : ''}${txv(tx, 'bold') ? w : 400} ${size}px "${f}", Inter, sans-serif`;
  ctx.letterSpacing = (txv(tx, 'ls') || 0) + 'px';
  const paras = String(tx.text || ' ').split('\n').map(l => caseText(l, txv(tx, 'tcase'))), lh = size * (tx.lh || 1.15);
  // ancho de la caja: el que se eligió con las asas de los lados o, si no, que no se salga de la pantalla
  const maxW = tx.boxW > 0 ? tx.boxW : W - 140, lines = [];
  for (const para of paras) { let cur = ''; for (const w of para.split(' ')) { const t2 = cur ? cur + ' ' + w : w; if (cur && measR(t2) > maxW) { lines.push(cur); cur = w; } else cur = t2; } lines.push(cur); }
  const widths = lines.map(l => measR(l)), bw = Math.max(10, tx.boxW > 0 ? tx.boxW : 0, ...widths), bh = (lines.length - 1) * lh + size;
  const al = txv(tx, 'align'), px = tx.bg ? size * txv(tx, 'bgW') / 100 : 0, py = tx.bg ? size * txv(tx, 'bgH') / 100 : 0, mid = bodyMid(txv(tx, 'tcase') === 'upper' || !lines.some(hasLower));
  const lxo = i => al === 'left' ? -bw / 2 : al === 'right' ? bw / 2 - widths[i] : -widths[i] / 2;
  const ly = i => -bh / 2 + size / 2 + i * lh;
  ctx.translate(tx.x, tx.y); ctx.rotate((tx.rot || 0) * Math.PI / 180);
  if (tx.bg && txv(tx, 'bgOp') > 0) {
    ctx.save(); ctx.fillStyle = rgbaOf(tx.bgC || '#000', txv(tx, 'bgOp') / 100);
    const rr = h => Math.min(h / 2, h / 2 * txv(tx, 'bgR') / 100), dx = txv(tx, 'bgX'), dy = txv(tx, 'bgY');
    if (txv(tx, 'bgMode') === 'line') { const h = size + 2 * py; drawRowBoxes(lines.map((l, i) => ({ x0: lxo(i) - px + dx, x1: lxo(i) + widths[i] + px + dx, y0: ly(i) - size / 2 - py + dy, y1: ly(i) + size / 2 + py + dy })), rr(h)); }
    else { const h = bh + 2 * py; roundBox(-bw / 2 - px + dx, -bh / 2 - py + dy, bw + 2 * px, h, rr(h)); }
    ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const each = fn => lines.forEach((l, i) => fn(l, lxo(i), ly(i) + mid, i));
  if (tx.shadow && txv(tx, 'shOp') > 0) {
    ctx.save(); const o = shOff(txv(tx, 'shD'), txv(tx, 'shA'));
    ctx.shadowColor = rgbaOf(txv(tx, 'shC'), txv(tx, 'shOp') / 100); ctx.shadowBlur = size * txv(tx, 'shBlur') / 100; ctx.shadowOffsetX = o.x; ctx.shadowOffsetY = o.y;
    ctx.fillStyle = tx.color; each((l, x, y) => drawR(l, x, y)); ctx.restore();
  }
  if (tx.stroke) { ctx.strokeStyle = tx.strokeC || '#000'; ctx.lineWidth = size * txv(tx, 'strokeW') / 100; each((l, x, y) => drawR(l, x, y, true)); }
  ctx.fillStyle = tx.color; each((l, x, y) => drawR(l, x, y));
  if (txv(tx, 'under')) each((l, x, y, i) => ctx.fillRect(x, y + size * 0.1, widths[i], Math.max(3, size * 0.06)));
  ctx.restore();
  txtBoxes[tx.id] = { id: tx.id, x: tx.x, y: tx.y, w: bw + 2 * px, h: bh + 2 * py, rot: tx.rot || 0, px, cw: bw };
}
// punto de la vista previa -> coordenadas dentro del texto (sin giro)
function txtLocal(b, p) { const a = -b.rot * Math.PI / 180, dx = p.x - b.x, dy = p.y - b.y; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; }
const TXT_ROT_D = 48;   // distancia del círculo de giro (debajo del texto)
function txtHandle(b, p) {
  const q = txtLocal(b, p), x0 = -b.w / 2 - 18, x1 = b.w / 2 + 18, y0 = -b.h / 2 - 16, y1 = b.h / 2 + 16;
  if (Math.hypot(q.x - x0, q.y - y0) < 28) return 'del';
  if (Math.hypot(q.x, q.y - (y1 + TXT_ROT_D)) < 32) return 'rot';
  if (Math.hypot(q.x - x1, q.y - y0) < 28 || Math.hypot(q.x - x0, q.y - y1) < 28 || Math.hypot(q.x - x1, q.y - y1) < 28) return 'scale';
  if (Math.abs(q.y) < Math.max(34, b.h / 2 - 10)) { if (Math.abs(q.x - x0) < 22) return 'wl'; if (Math.abs(q.x - x1) < 22) return 'wr'; }
  return null;
}
function hitText(p) {
  const ids = Object.keys(txtBoxes).map(Number);
  for (let i = texts.length - 1; i >= 0; i--) {
    const tx = texts[i]; if (!ids.includes(tx.id)) continue;
    const b = txtBoxes[tx.id], q = txtLocal(b, p);
    if (Math.abs(q.x) <= b.w / 2 + 22 && Math.abs(q.y) <= b.h / 2 + 18) return 'txt:' + tx.id;
  }
  return null;
}
function drawTextSel(b, dragging) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot * Math.PI / 180);
  const x0 = -b.w / 2 - 18, x1 = b.w / 2 + 18, y0 = -b.h / 2 - 16, y1 = b.h / 2 + 16;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash(dragging ? [16, 10] : []);
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  if (!trk.text.lock) {
    ctx.setLineDash([]);
    const dot = (x, y) => { ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke(); };
    const pill = x => { ctx.fillStyle = '#fff'; roundBox(x - 7, -22, 14, 44, 7); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke(); };
    dot(x1, y0); dot(x0, y1); dot(x1, y1);   // esquinas: tamaño
    pill(x0); pill(x1);                      // lados: ancho de la caja
    // ✕ borrar
    ctx.beginPath(); ctx.arc(x0, y0, 17, 0, Math.PI * 2); ctx.fillStyle = '#3a3a3f'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(x0 - 6, y0 - 6); ctx.lineTo(x0 + 6, y0 + 6); ctx.moveTo(x0 + 6, y0 - 6); ctx.lineTo(x0 - 6, y0 + 6); ctx.stroke();
    // ↻ girar (abajo, en el centro)
    const ry = y1 + TXT_ROT_D;
    ctx.beginPath(); ctx.arc(0, ry, 19, 0, Math.PI * 2); ctx.fillStyle = '#3a3a3f'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, ry, 9, -Math.PI * 0.9, Math.PI * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9 * Math.cos(Math.PI * 0.6) + 5, ry + 9 * Math.sin(Math.PI * 0.6) - 2); ctx.lineTo(9 * Math.cos(Math.PI * 0.6), ry + 9 * Math.sin(Math.PI * 0.6)); ctx.lineTo(9 * Math.cos(Math.PI * 0.6) - 2, ry + 9 * Math.sin(Math.PI * 0.6) - 6); ctx.stroke();
  }
  ctx.restore();
}
function selTextId() { return selected && selected.startsWith('txt:') ? +selected.slice(4) : null; }
function addText() {
  if (!loaded) { toast('Primero sube un clip'); return; }
  const T = curT(), D = totalDur();
  let a = T, b = Math.min(D, T + 3); if (b - a < 0.5) { a = Math.max(0, D - 3); b = D; }
  const opts = [...$('txtFont').options].map(o => o.value);
  const font = opts.find(v => /^Montserrat\|9/.test(v)) || opts.find(v => /^Montserrat/.test(v)) || opts[0];
  const tx = { id: newId(), text: 'Texto predeterminado', start: a, end: b, x: W / 2, y: H * 0.5, size: 80, font,
               color: '#ffffff', stroke: false, strokeC: '#000000', shadow: true, bg: false, bgC: '#000000', rot: 0, lh: 1.15 };
  texts.push(tx); selectText(tx.id); pushHistory();
  setTimeout(() => { $('txtText').focus(); $('txtText').select(); }, 30);
}
function selectText(id, noPanel) {
  selected = id == null ? null : 'txt:' + id;
  tsel.clear(); if (id != null) tsel.add('t:' + id);
  if (id != null && !noPanel) showLeft('text');
  fillTextPanel(); tlSig = '';
}
function fillTextPanel() {
  const tx = txtById(selTextId());
  $('txtEdit').hidden = !tx;
  if (tx) {
    $('txtText').value = tx.text; $('txtFont').value = tx.font; $('txtSize').value = tx.size; $('txtSizeV').textContent = tx.size;
    $('txtRot').value = tx.rot || 0; $('txtRotV').textContent = (tx.rot || 0) + '°';
    $('txtLH').value = Math.round((tx.lh || 1.15) * 100); $('txtLHV').textContent = (tx.lh || 1.15).toFixed(2);
    $('txtColor').value = tx.color; $('txtStrokeC').value = tx.strokeC; $('txtBgC').value = tx.bgC;
    $('txtStroke').checked = !!tx.stroke; $('txtShadow').checked = !!tx.shadow; $('txtBg').checked = !!tx.bg;
  }
  if (typeof stInlineRender === 'function') { const tb = $('txtStyleInline'); if (tb && !tb.contains(document.activeElement)) stInlineRender(); }
  const L = $('txtList'); L.innerHTML = '';
  texts.forEach(t => {
    const b = document.createElement('button'); b.textContent = `${fmt(t.start)} · ${t.text.replace(/\n/g, ' ') || '(vacío)'}`;
    b.className = t.id === selTextId() ? 'on' : '';
    b.onclick = () => { selectText(t.id); seekOut(t.start + 0.01); };
    L.append(b);
  });
}
const TXT_FIELDS = { txtLH: 'lh', txtText: 'text', txtFont: 'font', txtSize: 'size', txtRot: 'rot', txtColor: 'color', txtStrokeC: 'strokeC', txtBgC: 'bgC',
                     txtStroke: 'stroke', txtShadow: 'shadow', txtBg: 'bg' };
for (const [id, key] of Object.entries(TXT_FIELDS)) $(id).addEventListener('input', () => {
  const tx = txtById(selTextId()); if (!tx) return;
  const el = $(id);
  tx[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
  if (id === 'txtSize') $('txtSizeV').textContent = el.value;
  if (id === 'txtRot') $('txtRotV').textContent = el.value + '°';
  if (id === 'txtLH') { tx.lh = +el.value / 100; $('txtLHV').textContent = tx.lh.toFixed(2); }
  if (id === 'txtText') { tlSig = ''; const L = $('txtList').querySelector('.on'); if (L) L.textContent = `${fmt(tx.start)} · ${tx.text.replace(/\n/g, ' ')}`; }
  pushHistory();
});
$('txtAdd').onclick = addText;
$('txtDel').onclick = () => { const id = selTextId(); if (id == null) return; texts = texts.filter(t => t.id !== id); selectText(null); pushHistory(); };
$('txtDup').onclick = () => { const tx = txtById(selTextId()); if (!tx) return; const c = { ...tx, id: newId(), x: tx.x + 30, y: tx.y + 30 }; texts.push(c); selectText(c.id); pushHistory(); };
$('txtCenter').onclick = () => { const tx = txtById(selTextId()); if (!tx) return; tx.x = W / 2; tx.y = H / 2; pushHistory(); };
// la lista de fuentes es la misma que la del título (incluye las que subas)
(function () {   // fuentes del título y de los subtítulos, sin repetir
  const seen = new Set();
  for (const o of [...$('subFont').options, ...$('titleFont').options]) { const fam = o.textContent.trim(); if (seen.has(fam)) continue; seen.add(fam); $('txtFont').append(o.cloneNode(true)); }
})();


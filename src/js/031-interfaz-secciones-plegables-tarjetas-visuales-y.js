/* ---------- interfaz: secciones plegables, tarjetas visuales y resúmenes ---------- */

function renderFontTiles() {
  for (const [selId, boxId] of [['titleFont', 'titleFontTiles'], ['subFont', 'subFontTiles']]) {
    const sel = $(selId), box = $(boxId); box.innerHTML = '';
    for (const o of sel.options) {
      const [fam, wt] = o.value.split('|');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ftile'; b.dataset.v = o.value;
      const aa = document.createElement('span'); aa.className = 'aa'; aa.textContent = 'Aa';
      aa.style.fontFamily = `"${fam}", system-ui, sans-serif`; aa.style.fontWeight = wt;
      const fn = document.createElement('span'); fn.className = 'fn'; fn.textContent = o.textContent;
      b.append(aa, fn);
      b.onclick = () => { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); syncTiles(); };
      box.append(b);
    }
  }
  syncTiles();
}
document.querySelectorAll('#bgTiles .btile').forEach(b => b.onclick = () => {
  $('bg').value = b.dataset.v; $('bg').dispatchEvent(new Event('change', { bubbles: true })); syncTiles();
});
function syncTiles() {
  document.querySelectorAll('#titleFontTiles .ftile').forEach(b => b.classList.toggle('on', b.dataset.v === $('titleFont').value));
  document.querySelectorAll('#subFontTiles .ftile').forEach(b => b.classList.toggle('on', b.dataset.v === $('subFont').value));
  document.querySelectorAll('#bgTiles .btile').forEach(b => b.classList.toggle('on', b.dataset.v === $('bg').value));
}
// miniaturas reales del fondo con el fotograma actual del clip
const demoBg = document.createElement('canvas'); demoBg.width = 160; demoBg.height = 90;
(() => { const x = demoBg.getContext('2d'); ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'].forEach((c, i) => { x.fillStyle = c; x.fillRect(i * 32, 0, 32, 90); }); })();
function renderBgThumbs() {
  const has = loaded && vid.readyState >= 2;
  const src = has ? vid : demoBg;
  const vw = has ? vid.videoWidth : 160, vh = has ? vid.videoHeight : 90;
  document.querySelectorAll('#bgTiles canvas').forEach(c => {
    const lvl = +c.dataset.l, x = c.getContext('2d'), w = c.width, h = c.height;
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    if (lvl > 0) {
      const r = Math.max(w / vw, h / vh) * 1.2;
      x.filter = `blur(${[0, 1.5, 3, 5.5, 10][lvl]}px)`;
      x.drawImage(src, (w - vw * r) / 2, (h - vh * r) / 2, vw * r, vh * r);
      x.filter = 'none';
      x.fillStyle = `rgba(0,0,0,${[0, .3, .38, .45, .5][lvl]})`; x.fillRect(0, 0, w, h);
    }
    const bh = w * vh / vw; x.drawImage(src, 0, (h - bh) / 2, w, bh);
  });
}
vid.addEventListener('loadeddata', () => setTimeout(renderBgThumbs, 100));
vid.addEventListener('seeked', () => { if ($('s5').classList.contains('open')) renderBgThumbs(); });

function updSummaries() {
  const set = (id, t) => { const el = $('sum-' + id); if (el && el.textContent !== t) el.textContent = t; };
  const n = Object.keys(templates || {}).length;
  set('sT', (activePreset ? activePreset + ' · ' : '') + `${PRESETS.length} de serie` + (n ? ` · ${n} tuya${n > 1 ? 's' : ''}` : ''));
  set('s1', file ? file.name : 'Sin clip');
  const tf = $('titleFont').selectedOptions[0];
  set('s2', $('title').value.trim() ? `${titleStyle === 'box' ? 'Caja blanca' : 'Clásico'} · ${tf ? tf.textContent : ''}` : 'Sin título');
  set('s3', captions.length ? `${captions.length} subtítulos` : 'Sin generar');
  const sf = $('subFont').selectedOptions[0], bgo = $('bg').selectedOptions[0];
  set('s4', `${sf ? sf.textContent : ''} · ${$('subSize').value}`);
  set('s5', `Zoom ${$('zoom').value}% · ${bgo ? bgo.textContent : ''}`);
  set('s7', layoutMode === 'split' ? `Vídeo + imagen${img ? '' : ' (falta imagen)'}` : layoutMode === 'react' ? 'Reacción' : 'Normal');
  set('sL', logo ? `Activo · ${$('logoOp').value}%` : 'Sin logo');
  set('s6', music.cur ? music.cur.name : 'Sin música');
  $('s1').classList.toggle('done', !!file);
  $('sL').classList.toggle('done', !!logo);
}
setInterval(() => { updSummaries(); syncTiles(); callOptsSync(); }, 500);

function callOptsSync() {
  const o = $('callOpts'); if (!o) return; const on = callOn(); o.hidden = !on; if (!on) return;
  o.querySelectorAll('#callNSeg button').forEach(b => b.classList.toggle('on', +b.dataset.n === (crops.n || 2)));
}
setTimeout(() => { const g = $('callNSeg'); if (!g) return; g.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { setCallN(+b.dataset.n); callOptsSync(); } });
  $('callFind').onclick = () => { camDetectedFor = null; callDetect().then(() => { pushHistory(); callOptsSync(); }); }; }, 0);
// el panel «Tu clip» se puede hacer más ancho o más estrecho arrastrando su borde (se recuerda)
(() => {
  const rz = document.createElement('div'); rz.className = 'se-rz'; rz.title = 'Arrastra para hacer el panel más ancho o más estrecho · doble clic: tamaño normal'; rz.hidden = true; document.body.append(rz);
  const minW = 420, maxW = () => Math.max(minW, innerWidth - 340);
  const set = w => { if (w == null) { document.documentElement.style.removeProperty('--seW'); return; } document.documentElement.style.setProperty('--seW', Math.round(Math.max(minW, Math.min(maxW(), w))) + 'px'); };
  try { const v = +localStorage.getItem('clipzi-seW'); if (v) set(v); } catch {}
  const show = () => { const e = $('stEd'); rz.hidden = !e || e.hidden || e.classList.contains('full'); };
  setInterval(show, 400);
  let d = null;
  rz.addEventListener('pointerdown', e => { e.preventDefault(); rz.setPointerCapture(e.pointerId); d = { x: e.clientX, w: $('stEd').getBoundingClientRect().width }; rz.classList.add('on'); document.body.classList.add('se-rzing'); });
  rz.addEventListener('pointermove', e => { if (!d) return; set(d.w + (d.x - e.clientX)); });
  const up = () => { if (!d) return; d = null; rz.classList.remove('on'); document.body.classList.remove('se-rzing'); try { localStorage.setItem('clipzi-seW', Math.round($('stEd').getBoundingClientRect().width)); } catch {} dispatchEvent(new Event('resize')); };
  rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
  rz.addEventListener('dblclick', () => { set(null); try { localStorage.removeItem('clipzi-seW'); } catch {} dispatchEvent(new Event('resize')); });
  addEventListener('resize', () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--seW')); if (v > maxW()) set(maxW()); });
})();
setTimeout(() => { const hb = $('lvPrepH'); if (hb) { hb.onclick = () => stEdPrep(); setInterval(() => { const ed = $('stEd'); hb.hidden = !!(ed && !ed.hidden); }, 600); }
}, 0);


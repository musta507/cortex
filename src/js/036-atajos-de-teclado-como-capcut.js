/* ---------- atajos de teclado (como CapCut) ---------- */
const KEYS = [
  ['Reproducción', [['Espacio', 'Reproducir / pausar'], ['K', 'Pausar'], ['L', 'Reproducir (pulsa más veces = más rápido)'], ['J', 'Rebobinar (pulsa más veces = más rápido)'],
    ['← / →', 'Un fotograma atrás / adelante'], ['Shift + ← / →', '1 segundo atrás / adelante'], ['↑ / ↓', 'Corte anterior / siguiente'], ['Inicio / Fin', 'Ir al principio / al final'], ['F', 'Vista previa a pantalla completa']]],
  ['Edición', [['Ctrl + B', 'Dividir en el cabezal'], ['Supr', 'Borrar lo seleccionado'], ['Q', 'Borrar lo de antes del cabezal'], ['W', 'Borrar lo de después del cabezal'],
    ['Ctrl + C', 'Copiar'], ['Ctrl + V', 'Pegar en el cabezal'], ['Ctrl + D', 'Duplicar'], ['Ctrl + A', 'Seleccionar todo'], ['Esc', 'Quitar la selección'],
    ['Ctrl + Z', 'Deshacer'], ['Ctrl + Shift + Z', 'Rehacer'], ['N', 'Imán on / off']]],
  ['Línea de tiempo y proyecto', [['Ctrl + rueda', 'Acercar / alejar la línea de tiempo'], ['Ctrl + + / −', 'Acercar / alejar'], ['Rueda', 'Desplazar a los lados'], ['Ctrl + S', 'Guardar'], ['Ctrl + E', 'Exportar'], ['?', 'Ver estos atajos']]],
];
(function () {
  const g = $('keysGrid');
  for (const [h, list] of KEYS) {
    const t = document.createElement('h4'); t.textContent = h; g.append(t);
    for (const [k, d] of list) { const a = document.createElement('div'); a.className = 'kk'; k.split(' / ').forEach((p, i) => { if (i) a.append(' / '); p.split(' + ').forEach((q, j) => { if (j) a.append('+'); const kb = document.createElement('kbd'); kb.textContent = q; a.append(kb); }); }); const b = document.createElement('div'); b.textContent = d; g.append(a, b); }
  }
})();
const showKeys = v => { $('keysModal').hidden = !v; };
$('tbKeys').onclick = () => showKeys(true); $('keysClose').onclick = () => showKeys(false);
$('keysModal').addEventListener('pointerdown', e => { if (e.target === $('keysModal')) showKeys(false); });
let rewT = null, rewRate = 0, fwdRate = 1;
function stopRewind() { clearInterval(rewT); rewT = null; rewRate = 0; }
function frameStep(n) { vid.pause(); stopRewind(); playEnd = false; seekOut(curT() + n / srcFpsV()); }
function typingIn(el) { return el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button|color|file)$/.test(el.type))); }
document.addEventListener('keydown', e => {
  if (cropMode) return;
  if (!$('keysModal').hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); showKeys(false); } return; }
  if (typingIn(document.activeElement)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, low = k.toLowerCase();
  const go = fn => { e.preventDefault(); fn(); };
  if (ctrl) {
    if (low === 'b') return go(splitAt);
    if (low === 'c') return go(() => copySel());
    if (low === 'v') return;   // lo gestiona el evento «paste»: imagen copiada → pantalla dividida; si no, pega los trozos copiados
    if (low === 'd') return go(duplicateSel);
    if (low === 'a') return go(selectAll);
    if (low === 's') return go(() => saveNow().then(() => toast('Proyecto guardado'), () => toast('No se pudo guardar')));
    if (low === 'e') return go(() => $('export').click());
    if (k === '+' || k === '=' || e.code === 'NumpadAdd') return go(() => setTlZoom(+$('tlZoom').value * 1.5));
    if (k === '-' || e.code === 'NumpadSubtract') return go(() => setTlZoom(+$('tlZoom').value / 1.5));
    return;   // Ctrl+Z / Ctrl+Y los gestiona el deshacer
  }
  if (e.altKey) return;
  if (k === ' ' || e.code === 'Space') return go(togglePlay);
  if (low === 'k') return go(() => { vid.pause(); stopRewind(); fwdRate = 1; vid.playbackRate = 1; });
  if (low === 'l') return go(() => { stopRewind(); ensureAudio(); if (vid.paused) { fwdRate = 1; if (playEnd || curT() >= totalDur() - 0.04) seekOut(0); playEnd = false; vid.play().catch(() => {}); } else fwdRate = Math.min(8, fwdRate * 2); vid.playbackRate = fwdRate; toast(`▶ ×${fwdRate}`); });
  if (low === 'j') return go(() => { vid.pause(); rewRate = rewRate ? Math.min(8, rewRate * 2) : 1; toast(`◀◀ ×${rewRate}`); clearInterval(rewT);
    rewT = setInterval(() => { const T = curT() - 0.05 * rewRate; if (T <= 0) { seekOut(0); stopRewind(); } else seekOut(T); }, 50); });
  if (k === 'ArrowLeft') return go(() => e.shiftKey ? (vid.pause(), seekOut(curT() - 1)) : frameStep(-1));
  if (k === 'ArrowRight') return go(() => e.shiftKey ? (vid.pause(), seekOut(curT() + 1)) : frameStep(1));
  if (k === 'ArrowUp' || k === 'ArrowDown') return go(() => { const T = curT(), P = cutPoints(); vid.pause(); const n = k === 'ArrowUp' ? [...P].reverse().find(p => p < T - 0.01) : P.find(p => p > T + 0.01); if (n != null) seekOut(n); });
  if (k === 'Home') return go(() => { vid.pause(); seekOut(0); });
  if (k === 'End') return go(() => { vid.pause(); seekOut(totalDur()); });
  if (k === 'Delete' || k === 'Backspace') return go(deleteSel);
  if (low === 'q') return go(() => trimSide(true));
  if (low === 'w') return go(() => trimSide(false));
  if (low === 'n') return go(() => $('tbMagnet').click());
  if (low === 'f') return go(() => { const ph = $('phone'); if (document.fullscreenElement) document.exitFullscreen(); else ph.requestFullscreen && ph.requestFullscreen().catch(() => {}); });
  if (k === '?') return go(() => showKeys(true));
  if (k === 'Escape') return go(() => { tsel.clear(); if (selTextId() != null) selectText(null, true); selected = null; tlSig = ''; });
});
// las flechas y el espacio no deben mover sliders ni pulsar botones con el foco puesto
document.addEventListener('keyup', e => { if (e.key === ' ' && !typingIn(document.activeElement)) e.preventDefault(); });

/* refresco */
function sigNow() {
  return [totalDur(), segs.map(g => g.id + ':' + g.s.toFixed(3) + '-' + g.e.toFixed(3)).join(','), texts.map(t => t.id + t.text + t.start.toFixed(2) + t.end.toFixed(2)).join('|'),
    captions.length, captions.map(c => c.words.map(w => w.text).join(' ') + c.start.toFixed(2) + c.end.toFixed(2)).join('|').length + ':' + (captions[0] ? captions[0].start : 0),
    $('title').value, music.cur && music.cur.id, $('mLoop').checked, $('mStart').value, !!logo, $('tlZoom').value, $('tlScroll').clientWidth,
    [...tsel].join(','), layoutMode, zones.map(z => z.s.toFixed(3)).join(','), JSON.stringify(trk), loaded, mutes.length].join('§');
}
// la línea de tiempo: el «¿ha cambiado algo?» se mira al reproducir, al tocar algo o cada 0,25 s (antes, 60 veces por segundo),
// y la aguja y el contador solo se mueven si cambia el tiempo
let tlSigAt = 0, tlLastT = -1;
function tlTick() {
  requestAnimationFrame(tlTick);
  const now = performance.now(), playing = !vid.paused || !!rewT;
  let changed = false;
  if (!tlSig || playing || now - pvDirty < 350 || now - tlSigAt > 250) {
    tlSigAt = now; const sig = sigNow();
    if (sig !== tlSig) { tlSig = sig; renderTimeline(); changed = true; pvMark(); }
  }
  const T = curT();
  if (!changed && !playing && T === tlLastT) return;
  tlLastT = T;
  const k = pps(), x = tlPad + T * k;
  $('playhead').style.left = x + 'px';
  $('tlTime').textContent = fmtTC(T) + ' / ' + fmtTC(totalDur());
  if (!vid.paused || rewT) {
    const sc = $('tlScroll');
    if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - 60;
  }
  const ts = vid.currentTime || 0;
  document.querySelectorAll('#trCaps .cap').forEach(el => { const c = captions[+el.dataset.i]; el.classList.toggle('on', !!c && ts >= c.start && ts < c.end); });
}
vid.addEventListener('loadeddata', () => { buildThumbs(); tlSig = ''; });
syncTrackUI();
requestAnimationFrame(tlTick);

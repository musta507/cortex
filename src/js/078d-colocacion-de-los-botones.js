/* ---------- Manual: dónde van los botones respecto al directo (cada clipper elige su escena) ----------
   debajo: no tapan nada (por defecto) · encima: como un reproductor y se esconden si no mueves el ratón · al lado: en una columna */
const LV_LAYS = [['below', 'Botones debajo', 'No tapan nada del directo', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18"/>'],
  ['over', 'Botones encima', 'El directo más grande; se esconden si no mueves el ratón', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M6 15h12" stroke-dasharray="2 2"/>'],
  ['side', 'Botones al lado', 'En una columna a la derecha, con los botones grandes', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>']];
const lvLay = () => (LV_LAYS.find(x => x[0] === ezPref('lvLay')) || LV_LAYS[0])[0];
function lvLaySync() {
  const p = $('livePage'); if (!p) return; const l = lvLay();
  for (const [k] of LV_LAYS) p.classList.toggle('lay-' + k, k === l);
  const b = $('lvLayB'); if (b) b.querySelector('svg').innerHTML = LV_LAYS.find(x => x[0] === l)[3];
}
function lvLayMenu() {
  const old = document.querySelector('.lv-laypop'); if (old) { old.remove(); return; }
  const b = $('lvLayB'), r = b.getBoundingClientRect(), m = document.createElement('div'); m.className = 'lv-laypop'; m.setAttribute('role', 'menu');
  m.innerHTML = '<div class="lv-laypop-h">Dónde van los botones</div>';
  for (const [k, t, d, svg] of LV_LAYS) {
    const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitemradio'); it.setAttribute('aria-checked', k === lvLay() ? 'true' : 'false'); it.className = k === lvLay() ? 'on' : '';
    it.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span><b></b><small></small></span>`; it.querySelector('b').textContent = t; it.querySelector('small').textContent = d;
    it.onclick = () => { ezPref('lvLay', k); lvLaySync(); m.remove(); }; m.append(it);
  }
  m.style.top = (r.bottom + 8) + 'px'; m.style.left = Math.max(12, Math.min(innerWidth - 300, r.right - 290)) + 'px';
  document.body.append(m);
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target) && e.target !== b && !b.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
}
// «encima»: los botones se esconden a los 2,5 s sin mover el ratón (y al sacar el ratón del directo)
let lvIdleT = null;
function lvWake() { const m = $('lvMini'); if (!m) return; m.classList.remove('idle'); clearTimeout(lvIdleT); lvIdleT = setTimeout(() => { if (!m.matches(':hover') || !m.querySelector('.lv-stage:hover')) m.classList.add('idle'); }, 2500); }
setTimeout(() => {
  const b = $('lvLayB'); if (!b) return;
  b.addEventListener('click', e => { e.stopPropagation(); lvLayMenu(); });
  const m = $('lvMini');
  m.addEventListener('pointermove', lvWake); m.addEventListener('pointerdown', lvWake);
  m.addEventListener('pointerleave', () => { clearTimeout(lvIdleT); if (!document.querySelector('.lv-laypop')) m.classList.add('idle'); });
  document.addEventListener('keydown', e => { if (!$('livePage').hidden) lvWake(); });
  lvLaySync();
}, 0);

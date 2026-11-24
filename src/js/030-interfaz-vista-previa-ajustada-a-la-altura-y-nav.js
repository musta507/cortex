/* ---------- interfaz: vista previa ajustada a la altura y navegación ---------- */
const deskMQ = matchMedia('(min-width:981px)');
function fitCanvas() {
  if (!deskMQ.matches) { cv.style.width = ''; cv.style.height = ''; return; }
  const ph = $('phone'), w = ph.clientWidth, h = ph.clientHeight;
  const cw = Math.max(120, Math.min(w, h * 9 / 16));
  cv.style.width = cw + 'px'; cv.style.height = (cw * 16 / 9) + 'px';
}
new ResizeObserver(fitCanvas).observe($('phone'));
deskMQ.addEventListener('change', fitCanvas);

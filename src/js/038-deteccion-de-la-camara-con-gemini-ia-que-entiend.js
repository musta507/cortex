/* ---------- detección de la cámara con Gemini (IA que entiende la imagen) ---------- */
const GEM_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3-flash', 'gemini-2.5-flash'];
const GEM_LITE = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
// para DECIDIR los clips: el modelo más listo que haya (si no está, uno rápido)
const GEM_SMART = ['gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-3.1-pro', ...GEM_MODELS];
@@solo-pc
const getGemKey = () => { try { return (localStorage.getItem('clipzi-gemini') || '').trim(); } catch { return ''; } };
@@fin
@@solo-web
const CORTEX_PROXY = /^https?:$/.test(location.protocol);
const getGemKey = () => { if (CORTEX_PROXY) return 'servidor'; try { return (localStorage.getItem('clipzi-gemini') || '').trim(); } catch { return ''; } };
@@fin
$('gemKey').value = getGemKey();
$('gemKey').addEventListener('input', () => { try { localStorage.setItem('clipzi-gemini', $('gemKey').value.trim()); } catch {} });
// ajusta cada lado del recuadro de Gemini a la línea recta más cercana (bordes exactos)
function snapToEdges(r, E) {
  const { w, h, gx, gy } = E, T = 16;
  const colCov = (x, y0, y1) => { let c = 0; for (let y = y0; y < y1; y++) if (Math.max(gx[y * w + x] || 0, gx[y * w + x + 1] || 0) > T) c++; return (y1 - y0) > 3 ? c / (y1 - y0) : 0; };
  const rowCov = (y, x0, x1) => { let c = 0; for (let x = x0; x < x1; x++) if (Math.max(gy[y * w + x] || 0, gy[(y + 1) * w + x] || 0) > T) c++; return (x1 - x0) > 3 ? c / (x1 - x0) : 0; };
  let x0 = Math.round(r.x * w), x1 = Math.round((r.x + r.w) * w), y0 = Math.round(r.y * h), y1 = Math.round((r.y + r.h) * h);
  const tx = Math.round(w * 0.03), ty = Math.round(h * 0.03);
  const best = (isCol, p, a0, a1, tol, max) => { let bp = p, bs = 0.6; for (let q = Math.max(1, p - tol); q <= Math.min(max - 2, p + tol); q++) { const c = isCol ? colCov(q, a0, a1) : rowCov(q, a0, a1); if (c > bs) { bs = c; bp = q; } } return bp; };
  const nx0 = x0 <= 2 ? 0 : best(true, x0, y0, y1, tx, w), nx1 = x1 >= w - 2 ? w : best(true, x1, y0, y1, tx, w);
  const ny0 = y0 <= 2 ? 0 : best(false, y0, x0, x1, ty, h), ny1 = y1 >= h - 2 ? h : best(false, y1, x0, x1, ty, h);
  return { x: nx0 / w, y: ny0 / h, w: (nx1 - nx0) / w, h: (ny1 - ny0) / h };
}


/* ---------- el logo se aparta solo si tapa algo importante (sube o baja poco) ---------- */
const logoAuto = { dy: 0, due: 0, manual: false };
let lastSubBox = null;
function scheduleLogoAvoid() { logoAuto.due = performance.now() + 400; }
function computeLogoAvoid() {
  logoAuto.due = 0;
  if (!logo || trk.logo.hide || !lastLayout || logoAuto.manual || !loaded) { if (!logo || !loaded) logoAuto.dy = 0; return; }
  const s = S(), lw = W * s.logoSize, lh = lw * logo.img.naturalHeight / logo.img.naturalWidth, L = lastLayout;
  const imp = [];   // [rect, importancia]
  if (boxes.title) imp.push([{ x: boxes.title.x - 16, y: boxes.title.y - 16, w: boxes.title.w + 32, h: boxes.title.h + 32 }, 1]);
  if (lastSubBox) imp.push([{ x: 0, y: lastSubBox.y - 14, w: W, h: lastSubBox.h + 28 }, 1]);
  for (const b of Object.values(txtBoxes)) imp.push([{ x: b.x - b.w / 2 - 12, y: b.y - b.h / 2 - 12, w: b.w + 24, h: b.h + 24 }, 1]);
  if (L.react) {
    imp.push([{ x: W * 0.26, y: L.ir.y + L.ir.h * 0.1, w: W * 0.48, h: L.ir.h * 0.75 }, 1]);   // la cara del streamer
    const v = L.video, x0 = Math.max(v.x, L.vr.x), y0 = Math.max(v.y, L.vr.y), x1 = Math.min(v.x + v.w, L.vr.x + L.vr.w), y1 = Math.min(v.y + v.h, L.vr.y + L.vr.h);
    if (L.contain && x1 > x0 && y1 > y0) imp.push([{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 0.8]);   // tweet, TikTok, web…
    else imp.push([{ x: W * 0.2, y: L.vr.y + L.vr.h * 0.15, w: W * 0.6, h: L.vr.h * 0.7 }, 0.35]);  // la acción
  } else if (L.vr) {
    const v = L.vr, x0 = Math.max(0, v.x), y0 = Math.max(0, v.y), x1 = Math.min(W, v.x + v.w), y1 = Math.min(H, v.y + v.h);
    if (x1 > x0 && y1 > y0) imp.push([{ x: x0 + (x1 - x0) * 0.15, y: y0 + (y1 - y0) * 0.15, w: (x1 - x0) * 0.7, h: (y1 - y0) * 0.7 }, 0.35]);
  }
  const cost = dy => {
    const r = { x: logoPos.x - lw / 2, y: logoPos.y + dy - lh / 2, w: lw, h: lh };
    let c = 0;
    for (const [b, k] of imp) { const ix = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)), iy = Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y)); c += ix * iy * k; }
    return c / (lw * lh);
  };
  const MAX = 150;
  if (cost(0) < 0.02) { logoAuto.dy = 0; return; }
  let best = 0, bc = cost(0);
  for (let d = 10; d <= MAX; d += 10) for (const dy of [-d, d]) {
    const top = logoPos.y + dy - lh / 2, bot = logoPos.y + dy + lh / 2;
    if (top < 20 || bot > H - 20) continue;
    const c = cost(dy);
    if (c < bc - 0.01) { bc = c; best = dy; }
    if (bc < 0.02) break;
  }
  logoAuto.dy = best;
}

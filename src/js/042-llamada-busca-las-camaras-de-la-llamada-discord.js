/* ---------- «Llamada»: busca las cámaras de la llamada (Discord) y pone a cada persona en su franja ---------- */
const CALL_ROWS = { 2: [2], 3: [2, 1], 4: [2, 2], 5: [3, 2] };
function callGrid(n) {   // cómo suele colocar Discord las cámaras (si no se encuentran)
  const rows = CALL_ROWS[n] || [n], out = [];
  rows.forEach((c, r) => { const h = 1 / rows.length, w = 1 / Math.max(...rows), x0 = (1 - c * w) / 2; for (let i = 0; i < c; i++) out.push({ t: { x: x0 + i * w, y: r * h, w, h }, fx: x0 + (i + 0.5) * w, fy: r * h + h * 0.42 }); });
  return out;
}
function callAsp(n) { const eT = +$('edgeT').value || 0, eB = +$('edgeB').value || 0; return W / ((H - eT - eB) / n); }
// recorte con la forma justa de su franja, dentro de la cámara de esa persona y con la cara a la vista
function callCrop(o, asp, vw, vh) {
  const t = o.t, tw = t.w * vw, th = t.h * vh; let cw, ch, cx, cy;
  if (tw / th > asp) { ch = th; cw = th * asp; cx = Math.min(t.x * vw + tw - cw, Math.max(t.x * vw, o.fx * vw - cw / 2)); cy = t.y * vh; }
  else { cw = tw; ch = tw / asp; cx = t.x * vw; cy = Math.min(t.y * vh + th - ch, Math.max(t.y * vh, o.fy * vh - ch * 0.4)); }
  return { x: cx / vw, y: cy / vh, w: cw / vw, h: ch / vh };
}
// los bordes de la cámara de una persona: Discord separa cada cámara con una franja oscura
function callTile(c, g) {
  const w = 640, h = Math.round(w * c.height / c.width), cv2 = document.createElement('canvas'); cv2.width = w; cv2.height = h;
  const x2 = cv2.getContext('2d', { willReadFrequently: true }); x2.drawImage(c, 0, 0, w, h); const d = x2.getImageData(0, 0, w, h).data;
  const bg = (X, Y) => { const i = (Y * w + X) * 4, mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); return mx < 60 && mx - mn < 22; };
  const cl = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
  const fx = g.cx * w, fy = g.cy * h, fw = Math.max(3, g.w * w), fh = Math.max(3, g.h * h);
  const y0 = cl(fy - fh * 1.3, 0, h - 1), y1 = cl(fy + fh * 1.3, 0, h - 1), x0 = cl(fx - fw * 1.3, 0, w - 1), x1 = cl(fx + fw * 1.3, 0, w - 1);
  const colBg = X => { let n = 0; for (let Y = y0; Y <= y1; Y++) if (bg(X, Y)) n++; return n / (y1 - y0 + 1) > 0.9; };
  const rowBg = Y => { let n = 0; for (let X = x0; X <= x1; X++) if (bg(X, Y)) n++; return n / (x1 - x0 + 1) > 0.9; };
  let L = 0, Rr = w, T = 0, B = h;
  for (let X = cl(fx - fw * 0.8, 1, w - 1); X >= 1; X--) if (colBg(X) && colBg(X - 1)) { L = X + 1; break; }
  for (let X = cl(fx + fw * 0.8, 0, w - 2); X < w - 1; X++) if (colBg(X) && colBg(X + 1)) { Rr = X; break; }
  for (let Y = cl(fy - fh * 0.8, 1, h - 1); Y >= 1; Y--) if (rowBg(Y) && rowBg(Y - 1)) { T = Y + 1; break; }
  for (let Y = cl(fy + fh * 0.9, 0, h - 2); Y < h - 1; Y++) if (rowBg(Y) && rowBg(Y + 1)) { B = Y; break; }
  const r = { x: L / w, y: T / h, w: (Rr - L) / w, h: (B - T) / h };
  if (r.w < g.w * 2.4 || r.h < g.h * 1.8) return null;          // demasiado pequeño: no es una cámara
  if (r.w > 0.9 && r.h > 0.9) return null;                      // es la pantalla entera: no hay cuadrícula
  return r;
}
function setCallN(n, quiet) {
  n = Math.max(2, Math.min(5, n)); const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080, asp = callAsp(n);
  const grid = callGrid(n), src = crops.callT && crops.callT.length ? crops.callT : [];
  const list = []; for (let i = 0; i < n; i++) list.push(callCrop(src[i] || grid[i], asp, vw, vh));
  zones = []; crops.n = n; crops.cam = list[0]; crops.content = list[1]; crops.more = list.slice(2); crops.camFx = 0.5; crops.fit = 'cover'; delete crops.zk;
  setRange('zoom', 100); setRange('offX', 0); setRange('offY', 0);
  tlSig = ''; if (!quiet) { pushHistory(); toast(n + ' personas en la llamada · arrastra cada una para encuadrarla'); }
}
async function callDetect() {
  if (!loaded) return false;
  const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080;
  let people = [], frames = [];
  try {
    aiov('work', 'Buscando a las personas de la llamada', 'Cargando la IA de caras (la primera vez tarda un poco más)…');
    await loadFaceApi();
    frames = await sampleFrames(6); const all = [];
    for (let i = 0; i < frames.length; i++) { aiov('work', 'Buscando a las personas de la llamada', `Fotograma ${i + 1} de ${frames.length}…`); for (const f of await facesIn(frames[i])) all.push({ ...f, i }); }
    const groups = [];
    for (const f of all) {
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      let g = groups.find(g => Math.hypot(g.cx - cx, (g.cy - cy) * vh / vw) < Math.max(g.w, f.w) * 1.2);
      if (!g) { g = { items: [], cx, cy, w: f.w, h: f.h }; groups.push(g); }
      g.items.push(f); const n = g.items.length;
      g.cx = g.items.reduce((a, x) => a + x.x + x.w / 2, 0) / n; g.cy = g.items.reduce((a, x) => a + x.y + x.h / 2, 0) / n;
      g.w = g.items.reduce((a, x) => a + x.w, 0) / n; g.h = g.items.reduce((a, x) => a + x.h, 0) / n;
    }
    people = groups.map(g => ({ ...g, seen: new Set(g.items.map(x => x.i)).size })).filter(g => g.seen >= 2 && g.w > 0.012)
      .sort((a, b) => b.seen * b.w - a.seen * a.w).slice(0, 5);
  } catch (e) { console.warn('llamada', e); }
  aiov('hide'); aiovT0 = 0;
  // en orden de lectura: fila a fila y de izquierda a derecha
  people.sort((a, b) => Math.abs(a.cy - b.cy) > 0.12 ? a.cy - b.cy : a.cx - b.cx);
  const fr = frames[Math.floor(frames.length / 2)];
  crops.callT = people.map(g => {
    let t = null; try { if (fr) t = callTile(fr, g); } catch (e) { console.warn('cámara', e); }
    if (!t) { const hp = Math.min(1, g.h * 5.5), wp = Math.min(1, hp * vh / vw * 1.6); t = { x: Math.max(0, Math.min(1 - wp, g.cx - wp / 2)), y: Math.max(0, Math.min(1 - hp, g.cy - hp * 0.4)), w: wp, h: hp }; }
    return { t, fx: g.cx, fy: g.cy };
  });
  const n = Math.max(2, Math.min(5, people.length || (crops.n || 2)));
  if (people.length < 2) crops.callT = [];
  setCallN(n, true);
  toast(people.length >= 2 ? `${n} personas encontradas · arrastra cada una para encuadrarla, la rueda acerca o aleja` : 'No he encontrado bien las caras: he puesto las cámaras como suele colocarlas Discord. Ajusta cada una con el ratón');
  return people.length >= 2;
}

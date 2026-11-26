/* ---------- «Varias cámaras»: varias personas reaccionando a lo mismo. Lo que ven va en grande y sus cámaras pequeñas
   debajo de 2 en 2 (A), en una tira abajo (B) o arriba (C). Las cámaras y lo que ven se buscan solos: con Gemini si hay clave
   y, si no, con la IA de caras. Después se puede arrastrar cada cámara para encuadrarla. ---------- */
function mcGeom(n) { const eT = +$('edgeT').value || 0, eB = +$('edgeB').value || 0; return mcCells(n, mcLay(), eT, Math.max(200, H - eT - eB), (+$('ratio').value || 58) / 100); }
function mcFallback(n) {   // si no se encuentran: una fila de cámaras abajo, como en muchos directos
  const out = []; for (let i = 0; i < n; i++) out.push({ t: { x: 0.25 + 0.5 * i / n, y: 0.86, w: 0.5 / n, h: 0.14 }, fx: 0.25 + 0.5 * (i + 0.5) / n, fy: 0.92 });
  return out;
}
function mcSet(n, quiet) {
  n = Math.max(2, Math.min(5, n)); const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080, g = mcGeom(n);
  const src = crops.mcT && crops.mcT.length ? crops.mcT : [], fb = mcFallback(n);
  const list = g.cells.map((R, i) => callCrop(src[i] || fb[i], R.w / R.h, vw, vh));
  zones = []; crops.n = n; crops.cam = list[0]; crops.more = list.slice(1);
  crops.content = crops.mcC ? { ...crops.mcC } : { x: 0, y: 0, w: 1, h: 1 }; crops.camFx = 0.5; crops.fit = 'cover'; delete crops.zk;
  setRange('zoom', 100); setRange('offX', 0); setRange('offY', 0);
  tlSig = ''; if (!quiet) { pushHistory(); toast(n + ' cámaras · arrastra cada una para encuadrarla'); }
}
function mcSetLay(l) { $('mcLay').value = l; $('mcLay').dispatchEvent(new Event('input', { bubbles: true })); mcSet(crops.n || 3, true); pushHistory(); }
// lo que están viendo: la parte más grande de la imagen que queda fuera de las cámaras
function mcContentFrom(tiles) {
  if (!tiles.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.min(...tiles.map(t => t.x)), y0 = Math.min(...tiles.map(t => t.y)), x1 = Math.max(...tiles.map(t => t.x + t.w)), y1 = Math.max(...tiles.map(t => t.y + t.h));
  const c = [{ x: 0, y: 0, w: x0, h: 1 }, { x: x1, y: 0, w: 1 - x1, h: 1 }, { x: 0, y: 0, w: 1, h: y0 }, { x: 0, y: y1, w: 1, h: 1 - y1 }].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  return c.w * c.h >= 0.25 ? c : { x: 0, y: 0, w: 1, h: 1 };
}
async function mcGemini(frame) {
  const prompt = `This is a frame from a livestream where several people react to the same thing. Their webcams are shown as SMALL rectangles (in a row, a column or a corner) on top of or next to the MAIN content they are all watching (a video, a game, a website, a show).
Return:
- "cams": one entry per small webcam rectangle with a person, box_2d tightly fitted to the INNER edges of each webcam image (no borders, no names below), plus face_box_2d for the face inside it. Ignore big faces that are part of the main content (a photo, a video, a TV host filling the screen).
- "content_box_2d": the main content they are watching, without the webcams and without browser bars or page margins.
Answer only JSON: {"cams":[{"box_2d":[ymin,xmin,ymax,xmax],"face_box_2d":[ymin,xmin,ymax,xmax]}],"content_box_2d":[ymin,xmin,ymax,xmax]}. Coordinates normalized to 0-1000. Order the cams left to right, top to bottom. Max 5 cams.`;
  const o = await geminiJSON([{ inline_data: { mime_type: 'image/jpeg', data: frame.toDataURL('image/jpeg', 0.88).split(',')[1] } }, { text: prompt }], 0);
  const cams = (o && Array.isArray(o.cams) ? o.cams : []).map(c => { const t = box2(c.box_2d), f = box2(c.face_box_2d); return t && t.w > 0.02 && t.h > 0.02 ? { t, fx: f ? f.x + f.w / 2 : t.x + t.w / 2, fy: f ? f.y + f.h / 2 : t.y + t.h * 0.4 } : null; }).filter(Boolean).slice(0, 5);
  return { cams, content: box2(o && o.content_box_2d) };
}
async function mcFaces(frames) {
  await loadFaceApi();
  const all = [];
  const t0 = performance.now();
  for (let i = 0; i < frames.length; i++) {
    if (i >= 2 && performance.now() - t0 > 15000) break;   // nunca se queda pensando: con dos fotogramas ya vale
    aiov('work', 'Buscando las cámaras', `Fotograma ${i + 1} de ${frames.length}…`);
    const c = frames[i]; for (const f of await facesIn(c)) all.push({ ...f, i });
    if (c._mcx) { for (const f of c._mcx) all.push({ ...f, i }); continue; } c._mcx = [];
    // además, el centro de arriba y de abajo ampliados (ahí suelen ir las tiras de cámaras pequeñas)
    const q = document.createElement('canvas'); q.width = c.width; q.height = c.height; const qx = q.getContext('2d'), tw = c.width / 3, th = c.height / 3;
    for (const [ox, oy] of [[tw, 0], [tw, c.height - th]]) {
      qx.drawImage(c, ox, oy, tw, th, 0, 0, q.width, q.height);
      for (const d of await faceapi.detectAllFaces(q, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6, maxResults: 10 }))) { const b = d.box; const f = { x: (ox + b.x / 3) / c.width, y: (oy + b.y / 3) / c.height, w: b.width / 3 / c.width, h: b.height / 3 / c.height, s: d.score }; c._mcx.push(f); all.push({ ...f, i }); }
    }
  }
  const groups = [];
  for (const f of all) {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    let g = groups.find(g => Math.hypot(g.cx - cx, (g.cy - cy) * 9 / 16) < Math.max(g.w, f.w) * 1.2);
    if (!g) { g = { items: [], cx, cy, w: f.w, h: f.h }; groups.push(g); }
    g.items.push(f); const n = g.items.length;
    g.cx = g.items.reduce((a, x) => a + x.x + x.w / 2, 0) / n; g.cy = g.items.reduce((a, x) => a + x.y + x.h / 2, 0) / n;
    g.w = g.items.reduce((a, x) => a + x.w, 0) / n; g.h = g.items.reduce((a, x) => a + x.h, 0) / n;
  }
  let ppl = groups.map(g => ({ ...g, seen: new Set(g.items.map(x => x.i)).size })).filter(g => g.seen >= 2);
  // las cámaras son caras pequeñas y parecidas entre sí: fuera las caras grandes del contenido
  if (ppl.length > 2) { const ws = ppl.map(g => g.w).sort((a, b) => a - b), med = ws[ws.length >> 1]; ppl = ppl.filter(g => g.w <= med * 2 && g.w >= med * 0.4); }
  ppl = ppl.filter(g => g.w < 0.16).sort((a, b) => b.seen - a.seen).slice(0, 5);
  const fr = frames[Math.floor(frames.length / 2)], vw = vid.videoWidth || 16, vh = vid.videoHeight || 9;
  const cams = ppl.map(g => {
    let t = null; try { if (fr) t = callTile(fr, g); } catch {}
    if (!t || t.w > 0.45 || t.h > 0.45) { const hp = Math.min(0.5, g.h * 3.2), wp = Math.min(0.5, hp * vh / vw * 16 / 9); t = { x: Math.max(0, Math.min(1 - wp, g.cx - wp / 2)), y: Math.max(0, Math.min(1 - hp, g.cy - hp * 0.42)), w: wp, h: hp }; }
    return { t, fx: g.cx, fy: g.cy };
  });
  return { cams, content: null };
}
async function mcDetect() {
  if (!loaded) return false;
  let r = { cams: [], content: null };
  const work = async () => {
    aiov('work', 'Buscando las cámaras', 'Mirando el clip…');
    const frames = await sampleFrames(5);
    if (getGemKey()) { try { aiov('work', 'Buscando las cámaras', 'La IA está localizando cada cámara y lo que ven…'); r = await Promise.race([mcGemini(frames[2] || frames[0]), new Promise((_, no) => setTimeout(() => no(new Error('la IA tarda demasiado')), 12000))]); } catch (e) { console.warn('varias cámaras · Gemini', e); } }
    if (r.cams.length < 2) r = await mcFaces([frames[0], frames[2], frames[4]].filter(Boolean));
  };
  // pase lo que pase, en 40 s como mucho se queda con lo que haya (y si no hay nada, 3 cámaras abajo para ajustarlas a mano)
  try { await Promise.race([work(), new Promise(ok => setTimeout(ok, 40000))]); } catch (e) { console.warn('varias cámaras', e); }
  if (!r || !r.cams) r = { cams: [], content: null };
  aiov('hide'); aiovT0 = 0;
  // en orden de lectura y sin pisarse en la misma fila
  const cams = r.cams.sort((a, b) => Math.abs(a.t.y - b.t.y) > Math.min(a.t.h, b.t.h) * 0.6 ? a.t.y - b.t.y : a.t.x - b.t.x);
  for (let i = 1; i < cams.length; i++) { const a = cams[i - 1].t, b = cams[i].t; if (Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.6 && a.x + a.w > b.x) { const m = (a.x + a.w + b.x) / 2; a.w = m - a.x; b.w = b.x + b.w - m; b.x = m; } }
  crops.mcT = cams.length >= 2 ? cams : [];
  crops.mcC = r.content && r.content.w * r.content.h > 0.15 ? r.content : mcContentFrom(cams.map(c => c.t));
  // si las cámaras están arriba en el directo, se proponen arriba también (C); si no, debajo (A)
  if (cams.length >= 2 && $('mcLay').value !== 'B') { const top = cams.every(c => c.t.y + c.t.h < 0.4); $('mcLay').value = top ? 'C' : 'A'; }
  mcSet(Math.max(2, Math.min(5, cams.length || crops.n || 3)), true);
  toast(cams.length >= 2 ? `${cams.length} cámaras encontradas · arrastra cada una para encuadrarla, la rueda acerca o aleja` : 'No he encontrado bien las cámaras: he puesto 3 abajo. Ajusta cada una con el ratón o elige cuántas hay');
  return cams.length >= 2;
}
// controles: cuántas cámaras y cómo colocarlas (en el editor completo y en el panel «Tu clip»)
function mcOptsHTML() {
  return `<div class="mc-opts"><span class="lbl">Cámaras</span><div class="seg mc-n">${[2, 3, 4, 5].map(n => `<button type="button" data-n="${n}">${n}</button>`).join('')}</div>
    <span class="lbl">Colocación</span><div class="seg mc-l"><button type="button" data-l="A" title="Lo que ven arriba y las cámaras debajo de 2 en 2">Abajo</button><button type="button" data-l="B" title="Lo que ven casi a pantalla completa y las cámaras en una tira abajo">Tira</button><button type="button" data-l="C" title="Las cámaras arriba y lo que ven debajo">Arriba</button></div>
    <button type="button" class="mc-find">🔍 Buscar las cámaras otra vez</button></div>`;
}
function mcOptsWire(box) {
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.n) mcSet(+b.dataset.n); else if (b.dataset.l) mcSetLay(b.dataset.l); else if (b.classList.contains('mc-find')) { camDetectedFor = null; mcDetect().then(() => pushHistory()); }
    mcOptsSync();
  });
}
function mcOptsSync() {
  for (const box of document.querySelectorAll('.mc-host')) {
    const on = multiOn(); box.hidden = !on; if (!on) continue;
    box.querySelectorAll('.mc-n button').forEach(b => b.classList.toggle('on', +b.dataset.n === (crops.n || 3)));
    box.querySelectorAll('.mc-l button').forEach(b => b.classList.toggle('on', b.dataset.l === mcLay()));
  }
}
setTimeout(() => {
  for (const id of ['mcOpts', 'seMc']) { const h = $(id); if (h) { h.innerHTML = mcOptsHTML(); mcOptsWire(h); } }
  setInterval(mcOptsSync, 500); mcOptsSync();
}, 0);

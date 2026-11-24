/* ---------- formato por escenas ----------
   1) una imagen por segundo para ver dónde cambia el plano, y luego se afina dónde está el corte exacto
   2) en cada escena se miran las caras y se decide el formato (sin IA de pago: todo en este ordenador) */
const SC_FMT = { podcast: ['🎙️', 'Primer plano'], duo: ['👥', 'Dos personas'], horizontal: ['🖥️', 'Horizontal'], reaccion: ['📺', 'Reacción'] };
async function scTempVideo() {
  const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
  await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = () => rej(new Error('vídeo')); });
  return tv;
}
async function scDetectCuts(tv, a, b, onMsg) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const cx = c.getContext('2d', { willReadFrequently: true });
  const sig = async t => { await tvSeek(tv, Math.max(0, Math.min((tv.duration || b) - 0.05, t))); cx.drawImage(tv, 0, 0, 64, 36); const d = cx.getImageData(0, 0, 64, 36).data, g = new Uint8Array(2304); for (let i = 0; i < 2304; i++) g[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10; return g; };
  const diff = (x, y) => { let q = 0; for (let i = 0; i < 2304; i++) q += Math.abs(x[i] - y[i]); return q / 2304 / 255; };
  const ts = []; for (let t = a; t < b - 0.3; t += 1) ts.push(t); ts.push(b - 0.05);
  const sg = [];
  for (let i = 0; i < ts.length; i++) { sg.push(await sig(ts[i])); if (onMsg) onMsg(`Mirando el clip… ${Math.round((i + 1) / ts.length * 100)} %`); }
  const d = []; for (let i = 1; i < sg.length; i++) d.push(diff(sg[i - 1], sg[i]));
  const med = [...d].sort((x, y) => x - y)[Math.floor(d.length / 2)] || 0, thr = Math.max(0.11, med * 2.6);
  const cuts = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i] < thr) continue;
    // afinar: se parte el segundo por la mitad hasta dar con el fotograma del cambio
    let lo = ts[i], hi = ts[i + 1], sLo = sg[i], sHi = sg[i + 1];
    for (let k = 0; k < 5 && hi - lo > 0.05; k++) { const m = (lo + hi) / 2, sm = await sig(m); if (diff(sLo, sm) > diff(sm, sHi)) { hi = m; sHi = sm; } else { lo = m; sLo = sm; } }
    cuts.push(hi);
  }
  // sin escenas de menos de 0,7 s
  const out = []; let last = a;
  for (const t of cuts) if (t - last >= 0.7 && b - t >= 0.7) { out.push(t); last = t; }
  return out;
}
// quién sale en la escena (caras que se repiten en las muestras)
async function scPeople(tv, s0, e0) {
  const len = e0 - s0, times = len < 1.4 ? [s0 + len / 2] : [s0 + len * 0.25, s0 + len * 0.75];
  const vw = tv.videoWidth || 1920, vh = tv.videoHeight || 1080, all = [];
  for (let i = 0; i < times.length; i++) {
    await tvSeek(tv, times[i]);
    const c = document.createElement('canvas'); c.width = 1280; c.height = Math.round(1280 * vh / vw); c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height);
    for (const f of await facesIn(c)) all.push({ ...f, i });
  }
  const groups = [];
  for (const f of all) {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    let g = groups.find(g => Math.hypot(g.cx - cx, (g.cy - cy) * vh / vw) < Math.max(g.w, f.w) * 1.2);
    if (!g) { g = { items: [], cx, cy, w: f.w, h: f.h }; groups.push(g); }
    g.items.push(f); const n = g.items.length;
    g.cx = g.items.reduce((q, x) => q + x.x + x.w / 2, 0) / n; g.cy = g.items.reduce((q, x) => q + x.y + x.h / 2, 0) / n;
    g.w = g.items.reduce((q, x) => q + x.w, 0) / n; g.h = g.items.reduce((q, x) => q + x.h, 0) / n;
  }
  return groups.map(g => ({ cx: +g.cx.toFixed(4), cy: +g.cy.toFixed(4), w: +g.w.toFixed(4), h: +g.h.toFixed(4), seen: new Set(g.items.map(x => x.i)).size }))
    .filter(g => g.seen >= Math.ceil(times.length / 2) && g.w > 0.03).sort((x, y) => y.w - x.w).slice(0, 3);
}
function scClassify(P) {
  if (P.length >= 2 && P[1].w >= P[0].w * 0.5) return 'duo';
  if (!P.length) return 'horizontal';
  const f = P[0];
  if (f.w >= 0.085) return 'podcast';
  // cara pequeña pegada a una esquina = cámara de streamer sobre el contenido
  return (f.cx < 0.3 || f.cx > 0.7) && (f.cy < 0.36 || f.cy > 0.64) ? 'reaccion' : 'horizontal';
}
// el encuadre de una escena para un formato dado
async function scBuildOv(tv, sc, fmt) {
  const vw = tv.videoWidth || 1920, vh = tv.videoHeight || 1080, P = sc.people || [];
  const R = +$('ratio').value / 100 || 0.5, aspTop = W / (H * R), aspBot = W / (H * (1 - R));
  const around = (g, asp, k) => {
    let hp = Math.min(vh, g.h * vh * k), wp = hp * asp;
    if (wp > vw * 0.62) { wp = vw * 0.62; hp = wp / asp; }
    let x = g.cx * vw - wp / 2, y = g.cy * vh - hp * 0.36;
    x = Math.max(0, Math.min(vw - wp, x)); y = Math.max(0, Math.min(vh - hp, y));
    return { x: x / vw, y: y / vh, w: wp / vw, h: hp / vh };
  };
  const halves = (side, asp) => { let hp = 1, wp = hp * asp * vh / vw; if (wp > 0.5) { wp = 0.5; hp = wp / asp * vw / vh; } return { x: side ? 1 - wp - (0.5 - wp) / 2 : (0.5 - wp) / 2, y: (1 - hp) / 2, w: wp, h: hp }; };
  if (fmt === 'horizontal') return { mode: 'single', s: { zoom: 1, offX: 0, offY: 0, bg: 'blur2' } };
  if (fmt === 'duo') {
    const two = [...P].slice(0, 2).sort((x, y) => x.cx - y.cx);
    const cr = two.length >= 2 ? { cam: around(two[0], aspTop, 6.5), content: around(two[1], aspBot, 6.5) } : { cam: halves(0, aspTop), content: halves(1, aspBot) };
    return { mode: 'react', s: { zoom: 1, offX: 0, offY: 0 }, crops: { ...cr, camFx: 0.5, fit: 'cover' } };
  }
  if (fmt === 'reaccion') {
    const f = [...P].sort((x, y) => x.w - y.w)[0];
    const cam = f ? around(f, aspTop, 4.2) : halves(0, aspTop);
    return { mode: 'react', s: { zoom: 1, offX: 0, offY: 0 }, crops: { cam, content: { x: 0, y: 0, w: 1, h: 1 }, camFx: 0.5, fit: 'cover' } };
  }
  // podcast: a pantalla completa siguiendo a la persona dentro de la escena
  const zoom = fillZoom() / 100, raw = [];
  try {
    const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * vh / vw); const cx = c.getContext('2d', { willReadFrequently: true });
    const opt = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 6 });
    const step = Math.max(0.4, (sc.e - sc.s) / 40); let prev = P[0] ? P[0].cx : null;
    for (let t = sc.s + 0.05; t < sc.e; t += step) {
      await tvSeek(tv, t); cx.drawImage(tv, 0, 0, c.width, c.height);
      const d = await faceapi.detectAllFaces(c, opt); let x = null;
      if (d.length) {
        const area = q => q.box.width * q.box.height, big = Math.max(...d.map(area));
        const cand = d.filter(q => area(q) >= big * 0.45).map(q => (q.box.x + q.box.width / 2) / c.width);
        x = prev == null ? cand[0] : cand.reduce((m, q) => Math.abs(q - prev) < Math.abs(m - prev) ? q : m); prev = x;
      }
      raw.push([t, x]);
    }
  } catch (e) { console.warn('escena', e); }
  const c0 = P[0] ? P[0].cx : 0.5;
  const p = (raw.length >= 2 && smoothTrack(raw, zoom)) || [[sc.s, c0], [sc.e, c0]];
  return { mode: 'single', s: { zoom, offX: 0, offY: 0 }, track: { on: true, r: [sc.s, sc.e], p } };
}
let scBusy = false;
async function scenesAuto(quiet) {
  if (!loaded || scBusy || layoutMode === 'split') return 0;
  const [a, b] = srcRange(); if (!(b - a >= 3)) { delete clipMeta.scenes; return 0; }
  scBusy = true; const T = 'Formato por escenas'; let tv = null;
  try {
    aiov('work', T, 'Buscando los cambios de plano…');
    tv = await scTempVideo();
    const cuts = await scDetectCuts(tv, a, b, m => aiov('work', T, m));
    if (!cuts.length || cuts.length > 14) {   // sin cambios de plano (o demasiados: un montaje rápido): un solo formato
      delete clipMeta.scenes; aiov('hide'); if (!quiet) toast(cuts.length ? 'Hay demasiados cambios de plano: se queda un solo formato' : 'El clip no cambia de plano: se queda un solo formato');
      return 0;
    }
    await loadFaceApi();
    const base = curFmtOf(), edges = [a, ...cuts, b], sc = [];
    for (let i = 0; i < edges.length - 1; i++) {
      aiov('work', T, `Mirando la escena ${i + 1} de ${edges.length - 1}…`);
      const x = { s: +edges[i].toFixed(3), e: +edges[i + 1].toFixed(3) };
      x.people = await scPeople(tv, x.s, x.e); x.f = scClassify(x.people);
      // igual que el formato del clip → usa el del clip (ya está ajustado); si no, su propio encuadre
      x.ov = x.f === base && x.f !== 'duo' ? null : await scBuildOv(tv, x, x.f);
      sc.push(x);
    }
    // juntar escenas seguidas que quedan iguales
    const out = [];
    for (const x of sc) { const pv = out[out.length - 1]; if (pv && pv.f === x.f && ((!pv.ov && !x.ov) || x.f === 'horizontal')) pv.e = x.e; else out.push(x); }
    if (out.length < 2 && !out[0].ov) { delete clipMeta.scenes; aiov('hide'); if (!quiet) toast('Todas las escenas van con el mismo formato'); return 0; }
    if (edges[0] > 0.01) out[0].s = 0;                                   // por si luego alargas el clip
    out[out.length - 1].e = Math.max(out[out.length - 1].e, (vid.duration || b) + 1);
    clipMeta.scenes = out; pushHistory(); scSig = '';
    aiov('hide');
    toast(`🎬 ${out.length} escenas: ` + out.map(x => SC_FMT[x.f][1]).join(' → '));
    return out.length;
  } catch (e) { console.warn('escenas', e); aiov('hide'); if (!quiet) toast('No se pudieron detectar las escenas' + (/descarg|fetch|load|import/i.test(e.message) ? ': hace falta internet la primera vez' : '')); return 0; }
  finally { scBusy = false; if (tv) { tv.removeAttribute('src'); tv.load(); } }
}
// cambiar a mano el formato de una escena ('base' = como el resto del clip)
async function scSetFmt(i, fmt) {
  const sc = clipMeta.scenes && clipMeta.scenes[i]; if (!sc) return;
  if (fmt === 'base') { sc.ov = null; sc.f = fixSceneBase(); }
  else {
    let tv = null;
    try { aiov('work', 'Cambiando la escena', SC_FMT[fmt][1] + '…'); tv = await scTempVideo(); if (fmt === 'podcast') await loadFaceApi(); sc.ov = await scBuildOv(tv, { ...sc, e: Math.min(sc.e, vid.duration || sc.e) }, fmt); sc.f = fmt; }
    catch (e) { console.warn(e); toast('No se pudo cambiar la escena'); }
    finally { aiov('hide'); if (tv) { tv.removeAttribute('src'); tv.load(); } }
  }
  pushHistory(); scSig = '';
}
const fixSceneBase = () => { const b = curFmtOf(); return SC_FMT[b] ? b : 'horizontal'; };
function scMenu(i, x, y) {
  const sc = clipMeta.scenes[i];
  const items = Object.entries(SC_FMT).map(([k, [ic, n]]) => ({ icon: ic, label: n, on: !!sc.ov && sc.f === k, act: () => scSetFmt(i, k) }));
  items.push({ icon: '↩️', label: 'Como el resto del clip', on: !sc.ov, act: () => scSetFmt(i, 'base') });
  ctxOpen(x, y, `Escena ${i + 1}: formato`, items);
}
// barra de escenas encima de la línea de tiempo
let scSig = '', scLast = 0;
function scTick() {
  const now = performance.now(); if (now - scLast < 300) return; scLast = now;
  const bar = $('scBar'); if (!bar) return;
  const sc = clipMeta.scenes, [a, b] = loaded ? srcRange() : [0, 0];
  const vis = sc && sc.length && layoutMode !== 'split' ? sc.map((x, i) => ({ i, f: x.f, ov: !!x.ov, s: Math.max(a, x.s), e: Math.min(b, x.e) })).filter(x => x.e - x.s > 0.05) : [];
  const ct = vid.currentTime || 0, cur = vis.findIndex(x => ct >= x.s - 1e-3 && ct < x.e);
  const sig = vis.map(x => [x.i, x.f, x.ov, x.s.toFixed(2), x.e.toFixed(2)].join()).join('|') + '#' + cur;
  if (sig === scSig) return; scSig = sig;
  bar.hidden = vis.length < 2 && !(vis[0] && vis[0].ov); bar.innerHTML = '';
  vis.forEach((x, k) => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.f = x.f; bt.style.flexGrow = Math.max(0.5, x.e - x.s).toFixed(2); if (k === cur) bt.className = 'on';
    bt.textContent = SC_FMT[x.f][0] + ' ' + SC_FMT[x.f][1]; bt.title = `Escena ${k + 1} · ${SC_FMT[x.f][1]} · clic para cambiar su formato`;
    bt.onclick = e => { e.stopPropagation(); seekSrc(x.s + 0.04); const r = bt.getBoundingClientRect(); setTimeout(() => scMenu(x.i, r.left, r.bottom + 6), 0); };
    bar.append(bt);
  });
}


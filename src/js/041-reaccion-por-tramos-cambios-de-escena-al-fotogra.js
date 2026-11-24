/* ---------- Reacción por tramos: cambios de escena al fotograma + Gemini decide el encuadre de cada tramo ---------- */
const KIND_TXT = { tiktok: 'TikTok / Reels / Shorts · vídeo vertical centrado', tweet: 'Tweet / post · zoom para que se lea', youtube: 'Vídeo de YouTube · recorte al reproductor',
                   web: 'Web / documento · zoom a lo principal', game: 'Juego / pantalla completa', other: 'Contenido' };
function openTv() {
  const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.playsInline = true; tv.src = vid.src;
  tv.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(tv);   // en la página, para que el navegador entregue los fotogramas al reproducir
  return new Promise((res, rej) => { tv.onloadeddata = () => res(tv); tv.onerror = () => { tv.remove(); rej(new Error('vídeo')); };
    setTimeout(() => { if (tv.readyState < 2) { tv.remove(); rej(new Error('el vídeo no se abrió a tiempo')); } }, 20000); });
}
function tvSeek(tv, t) {
  return new Promise(r => {
    let done = false; const fin = () => { if (!done) { done = true; r(); } };
    if ('requestVideoFrameCallback' in tv) tv.requestVideoFrameCallback(fin);
    tv.addEventListener('seeked', () => setTimeout(fin, 'requestVideoFrameCallback' in tv ? 80 : 0), { once: true });
    setTimeout(fin, 2500); tv.currentTime = t;
  });
}
const sigCv = document.createElement('canvas'); sigCv.width = 64; sigCv.height = 36;
const sigCtx = sigCv.getContext('2d', { willReadFrequently: true });
function frameSig(tv) {
  sigCtx.drawImage(tv, 0, 0, 64, 36);
  const d = sigCtx.getImageData(0, 0, 64, 36).data, g = new Float32Array(64 * 36);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  return g;
}
const sigDist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
function grabFrame(tv) { const c = document.createElement('canvas'); c.width = 1280; c.height = Math.round(1280 * tv.videoHeight / tv.videoWidth); c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height); return c; }
// busca los momentos en los que la imagen cambia de golpe y los ajusta al fotograma exacto
// parte del original que usa el clip (en clips sacados de un directo largo, solo ese trozo)
function srcRange() { const D = vid.duration || 0; return segs.length ? [Math.max(0, Math.min(...segs.map(g => g.s))), Math.min(D || 1e9, Math.max(...segs.map(g => g.e)))] : [0, D]; }
async function findCuts(tv, onProg) {
  const [T0, T1] = srcRange(), D = T1 - T0 || 1, step = Math.max(0.25, D / 240);
  let ts = [], sg = [];
  // pasada rápida: se reproduce a 8x sin sonido y se toma una muestra cada «step» segundos
  if ('requestVideoFrameCallback' in tv) {
    await tvSeek(tv, T0);
    let last = -1e9, ok = true;
    await new Promise(res => {
      const cb = (now, md) => {
        if (md.mediaTime - last >= step) { last = md.mediaTime; ts.push(md.mediaTime); sg.push(frameSig(tv)); onProg((md.mediaTime - T0) / D * 0.7); }
        if (md.mediaTime >= T1) { tv.pause(); res(); return; }
        if (!tv.ended && !tv.paused) tv.requestVideoFrameCallback(cb);
      };
      tv.requestVideoFrameCallback(cb);
      tv.onended = res; tv.playbackRate = 8;
      tv.play().catch(() => { ok = false; res(); });
      setTimeout(res, D / 8 * 1000 * 3 + 4000);   // por si el navegador no llega
    });
    tv.pause(); tv.playbackRate = 1; tv.onended = null;
    if (!ok || ts.length < Math.min(8, D / step * 0.5)) { ts = []; sg = []; }
  }
  if (!ts.length) {   // respaldo: saltando de punto en punto
    const n = Math.max(2, Math.floor(D / Math.max(0.5, step)));
    for (let i = 0; i < n; i++) { const t = Math.min(T1 - 0.02, T0 + 0.02 + i * Math.max(0.5, step)); await tvSeek(tv, t); ts.push(t); sg.push(frameSig(tv)); onProg(i / n * 0.7); }
  }
  const n = ts.length;
  const diff = sg.map((g, i) => i ? sigDist(g, sg[i - 1]) : 0);
  const sorted = diff.slice(1).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 0;
  const thr = Math.max(20, med * 3.5);
  let cand = [];
  for (let i = 1; i < n; i++) if (diff[i] > thr && !(diff[i - 1] > diff[i]) && !(diff[i + 1] > diff[i])) cand.push({ i, d: diff[i] });
  cand = cand.sort((a, b) => b.d - a.d).slice(0, 7).sort((a, b) => a.i - b.i);
  const fps = demuxFps || fpsEst || 30, cuts = [];
  for (let c = 0; c < cand.length; c++) {
    let a = ts[cand[c].i - 1], b = ts[cand[c].i], ga = sg[cand[c].i - 1], gb = sg[cand[c].i];
    while (b - a > 0.4 / fps) {   // búsqueda binaria hasta el fotograma
      const m = (a + b) / 2; await tvSeek(tv, m); const gm = frameSig(tv);
      if (sigDist(gm, ga) <= sigDist(gm, gb)) { a = m; ga = gm; } else { b = m; gb = gm; }
    }
    cuts.push(a + 1e-4);   // a = último instante con la imagen anterior
    onProg(0.7 + 0.3 * (c + 1) / cand.length);
  }
  return cuts.filter((t, i) => t > T0 + 0.3 && t < T1 - 0.3 && (!i || t - cuts[i - 1] > 0.8));
}
async function geminiAnalyze(imgs) {
  const key = getGemKey(); if (!key) throw new Error('NOKEY');
  const prompt = `You are given ${imgs.length} frame(s), in order, from one livestream recording. The layout may change between frames.
Streamers usually overlay their WEBCAM on top of the content they are watching or playing.
For EACH frame independently:
1) Find the streamer's webcam overlay: a rectangular (sometimes rounded) region showing the streamer, usually a person facing the camera in a room. Return its box tightly fitted to the INNER EDGES of the camera image. Do NOT include any decorative frame, border, glow, rounded outline, name tag or any pixel of the content outside the camera image; if unsure, err slightly inside. Do NOT confuse it with people inside the content (players, people in a video, thumbnails, avatars, emotes). Also return the streamer's face box.
2) Classify the MAIN content the streamer is showing/reacting to as one of:
 "tiktok" (a vertical short video: TikTok, Instagram Reels, YouTube Shorts),
 "tweet" (a tweet / X post / social media post or comment screenshot),
 "youtube" (a horizontal video player inside a page or window: YouTube, Twitch VOD, news video),
 "web" (a website, article, PDF, document, image, chat or anything mainly to read),
 "game" (a videogame, sports broadcast or any content filling the whole screen),
 "other".
3) content_box_2d: tight box around that main content item only (the vertical video itself, the tweet card, the video player without page UI, the main article/image). For "game" return the whole game area. Exclude the webcam.
4) The content will be shown in the bottom part of a vertical 9:16 short (an area about as wide as it is tall). Suggest how to frame it so it looks best and is easy to follow on a phone:
 "framing": "fill" (crop to fill the whole area; good for full-screen footage) or "whole" (show the whole item, with a blurred background around it; good for things to read),
 "zoom": a number from 1.0 to 1.6 (extra zoom on top of that; 1.0 = none).
Answer only JSON: {"frames":[{"found":true|false,"webcam_box_2d":[ymin,xmin,ymax,xmax],"face_box_2d":[ymin,xmin,ymax,xmax],"content_type":"tiktok|tweet|youtube|web|game|other","content_box_2d":[ymin,xmin,ymax,xmax],"framing":"fill|whole","zoom":1.0}]}
with exactly ${imgs.length} entries in the same order. Coordinates normalized to 0-1000. "found": false if there is no webcam in that frame.`;
  const o = await geminiJSON([...imgs.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: d } })), { text: prompt }], 0);
  return Array.isArray(o) ? o : Array.isArray(o.frames) ? o.frames : [o];
}
// llamada a Gemini que devuelve JSON (prueba los modelos del mejor al más común)
var tmGem = 0, tmWait = 0, tmWhisper = 0;   // tiempo gastado (ms): llamadas a Gemini, esperas por su límite, Whisper en el PC
async function geminiJSON(parts, temperature, opts = {}) {
  const t0 = performance.now(); try { return await geminiJSON0(parts, temperature, opts); } finally { tmGem += performance.now() - t0; }
}
async function geminiJSON0(parts, temperature, opts = {}) {
  const key = getGemKey(); if (!key) throw new Error('NOKEY');
  const body = { contents: [{ role: 'user', parts }], generationConfig: opts.search ? { temperature } : { responseMimeType: 'application/json', temperature } };
  if (opts.search) body.tools = [{ google_search: {} }];   // con búsqueda de Google el JSON va como texto
  let lastErr = null, quota = null;
  // primero el modelo que ya ha funcionado; los que no existen no se vuelven a probar
  const pool = opts.models || GEM_MODELS;
  let order = [...pool].filter(m => !gemDead.has(m)).sort((a, b) => opts.models ? 0 : (b === gemGood) - (a === gemGood));
  if (!order.length) order = [...pool];   // si todos constan como «no existe», se vuelven a probar (por si fue un fallo pasajero)
  const free = order.filter(m => !(gemCool.get(m) > Date.now())); if (free.length) order = free;   // los que acaban de dar límite, un rato después
  for (const m of order) {
    let r;
@@solo-pc
    try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }); }
@@fin
@@solo-web
    try { r = CORTEX_PROXY ? await fetch(`/api/gemini/${m}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }); }
@@fin
    catch (e) { throw new Error('NET'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) { gemDead.add(m); if (!lastErr || lastErr.dead) { lastErr = new Error('modelo no disponible: ' + m); lastErr.dead = true; } continue; }
    if (!r.ok) {
      const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (/api key|API_KEY|permission|unauthenticated/i.test(msg) || r.status === 400 && /key/i.test(msg) || r.status === 401 || r.status === 403) throw new Error('BADKEY');
      if (r.status === 429) {   // límite de ese modelo: se prueba el siguiente antes de esperar
        const ri = ((j.error && j.error.details) || []).find(d => d && d.retryDelay);
        quota = { m, msg, delay: ri ? parseFloat(ri.retryDelay) : null, daily: /per.?day|PerDay|daily|diari/i.test(msg) || ((j.error && j.error.details) || []).some(d => JSON.stringify(d).match(/PerDay/)) };
        gemCool.set(m, Date.now() + (quota.daily ? 3600e3 : Math.max(30, quota.delay || 60) * 1000));
        console.warn('Gemini 429', m, msg); continue;
      }
      if (r.status === 400 && /not (found|supported)|unknown model|is not available/i.test(msg)) { gemDead.add(m); if (!lastErr || lastErr.dead) { lastErr = new Error(msg); lastErr.dead = true; } continue; }
      console.warn('Gemini', m, r.status, msg); lastErr = new Error(msg); lastErr.status = r.status; continue;
    }
    if (!opts.models) gemGood = m;
    const cand = (j.candidates || [])[0];
    const txt = ((cand && cand.content && cand.content.parts) || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    if (!txt) { lastErr = new Error('respuesta vacía (' + ((j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || '¿?') + ', ' + m + ')'); console.warn('Gemini', m, j); continue; }
    const clean = txt.replace(/```json|```/g, '').trim();
    try { return JSON.parse(clean); }
    catch {   // a veces añade texto alrededor: se coge el primer bloque JSON
      const a = clean.search(/[\[{]/), b = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
      if (a >= 0 && b > a) { try { return JSON.parse(clean.slice(a, b + 1)); } catch {} }
      lastErr = new Error('respuesta no válida de ' + m + ': ' + clean.slice(0, 80)); console.warn('Gemini', m, txt); continue;
    }
  }
  if (quota) { const e = new Error('QUOTA'); e.detail = quota.msg; e.delay = quota.delay; e.daily = quota.daily; throw e; }
  if (lastErr && lastErr.dead) lastErr = new Error('Ninguno de los modelos de Gemini está disponible para tu clave (' + order.join(', ') + ')');
  throw lastErr || new Error('Gemini no respondió');
}
// modelos que no existen (o que el servidor no deja usar): se recuerdan 7 días para no volver a probarlos en cada petición
const GEM_DEAD_KEY = 'cortex-gemDead';
const gemDead = (() => {
  let mem = {}; try { mem = JSON.parse(localStorage.getItem(GEM_DEAD_KEY) || '{}') || {}; } catch {}
  const now = Date.now(); for (const k of Object.keys(mem)) if (!(mem[k] > now)) delete mem[k];
  const s = new Set(Object.keys(mem)), add = s.add.bind(s);
  s.add = m => { add(m); mem[m] = Date.now() + 7 * 864e5; try { localStorage.setItem(GEM_DEAD_KEY, JSON.stringify(mem)); } catch {} return s; };
  return s;
})();
let gemGood = null; const gemCool = new Map();
const box2 = b => { if (!Array.isArray(b) || b.length < 4) return null; const [y0, x0, y1, x1] = b.map(v => Math.min(1000, Math.max(0, +v)) / 1000); return x1 - x0 > 0.03 && y1 - y0 > 0.03 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; };
const iouR = (a, b) => { if (!a || !b) return a === b ? 1 : 0; const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), i = ix * iy; return i / (a.w * a.h + b.w * b.h - i); };
// encuadre de abajo según lo que se está viendo
function contentFor(kind, box, camRaw, r) {
  r = r || {};
  const inset = b => ({ x: b.x + b.w * 0.005, y: b.y + b.h * 0.005, w: b.w * 0.99, h: b.h * 0.99 });
  const around = () => camRaw ? contentAround(camRaw) : { x: 0, y: 0, w: 1, h: 1 };
  const zk = Math.min(1.6, Math.max(1, +r.zoom || 1));
  // a pantalla completa (juego, vídeo o web que llena la pantalla): ocupa toda la parte de abajo
  if (!box || kind === 'game' || box.w * box.h > 0.62) return { content: around(), fit: 'cover', zk: 1 };
  // TikTok / Reels / Shorts: el vídeo vertical centrado y casi entero, con un ligero zoom
  if (kind === 'tiktok') return { content: inset(box), fit: 'contain', zk: 1.12 };
  // tweet: entero y grande para que se lea
  if (kind === 'tweet') return { content: inset(box), fit: 'contain', zk: 1 };
  // lo demás: lo que proponga Gemini
  return { content: inset(box), fit: r.framing === 'fill' ? 'cover' : 'contain', zk };
}
async function geminiZones(st) {
  aiov('work', 'Analizando el clip con Gemini', 'Buscando cambios de escena…');
  const tv = await openTv();
  const D = tv.duration || vid.duration;
  const cuts = await findCuts(tv, p => aiov('work', 'Analizando el clip con Gemini', `Buscando cambios de escena… ${Math.round(p * 100)}%`));
  const [R0, R1] = srcRange();
  let parts = [R0, ...cuts, R1].map((t, i, a) => i < a.length - 1 ? { s: t, e: a[i + 1] } : null).filter(Boolean);
  // un fotograma de cada tramo para Gemini (si solo hay uno, dos fotogramas para ir sobre seguro)
  aiov('work', 'Analizando el clip con Gemini', parts.length > 1 ? `${parts.length} tramos: la IA está mirando qué hay en cada uno…` : 'La IA está localizando la cámara y lo que está viendo el streamer…');
  const shots = [], edgeFrames = [];
  for (const pt of parts) {
    const len = pt.e - pt.s, fr = [];
    for (const f of [0.3, 0.7]) { await tvSeek(tv, pt.s + len * f); fr.push(grabFrame(tv)); }
    edgeFrames.push(fr);
    if (parts.length === 1) shots.push(...fr); else shots.push(fr[0]);
  }
  tv.removeAttribute('src'); tv.load(); tv.remove();
  const res = await geminiAnalyze(shots.map(c => c.toDataURL('image/jpeg', 0.85).split(',')[1]));
  const per = parts.length === 1 ? [res.find(r => r && r.found) || res[0]] : parts.map((_, i) => res[i] || {});
  aiov('work', 'Analizando el clip con Gemini', 'Ajustando los bordes al píxel…');
  await sleep(20);
  // tramos con el mismo diseño se juntan
  const items = per.map((r, i) => ({ ...parts[i], r: r || {}, cam: r && r.found ? box2(r.webcam_box_2d) : null, face: box2(r && r.face_box_2d), cbox: box2(r && r.content_box_2d), kind: (r && r.content_type) || 'game', frames: edgeFrames[i] }));
  const merged = [];
  for (const it of items) {
    const p = merged[merged.length - 1];
    if (p && p.kind === it.kind && iouR(p.cam, it.cam) > 0.8 && (iouR(p.cbox, it.cbox) > 0.75 || p.kind === 'game')) { p.e = it.e; p.frames.push(...it.frames); }
    else merged.push({ ...it, frames: [...it.frames] });
  }
  if (!merged.some(m => m.cam)) return null;
  let lastCam = null;
  const zs = merged.map(m => {
    let camRaw = m.cam ? snapToEdges(m.cam, persistentEdges(m.frames)) : lastCam;
    if (!camRaw) camRaw = merged.find(x => x.cam).cam;
    lastCam = camRaw;
    let face = m.face && m.face.w > 0 ? m.face : null;
    if (!face || !(face.x + face.w / 2 > camRaw.x && face.x + face.w / 2 < camRaw.x + camRaw.w)) face = { x: camRaw.x + camRaw.w * 0.4, y: camRaw.y + camRaw.h * 0.25, w: camRaw.w * 0.2, h: camRaw.h * 0.3 };
    const c = computeCam(camRaw, face), ct = contentFor(m.kind, m.cbox, camRaw, m.r);
    return { s: m.s, e: m.e, cr: { cam: c.cam, camFx: c.camFx, content: ct.content, fit: ct.fit, zk: ct.zk, kind: m.kind }, wide: c.wide };
  });
  zs[0].s = 0; zs[zs.length - 1].e = D;
  setRange('offX', 0); setRange('offY', 0); setRange('zoom', 100);
  if (zs.length === 1) { zones = []; Object.assign(crops, JSON.parse(JSON.stringify(zs[0].cr))); }
  else { zones = zs.map(z => ({ s: z.s, e: z.e, cr: z.cr })); Object.assign(crops, JSON.parse(JSON.stringify(zs[0].cr))); }
  camDetectedFor = file;
  const first = zs[0].cr.kind;
  const msg = zs.length > 1 ? `${zs.length} tramos con encuadres distintos · el encuadre cambia solo en el fotograma exacto. Verás las marcas en el clip de la línea de tiempo.`
    : `Detectado: ${KIND_TXT[first] || first}. Si no es exacto, doble clic arriba o abajo para ajustarlo.`;
  setStatus(st, '(Gemini) ' + msg, 'ok');
  pushHistory(); tlSig = '';
  aiovDone(true, zs.length > 1 ? `${zs.length} tramos detectados` : 'Detectado: ' + (KIND_TXT[first] || first).split(' · ')[0], zs.length > 1 ? 'Cada tramo tiene su propio encuadre' : (KIND_TXT[first] || '').split(' · ')[1] || 'Cámara arriba, contenido abajo');
  return true;
}


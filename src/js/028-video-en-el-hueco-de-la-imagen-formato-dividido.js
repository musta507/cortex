/* ---------- vídeo en el hueco de la imagen (formato dividido con dos vídeos) ----------
   Va en bucle y sin sonido, sincronizado con el clip. Para exportar se lee fotograma a fotograma con su propio lector. */
const rxVid = document.createElement('video'); rxVid.muted = true; rxVid.loop = true; rxVid.playsInline = true; rxVid.preload = 'auto';
Object.defineProperty(rxVid, 'naturalWidth', { get: () => rxVid.videoWidth }); Object.defineProperty(rxVid, 'naturalHeight', { get: () => rxVid.videoHeight });
let rxBlob = null, rxFile = null, rxFrame = null, rxUrl = '';
function rxClear() { rxBlob = null; rxFile = null; rxFrame = null; try { rxVid.pause(); rxVid.removeAttribute('src'); rxVid.load(); } catch {} if (rxUrl) { URL.revokeObjectURL(rxUrl); rxUrl = ''; } }
function loadRxBlob(blob, name, keepCrop) {
  return new Promise(res => {
    if (img === rxVid) img = null; rxClear();
    let done = false; const end = ok => { if (done) return; done = true; clearTimeout(t); rxVid.onloadeddata = rxVid.onerror = null;
      if (!ok) { rxClear(); $('imgTitle').textContent = 'Ese vídeo no se puede abrir'; return res(false); }
      rxBlob = blob; img = rxVid; if (!keepCrop) { crop = null; imgOff.x = imgOff.y = 0; setRange('imgZoom', 100); }
      $('imgTitle').textContent = (name || 'vídeo') + ` (vídeo ${rxVid.videoWidth}×${rxVid.videoHeight})`;
      ['cropBtn', 'cropReset', 'imgCenter'].forEach(id => $(id).disabled = false);
      $('s7').classList.toggle('done', layoutMode === 'split'); res(true); };
    const t = setTimeout(() => end(false), 12000);
    rxVid.onloadeddata = () => end(rxVid.videoWidth > 0); rxVid.onerror = () => end(false);
    rxUrl = URL.createObjectURL(blob); rxVid.src = rxUrl;
  });
}
function rxSync() {   // en la vista previa: el vídeo de abajo sigue al clip (y vuelve a empezar si es más corto)
  if (img !== rxVid || exporting || !rxVid.duration) return;
  const D = rxVid.duration, want = curT() % D;
  if (vid.paused) { if (!rxVid.paused) rxVid.pause(); if (Math.abs(rxVid.currentTime - want) > 0.04 && !rxVid.seeking) rxVid.currentTime = want; }
  else { if (rxVid.playbackRate !== vid.playbackRate) rxVid.playbackRate = vid.playbackRate; if (rxVid.paused) rxVid.play().catch(() => {});
    let d = rxVid.currentTime - want; if (Math.abs(d) > D / 2) d -= Math.sign(d) * D; if (Math.abs(d) > 0.3 && !rxVid.seeking) rxVid.currentTime = want; }
}
const rxSeekTo = async T => { if (img !== rxVid || !rxVid.duration) return; const w = T % rxVid.duration; if (Math.abs(rxVid.currentTime - w) > 0.02) { rxVid.currentTime = w; await Promise.race([new Promise(r => rxVid.addEventListener('seeked', r, { once: true })), sleep(250)]); } };
async function rxOpen() {   // lector del segundo vídeo para exportar rápido; si no se puede, se va saltando por el vídeo (más lento)
  if (img !== rxVid || !rxBlob) return null;
  rxVid.pause();
  const slow = { get: async T => { await rxSeekTo(T); return null; }, close() {} };
  let dec = null; const q = []; let cur = null, shut = false;
  try {
    const f = rxFile || (rxFile = rxBlob instanceof File ? rxBlob : new File([rxBlob], 'segundo.mp4', { type: rxBlob.type }));
    const M = await expWait(movieIndex(f), 30000, 'leer el segundo vídeo'), S = M.vs;
    if (!S.length || !M.vcfg || f.size > 400e6 || !(await VideoDecoder.isConfigSupported(M.vcfg)).supported) return slow;
    const data = await loadSampleData(f, S), t0 = Math.min(...S.slice(0, 90).map(s => s.cts / s.timescale));
    const D = Math.max(...S.slice(-90).map(s => (s.cts + s.duration) / s.timescale)) - t0;
    let err = null, i = 0, loopN = 0, flushing = false, poke = () => {};
    dec = new VideoDecoder({ output: fr => { if (shut) { try { fr.close(); } catch {} return; } q.push(fr); poke(); }, error: e => { err = e; poke(); } });
    dec.configure(M.vcfg);
    const feed = () => {
      while (!flushing && dec.decodeQueueSize < 10 && q.length < 10) {
        if (i >= S.length) { flushing = true; dec.flush().then(() => { i = 0; loopN++; flushing = false; poke(); }, e => { err = e; poke(); }); break; }   // se acabó: vuelve a empezar
        const s = S[i]; dec.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round((s.cts / s.timescale - t0 + loopN * D) * 1e6), duration: Math.round(s.duration * 1e6 / s.timescale), data: data[i] })); i++;
      }
    };
    return {
      async get(T) {
        const w0 = performance.now();
        for (;;) {
          if (err) throw err;
          while (q.length && q[0].timestamp / 1e6 <= T + 1e-3) { if (cur) cur.close(); cur = q.shift(); }
          if (cur && q.length) return cur;   // ya hay uno posterior: «cur» es el que toca
          feed();
          if (performance.now() - w0 > 8000) throw expStall('leer el segundo vídeo');
          await new Promise(r => { poke = r; setTimeout(r, 4); });
        }
      },
      close() { shut = true; try { if (cur) cur.close(); } catch {} for (const fr of q) { try { fr.close(); } catch {} } q.length = 0; expShut(dec); }
    };
  } catch (e) { console.warn('segundo vídeo: uso el modo lento', e); shut = true; for (const fr of q) { try { fr.close(); } catch {} } expShut(dec); return slow; }
}
async function loadImageBlob(blob, name, keepCrop) {
  if (blob && /^video\//.test(blob.type || '')) return loadRxBlob(blob, name, keepCrop);
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      rxClear(); img = im; if (!keepCrop) { crop = null; imgOff.x = imgOff.y = 0; setRange('imgZoom', 100); }
      $('imgTitle').textContent = (name || 'imagen') + ` (${im.naturalWidth}×${im.naturalHeight})`;
      ['cropBtn', 'cropReset', 'imgCenter'].forEach(id => $(id).disabled = false);
      $('s7').classList.toggle('done', layoutMode === 'split');
      res(true);
    };
    im.onerror = () => { $('imgTitle').textContent = 'Ese archivo no es una imagen válida'; res(false); };
    im.src = URL.createObjectURL(blob);
  });
}
async function checkResume() {
  let saved = null, clip = null;
  try { saved = await kv.get('project'); clip = await kv.get('clip'); } catch { return; }
  if (!saved || !saved.snap) return;
  const p = JSON.parse(saved.snap);
  if (!p.clipName && !(p.captions || []).length) return;
  const when = new Date(saved.time).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  $('resumeText').textContent = clip
    ? `Tienes «${p.clipName}» a medias (${when}).`
    : `Tienes ajustes y subtítulos de «${p.clipName || 'un clip'}» (${when}). El clip pesaba demasiado para guardarlo: al recuperar, vuelve a subirlo.`;
  $('resume').hidden = false;
  $('resumeYes').onclick = async () => {
    $('resume').hidden = true;
    try {
      if (clip) await loadFile(clip, true);
      const im = await kv.get('image').catch(() => null);
      if (im) await loadImageBlob(im, im.name, true);
      await applyProject(p);
      if (!clip) restoredClipName = p.clipName;
      hist = [saved.snap]; hi = 0; updUndo();
    } catch (e) { console.error(e); }
  };
  $('resumeNo').onclick = async () => {
    $('resume').hidden = true;
    try { await kv.del('project'); await kv.del('clip'); await kv.del('image'); } catch {}
  };
}


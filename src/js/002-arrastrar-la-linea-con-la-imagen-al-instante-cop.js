/* ---------- arrastrar la línea con la imagen al instante: copia ligera del clip en la que cada fotograma se puede mostrar sin esperar ----------
   El vídeo de verdad tarda en saltar (tiene que leer desde el último fotograma completo). Mientras salta, se enseña el fotograma exacto
   de esta copia (más pequeña) y en cuanto el vídeo de verdad llega, se ve a calidad completa. */
var PX = { file: null, ready: false, busy: false, v: null, c: null, url: null, off: 0, want: null, req: null, pend: null };
function pxWantOut(T) { try { PX.want = segs.length ? locate(Math.max(0, Math.min(totalDur() - 0.0005, T))).t : T; } catch { PX.want = null; } }
function pxSeek(p) {
  const v = PX.v; if (!v) return;
  if (PX.req != null && Math.abs(p - PX.req) < 1e-4) return;
  if (v.seeking) { PX.pend = p; return; }
  PX.req = p; v.currentTime = p;
}
// lienzo del tamaño del vídeo con el fotograma de la copia ligera para el segundo t del original (o null si aún no está)
function pxFrame(t) {
  if (!PX.ready || PX.file !== file || !PX.v || PX.v.readyState < 2) return null;
  const p = Math.max(0, Math.min((PX.v.duration || 0) - 0.001, t - PX.off - 0.45 / (PX.fps || 30)));   // la copia cambia de fotograma medio fotograma antes: se compensa
  pxSeek(p);
  const w = vid.videoWidth || 1920, h = vid.videoHeight || 1080, c = PX.c;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  c.getContext('2d').drawImage(PX.v, 0, 0, w, h);
  return c;
}
async function pxBuild() {
  const f = file;
  if (!f || PX.busy || exporting || (PX.file === f && PX.ready)) return;
  if (!('VideoEncoder' in window) || !('VideoDecoder' in window) || typeof OffscreenCanvas === 'undefined') return;
  if (!(vid.duration > 0) || vid.duration > 1200 || !vid.videoWidth) return;   // directos de horas: no
  PX.busy = true;
  let dec = null, enc = null;
  const stop = () => { if (file !== f || exporting) throw new Error('px: cancelado'); };
  try {
    const M = await movieIndex(f), samples = M.vs, config = M.vcfg; stop();
    if (!samples.length || !config || !(await VideoDecoder.isConfigSupported(config)).supported) throw new Error('px: códec');
    const vw = vid.videoWidth, vh = vid.videoHeight, pw = Math.min(640, vw) & ~1, ph = Math.max(2, Math.round(pw * vh / vw / 2) * 2);
    const fps = Math.max(1, Math.min(60, Math.round(samples.length / vid.duration)));
    let ecfg = null;
    for (const codec of ['avc1.42001f', 'avc1.4d001f', 'avc1.640028']) {
      const c = { codec, width: pw, height: ph, bitrate: 5e6, framerate: fps, avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) { ecfg = c; break; } } catch {}
    }
    if (!ecfg) throw new Error('px: sin codificador');
    await loadScript(MUXER_URL, 'Mp4Muxer'); stop();
    const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: pw, height: ph, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let err = null, first = null, lastT = -1;
    const oc = new OffscreenCanvas(pw, ph), ox = oc.getContext('2d');
    const firstTs = Math.min(...samples.slice(0, 64).map(s => s.cts)) / samples[0].timescale;
    enc = new VideoEncoder({ output: (c, m) => { try { muxer.addVideoChunk(c, m); } catch (e) { err = e; } }, error: e => err = e });
    enc.configure(ecfg);
    dec = new VideoDecoder({ output: fr => {
      try {
        const t = fr.timestamp / 1e6 - firstTs;
        if (t > lastT + 1e-4 && !err) {
          lastT = t; if (first == null) first = t;
          ox.drawImage(fr, 0, 0, pw, ph);
          const vf = new VideoFrame(oc, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / fps) });
          enc.encode(vf, { keyFrame: true }); vf.close();   // todos los fotogramas completos: saltar a cualquiera es instantáneo
        }
      } catch (e) { err = e; }
      fr.close();
    }, error: e => err = e });
    dec.configure(config);
    for (let i = 0; i < samples.length;) {
      const j = Math.min(samples.length, i + 120), part = samples.slice(i, j), data = await loadSampleData(f, part); stop();
      for (let k = 0; k < part.length; k++) {
        const s = part[k];
        dec.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round(s.cts * 1e6 / s.timescale), duration: Math.round(s.duration * 1e6 / s.timescale), data: data[k] }));
        while (dec.decodeQueueSize > 12 || enc.encodeQueueSize > 12) { await tick(); if (err) throw err; }
      }
      if (err) throw err; await tick(); stop(); i = j;
    }
    await dec.flush(); await enc.flush(); if (err) throw err; stop();
    muxer.finalize();
    const url = URL.createObjectURL(new Blob([muxer.target.buffer], { type: 'video/mp4' }));
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
    await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error('px: no se abre')); setTimeout(() => ko(new Error('px: tarda')), 15000); });
    stop();
    // control: si la copia sale en negro (pasa con algunas tarjetas gráficas), no se usa y el arrastre sigue como antes
    const probe = document.createElement('canvas'); probe.width = 16; probe.height = 9; const pz = probe.getContext('2d', { willReadFrequently: true });
    let lit = 0;
    for (const q of [0.2, 0.5, 0.8]) {
      v.currentTime = Math.max(0, (v.duration || 1) * q);
      await new Promise(r => { const tt = setTimeout(r, 3000); v.addEventListener('seeked', () => { clearTimeout(tt); setTimeout(r, 30); }, { once: true }); });
      try { pz.drawImage(v, 0, 0, 16, 9); const d = pz.getImageData(0, 0, 16, 9).data; let m = 0; for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i], d[i + 1], d[i + 2]); if (m > 24) lit++; } catch {}
    }
    if (!lit) throw new Error('px: la copia sale en negro');
    stop();
    v.addEventListener('seeked', () => { if (PX.pend != null) { const p = PX.pend; PX.pend = null; if (Math.abs(p - (PX.req ?? -1)) > 1e-4) { PX.req = p; v.currentTime = p; } } });
    if (PX.url) { try { URL.revokeObjectURL(PX.url); } catch {} }
    if (PX.v) { try { PX.v.removeAttribute('src'); PX.v.load(); } catch {} }
    Object.assign(PX, { file: f, ready: true, v, url, fps, c: PX.c || document.createElement('canvas'), off: first || 0, req: null, pend: null });
  } catch (e) { if (!/cancelado/.test(String(e && e.message))) console.warn('vista previa rápida:', e); }
  finally {
    PX.busy = false;
    try { if (dec && dec.state !== 'closed') dec.close(); } catch {} try { if (enc && enc.state !== 'closed') enc.close(); } catch {}
  }
}
// la copia ligera se prepara cuando el clip ya está montado (no mientras se guardan el clip o los subtítulos: los frenaría)
let pxWaitT = null;
vid.addEventListener('loadeddata', () => {
  if (PX.file !== file) PX.ready = false;
  clearInterval(pxWaitT); let n = 0;
  pxWaitT = setInterval(() => {
    if (++n > 150 || PX.ready || PX.busy) { if (n > 150 || PX.ready) clearInterval(pxWaitT); return; }
    let busy = false; try { busy = !!stPend || exporting || /⏳|✨ Montando|💬 Escribiendo/.test(($('seS') && $('seS').textContent) || ''); } catch {}
    if (!busy) { clearInterval(pxWaitT); pxBuild(); }
  }, 2000);
});
// en qué momentos del vídeo final aparece un segundo del original (puede repetirse si duplicas trozos)
function srcToOutAll(t) { const r = []; let acc = 0; for (const g of segs) { if (t >= g.s && t <= g.e) r.push(acc + t - g.s); acc += g.e - g.s; } return r; }
// reproducción saltando de un trozo al siguiente
let playEnd = false;
function advancePlayback(mediaT) {
  if (!segs.length || exporting) return;
  const g = segs[pseg]; if (!g) { pseg = 0; return; }
  if (vid.paused && !vid.ended) return;
  const ct = mediaT != null ? mediaT : vid.currentTime;
  if (ct >= g.e - 0.5 / srcFpsV() || vid.ended) {
    if (pseg + 1 < segs.length) {
      const n = segs[++pseg];
      if (Math.abs(n.s - ct) > 1 / srcFpsV()) vid.currentTime = n.s;
      if (vid.paused) vid.play().catch(() => {});
    } else { vid.pause(); vid.currentTime = Math.max(g.s, g.e - 0.0005); playEnd = true; }
  }
}
if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
  let lastMT = null;
  const onVF = (now, md) => {
    if (lastMT != null && !vid.paused) { const d = md.mediaTime - lastMT; if (d > 0.007 && d < 0.1) fpsEst = Math.max(fpsEst, Math.round(1 / d)); }
    lastMT = md.mediaTime; advancePlayback(md.mediaTime); vid.requestVideoFrameCallback(onVF);
  };
  vid.requestVideoFrameCallback(onVF);
}
// encuadre de Reacción activo en un segundo del original
function zoneAt(t) {
  if (!zones.length) return null;
  return zones.find(z => t >= z.s && t < z.e) || (t < zones[0].s ? zones[0] : zones[zones.length - 1]);
}
function cropsAt(t) { if (sceneOv && sceneOv.crops) return sceneOv.crops; const z = zoneAt(t); return z ? z.cr : crops; }
function activeCrops() { return cropsAt(vid.currentTime || 0); }
let toastT = null;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 1600); }


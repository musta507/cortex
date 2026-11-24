/* ---------- elegir el compresor de vídeo más rápido que funcione DE VERDAD en este ordenador ----------
   Antes se elegía por lo que el navegador decía soportar; si la tarjeta gráfica luego se atascaba, cada exportación pagaba la espera
   y acababa en un método lento. Ahora cada compresor se prueba una vez (menos de un segundo), se mide su velocidad y se recuerda:
   se usa el más rápido que funciona, y el que falle una vez no se vuelve a intentar en dos semanas. */
const ENC_KEY = 'cortex-encProbe1';
const encMem = () => { try { return JSON.parse(localStorage.getItem(ENC_KEY) || '{}'); } catch { return {}; } };
const encKey = cfg => [cfg.codec, cfg.hardwareAcceleration || 'auto', cfg.width + 'x' + cfg.height, window.cortexApp ? 'app' : 'web'].join('|');
function encNote(cfg, v) { try { const m = encMem(); m[encKey(cfg)] = { ...v, at: Date.now() }; localStorage.setItem(ENC_KEY, JSON.stringify(m)); } catch {} }
const encErr = e => { try { e.enc = true; } catch {} return e; };
async function encProbe(cfg) {
  let ve = null;
  try {
    const c = new OffscreenCanvas(cfg.width, cfg.height), x = c.getContext('2d'); let n = 0, desc = false, err = null;
    ve = new VideoEncoder({ output: (ch, meta) => { n++; if (meta && meta.decoderConfig && meta.decoderConfig.description) desc = true; }, error: e => err = e });
    ve.configure(cfg); const N = 40; let tA = 0;
    for (let i = 0; i < N; i++) {
      x.fillStyle = `hsl(${i * 23} 55% ${30 + i % 5 * 6}%)`; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff'; x.fillRect((i * 37) % (c.width - 320), (i * 53) % (c.height - 320), 320, 320); x.fillStyle = '#000'; x.font = '700 90px sans-serif'; x.fillText('prueba ' + i, 60, 200 + i * 30);
      if (i === 10) tA = performance.now();   // los primeros fotogramas son el arranque: no cuentan para la velocidad
      const f = new VideoFrame(c, { timestamp: i * 33333, duration: 33333 }); ve.encode(f, { keyFrame: i === 0 }); f.close();
      const w0 = performance.now(); while (ve.state === 'configured' && ve.encodeQueueSize > 3) { await sleep(1); if (performance.now() - w0 > 3500) throw new Error('se queda parado'); }
      if (err) throw err;
    }
    await expWait(ve.flush(), 4000, 'probar el compresor'); if (err) throw err;
    if (n < N - 2 || !desc) throw new Error('salida incompleta');
    return { ok: true, fps: Math.max(1, Math.round((N - 10) / ((performance.now() - tA) / 1000))) };
  } catch (e) { return { ok: false, why: String(e && e.message || e).slice(0, 90) }; }
  finally { expShut(ve); }
}
let expLastVenc = null;
async function pickVideoEncoder(fps, bitrate) {
  const mk = (codec, hw, br) => { const c = { codec, width: W, height: H, framerate: fps, bitrate: br, bitrateMode: 'variable', latencyMode: 'quality' }; if (hw) c.hardwareAcceleration = 'prefer-hardware'; if (/^h[ve][cv]1/.test(codec)) c.hevc = { format: 'hevc' }; else c.avc = { format: 'avc' }; return c; };
  const groups = [];
  // en la aplicación: HEVC con la tarjeta gráfica, como CapCut (mejor imagen con menos peso)
  if (!encNoHw && window.cortexApp && window.cortexApp.isApp) groups.push(['hevc', ['hvc1.1.6.L123.B0', 'hev1.1.6.L123.B0'].map(c => mk(c, true, Math.round(bitrate * 0.75)))]);
  if (!encNoHw) groups.push(['avc', ['avc1.640033', 'avc1.4d0033', 'avc1.640028', 'avc1.42e033'].map(c => mk(c, true, bitrate))]);
  groups.push(['sw', ['avc1.640033', 'avc1.42e033'].map(c => mk(c, false, bitrate))]);   // el compresor del navegador (modo calidad: el «realtime» se ve borroso)
  const mem = encMem(), found = [];
  for (const [kind, list] of groups) for (const cfg of list) {
    try { if (!(await VideoEncoder.isConfigSupported(cfg)).supported) continue; } catch { continue; }
    let r = mem[encKey(cfg)]; if (r && Date.now() - r.at > 14 * 864e5) r = null;
    if (!r) { r = await encProbe(cfg); encNote(cfg, r); }
    if (r.ok) { found.push({ cfg, kind, fps: r.fps || 1 }); break; }   // el primero que funciona de cada tipo
  }
  if (found.length) {
    const sw = found.find(f => f.kind === 'sw'), hv = found.find(f => f.kind === 'hevc'), av = found.find(f => f.kind === 'avc');
    let pick = hv && av ? (hv.fps >= av.fps * 0.75 ? hv : av) : (hv || av);
    if (!pick || (sw && pick.fps < sw.fps * 0.75)) pick = sw || pick;   // una tarjeta gráfica más lenta que el procesador no compensa
    return { cfg: pick.cfg, mux: pick.kind === 'hevc' ? 'hevc' : 'avc', q: null, hw: pick.kind !== 'sw', probe: pick.fps };
  }
  const hi = bitrate >= 40e6;
  const cands = [
    { codec: 'avc1.640033', mux: 'avc', q: hi ? 17 : 21 }, { codec: 'avc1.4d0033', mux: 'avc', q: hi ? 17 : 21 }, { codec: 'avc1.42e033', mux: 'avc', q: hi ? 17 : 21 },
    { codec: 'vp09.00.41.08', mux: 'vp9', q: hi ? 18 : 26 },
  ];
  for (const mode of ['quantizer', 'variable']) for (const c of cands) {
    const cfg = { codec: c.codec, width: W, height: H, framerate: fps, bitrateMode: mode, latencyMode: 'quality' };
    if (mode !== 'quantizer') cfg.bitrate = bitrate;
    if (c.mux === 'avc') cfg.avc = { format: 'avc' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { cfg, mux: c.mux, q: mode === 'quantizer' ? c.q : null }; } catch {}
  }
  return null;
}
const encOpts = (venc, key) => venc.q == null ? { keyFrame: key } : venc.mux === 'avc' ? { keyFrame: key, avc: { quantizer: venc.q } } : { keyFrame: key, vp9: { quantizer: venc.q } };
async function pickAudioEncoder() {
  // AAC primero (TikTok no siempre acepta Opus dentro de un MP4); el compresor de Windows solo admite 96–192 kb/s
  const cands = (aacBad ? [] : [320000, 256000, 192000, 160000, 128000, 96000].map(b => ({ codec: 'mp4a.40.2', mux: 'aac', bitrate: b }))).concat([{ codec: 'opus', mux: 'opus', bitrate: 320000 }]);
  for (const c of cands) {
    const cfg = { codec: c.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: c.bitrate };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return { cfg, mux: c.mux }; } catch {}
  }
  return null;
}
// trozos que se exportan (si no hay cortes, el clip entero)
const exportSegs = () => segs.length ? segs.map(g => ({ s: g.s, e: g.e })) : [{ s: 0, e: vid.duration }];
// el vídeo entra en el MP4 desde su primer fotograma clave con la configuración completa
// (si la tarjeta gráfica se salta ese primer fotograma, el MP4 sale sin cabecera y TikTok no lo puede procesar)
function vOut(muxer) {
  const st = { ok: false, drop: 0 }; muxer.__vst = st;
  return (c, m) => {
    if (!st.ok) {
      const dc = m && m.decoderConfig, d = dc && dc.description;
      if (c.type !== 'key' || !dc || (/^avc|^hvc|^hev/.test(dc.codec || '') && !(d && d.byteLength))) { st.drop++; return; }
      st.ok = true;
    }
    muxer.addVideoChunk(c, m);
  };
}
// comprueba que el MP4 se puede leer: cabecera del vídeo (avcC) y que empieza por un fotograma clave
function mp4Check(buf, muxer) {
  const st = muxer && muxer.__vst; if (st && (!st.ok || st.drop > 0)) throw new Error('MP4 incompleto: el compresor no dio bien el primer fotograma');
  const dv = new DataView(buf), u8 = new Uint8Array(buf), tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  const kids = (a, b) => { const out = []; let o = a; while (o + 8 <= b) { let z = dv.getUint32(o), h = 8; if (z === 1) { z = Number(dv.getBigUint64(o + 8)); h = 16; } if (z < 8 || o + z > b) break; out.push({ t: tag(o + 4), o, z, h }); o += z; } return out; };
  const top = kids(0, buf.byteLength), moov = top.find(x => x.t === 'moov'); if (!moov) throw new Error('MP4 sin índice');
  let video = false;
  for (const tr of kids(moov.o + 8, moov.o + moov.z).filter(x => x.t === 'trak')) {
    const find = (box, path) => { let cur = box; for (const t of path) { cur = kids(cur.o + cur.h, cur.o + cur.z).find(x => x.t === t); if (!cur) return null; } return cur; };
    const hd = find(tr, ['mdia', 'hdlr']); if (!hd || tag(hd.o + 16) !== 'vide') continue; video = true;
    const stbl = find(tr, ['mdia', 'minf', 'stbl']), sd = stbl && find(stbl, ['stsd']); if (!sd) throw new Error('MP4 sin descripción del vídeo');
    const ent = kids(sd.o + 16, sd.o + sd.z)[0];
    if (ent && /avc1|avc3/.test(ent.t) && !kids(ent.o + 86, ent.o + ent.z).some(x => x.t === 'avcC')) throw new Error('MP4 sin cabecera del vídeo (avcC)');
    const ss = find(stbl, ['stss']); if (ss && dv.getUint32(ss.o + 12) > 0 && dv.getUint32(ss.o + 16) !== 1) throw new Error('MP4 que no empieza por un fotograma clave');
  }
  if (!video) throw new Error('MP4 sin vídeo');
}
async function makeMuxer(fps, venc, aenc) {
  await loadScript(MUXER_URL, 'Mp4Muxer');
  return new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: venc.mux, width: W, height: H, frameRate: fps },
    audio: aenc ? { codec: aenc.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
    fastStart: 'in-memory', firstTimestampBehavior: 'offset',
  });
}
async function encodeAudio(muxer, aenc, mix) {
  if (!aenc) return;
  let aErr = null;
  const ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => aErr = e });
  const G = expGen; expTick('comprimir el audio');
  try {
    ae.configure(aenc.cfg);
    const N = mix.length, step = 4800, L = mix.getChannelData(0), R = mix.numberOfChannels > 1 ? mix.getChannelData(1) : L;
    let t0 = performance.now();
    for (let off = 0; off < N; off += step) {
      if (aErr) throw aErr;
      const n = Math.min(step, N - off), data = new Float32Array(n * 2);
      data.set(L.subarray(off, off + n), 0); data.set(R.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / 48000 * 1e6), data });
      ae.encode(ad); ad.close();
      while (ae.state === 'configured' && ae.encodeQueueSize > 50) {
        await sleep(1); expChk(G);
        if (performance.now() - t0 > 15000) throw expStall('comprimir el audio');
      }
      t0 = performance.now();
    }
    if (aErr) throw aErr;
    await expWait(ae.flush(), 20000, 'comprimir el audio');
    if (aErr) throw aErr;
  } catch (e) {
    if (e && !e.expFatal) { if (aenc.mux === 'aac') aacBad = true; try { e.aud = true; } catch {} }   // la próxima vez, el otro formato de audio
    throw e;
  } finally { expShut(ae); }
}

// exportación fotograma a fotograma (WebCodecs): calidad máxima, respeta los cortes
// ceder el paso sin el retraso de 4 ms de setTimeout
const tickCh = new MessageChannel(); let tickQ = [];
tickCh.port1.onmessage = () => { const q = tickQ; tickQ = []; q.forEach(r => r()); };
const tick = () => new Promise(r => { tickQ.push(r); tickCh.port2.postMessage(0); });
async function exportFast(onProg, onStatus) {
  expLastVenc = null; window.__expProf = null;
  if (!('VideoEncoder' in window) || !('VideoDecoder' in window)) throw new Error('sin WebCodecs');
  onStatus('Preparando la exportación…');
  const G = expGen; EXS = expStill();
  const PF = { t0: performance.now(), prep: 0, audio: 0, draw: 0, enc: 0, waitEnc: 0, waitDec: 0, end: 0, n: 0 }; let pt = PF.t0;   // en qué se va el tiempo
  const M = await expWait(movieIndex(file), 60000, 'leer el archivo');
  const samples = M.vs, vt = M.vt; let config = M.vcfg;
  if (!samples.length || !config) throw new Error('sin fotogramas');
  if (!(await VideoDecoder.isConfigSupported(config)).supported) throw new Error('códec no soportado: ' + config.codec);
  if (decNoHw) { const soft = { ...config, hardwareAcceleration: 'prefer-software' }; try { if ((await VideoDecoder.isConfigSupported(soft)).supported) config = soft; } catch {} }

  const srcD = vid.duration || (vt.duration / vt.timescale);
  const srcFps = samples.length / srcD; demuxFps = srcFps;
  const fps = fps30() ? Math.min(30, Math.round(srcFps)) : Math.min(60, Math.round(srcFps));
  const venc = await pickVideoEncoder(fps, expBitrate(), expFast());
  if (!venc) throw new Error('sin codificador de vídeo');
  const SG = exportSegs(), dur = SG.reduce((a, g) => a + g.e - g.s, 0);

  expLastVenc = venc;
  // el audio se mezcla A LA VEZ que se exporta el vídeo (antes había que esperarlo entero antes de empezar)
  const mixP = expWait(renderMix(dur), 180000, 'mezclar el audio', { expFatal: true }); mixP.catch(() => {});
  const aenc = await pickAudioEncoder();
  const muxer = await makeMuxer(fps, venc, aenc);
  PF.prep = performance.now() - pt;

  let vErr = null, dErr = null, ve = null, dec = null, shut = false, rx = null;
  const q = []; let poke = () => {};
  try {
  rx = await rxOpen();
  ve = new VideoEncoder({ output: vOut(muxer), error: e => vErr = e });
  ve.configure(venc.cfg);
  dec = new VideoDecoder({ output: f => { if (shut) { try { f.close(); } catch {} return; } q.push(f); poke(); }, error: e => { dErr = e; poke(); } });
  dec.configure(config);
  const firstTs = Math.min(...samples.slice(0, 64).map(s => s.cts)) / samples[0].timescale;
  const sT = s => s.cts / s.timescale - firstTs;
  onStatus(`Exportando a ${fps} fps…`);
  const fdur = 1 / fps;
  let outBase = 0, nextT = 0, idx = 0;
  for (const g of SG) {
    // empezar en el fotograma clave anterior al corte
    let i = 0;
    for (let j = 0; j < samples.length; j++) { if (!samples[j].is_sync) continue; if (sT(samples[j]) <= g.s + 1e-4) i = j; else break; }
    // se leen del disco solo los fotogramas de este trozo
    let iEnd = i; while (iEnd < samples.length && sT(samples[iEnd]) < g.e + 0.6) iEnd++;
    const segData = await loadSampleData(file, samples.slice(i, iEnd)), base = i;
    const toChunk = s => new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: Math.round(s.cts * 1e6 / s.timescale), duration: Math.round(s.duration * 1e6 / s.timescale), data: segData[s.__i - base] });
    for (let k = i; k < iEnd; k++) samples[k].__i = k;
    let flushing = false, finished = false, act = performance.now();
    for (;;) {
      expChk(G);
      if (dErr) throw dErr;
      if (q.length) {
        act = performance.now();
        const f = q.shift(), t = f.timestamp / 1e6 - firstTs;
        if (t < g.s - 1e-3 || t >= g.e - 1e-4) { f.close(); continue; }
        const T = outBase + (t - g.s);
        if (T + fdur * 0.25 < nextT || T > dur + 0.05) { f.close(); continue; }
        nextT = Math.max(nextT + fdur, T + fdur * 0.5);
        const p0 = performance.now();
        if (rx) rxFrame = await rx.get(T);
        draw(t, true, f, T); f.close();
        const p1 = performance.now();
        const vf = new VideoFrame(cv, { timestamp: Math.round(T * 1e6), duration: Math.round(fdur * 1e6) });
        EXS.tick(idx); ve.encode(vf, encOpts(venc, idx % (fps * 2) === 0)); vf.close(); idx++;
        const p2 = performance.now();
        await encDrain(ve, 10, 'comprimir el vídeo');
        PF.draw += p1 - p0; PF.enc += p2 - p1; PF.waitEnc += performance.now() - p2; PF.n++;
        if (vErr) throw encErr(vErr);
        if (idx % 8 === 0) { onProg(Math.min(1, T / dur)); await tick(); }
        continue;
      }
      if (finished) break;
      if (i < iEnd) { const i0 = i; while (i < iEnd && dec.decodeQueueSize < 24 && q.length < 24) dec.decode(toChunk(samples[i++])); if (i > i0) act = performance.now(); }
      else if (!flushing) { flushing = true; dec.flush().then(() => { finished = true; poke(); }, e => { dErr = e; poke(); }); }
      // el lector de vídeo lleva 15 s sin dar un solo fotograma: se da por parado (antes esperaba sin fin)
      if (performance.now() - act > 15000) throw expStall('leer el vídeo', { dec: true });
      { const w0 = performance.now(); await new Promise(r => { poke = r; setTimeout(r, 4); }); PF.waitDec += performance.now() - w0; }
    }
    outBase += g.e - g.s;
  }
  if (vErr) throw encErr(vErr);
  pt = performance.now();
  await expWait(ve.flush(), 15000, 'terminar de comprimir el vídeo', { enc: true });
  PF.end = performance.now() - pt; pt = performance.now();
  if (vErr) throw encErr(vErr);
  onStatus('Terminando el audio…');
  await encodeAudio(muxer, aenc, await mixP);
  PF.audio = performance.now() - pt; PF.total = performance.now() - PF.t0; PF.hw = !!venc.hw; PF.codec = venc.cfg.codec; PF.probe = venc.probe || 0; window.__expProf = PF;
  if (EXS.frozen()) throw Object.assign(new Error('la imagen salió congelada'), { dec: true });   // se repite leyendo el vídeo sin la tarjeta gráfica y, si sigue igual, con otro método
  muxer.finalize(); try { mp4Check(muxer.target.buffer, muxer); } catch (e) { throw encErr(e); }
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', fps, codec: venc.mux, mode: venc.hw ? 'rápida con tarjeta gráfica' : 'rápida', dur };
  } finally { shut = true; poke(); for (const f of q) { try { f.close(); } catch {} } q.length = 0; expShut(ve); expShut(dec); rxFrame = null; if (rx) rx.close(); }   // siempre se sueltan el compresor y el lector (si no, la exportación siguiente se quedaba sin ellos)
}

let demuxFps = 0;
async function estimateFps(tv) {
  if (!('requestVideoFrameCallback' in tv)) return 30;
  const ds = []; let last = null, on = true;
  const cb = (n, md) => { if (last != null) ds.push(md.mediaTime - last); last = md.mediaTime; if (on) tv.requestVideoFrameCallback(cb); };
  tv.requestVideoFrameCallback(cb);
  try { await tv.play(); } catch { return 30; }
  await sleep(500); on = false; tv.pause(); tv.currentTime = 0;
  const good = ds.filter(d => d > 0.007 && d < 0.1).sort((a, b) => a - b);
  return good.length ? 1 / good[Math.floor(good.length / 2)] : 30;
}
const snapFps = f => [24, 25, 30, 48, 50, 60].reduce((a, b) => Math.abs(b - f) < Math.abs(a - f) ? b : a, 30);
// exportación para formatos que el decodificador no admite (HEVC/H.265, WEBM, MOV…):
// el vídeo se reproduce a media velocidad y se guarda cada fotograma que muestra el navegador
async function exportPlay(onProg, onStatus) {
  if (!('VideoEncoder' in window) || !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) throw new Error('sin WebCodecs');
  onStatus('Preparando la exportación…');
  const G = expGen; EXS = expStill();
  const tv = await openTv();
  let ve = null;
  try {
  const sf = snapFps(demuxFps || fpsEst || await estimateFps(tv));
  const fps = fps30() ? Math.min(30, sf) : Math.min(60, sf);
  const venc = await pickVideoEncoder(fps, expBitrate(), expFast());
  if (!venc) throw new Error('sin codificador de vídeo');
  const SG = exportSegs(), dur = SG.reduce((a, g) => a + g.e - g.s, 0);
  onStatus('Mezclando el audio…');
  const mix = await expWait(renderMix(dur), 180000, 'mezclar el audio', { expFatal: true });
  const aenc = await pickAudioEncoder();
  const muxer = await makeMuxer(fps, venc, aenc);
  await encodeAudio(muxer, aenc, mix);
  let vErr = null;
  ve = new VideoEncoder({ output: vOut(muxer), error: e => vErr = e });
  ve.configure(venc.cfg);
  const fdur = 1 / fps, total = Math.max(1, Math.round(dur * fps));
  let oi = 0, outBase = 0, dropped = 0;
  const emit = (frame, t, T) => {   // un fotograma del vídeo final
    if (img === rxVid && rxVid.duration) { const w = T % rxVid.duration; if (Math.abs(rxVid.currentTime - w) > 0.15) rxVid.currentTime = w; if (rxVid.paused) rxVid.play().catch(() => {}); }
    draw(t, true, frame, T);
    const vf = new VideoFrame(cv, { timestamp: Math.round(T * 1e6), duration: Math.round(fdur * 1e6) });
    EXS.tick(oi); ve.encode(vf, encOpts(venc, oi % (fps * 2) === 0)); vf.close(); oi++;
  };
  onStatus(`Exportando a ${fps} fps…`);
  for (const g of SG) {
    await tvSeek(tv, g.s);
    let prev = null, prevT = g.s;
    const segEndIdx = Math.min(total, Math.round((outBase + g.e - g.s) * fps));
    await new Promise((res, rej) => {
      let finished = false, stall = null;
      const finish = () => { if (finished) return; finished = true; clearTimeout(stall); tv.pause(); res(); };
      const pump = (mt) => {
        // los fotogramas finales cuyo momento queda antes de la mitad entre el anterior y este usan el anterior
        while (prev && oi < segEndIdx) {
          const T = oi * fdur, t = g.s + (T - outBase);
          if (mt != null && t >= (prevT + mt) / 2) break;
          emit(prev, Math.max(prevT, Math.min(t, g.e - 1e-3)), T);
          if (mt != null && t > prevT + 1.5 * fdur) dropped++;
        }
      };
      const cb = async (now, md) => {
        if (finished) return;
        try {
          expChk(G);
          const mt = md.mediaTime;
          pump(mt);
          if (prev) prev.close();
          prev = new VideoFrame(tv, { timestamp: Math.round(mt * 1e6) }); prevT = mt;
          if (vErr) throw encErr(vErr);
          onProg(Math.min(1, oi / total));
          if (mt >= g.e - 0.5 / fps || oi >= segEndIdx) { finish(); return; }
          if (ve.encodeQueueSize > 6) { tv.pause(); await encDrain(ve, 2, 'comprimir el vídeo'); if (finished) return; tv.play().catch(() => {}); }
          clearTimeout(stall); stall = setTimeout(finish, 4000);
          tv.requestVideoFrameCallback(cb);
        } catch (e) { finished = true; tv.pause(); rej(e); }
      };
      tv.requestVideoFrameCallback(cb);
      tv.onended = () => setTimeout(finish, 200);
      tv.playbackRate = 0.5;
      tv.play().catch(rej);
      stall = setTimeout(finish, 6000);
    });
    // lo que falte del trozo, con el último fotograma
    if (prev) { while (oi < segEndIdx) { const T = oi * fdur; emit(prev, Math.min(g.e - 1e-3, Math.max(prevT, g.s + T - outBase)), T); } prev.close(); }
    expChk(G);
    await encDrain(ve, 4, 'comprimir el vídeo');
    outBase += g.e - g.s;
  }
  tv.pause();
  if (oi < total * 0.9) throw new Error('faltan fotogramas');
  if (EXS.frozen()) throw new Error('la imagen salió congelada');
  if (vErr) throw encErr(vErr);
  await expWait(ve.flush(), 15000, 'terminar de comprimir el vídeo', { enc: true });
  if (vErr) throw encErr(vErr);
  console.info('exportación por reproducción: fotogramas repetidos', dropped);
  if (dropped > total * 0.05) throw new Error('demasiados fotogramas perdidos');
  muxer.finalize(); try { mp4Check(muxer.target.buffer, muxer); } catch (e) { throw encErr(e); }
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', fps, codec: venc.mux, mode: 'completa' };
  } finally { try { tv.pause(); tv.removeAttribute('src'); tv.load(); tv.remove(); } catch {} expShut(ve); }
}
// exportación precisa para cualquier formato (HEVC/H.265, WEBM, MOV…): busca cada fotograma exacto en el vídeo
async function exportSeek(onProg, onStatus) {
  if (!('VideoEncoder' in window)) throw new Error('sin WebCodecs');
  onStatus('Preparando la exportación precisa…');
  const G = expGen; EXS = expStill();
  const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
  let ve = null;
  try {
  await expWait(new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = () => rej(new Error('vídeo')); }), 20000, 'abrir el vídeo');
  const sf = snapFps(demuxFps || fpsEst || await estimateFps(tv));
  const fps = fps30() ? Math.min(30, sf) : Math.min(60, sf);
  const venc = await pickVideoEncoder(fps, expBitrate(), expFast());
  if (!venc) throw new Error('sin codificador de vídeo');
  const SG = exportSegs(), dur = SG.reduce((a, g) => a + g.e - g.s, 0);
  onStatus('Mezclando el audio…');
  const mix = await expWait(renderMix(dur), 180000, 'mezclar el audio', { expFatal: true });
  const aenc = await pickAudioEncoder();
  const muxer = await makeMuxer(fps, venc, aenc);
  await encodeAudio(muxer, aenc, mix);
  let vErr = null;
  ve = new VideoEncoder({ output: vOut(muxer), error: e => vErr = e });
  ve.configure(venc.cfg);
  const n = Math.max(1, Math.round(dur * fps)), fdur = 1 / fps;
  const seekTo = t => new Promise(r => {
    if (Math.abs(tv.currentTime - t) < 1e-4 && tv.readyState >= 2) return r();
    let done = false; const fin = () => { if (!done) { done = true; r(); } };
    if ('requestVideoFrameCallback' in tv) tv.requestVideoFrameCallback(fin);
    tv.addEventListener('seeked', () => setTimeout(fin, 'requestVideoFrameCallback' in tv ? 60 : 0), { once: true });
    setTimeout(fin, 3000); tv.currentTime = t;
  });
  onStatus(`Exportando a ${fps} fps (modo preciso)…`);
  for (let i = 0; i < n; i++) {
    const T = i * fdur, L = locate(T);
    const t = Math.min(L.t + fdur * 0.5, segs.length ? segs[L.i].e - 1e-3 : tv.duration - 1e-3);   // mitad del fotograma: siempre el correcto
    await seekTo(t); await rxSeekTo(T);
    draw(t, true, tv, T);
    const vf = new VideoFrame(cv, { timestamp: Math.round(T * 1e6), duration: Math.round(fdur * 1e6) });
    EXS.tick(i); ve.encode(vf, encOpts(venc, i % (fps * 2) === 0)); vf.close();
    await encDrain(ve, 4, 'comprimir el vídeo');
    if (vErr) throw encErr(vErr);
    expChk(G);
    if (i % 3 === 0) onProg(i / n);
  }
  await expWait(ve.flush(), 15000, 'terminar de comprimir el vídeo', { enc: true });
  if (vErr) throw encErr(vErr);
  muxer.finalize(); try { mp4Check(muxer.target.buffer, muxer); } catch (e) { throw encErr(e); }
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', fps, codec: venc.mux, mode: 'precisa' + (EXS.frozen() ? ' · ⚠ LA IMAGEN PARECE CONGELADA: revisa el vídeo antes de subirlo' : '') };
  } finally { try { tv.removeAttribute('src'); tv.load(); } catch {} expShut(ve); }
}

// respaldo: graba en tiempo real (para WEBM u ordenadores sin WebCodecs)
function pickMime() {
  const types = ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}
async function exportRealtime(onProg, onStatus, why) {
  // este último recurso graba el vídeo entero tal cual: si el clip tiene cortes saldría otra cosa, así que mejor avisar
  if (segs.length && (segs.length > 1 || segs[0].s > 0.05 || segs[0].e < (vid.duration || 0) - 0.05)) throw new Error('no se pudo con ningún método' + (why ? ' (' + why + ')' : ''));
  ensureAudio();
  const mime = pickMime();
  if (!mime) throw new Error('Este navegador no puede grabar vídeo. Usa Chrome o Edge en el ordenador.');
  const fps = fps30() ? 30 : 60;
  onStatus('Exportando en tiempo real… no cambies de pestaña.');
  const G = expGen;
  vid.pause();
  // (si el vídeo ya estaba en el principio, el aviso de «ya he llegado» no llega nunca: antes se quedaba esperándolo)
  if (vid.currentTime > 0.01 || vid.seeking) { const sk = new Promise(r => vid.addEventListener('seeked', r, { once: true })); vid.currentTime = 0; await expWait(sk, 4000, 'volver al principio').catch(() => {}); }
  draw(0, true);
  const vs = cv.captureStream(fps);
  const rec = new MediaRecorder(new MediaStream([vs.getVideoTracks()[0], ...recDest.stream.getAudioTracks()]),
    { mimeType: mime, videoBitsPerSecond: expBitrate(), audioBitsPerSecond: 320000 });
  const parts = [];
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
  const done = new Promise(r => rec.onstop = r);
  speaker.gain.value = 0;
  let raf;
  const tick = () => { draw(vid.currentTime, true); onProg(vid.currentTime / vid.duration); if (!vid.ended) raf = requestAnimationFrame(tick); };
  try {
    rec.start(250);
    await expWait(vid.play(), 8000, 'empezar a reproducir');
    tick();
    await new Promise((res, rej) => {   // si el vídeo deja de avanzar 10 s, error (antes esperaba al final para siempre)
      let lastT = -1, lastAt = performance.now();
      const iv = setInterval(() => {
        const now = performance.now();
        if (G !== expGen) { clearInterval(iv); rej(Object.assign(new Error('exportación cancelada'), { expFatal: true, cancel: true })); }
        else if (vid.ended) { clearInterval(iv); res(); }
        else if (vid.currentTime !== lastT) { lastT = vid.currentTime; lastAt = now; }
        else if (now - lastAt > 10000) { clearInterval(iv); rej(expStall('grabar en tiempo real')); }
      }, 400);
      vid.addEventListener('ended', () => { clearInterval(iv); res(); }, { once: true });
    });
    cancelAnimationFrame(raf); draw(vid.duration, true);
    await sleep(200);
    rec.stop(); await expWait(done, 8000, 'cerrar la grabación');
  } finally { cancelAnimationFrame(raf); speaker.gain.value = 1; try { vid.pause(); } catch {} try { if (rec.state !== 'inactive') rec.stop(); } catch {} }
  return { blob: new Blob(parts, { type: mime.split(';')[0] }), ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm', fps, codec: 'tiempo real' };
}

const exportName = out => 'clipzi_' + ($('title').value.trim().slice(0, 30).replace(/[^\p{L}\p{N}]+/gu, '_') || 'clip') + '.' + out.ext;
$('export').onclick = () => doExport({ auto: true });
async function doExport(opts = {}) {
  if (!loaded || exporting) return null;
  if (layoutMode === 'split' && !img) { setStatus($('eStatus'), 'Falta la imagen de abajo: pégala (Ctrl+V), arrástrala o haz clic en el recuadro.', 'err'); toast('Falta la imagen'); return null; }
  const st = $('eStatus'), barW = $('eBarW'), bar = $('eBar');
  exporting = true; markActive(-1); hover = null;
  ['export','play','seek','transcribe'].forEach(id => $(id).disabled = true);
  vid.pause();
  $('result').innerHTML = ''; barW.hidden = false; bar.style.width = '0%';
  const G = ++expGen; expTick('preparar');
  const live = () => G === expGen;
  const onProg = p => { if (!live()) return; expTick(); bar.style.width = (p * 100).toFixed(1) + '%'; };
  const onStatus = m => { if (!live()) return; expTick(m); setStatus(st, m); };
  const t0 = performance.now(), expTries = [];
  let out;
  // se puede cancelar a mano, y si pasan 90 s sin ningún avance se corta sola: el botón Exportar nunca se queda muerto
  const stopP = new Promise((_, rej) => { expAbort = why => rej(Object.assign(new Error(why || 'exportación cancelada'), { expFatal: true, cancel: !why })); });
  stopP.catch(() => {});
  const wd = setInterval(() => { if (performance.now() - expBeat > 90000 && expAbort) expAbort('se quedó parada 90 s sin avanzar (' + (expStage || 'sin datos') + ')'); }, 3000);
  expBtn(true);
  const run = async () => {
    let o;
    await preloadEmojis(); expTick();
    const next = (e, txt) => { if (e && e.expFatal) throw e; expChk(G); console.warn(txt, e); expTries.push(String(e && e.message || e).slice(0, 90)); bar.style.width = '0%'; if (e && e.stall) toast('Ese método ' + e.message.replace('parada', 'parado') + ': pruebo con otro'); };
    try {
      for (let k = 0; ; k++) {
        try { o = await exportFast(onProg, onStatus); break; }
        catch (e0) {   // falló el compresor o el lector: mismo método rápido con el siguiente mejor (y el malo queda apuntado para no volver a probarlo)
          if (!e0 || e0.expFatal || k >= 3) throw e0;
          if (e0.aud) { /* otro formato de audio */ }
          else if (e0.dec) { if (decNoHw) throw e0; decNoHw = true; }
          else if (e0.enc && expLastVenc && expLastVenc.q == null) encNote(expLastVenc.cfg, { ok: false, why: String(e0.message || e0).slice(0, 90) });
          else throw e0;
          next(e0, 'Exportación rápida: otro intento:');
        }
      }
    }
    catch (e) {
      next(e, 'Exportación rápida no disponible, uso la precisa:');
      try { o = await exportPlay(onProg, onStatus); }
      catch (e3) { next(e3, 'Exportación por reproducción no disponible, uso la precisa:');
      try { o = await exportSeek(onProg, onStatus); }
      catch (e2) { next(e2, 'Exportación precisa no disponible, uso tiempo real:'); o = await exportRealtime(onProg, onStatus, e2 && e2.message); } }
    }
    return o;
  };
  try {
    const job = run(); job.catch(() => {});
    out = await Promise.race([job, stopP]);
    expChk(G);
    const name = exportName(out);
    const a = document.createElement('a');
    a.className = 'dl'; a.href = URL.createObjectURL(out.blob); a.download = name;
    a.textContent = `Descargar ${name} (${(out.blob.size / 1048576).toFixed(1)} MB)`;
    $('result').append(a);
    if (opts.auto) { a.click(); a.textContent = `✅ Descargado: ${name} (${(out.blob.size / 1048576).toFixed(1)} MB) · volver a descargar`; }
    window.__lastExport = out;
@@solo-web
    webExported(out);
@@fin
    try { clipLogAdd({ tipo: 'exportado', ...clipLogSnap(), exportacion: { modo: out.mode || 'en tiempo real', fps: out.fps, tardo_s: +((performance.now() - t0) / 1000).toFixed(1) } }); } catch (e) { console.warn('registro', e); }
    expLogSave({ ok: true, modo: out.mode || 'en tiempo real', fps: out.fps, codec: out.codec, clip_s: +(out.dur || 0).toFixed(1), tardo_s: +((performance.now() - t0) / 1000).toFixed(1), mb: +(out.blob.size / 1048576).toFixed(1), intentos: expTries });
    setStatus(st, `Vídeo listo · ${out.fps} fps · ${out.codec === 'avc' ? 'H.264' : out.codec === 'vp9' ? 'VP9' : out.codec} · exportación ${out.mode || 'en tiempo real'} · ${((performance.now() - t0) / 1000).toFixed(1)} s${out.dur ? ` (${(out.dur / Math.max(0.1, (performance.now() - t0) / 1000)).toFixed(1).replace('.', ',')}× más rápido que el clip)` : ''}.`, 'ok');
  } catch (err) {
    console.error(err); out = null;
    expLogSave({ ok: false, error: String(err && err.message || err).slice(0, 160), tardo_s: +((performance.now() - t0) / 1000).toFixed(1), intentos: expTries });
    setStatus(st, err && err.cancel ? 'Exportación cancelada.' : 'No se pudo exportar: ' + (err && err.message || err) + '. Pulsa Exportar otra vez.', 'err');
  } finally {
    clearInterval(wd); expAbort = null; if (G === expGen) expGen++;   // lo que quedara a medias se detiene solo
    try { expBtn(false); } catch {}
    exporting = false; barW.hidden = true;
    ['export','play','seek','transcribe'].forEach(id => $(id).disabled = false);
    seekOut(0);
  }
  return out;
}


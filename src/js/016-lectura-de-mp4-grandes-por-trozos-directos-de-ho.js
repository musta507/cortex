/* ---------- lectura de MP4 grandes por trozos (directos de horas): índice, vídeo y audio de un rango ---------- */
const movieCache = new WeakMap();
const readBytes = async (f, a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer());
async function movieIndex(f) {
  if (movieCache.has(f)) return movieCache.get(f);
  const p = (async () => {
    await loadScript(MP4BOX_URL, 'MP4Box');
    const size = f.size, boxes = [];
    for (let off = 0; off + 8 <= size && boxes.length < 1000;) {
      const h = await readBytes(f, off, Math.min(size, off + 16)), dv = new DataView(h.buffer);
      let sz = dv.getUint32(0); const type = String.fromCharCode(h[4], h[5], h[6], h[7]);
      if (sz === 1) sz = Number(dv.getBigUint64(8)); else if (sz === 0) sz = size - off;
      if (sz < 8 || !/^[\x20-\x7e]{4}$/.test(type)) throw new Error('El archivo no es MP4/MOV');
      boxes.push({ type, off, sz }); off += sz;
    }
    if (!boxes.some(b => b.type === 'moov')) throw new Error('El archivo no es MP4/MOV');
    const mp4 = MP4Box.createFile(); let info = null, err = null;
    mp4.onReady = i => info = i; mp4.onError = e => err = e;
    for (const b of boxes) {   // solo cabeceras: del «mdat» (los datos) se lee lo justo cuando hace falta
      const u = await readBytes(f, b.off, b.off + (b.type === 'mdat' ? Math.min(b.sz, 16) : b.sz));
      const ab = u.buffer; ab.fileStart = b.off; mp4.appendBuffer(ab);
    }
    mp4.flush();
    if (!info) throw new Error('mp4: ' + (err || 'sin información'));
    const vt = info.videoTracks[0], at = info.audioTracks[0];
    const v = vt && mp4.getTrackById(vt.id), a = at && mp4.getTrackById(at.id);
    let vcfg = null, acfg = null;
    if (v) {
      let description; const DS = (MP4Box.DataStream || window.DataStream);
      for (const entry of v.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
        if (box) { const st = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(st); description = new Uint8Array(st.buffer, 8); break; }
      }
      vcfg = { codec: vt.codec.startsWith('vp08') ? 'vp8' : vt.codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description };
    }
    if (a) {
      const e = a.mdia.minf.stbl.stsd.entries[0];
      let codec = at.codec, description;
      if (e.esds) { try { description = e.esds.esd.descs[0].descs[0].data; } catch {} if (!/^mp4a\.40\./.test(codec)) codec = 'mp4a.40.2'; }
      if (/^opus$/i.test(codec) || e.type === 'Opus') codec = 'opus';
      acfg = { codec, sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count, description };
    }
    return { vt, at, vs: v ? v.samples : [], as: a ? a.samples : [], vcfg, acfg, dur: info.duration / info.timescale };
  })();
  movieCache.set(f, p); p.catch(() => movieCache.delete(f));
  return p;
}
// lee los datos de varias muestras seguidas agrupando lecturas del disco
async function loadSampleData(f, list, gap = 4e6) {
  const out = new Array(list.length);
  for (let i = 0; i < list.length;) {
    let j = i, a = list[i].offset, b = a + list[i].size;
    while (j + 1 < list.length && list[j + 1].offset >= a && list[j + 1].offset - b < gap && list[j + 1].offset + list[j + 1].size - a < 48e6) { j++; b = Math.max(b, list[j].offset + list[j].size); }
    const buf = await readBytes(f, a, b);
    for (let k = i; k <= j; k++) out[k] = buf.subarray(list[k].offset - a, list[k].offset - a + list[k].size);
    i = j + 1;
  }
  return out;
}
// audio de un rango [s, e] del original, a la frecuencia y canales pedidos (sin cargar el archivo entero)
async function decodeAudioRange(f, s, e, rate, channels) {
  let pcm = null;
  try {
    if (!('AudioDecoder' in window)) throw new Error('sin AudioDecoder');
    const M = await movieIndex(f); if (!M.acfg || !M.as.length) throw new Error('sin audio');
    if (!(await AudioDecoder.isConfigSupported(M.acfg)).supported) throw new Error('audio no soportado: ' + M.acfg.codec);
    const ts = M.as[0].timescale, t0 = M.as[0].cts / ts;
    const list = M.as.filter(x => x.cts / ts - t0 >= s - 0.25 && x.cts / ts - t0 <= e + 0.1);
    if (!list.length) throw new Error('rango sin audio');
    const data = await loadSampleData(f, list, 3e5);   // el audio va entre el vídeo: se lee solo el audio
    const outs = []; let derr = null;
    const dec = new AudioDecoder({ output: ad => { const ch = ad.numberOfChannels, n = ad.numberOfFrames, planes = [];
      for (let c = 0; c < ch; c++) { const pl = new Float32Array(n); ad.copyTo(pl, { planeIndex: c, format: 'f32-planar' }); planes.push(pl); }
      outs.push({ t: ad.timestamp / 1e6, sr: ad.sampleRate, planes }); ad.close(); }, error: x => derr = x });
    dec.configure(M.acfg);
    list.forEach((x, i) => dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round((x.cts / ts - t0) * 1e6), duration: Math.round(x.duration / ts * 1e6), data: data[i] })));
    try { await expWait(dec.flush(), 25000, 'leer el audio'); } finally { expShut(dec); }
    if (derr) throw derr;
    if (!outs.length) throw new Error('sin audio decodificado');
    const sr = outs[0].sr, nch = outs[0].planes.length, start = outs[0].t;
    const total = Math.round((outs[outs.length - 1].t - start) * sr) + outs[outs.length - 1].planes[0].length;
    const planes = Array.from({ length: nch }, () => new Float32Array(total));
    for (const o of outs) { const at = Math.round((o.t - start) * sr); for (let c = 0; c < nch; c++) planes[c].set(o.planes[c].subarray(0, Math.max(0, Math.min(o.planes[c].length, total - at))), at); }
    pcm = { sr, start, planes };
  } catch (err) {
    if (f.size > 1.2e9) throw err;   // archivos enormes: no se pueden leer enteros
    console.warn('Audio por rango no disponible, leo el archivo entero:', err);
    const buf = await decodeAudio(f, 48000, 2);
    pcm = { sr: buf.sampleRate, start: 0, planes: [...Array(buf.numberOfChannels)].map((_, c) => buf.getChannelData(c)) };
  }
  // recortar [s, e] y pasar a la frecuencia pedida
  const a = Math.max(0, Math.round((s - pcm.start) * pcm.sr)), b = Math.min(pcm.planes[0].length, Math.round((e - pcm.start) * pcm.sr));
  const n = Math.max(1, b - a), len = Math.max(1, Math.round(n / pcm.sr * rate));
  const oac = new OfflineAudioContext(channels, len, rate);
  const src = oac.createBuffer(pcm.planes.length, n, pcm.sr);
  pcm.planes.forEach((p, c) => src.copyToChannel(p.subarray(a, a + n), c));
  const bs = oac.createBufferSource(); bs.buffer = src; bs.connect(oac.destination); bs.start(0);
  return oac.startRendering();
}
async function rangeAudio16k(s, e) {
  const buf = await decodeAudioRange(file, s, e, 16000, 1);
  return buf.getChannelData(0);
}

// mezcla final de voz + música a 48 kHz estéreo
async function renderMix(dur) {
  const rate = 48000, len = Math.ceil(dur * rate);
  const oac = new OfflineAudioContext(2, len, rate);
  if (!trk.video.mute) try {
    const g = oac.createGain(); g.gain.value = +$('vVol').value / 100; g.connect(oac.destination);
    let at = 0;
    for (const sg of exportSegs()) {   // la voz de cada trozo, uno detrás de otro (solo se lee ese trozo del archivo)
      expTick('mezclar el audio');
      const ist = isoOn() ? isoStemFor(sg.s, sg.e) : null;   // voz aislada (sin música ni fondo)
      const buf = ist ? isoBuffer(ist, isoLvl()) : await decodeAudioRange(file, sg.s, sg.e, rate, 2);
      const s = oac.createBufferSource(); s.buffer = buf;
      const mg = oac.createGain(); s.connect(mg).connect(g);
      // palabras censuradas: silencio solo durante la palabra
      const cuts = []; for (const m of [...mutes].sort((x, y) => x.s - y.s)) { const a = Math.max(m.s, sg.s), b = Math.min(m.e, sg.e); if (b <= a) continue; const l = cuts[cuts.length - 1]; if (l && a <= l[1] + 0.012) l[1] = Math.max(l[1], b); else cuts.push([a, b]); }
      for (const [a, b] of cuts) { const t0 = at + a - sg.s, t1 = at + b - sg.s, r = Math.min(0.005, (t1 - t0) / 4);
        mg.gain.setValueAtTime(1, t0); mg.gain.linearRampToValueAtTime(0, t0 + r); mg.gain.setValueAtTime(0, t1 - r); mg.gain.linearRampToValueAtTime(1, t1); }
      s.start(at, ist ? sg.s - ist.s : 0, sg.e - sg.s); at += sg.e - sg.s;
    }
  } catch (e) { console.warn('Clip sin audio', e); }
  if (music.cur && !trk.audio.mute) {
    const mb = await decodeAudio(music.cur.blob, rate, 2);
    const s = oac.createBufferSource(); s.buffer = mb; s.loop = $('mLoop').checked;
    const g = oac.createGain();
    const vol = +$('mVol').value / 100, fi = +$('mFadeIn').value, fo = Math.min(+$('mFadeOut').value, dur);
    g.gain.setValueAtTime(fi > 0 ? 0 : vol, 0);
    if (fi > 0) g.gain.linearRampToValueAtTime(vol, Math.min(fi, dur));
    if (fo > 0) { g.gain.setValueAtTime(vol, Math.max(0, dur - fo)); g.gain.linearRampToValueAtTime(0, dur); }
    s.connect(g).connect(oac.destination);
    s.start(0, Math.min(+$('mStart').value, Math.max(0, mb.duration - 0.01)));
  }
  return oac.startRendering();
}

function demux(ab) {
  return new Promise((res, rej) => {
    const mp4 = MP4Box.createFile();
    let vt = null; const samples = [];
    mp4.onError = e => rej(new Error('mp4: ' + e));
    mp4.onReady = info => {
      vt = info.videoTracks[0];
      if (!vt) return;
      mp4.setExtractionOptions(vt.id, null, { nbSamples: 1e9 });
      mp4.start();
    };
    mp4.onSamples = (id, user, ss) => { for (const s of ss) samples.push(s); };
    ab.fileStart = 0;
    mp4.appendBuffer(ab); mp4.flush();
    if (!vt) return rej(new Error('El archivo no es MP4/MOV'));
    const trak = mp4.getTrackById(vt.id);
    let description;
    const DS = (MP4Box.DataStream || window.DataStream);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) { const st = new DS(undefined, 0, DS.BIG_ENDIAN); box.write(st); description = new Uint8Array(st.buffer, 8); break; }
    }
    const codec = vt.codec.startsWith('vp08') ? 'vp8' : vt.codec;
    res({ vt, samples, config: { codec, codedWidth: vt.video.width, codedHeight: vt.video.height, description } });
  });
}

// codificador: primero «calidad constante» (cada fotograma con la misma calidad, sin ruido ni bloques en movimiento);
// si el ordenador no lo admite, bitrate alto variable
// «Rápida»: tarjeta gráfica + 30 fps (lo que más tarda al exportar es comprimir el vídeo, no dibujarlo)
let encNoHw = false;   // si la tarjeta gráfica falla al comprimir, no se vuelve a intentar con ella
let decNoHw = false, aacBad = false;   // lo mismo al leer el vídeo y al comprimir el audio
/* vigilante de la exportación: ningún paso puede esperar para siempre. Si un paso se para, da error y se prueba el método siguiente */
// vigía de imagen congelada: cada 15 fotogramas mira una miniatura de lo que se exporta; si en 4 s o más no cambia nada, el método se da por malo
let EXS = { tick() {}, frozen: () => false };
function expStill() {
  const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d', { willReadFrequently: true }), seen = new Set(); let n = 0;
  return { tick(i) { if (i % 15) return; try { x.drawImage(cv, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data; let h = 0; for (let k = 0; k < d.length; k += 4) h = (h * 31 + ((d[k] >> 3) << 10) + ((d[k + 1] >> 3) << 5) + (d[k + 2] >> 3)) | 0; seen.add(h); n++; } catch {} },
    frozen: () => n >= 8 && seen.size <= 1 };
}
let expGen = 0, expBeat = 0, expStage = '', expAbort = null;
const expTick = s => { expBeat = performance.now(); if (s) expStage = s; };
const expStall = (what, extra) => Object.assign(new Error('se quedó parada al ' + what), { stall: true }, extra || {});
const expChk = g => { if (g !== expGen) throw Object.assign(new Error('exportación cancelada'), { expFatal: true, cancel: true }); };
const expWait = (p, ms, what, extra) => { let t; p = Promise.resolve(p); p.catch(() => {});
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(expStall(what, extra)), ms); })]).finally(() => clearTimeout(t)); };
const expShut = o => { try { if (o && o.state !== 'closed') o.close(); } catch {} };
// esperar a que el compresor vaya al día; si deja de avanzar 12 s, error (antes se quedaba esperando sin fin)
async function encDrain(ve, max, what) {
  let last = ve.encodeQueueSize, t0 = performance.now(), n = 0;
  while (ve.state === 'configured' && ve.encodeQueueSize > max) {
    if (++n < 300) await tick(); else await sleep(2);
    const z = ve.encodeQueueSize;
    if (z < last) { last = z; t0 = performance.now(); n = 0; }
    else if (performance.now() - t0 > 12000) throw expStall(what || 'comprimir el vídeo', { enc: true });
  }
}
// registro de exportaciones en la carpeta del grabador (exportaciones.jsonl): cuánto tardó cada una y en qué se fue el tiempo
async function expLogSave(ev) {
  try {
    const P = window.__expProf, f = x => +((x || 0) / 1000).toFixed(2);
    const row = { cuando: new Date().toISOString(), ...ev, formato: layoutMode, calidad: $('quality').value, app: !!(window.cortexApp && window.cortexApp.isApp), giro: typeof antiRot === 'function' && antiRot(), sinTarjeta: encNoHw, lectorSinTarjeta: decNoHw,
      pasos: P ? { preparar: f(P.prep), audio: f(P.audio), dibujar: f(P.draw), comprimir: f(P.enc), esperaCompresor: f(P.waitEnc), esperaLector: f(P.waitDec), cierre: f(P.end), fotogramas: P.n, tarjeta: P.hw, codec: P.codec, velocidadPrueba: P.probe } : null, compresores: encMem() };
    try { if (!window.__gpu) { const g = document.createElement('canvas').getContext('webgl'), x = g && g.getExtension('WEBGL_debug_renderer_info'); window.__gpu = g ? String(x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)).slice(0, 120) : 'sin WebGL'; } row.grafica = window.__gpu; row.nucleos = navigator.hardwareConcurrency; } catch {}
    window.__expLast = row;
    if (!liveDir) return;   // sin carpeta del grabador no se guarda (no se pide permiso para esto)
    const old = ((await rtext(liveDir, 'exportaciones.jsonl')) || '').split('\n').filter(Boolean).slice(-200);
    await wfile(liveDir, 'exportaciones.jsonl', old.concat(JSON.stringify(row)).join('\n') + '\n');
  } catch (e) { console.warn('registro de exportación', e); }
}
function expBtn(on) {
  for (const host of ['eBarW', 'seBarW']) {
    const w = $(host); if (!w) continue; let b = $(host + 'X');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.id = host + 'X'; b.textContent = '✕ Cancelar la exportación';
      b.style.cssText = 'width:auto;margin-top:6px;padding:5px 12px;font-size:12px'; b.onclick = () => { if (expAbort) expAbort(); }; w.after(b); }
    b.hidden = !on;
  }
}
const expFast = () => $('quality').value === 'fast';
setTimeout(() => {
  const q = $('quality'), sq = $('seQ'), f = () => { $('fps').hidden = expFast(); };
  try { const v = ezPref('expQ'); if (v && [...q.options].some(o => o.value === v)) q.value = v; } catch {}   // la calidad elegida se recuerda
  if (sq) { sq.value = q.value; sq.addEventListener('change', () => { q.value = sq.value; q.dispatchEvent(new Event('change')); }); }
  q.addEventListener('change', () => { f(); try { ezPref('expQ', q.value); } catch {} if (sq) sq.value = q.value; }); f();
}, 0);
const expBitrate = () => expFast() ? 22e6 : +$('quality').value >= 30e6 ? 45e6 : 30e6;   // rápida 22 Mb/s · normal 30 · máxima 45 (todas con el compresor más rápido que haya)   // rápida: 22 Mb/s (las tarjetas gráficas se quedan cortas con menos)
const fps30 = () => expFast() || $('fps').value === '30';

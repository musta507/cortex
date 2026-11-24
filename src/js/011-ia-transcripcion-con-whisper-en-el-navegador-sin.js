/* ---------- IA: transcripción con Whisper en el navegador (sin worker: funciona con doble clic) ---------- */
const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5/dist/transformers.min.js';
let tjs = null; const pipeCache = {};
async function hasWebGPU(){ try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { return false; } }
const nextTick = () => new Promise(r => setTimeout(r, 30));
async function loadPipe(model, onProgress, onStatus, m) {
  if (pipeCache[model]) return pipeCache[model];
  if (!tjs) {
    onStatus('Cargando la IA…');
    try { tjs = await import(TJS_URL); }
    catch (e) { throw new Error('No se pudo descargar la IA. Revisa tu conexión a internet y desactiva el bloqueador de anuncios para esta página.'); }
    tjs.env.allowLocalModels = false;
  }
  const tries = [], gpu = await hasWebGPU();
  if (m && m.gpu) {   // modelo grande: solo con tarjeta gráfica
    if (!gpu) throw new Error('sin tarjeta gráfica para este modelo');
    if (m.enc === 'fp16') tries.push({ device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' } });
    tries.push({ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } });
  } else {
    if (gpu) tries.push({ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } });
    tries.push({ device: 'wasm', dtype: 'q8' }, { device: 'wasm', dtype: 'fp32' });
  }
  let last;
  for (const o of tries) {
    try {
      onStatus('Preparando modelo (' + (o.device === 'webgpu' ? 'tarjeta gráfica' : 'procesador') + ')…');
      const p = await tjs.pipeline('automatic-speech-recognition', model, { ...o, progress_callback: onProgress });
      pipeCache[model] = p; return p;
    } catch (e) { console.warn('Intento fallido', model, o, e); last = e; }
  }
  throw last;
}
let aiLock = Promise.resolve();
async function runAI(audio, models, language, onProgress, onStatus, extra) {
  const prev = aiLock; let free; aiLock = new Promise(r => free = r);   // la IA de voz solo puede hacer una cosa a la vez
  try { await prev; } catch {}
  const t0 = performance.now(); try { return await runAI0(audio, models, language, onProgress, onStatus, extra); } finally { tmWhisper += performance.now() - t0; free(); }
}
async function runAI0(audio, models, language, onProgress, onStatus, extra) {
  let lastErr;
  for (const m of models) {
    try {
      const pipe = await loadPipe(m.id, onProgress, onStatus, m);
      onStatus('Transcribiendo el audio… (la página puede ir lenta un momento)');
      await nextTick();
      const base = { language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, ...(extra || {}) };
      let out = null, mode = 'word';
      if (m.word) { try { out = await pipe(audio, { ...base, return_timestamps: 'word' }); } catch (e) { console.warn('Sin marcas por palabra', e); } }
      if (!out) { mode = 'segment'; out = await pipe(audio, { ...base, return_timestamps: true }); }
      return { chunks: out.chunks || [], text: out.text, mode };
    } catch (err) { console.warn('Modelo fallido', m.id, err); lastErr = err; }
  }
  const msg = String(lastErr && lastErr.message || lastErr || '');
  if (/fetch|network/i.test(msg)) throw new Error('No se pudo descargar el modelo de IA. Revisa tu internet y desactiva el bloqueador de anuncios o el antivirus web para esta página.');
  throw new Error(msg || 'La IA no ha podido arrancar');
}

// decodifica el audio de un archivo a la frecuencia pedida (OfflineAudioContext: no necesita permisos de sonido)
async function decodeAudio(f, rate, channels) {
  const ab = await f.arrayBuffer();
  const ac = new OfflineAudioContext(channels, rate, rate);
  return Promise.race([
    new Promise((res, rej) => { const p = ac.decodeAudioData(ab, res, () => rej(new Error('No se pudo leer el audio. Prueba con un MP4 (H.264 + AAC).'))); if (p && p.catch) p.catch(() => {}); }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Leer el audio está tardando demasiado. Prueba con un archivo más corto o en MP4.')), 90000)),
  ]);
}
async function decodeAudio16k(f) {
  const buf = await decodeAudio(f, 16000, 1);
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}

function chunksToWords(chunks, mode) {
  const dur = vid.duration || 0;
  const words = [];
  if (mode === 'word') {
    for (const c of chunks) {
      const t = (c.text || '').trim(); if (!t) continue;
      let [a, b] = c.timestamp; if (b == null) b = Math.min(dur, a + 0.4);
      words.push({ text: t, start: a, end: b });
    }
  } else {
    chunks.forEach((c, i) => {
      let [a, b] = c.timestamp;
      if (b == null) b = (chunks[i + 1] && chunks[i + 1].timestamp[0]) || dur || a + 2;
      const parts = (c.text || '').trim().split(/\s+/).filter(Boolean);
      const total = parts.reduce((x, p) => x + p.length + 1, 0);
      let t = a;
      for (const p of parts) { const d = (b - a) * (p.length + 1) / total; words.push({ text: p, start: t, end: t + d }); t += d; }
    });
  }
  return words;
}



/* ---------- subtítulos con ElevenLabs Scribe: el reconocedor en internet (en la web, por el servidor; en el PC, con tu clave) ---------- */
const elWeb = () => typeof CORTEX_PROXY !== 'undefined' && !!CORTEX_PROXY;
const getElKey = () => { try { return (localStorage.getItem('clipzi-eleven') || '').trim(); } catch { return ''; } };
let elOff = 0;   // si el servidor no lo tiene o falla la conexión, no se vuelve a probar en un rato
const elReady = () => Date.now() - elOff > 10 * 60e3 && (elWeb() || !!getElKey());
function wav16k(a) {
  const n = a.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), ws = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, a[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
const EL_LANG = { spanish: 'es', english: 'en', portuguese: 'pt', french: 'fr', italian: 'it', german: 'de' };
async function elevenWords(audio, a0, lang) {
  const wav = wav16k(audio), lc = EL_LANG[lang] || (/^[a-z]{2}$/.test(lang || '') ? lang : '');
  let j = null, err = '';
  if (elWeb()) {
    const r = await fetch('/api/voz', { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'x-lang': lc }, body: wav });
    j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 503 || r.status === 404) elOff = Date.now(); throw new Error((j.error && j.error.message) || ('servidor ' + r.status)); }
  } else {
    for (const model of ['scribe_v3', 'scribe_v2', 'scribe_v1']) {   // primero el más nuevo; si la cuenta no lo tiene, se baja al anterior
      const fd = new FormData(); fd.append('file', wav, 'clip.wav'); fd.append('model_id', model); fd.append('timestamps_granularity', 'word'); fd.append('tag_audio_events', 'false'); if (lc) fd.append('language_code', lc);
      let r; try { r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': getElKey() }, body: fd }); }
      catch (e) { elOff = Date.now(); throw new Error('no se pudo conectar con ElevenLabs'); }
      const t = await r.text(); try { j = JSON.parse(t); } catch { j = null; }
      if (r.ok) break;
      err = (j && j.detail && (j.detail.message || j.detail.status || JSON.stringify(j.detail))) || ('error ' + r.status);
      if (r.status === 401) throw new Error('la clave de ElevenLabs no vale');
      if (r.status === 429 || r.status >= 500 || model === 'scribe_v1') throw new Error(err); j = null;   // si este modelo no está disponible, se prueba el anterior
    }
    if (!j) throw new Error(err || 'sin respuesta');
  }
  const out = [];
  for (const w of (j.words || [])) { if (w.type && w.type !== 'word') continue; const t = String(w.text || '').trim(); if (!t || w.start == null) continue; out.push({ text: t, start: +w.start + a0, end: +(w.end != null ? w.end : w.start + 0.3) + a0 }); }
  return out;
}
setTimeout(() => { const k = $('elKey'); if (!k) return; if (elWeb()) { $('elKeyW').hidden = $('elKeyH').hidden = true; return; } k.value = getElKey(); k.addEventListener('input', () => { try { localStorage.setItem('clipzi-eleven', k.value.trim()); } catch {} elOff = 0; }); }, 0);
async function doTranscribe(onMsg) {
  if (!file) return false;
  const say = (m, k) => { setStatus($('tStatus'), m, k); if (onMsg) onMsg(m, k); };
  const btn = $('transcribe'), st = $('tStatus'), barW = $('tBarW'), bar = $('tBar');
  btn.disabled = true; barW.hidden = false; bar.style.width = '0%';
  try {
    const ranges = subRanges();
    // el mejor modelo que aguante el ordenador: el grande (Whisper large-v3 turbo) con tarjeta gráfica; si no, el mediano
    const gpu = await hasWebGPU();
    const models = [...(gpu ? [{ id: 'onnx-community/whisper-large-v3-turbo_timestamped', word: true, gpu: true, enc: 'fp16' }] : []),
      { id: 'onnx-community/whisper-small_timestamped', word: true }, { id: 'Xenova/whisper-small', word: false }, { id: 'onnx-community/whisper-base_timestamped', word: true }];
    const files = {};
    const onProgress = (p) => {
      if (p.status !== 'progress') return;
      files[p.file] = { l: p.loaded || 0, t: p.total || 0 };
      let l = 0, t = 0; for (const k in files) { l += files[k].l; t += files[k].t; }
      if (t) { bar.style.width = (l / t * 100).toFixed(1) + '%'; say(`Descargando modelo de IA… ${(l/1048576).toFixed(0)} / ${(t/1048576).toFixed(0)} MB`); }
    };
    const words = [];
    for (let k = 0; k < ranges.length; k++) {
      const [a0, a1] = ranges[k], tag = ranges.length > 1 ? ` (trozo ${k + 1} de ${ranges.length})` : '';
      say('Extrayendo el audio del clip…' + tag);
      await nextTick();
      const audio = await voiceAudio16k(a0, a1);
      const onStatus = (msg) => { say(msg + tag); if (msg.startsWith('Transcribiendo')) bar.style.width = '100%'; };
      // primero el reconocedor en internet (ElevenLabs Scribe): entiende mucho mejor y no se salta frases
      if (elReady()) {
        try { say('Escuchando el audio con ElevenLabs…' + tag); bar.style.width = '60%'; const ew = await elevenWords(audio, a0, $('lang').value);
          if (ew.length) { clipMeta.wordMode = 'word'; clipMeta.stt = 'elevenlabs'; words.push(...voiceSnap(cleanRepeats(ew.filter(w => w.end > w.start && w.start < a1 + 0.5)), audio, a0)); continue; }
        } catch (e) { console.warn('ElevenLabs', e); say('ElevenLabs no ha podido (' + (e.message || e) + '): uso la IA del ordenador…' + tag); }
      }
      let res;
      try { res = await runAI(trLoud(audio), models, $('lang').value, onProgress, onStatus, { no_repeat_ngram_size: 4, repetition_penalty: 1.1 }); }
      catch (e) { if (!getGemKey()) throw e; console.warn('IA de voz del navegador no disponible: solo Gemini', e); res = { chunks: [], mode: 'word' }; }   // sin la IA del navegador, Gemini lo hace solo
      clipMeta.wordMode = res.mode;
      let ws = cleanRepeats(chunksToWords(res.chunks, res.mode).map(w => ({ ...w, start: w.start + a0, end: w.end + a0 })).filter(w => w.end > w.start && w.start < a1 + 0.5));
      if (res.chunks.length) ws = await fillGaps(ws, audio, a0, models, onStatus);
      // Gemini escucha el mismo audio y corrige lo mal oído, lo inventado y lo que faltaba
      if (getGemKey()) try { ws = await geminiFixWords(ws, audio, a0, m => say(m)); } catch (e) { console.warn('Revisión de subtítulos', e); }
      words.push(...voiceSnap(ws, audio, a0));
    }
    allWords = words;
    if (!allWords.length) throw new Error('No se ha detectado voz en el clip');
    buildCaptions();
    say(`${captions.length} subtítulos generados. Puedes corregir cualquier texto abajo.`, 'ok');
    pushHistory(); return true;
  } catch (err) {
    console.error(err);
    say('Error: ' + err.message, 'err'); if (/descargar la IA/i.test(err.message)) voiceDown = Date.now(); return false;
  } finally {
    btn.disabled = false; barW.hidden = true;
  }
}
$('transcribe').onclick = async () => {
  const ok = await doTranscribe();
  if (ok) clipMeta.subR = srcRange();   // silenciar malas palabras ya no es automático: se hace desde su panel si quieres
};


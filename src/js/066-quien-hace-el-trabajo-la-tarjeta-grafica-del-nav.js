/* ---------- quién hace el trabajo: la tarjeta gráfica del navegador, el grabador del PC o (lento) el procesador ---------- */
let isoSess = null, isoSessEP = null;
async function isoModelBytes(say) {
  try { const c = await kv.get('model:vocft'); if (c && c.byteLength > 1e7) return c; } catch {}
  say('Descargando la IA de voz (66 MB, solo la primera vez)…');
  const r = await fetch(ISO_MODEL_URL); if (!r.ok) throw new Error('No se pudo descargar la IA de voz');
  const total = +r.headers.get('content-length') || 66759000, rd = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; say(`Descargando la IA de voz… ${Math.round(got / total * 100)} % (solo la primera vez)`); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { await kv.set('model:vocft', buf.buffer); } catch (e) { console.warn('No se pudo guardar la IA de voz', e); }
  return buf.buffer;
}
async function isoSession(ep, say) {
  if (isoSess && isoSessEP === ep) return isoSess;
  await loadScript(ISO_ORT_URL, 'ort');
  ort.env.wasm.wasmPaths = ISO_ORT_URL.replace(/[^/]+$/, '');
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  const bytes = await isoModelBytes(say);
  say('Preparando la IA de voz…');
  isoSess = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: [ep], graphOptimizationLevel: 'all' });
  isoSessEP = ep;
  return isoSess;
}
const isoRunSess = async (s, inp) => { const o = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', inp, [1, 4, MDX.F, MDX.T]) }); return o[s.outputNames[0]].data; };
function wavStereo16(L, R, rate) {
  const n = L.length, b = new ArrayBuffer(44 + n * 4), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  return b;
}
function wavParse16(ab) {
  const v = new DataView(ab); let o = 12, ch = 2, fmt16 = true;
  while (o + 8 <= ab.byteLength) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)), sz = v.getUint32(o + 4, true);
    if (id === 'fmt ') { ch = v.getUint16(o + 10, true); fmt16 = v.getUint16(o + 22, true) === 16; }
    if (id === 'data') {
      const n = Math.floor(sz / (2 * ch)), L = new Float32Array(n), R = new Float32Array(n);
      for (let i = 0, p = o + 8; i < n; i++, p += 2 * ch) { L[i] = v.getInt16(p, true) / 32768; R[i] = ch > 1 ? v.getInt16(p + 2, true) / 32768 : L[i]; }
      if (!fmt16) throw new Error('wav'); return [L, R];
    }
    o += 8 + sz + (sz & 1);
  }
  throw new Error('wav sin datos');
}
async function isoGrabador() {
  const dir = await getLiveDir(false); if (!dir) return null;
  const v = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
  if (!v || Date.now() / 1000 - v.t > 15 || (v.v || 0) < 10) return null;
  return async (L, R, onProg) => {
    const id = 'v' + Date.now().toString(36);
    const vz = await dir.getDirectoryHandle('voz', { create: true }), rq = await vz.getDirectoryHandle('req', { create: true });
    await wfile(rq, id + '.wav', wavStereo16(L, R, MDX.RATE));
    await wfile(rq, id + '.json', JSON.stringify({ wav: id + '.wav' }));
    const t0 = Date.now(); let o;
    for (;;) {
      await sleep(1000);
      o = JSON.parse(await rtext(dir, 'voz/out/' + id + '.json') || 'null');
      if (!o) { if (Date.now() - t0 > 90000) throw new Error('El grabador no responde'); continue; }
      if (o.status === 'error') throw new Error(o.error || 'el grabador no pudo');
      if (o.status === 'done') break;
      if (onProg) onProg(o.p || 0);
    }
    const res = wavParse16(await (await fileAt(dir, o.file)).arrayBuffer());
    try { const out = await subDir(dir, 'voz/out'); await out.removeEntry(id + '.wav'); await out.removeEntry(id + '.json'); } catch {}
    return res;
  };
}
async function isoRunner(say) {
  if (await hasWebGPU()) {
    try { const s = await isoSession('webgpu', say); return { name: 'tarjeta gráfica', sep: (L, R, p) => mdxSeparate(L, R, inp => isoRunSess(s, inp), p) }; }
    catch (e) { console.warn('IA de voz con WebGPU no disponible', e); }
  }
  const g = await isoGrabador().catch(() => null);
  if (g) return { name: 'Grabador Clipzi del PC', sep: g };
  const s = await isoSession('wasm', say);
  return { name: 'procesador (lento)', slow: true, sep: (L, R, p) => mdxSeparate(L, R, inp => isoRunSess(s, inp), p) };
}


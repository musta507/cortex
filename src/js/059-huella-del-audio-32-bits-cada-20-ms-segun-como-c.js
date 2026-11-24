/* ---------- huella del audio (32 bits cada 20 ms, según cómo cambia la energía entre 33 bandas de 300 a 2000 Hz) ---------- */
const FP_HOP = 0.02, FP_RATE = 8000, FP_WIN = 2048, FP_STEP = Math.round(FP_RATE * FP_HOP);
let fpPrep = null;
function fpSetup() {
  if (fpPrep) return fpPrep;
  const N = FP_WIN, win = new Float64Array(N), lg = Math.log2(N), rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lg; b++) r |= ((i >> b) & 1) << (lg - 1 - b); rev[i] = r; }
  const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / N); sinT[i] = -Math.sin(2 * Math.PI * i / N); }
  const ed = []; for (let i = 0; i < 34; i++) ed.push(300 * Math.pow(2000 / 300, i / 33));
  const band = new Int8Array(N / 2 + 1).fill(-1); let k0 = N, k1 = 0;
  for (let k = 0; k <= N / 2; k++) { const f = k * FP_RATE / N; for (let b = 0; b < 33; b++) if (f >= ed[b] && f < ed[b + 1]) { band[k] = b; k0 = Math.min(k0, k); k1 = Math.max(k1, k); break; } }
  const pc = new Uint8Array(65536); for (let i = 1; i < 65536; i++) pc[i] = pc[i >> 1] + (i & 1);
  fpPrep = { win, rev, cosT, sinT, band, k0, k1, pc, re: new Float64Array(N), im: new Float64Array(N) };
  return fpPrep;
}
function fpFFT(re, im, P) {
  const N = re.length, rev = P.rev, cs = P.cosT, sn = P.sinT;
  for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let i = 0; i < N; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
      const a = i + j, b = a + half, wr = cs[k], wi = sn[k];
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
function fpPush(E, st, out, idx) {
  let v = 0, sum = 0, mx = 0;
  for (let j = 0; j < 33; j++) { sum += E[j]; if (E[j] > mx) mx = E[j]; }
  const pv = st.prev;
  if (pv) for (let j = 0; j < 32; j++) if ((E[j] - E[j + 1]) - (pv[j] - pv[j + 1]) > 0) v |= 1 << j;
  out.bits[idx] = v >>> 0; out.en[idx] = sum; out.pk[idx] = sum > 0 ? mx / sum : 0;
  if (!st.prev) st.prev = new Float64Array(33);
  st.prev.set(E);
}
// cnt huellas de «a» (8 kHz) desde la muestra 0; dos ventanas por FFT (una en la parte real y otra en la imaginaria)
function fpFrames(a, cnt, st, out, off) {
  const P = fpSetup(), N = FP_WIN, re = P.re, im = P.im, win = P.win, band = P.band, k0 = P.k0, k1 = P.k1;
  const EA = new Float64Array(33), EB = new Float64Array(33), L = a.length;
  for (let t = 0; t < cnt; t += 2) {
    const oa = t * FP_STEP, ob = oa + FP_STEP, two = t + 1 < cnt;
    for (let i = 0; i < N; i++) { re[i] = oa + i < L ? a[oa + i] * win[i] : 0; im[i] = two && ob + i < L ? a[ob + i] * win[i] : 0; }
    fpFFT(re, im, P);
    EA.fill(0); EB.fill(0);
    for (let k = k0; k <= k1; k++) {
      const b = band[k]; if (b < 0) continue; const j = N - k;
      const ar = re[k] + re[j], ai = im[k] - im[j], br = im[k] + im[j], bi = re[j] - re[k];
      EA[b] += ar * ar + ai * ai; EB[b] += br * br + bi * bi;
    }
    fpPush(EA, st, out, off + t);
    if (two) fpPush(EB, st, out, off + t + 1);
  }
}
const fpAlloc = n => ({ n, bits: new Uint32Array(n), en: new Float32Array(n), pk: new Float32Array(n) });
function monoOf(buf) {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}
// huella de un archivo corto (el clip viral)
async function fpOfClip(f) {
  const a = monoOf(await decodeAudio(f, FP_RATE, 1));
  const n = Math.max(0, Math.floor((a.length - FP_WIN) / FP_STEP) + 1), out = fpAlloc(n);
  fpFrames(a, n, { prev: null }, out, 0);
  return out;
}
// huella de un archivo largo (el vídeo en crudo): por trozos de 5 min, sin cargarlo entero; se guarda para la próxima vez
const fpMem = new Map();
async function fpOfFile(f, onProg) {
  const id = 'fp:' + f.name + ':' + f.size + ':' + (f.lastModified || 0);
  if (fpMem.has(id)) return fpMem.get(id);
  try {
    const c = await kv.get(id);
    if (c && c.v === 1) { const r = { n: c.n, bits: new Uint32Array(c.bits), en: new Float32Array(c.en), pk: new Float32Array(c.pk) }; fpMem.set(id, r); return r; }
  } catch {}
  let D = 0, ranged = false;
  try {
    const M = await movieIndex(f); D = M.dur;
    ranged = !!(M.acfg && M.as.length && 'AudioDecoder' in window && (await AudioDecoder.isConfigSupported(M.acfg)).supported);
  } catch {}
  if (!D && f === file) D = vid.duration || 0;
  let out;
  if (ranged && D > 0) {
    const n = Math.floor(D / FP_HOP); out = fpAlloc(n);
    const st = { prev: null }, CH = 300;
    for (let s = 0, i = 0; s < D && i < n; s += CH) {
      const e = Math.min(D, s + CH), cnt = Math.min(n - i, Math.round((e - s) / FP_HOP));
      const a = (await decodeAudioRange(f, s, Math.min(D, e + 0.3), FP_RATE, 1)).getChannelData(0);
      fpFrames(a, cnt, st, out, i);
      i += cnt; if (onProg) onProg(e / D); await sleep(0);
    }
  } else {
    if (f.size > 1.2e9) throw new Error('No puedo leer el audio de este vídeo (pásalo a MP4)');
    if (onProg) onProg(0.05);
    const a = monoOf(await decodeAudio(f, FP_RATE, 1));
    const n = Math.max(0, Math.floor((a.length - FP_WIN) / FP_STEP) + 1); out = fpAlloc(n);
    const st = { prev: null }, CH = 15000;
    for (let i = 0; i < n; i += CH) { const cnt = Math.min(CH, n - i); fpFrames(a.subarray(i * FP_STEP), cnt, st, out, i); if (onProg) onProg((i + cnt) / n); await sleep(0); }
  }
  fpMem.set(id, out);
  try {
    let keys = (await kv.get('fpKeys')) || []; keys = [id, ...keys.filter(k => k !== id)];
    for (const old of keys.slice(4)) try { await kv.del(old); } catch {}
    await kv.set(id, { v: 1, n: out.n, bits: out.bits.buffer, en: out.en.buffer, pk: out.pk.buffer }); await kv.set('fpKeys', keys.slice(0, 4));
  } catch (e) { console.warn('No se pudo guardar la huella', e); }
  return out;
}


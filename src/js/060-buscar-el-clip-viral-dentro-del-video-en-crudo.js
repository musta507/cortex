/* ---------- buscar el clip viral dentro del vídeo en crudo ---------- */
// devuelve los trozos en el orden del clip viral: {c0, c1 (s en el clip viral), s, e (s en el crudo)}, cuánto se ha encontrado y los silencios copiados
async function fpMatch(R, C, onProg) {
  const P = fpSetup(), pc = P.pc, N = R.n, M = C.n, RB = R.bits, CB = C.bits;
  if (M < 75) throw new Error('SHORT');
  const srt = Float32Array.from(C.en).sort(), thr = Math.max(1e-9, srt[Math.floor(M * 0.3)] || 0);
  const voiced = new Uint8Array(M); let nv = 0;
  for (let t = 0; t < M; t++) if (C.en[t] > thr) { voiced[t] = 1; nv++; }
  if (nv < 50) throw new Error('SILENT');
  const rs = []; for (let i = 0; i < 4000; i++) rs.push(R.en[Math.floor(Math.random() * N)]);
  rs.sort((x, y) => x - y); const rawMid = rs[2000] || 0;
  const cands = [], where = [];   // desplazamientos encontrados y la ventana del clip donde se encontró cada uno
  const addCand = (o, st, W) => { if (cands.some(c => Math.abs(c - o) <= 3)) return false; cands.push(o); where.push([st, W]); return true; };
  // una ventana del clip: primero mira los sitios ya encontrados; si no encaja, recorre toda la grabación
  function scan(st, W) {
    const idx = []; for (let i = 0; i < W; i++) if (voiced[st + i]) idx.push(i);
    if (idx.length < 20) return null;
    const K = Math.min(48, idx.length), sel = new Int32Array(K), cv = new Uint32Array(K);
    for (let k = 0; k < K; k++) { sel[k] = idx[Math.floor(k * idx.length / K)]; cv[k] = CB[st + sel[k]]; }
    let bh = 1e9, bp = -1;
    for (const o of cands) for (let d = -3; d <= 3; d++) {
      const p = st + o + d; if (p < 0 || p + W > N) continue;
      let h = 0; for (let k = 0; k < K; k++) { const x = RB[p + sel[k]] ^ cv[k]; h += pc[x & 65535] + pc[x >>> 16]; }
      if (h < bh) { bh = h; bp = p; }
    }
    if (bp >= 0 && bh < K * 32 * 0.34) return bp - st;
    let s1 = 0, s2 = 0; bh = 1e9; bp = -1;
    const last = N - W;
    for (let p = 0; p <= last; p++) {
      let h = 0;
      for (let k = 0; k < K; k++) { const x = RB[p + sel[k]] ^ cv[k]; h += pc[x & 65535] + pc[x >>> 16]; }
      s1 += h; s2 += h * h;
      if (h < bh) { bh = h; bp = p; }
    }
    const cnt = last + 1; if (cnt < 10) return null;
    const mean = s1 / cnt, sd = Math.sqrt(Math.max(1, s2 / cnt - mean * mean)), z = (mean - bh) / sd;
    return z >= 7 ? bp - st : null;
  }
  const W = Math.min(250, M), wins = [];
  for (let st = 0; st + W <= M; st += 100) wins.push(st);
  if (wins[wins.length - 1] + W < M) wins.push(M - W);
  for (let i = 0; i < wins.length; i++) {
    const o = scan(wins[i], W); if (o != null) addCand(o, wins[i], W);
    if (onProg) onProg(0.85 * (i + 1) / wins.length); await sleep(0);
  }
  const simAt = (t, o) => { const p = t + o; if (p < 0 || p >= N) return -1; const x = RB[p] ^ CB[t]; return (32 - 2 * (pc[x & 65535] + pc[x >>> 16])) / 32; };
  // afinar cada sitio al fotograma exacto
  const refine = () => {
    for (let c = 0; c < cands.length; c++) {
      let best = -1e9, bo = cands[c];
      const [w0, wl] = where[c];
      for (let d = -4; d <= 4; d++) {
        const o = cands[c] + d; let s = 0, n = 0;
        for (let t = w0; t < w0 + wl; t++) if (voiced[t]) { const v = simAt(t, o); if (v > -1) { s += v; n++; } }
        if (n && s / n > best) { best = s / n; bo = o; }
      }
      cands[c] = bo;
    }
  };
  // Viterbi: a cada instante del clip viral le toca un sitio del crudo (o ninguno); cambiar de sitio cuesta
  const assign = () => {
    const K = cands.length, S = K + 1, th = 0.18, lam = 5;
    let sc = new Float64Array(S), ns = new Float64Array(S);
    const bpk = new Int16Array(M * S);
    for (let t = 0; t < M; t++) {
      let bj = 0; for (let j = 1; j < S; j++) if (sc[j] > sc[bj]) bj = j;
      const bv = sc[bj] - lam;
      for (let k = 0; k < S; k++) {
        let e = 0;
        if (k < K) { const p = t + cands[k]; e = p < 0 || p >= N ? -1 : voiced[t] ? simAt(t, cands[k]) - th : 0; }
        if (sc[k] >= bv) { ns[k] = sc[k] + e; bpk[t * S + k] = k; } else { ns[k] = bv + e; bpk[t * S + k] = bj; }
      }
      const tmp = sc; sc = ns; ns = tmp;
    }
    let k = 0; for (let j = 1; j < S; j++) if (sc[j] > sc[k]) k = j;
    const stt = new Int16Array(M);
    for (let t = M - 1; t >= 0; t--) { stt[t] = k; k = bpk[t * S + k]; }
    // tramos seguidos
    let runs = [];
    for (let t = 0; t < M;) { let u = t; while (u < M && stt[u] === stt[t]) u++; runs.push({ k: stt[t] < K ? stt[t] : -1, t0: t, t1: u }); t = u; }
    const join = () => { const r2 = []; for (const r of runs) { const l = r2[r2.length - 1]; if (l && l.k === r.k) l.t1 = r.t1; else r2.push({ ...r }); } runs = r2; };
    runs.forEach(r => { if (r.k >= 0 && r.t1 - r.t0 < 12) r.k = -1; }); join();
    // un hueco corto entre dos tramos del mismo sitio (una palabra silenciada, un efecto) es el mismo trozo
    for (let i = 1; i < runs.length - 1; i++) if (runs[i].k < 0 && runs[i - 1].k >= 0 && runs[i - 1].k === runs[i + 1].k && runs[i].t1 - runs[i].t0 <= 100) runs[i].k = runs[i - 1].k;
    join();
    return runs;
  };
  if (!cands.length) throw new Error('NOFOUND');
  refine();
  let runs = assign();
  // trozos cortos que no salieron (un adelanto de 2 s al principio, por ejemplo): se buscan solos
  for (let pass = 0; pass < 2; pass++) {
    let added = false;
    for (const r of runs) if (r.k < 0 && r.t1 - r.t0 >= 40) {
      const len = r.t1 - r.t0, w = Math.min(len, 120), starts = new Set([r.t0, r.t1 - w, r.t0 + ((len - w) >> 1)]);
      if (len > 250) for (let x = r.t0; x + w <= r.t1; x += 100) starts.add(x);
      for (const x of starts) {
        const o = scan(x, w);
        if (o != null && addCand(o, x, w)) added = true;
        await sleep(0);
      }
    }
    if (!added) break;
    refine(); runs = assign();
  }
  if (onProg) onProg(1);
  let mv = 0; for (const r of runs) if (r.k >= 0) for (let t = r.t0; t < r.t1; t++) mv += voiced[t];
  const WS = FP_WIN / FP_RATE, bound = t => t <= 0 ? 0 : t >= M ? (M - 1) * FP_HOP + WS : t * FP_HOP + WS / 2;
  const pieces = runs.filter(r => r.k >= 0).map(r => { const o = cands[r.k] * FP_HOP, c0 = bound(r.t0), c1 = bound(r.t1); return { c0, c1, s: Math.max(0, c0 + o), e: Math.min(N * FP_HOP + WS, c1 + o), o }; });
  const gaps = runs.filter(r => r.k < 0 && r.t1 - r.t0 >= 25).map(r => ({ c0: bound(r.t0), c1: bound(r.t1) }));
  // palabras silenciadas o pitadas en el clip viral: donde el crudo tiene voz y el viral está callado (o suena un pitido)
  const mutesOut = [];
  for (const r of runs) if (r.k >= 0) {
    const o = cands[r.k], dB = [], ren = [];
    for (let t = r.t0; t < r.t1; t++) { const p = t + o; if (p < 0 || p >= N) continue; ren.push(R.en[p]); if (voiced[t]) dB.push(10 * Math.log10((C.en[t] + 1e-12) / (R.en[p] + 1e-12))); }
    if (dB.length < 20) continue;
    dB.sort((x, y) => x - y); ren.sort((x, y) => x - y);
    const g = dB[dB.length >> 1], speech = ren[Math.floor(ren.length * 0.4)];
    let t = r.t0;
    while (t < r.t1) {
      const hit = u => { const p = u + o; if (p < 0 || p >= N || R.en[p] <= speech) return false; const d = 10 * Math.log10((C.en[u] + 1e-12) / (R.en[p] + 1e-12)) - g; return d < -14 || (C.pk[u] > 0.5 && R.pk[p] < 0.35); };
      if (!hit(t)) { t++; continue; }
      let u = t; while (u < r.t1 && (hit(u) || (u + 1 < r.t1 && hit(u + 1)) || (u + 2 < r.t1 && hit(u + 2)))) u++;
      if (u - t >= 5 && u - t <= 125) mutesOut.push({ s: (t + o) * FP_HOP - 0.02, e: (u - 1 + o) * FP_HOP + FP_WIN / FP_RATE + 0.02 });
      t = u + 1;
    }
  }
  return { pieces, gaps, cover: mv / nv, mutes: mutesOut };
}


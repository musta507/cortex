/* ---------- panel de la izquierda (modo fácil): réplica y variantes ---------- */
function renderSide() {
  const box = $('ezSide'); if (!box) return;
  box.innerHTML = '';
  if (!loaded) return;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const R = clipMeta.replica;
  if (R) {
    const sec = el('div', 'sd-sec');
    const h = el('div', 'fl-h'); h.append(el('strong', null, '🧬 Réplica'), el('span', 'hint', R.from || '')); sec.append(h);
    if (R.busy) sec.append(el('p', 'hint', '⏳ Replicando…'));
    else if (R.fail) sec.append(el('p', 'hint sd-bad', R.fail));
    else {
      sec.append(el('p', 'hint', `Encontrado el ${Math.round(R.cover * 100)} % del clip viral en ${R.pieces.length} trozo${R.pieces.length > 1 ? 's' : ''}${R.nMutes ? ` · ${R.nMutes} silencio${R.nMutes > 1 ? 's' : ''} copiado${R.nMutes > 1 ? 's' : ''}` : ''}.`));
      const list = el('div', 'sd-list');
      let acc = 0;
      R.pieces.forEach((p, i) => {
        const b = el('button', 'sd-row'), T = acc; acc += p.e - p.s;
        b.append(el('b', null, `${i + 1}. ${fmtS(p.s)} → ${fmtS(p.e)}`), el('span', null, `${(p.e - p.s).toFixed(1)} s del crudo`));
        b.title = 'Ir a este trozo'; b.onclick = () => seekOut(Math.min(totalDur(), T + 0.05));
        list.append(b);
      });
      sec.append(list);
      if (R.gaps && R.gaps.length) sec.append(el('p', 'hint', 'Partes del viral que no están en el crudo (seguramente añadidas por el clipper): ' + R.gaps.map(g => `${fmtS(g.c0)}–${fmtS(g.c1)}`).join(', ')));
      if (R.notes && R.notes.length) sec.append(el('p', 'hint', 'No se ha podido copiar: ' + R.notes.join(' · ')));
    }
    if (repQueue.length) { const nx = el('button', 'primary', `Siguiente clip viral (${repTotal - repQueue.length + 1} de ${repTotal}) →`); nx.onclick = repNext; sec.append(nx); }
    box.append(sec);
  }
  {
    const vs = el('div', 'sd-sec');
    const h = el('div', 'fl-h'); h.append(el('strong', null, '🎙️ Aislar la voz')); vs.append(h);
    if (isoBusy) vs.append(el('p', 'hint', '⏳ Separando la voz…'));
    else if (isoOn()) {
      const miss = isoMissing().length;
      vs.append(el('p', 'hint', miss ? 'Hay partes nuevas del clip sin aislar.' : 'Solo se oye la voz: sin música ni sonido de fondo.'));
      const lab = el('label', 'f'); lab.textContent = 'Fondo: ';
      const val = el('span', 'val', Math.round(clipMeta.iso.lvl || 0) + ' %'); lab.append(val);
      const rg = document.createElement('input'); rg.type = 'range'; rg.min = 0; rg.max = 60; rg.step = 5; rg.value = clipMeta.iso.lvl || 0;
      rg.oninput = () => { clipMeta.iso.lvl = +rg.value; val.textContent = rg.value + ' %'; isoStop(); };
      rg.onchange = () => pushHistory();
      lab.append(rg); vs.append(lab);
      const tools = el('div', 'fl-tools');
      if (miss) { const b = el('button', 'primary', '🎙️ Aislar lo que falta'); b.onclick = () => isoRun(); tools.append(b); }
      const off = el('button', null, 'Quitar'); off.onclick = () => isoSet(false); tools.append(off);
      vs.append(tools);
    } else {
      vs.append(el('p', 'hint', 'Quita la música y el sonido de fondo y deja solo la voz (como en CapCut). Gratis: la IA trabaja en tu ordenador.'));
      const b = el('button', 'primary', '🎙️ Aislar la voz'); b.onclick = () => clipMeta.iso ? isoSet(true) : isoRun(); vs.append(b);
    }
    box.append(vs);
  }
  const sec = el('div', 'sd-sec sd-var');
  const h = el('div', 'fl-h'); h.append(el('strong', null, '🧪 Ganchos y estructuras')); sec.append(h);
  const V = clipMeta.variants;
  if (V && V.length) {
    sec.append(el('p', 'hint', 'Pulsa una versión para verla. Lo que cambies se guarda en esa versión.'));
    const list = el('div', 'sd-list');
    V.forEach((v, i) => {
      const b = el('button', 'sd-row' + (i === (clipMeta.varCur || 0) ? ' on' : ''));
      b.append(el('b', null, `${i === 0 ? '★' : i + '.'} ${v.name} · ${Math.round(v.dur || 0)} s`), el('span', null, v.title || ''), v.why ? el('em', null, v.why) : '');
      b.onclick = () => applyVariant(i);
      list.append(b);
    });
    sec.append(list);
    const tools = el('div', 'fl-tools');
    const again = el('button', null, '↻ Otras ideas'); again.onclick = () => { const keep = clipMeta.varCur || 0; if (keep) applyVariant(0, true); ezVariants(); };
    const ex = el('button', 'primary', '⤓ Exportar todas'); ex.onclick = exportVariants;
    tools.append(again, ex); sec.append(tools);
  } else {
    sec.append(el('p', 'hint', 'La IA monta varias versiones de este clip con otro gancho, otro principio, otro final o más corto, para subirlas y ver cuál funciona mejor.'));
    const row = el('div', 'fl-tools');
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Cuántas versiones');
    for (const k of [3, 5]) { const o = document.createElement('option'); o.value = k; o.textContent = k + ' versiones'; sel.append(o); }
    try { sel.value = localStorage.getItem('clipzi-nvar') || '3'; } catch {}
    sel.onchange = () => { try { localStorage.setItem('clipzi-nvar', sel.value); } catch {} };
    const go = el('button', 'primary', '🧪 Probar variantes'); go.onclick = () => ezVariants(+sel.value);
    row.append(sel, go); sec.append(row);
  }
  box.append(sec);
}

/* descargar un enlace con el Grabador Clipzi del PC (YouTube, Kick, Twitch, TikTok…) → {file, handle, title} */
async function grabFetch(url, from, to, say, opts) {
@@solo-web
  if (CORTEX_PROXY) return webFetch(url, from, to, say);
@@fin
  let dir = await getLiveDir(true);
  if (!dir) { toast('Elige la carpeta del Grabador Clipzi'); dir = await pickLiveDir(); if (!dir) throw new Error('falta la carpeta del grabador'); }
  try { await writeGrabadorFiles(); } catch {}
  const viv = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
  if (!viv || Date.now() / 1000 - viv.t > 15) {
    say('Abre el Grabador Clipzi: en su carpeta, doble clic en «Grabador Clipzi.bat» y deja la ventana abierta. Yo espero…', 0);
    for (let i = 0; ; i++) {
      await sleep(2000);
      const v = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
      if (v && Date.now() / 1000 - v.t < 15) break;
      if (i >= 299) throw new Error('El grabador no se ha abierto');
    }
  }
  { const v0 = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
    if (v0 && (v0.v || 0) < 25) {   // el grabador abierto es de antes: hay que reabrirlo para que use la versión nueva
      say('Hay una versión nueva del Grabador Clipzi: cierra su ventana negra y vuelve a abrir «Grabador Clipzi.bat». Yo espero…', 0);
      for (let i = 0; ; i++) {
        await sleep(2000);
        const v = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
        if (v && (v.v || 0) >= 25 && Date.now() / 1000 - v.t < 15) break;
        if (i >= 299) throw new Error('El grabador no se ha vuelto a abrir');
      }
    } }
  const id = 'l' + Date.now().toString(36);
  const dd = await dir.getDirectoryHandle('descargas', { create: true });
  const rq = await dd.getDirectoryHandle('req', { create: true });
  await wfile(rq, id + '.json', JSON.stringify({ url, from: from || null, to: to || null, ...(opts || {}) }));
  say('Descargando el vídeo…', 0);
  let o = null; const t0 = Date.now();
  for (;;) {
    await sleep(1500);
    o = JSON.parse(await rtext(dir, 'descargas/out/' + id + '.json') || 'null');
    if (!o) { if (Date.now() - t0 > 60000) throw new Error('El grabador no responde. ¿Está abierta su ventana?'); continue; }
    if (o.status === 'error') { const er = new Error(o.error || 'no se pudo descargar'); er.auth = !!o.auth; throw er; }
    if (o.status === 'done') break;
    say(`Descargando el vídeo… ${Math.round((o.p || 0) * 100)} %`, o.p || 0);
  }
  const h = await handleAt(dir, o.file), f = await h.getFile();
  return { file: f, handle: h, title: o.title || '', out: o };
}


/* ==================== AISLAR LA VOZ (quitar música y sonido de fondo) ====================
   Modelo libre UVR-MDX-NET Voc_FT (licencia MIT) que corre en tu ordenador con onnxruntime-web.
   El clip se pasa a espectrograma (STFT de 7680 puntos), la IA se queda con la voz y se vuelve a audio. */
const ISO_MODEL_URL = 'https://huggingface.co/Politrees/UVR_resources/resolve/main/models/MDXNet/UVR-MDX-NET-Voc_FT.onnx';
const ISO_ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.js';
const MDX = { N: 7680, HOP: 1024, F: 3072, T: 256, COMP: 1.021, RATE: 44100 };
MDX.CH = MDX.HOP * (MDX.T - 1); MDX.TRIM = MDX.N / 2; MDX.GEN = MDX.CH - 2 * MDX.TRIM;

// FFT de base mixta (2, 3, 5) para tamaños como 7680 = 2^9·3·5
function fftPlan(N) {
  const f = []; let n = N;
  for (const p of [5, 3, 2]) while (n % p === 0) { f.push(p); n /= p; }
  if (n !== 1) throw new Error('fft: tamaño no soportado');
  f.reverse();
  const cs = new Float64Array(N), sn = new Float64Array(N);
  for (let j = 0; j < N; j++) { cs[j] = Math.cos(2 * Math.PI * j / N); sn[j] = -Math.sin(2 * Math.PI * j / N); }
  return { N, f, cs, sn, tr: new Float64Array(5), ti: new Float64Array(5) };
}
function fftRec(P, N, fi, xr, xi, io, st, yr, yi, oo) {
  if (N === 1) { yr[oo] = xr[io]; yi[oo] = xi[io]; return; }
  const p = P.f[fi], m = N / p, NT = P.N, step = NT / N, cs = P.cs, sn = P.sn, tr = P.tr, ti = P.ti;
  for (let q = 0; q < p; q++) fftRec(P, m, fi + 1, xr, xi, io + q * st, st * p, yr, yi, oo + q * m);
  const sp = NT / p;
  for (let k = 0; k < m; k++) {
    for (let q = 0; q < p; q++) {
      const a = oo + q * m + k, w = (q * k * step) % NT, c = cs[w], s = sn[w];
      tr[q] = yr[a] * c - yi[a] * s; ti[q] = yr[a] * s + yi[a] * c;
    }
    if (p === 2) {
      const a = oo + k, b = a + m;
      yr[a] = tr[0] + tr[1]; yi[a] = ti[0] + ti[1]; yr[b] = tr[0] - tr[1]; yi[b] = ti[0] - ti[1];
    } else {
      for (let r = 0; r < p; r++) {
        let sr = 0, si = 0;
        for (let q = 0; q < p; q++) { const w = ((r * q) % p) * sp, c = cs[w], s = sn[w]; sr += tr[q] * c - ti[q] * s; si += tr[q] * s + ti[q] * c; }
        yr[oo + r * m + k] = sr; yi[oo + r * m + k] = si;
      }
    }
  }
}
function fftC(P, xr, xi, yr, yi) { fftRec(P, P.N, 0, xr, xi, 0, 1, yr, yi, 0); }

let mdxPrep = null;
function mdxSetup() {
  if (mdxPrep) return mdxPrep;
  const { N, HOP, T, CH } = MDX, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);   // Hann periódica (como torch)
  // suma de ventanas² que cae en cada muestra del trozo (para deshacer el solapamiento)
  const env = new Float64Array(CH);
  for (let t = 0; t < T; t++) for (let j = 0; j < N; j++) { const x = t * HOP + j - N / 2; if (x >= 0 && x < CH) env[x] += win[j] * win[j]; }
  mdxPrep = { P: fftPlan(N), win, env, xr: new Float64Array(N), xi: new Float64Array(N), yr: new Float64Array(N), yi: new Float64Array(N) };
  return mdxPrep;
}
// STFT de un trozo estéreo (L y R van juntos en una sola FFT compleja) → entrada del modelo [4, F, T]
function mdxStft(L, R, off, inp) {
  const { N, HOP, F, T, CH } = MDX, M = mdxSetup(), { P, win, xr, xi, yr, yi } = M, h = N / 2;
  const at = (a, j) => { let x = j; if (x < 0) x = -x; if (x >= CH) x = 2 * (CH - 1) - x; return a[off + x] || 0; };   // reflejo en los bordes
  for (let t = 0; t < T; t++) {
    const c = t * HOP - h;
    for (let j = 0; j < N; j++) { xr[j] = at(L, c + j) * win[j]; xi[j] = at(R, c + j) * win[j]; }
    fftC(P, xr, xi, yr, yi);
    for (let k = 0; k < F; k++) {
      const n = k ? N - k : 0, ar = yr[k], ai = yi[k], br = yr[n], bi = yi[n];
      inp[(0 * F + k) * T + t] = (ar + br) / 2; inp[(1 * F + k) * T + t] = (ai - bi) / 2;     // canal izquierdo
      inp[(2 * F + k) * T + t] = (ai + bi) / 2; inp[(3 * F + k) * T + t] = (br - ar) / 2;     // canal derecho
    }
  }
}
// ISTFT de la salida del modelo → dos canales de CH muestras (se suman en oL/oR desde la posición «at», sin los bordes)
function mdxIstft(out, oL, oR, at, keep0, keep1) {
  const { N, HOP, F, T, CH } = MDX, M = mdxSetup(), { P, win, env, xr, xi, yr, yi } = M, h = N / 2;
  const accL = new Float64Array(CH), accR = new Float64Array(CH);
  for (let t = 0; t < T; t++) {
    xr.fill(0); xi.fill(0);
    for (let k = 0; k < F; k++) {
      const lr = out[(0 * F + k) * T + t], li = out[(1 * F + k) * T + t], rr = out[(2 * F + k) * T + t], ri = out[(3 * F + k) * T + t];
      // Z = XL + i·XR, y su simétrico conjugado; luego IFFT = conj(FFT(conj(Z)))/N
      xr[k] = lr - ri; xi[k] = -(li + rr);
      if (k) { const n = N - k; xr[n] = lr + ri; xi[n] = -(-li + rr); }
    }
    fftC(P, xr, xi, yr, yi);
    const c = t * HOP - h;
    for (let j = 0; j < N; j++) { const x = c + j; if (x < 0 || x >= CH) continue; accL[x] += yr[j] / N * win[j]; accR[x] += -yi[j] / N * win[j]; }
  }
  for (let x = keep0; x < keep1; x++) { const e = env[x] > 1e-8 ? env[x] : 1e-8; oL[at + x - keep0] = accL[x] / e * MDX.COMP; oR[at + x - keep0] = accR[x] / e * MDX.COMP; }
}
// separa la voz de un audio estéreo a 44,1 kHz. run(inp) = la IA (devuelve la salida [4, F, T])
async function mdxSeparate(L, R, run, onProg) {
  const { CH, TRIM, GEN, F, T } = MDX, n = L.length, pad = GEN - (n % GEN), tot = TRIM + n + pad + TRIM;
  const pL = new Float32Array(tot), pR = new Float32Array(tot); pL.set(L, TRIM); pR.set(R, TRIM);
  const vL = new Float32Array(n + pad), vR = new Float32Array(n + pad), inp = new Float32Array(4 * F * T);
  const steps = (n + pad) / GEN;
  for (let i = 0, s = 0; i < n + pad; i += GEN, s++) {
    mdxStft(pL, pR, i, inp);
    const out = await run(inp);
    mdxIstft(out, vL, vR, i, TRIM, CH - TRIM);
    if (onProg) onProg((s + 1) / steps);
  }
  return [vL.subarray(0, n), vR.subarray(0, n)];
}


/* ---------- seguimiento de cara (plantilla Podcast: cámara completa) ---------- */
function trackAt(tr, t) {
  const p = tr.p; if (t <= p[0][0]) return p[0][1]; if (t >= p[p.length - 1][0]) return p[p.length - 1][1];
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= t) lo = m; else hi = m; }
  const a = p[lo], b = p[hi], k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]), e = k * k * (3 - 2 * k);   // paso suave entre muestras
  return a[1] + (b[1] - a[1]) * e;
}
// de las posiciones de la cara a un movimiento de cámara tranquilo
function smoothTrack(raw, zoom) {
  const xs = raw.map(r => r[1]); let last = xs.find(x => x != null);
  if (last == null) return null;
  for (let i = 0; i < xs.length; i++) { if (xs[i] == null) xs[i] = last; else last = xs[i]; }   // sin cara: se queda donde estaba
  const vf = 1 / Math.max(1, zoom), dz = vf * 0.16;   // zona muerta: pequeños movimientos no mueven el encuadre
  let cam = xs[0]; const tg = [];
  for (const x of xs) { if (x > cam + dz) cam = x - dz * 0.4; else if (x < cam - dz) cam = x + dz * 0.4; tg.push(cam); }
  const a = 0.5, f = tg.slice(), out = tg.slice();
  for (let i = 1; i < f.length; i++) f[i] = f[i - 1] + (tg[i] - f[i - 1]) * a;            // ida
  out[out.length - 1] = f[f.length - 1];
  for (let i = f.length - 2; i >= 0; i--) out[i] = out[i + 1] + (f[i] - out[i + 1]) * a;   // vuelta (sin retraso)
  return raw.map((r, i) => [+r[0].toFixed(3), +out[i].toFixed(4)]);
}
let tracking = false;
async function faceTrack(quiet) {
  if (!loaded || tracking) return false;
  const [a, b] = srcRange(); if (!(b > a)) return false;
  tracking = true;
  const T = 'Siguiendo la cara';
  try {
    aiov('work', T, 'Cargando el detector de caras…');
    await loadFaceApi();
    const tv = document.createElement('video'); tv.muted = true; tv.preload = 'auto'; tv.src = vid.src;
    await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = () => rej(new Error('vídeo')); });
    const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * tv.videoHeight / tv.videoWidth);
    const cx = c.getContext('2d', { willReadFrequently: true });
    const opt = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 6 });
    const step = Math.max(0.5, (b - a) / 90), raw = [];
    let prev = null, found = 0;
    for (let t = a; t <= b + 1e-3; t += step) {
      await tvSeek(tv, Math.min(b - 0.03, t));
      cx.drawImage(tv, 0, 0, c.width, c.height);
      const d = await faceapi.detectAllFaces(c, opt);
      let x = null;
      if (d.length) {
        const area = q => q.box.width * q.box.height, big = Math.max(...d.map(area));
        const cand = d.filter(q => area(q) >= big * 0.45).map(q => (q.box.x + q.box.width / 2) / c.width);
        // la persona principal: la cara grande más cercana a donde estaba
        x = prev == null ? (q => (q.box.x + q.box.width / 2) / c.width)(d.reduce((m, q) => area(q) > area(m) ? q : m)) : cand.reduce((m, q) => Math.abs(q - prev) < Math.abs(m - prev) ? q : m);
        prev = x; found++;
      }
      raw.push([t, x]);
      aiov('work', T, `Mirando dónde está la cara… ${Math.min(100, Math.round((t - a) / (b - a) * 100))} %`);
    }
    tv.removeAttribute('src'); tv.load();
    const p = found >= Math.max(2, raw.length * 0.2) ? smoothTrack(raw, +$('zoom').value / 100) : null;
    if (!p) { aiov('hide'); if (!quiet) toast('No he visto bien la cara: el encuadre se queda fijo'); return false; }
    clipMeta.track = { on: true, r: [a, b], p };
    pushHistory();
    await aiovDone(true, 'Cara seguida', 'El encuadre sigue a la persona');
    return true;
  } catch (e) {
    console.warn('Seguimiento de cara', e); aiov('hide');
    if (!quiet) toast('No se pudo seguir la cara' + (/descarg|fetch|load/i.test(e.message) ? ': hace falta internet la primera vez' : ''));
    return false;
  } finally { tracking = false; }
}
async function toggleTrack() {
  const tr = clipMeta.track, [a, b] = srcRange();
  if (tr && tr.on) { tr.on = false; pushHistory(); toast('Encuadre fijo'); return; }
  if (tr && tr.p && tr.r && a >= tr.r[0] - 0.3 && b <= tr.r[1] + 0.3) { tr.on = true; pushHistory(); toast('Siguiendo la cara'); return; }
  await faceTrack();
}
// si cambia la duración y el clip llega a partes sin analizar, se vuelve a mirar
async function retrackIfNeeded() {
  const tr = clipMeta.track; if (!tr || !tr.on) return;
  const [a, b] = srcRange(); if (a < tr.r[0] - 0.3 || b > tr.r[1] + 0.3) await faceTrack(true);
}



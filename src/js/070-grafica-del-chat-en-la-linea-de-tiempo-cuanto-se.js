/* ---------- gráfica del chat en la línea de tiempo: cuánto se mueve respecto a lo normal (×1) ----------
   Solo cuenta las horas de los mensajes (no guarda textos), solo lo nuevo de cada vez, y solo en «Pantalla». */
const CG = { st: {}, busy: false };
async function cgRead(S) {
  const st = CG.st[S.name] = CG.st[S.name] || { off: -1, skip: false, bins: new Map() };
  let f; try { f = await fileAt(S.h, 'chat.jsonl'); } catch { return; }
  if (st.off < 0 || f.size < st.off || f.size - st.off > 3e6) { st.off = Math.max(0, f.size - 500000); st.skip = st.off > 0; if (f.size < st.off) st.bins.clear(); }
  if (f.size <= st.off) return;
  const buf = new Uint8Array(await f.slice(st.off, f.size).arrayBuffer());
  const end = buf.lastIndexOf(10); if (end < 0) return;
  let start = 0; if (st.skip) { start = buf.indexOf(10) + 1; st.skip = false; }
  st.off += end + 1; if (start >= end) return;
  const re = /"t": ?([\d.]+)/g, txt = new TextDecoder().decode(buf.subarray(start, end)); let x;
  while ((x = re.exec(txt))) { const b = Math.floor(+x[1] / 5); st.bins.set(b, (st.bins.get(b) || 0) + 1); }
  const old = Math.floor(Date.now() / 5000) - 200; for (const k of st.bins.keys()) if (k < old) st.bins.delete(k);   // se guardan unos 16 minutos
}
setInterval(async () => {
  if (CG.busy || !stOn() || $('livePage').hidden || document.hidden || critOff().has('chat')) return;
  const S = lvTrSess(); if (!S || !S.on) return;
  CG.busy = true; try { await cgRead(S); } catch (e) { console.warn('gráfica del chat', e); } finally { CG.busy = false; }
}, 2000);
function stGraphDraw(S, a, ref) {
  const P = $('stGraphP'), A = $('stGraphA'), L = $('stGraphL'); if (!P) return;
  const st = S && CG.st[S.name], clear = () => { if (P.getAttribute('d')) { P.setAttribute('d', ''); A.setAttribute('d', ''); } if (L.childElementCount) L.innerHTML = ''; };
  if (!st || !st.bins.size || critOff().has('chat')) return clear();
  // lo normal: la mediana de los tramos de 5 s con mensajes (igual que el grabador); se recalcula cuando llegan mensajes
  const nowB = Math.floor(Date.now() / 5000);
  if (st.baseAt !== st.off + '|' + nowB) { st.baseAt = st.off + '|' + nowB; const nz = [...st.bins.entries()].filter(([k, n]) => k < nowB && n > 0).map(e => e[1]).sort((x, y) => x - y); st.nz = nz.length; st.base = Math.max(1, nz[nz.length >> 1] || 1); }
  if (st.nz < 6) return clear();
  // cada tramo sube o baja poco a poco hasta su valor (sin saltos)
  const disp = st.disp = st.disp || new Map(), pts = [];
  for (let b = Math.floor(a / 5) - 2; b < nowB && b * 5 < ref + 10; b++) {
    const v = (st.bins.get(b) || 0) / st.base, d0 = disp.get(b), d = d0 == null ? (disp.size ? 0 : v) : d0 + (v - d0) * 0.12;
    disp.set(b, d); pts.push([b * 5 + 2.5, v, d]);
  }
  if (disp.size > 400) { const old = Math.floor(a / 5) - 4; for (const k of disp.keys()) if (k < old) disp.delete(k); }
  if (pts.length < 3) return clear();
  for (let i = 0; i < pts.length; i++) pts[i][3] = ((pts[i - 1] || pts[i])[2] + 2 * pts[i][2] + (pts[i + 1] || pts[i])[2]) / 4;
  const want = Math.max(3, ...pts.map(p => p[3])); st.top = st.top ? st.top + (want - st.top) * 0.08 : want;   // la escala también cambia suave
  const X = t => (t - a) / ST_W * 1000, Y = v => 97 - Math.min(1, v / st.top) * 66, q = pts.map(p => [X(p[0]), Y(p[3])]);
  let d = 'M' + q[0][0].toFixed(1) + ' ' + q[0][1].toFixed(2);   // curva suave que pasa por todos los puntos
  for (let i = 0; i < q.length - 1; i++) {
    const p0 = q[i - 1] || q[i], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2] || p2;
    d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(2);
  }
  P.setAttribute('d', d); A.setAttribute('d', d + `L${q[q.length - 1][0].toFixed(1)} 100L${q[0][0].toFixed(1)} 100Z`);
  // un número discreto en los picos (×2 o más)
  const pk = []; for (let i = 1; i < pts.length - 1; i++) if (pts[i][1] >= 2 && pts[i][3] >= pts[i - 1][3] && pts[i][3] > pts[i + 1][3] && pts[i][0] > a + 4 && pts[i][0] < ref - 2) pk.push(pts[i]);
  pk.sort((x, y) => y[1] - x[1]); const keep = []; for (const p of pk) if (keep.length < 4 && !keep.some(k => Math.abs(k[0] - p[0]) < 14)) keep.push(p);
  keep.sort((x, y) => x[0] - y[0]);
  while (L.childElementCount > keep.length) L.lastChild.remove();
  while (L.childElementCount < keep.length) L.append(document.createElement('span'));
  keep.forEach((p, i) => { const s = L.children[i], t = fmtX(p[1]); if (s.textContent !== t) s.textContent = t; s.style.left = Math.min(97, Math.max(3, X(p[0]) / 10)).toFixed(2) + '%'; s.style.top = Math.max(26, Y(p[3]) - 3).toFixed(1) + '%'; });
}
// la gráfica se mueve fotograma a fotograma (unas 30 veces por segundo) para que deslice sin tirones
// (solo en «Pantalla»: en el resto de la web no se despierta más que dos veces por segundo para mirar si hace falta)
{ let last = 0;
  const step = () => { let on = false; try { on = stOn() && !$('livePage').hidden && !document.hidden; } catch {} if (on) requestAnimationFrame(loop); else setTimeout(step, 500); };
  const loop = ts => {
    if (ts - last >= 32) { last = ts; try { if (!stDrag) { const S = lvTrSess(); if (!S || !S.on) stGraphDraw(null); else { const ref = stRef(); stGraphDraw(S, ref - ST_W, ref); } } } catch {} }
    step();
  };
  step(); }
function stTick() {
  if (!stOn() || $('livePage').hidden) return;
  const S = lvTrSess(), box = $('stItems'); if (!box) return;
  if (!S || !S.on) { box.innerHTML = ''; if (!stBusy) $('stS').textContent = S ? 'Este directo ya terminó: para sacar clips de él usa «📝 Transcripción».' : 'No hay ningún directo grabándose ahora mismo.'; $('stDet').hidden = true; return; }
  if (stDrag) return;   // mientras arrastras la marca, la línea de tiempo se queda quieta
  const ref = stRef(), a = ref - ST_W, px = t => ((t - a) / ST_W * 100);
  let h = '';
  for (let t = Math.ceil(a / 10) * 10; t < ref; t += 10) h += `<span class="st-tick" style="left:${px(t).toFixed(2)}%">${t % 30 === 0 ? clockOf(t - S.status.started) : ''}</span>`;
  if (stMarkAt != null) { const l = Math.max(0, px(stMarkAt)); h += `<span class="st-fzone" style="left:${l.toFixed(2)}%"></span>`; }
  stFlagUI(ref);
  box.innerHTML = h;
  { const on = stMarkAt != null, d = on ? ref - stMarkAt : 0; $('stMarkCut').hidden = $('stMarkX').hidden = !on; $('stMark').textContent = on ? '📍 Mover la marca aquí' : '📍 Marcar inicio';
    if (on) { $('stMarkCut').textContent = `✂️ Sacar desde la marca (${Math.round(d)} s)`; $('stMarkT').textContent = d > 180 ? 'La marca es de hace más de 3 min: el clip saldrá largo.' : ''; } else $('stMarkT').textContent = 'Cuando empiece algo bueno, marca el inicio (tecla M) y sácalo cuando acabe.'; }
  const cOff = critOff(), ms = (S.moments || []).filter(m => m.t1 > a && m.t0 < ref + 5 && !liveHidden.has(m.id) && !cOff.has(m.src));
  for (const m of ms) {
    const l = Math.max(0, px(m.t0)), r = Math.min(100, px(m.t1)); if (r <= l) continue;
    const b = document.createElement('button'); b.className = 'st-m'; b.style.left = l + '%'; b.style.width = (r - l) + '%'; b.style.background = ST_COL[m.src] || '#fff';
    b.textContent = m.src === 'chat' ? 'Chat ' + fmtX(chatX(m)) : (m.info || m.src); b.title = (m.info || m.src) + ' · pulsa para sacar este momento';
    b.onclick = () => stCut(m); box.append(b);
  }
  // aviso de momento detectado (el más reciente que aún no has abierto)
  const now = Date.now() / 1000, det = ms.filter(m => m.src !== 'agente' && !stSeen.has(m.id) && now - (m.at || m.t1) < 75).sort((x, y) => (y.at || y.t1) - (x.at || x.t1))[0];
  stDetM = det || null; $('stDet').hidden = true;   // aviso quitado a petición de Mustapha: los momentos se ven en la línea de tiempo
  if (det) $('stDetT').textContent = `🔥 Momento detectado · ${det.src === 'chat' ? 'el chat se ha disparado ' + fmtX(chatX(det)) : (det.info || det.src)} · ${Math.round(det.t1 - det.t0)} s`;
  if (!stBusy && /terminó|ningún directo/.test($('stS').textContent)) $('stS').textContent = '';
}
setInterval(stTick, 500);
// sacar un trozo y abrir el editor directamente
async function stCut(m, n) {
  if (stBusy) return; const S0 = lvTrSess(); if (!S0 || !S0.on) return;
  if (auBusy) { toast('El modo automático está terminando un clip: prueba en unos segundos'); return; }
  if (!$('stEd').hidden && stPend !== 'prep') { toast('Termina o cierra (✕) el clip que tienes abierto al lado'); return; }
  stBusy = true; let say = t => { $('stS').textContent = t; };
  try {
    if (!m) {
      const ref = stRef();
      const fromMark = n === 'mark' && stMarkAt != null; if (fromMark) n = Math.max(3, ref - stMarkAt);
      m = { id: 'st' + Date.now().toString(36), src: 'agente', t0: ref - n, t1: ref, conf: 1, at: Date.now() / 1000, info: fromMark ? `Desde la marca · ${Math.round(n)} s (pantalla)` : `Últimos ${n} s (pantalla)`, req: 'Botón en pantalla' };
      if (fromMark) stMarkAt = null;
      const old = (await rtext(S0.h, 'moments_agente.jsonl')) || '';
      await wfile(S0.h, 'moments_agente.jsonl', old + JSON.stringify(m) + '\n');
      S0.moments = [...(S0.moments || []), m]; liveSeen.add(m.id);
    }
    stSeen.add(m.id);
    stEdPend(m); say = t => { if (t) $('seS').textContent = t; };
    // el grabador guarda en trozos de 20 s: hay que esperar a que cierre el trozo donde acaba el clip
    const t0w = performance.now();
    for (;;) {
      const S = liveSessions[S0.name] || S0, last = S.segs && S.segs.length ? S.segs[S.segs.length - 1].t1 : 0;
      if (last >= m.t1 - 0.3 || performance.now() - t0w > 40000 || !S.on) break;
      if (stPend !== m.id) return;   // lo has cerrado mientras se guardaba
      say(`⏳ Guardando el clip… ${Math.max(1, Math.ceil(m.t1 - last))} s. Mientras, ve poniendo el título y el formato.`);
      livePoll(); await sleep(700);
    }
    say('⏳ Preparando el clip… Puedes seguir escribiendo.');
    const S = liveSessions[S0.name] || S0, g = mergeMoments([m])[0];
    const c = await liveCutFile(S, g);
    if (stPend !== m.id) return;
    stBusy = false; await stEdOpen(S, g, c);
  } catch (e) { console.warn(e); $('stS').textContent = ''; if (stPend) $('seS').textContent = '⚠ No se pudo sacar el clip: ' + (e.message || e); stPend = null; toast('No se pudo sacar el clip: ' + (e.message || e)); }
  finally { stBusy = false; }
}

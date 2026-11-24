/* ---------- rebobinar el directo: se ve lo ya grabado (los trozos del grabador) y los botones sacan desde ese momento ---------- */
const stRw = { on: false, seg: null, url: '', S: null, busy: false };
function stRwEpoch() { const v = $('lvRwV'); return stRw.on && stRw.seg && v ? stRw.seg.t0 + (v.currentTime || 0) : null; }
function stLiveEdge() { let lat = 7; try { if (lvHls && lvHls.latency != null && isFinite(lvHls.latency)) lat = lvHls.latency + 1; } catch {} const pe = lvPlayEpoch(); return pe != null ? pe : Date.now() / 1000 - lat; }
async function stRwGo(T) {
  const S = lvTrSess(); if (!S || !S.h || !S.segs || !S.segs.length) { toast('Aún no hay nada grabado de este directo'); return; }
  if (stRw.busy) return; stRw.busy = true;
  try {
    const segs = S.segs, last = segs[segs.length - 1];
    if (T >= Math.min(last.t1 - 0.5, stLiveEdge() - 1.5)) { if (T >= stLiveEdge() - 3) { stRwLive(); return; } T = last.t1 - 1.5; }
    T = Math.max(segs[0].t0, T);
    const seg = segs.find(x => x.t0 <= T && T < x.t1) || segs.find(x => x.t0 > T) || last;
    await stRwLoad(S, seg, Math.max(0, T - seg.t0));
  } catch (e) { console.warn('rebobinar', e); toast('No se pudo rebobinar: ' + (e.message || e)); stRwLive(); }
  finally { stRw.busy = false; }
}
async function stRwLoad(S, seg, at) {
  const v = $('lvRwV'), f = await fileAt(S.h, seg.f), url = URL.createObjectURL(f);
  const old = stRw.url; stRw.url = url; stRw.seg = seg; stRw.S = S;
  await new Promise((ok, ko) => { v.onloadedmetadata = ok; v.onerror = () => ko(new Error('no se puede abrir ese trozo')); v.src = url; });
  v.currentTime = Math.min(at, Math.max(0, (v.duration || 20) - 0.2));
  if (old) URL.revokeObjectURL(old);
  stRw.on = true; $('lvMini').classList.add('rw'); v.muted = !lvMiniSound; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  stRwUI(); try { stTick(); } catch {}
}
function stRwLive() {
  const v = $('lvRwV'); stRw.on = false; stRw.seg = null; try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  if (stRw.url) { URL.revokeObjectURL(stRw.url); stRw.url = ''; } $('lvMini').classList.remove('rw'); stRwUI(); try { stTick(); lvMiniCheck(); } catch {}
}
function stRwUI() {
  const on = stRw.on; $('stRwLive').hidden = $('stRwPP').hidden = $('stRwF10').hidden = !on; $('stRw').classList.toggle('on', on);
  const v = $('lvRwV'); $('stRwPP').textContent = on && v.paused ? '▶' : '⏸';
  if (on) { const back = Math.max(0, stLiveEdge() - (stRwEpoch() || 0)); $('stRwT').textContent = `⏪ Viendo lo de hace ${hms(back)} · «Sacar los últimos» y la marca van desde aquí`; }
  else $('stRwT').textContent = 'Rebobina para sacar un clip de algo que ya pasó · o pulsa en la línea de tiempo';
}
setTimeout(() => {
  const v = $('lvRwV'); if (!v || !$('stRwB30')) return;
  v.addEventListener('ended', async () => {   // se sigue con el trozo siguiente; si no hay más, al directo
    const S = stRw.S, cur = stRw.seg; if (!S || !cur) return stRwLive();
    const nx = (S.segs || []).find(x => x.t0 >= cur.t1 - 1 && x.f !== cur.f);
    if (!nx) { stRwLive(); toast('🔴 Has llegado al directo'); return; }
    try { await stRwLoad(S, nx, Math.max(0, cur.t1 - nx.t0)); } catch { stRwLive(); }
  });
  const step = d => { const T = (stRwEpoch() ?? stLiveEdge()) + d; stRwGo(T); };
  $('stRwB30').onclick = () => step(-30); $('stRwB10').onclick = () => step(-10); $('stRwF10').onclick = () => step(10);
  $('stRwLive').onclick = () => stRwLive();
  $('stRwPP').onclick = () => { if (v.paused) v.play().catch(() => {}); else v.pause(); stRwUI(); };
  setInterval(() => { if (stRw.on) { stRwUI(); v.muted = !lvMiniSound; } }, 500);
  // pulsar en la línea de tiempo (fuera de los bloques): ir a ese momento
  $('stTl').addEventListener('click', e => {
    if (e.target.closest('.st-m,.st-flag2,button')) return;
    const r = $('stTl').getBoundingClientRect(), fr = (e.clientX - r.left) / r.width, ref = stRef();
    stRwGo(ref - ST_W + fr * ST_W);
  });
  // teclas: J/← atrás, → adelante, L/Esc al directo (solo en la vista Pantalla y sin estar escribiendo)
  addEventListener('keydown', e => {
    if (!stOn() || $('livePage').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
    if (!$('stEd').hidden && stPend !== 'prep') return;
    const k = e.key.toLowerCase();
    if (k === 'j') { e.preventDefault(); step(-30); } else if (k === 'arrowleft') { e.preventDefault(); step(-10); }
    else if (k === 'arrowright' && stRw.on) { e.preventDefault(); step(10); } else if ((k === 'l' || k === 'escape') && stRw.on) { e.preventDefault(); stRwLive(); }
  });
}, 0);


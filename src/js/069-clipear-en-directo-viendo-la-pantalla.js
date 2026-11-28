/* ---------- clipear en directo viendo la pantalla ----------
   El directo en grande, una línea de tiempo que avanza y botones «sacar los últimos N s»: al pulsar se abre el editor
   con ese trozo, y «← Volver al directo» te devuelve aquí. */
const stOn = () => ezPref('liveMode') === 'stage';
// el momento del directo (hora real) que estás viendo en la pantalla
function stRef() {
  const rw = stRwEpoch(); if (rw != null) return rw;
  const pe = lvPlayEpoch(); if (pe != null) return pe;
  let lat = 7; try { if (lvHls && lvHls.latency != null && isFinite(lvHls.latency)) lat = lvHls.latency + 1; } catch {}
  return Date.now() / 1000 - lat;
}
const ST_W = 120, ST_COL = { chat: '#FBBF24', clipper: '#6E97FF', ia: '#A78BFA', agente: '#34D399', kick: '#53FC18' };
function stMode(m) {
  if (m) ezPref('liveMode', m);
  const on = stOn(); $('livePage').classList.toggle('stage', on); $('lvStage').hidden = !on;
  $('lvModeSt').classList.toggle('on', on); $('lvModeTr').classList.toggle('on', !on);
  $('lvModeSt').setAttribute('aria-selected', on ? 'true' : 'false'); $('lvModeTr').setAttribute('aria-selected', on ? 'false' : 'true');
  if (on) { lvMiniOff = false; $('lvMini').classList.remove('min'); const S = lvTrSess(); if (S) liveMini(S); }
  stTick();
}
let stBusy = false, stDetM = null, stMarkAt = null, stDrag = false;
// una foto pequeña del directo cada segundo (últimos 4 min), para enseñar qué se veía en la marca
const stThumbs = []; let stThC = null;
setInterval(() => {
  try {
    const v = $('lvMiniV'); if (!stOn() || !lvHls || !v || v.hidden || v.paused || v.readyState < 2 || !v.videoWidth) return;
    if (!stThC) { stThC = document.createElement('canvas'); stThC.width = 320; stThC.height = 180; }
    stThC.getContext('2d').drawImage(v, 0, 0, 320, 180);
    stThumbs.push({ t: stRef(), u: stThC.toDataURL('image/jpeg', 0.55) }); if (stThumbs.length > 240) stThumbs.shift();
  } catch (e) { if (!stThumbs.warned) { stThumbs.warned = 1; console.warn('fotos', e); } }
}, 1000);
function stThumbAt(t) { let b = null; for (const x of stThumbs) if (!b || Math.abs(x.t - t) < Math.abs(b.t - t)) b = x; return b && Math.abs(b.t - t) < 3 ? b.u : null; }
function stFlagUI(ref) {
  const f = $('stFlag'); f.hidden = stMarkAt == null; if (stMarkAt == null) return;
  f.style.left = Math.max(0, Math.min(100, (stMarkAt - (ref - ST_W)) / ST_W * 100)) + '%';
  const u = stThumbAt(stMarkAt), im = $('stFlagI'); if (u) { if (im.getAttribute('src') !== u) im.src = u; } else im.removeAttribute('src');
  $('stFlagT').textContent = '📍 hace ' + Math.max(0, Math.round(ref - stMarkAt)) + ' s';
}
const stSeen = new Set();

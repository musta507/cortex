/* ---------- texto y ventanita a la par ----------
   Se compara el sonido de la ventanita con el audio que lee la transcripción para saber, al milisegundo, qué momento
   del directo está sonando. Con eso cada palabra se enseña justo cuando se oye. */
let lvSync = null, lvSyncAt = 0, lvSyncFail = 0, lvCap = null, lvSlk = [], lvAdjAt = -30000;
function lvCapEnsure(v) {
  try {
    if (!v.captureStream) return;
    if (!lvCap) { lvCap = { ctx: new (window.AudioContext || window.webkitAudioContext)(), env: [], track: null, buf: new Float32Array(2048) }; lvCap.an = lvCap.ctx.createAnalyser(); lvCap.an.fftSize = 2048; const g = lvCap.ctx.createGain(); g.gain.value = 0; lvCap.an.connect(g); g.connect(lvCap.ctx.destination); }
    const C = lvCap; if (C.ctx.state === 'suspended') C.ctx.resume().catch(() => {});
    if (C.track && C.track.readyState === 'live') return;
    if (!C.ms) C.ms = v.captureStream();
    const tr = C.ms.getAudioTracks().find(t => t.readyState === 'live'); if (!tr) return;
    if (C.src) { try { C.src.disconnect(); } catch {} }
    C.src = C.ctx.createMediaStreamSource(new MediaStream([tr])); C.src.connect(C.an); C.track = tr; C.env = [];
  } catch (e) { if (!lvCapEnsure.warned) { lvCapEnsure.warned = 1; console.warn('sincronizar', e); } }
}
// volumen de la ventanita, 25 veces por segundo, con el instante del vídeo al que corresponde
setInterval(() => {
  const C = lvCap, v = $('lvMiniV'); if (!C || !C.track || !lvHls || !v || v.paused || v.seeking || C.ctx.state !== 'running') return;
  C.an.getFloatTimeDomainData(C.buf); let q = 0; for (let i = 0; i < 2048; i++) q += C.buf[i] * C.buf[i];
  C.env.push([v.currentTime - 0.07, Math.log(1e-3 + Math.sqrt(q / 2048))]); if (C.env.length > 420) C.env.splice(0, C.env.length - 380);
}, 40);
async function lvSyncTry(S, T, f) {
  const v = $('lvMiniV'); if (!lvHls || !v || v.hidden || v.paused || lvHlsSess !== S.name) { lvSync = null; return; }
  const key = S.name + '|' + T.liveFile;
  if (lvSync && (lvSync.hls !== lvHls || lvSync.key !== key)) lvSync = null;
  const now = performance.now(); if (now - lvSyncAt < (lvSync && !lvSync.approx ? 9000 : 2500)) return; lvSyncAt = now;
  lvCapEnsure(v);
  if (!lvSync) {   // primera idea (±2 s): por el retraso que dice el reproductor
    const lat = lvHls.latency; if (lat == null || !isFinite(lat) || !v.currentTime) return;
    lvSync = { D: Date.now() / 1000 - lat - v.currentTime, approx: true, hls: lvHls, key };
  }
  const env = lvCap ? lvCap.env.filter(e => e[0] > v.currentTime - 12 && e[0] <= v.currentTime) : [];
  if (env.length < 120) return;
  let mx = 0; for (const e of env) mx += e[1]; mx /= env.length; let vx = 0; for (const e of env) vx += (e[1] - mx) ** 2;
  if (Math.sqrt(vx / env.length) < 0.35) return;   // silencio (o sin sonido que comparar): se queda con lo que había
  // volumen del audio de la transcripción (último minuto), cada 20 ms
  const end = f.size & ~1, n = Math.min(end, 32000 * 70) & ~1, i16 = new Int16Array(await f.slice(end - n, end).arrayBuffer());
  const t0 = T.liveT0 + (end - n) / 32000 + 0.02, P = new Float32Array(Math.max(0, Math.floor(i16.length / 320) - 1));
  for (let k = 0; k < P.length; k++) { let q = 0; const o = k * 320; for (let i = 0; i < 640; i++) { const x = i16[o + i] / 32768; q += x * x; } P[k] = Math.log(1e-3 + Math.sqrt(q / 640)); }
  const wide = lvSync.approx || lvSyncFail >= 3, R = wide ? 22 : 1.2, xs = env.map(e => e[1] - mx), sx = Math.sqrt(vx);
  let best = null, cs = [];
  for (let D = lvSync.D - R; D <= lvSync.D + R; D += 0.02) {
    let sy = 0, syy = 0, sxy = 0, m = 0;
    for (let i = 0; i < env.length; i++) { const k = Math.round((env[i][0] + D - t0) / 0.02); if (k < 0 || k >= P.length) continue; const y = P[k]; sy += y; syy += y * y; sxy += xs[i] * y; m++; }
    if (m < env.length * 0.9) continue;
    const vy = syy - sy * sy / m; if (vy <= 1e-9) continue;
    const c = sxy / (sx * Math.sqrt(vy)); cs.push([D, c]); if (!best || c > best[1]) best = [D, c];
  }
  let second = -1; if (best) for (const [D, c] of cs) if (Math.abs(D - best[0]) > 0.4 && c > second) second = c;
  if (best && best[1] > 0.6 && best[1] - second > 0.12) {
    lvSync = { D: lvSync.approx || Math.abs(best[0] - lvSync.D) > 0.12 ? best[0] : lvSync.D * 0.7 + best[0] * 0.3, approx: false, hls: lvHls, key, q: best[1] }; lvSyncFail = 0;
  } else lvSyncFail++;
}
// el instante del directo (hora real) que está sonando ahora mismo en la ventanita
function lvPlayEpoch() {
  const v = $('lvMiniV'); if (!lvSync || !lvHls || lvSync.hls !== lvHls || !v || v.hidden || v.paused || v.readyState < 2 || !lvTrOn()) return null;
  return v.currentTime + lvSync.D;
}
// la ventanita no se toca casi nunca (para que no dé tirones): solo si el texto llega tarde de forma seguida,
// se echa atrás UNA vez lo que haga falta, y como mucho cada 40 s
function lvSlack(s) {
  const now = performance.now(); lvSlk.push([now, s]); lvSlk = lvSlk.filter(x => now - x[0] < 20000 && x[0] > lvAdjAt);
  return;   // la ventanita no se mueve nunca: si el texto llega tarde, sale en cuanto esté
  if (now < lvAdjAt + 40000 || lvSlk.length < 4) return;
  const late = lvSlk.filter(x => x[1] < 0); if (late.length < lvSlk.length * 0.6) return;
  const v = $('lvMiniV'); if (!lvHls || !v) return;
  const adj = Math.min(10, 1.5 - Math.min(...lvSlk.map(x => x[1])));
  let t = v.currentTime - adj; const b = v.buffered; if (b.length) t = Math.max(b.start(0) + 0.5, t);
  try { v.currentTime = t; const lat = lvHls.latency; if (lat != null && isFinite(lat)) lvHls.config.liveSyncDuration = Math.max(3, Math.min(40, lat + adj)); } catch {}
  lvAdjAt = now; lvSlk = [];
}
document.addEventListener('visibilitychange', lvMiniCheck);
function lvMiniLoad(force) {
  if (!lvMiniSlug) return;
  if (lvHls && !force) { lvMiniCheck(); $('lvMiniSnd').textContent = lvMiniSound ? '🔊' : '🔇'; $('lvMiniSnd').title = lvMiniSound ? 'Quitar el sonido' : 'Activar el sonido'; return; }
  const mute = !lvMiniSound || lvMiniQuiet(); lvMiniMutedNow = lvMiniSound ? mute : null;
  $('lvMiniF').src = 'https://player.kick.com/' + encodeURIComponent(lvMiniSlug) + '?autoplay=true&muted=' + (mute ? 'true' : 'false');
  $('lvMiniSnd').textContent = lvMiniSound ? '🔊' : '🔇'; $('lvMiniSnd').title = lvMiniSound ? 'Quitar el sonido' : 'Activar el sonido';
}
function liveMini(s) {
  const w = $('lvMini'); if (!w) return;
  if (!s || lvMiniOff) { w.hidden = true; if (!s) { $('lvMiniF').src = 'about:blank'; lvMiniSlug = ''; } return; }
  const slug = String(s.status.slug || '').toLowerCase();
  if (slug && slug !== lvMiniSlug) { lvMiniSlug = slug; lvMiniLoad(); }
  if (s.on) lvMiniHls(s);
  $('lvMiniT').textContent = '🔴 ' + (s.status.slug || 'En directo'); $('lvMiniOpen').href = 'https://kick.com/' + encodeURIComponent(slug);
  w.hidden = false;
}
setTimeout(() => {
  if (!$('lvMini')) return;
  $('lvMiniX').onclick = () => { lvMiniOff = true; $('lvMini').hidden = true; $('lvMiniF').src = 'about:blank'; lvMiniSlug = ''; if (lvHls) { try { lvHls.destroy(); } catch {} lvHls = null; lvHlsUrl = ''; $('lvMiniV').hidden = true; $('lvMiniF').hidden = false; } toast('Ventanita cerrada: vuelve a salir al volver a abrir «En directo»'); };
  $('lvMiniSnd').onclick = () => { lvMiniSound = !lvMiniSound; lvMiniLoad(); if (lvMiniSound) toast('Sonido activado. Si aún no se oye, sube el volumen dentro del vídeo'); };
  $('lvMiniMin').onclick = () => $('lvMini').classList.toggle('min');
  $('lvMiniBig').onclick = () => $('lvMini').classList.toggle('big');
  // botón para abrirla a mano (aunque el grabador aún no marque el directo)
  $('lvMiniShow').onclick = () => {
    lvMiniOff = false; $('lvMini').classList.remove('min');
    const all = Object.values(liveSessions).sort((a, b) => b.status.started - a.status.started);
    const s = all.find(x => x.on) || all[0];
    if (s) { liveMini(s); return; }
    const sl = prompt('¿Qué canal de Kick quieres ver?', 'westcol'); if (sl) liveMini({ status: { slug: sl.trim() } });
  };
}, 0);
// cuántas veces más rápido que lo normal fue el chat (×2, ×3, ×8…)
const chatX = m => { if (m.x) return +m.x; const r = /(\d+) mensajes en 5 s \(normal: (\d+)\)/.exec(m.info || ''); return r ? +r[1] / Math.max(1, +r[2]) : 0; };
const groupX = g => Math.max(0, ...g.items.filter(x => x.src === 'chat').map(chatX));
const fmtX = x => '×' + (x >= 10 ? Math.round(x) : (Math.round(x * 10) / 10)).toLocaleString('es-ES');
/* criterios de selección: se puede apagar cada uno (o todos) y quedarte solo con lo que sacas tú del directo */
const CRITS = [['clipper', '📱 Otros clippers'], ['ia', '🤖 IA que escucha'], ['chat', '💬 Chat'], ['kick', '🟢 Clips de Kick']];

/* ---------- 🧹 limpiar lo que CapCut va dejando en el disco (lo hace el grabador; aquí se elige qué y se confirma) ---------- */
const ccEsc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ccGB = b => b >= 1e9 ? (b / 1e9).toFixed(1).replace('.', ',') + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : b > 0 ? Math.max(1, Math.round(b / 1e3)) + ' KB' : '0';
async function ccAsk(dir, body, onMsg, maxMs = 180000) {
  const id = 'l' + Date.now().toString(36), cc = await dir.getDirectoryHandle('capcut', { create: true }), rq = await cc.getDirectoryHandle('req', { create: true });
  await wfile(rq, id + '.json', JSON.stringify(body)); const t0 = Date.now(); let seen = false;
  for (;;) {
    await sleep(700); const o = JSON.parse(await rtext(dir, 'capcut/out/' + id + '.json') || 'null');
    if (o) { seen = true; if (o.status !== 'working') return o; if (o.msg && onMsg) onMsg(o.msg); }
    if (!seen && Date.now() - t0 > 12000) return { status: 'error', error: 'El grabador no contesta. Ábrelo (o cierra y abre la aplicación Cortex) y vuelve a probar.' };
    if (Date.now() - t0 > maxMs) return { status: 'error', error: 'Está tardando demasiado. Mira la ventana del grabador.' };
  }
}
async function ccCleanOpen() {
  let dir = await getLiveDir(true); if (!dir) { dir = await pickLiveDir(); if (!dir) return; }
  try { await writeGrabadorFiles(); } catch {}
  let m = $('ccClean'); if (m) m.remove();
  m = document.createElement('div'); m.id = 'ccClean'; m.className = 'pv-modal'; m.style.zIndex = 9000;
  m.innerHTML = `<div class="pv-card" role="dialog" aria-label="Limpiar CapCut" style="width:min(640px,100%)">
    <div class="pv-head"><strong>🧹 Limpiar CapCut</strong><span class="hint" id="ccDays"></span><button class="ib" id="ccX" aria-label="Cerrar">✕</button></div>
    <p class="hint" id="ccS">⏳ Midiendo cuánto ocupa cada cosa…</p>
    <div id="ccList" style="display:grid;gap:8px"></div>
    <div id="ccFoot" hidden style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><strong id="ccTot"></strong><span style="flex:1"></span><button id="ccRe" style="width:auto;padding:8px 14px">↻ Volver a medir</button><button class="primary" id="ccGo" style="width:auto;padding:10px 18px;font-weight:800">Borrar lo marcado</button></div>
  </div>`;
  document.body.append(m);
  const close = () => m.remove(); $('ccX').onclick = close; m.addEventListener('mousedown', e => { if (e.target === m) close(); });
  const say = t => { const e = $('ccS'); if (e) e.textContent = t; };
  let G = [], days = +(ezPref('ccDays') || 30);
  const tot = () => { const b = G.filter(g => $('ccg_' + g.id) && $('ccg_' + g.id).checked).reduce((a, g) => a + g.bytes, 0); $('ccTot').textContent = 'Se van a liberar ' + ccGB(b); $('ccGo').disabled = !b; };
  async function scan() {
    $('ccFoot').hidden = true; $('ccList').innerHTML = ''; say('⏳ Midiendo cuánto ocupa cada cosa…');
    const o = await ccAsk(dir, { op: 'cc_scan', days }, say); if (!$('ccClean')) return;
    if (o.status === 'error' || !o.groups) { say('⚠ ' + (o.groups === undefined && o.status !== 'error' || /proyecto|draft|name/i.test(o.error || '') ? 'El grabador que tienes abierto es antiguo y no sabe limpiar. Ciérralo y vuelve a abrirlo (o cierra y abre la aplicación Cortex), y pulsa «Volver a medir».' : o.error)); $('ccFoot').hidden = false; $('ccGo').disabled = true; $('ccTot').textContent = ''; return; }
    G = o.groups;
    $('ccList').innerHTML = G.map(g => `<label style="display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;cursor:${g.bytes ? 'pointer' : 'default'};opacity:${g.bytes ? 1 : .5}">
      <input type="checkbox" id="ccg_${g.id}" ${g.on && g.bytes ? 'checked' : ''} ${g.bytes ? '' : 'disabled'} style="width:18px;height:18px;margin-top:2px">
      <span><b>${ccEsc(g.label)}</b>${g.id === 'proj' && g.count ? ` <span class="hint">(${g.count})</span>` : ''}<br><span class="hint">${ccEsc(g.note)}${g.names && g.names.length && g.id === 'proj' ? '<br>' + ccEsc(g.names.slice(0, 24).join(' · ')) + (g.count > 24 ? ' …' : '') : ''}</span></span>
      <b style="white-space:nowrap">${g.bytes ? ccGB(g.bytes) : 'nada'}</b></label>`).join('');
    G.forEach(g => { const c = $('ccg_' + g.id); if (c) c.onchange = tot; });
    $('ccDays').innerHTML = `Proyectos sin tocar desde hace <select id="ccDaysS" style="width:auto;padding:2px 6px">${[7, 15, 30, 60, 90].map(d => `<option value="${d}"${d === days ? ' selected' : ''}>${d} días</option>`).join('')}</select>`;
    $('ccDaysS').onchange = e => { days = +e.target.value; ezPref('ccDays', String(days)); scan(); };
    say(o.running ? '⚠ CapCut está abierto. Puedes mirar cuánto ocupa todo, pero para borrar tienes que cerrarlo antes.' : 'Marca lo que quieras borrar. Tus proyectos no se tocan salvo que marques la última casilla.');
    $('ccFoot').hidden = false; tot();
  }
  $('ccRe').onclick = scan;
  $('ccGo').onclick = async () => {
    const pick = G.filter(g => $('ccg_' + g.id).checked); if (!pick.length) return;
    const b = pick.reduce((a, g) => a + g.bytes, 0), pj = pick.find(g => g.id === 'proj');
    if (!$('ccGo').dataset.sure) { $('ccGo').dataset.sure = '1'; $('ccGo').textContent = '¿Seguro? Pulsa otra vez para borrar ' + ccGB(b); say('Esto no se puede deshacer' + (pj ? ', salvo los proyectos: esos van a la Papelera de reciclaje de Windows.' : '.') + ' Pulsa otra vez el botón para confirmar.'); setTimeout(() => { const g = $('ccGo'); if (g) { delete g.dataset.sure; g.textContent = 'Borrar lo marcado'; } }, 8000); return; }
    delete $('ccGo').dataset.sure; $('ccGo').textContent = 'Borrar lo marcado'; $('ccGo').disabled = true; $('ccRe').disabled = true; say('🧹 Borrando…');
    const o = await ccAsk(dir, { op: 'cc_clean', groups: pick.map(g => g.id), days }, t => say('🧹 ' + t), 900000); if (!$('ccClean')) return;
    $('ccRe').disabled = false;
    if (o.status === 'error') { say('⚠ ' + o.error); $('ccGo').disabled = false; return; }
    await scan();
    say(`✅ Liberados ${ccGB(o.freed || 0)}.` + (o.binned ? ` ${o.binned} proyecto${o.binned > 1 ? 's' : ''} en la Papelera de reciclaje de Windows.` : '') + (o.locked ? ` ${o.locked} archivo${o.locked > 1 ? 's' : ''} no se dejaron borrar (estaban en uso).` : ''));
  };
  scan();
}
let pickAborts = 0;
const toastLong = (t, ms = 15000) => { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); console.warn(t); };
async function pickLiveDir() {
  if (!window.showDirectoryPicker) { toast('Este navegador no deja elegir carpetas: usa Google Chrome'); return null; }
  let d; const opt = { id: 'clipzi-grabador', mode: 'readwrite' }; if (liveDir && liveDir.kind === 'directory') opt.startIn = liveDir;   // se abre ya en tu carpeta: solo hay que pulsar «Seleccionar carpeta»
  ldg('abro el selector de carpetas' + (opt.startIn ? ' (en tu carpeta)' : ''));
  try { d = await showDirectoryPicker(opt); ldg('carpeta elegida: «' + d.name + '»'); }
  catch (e) {
    ldg('el selector ha fallado: ' + e.name + ' · ' + e.message); liveDiagShow();
    if (e.name === 'AbortError') { pickAborts++; if (pickAborts >= 2) toastLong('No he recibido ninguna carpeta: o se cerró el selector, o el navegador la rechazó. Abajo a la izquierda tienes el detalle: hazle una captura y mándasela a Claude.'); }
    else toastLong('El navegador no me deja abrir carpetas aquí (' + e.name + ': ' + e.message + ').');
    return null;
  }
  pickAborts = 0;
  try { if ((await d.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await d.requestPermission({ mode: 'readwrite' })) !== 'granted') { toastLong('Has elegido la carpeta, pero el navegador no me deja guardar en ella. Cuando salga el aviso «¿Guardar cambios?», pulsa «Guardar cambios» / «Editar archivos».'); return null; } } catch (e) { console.warn(e); }
  liveDir = d; kv.set('grabDir', d).then(() => ldg('carpeta recordada: sí')).catch(e => { ldg('NO se pudo recordar la carpeta: ' + e.name + ' · ' + e.message); liveDiagShow(); console.warn('carpeta', e); toast('He abierto la carpeta, pero el navegador no me deja recordarla: te la pedirá otra vez al recargar. Cierra todas las ventanas de Edge y vuelve a abrirlo.'); });
  try { await writeGrabadorFiles(); await writeLiveConfig(); toast('Listo: en esa carpeta abre «Grabador Clipzi.bat» con doble clic'); }
  catch (e) { console.warn(e); ldg('no pude escribir en la carpeta: ' + e.name + ' · ' + e.message); liveDiagShow(); toast('No pude escribir en esa carpeta'); }
  return d;
}
// canales del directo: cada uno con su canal de Kick, sus cuentas de clippers y su casilla de IA
let lvChanId = null;
async function renderLiveBox(cl0) {
  const cl = clientOf(lvChanId) || cl0; lvChanId = cl.id;
  const box = $('lvChans'); box.innerHTML = '';
  const slug = k => (k || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0];
  for (const c of clients) {
    const k = slug((await getLive(c)).kick); if (!k && c !== cl) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lv-chip' + (c === cl ? ' on' : ''); b.textContent = k || 'Canal nuevo';
    b.onclick = async () => { await save(); lvChanId = c.id; renderLiveBox(cl0); }; box.append(b);
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'lv-chip add'; add.textContent = '＋ Otro canal';
  add.onclick = async () => { await save(); const n = { id: 'c' + Date.now().toString(36), name: 'Canal ' + (clients.length + 1), created: Date.now(), tg: groupOf(clients[0].id), chan: true }; clients.push(n); await saveClients(); lvChanId = n.id; await renderLiveBox(cl0); $('lvKick').focus(); };
  box.append(add);
  if (cl !== clients[0]) {
    const del = document.createElement('button'); del.type = 'button'; del.className = 'lv-chip del'; del.textContent = '🗑 Quitar este canal';
    twoStep(del, 'Pulsa otra vez para quitar este canal (sus clips no se borran)', async () => { clearTimeout(save.t); clients = clients.filter(c => c !== cl); await saveClients(); lvChanId = null; await writeLiveConfig(); renderLiveBox(clients[0]); });
    box.append(del);
  }
  const L = await getLive(cl);
  $('lvKick').value = L.kick; $('lvClippers').value = L.clippers; $('lvAI').checked = !!L.ai;
  const save = async () => { if (!clients.includes(cl)) return; const kick = $('lvKick').value.trim(); if (cl.chan && slug(kick) && cl.name !== slug(kick)) { cl.name = slug(kick); await saveClients(); } await saveLive(cl, { kick, clippers: $('lvClippers').value, ai: $('lvAI').checked }); };
  ['lvKick', 'lvClippers'].forEach(id => $(id).oninput = () => { clearTimeout(save.t); save.t = setTimeout(save, 500); });
  $('lvAI').onchange = save;
  $('lvKick').onchange = async () => { clearTimeout(save.t); await save(); renderLiveBox(cl0); };
  $('lvDir').onclick = async () => { await save(); if (await pickLiveDir()) renderLiveBox(cl0); };
  $('lvOpen').onclick = async () => { await save(); openLive(); };
  const d = liveDir || await kv.get('grabDir').catch(() => null);
  $('lvDirInfo').textContent = d ? `Carpeta del grabador: «${d.name}». Ábrela y haz doble clic en «Grabador Clipzi.bat» antes del directo (déjalo abierto).` : 'Primero elige una carpeta vacía para el grabador: Cortex pondrá ahí el programa.';
  $('lvDir').textContent = d ? '📁 Cambiar de carpeta' : '📁 Elegir la carpeta del grabador';
}
async function openLive() {
  let d = await getLiveDir(true);
  if (!d) {
    if (liveDir) toastLong(liveDirWhy === 'denied' ? 'El navegador ha bloqueado el permiso de tu carpeta del grabador. Elígela otra vez (se abre en ella: pulsa «Seleccionar carpeta»).' : 'Necesito permiso para tu carpeta del grabador: se abre en ella, pulsa «Seleccionar carpeta».', 7000);
    d = await pickLiveDir(); if (!d) return;
  }
  try { await writeGrabadorFiles(); await writeLiveConfig(); } catch (e) { console.warn(e); }
  try { liveHidden = new Set((await kv.get('live-hidden')) || []); } catch {}
  $('home').hidden = true; $('livePage').hidden = false; $('liveBack').hidden = true; lvFmtUI(); lvMiniOff = false; stMode();
  liveNew = 0; document.title = document.title.replace(/^\(\d+\) /, '');
  if (!liveTimer) liveTimer = setInterval(livePoll, 1500);
  livePoll();
}
/* botón «atrás» del ratón o del navegador: retrocede dentro de Cortex en vez de salirse de la página */
function appBack() {
  const vis = id => { const e = $(id); return e && !e.hidden; };
  if (vis('pvModal')) { const x = document.querySelector('#pvModal [data-close], #pvModal .pv-x, #pvClose'); if (x) x.click(); else $('pvModal').hidden = true; return true; }
  if (vis('stEd')) { $('seX').click(); return true; }
  if ($('home').hidden && $('livePage').hidden) {   // en el editor
    if (vis('liveBack')) { $('liveBack').click(); return true; }
    $('homeBtn').click(); return true;
  }
  if (!$('livePage').hidden) { $('lvBackHome').click(); return true; }
  if (typeof homeSec !== 'undefined' && homeSec !== 'inicio') { setHomeSec('inicio'); return true; }
    return false;
}
try {
  history.pushState({ cortex: 1 }, '');
  addEventListener('popstate', () => {
    let done = false; try { done = appBack(); } catch (e) { console.warn('atrás', e); }
    if (done) history.pushState({ cortex: 1 }, '');
    else history.back();   // ya en el inicio: ahora sí se sale
  });
} catch {}
$('lvBackHome').onclick = () => { $('livePage').hidden = true; homeSec = 'directo'; renderHome(); $('home').hidden = false; };
$('liveBack').onclick = async () => { await saveNow(); vid.pause(); $('liveBack').hidden = true; $('livePage').hidden = false; livePoll(); };

// leer lo que va dejando el grabador
let livePolling = false;
async function livePoll() {
  if (livePolling) return; livePolling = true;
  try {
    const d = await getLiveDir(false);
    if (!d) { liveRender('need-dir'); return; }
    if (!liveWant.length) { for (const c of clients) { const k = lvSlug((await getLive(c)).kick); if (k && !liveWant.includes(k)) liveWant.push(k); } }
    let dd; try { dd = await d.getDirectoryHandle('directos'); } catch { liveRender('no-rec'); return; }
    // solo los canales de Kick que tienen puestos tus clientes
    const want = new Set();
    for (const c of clients) { const L = await getLive(c); const k = (L.kick || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//i, '').split(/[/?#]/)[0].toLowerCase(); if (k) want.add(k); }
    liveWant = [...want];
    for (const k of Object.keys(liveSessions)) if (!want.has(String((liveSessions[k].status || {}).slug || k.replace(/_\d{8}_\d{4}$/, '')).toLowerCase())) delete liveSessions[k];
    try { const viv = JSON.parse((await rtext(d, 'descargas/vivo.json')) || 'null'); liveGrabOn = !!viv && Date.now() / 1000 - viv.t < 20; } catch { liveGrabOn = false; }
    const found = [];
    for await (const [name, h] of dd.entries()) if (h.kind === 'directory' && want.has(name.replace(/_\d{8}_\d{4}$/, '').toLowerCase())) found.push([name, h]);
    found.sort((a, b) => b[0].localeCompare(a[0]));
    const now = Date.now() / 1000;
    for (const [name, h] of found.slice(0, 6)) {
      const st = JSON.parse((await rtext(h, 'status.json')) || 'null'); if (!st) continue;
      if (now - st.updated > 3600 * 12 && !liveSessions[name]) continue;
      const S = liveSessions[name] = liveSessions[name] || { name, h, aiDone: new Set(), aiBusy: false };
      S.status = st; S.on = st.live && now - st.updated < 200;
      S.segs = rjsonl(await rtext(h, 'segments.jsonl'));
      const ia = rjsonl(await rtext(h, 'moments_ia.jsonl'));
      ia.filter(x => x.done).forEach(x => x.done.forEach(f => S.aiDone.add(f)));
      S.moments = [...rjsonl(await rtext(h, 'moments.jsonl')), ...ia.filter(x => x.src), ...rjsonl(await rtext(h, 'moments_agente.jsonl')), ...rjsonl(await rtext(h, 'moments_extra.jsonl'))];
      S.clippers = rjsonl(await rtext(h, 'clippers.jsonl'));
      // avisar de lo nuevo
      for (const m of S.moments) {
        if (liveSeen.has(m.id)) continue;
        liveSeen.add(m.id);
        if (S.first && !critOff().has(m.src)) { liveNew++; liveNotify(S, m); }
      }
      S.first = true;
      if (S.on && !critOff().has('ia')) liveAI(S);   // con la IA que escucha apagada no se gasta Gemini
    }
    liveRender();
  } catch (e) { console.warn('Directo', e); try { const st = $('lvStatus'); let w = st.querySelector('.lv-err'); if (!w) { w = document.createElement('div'); w.className = 'lv-off lv-err'; st.prepend(w); } w.textContent = '⚠️ No puedo actualizar el panel: ' + String(e.message || e).slice(0, 160); } catch {} }
  finally { livePolling = false; }
}
function liveNotify(S, m) {
  if (!lvExtra() && m.src !== 'ia') return;   // escondido: sin avisos de lo que no se enseña
  const who = { chat: '💬 El chat ha explotado', kick: '🎬 Un espectador ha hecho un clip', clipper: '📱 ' + (m.who || 'Un clipper') + ' ha subido este momento', ia: '🤖 La IA ha visto un momento' }[m.src] || 'Nuevo momento';
  toast(`📡 ${S.status.slug}: ${who}`);
  if ($('livePage').hidden) { document.title = `(${liveNew}) ` + document.title.replace(/^\(\d+\) /, ''); }
  try { ensureAudio(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.value = 0.06; o.connect(g); g.connect(actx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.25); o.stop(actx.currentTime + 0.3); } catch {}
}
// juntar señales del mismo momento (el chat explota + un clip de Kick + un clipper = momento muy bueno)
function mergeMoments(list) {
  const out = [];
  for (const m of [...list].sort((a, b) => a.t0 - b.t0)) {
    // mismo momento si se solapa bastante con alguna de sus señales (sin encadenar momentos distintos)
    const same = x => { const ov = Math.min(m.t1, x.t1) - Math.max(m.t0, x.t0), sh = Math.max(1, Math.min(m.t1 - m.t0, x.t1 - x.t0)); return ov / sh >= 0.45 || Math.abs(m.t0 - x.t0) < 8; };
    const g = out.find(x => x.items.some(same) && Math.max(x.t1, m.t1) - Math.min(x.t0, m.t0) <= 150);   // sin encadenar minutos y minutos
    if (g) { g.items.push(m); g.t0 = Math.min(g.t0, m.t0); g.t1 = Math.max(g.t1, m.t1); g.at = Math.max(g.at, m.at); g.conf = Math.max(g.conf, m.conf || 0.5); }
    else out.push({ items: [m], t0: m.t0, t1: m.t1, at: m.at, conf: m.conf || 0.5 });
  }
  for (const g of out) { const cp = g.items.find(x => x.src === 'agente') || g.items.find(x => x.src === 'clipper'); if (cp) { g.t0 = cp.t0; g.t1 = cp.t1; g.exact = true; }
    else {
      // clips cortos (lo que mejor funciona): el tramo de la señal principal, no la suma de todas; como mucho 40 s
      const ias = g.items.filter(x => x.src === 'ia').sort((a, b) => (b.conf || 0) - (a.conf || 0));
      const core = ias[0] || [...g.items].sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
      g.t0 = core.t0; g.t1 = Math.min(core.t1, core.t0 + 40);
    }
    const kinds = new Set(g.items.map(x => x.src)); g.kinds = kinds; g.score = Math.min(1, g.conf + 0.12 * (kinds.size - 1)); g.id = g.items.map(x => x.id).sort().join('+'); if (!g.exact && g.t1 - g.t0 > 120) g.t1 = g.t0 + 120; }
  return out;
}
const SRC_BADGE = { agente: ['🧑‍💼', 'Pedido'], chat: ['💬', 'Chat'], kick: ['🎬', 'Clip de Kick'], clipper: ['📱', 'Clipper'], ia: ['🤖', 'IA'] };
const agoTxt = s => { const d = Math.max(0, Date.now() / 1000 - s); return d < 60 ? `hace ${Math.round(d)} s` : d < 3600 ? `hace ${Math.floor(d / 60)} min` : d < 86400 ? `hace ${Math.floor(d / 3600)} h ${Math.floor(d % 3600 / 60)} min` : `hace ${Math.floor(d / 86400)} d`; };
setInterval(() => { if ($('livePage').hidden) return; for (const e of document.querySelectorAll('#livePage [data-ago]')) { const t = agoTxt(+e.dataset.ago); if (e.textContent !== t) e.textContent = t; } }, 1000);
// cuándo subió el clip el clipper: la fecha va dentro del número del vídeo de TikTok
function clipUpAt(m) { try { const id = (/video\/(\d{15,})/.exec(m.url || '') || [])[1]; if (id) { const t = Number(BigInt(id) >> 32n); if (t > 1.5e9 && t < 4e9) return t; } } catch {} return m.at; }
// momentos que ya has abierto (ver o editar): los que no, van con borde blanco
let liveOpened = new Set(); kv.get('live-opened').then(v => { if (Array.isArray(v)) liveOpened = new Set(v); }).catch(() => {});
function liveMarkOpen(g) { if (liveOpened.has(g.id)) return; liveOpened.add(g.id); kv.set('live-opened', [...liveOpened].slice(-3000)).catch(() => {}); for (const c of document.querySelectorAll('.lv-card.new')) if (c.dataset.gid === g.id) c.classList.remove('new'); }
const clockOf = s => { const d = Math.max(0, s); const h = Math.floor(d / 3600), m = Math.floor(d % 3600 / 60), x = Math.floor(d % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
// ventanita con el directo (arriba a la derecha)
let lvMiniSlug = '', lvMiniOff = false, lvMiniSound = false, lvMiniMutedNow = null;
// se silencia solo mientras ves un clip, editas o la pestaña no está delante
const lvMiniQuiet = () => (typeof stRw !== "undefined" && stRw.on) || !$('pvModal').hidden || $('livePage').hidden || (stDock && stEdSound && !vid.paused);   // cambiar de pestaña ya no lo silencia   // con la ventanita de Kick no se silencia al cambiar de pestaña (habría que recargarla)
// reproductor propio (con el vídeo que graba el grabador): se silencia al instante, sin recargar ni pararse
let lvHls = null, lvHlsUrl = '', lvHlsCheck = 0, lvHlsSess = '';
const HLS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js';
async function lvMiniHls(s) {
  if (!s || !s.h || Date.now() - lvHlsCheck < 8000) return; lvHlsCheck = Date.now();
  let j; try { j = JSON.parse((await rtext(s.h, 'aud/hls.json')) || 'null'); } catch { j = null; }
  if (!j || !j.url || j.url === lvHlsUrl) return;
  try {
    if (!window.Hls) await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = HLS_URL; sc.onload = ok; sc.onerror = ko; document.head.append(sc); });
    if (!window.Hls || !Hls.isSupported()) return;
    const v = $('lvMiniV');
    if (lvHls) { try { lvHls.destroy(); } catch {} }
    lvHlsUrl = j.url;
    lvHls = new Hls({ liveSyncDuration: lvMiniTarget(), liveMaxLatencyDuration: 60, maxLiveSyncPlaybackRate: 1, lowLatencyMode: true, maxBufferLength: 20, backBufferLength: 30 });
    lvHlsSess = s.name; lvSync = null; lvSlk = [];
    lvHls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) { console.warn('ventanita', d); const h = lvHls; setTimeout(() => { try { h.destroy(); } catch {} }, 0); lvHls = null; v.hidden = true; $('lvMiniF').hidden = false; lvMiniLoad(true); /* no se reintenta la misma dirección */ } });
    lvHls.on(Hls.Events.MANIFEST_PARSED, () => {
      v.hidden = false; $('lvMiniF').hidden = true; $('lvMiniF').src = 'about:blank';
      v.muted = !lvMiniSound || lvMiniQuiet(); v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    });
    lvHls.loadSource(j.url); lvHls.attachMedia(v);
  } catch (e) { console.warn('ventanita', e); }
}
function lvMiniCheck() {
  if (lvHls) { const v = $('lvMiniV'), m = !lvMiniSound || lvMiniQuiet(); if (v.muted !== m) { v.muted = m; if (!m) v.play().catch(() => {}); } return; }
  if (!lvMiniSlug || !lvMiniSound) return;
  const want = lvMiniQuiet();
  if (want !== lvMiniMutedNow) lvMiniLoad();
}
setInterval(lvMiniCheck, 700);
// si la ventanita se queda atrás (tras un parón), salta al directo
// la ventanita va por detrás de la transcripción lo justo para que cada palabra ya esté escrita cuando se oye
// En «Pantalla» no se enseña el texto: el vídeo va lo más pegado posible al directo (3 s; si da parones, sube solo hasta 6)
let lvLow = Math.min(7, Math.max(3, +ezPref('liveLow') || 3)), lvWaits = [];   // lo aprendido se queda guardado: no vuelve a dar los mismos cortes cada vez
function lvMiniTarget() {
  if (stOn()) return lvLow;
  let d = 1.5; try { const S = lvTrSess(), T = S && lvTr[S.name]; if (T && T.delay != null && lvTrOn()) d = T.delay; } catch {}
  return Math.min(22, Math.max(7, 2.2 + 2 * d + 2.5));   // trozo de Kick (~2 s) + dos vueltas de la IA de voz + margen
}
setInterval(() => {
  try {
    const v = $('lvMiniV'); if (!lvHls || !v || v.paused || lvSync) return;   // con la transcripción sincronizada, el retraso lo lleva lvSlack
    const want = lvMiniTarget();
    const lp = lvHls.liveSyncPosition; if (!lp) return;
  } catch {}
}, 5000);
setInterval(() => {
  try {
    const v = $('lvMiniV'); if (!lvHls || !v || v.hidden) return;
    const st = stOn(), want = lvMiniTarget(), c = lvHls.config;
    if (c.liveSyncDuration !== want) c.liveSyncDuration = want;
    c.maxLiveSyncPlaybackRate = 1;   // nunca se acelera para recuperar: esos cambios de velocidad se notaban como microcortes
    if (v.playbackRate !== 1) v.playbackRate = 1;
    const lat = lvHls.latency; if (lat == null || !isFinite(lat) || v.paused || v.readyState < 2) return;
    try { if (stRw.on) return; } catch {}   // rebobinando: no se toca
    if (st) {
      if (!v.dataset.lw) { v.dataset.lw = '1'; v.addEventListener('waiting', () => {
        // se ha quedado sin vídeo un instante: al segundo corte en 40 s se deja un segundo más de margen (hasta 7) y se echa atrás ese segundo para tenerlo de verdad
        if (!stOn()) return; try { if (stRw.on) return; } catch {} const n = Date.now(); lvWaits = lvWaits.filter(t => n - t < 40000); lvWaits.push(n);
        if (lvWaits.length >= 2 && lvLow < 7) { lvLow++; lvWaits = []; ezPref('liveLow', String(lvLow)); try { lvHls.config.liveSyncDuration = lvLow; const b = v.buffered; if (b.length) v.currentTime = Math.max(b.start(0) + 0.2, v.currentTime - 1); } catch {} }
      }); }
      if (lat > want + 5) { const lp = lvHls.liveSyncPosition; if (lp && isFinite(lp)) v.currentTime = lp; }   // muy atrasado (tras un parón largo): salto al directo
    } else if (!lvSync && lat < want - 2.5) {   // al volver a «Transcripción»: se echa atrás una vez para que el texto llegue a tiempo
      const b = v.buffered; if (b.length) v.currentTime = Math.max(b.start(0) + 0.3, v.currentTime - (want - lat));
    }
  } catch {}
}, 2000);


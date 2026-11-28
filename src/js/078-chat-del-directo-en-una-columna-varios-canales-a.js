/* ---------- chat del directo en una columna (varios canales a la vez) ----------
   Solo lee con la columna abierta, solo los mensajes nuevos de cada archivo, y en pantalla nunca hay más de 100. */
const LC = { st: {}, busy: false, sig: '', chSig: '' };
const lcOpen = () => ezPref('chatOpen') === '1';
const lcHidden = () => { try { return new Set(JSON.parse(ezPref('chatHide') || '[]')); } catch { return new Set(); } };
async function lcRead(S) {
  const st = LC.st[S.name] = LC.st[S.name] || { off: -1, skip: false, msgs: [] };
  let f; try { f = await fileAt(S.h, 'chat.jsonl'); } catch { return 0; }
  if (st.off < 0 || f.size < st.off || f.size - st.off > 200000) { st.off = Math.max(0, f.size - 30000); st.skip = st.off > 0; }
  if (f.size <= st.off) return 0;
  const buf = new Uint8Array(await f.slice(st.off, f.size).arrayBuffer());
  const end = buf.lastIndexOf(10); if (end < 0) return 0;   // aún no hay una línea entera
  let start = 0; if (st.skip) { start = buf.indexOf(10) + 1; st.skip = false; }
  st.off += end + 1; if (start >= end) return 0;
  let n = 0;
  for (const l of new TextDecoder().decode(buf.subarray(start, end)).split('\n')) {
    try { const j = JSON.parse(l); if (j && j.m != null) { st.msgs.push({ t: +j.t || 0, u: String(j.u || ''), m: String(j.m), c: String(S.status.slug || '') }); n++; } } catch {}
  }
  if (st.msgs.length > 150) st.msgs.splice(0, st.msgs.length - 150);
  return n;
}
const lcHue = u => { let h = 0; for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) % 360; return h; };
function lcDraw(SS, hide) {
  const ch = $('lcCh'), note = $('lcNote'), list = $('lcList');
  const chSig = SS.map(s => s.status.slug + (hide.has(s.status.slug) ? '-' : '+')).join('|');
  if (chSig !== LC.chSig) {
    LC.chSig = chSig; ch.innerHTML = '';
    if (SS.length > 1) for (const s of SS) {
      const b = document.createElement('button'), slug = s.status.slug; b.textContent = slug; b.className = hide.has(slug) ? '' : 'on'; b.title = 'Ver u ocultar el chat de ' + slug;
      b.onclick = () => { const h = lcHidden(); h.has(slug) ? h.delete(slug) : h.add(slug); ezPref('chatHide', JSON.stringify([...h])); LC.sig = ''; lcTick(); };
      ch.append(b);
    }
  }
  let msg = '', btn = false;
  if (!SS.length) msg = 'Ahora mismo no hay ningún directo grabándose. El chat aparece aquí en cuanto empiece uno.';
  else if (critOff().has('chat')) { msg = 'El chat está apagado: el grabador no lo está leyendo.'; btn = true; }
  else { const bad = SS.filter(s => s.status.error === 'chat').map(s => s.status.slug); if (bad.length) msg = '⚠️ El grabador no consigue leer el chat de ' + bad.join(', ') + '.'; }
  if (note.dataset.m !== msg + btn) {
    note.dataset.m = msg + btn; note.hidden = !msg; note.textContent = msg;
    if (btn) { const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Encender el chat'; b.style.display = 'block';
      b.onclick = () => { const o = critOff(); o.delete('chat'); ezPref('critOff', JSON.stringify([...o])); try { critUI(); liveRender(); stTick(); } catch {} writeLiveConfig(); lcTick(); toast('Chat encendido: los mensajes empiezan a llegar en unos segundos'); }; note.append(b); }
  }
  const multi = SS.filter(s => !hide.has(s.status.slug)).length > 1;
  let all = []; for (const s of SS) if (!hide.has(s.status.slug) && LC.st[s.name]) all = all.concat(LC.st[s.name].msgs);
  all.sort((a, b) => a.t - b.t); if (all.length > 100) all = all.slice(-100);
  const sig = all.length + '|' + (all.length ? all[all.length - 1].t + all[all.length - 1].u : '') + '|' + multi + chSig;
  if (sig === LC.sig) return;
  const stuck = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  if (!stuck && LC.sig) { $('lcNew').hidden = false; return; }   // estás leyendo más arriba: no se mueve nada hasta que vuelvas abajo
  LC.sig = sig; $('lcNew').hidden = true;
  const fr = document.createDocumentFragment();
  for (const m of all) {
    const d = document.createElement('div'); d.className = 'lc-m';
    if (multi) { const i = document.createElement('i'); i.textContent = m.c; d.append(i); }
    const b = document.createElement('b'); b.textContent = m.u + ': '; b.style.color = `hsl(${lcHue(m.u)} 70% 68%)`;
    d.append(b);
    // los emotes de Kick llegan como [emote:número:nombre]: se pinta su imagen (si no carga, queda el nombre)
    let k = 0; const re = /\[emote:(\d+):([^\]]*)\]/g; let x;
    while ((x = re.exec(m.m))) {
      if (x.index > k) d.append(document.createTextNode(m.m.slice(k, x.index)));
      const im = document.createElement('img'), nm = x[2] || 'emote'; im.className = 'lc-e'; im.alt = ':' + nm + ':'; im.title = nm; im.loading = 'lazy'; im.decoding = 'async';
      im.src = 'https://files.kick.com/emotes/' + x[1] + '/fullsize'; im.onerror = () => im.replaceWith(document.createTextNode(':' + nm + ':'));
      d.append(im); k = re.lastIndex;
    }
    if (k < m.m.length) d.append(document.createTextNode(m.m.slice(k)));
    fr.append(d);
  }
  list.replaceChildren(fr); list.scrollTop = list.scrollHeight;
}
async function lcTick() {
  if (LC.busy) return; LC.busy = true;
  try {
    const box = $('lvChat'); if (!box || box.hidden || $('livePage').hidden || document.hidden) return;
    const SS = Object.values(liveSessions).filter(s => s.on && s.status).sort((a, b) => String(a.status.slug).localeCompare(String(b.status.slug))), hide = lcHidden();
    if (!critOff().has('chat')) for (const S of SS) if (!hide.has(S.status.slug)) await lcRead(S);
    lcDraw(SS, hide);
  } catch (e) { console.warn('chat', e); } finally { LC.busy = false; }
}
function lcUI() {
  const on = lcOpen(), box = $('lvChat'); if (!box) return;
  box.hidden = !on; $('livePage').classList.toggle('chat-on', on); $('lvChatB').classList.toggle('on', on);
  if (on) { LC.sig = ''; lcTick(); }
}
setTimeout(() => {
  if (!$('lvChatB')) return;
  $('lvChatB').onclick = () => { ezPref('chatOpen', lcOpen() ? '0' : '1'); lcUI(); };
  $('lcX').onclick = () => { ezPref('chatOpen', '0'); lcUI(); };
  $('lcNew').onclick = () => { const l = $('lcList'); l.scrollTop = l.scrollHeight; LC.sig = ''; lcTick(); };
  $('lcList').addEventListener('scroll', () => { const l = $('lcList'); if (!$('lcNew').hidden && l.scrollHeight - l.scrollTop - l.clientHeight < 60) { LC.sig = ''; lcTick(); } });
  lcUI(); setInterval(lcTick, 1500);
}, 0);
// aviso de disco (lo manda el grabador): sale en cualquier pantalla, una vez por cada cambio
{ const said = {};
  setInterval(() => {
    try {
      for (const S of Object.values(liveSessions)) {
        if (!S.on || !S.status) continue; const d = S.status.disco || '', k = S.name;
        if (said[k] === d) continue; said[k] = d;
        if (d === 'lleno') toastLong('💾 El disco está casi lleno (' + S.status.disco_gb + ' GB libres): el grabador ha parado la grabación de ' + S.status.slug + ' para no llenarlo. Borra cosas que no uses y seguirá solo.');
        else if (d === 'bajo') toast('💾 Queda poco disco: ' + S.status.disco_gb + ' GB libres. El grabador borrará solo los trozos de directos antiguos.');
      }
    } catch {}
  }, 5000); }
function critOff() { try { return new Set(JSON.parse(ezPref('critOff') || '[]')); } catch { return new Set(); } }
function critUI() {
  const box = $('lvCrit'); if (!box) return; const off = critOff(); box.innerHTML = '<span>Detectar clips con:</span>';
  for (const [id, n] of CRITS) { const b = document.createElement('button'); b.textContent = n; b.className = off.has(id) ? 'off' : 'on'; b.title = off.has(id) ? 'Apagado: pulsa para volver a verlo' : 'Encendido: pulsa para dejar de verlo';
    b.onclick = () => { const o = critOff(); o.has(id) ? o.delete(id) : o.add(id); ezPref('critOff', JSON.stringify([...o])); critUI(); liveRender(); stTick(); writeLiveConfig(); }; box.append(b); }
  const all = off.size >= CRITS.length, b = document.createElement('button'); b.textContent = all ? '✅ Encender todos' : '🚫 Apagar todos (solo mis clips)';
  b.onclick = () => { ezPref('critOff', JSON.stringify(all ? [] : CRITS.map(c => c[0]))); critUI(); liveRender(); stTick(); writeLiveConfig(); }; box.append(b);
}
setTimeout(critUI, 0);
// «un formato por escena»: se enciende o se apaga para todos los clips
setTimeout(() => { const cs = document.querySelectorAll('.scn-chk'), sync = () => cs.forEach(c => c.checked = ezPref('scenes') !== '0'); sync(); cs.forEach(c => c.onchange = () => { ezPref('scenes', c.checked ? '1' : '0'); sync(); toast(c.checked ? 'Formato por escenas: encendido' : 'Formato por escenas: apagado, cada clip va con un solo formato'); }); }, 0);
function liveRender(state) {
  const st = $('lvStatus'), box = $('lvMoments'), miss = $('lvMiss');
  if (state === 'need-dir') { st.innerHTML = '<p class="hint">Falta elegir la carpeta del grabador (en Ajustes → Directo).</p>'; box.innerHTML = ''; return; }
  if (state === 'no-rec') { st.innerHTML = '<div class="lv-off">⚫ El grabador aún no ha grabado nada. Abre «Grabador Clipzi.bat» en la carpeta del grabador y déjalo abierto: en cuanto el streamer empiece, aparecerá aquí.</div>'; box.innerHTML = ''; return; }
  const S = Object.values(liveSessions).sort((a, b) => b.status.started - a.status.started);
  st.innerHTML = ''; lvChanBar(st, S);
  if (!S.some(s => s.on)) { const p = document.createElement('div'); p.className = 'lv-off'; p.textContent = '⚫ Ahora mismo no hay ningún directo. Deja el grabador abierto: empieza a grabar solo cuando el streamer entra en directo.'; st.append(p); }
  for (const s of (lvChanBarOn ? [] : S.filter(s => s.on || Date.now() / 1000 - s.status.updated < 3600 * 3))) {
    const p = document.createElement('div'); p.className = 'lv-pill' + (s.on ? ' on' : '');
    const mins = Math.round(((s.segs.length ? s.segs[s.segs.length - 1].t1 : s.status.started) - s.status.started) / 60);
    p.textContent = `${s.on ? '🔴' : '⚫'} ${s.status.slug}${s.status.client ? ' (' + s.status.client + ')' : ''} · ${s.on ? 'grabando' : 'terminado'} · ${mins} min grabados · ${critOff().has('chat') || s.status.chat_off ? 'chat apagado' : (s.status.chat || 0) + ' mensajes del chat'}${s.status.test ? ' · PRUEBA' : ''}${s.status.error === 'chat' ? ' · ⚠️ no puedo leer el chat' : ''}${s.status.disco === 'lleno' ? ' · 💾 PARADO: disco lleno' : s.status.disco === 'bajo' ? ' · 💾 queda poco disco (' + s.status.disco_gb + ' GB)' : ''}`;
    st.append(p);
  }
  { const f = lvTrSess(); liveMini(f && f.on ? f : S.find(s => s.on)); }
  box.innerHTML = '';
  const all = [];
  // los que coinciden salen juntos en «Varios criterios» y además cada señal suelta en su sección
  const cOff = critOff();
  for (const s of S) {
    const ms = (s.moments || []).filter(x => !cOff.has(x.src));
    for (const g of mergeMoments(ms.filter(x => x.src !== 'agente'))) if (g.kinds.size > 1 && !liveHidden.has(g.id)) all.push([s, g]);
    for (const m of ms) { const g = mergeMoments([m])[0]; if (g && !liveHidden.has(g.id)) all.push([s, g]); }
  }
  // filtro del chat: solo los picos de ×N o más
  const xMin = +(ezPref('chatMin') || 2);
  for (let i = all.length - 1; i >= 0; i--) { const g = all[i][1]; if (g.kinds.size === 1 && g.kinds.has('chat') && groupX(g) < xMin) all.splice(i, 1); }
  // por secciones: cada criterio en la suya; si coinciden varios a la vez, en «Varios criterios»
  const SECS = [['agente', '🧑‍💼 Tus clips', 'Los que has pedido a la IA o subrayado en la transcripción'], ['multi', '🔥 Varios criterios a la vez', 'Coinciden dos o más señales en el mismo momento: los más seguros'], ['clipper', '📱 Otros clippers', 'Mismo inicio y final que el clip que subieron'], ['ia', '🤖 La IA que escucha', 'Momentos que la IA ha oído en el directo'], ['chat', '💬 Chat', 'Picos del chat: ×2 = el doble de mensajes de lo normal, ×5 = cinco veces…'], ['kick', '🎬 Clips de Kick', '']];
  const secOf = g => g.kinds.size > 1 ? 'multi' : [...g.kinds][0];
  const secIdx = k => { const i = SECS.findIndex(x => x[0] === k); return i < 0 ? 99 : i; };
  const when = g => { const cp = g.items.find(x => x.src === 'clipper'); return cp ? clipUpAt(cp) : g.at; };
  all.sort((a, b) => secIdx(secOf(a[1])) - secIdx(secOf(b[1])) || when(b[1]) - when(a[1]));
  box.classList.add('sec');
  const secBox = {};
  const secGrid = k => {
    if (secBox[k]) return secBox[k];
    const d = SECS.find(x => x[0] === k) || [k, k, ''], n = all.filter(x => secOf(x[1]) === k).length;
    const w = document.createElement('section'); w.className = 'lv-sec lv-sec-' + k;
    w.innerHTML = '<div class="lv-sh"><strong></strong><span class="lv-n"></span><span class="hint"></span></div><div class="lv-g"></div>';
    w.querySelector('strong').textContent = d[1]; w.querySelector('.lv-n').textContent = n; w.querySelector('.hint').textContent = d[2];
    if (k === 'chat') {   // elegir desde qué multiplicador se ven
      const f = document.createElement('div'); f.className = 'lv-xf'; f.innerHTML = '<span>Ver desde</span>';
      for (const v of [2, 3, 4, 5, 7, 10]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '×' + v + '+'; b.className = v === xMin ? 'on' : ''; b.onclick = () => { ezPref('chatMin', String(v)); liveRender(); }; f.append(b); }
      w.querySelector('.lv-sh').after(f);
    }
    box.append(w); return secBox[k] = w.querySelector('.lv-g');
  };
  const list = [];
  // las secciones de cada criterio se ven siempre (aunque aún no tengan nada), en su orden
  const ALWAYS = ['clipper', 'ia', 'chat'];
  for (const [k] of SECS) if (!cOff.has(k) && !(k === 'multi' && cOff.size >= CRITS.length - 1) && (ALWAYS.includes(k) || all.some(x => secOf(x[1]) === k))) secGrid(k);
  for (const k of ALWAYS) if (!all.some(x => secOf(x[1]) === k)) {
    const e = document.createElement('p'); e.className = 'hint lv-empty';
    e.textContent = k === 'chat' ? `Todavía nada: el chat aún no ha tenido ningún pico de ${'×' + xMin} o más.` : k === 'ia' ? 'Todavía nada: la IA escucha el directo cada 2 minutos (necesita Cortex abierto y la clave de Gemini).' : 'Todavía nada: en cuanto un clipper suba un clip de este directo, sale aquí.';
    secGrid(k).append(e);
  }
  for (const [s, g] of all.slice(0, 150)) {
    const c = document.createElement('div'); c.className = 'lv-card' + (g.kinds.size > 1 ? ' strong' : '') + (liveOpened.has(g.id) ? '' : ' new') + (liveCut.has(g.id) ? ' ready' : ''); c.dataset.gid = g.id;
    const gx = groupX(g);
    const badges = [...g.kinds].map(k => `<span class="lv-b lv-${k}">${SRC_BADGE[k][0]} ${SRC_BADGE[k][1]}</span>`).join('') + (gx ? `<span class="lv-mx${gx >= 5 ? ' hot' : gx >= 3 ? ' warm' : ''}">${fmtX(gx)}</span>` : '');
    c.innerHTML = `<div class="lv-top"><div class="lv-bs">${badges}</div><span class="hint"></span></div><strong class="lv-t"></strong><div class="lv-info"></div><div class="lv-bar"><i></i></div><div class="lv-act"><button class="primary lv-see">▶ Ver el momento</button><button class="lv-ed">✂️ Editar</button><button class="lv-x">Descartar</button></div>`;
    { const h = c.querySelector('.hint'), cp = g.items.find(x => x.src === 'clipper'), at = when(g);
      const ago = document.createElement('span'); ago.dataset.ago = at; ago.textContent = agoTxt(at);
      h.append(cp ? 'subido ' : '', ago, ` · ${s.status.slug}`);
      // el momento exacto del directo
      const ex = document.createElement('div'); ex.className = 'lv-when';
      ex.innerHTML = '<b></b><span></span>'; ex.firstChild.textContent = `${clockOf(g.t0 - s.status.started)} → ${clockOf(g.t1 - s.status.started)}`; ex.lastChild.textContent = ` del directo · ${Math.round(g.t1 - g.t0)} s` + (cp ? ' · mismo corte que su clip' : '');
      c.querySelector('.lv-top').after(ex); }
    const main = g.items.find(x => x.src === 'agente') || g.items.find(x => x.src === 'clipper') || g.items.find(x => x.src === 'ia') || g.items.find(x => x.src === 'kick') || g.items[0];
    { const inf0 = String(main.info || '').replace(new RegExp('^' + String(main.who || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*'), ''); c.querySelector('.lv-t').textContent = main.src === 'clipper' ? `${main.who || 'Un clipper'}: «${inf0.slice(0, 90)}»` : main.info || 'Momento'; }
    const inf = c.querySelector('.lv-info');
    // resumen por tipo de señal (sin listar decenas de líneas)
    const line = t => { const sp = document.createElement('span'); sp.textContent = t; sp.title = t; return sp; };
    const views = g.items.reduce((a, x) => a + (+x.views || 0), 0);
    const by = {}; for (const x of g.items) (by[x.src] = by[x.src] || []).push(x);
    const rows = [];
    if (by.kick && !(by.kick.length === 1 && main.src === 'kick')) rows.push(`🎬 ${by.kick.length} clip${by.kick.length > 1 ? 's' : ''} de espectadores${by.kick.length > 1 ? ': ' + by.kick.filter(x => x !== main).slice(0, 4).map(x => '«' + (x.info || '').slice(0, 24) + '»').join(', ') : ''}`);
    if (by.chat) { const best = by.chat.reduce((a, x) => (x.conf || 0) > (a.conf || 0) ? x : a, by.chat[0]); rows.push(`💬 ${by.chat.length > 1 ? by.chat.length + ' explosiones del chat · ' : ''}${best.info || 'el chat ha explotado'}`); }
    if (by.clipper) rows.push(`📱 ${[...new Set(by.clipper.map(x => x.who || 'clipper'))].slice(0, 3).join(', ')} lo ${by.clipper.length > 1 ? 'han' : 'ha'} subido`);
    if (by.agente) rows.push(by.agente[0].req === 'Subrayado en la transcripción' ? '📝 Subrayado en la transcripción' : `🧑‍💼 Pediste: «${String(by.agente[0].req || '').slice(0, 100)}»`);
    if (by.ia) rows.push(`🤖 ${(by.ia.find(x => x !== main) || by.ia[0]).info || 'La IA lo ha visto'}`.slice(0, 120));
    if (views) rows.push(`👁 ${views.toLocaleString('es-ES')} visitas`);
    rows.forEach(t => inf.append(line(t)));
    const sample = (g.items.find(x => x.sample) || {}).sample;
    if (sample && sample.length) { const sp = line('💬 «' + sample.slice(0, 4).join(' · ') + '»'); sp.className = 'lv-chat'; inf.append(sp); }
    c.querySelector('.lv-bar i').style.width = Math.round(g.score * 100) + '%';
    const btn = c.querySelector('.lv-ed'), idx = list.length;
    list.push([s, g]);
    c.querySelector('.lv-see').onclick = () => { liveMarkOpen(g); liveAll = list; pvOpen(idx); };
    btn.onclick = () => { liveMarkOpen(g); liveEdit(s, g, btn); };
    c.querySelector('.lv-x').onclick = () => liveDrop(g);
    secGrid(secOf(g)).append(c);
  }
  livePrefetch(list);
  // clips de otros clippers que no estaban en lo grabado
  miss.innerHTML = '';
  const nf = S.flatMap(s => (s.clippers || []).filter(x => !x.found)).slice(-8).reverse();
  if (nf.length) {
    const h = document.createElement('p'); h.className = 'hint'; h.textContent = 'Clips de otros clippers que no he encontrado en lo grabado (de antes de empezar a grabar, o muy cambiados):'; miss.append(h);
    for (const x of nf) { const a = document.createElement('a'); a.href = x.url || '#'; a.target = '_blank'; a.rel = 'noopener'; a.className = 'lv-miss'; a.textContent = `📱 @${x.acc}: ${(x.title || '').slice(0, 80)} — ${x.why || ''}`; miss.append(a); }
  }
}
// pedir el clip al grabador y abrirlo editado por la IA
// pide al grabador el trozo del momento (una vez: luego se reutiliza para ver y para editar)
const liveCut = new Map(), liveCutting = new Map();
let liveGrabOn = false, livePreBusy = false;
// se van preparando solos los momentos más nuevos de cada sección (de uno en uno, sin saturar el grabador)
async function livePrefetch(list) {
  if (livePreBusy || !liveGrabOn || $('livePage').hidden || stOn()) return;   // en «Pantalla» no hay tarjetas que precargar
  const seen = {}, want = [], nowS = Date.now() / 1000;
  for (const [S, g] of list) { const k = [...g.kinds].join('+'); seen[k] = (seen[k] || 0) + 1; if (seen[k] <= 2 && nowS - g.t1 < 1200 && !liveCut.has(g.id) && !liveCutFail.has(g.id) && (S.segs || []).some(x => x.t1 > g.t0 && x.t0 < g.t1)) want.push([S, g]); }
  if (!want.length) return;
  livePreBusy = true;
  try { for (const [S, g] of want.slice(0, 3)) { try { await liveCutFile(S, g, true); } catch (e) { liveCutFail.add(g.id); } } }
  finally { livePreBusy = false; }
  for (const c of document.querySelectorAll('.lv-card')) if (liveCut.has(c.dataset.gid)) c.classList.add('ready');
}
const liveCutFail = new Set();
async function liveCutFile(S, g, pre) {
  if (liveCut.has(g.id)) { const c0 = liveCut.get(g.id); if (Date.now() - (c0.at || 0) < 10 * 60000) return c0; liveCut.delete(g.id); }   // el grabador borra las copias a los 15 min
  if (liveCutting.has(g.id)) return liveCutting.get(g.id);          // ya se está preparando: se espera a ese mismo
  const p = liveCutFile0(S, g, pre).finally(() => liveCutting.delete(g.id));
  liveCutting.set(g.id, p); return p;
}
async function liveCutFile0(S, g, pre) {
  // se corta con margen (45 s antes y 30 s después) para poder alargar el clip en el editor
  const id = 'q' + Date.now().toString(36), t0 = g.t0 - (g.tight ? 1.5 : 45), t1 = g.t1 + (g.tight ? 1.5 : 30);   // en automático se corta justo (archivo pequeño: se abre y exporta antes)
  await wfile(await S.h.getDirectoryHandle('req'), id + '.json', JSON.stringify({ t0, t1 }));
  for (let i = 0; i < (pre ? 80 : 360); i++) {
    await sleep(i < 40 ? 100 : 250);
    const o = JSON.parse((await rtext(S.h, 'out/' + id + '.json')) || 'null');
    if (!o) continue;
    if (o.error) throw new Error(o.error);
    const c = { f: await fileAt(S.h, o.file), off: Math.max(0, (o.offset || 0) + (g.t0 - t0)), dur: g.t1 - g.t0, at: Date.now() };
    liveCut.set(g.id, c);
    if (liveCut.size > 12) liveCut.delete(liveCut.keys().next().value);   // no acumular vídeos en memoria
    return c;
  }
  throw new Error('El grabador no responde: ¿tienes abierta la ventana del grabador?');
}
async function liveEdit(S, g, btn) {
  if (auBusy) { toast('El modo automático está terminando un clip: prueba en unos segundos'); return; }
  if (!$('stEd').hidden && stPend !== 'prep') { toast('Termina o cierra (✕) el clip que tienes abierto'); return; }
  // el panel de edición se abre ya y el clip se prepara mientras escribes el título
  pvClose(); stEdPend(g);
  try { const c = await liveCutFile(S, g); if (stPend !== g.id) return; await stEdOpen(S, g, c); }
  catch (e) { console.warn(e); $('seS').textContent = '⚠ No se pudo preparar el clip: ' + (e.message || e); stPend = null; }
}

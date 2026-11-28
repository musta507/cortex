/* ---------- Radar de clips: lo que está petando de tus streamers, lo suba quien lo suba ----------
   TikTok (búsqueda por nombre y por hashtag) lo mira la app de Cortex con una ventana escondida y tu cuenta secundaria de TikTok.
   Las cuentas de clippers, YouTube y los clips de Kick los mira el grabador. Todo gratis. Se ordena por visitas por hora. */
const RD_SRCS = [
  ['tt', 'TikTok · búsqueda', 'Busca el nombre del streamer en TikTok'],
  ['tag', 'TikTok · #hashtag', 'Los vídeos del hashtag del streamer'],
  ['accs', 'Cuentas de clippers', 'Las cuentas que pusiste en Ajustes → Directo'],
  ['yt', 'YouTube Shorts', 'Lo más nuevo en YouTube con su nombre'],
  ['kick', 'Clips de Kick', 'Los clips que hacen sus espectadores en Kick'],
];
const RD = { busy: false, st: {}, items: [], at: 0 };
const rdPref = (k, d) => { try { return JSON.parse(ezPref(k) || 'null') ?? d; } catch { return d; } };
const rdOn = () => rdPref('radarSrcs', { tt: true, tag: true, accs: true, yt: true, kick: true });
const rdApp = () => !!(window.cortexApp && window.cortexApp.radar);
async function rdWho() {
  const extra = rdPref('radarWho', []), mine = await lsMineSlugs(), all = [];
  for (const x of [...mine, ...extra]) { const k = String(x).trim().toLowerCase(); if (k && !all.includes(k)) all.push(k); }
  return all;
}
const rdSel = () => ezPref('radarSel') || '';
async function rdAccs() { const o = []; for (const c of clients) { for (const a of String((await getLive(c)).clippers || '').split(/[\s,;]+/)) { const x = a.trim(); if (x && !o.includes(x)) o.push(x); } } return o; }
// pedir al grabador algo de «descargas» (cuentas de TikTok) y leer lo que deja
async function dlAsk(body, ms = 240000, onMsg) {
  const d = await getLiveDir(false); if (!d) return { err: 'dir' };
  try { const v = JSON.parse((await rtext(d, 'descargas/vivo.json')) || 'null'); if (!v || Date.now() / 1000 - v.t > 20) return { err: 'grab' }; } catch { return { err: 'grab' }; }
  const id = 'r' + Date.now().toString(36), dd = await d.getDirectoryHandle('descargas', { create: true });
  await wfile(await dd.getDirectoryHandle('req', { create: true }), id + '.json', JSON.stringify(body));
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await sleep(1500);
    let o = null; try { o = JSON.parse((await rtext(dd, 'out/' + id + '.json')) || 'null'); } catch {}
    if (o && o.msg && onMsg) onMsg(o.msg);
    if (o && o.status === 'done') return { items: rjsonl((await rtext(d, o.file)) || ''), errors: o.errors };
    if (o && o.status === 'error') return { err: o.error || 'error' };
  }
  return { err: 'tarde' };
}
function rdStatus(k, txt, kind) { RD.st[k] = { txt, kind }; rdSrcsRender(); }
function rdSrcsRender() {
  const box = $('rdSrcs'); if (!box) return; box.innerHTML = ''; const on = rdOn();
  for (const [k, t, d] of RD_SRCS) {
    const s = RD.st[k] || {}, b = document.createElement('button'); b.type = 'button'; b.className = 'rd-src' + (on[k] ? ' on' : '') + (s.kind ? ' ' + s.kind : ''); b.title = d;
    b.innerHTML = '<i></i><b></b><em></em>'; b.children[1].textContent = t; b.children[2].textContent = on[k] ? (s.txt || '') : 'apagado';
    b.onclick = () => { const o = rdOn(); o[k] = !o[k]; ezPref('radarSrcs', JSON.stringify(o)); rdSrcsRender(); };
    box.append(b);
  }
  const need = Object.entries(RD.st).find(([, s]) => s.kind === 'login' || s.kind === 'captcha');
  if (need && rdApp()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'primary rd-login';
    b.textContent = need[1].kind === 'captcha' ? 'Resolver la verificación de TikTok' : 'Iniciar sesión en TikTok';
    b.onclick = () => window.cortexApp.radarShow(need[1].kind === 'captcha' ? '' : 'https://www.tiktok.com/login'); box.append(b);
  }
}
async function rdWhoRender() {
  const box = $('rdWho'); if (!box) return; const who = await rdWho(), sel = rdSel(); box.innerHTML = '';
  const chip = (k, t) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lv-chip' + (sel === k ? ' on' : ''); b.textContent = t; b.onclick = () => { ezPref('radarSel', k); rdWhoRender(); rdListRender(); }; box.append(b); };
  chip('', 'Todos'); for (const w of who) chip(w, w);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'lv-chip add'; add.textContent = '＋'; add.title = 'Añadir un streamer al radar';
  add.onclick = () => {
    const old = document.querySelector('.lv-addpop'); if (old) { old.remove(); return; }
    const p = document.createElement('div'); p.className = 'lv-addpop'; p.innerHTML = '<input type="text" placeholder="Nombre del streamer, por ejemplo: westcol" autocomplete="off" spellcheck="false"><button type="button" class="primary">Añadir</button>';
    const r = add.getBoundingClientRect(); p.style.left = Math.max(12, Math.min(innerWidth - 340, r.left)) + 'px'; p.style.top = (r.bottom + 8) + 'px'; document.body.append(p);
    const inp = p.firstChild, close = () => { p.remove(); document.removeEventListener('pointerdown', out, true); }, out = e => { if (!p.contains(e.target) && e.target !== add) close(); };
    document.addEventListener('pointerdown', out, true); inp.focus();
    const save = () => { const v = inp.value.trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//, '').split(/[/?#]/)[0]; if (!v) { inp.focus(); return; } const x = rdPref('radarWho', []); if (!x.includes(v)) x.push(v); ezPref('radarWho', JSON.stringify(x)); ezPref('radarSel', v); close(); rdWhoRender(); rdListRender(); };
    p.lastChild.onclick = save; inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') close(); });
  };
  box.append(add);
}
const rdFmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' M' : n >= 1000 ? Math.round(n / 1000) + ' mil' : String(Math.round(n));
const rdAgo = ts => { const h = (Date.now() / 1000 - ts) / 3600; return h < 1 ? `hace ${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} días`; };
function rdListRender() {
  const box = $('rdList'); if (!box) return; box.innerHTML = '';
  const hrs = +$('rdHours').value || 24, sel = rdSel(), now = Date.now() / 1000;
  let list = RD.items.filter(x => x.ts && now - x.ts <= hrs * 3600 && (!sel || x.who === sel));
  list.forEach(x => x.vph = x.views / Math.max(0.5, (now - x.ts) / 3600));
  list.sort((a, b) => b.vph - a.vph);
  if (!list.length) { const e = document.createElement('div'); e.className = 'ls-empty'; e.textContent = RD.busy ? 'Buscando…' : RD.at ? 'No hay clips en este tiempo. Prueba con 48 h o 7 días.' : 'Pulsa «Buscar ahora» para ver qué está petando.'; box.append(e); return; }
  const SRC = { tiktok: 'TikTok', youtube: 'YouTube', kick: 'Kick' };
  for (const x of list.slice(0, 80)) {
    const c = document.createElement('div'); c.className = 'rd-card';
    c.innerHTML = `<div class="rd-th"><span class="rd-src-b ${x.src}"></span><span class="rd-vph"></span></div><div class="rd-in"><b class="rd-v"></b><span class="rd-d"></span><span class="rd-m"></span><div class="rd-act"><button type="button" class="primary rd-mk">Hacer mi versión</button><button type="button" class="rd-see">Ver</button></div></div>`;
    c.querySelector('.rd-src-b').textContent = SRC[x.src] || x.src;
    c.querySelector('.rd-vph').textContent = rdFmt(x.vph) + '/h';
    c.querySelector('.rd-v').textContent = rdFmt(x.views) + ' visitas';
    c.querySelector('.rd-d').textContent = x.desc || '(sin texto)';
    c.querySelector('.rd-m').textContent = `@${x.acc || '?'} · ${rdAgo(x.ts)}${x.who && !sel ? ' · ' + x.who : ''}`;
    if (x.thumb) { const i = new Image(); i.alt = ''; i.referrerPolicy = 'no-referrer'; i.onload = () => c.querySelector('.rd-th').prepend(i); i.src = x.thumb; }
    c.querySelector('.rd-see').onclick = () => window.open(x.url, '_blank', 'noopener');
    c.querySelector('.rd-mk').onclick = () => { setHomeSec('replicar'); $('repVirUrl').value = x.url; repLink('vir'); toast('Descargando el clip viral. Elige el directo o vídeo en crudo de donde sale'); };
    box.append(c);
  }
}
function rdLastRender() { const e = $('rdLast'); if (e) e.textContent = RD.busy ? 'Buscando…' : RD.at ? 'Última búsqueda: ' + rdAgo(RD.at / 1000).replace('hace ', 'hace ') : ''; }
async function rdRun(quiet) {
  if (RD.busy) return; RD.busy = true; RD.st = {}; rdLastRender(); rdListRender();
  const hrs = +$('rdHours').value || 24, on = rdOn(), who = await rdWho(), sel = rdSel(), targets = sel ? [sel] : who, found = new Map(), before = new Set(RD.items.map(x => x.url));
  const add = (arr, w) => { for (const x of arr || []) if (x && x.url) { const o = found.get(x.url); found.set(x.url, { ...(o || {}), ...x, who: (o && o.who) || w }); } };
  if (!targets.length) { toast('Añade primero un streamer con «＋»'); RD.busy = false; rdLastRender(); return; }
  const jobs = [];
  // TikTok, por la app (una búsqueda detrás de otra, sin prisa)
  if (on.tt || on.tag) {
    if (!rdApp()) { if (on.tt) rdStatus('tt', 'solo en la app de Cortex', 'off'); if (on.tag) rdStatus('tag', 'solo en la app de Cortex', 'off'); }
    else jobs.push((async () => {
      for (const [k, kind] of [['tt', 'search'], ['tag', 'tag']]) {
        if (!on[k]) continue; let n = 0; rdStatus(k, 'buscando…', 'busy');
        for (const w of targets) {
          const r = await window.cortexApp.radar({ kind, q: kind === 'tag' ? w.replace(/\s+/g, '') : w, max: 60 }).catch(e => ({ ok: false, error: e.message }));
          if (r.login) { rdStatus(k, 'TikTok pide iniciar sesión', 'login'); break; }
          if (r.captcha) { rdStatus(k, 'TikTok pide una verificación', 'captcha'); break; }
          if (!r.ok) { rdStatus(k, 'no ha ido: ' + (r.error || ''), 'bad'); continue; }
          add(r.items, w); n += (r.items || []).length; rdStatus(k, n === 1 ? '1 vídeo' : n + ' vídeos', 'ok'); rdListRender();
        }
      }
    })());
  }
  // YouTube y Kick, por el grabador
  for (const [k, kind] of [['yt', 'radar_yt'], ['kick', 'radar_kick']]) {
    if (!on[k]) continue;
    jobs.push((async () => {
      let n = 0; rdStatus(k, 'buscando…', 'busy');
      for (const w of targets) {
        const r = await ksAsk({ kind, q: w, hours: hrs }, 260000);
        if (r.err) { rdStatus(k, r.err === 'grab' ? 'abre el grabador (versión 34 o más nueva)' : r.err === 'dir' ? 'falta la carpeta del grabador' : 'no contesta', 'off'); return; }
        add(r.items, w); n += (r.items || []).length; rdStatus(k, n === 1 ? '1 vídeo' : n + ' vídeos', 'ok'); rdListRender();
      }
    })());
  }
  // cuentas de clippers (el grabador ya sabe leerlas)
  if (on.accs) jobs.push((async () => {
    const accs = await rdAccs(); if (!accs.length) { rdStatus('accs', 'no hay cuentas puestas', 'off'); return; }
    rdStatus('accs', 'leyendo ' + accs.length + ' cuentas…', 'busy');
    const r = await dlAsk({ kind: 'perfil', accounts: accs, max: 15 }, 300000, m => rdStatus('accs', m, 'busy'));
    if (r.err) { rdStatus('accs', r.err === 'grab' ? 'abre el grabador' : 'no ha ido', 'off'); return; }
    const arr = r.items.map(x => ({ id: x.id, url: x.url, acc: x.acc, desc: x.desc, ts: x.ts, views: x.views || 0, likes: x.likes || 0, dur: x.dur, thumb: '', src: /youtu/.test(x.url) ? 'youtube' : 'tiktok' }));
    // de quién habla cada vídeo: si el texto nombra a un streamer, va con él
    for (const x of arr) { const d = (x.desc || '').toLowerCase(); x.who = targets.find(w => d.includes(w)) || ''; }
    add(arr.filter(x => !sel || x.who === sel), ''); rdStatus('accs', arr.length === 1 ? '1 vídeo' : arr.length + ' vídeos', 'ok'); rdListRender();
  })());
  await Promise.all(jobs.map(j => j.catch(e => console.warn('radar', e))));
  // se juntan con lo anterior (las visitas se actualizan) y se guardan
  const m = new Map(RD.items.map(x => [x.url, x])); for (const [u, x] of found) m.set(u, { ...(m.get(u) || {}), ...x });
  const cut = Date.now() / 1000 - 8 * 86400; RD.items = [...m.values()].filter(x => x.ts > cut).slice(-1500); RD.at = Date.now();
  try { await kv.set('radar', { at: RD.at, items: RD.items }); } catch {}
  RD.busy = false; rdLastRender(); rdListRender();
  const fresh = [...found.values()].filter(x => !before.has(x.url) && x.ts && x.views / Math.max(0.5, (Date.now() / 1000 - x.ts) / 3600) > 5000);
  if (quiet && fresh.length) toast(`Radar: ${fresh.length} clip${fresh.length > 1 ? 's' : ''} nuevo${fresh.length > 1 ? 's' : ''} petando`);
}
async function rdRender() { rdWhoRender(); rdSrcsRender(); rdLastRender(); rdListRender(); }
setTimeout(async () => {
  if (!$('rd')) return;
  try { const s = await kv.get('radar'); if (s) { RD.items = s.items || []; RD.at = s.at || 0; } } catch {}
  $('rdGo').onclick = () => rdRun(false);
  $('rdHours').value = ezPref('radarHours') || '24'; $('rdHours').onchange = () => { ezPref('radarHours', $('rdHours').value); rdListRender(); };
  $('rdAuto').checked = ezPref('radarAuto') === '1'; $('rdAuto').onchange = () => ezPref('radarAuto', $('rdAuto').checked ? '1' : '0');
  setInterval(() => { if (ezPref('radarAuto') === '1' && !RD.busy && Date.now() - RD.at > 45 * 60000) rdRun(true); if (!$('home').hidden && homeSec === 'radar') rdLastRender(); }, 60000);
}, 0);

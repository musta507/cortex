/* ---------- pedirle un clip a la IA con tus palabras ---------- */
async function liveAsk() {
  const req = $('lvAskT').value.trim(), st = $('lvAskS'), go = $('lvAskGo');
  if (!req) { toast('Escribe qué clip quieres'); $('lvAskT').focus(); return; }
  if (!getGemKey()) { toast('Falta la clave de Gemini'); return; }
  const all = Object.values(liveSessions).sort((a, b) => b.status.started - a.status.started);
  const S = all.find(x => x.on) || all[0];
  if (!S || !S.segs || !S.segs.length) { toast('Aún no hay nada grabado'); return; }
  const span = +$('lvAskR').value, end = S.segs[S.segs.length - 1].t1;
  const segs = S.segs.filter(x => x.wav && (!span || x.t1 > end - span));
  // trozos de ~8 min, del más reciente al más antiguo
  const chunks = []; let cur = [];
  for (const x of [...segs].reverse()) { cur.unshift(x); if (cur[cur.length - 1].t1 - cur[0].t0 >= 480) { chunks.push(cur); cur = []; } }
  if (cur.length) chunks.push(cur);
  go.disabled = true; $('lvAskT').disabled = true;
  const cl = clients.find(c => c.name.toLowerCase() === String(S.status.client || '').toLowerCase()) || clientOf(curClient);
  const A = cl ? await getAgent(cl) : {};
  let found = [];
  try {
    for (let i = 0; i < chunks.length && !found.length; i++) {
      const ch = chunks[i], m0 = clockOf(ch[0].t0 - S.status.started), m1 = clockOf(ch[ch.length - 1].t1 - S.status.started);
      st.textContent = `🎧 Escuchando del minuto ${m0} al ${m1}… (${i + 1} de ${chunks.length})`;
      const parts = [];
      for (const x of ch) { try { parts.push(wavToF32(await (await fileAt(S.h, x.wav)).arrayBuffer()).a); } catch {} }
      if (!parts.length) continue;
      const n = parts.reduce((a, b) => a + b.length, 0), au = new Float32Array(n); let o = 0; for (const a of parts) { au.set(a, o); o += a.length; }
      const base = ch[0].t0;
      const res = await gemRetry(() => geminiJSON([{ inline_data: { mime_type: 'audio/wav', data: wavB64(au, 8000) } }, { text: `Son ${Math.round(n / 8000)} segundos de audio del directo de ${S.status.slug} (del minuto ${m0} al ${m1}).
${A.rules ? 'PAUTAS DEL CLIENTE (para que el clip quede como le gusta):\n' + String(A.rules).slice(0, 4000) + '\n' : ''}
El clipper te pide esto: «${req}»

Busca en este audio el momento o los momentos que pide y dime dónde empiezan y acaban (segundos dentro de este audio).
- Si dice cuánto debe durar, respétalo lo mejor posible sin cortar frases a medias.
- Si pide «muy corto» o similar: solo lo esencial (8–20 s). Si pide detalle o contexto: incluye lo necesario para entenderlo (puede durar varios minutos, máximo 4). Si no dice nada: un clip de un solo tema de 15–45 s.
- Que empiece justo cuando arranca lo que pide (sin introducciones que sobren) y acabe en el remate o la reacción.
- Si pide varios clips, da varios. Si lo que pide no está en este audio, found:false y lista vacía. No te lo inventes.
Para cada clip, un título corto en español latino que describa lo que pasa.
Responde solo JSON: {"found":true,"clips":[{"s":12,"e":40,"title":"...","why":"qué se dice y por qué encaja"}]}` }], 0.2, { models: [...GEM_MODELS] }));
      for (const c of (res && res.found !== false && res.clips) || []) {
        const a = +c.s, b = +c.e; if (!isFinite(a) || !isFinite(b) || b <= a) continue;
        found.push({ id: 'ag' + Date.now().toString(36) + found.length, src: 'agente', t0: base + a, t1: base + Math.min(b, a + 240), conf: 1, at: Date.now() / 1000, info: (c.title || 'Clip pedido') + (c.why ? ' — ' + c.why : ''), req });
      }
    }
    if (!found.length) { st.textContent = '🤷 No lo he encontrado en ese rango. Prueba a buscar en más tiempo o a describirlo de otra forma.'; return; }
    const old = (await rtext(S.h, 'moments_agente.jsonl')) || '';
    await wfile(S.h, 'moments_agente.jsonl', old + found.map(l => JSON.stringify(l)).join('\n') + '\n');
    S.moments = [...(S.moments || []), ...found]; found.forEach(m => liveSeen.add(m.id));
    st.textContent = `✅ ${found.length === 1 ? 'Clip listo' : found.length + ' clips listos'}: arriba, en «Lo que has pedido».`;
    liveRender(); $('lvMoments').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.warn(e);
    st.textContent = '⚠ ' + (e.message === 'QUOTA' ? 'Gemini no tiene saldo o has llegado al límite' : e.message === 'BADKEY' ? 'La clave de Gemini no vale' : 'No se pudo: ' + e.message);
  } finally { go.disabled = false; $('lvAskT').disabled = false; }
}
setTimeout(() => { if ($('lvAskGo')) { $('lvAskGo').onclick = liveAsk; $('lvAskT').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) liveAsk(); }); } }, 0);

/* ==================== APRENDER DE CLIPS VIRALES ====================
   1) El grabador lee las cuentas de otros clippers (visitas, likes, compartidos…) y se puntúa cada clip frente a la media de su cuenta.
   2) Gemini ve los que más y menos funcionaron y rellena una ficha a fondo (título, gancho, estructura, edición…).
   3) El código busca los patrones (qué tienen los que petan y no los que fracasan) y la IA redacta el manual del creador. */
let vlJob = null;
const vlKey = cl => 'viral:' + cl.id;
async function vlGet(cl) { let v = null; try { v = await kv.get(vlKey(cl)); } catch {} return Object.assign({ accs: '', max: 100, clips: [], stats: null, manual: null }, v || {}); }
async function vlSave(cl, v) { try { await kv.set(vlKey(cl), v); } catch (e) { console.warn(e); } }
const vlNum = n => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : String(n);
const vlX = x => '×' + (x >= 10 ? Math.round(x) : x.toFixed(1).replace('.', ','));
// nota de cada clip: visitas frente a la mediana de su cuenta (los de menos de 12 horas aún están creciendo y no cuentan)
function vlScore(v) {
  const now = Date.now() / 1000, byAcc = {};
  for (const c of v.clips) { c.ok = c.views != null && (!c.ts || now - c.ts > 12 * 3600); if (c.ok) (byAcc[c.acc] = byAcc[c.acc] || []).push(c.views); }
  const med = {}; for (const [a, l] of Object.entries(byAcc)) { l.sort((x, y) => x - y); med[a] = Math.max(1, l[Math.floor(l.length / 2)]); }
  for (const c of v.clips) c.score = c.ok && med[c.acc] ? c.views / med[c.acc] : null;
  const el = v.clips.filter(c => c.score != null).sort((a, b) => b.score - a.score), k = Math.max(1, Math.round(el.length * 0.2));
  for (const c of v.clips) c.group = null;
  el.slice(0, k).forEach(c => c.group = 'top'); el.slice(-k).forEach(c => { if (c.group !== 'top') c.group = 'bottom'; });
  v.med = med;
}
async function vlCollect(cl) {
  const v = await vlGet(cl), accs = $('vlAccs').value.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
  if (!accs.length) { toast('Pon al menos una cuenta'); return; }
  v.accs = $('vlAccs').value; v.max = +$('vlMax').value || 100; await vlSave(cl, v);
  const st = $('vlStatus'), say = m => st.textContent = m;
  $('vlGo').disabled = true;
  try {
    let dir = await getLiveDir(true);
    if (!dir) { dir = await pickLiveDir(); if (!dir) throw new Error('falta la carpeta del grabador'); }
    // asegura que el grabador abierto es nuevo (reutiliza la espera de grabFetch)
    const id = 'p' + Date.now().toString(36);
    await grabWaitReady(dir, say);
    const dd = await dir.getDirectoryHandle('descargas', { create: true }), rq = await dd.getDirectoryHandle('req', { create: true });
    await wfile(rq, id + '.json', JSON.stringify({ kind: 'perfil', accounts: accs, max: v.max }));
    say('Pidiendo las listas al grabador…');
    let o = null; const t0 = Date.now(); vlStopReq = false; $('vlStopCol').hidden = false;
    for (;;) {
      await sleep(1500);
      if (vlStopReq) { try { await wfile(rq, id + '.stop', '1'); } catch {} o = { file: 'descargas/perfiles/' + id + '.jsonl', errors: {} }; break; }
      o = JSON.parse(await rtext(dir, 'descargas/out/' + id + '.json') || 'null');
      if (!o) { if (Date.now() - t0 > 60000) throw new Error('El grabador no responde. ¿Está abierta su ventana?'); continue; }
      if (o.status === 'error') throw new Error(o.error || 'error');
      if (o.status === 'done') break;
      const mins = Math.round((Date.now() - t0) / 60000);
      say((o.msg || 'Leyendo…') + (mins ? ` · llevo ${mins} min (puedes pulsar «Parar y quedarme con lo recogido» cuando quieras)` : ''));
    }
    const recs = rjsonl(await rtext(dir, o.file));
    const old = new Map(v.clips.map(c => [c.id, c]));
    for (const r of recs) { const c = old.get(r.id); if (c) Object.assign(c, r); else { v.clips.push(r); old.set(r.id, r); } }
    vlScore(v); await vlSave(cl, v);
    const errs = Object.entries(o.errors || {});
    say(`✓ ${recs.length} vídeos leídos (${v.clips.length} en total).` + (errs.length ? ` No he podido leer: ${errs.map(([a, e]) => a + ' (' + e.slice(0, 80) + ')').join(' · ')}` : ''));
  } catch (e) { say('No se pudo: ' + e.message); }
  finally { $('vlGo').disabled = false; $('vlStopCol').hidden = true; vlStopReq = false; renderViral(cl); }
}
var vlStopReq = false;
// importar todo lo que el grabador ya haya leído (aunque no terminara)
async function vlImport(cl) {
  const dir = await getLiveDir(true); if (!dir) { toast('Elige la carpeta del grabador'); return; }
  let pd; try { pd = await (await dir.getDirectoryHandle('descargas')).getDirectoryHandle('perfiles'); } catch { toast('Todavía no hay nada recogido'); return; }
  const v = await vlGet(cl), old = new Map(v.clips.map(c => [c.id, c])); let n = 0;
  for await (const [name, fh] of pd.entries()) {
    if (!name.endsWith('.jsonl')) continue;
    for (const r of rjsonl(await (await fh.getFile()).text())) { const c = old.get(r.id); if (c) Object.assign(c, r); else { v.clips.push(r); old.set(r.id, r); n++; } }
  }
  vlScore(v); await vlSave(cl, v);
  $('vlStatus').textContent = `✓ Importados ${n} vídeos nuevos (${v.clips.length} en total).`;
  renderViral(cl);
}
async function grabWaitReady(dir, say) {
  try { await writeGrabadorFiles(); } catch {}
  for (let i = 0; ; i++) {
    const v = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
    if (v && Date.now() / 1000 - v.t < 15 && (v.v || 0) >= 25) return;
    say(v && (v.v || 0) < 25 ? 'Hay una versión nueva del Grabador Clipzi: cierra su ventana negra y vuelve a abrir «Grabador Clipzi.bat». Yo espero…' : 'Abre el Grabador Clipzi (doble clic en «Grabador Clipzi.bat») y déjalo abierto. Yo espero…');
    if (i >= 300) throw new Error('El grabador no se ha abierto');
    await sleep(2000);
  }
}

// ---------- ficha a fondo de cada clip (Gemini ve el vídeo entero) ----------
const VL_PROMPT = `Eres analista de clips virales de TikTok de streamers hispanos. Mira este clip ENTERO (imagen y sonido) y rellena una ficha con DATOS COMPROBABLES, no opiniones. No sabes cuántas visitas tuvo: no lo adivines.
Si un dato no se puede saber, pon null. Usa SOLO los valores indicados cuando hay opciones.
Responde solo JSON con esta forma:
{"transcripcion":"todo lo que se dice, literal",
"titulo":{"hay":true/false,"texto":"el texto fijo que va encima del vídeo, exacto","estructura":"el título como plantilla, con los huecos en MAYÚSCULAS entre corchetes, p. ej. «[INVITADO] se enoja con [STREAMER] porque [MOTIVO]» o «[STREAMER] revela cuánto [DINERO]»","tipo_frase":"accion|dice_que|reacciona|revela|confiesa|pregunta|cita|pov|cuando|lista|otro","nombre_streamer":"inicio|medio|final|no_aparece","otros_nombres":true/false,"verbo":"verbo principal","verbo_fuerza":"fuerte|medio|suave","curiosidad":"deja_algo_sin_contar|promete_conflicto|lo_cuenta_todo","fiel":"fiel|exagera|clickbait","registro":"jerga_latina|neutro|españa","cifra":true/false,"palabras":número,"lineas":número,"mayusculas":true/false,"palabras_color":["..."],"tipo_color":["nombre|verbo|cifra|polemica|objeto|otra"],"emojis":["..."],"emoji_pos":"inicio|medio|final|ninguno","signos":"ninguno|exclamacion|interrogacion|puntos_suspensivos|comillas"},
"gancho":{"primera_frase":"lo primero que se dice, literal","audio":"grito|frase_fuerte|pregunta|risa|frase_normal|silencio|musica","visual":"cara_cerca|reaccion|pantalla|texto|plano_general","segundo_fuerte":número (segundo del primer momento fuerte),"teaser":true/false (empieza con un adelanto de algo que pasa después)},
"estructura":{"partes":[{"tipo":"contexto|tension|remate|reaccion","s":número,"e":número}],"termina_en_remate":true/false,"se_alarga":true/false,"fuerte_en":"inicio|medio|final","palabras_seg":número,"cortes":número de cortes de montaje},
"tema":["dinero|mujeres|relaciones|polemica|otro_streamer|famoso|casino|apuestas|humor|historia|consejo|familia|comida|futbol|musica|videojuego|viaje|compras|insulto|otro"],
"emocion":"risa|rabia|sorpresa|morbo|tension|verguenza|ternura|orgullo|otra",
"personas":número de personas que se ven,"invitados":["nombres si se dicen o se ven"],
"formato":"podcast|reaccion|dividida|dos_personas|horizontal|solo_camara|otro",
"subtitulos":"palabra_a_palabra|frase|ninguno",
"edicion":{"zooms":true/false,"efectos_sonido":true/false,"stickers_emojis":true/false,"musica_fondo":true/false,"marca_agua":"texto de marca de agua o @ si hay"},
"duracion":número de segundos,
"resumen":"qué pasa en el clip, en una frase"}`;
async function vlAnalyzeOne(c, say) {
  const r = await grabFetch(c.url, null, null, say, { low: true });
  let f = r.file;
  try {
    if (f.size > 14e6) throw new Error('el vídeo pesa demasiado (' + Math.round(f.size / 1e6) + ' MB)');
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(f); });
    say('La IA está viendo el clip…');
    const desc = c.desc ? `\nDescripción que puso el clipper: «${c.desc.slice(0, 300)}».` : '';
    return await gemRetry(() => geminiJSON([{ inline_data: { mime_type: f.type || 'video/mp4', data: b64 } }, { text: VL_PROMPT + desc }], 0.1), m => say(m));
  } finally {
    try { const dir = await getLiveDir(false); const dd = await dir.getDirectoryHandle('descargas'); await dd.removeEntry(r.handle.name); } catch {}   // no ocupar espacio
  }
}
async function vlAnalyze(cl, limit, everything) {
  if (vlJob) return;
  if (!getGemKey()) { toast('Primero pon tu clave de Gemini'); return; }
  const v = await vlGet(cl); vlScore(v);
  // se alternan top y peores para que con pocos ya se pueda comparar
  const top = v.clips.filter(c => c.group === 'top' && !c.ficha && !c.fichaErr), bot = v.clips.filter(c => c.group === 'bottom' && !c.ficha && !c.fichaErr);
  const todo = []; for (let i = 0; i < Math.max(top.length, bot.length); i++) { if (top[i]) todo.push(top[i]); if (bot[i]) todo.push(bot[i]); }
  const list = everything ? v.clips.filter(c => !c.ficha && !c.fichaErr && c.url).sort((a, b) => (b.score || 0) - (a.score || 0)) : todo.slice(0, limit);
  if (!list.length) { toast('No quedan clips elegidos por analizar'); return; }
  vlJob = { cancel: false }; const st = $('vlStatus'); renderViral(cl);
  let done = 0;
  for (const c0 of list) {
    if (vlJob.cancel) break;
    const say = m => st.textContent = `Analizando ${done + 1} de ${list.length} · @${c0.acc} · ${m}`;
    try {
      const fi = await vlAnalyzeOne(c0, say);
      const v2 = await vlGet(cl), c = v2.clips.find(x => x.id === c0.id);
      if (c) { c.ficha = fi && typeof fi === 'object' ? (Array.isArray(fi) ? fi[0] : fi) : null; delete c.fichaErr; await vlSave(cl, v2); }
      done++;
    } catch (e) {
      console.warn('ficha', e);
      if (e.message === 'QUOTA' || e.message === 'BADKEY' || e.message === 'NET') { st.textContent = e.message === 'QUOTA' ? 'Se ha acabado el límite de Gemini por hoy. Lo hecho está guardado: sigue mañana con el mismo botón.' : e.message === 'BADKEY' ? 'Tu clave de Gemini no funciona.' : 'Sin conexión.'; break; }
      const v2 = await vlGet(cl), c = v2.clips.find(x => x.id === c0.id); if (c) { c.fichaErr = String(e.message || e).slice(0, 160); await vlSave(cl, v2); }
    }
    renderViral(cl, true);
  }
  if (!/límite|clave|conexión/.test(st.textContent)) st.textContent = `✓ Datos extraídos de ${done} clips${vlJob.cancel ? ' (parado)' : ''}. Ya puedes descargar el informe.`;
  vlJob = null; renderViral(cl);
}

// ---------- patrones: qué tienen los que petan y no los que fracasan ----------
function vlFeatures(c) {
  const f = c.ficha || {}, t = f.titulo || {}, g = f.gancho || {}, e = f.estructura || {}, ed = f.edicion || {}, out = [];
  const add = (grupo, val) => { if (val == null || val === '' || (Array.isArray(val) && !val.length)) return; for (const x of [].concat(val)) if (x != null && x !== '') out.push(grupo + ': ' + String(x).replace(/_/g, ' ')); };
  const bucket = (n, cuts, labels) => { if (n == null || !isFinite(+n)) return null; n = +n; for (let i = 0; i < cuts.length; i++) if (n < cuts[i]) return labels[i]; return labels[labels.length - 1]; };
  const dur = f.duracion || c.dur;
  add('Duración', bucket(dur, [15, 25, 40, 60], ['menos de 15 s', '15–25 s', '25–40 s', '40–60 s', 'más de 60 s']));
  add('Título', t.hay === false ? 'sin título' : null);
  if (t.hay !== false && (t.texto || t.estructura)) {
    add('Título · tipo de frase', t.tipo_frase); add('Título · nombre del streamer', t.nombre_streamer); add('Título · otros nombres', t.otros_nombres ? 'sí' : t.otros_nombres === false ? 'no' : null);
    add('Título · fuerza del verbo', t.verbo_fuerza); add('Título · curiosidad', t.curiosidad); add('Título · fiel al contenido', t.fiel); add('Título · registro', t.registro);
    add('Título · cifra', t.cifra ? 'sí' : t.cifra === false ? 'no' : null);
    add('Título · palabras', bucket(t.palabras, [6, 9, 12, 16], ['menos de 6', '6–8', '9–11', '12–15', '16 o más']));
    add('Título · líneas', t.lineas ? (t.lineas >= 3 ? '3 o más' : String(t.lineas)) : null);
    add('Título · mayúsculas', t.mayusculas ? 'todo en mayúsculas' : t.mayusculas === false ? 'normal' : null);
    add('Título · palabras en color', Array.isArray(t.palabras_color) ? (t.palabras_color.length ? (t.palabras_color.length >= 3 ? '3 o más' : String(t.palabras_color.length)) : 'ninguna') : null);
    add('Título · qué va en color', t.tipo_color); add('Título · emoji', Array.isArray(t.emojis) ? (t.emojis.length ? t.emojis.slice(0, 2) : 'sin emoji') : null); add('Título · posición del emoji', t.emoji_pos); add('Título · signos', t.signos);
  }
  add('Gancho · se oye primero', g.audio); add('Gancho · se ve primero', g.visual); add('Gancho · adelanto', g.teaser ? 'sí' : g.teaser === false ? 'no' : null);
  add('Gancho · momento fuerte', bucket(g.segundo_fuerte, [1, 3, 6], ['antes del segundo 1', 'segundo 1–3', 'segundo 3–6', 'después del segundo 6']));
  add('Estructura · termina en el remate', e.termina_en_remate ? 'sí' : e.termina_en_remate === false ? 'no' : null); add('Estructura · se alarga después', e.se_alarga ? 'sí' : e.se_alarga === false ? 'no' : null);
  add('Estructura · lo fuerte está al', e.fuerte_en); add('Estructura · ritmo', bucket(e.palabras_seg, [1.5, 2.5, 3.5], ['lento', 'normal', 'rápido', 'muy rápido']));
  add('Estructura · cortes', bucket(e.cortes, [1, 3, 6], ['sin cortes', '1–2', '3–5', '6 o más']));
  add('Tema', f.tema); add('Emoción', f.emocion); add('Personas', f.personas != null ? (f.personas >= 3 ? '3 o más' : String(f.personas)) : null);
  add('Formato', f.formato); add('Subtítulos', f.subtitulos);
  add('Edición · zooms', ed.zooms ? 'sí' : ed.zooms === false ? 'no' : null); add('Edición · efectos de sonido', ed.efectos_sonido ? 'sí' : ed.efectos_sonido === false ? 'no' : null);
  add('Edición · stickers o emojis', ed.stickers_emojis ? 'sí' : ed.stickers_emojis === false ? 'no' : null); add('Edición · música de fondo', ed.musica_fondo ? 'sí' : ed.musica_fondo === false ? 'no' : null);
  return [...new Set(out)];
}
function vlMetaFeatures(c) {
  const out = [], d = c.ts ? new Date(c.ts * 1000) : null;
  if (d) { const h = d.getHours(); out.push('Hora de subida: ' + (h < 6 ? 'madrugada (0–6 h)' : h < 12 ? 'mañana (6–12 h)' : h < 18 ? 'tarde (12–18 h)' : 'noche (18–24 h)')); out.push('Día de subida: ' + ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()]); }
  if (c.dur) { const n = +c.dur; out.push('Duración (todas): ' + (n < 15 ? 'menos de 15 s' : n < 25 ? '15–25 s' : n < 40 ? '25–40 s' : n < 60 ? '40–60 s' : 'más de 60 s')); }
  const tags = (c.desc || '').match(/#\w+/g) || []; out.push('Hashtags: ' + (tags.length === 0 ? 'ninguno' : tags.length <= 3 ? '1–3' : '4 o más'));
  if (c.track) out.push('Música: ' + (/original|sonido original|original sound/i.test(c.track) ? 'sonido original' : 'canción'));
  return out;
}
// para cada rasgo: cuánto rinden los clips que lo tienen frente a la media (media de logaritmos: un viral enorme no lo distorsiona todo)
function vlStatsOf(items, featFn, minN) {
  const all = items.map(c => ({ c, lr: Math.log2(Math.max(0.01, c.score)), fs: featFn(c) }));
  if (all.length < 4) return [];
  const mu = all.reduce((a, x) => a + x.lr, 0) / all.length, map = new Map();
  const nTop = all.filter(x => x.c.group === 'top').length || 1, nBot = all.filter(x => x.c.group === 'bottom').length || 1;
  for (const x of all) for (const f of x.fs) { const m = map.get(f) || { f, n: 0, s: 0, top: 0, bot: 0, ex: [] }; m.n++; m.s += x.lr; if (x.c.group === 'top') m.top++; if (x.c.group === 'bottom') m.bot++; m.ex.push(x.c); map.set(f, m); }
  return [...map.values()].filter(m => m.n >= minN).map(m => ({ f: m.f, n: m.n, lift: Math.pow(2, m.s / m.n - mu), pTop: m.top / nTop, pBot: m.bot / nBot, ex: m.ex.sort((a, b) => b.score - a.score).slice(0, 3).map(c => c.id) }));
}
function vlPatterns(v) {
  vlScore(v);
  const an = v.clips.filter(c => c.ficha && !c.wrong && c.score != null);
  const meta = v.clips.filter(c => c.score != null);
  const minN = Math.max(3, Math.round(an.length * 0.06));
  const deep = vlStatsOf(an, vlFeatures, minN), metaS = vlStatsOf(meta, vlMetaFeatures, Math.max(5, Math.round(meta.length * 0.04)));
  // estructuras de título: se agrupan por estructura (sin las palabras de relleno) y por tipo de frase
  const norm = s => String(s || '').toLowerCase().replace(/\[[^\]]+\]/g, m => m.toUpperCase()).replace(/[«»"“”.!¡?¿,:;…]/g, '').replace(/\s+/g, ' ').trim();
  const groups = new Map();
  for (const c of an) { const t = (c.ficha.titulo || {}); if (t.hay === false || !t.estructura) continue; const k = [t.tipo_frase || 'otro', t.nombre_streamer || '?', t.curiosidad || '?'].join(' · '); const g = groups.get(k) || { k, items: [] }; g.items.push(c); groups.set(k, g); }
  const mu = an.length ? an.reduce((a, c) => a + Math.log2(Math.max(0.01, c.score)), 0) / an.length : 0;
  const titleGroups = [...groups.values()].filter(g => g.items.length >= 2).map(g => ({ k: g.k, n: g.items.length, lift: Math.pow(2, g.items.reduce((a, c) => a + Math.log2(Math.max(0.01, c.score)), 0) / g.items.length - mu), ej: g.items.sort((a, b) => b.score - a.score).slice(0, 3).map(c => ({ t: c.ficha.titulo.texto, e: norm(c.ficha.titulo.estructura), x: c.score })) })).sort((a, b) => b.lift - a.lift);
  const topTitles = an.filter(c => c.group === 'top' && c.ficha.titulo && c.ficha.titulo.texto).sort((a, b) => b.score - a.score).slice(0, 15).map(c => ({ t: c.ficha.titulo.texto, e: c.ficha.titulo.estructura, x: c.score }));
  const topHooks = an.filter(c => c.group === 'top' && c.ficha.gancho && c.ficha.gancho.primera_frase).sort((a, b) => b.score - a.score).slice(0, 12).map(c => ({ f: c.ficha.gancho.primera_frase, x: c.score, s: c.ficha.gancho.segundo_fuerte }));
  const badTitles = an.filter(c => c.group === 'bottom' && c.ficha.titulo && c.ficha.titulo.texto).slice(0, 10).map(c => c.ficha.titulo.texto);
  return { at: Date.now(), nAn: an.length, nMeta: meta.length, deep, meta: metaS, titleGroups, topTitles, topHooks, badTitles };
}
async function vlMakeManual(cl) {
  const v = await vlGet(cl), S = vlPatterns(v);
  if (S.nAn < 10) { toast('Analiza al menos 10 clips con la IA antes de sacar patrones'); return; }
  v.stats = S; await vlSave(cl, v); renderViral(cl);
  if (!getGemKey()) return;
  const st = $('vlStatus'); st.textContent = 'Redactando el manual con los datos…';
  const fmt = l => l.map(x => `- ${x.f}: ${x.n} clips, rinden ${x.lift.toFixed(2)}× la media; está en el ${Math.round(x.pTop * 100)} % de los que más petaron y en el ${Math.round(x.pBot * 100)} % de los que peor fueron`).join('\n');
  const good = S.deep.filter(x => x.lift >= 1.25).sort((a, b) => b.lift - a.lift).slice(0, 30), bad = S.deep.filter(x => x.lift <= 0.8).sort((a, b) => a.lift - b.lift).slice(0, 20);
  const prompt = `Eres el mejor clipper de TikTok de ${cl.name}. He analizado ${S.nAn} clips de otras cuentas de clippers de ${cl.name} (los que más y los que menos visitas tuvieron frente a la media de su cuenta) y estos son los DATOS. «Rinden 2×» = el doble de visitas que un clip normal de la misma cuenta.
LO QUE MÁS FUNCIONA:
${fmt(good) || '(nada claro)'}
LO QUE PEOR FUNCIONA:
${fmt(bad) || '(nada claro)'}
OTROS DATOS (de ${S.nMeta} clips, solo con sus números):
${fmt(S.meta.filter(x => x.lift >= 1.25 || x.lift <= 0.8).slice(0, 15)) || '(nada claro)'}
ESTRUCTURAS DE TÍTULO (tipo · dónde va el nombre · curiosidad):
${S.titleGroups.slice(0, 12).map(g => `- ${g.k}: ${g.n} clips, ${g.lift.toFixed(2)}×. Ejemplos: ${g.ej.map(e => '«' + e.t + '»').join(' ')}`).join('\n')}
TÍTULOS DE LOS QUE MÁS PETARON: ${S.topTitles.map(t => `«${t.t}» (${t.x.toFixed(1)}×, estructura: ${t.e || '?'})`).join(' | ')}
TÍTULOS DE LOS QUE PEOR FUERON: ${S.badTitles.map(t => '«' + t + '»').join(' | ')}
PRIMERAS FRASES DE LOS QUE MÁS PETARON: ${S.topHooks.map(h => `«${h.f}» (momento fuerte en el s ${h.s ?? '?'})`).join(' | ')}

Con esto escribe el MANUAL para un agente de IA que saca clips de ${cl.name}. Solo reglas que salgan de los datos (cita el dato entre paréntesis), concretas y accionables; si un dato tiene pocos clips, dilo como tendencia. No inventes nada que no esté en los datos.
Responde solo JSON:
{"resumen":"3-4 frases con lo más importante",
"reglas":[{"regla":"instrucción corta para el agente","dato":"el dato que la respalda","area":"titulo|gancho|estructura|duracion|tema|formato|edicion|otro"}],
"estructuras_titulo":[{"plantilla":"p. ej. [INVITADO] se enoja con [STREAMER] porque [MOTIVO]","ejemplo":"un título real de los datos","rinde":"2,4×"}],
"evitar":["cosas que hacen que un clip rinda poco, con su dato"],
"dudas":["cosas que los datos no dejan claras o que conviene comprobar con más clips"]}`;
  try {
    const o = await gemRetry(() => geminiJSON([{ text: prompt }], 0.3), m => st.textContent = m);
    const v2 = await vlGet(cl); v2.stats = S; v2.manual = Object.assign({ at: Date.now() }, o); await vlSave(cl, v2);
    st.textContent = '✓ Manual listo. Revísalo abajo y, si te convence, aplícalo al agente.';
  } catch (e) { st.textContent = 'No se pudo redactar el manual: ' + e.message; }
  renderViral(cl);
}
function vlManualText(m) {
  const r = (m.reglas || []).map(x => `- ${x.regla}${x.dato ? ' (' + x.dato + ')' : ''}`).join('\n');
  const ev = (m.evitar || []).map(x => '- Evitar: ' + x).join('\n');
  return [r, ev].filter(Boolean).join('\n').slice(0, 2200);
}
function vlTitleGuide(m) {
  return (m.estructuras_titulo || []).slice(0, 6).map(x => `- ${x.plantilla}${x.ejemplo ? ' · ejemplo real: «' + x.ejemplo + '»' : ''}${x.rinde ? ' (' + x.rinde + ')' : ''}`).join('\n');
}


// ---------- extracción GRATIS (todo en tu PC): transcripción (subtítulos de TikTok o Whisper) + título en pantalla (lector de texto) ----------
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let tessWorker = null;
async function ocrWorker() {
  if (tessWorker) return tessWorker;
  await loadScript(TESS_URL, 'Tesseract');
  tessWorker = await Tesseract.createWorker('spa');
  return tessWorker;
}
const vlNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
function vlSim(a, b) { a = vlNorm(a); b = vlNorm(b); if (!a || !b) return 0; return 1 - levDist(a, b) / Math.max(a.length, b.length); }
// fotogramas del vídeo (en el navegador, gratis)
async function vlFrames(file, times) {
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('no se puede leer el vídeo')); setTimeout(() => rej(new Error('el vídeo no carga')), 20000); });
    const D = v.duration || 10, out = [];
    for (const t0 of times(D)) {
      v.currentTime = Math.max(0, Math.min(D - 0.1, t0));
      await new Promise(r => { v.onseeked = r; setTimeout(r, 3000); });
      const c = document.createElement('canvas'), w = 1080; c.width = w; c.height = Math.round(w * v.videoHeight / v.videoWidth) || 1280;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); out.push(c);
    }
    return { frames: out, dur: D };
  } finally { URL.revokeObjectURL(v.src); }
}
// el título es el texto que se repite en los fotogramas (los subtítulos cambian y se descartan solos)
const VL_SHORT_OK = new Set(['a', 'y', 'o', 'e', 'u', 'de', 'el', 'la', 'lo', 'le', 'en', 'se', 'su', 'mi', 'tu', 'al', 'es', 'ya', 'no', 'si', 'sí', 'ni', 'un', 'me', 'te', 'va', 'ha', 'he', 'yo', 'ti', 'tú', 'él', 'qué', 'que', 've', 've']);
// limpia una línea leída: quita palabras dudosas, marcas de agua, @, «TikTok», contadores de visitas y símbolos sueltos
function vlCleanWords(words) {
  const out = [];
  for (const w of words || []) {
    let t = String(w.text || '').trim(); const cf = w.confidence || 0;
    if (!t || cf < 45) continue;
    if (/@|tiktok|clips?_|_{2,}/i.test(t)) continue;
    if (/^[\d.,:%+]+(mil|k|m|mill)?$/i.test(t) && !/^\d{1,2}$/.test(t)) continue;   // contadores («92,2 mil»); números cortos se dejan («4», «24»)
    t = t.replace(/^[^\p{L}\p{N}¿¡"«(]+|[^\p{L}\p{N}?!".»)…]+$/gu, '');
    if (!t) continue;
    const core = t.replace(/[^\p{L}\p{N}]/gu, '');
    if (!core) continue;
    if (core.length <= 2 && !VL_SHORT_OK.has(core.toLowerCase()) && !/^\d+$/.test(core) && cf < 85) continue;
    if (/^[A-ZÁÉÍÓÚÑ]{2,3}$/.test(core) && cf < 75) continue;   // «BEN», «CTE», «EN» sueltos de basura
    out.push(t);
  }
  return out.join(' ');
}
async function vlTitleOCR(frames) {
  const w = await ocrWorker(), per = [];
  for (const c of frames) {
    const { data } = await w.recognize(c);
    const ls = [];
    for (const l of data.lines || []) {
      const t = vlCleanWords(l.words);
      if (vlNorm(t).length < 3 || !/\p{L}{2}/u.test(t)) continue;
      const b = l.bbox || { y0: 0, y1: 0 };
      ls.push({ t, conf: l.confidence, y: b.y0 / c.height, y1: b.y1 / c.height, h: (b.y1 - b.y0) / c.height });
    }
    per.push(ls);
  }
  const seenIn = (l, fi, th) => per.filter((o, j) => j !== fi && o.some(x => vlSim(x.t, l.t) >= th)).length;
  // 1) líneas fijas: aparecen (parecidas) en al menos 2 fotogramas
  const keep = [];
  per.forEach((ls, fi) => { for (const l of ls) if (seenIn(l, fi, 0.8) >= 1 && !keep.some(k => vlSim(k.t, l.t) >= 0.75)) keep.push({ ...l, fi }); });
  // 2) líneas pegadas encima o debajo de las del título (la última línea suele leerse peor): con un parecido más flojo
  for (let pass = 0; pass < 2; pass++) per.forEach((ls, fi) => { for (const l of ls) {
    if (keep.some(k => vlSim(k.t, l.t) >= 0.6)) continue;
    const near = keep.some(k => Math.abs(l.y - k.y1) < Math.max(l.h, k.h) * 1.6 || Math.abs(k.y - l.y1) < Math.max(l.h, k.h) * 1.6);
    if (near && seenIn(l, fi, 0.55) >= 1) keep.push({ ...l, fi });
  } });
  keep.sort((a, b) => a.y - b.y);
  const title = keep.map(l => l.t).join(' ').replace(/\s+/g, ' ').trim();
  return { title, pos: keep.length ? (keep[0].y < 0.33 ? 'arriba' : keep[0].y < 0.66 ? 'centro' : 'abajo') : '', conf: keep.length ? Math.round(keep.reduce((a, l) => a + l.conf, 0) / keep.length) : 0 };
}
// subtítulos de TikTok (.vtt/.srt) a texto
function vlSubsText(txt) {
  const out = [];
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || /^WEBVTT/i.test(l) || /-->/.test(l) || /^\d+$/.test(l) || /^(NOTE|STYLE|Kind:|Language:)/i.test(l)) continue;
    const t = l.replace(/<[^>]+>/g, '').trim(); if (t && out[out.length - 1] !== t) out.push(t);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
async function vlFreeOne(c, say, pre) {
  const r = await (pre || grabFetch(c.url, null, null, say, { low: true, subs: true }));
  const dir = await getLiveDir(false), dd = await dir.getDirectoryHandle('descargas');
  const out = { at: Date.now() };
  try {
    // 1) transcripción: subtítulos de TikTok si los hay (instantáneo); si no, Whisper en tu PC
    const subs = (r.out && r.out.subs) || [];
    const pick = subs.find(s => /\.(spa|es)[^/]*\.(vtt|srt)$/i.test(s)) || subs.find(s => /\.(vtt|srt)$/i.test(s));
    if (pick) { try { out.transcripcion = vlSubsText(await rtext(dir, pick)); out.fuente = 'subtítulos de TikTok'; } catch {} }
    if (!out.transcripcion) {
      say('Transcribiendo con Whisper (en tu PC)…');
      try {
        const au = await decodeAudio16k(r.file);
        const res = await runAI(au, [{ id: 'onnx-community/whisper-base_timestamped', word: false }, { id: 'Xenova/whisper-base', word: false }], 'es', () => {}, () => {});
        out.transcripcion = String(res.text || '').replace(/\[[^\]]*\]|\([^)]*m[uú]sica[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim(); out.fuente = out.transcripcion.split(' ').length >= 3 ? 'Whisper' : 'Whisper (sin voz clara)';
      } catch (e) { out.transErr = String(e.message || e).slice(0, 120); }
    }
    // 2) título en pantalla: 3 fotogramas + lector de texto
    say('Leyendo el título del vídeo…');
    try {
      const { frames, dur } = await vlFrames(r.file, D => [Math.min(1, D * 0.08), Math.min(2.5, D * 0.2), Math.min(4, D * 0.3), D * 0.4, D * 0.65]);
      Object.assign(out, await vlTitleOCR(frames)); out.dur = Math.round(dur);
    } catch (e) { out.ocrErr = String(e.message || e).slice(0, 120); }
    // 3) nombres que salen (para saber quién aparece): hashtags + mayúsculas del título
    return out;
  } finally {
    for (const p of [r.out && r.out.file, ...(((r.out && r.out.subs) || []))].filter(Boolean)) { try { await dd.removeEntry(p.split('/').pop()); } catch {} }
    try { const b = (r.out.file || '').split('/').pop().replace(/\.[^.]+$/, ''); await dd.removeEntry(b + '.info.json'); } catch {}
  }
}
const VL_FREE_V = 2;   // si mejora la extracción, se vuelven a hacer los vídeos de versiones anteriores
const vlNeedsFree = c => c.url && (!c.free || (c.free.v || 1) < VL_FREE_V);
async function vlFreeAll(cl) {
  if (vlJob) return;
  const v = await vlGet(cl); vlScore(v);
  const list = v.clips.filter(c => vlNeedsFree(c)).sort((a, b) => (b.score || 0) - (a.score || 0));
  if (!list.length) { toast('Ya están extraídos todos los vídeos'); return; }
  vlJob = { cancel: false }; renderViral(cl, true);
  const st = $('vlStatus'), t0 = Date.now();
  let done = 0, fails = 0, pending = null;
  const fetchOf = (c, say) => grabFetch(c.url, null, null, say, { low: true, subs: true });
  for (let i = 0; i < list.length; i++) {
    if (vlJob.cancel) break;
    const c0 = list[i];
    const eta = done ? Math.round((Date.now() - t0) / done * (list.length - i) / 60000) : null;
    const say = m => st.textContent = `Extrayendo ${i + 1} de ${list.length}${eta != null ? ` · quedan ~${eta >= 60 ? Math.round(eta / 60) + ' h' : eta + ' min'}` : ''} · @${c0.acc} · ${m}`;
    try {
      const cur = pending || fetchOf(c0, say); pending = null;
      // mientras se analiza este, ya se va descargando el siguiente
      const nx = list[i + 1]; if (nx && !vlJob.cancel) { pending = fetchOf(nx, () => {}); pending.catch(() => {}); }
      const t1 = Date.now(), tick = setInterval(() => { const s = Math.round((Date.now() - t1) / 1000); if (s > 45) say(`este vídeo está tardando (${s} s)…`); if (document.hidden) st.textContent += ' · ⚠️ deja esta pestaña a la vista o irá muy lenta'; }, 5000);
      let data;
      try { data = await Promise.race([vlFreeOne(c0, say, cur), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 180000))]); }
      catch (e) { if (e.message === 'TIMEOUT') { try { if (tessWorker) await tessWorker.terminate(); } catch {} tessWorker = null; throw new Error('tardó demasiado: se salta'); } throw e; }
      finally { clearInterval(tick); }
      data.v = VL_FREE_V; c0.free = data; done++;
    } catch (e) { console.warn('extraer', e); c0.free = { err: String(e.message || e).slice(0, 160), at: Date.now(), v: VL_FREE_V }; fails++; if (/no responde|no se ha abierto|carpeta/i.test(e.message)) { st.textContent = 'El grabador no responde: ábrelo y vuelve a pulsar el botón (lo hecho está guardado).'; break; } }
    if ((done + fails) % 5 === 0) { const x = await vlGet(cl); const m = new Map(list.filter(y => y.free).map(y => [y.id, y.free])); x.clips.forEach(y => { if (m.has(y.id)) y.free = m.get(y.id); }); await vlSave(cl, x); renderViral(cl, true); }
  }
  const x = await vlGet(cl); const m = new Map(list.filter(y => y.free).map(y => [y.id, y.free])); x.clips.forEach(y => { if (m.has(y.id)) y.free = m.get(y.id); }); await vlSave(cl, x);
  if (!/no responde/.test(st.textContent)) st.textContent = `✓ Datos extraídos gratis de ${done} vídeos${fails ? ` (${fails} no se pudieron)` : ''}${vlJob.cancel ? ' · parado' : ''}. Ya puedes descargar el informe.`;
  vlJob = null; renderViral(cl);
}

// ---------- informe: todos los datos de cada vídeo en un documento (para analizarlo con cualquier IA) ----------
const VL_COLS = [
  ['Cuenta', c => '@' + c.acc], ['Enlace', c => c.url], ['Fecha de subida', c => c.ts ? new Date(c.ts * 1000).toLocaleString('es-ES') : ''],
  ['Visitas', c => c.views], ['Likes', c => c.likes], ['Comentarios', c => c.comments], ['Compartidos', c => c.shares], ['Guardados', c => c.saves],
  ['Visitas normales de la cuenta (mediana)', (c, v) => v.med && v.med[c.acc] ? Math.round(v.med[c.acc]) : ''],
  ['Rendimiento vs. su cuenta (×)', c => c.score != null ? +c.score.toFixed(2) : ''],
  ['Likes por visita (%)', c => c.views ? +(100 * (c.likes || 0) / c.views).toFixed(2) : ''],
  ['Compartidos por visita (%)', c => c.views ? +(100 * (c.shares || 0) / c.views).toFixed(3) : ''],
  ['Duración (s)', c => (c.ficha && c.ficha.duracion) || c.dur || (c.free && c.free.dur)], ['Descripción', c => (c.desc || '').replace(/#\w+/g, '').trim()], ['Hashtags', c => ((c.desc || '').match(/#\w+/g) || []).join(' ')],
  ['Sonido', c => c.track],
  ['Título en pantalla', c => F(c, 'titulo', 'texto') || (c.free && c.free.title) || ''], ['Posición del título', c => (c.free && c.free.pos) || ''], ['Estructura del título', c => F(c, 'titulo', 'estructura')], ['Tipo de frase', c => F(c, 'titulo', 'tipo_frase')],
  ['Nombre del streamer en el título', c => F(c, 'titulo', 'nombre_streamer')], ['Otros nombres en el título', c => F(c, 'titulo', 'otros_nombres')], ['Verbo principal', c => F(c, 'titulo', 'verbo')],
  ['Fuerza del verbo', c => F(c, 'titulo', 'verbo_fuerza')], ['Curiosidad del título', c => F(c, 'titulo', 'curiosidad')], ['Título fiel al contenido', c => F(c, 'titulo', 'fiel')],
  ['Palabras del título', c => F(c, 'titulo', 'palabras')], ['Líneas del título', c => F(c, 'titulo', 'lineas')], ['Título en mayúsculas', c => F(c, 'titulo', 'mayusculas')],
  ['Palabras en color', c => F(c, 'titulo', 'palabras_color')], ['Tipo de palabras en color', c => F(c, 'titulo', 'tipo_color')], ['Emojis del título', c => F(c, 'titulo', 'emojis')],
  ['Posición del emoji', c => F(c, 'titulo', 'emoji_pos')], ['Signos', c => F(c, 'titulo', 'signos')], ['Cifra en el título', c => F(c, 'titulo', 'cifra')], ['Registro', c => F(c, 'titulo', 'registro')],
  ['Primera frase', c => F(c, 'gancho', 'primera_frase')], ['Se oye primero', c => F(c, 'gancho', 'audio')], ['Se ve primero', c => F(c, 'gancho', 'visual')],
  ['Segundo del primer momento fuerte', c => F(c, 'gancho', 'segundo_fuerte')], ['Empieza con adelanto', c => F(c, 'gancho', 'teaser')],
  ['Partes (tipo s–e)', c => ((c.ficha && c.ficha.estructura && c.ficha.estructura.partes) || []).map(p => `${p.tipo} ${p.s}–${p.e}`).join(' | ')],
  ['Termina en el remate', c => F(c, 'estructura', 'termina_en_remate')], ['Se alarga después', c => F(c, 'estructura', 'se_alarga')], ['Lo fuerte está al', c => F(c, 'estructura', 'fuerte_en')],
  ['Palabras por segundo', c => F(c, 'estructura', 'palabras_seg')], ['Cortes de montaje', c => F(c, 'estructura', 'cortes')],
  ['Tema', c => F(c, null, 'tema')], ['Emoción', c => F(c, null, 'emocion')], ['Personas', c => F(c, null, 'personas')], ['Invitados', c => F(c, null, 'invitados')],
  ['Formato', c => F(c, null, 'formato')], ['Subtítulos', c => F(c, null, 'subtitulos')],
  ['Zooms', c => F(c, 'edicion', 'zooms')], ['Efectos de sonido', c => F(c, 'edicion', 'efectos_sonido')], ['Stickers o emojis', c => F(c, 'edicion', 'stickers_emojis')],
  ['Música de fondo', c => F(c, 'edicion', 'musica_fondo')], ['Marca de agua', c => F(c, 'edicion', 'marca_agua')],
  ['Qué pasa', c => F(c, null, 'resumen')], ['Error al extraer', c => (c.free && c.free.err) || ''], ['Fuente de la transcripción', c => c.ficha && c.ficha.transcripcion ? 'IA (Gemini)' : (c.free && c.free.fuente) || ''], ['Transcripción', c => F(c, null, 'transcripcion') || (c.free && c.free.transcripcion) || ''],
];
function F(c, g, k) { const f = c.ficha; if (!f) return ''; const o = g ? (f[g] || {}) : f; const x = o[k]; if (x == null) return ''; if (Array.isArray(x)) return x.join(', '); if (x === true) return 'sí'; if (x === false) return 'no'; return x; }
function vlDownload(name, text, type) { const b = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return b; }
async function vlExport(cl) {
  const v = await vlGet(cl); vlScore(v);
  if (!v.clips.length) { toast('Primero recoge los clips'); return; }
  const clips = v.clips.slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const day = new Date().toISOString().slice(0, 10), base = `Informe clips ${cl.name} ${day}`;
  // 1) tabla (CSV con «;», se abre en Excel, Google Sheets o cualquier IA)
  const esc = x => { const s = x == null ? '' : String(x).replace(/\r?\n/g, ' '); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '\ufeff' + [VL_COLS.map(c => esc(c[0])).join(';'), ...clips.map(c => VL_COLS.map(col => esc(col[1](c, v))).join(';'))].join('\r\n');
  // 2) documento de texto con todo, vídeo a vídeo (para pegarlo o subirlo a una IA)
  const nF = clips.filter(c => c.ficha).length, nFree = clips.filter(c => c.free && !c.free.err).length;
  let md = `# ${base}\n\nDatos de ${clips.length} vídeos de las cuentas ${[...new Set(clips.map(c => '@' + c.acc))].join(', ')}, recogidos con Cortex el ${new Date().toLocaleString('es-ES')}.\n` +
    `- Las visitas, likes, comentarios, compartidos y guardados son los que mostraba TikTok en ese momento.\n- «Rendimiento vs. su cuenta» = visitas del vídeo ÷ visitas normales (mediana) de esa cuenta. ×2 = el doble de lo normal. Vacío = el vídeo tenía menos de 12 horas.\n` +
    `- ${nFree} de los ${clips.length} vídeos tienen la transcripción (subtítulos de TikTok o Whisper) y el título que va escrito en pantalla (leído con un lector de texto en 3 fotogramas). Pueden tener algún error de lectura.\n` +
    (nF ? `- ${nF} vídeos tienen además una ficha completa hecha por una IA viendo el vídeo (estructura del título, gancho, partes, edición…).\n` : '') + `\n## Cuentas\n\n` +
    Object.entries(v.med || {}).map(([a, m]) => `- @${a}: ${clips.filter(c => c.acc === a).length} vídeos, visitas normales ${Math.round(m)}`).join('\n') + '\n\n## Vídeos (ordenados por rendimiento)\n';
  clips.forEach((c, i) => {
    md += `\n### ${i + 1}. @${c.acc} · ${c.score != null ? '×' + c.score.toFixed(2) : 'reciente'} · ${c.views ?? '?'} visitas\n\n`;
    for (const [k, fn] of VL_COLS) { if (k === 'Cuenta') continue; const val = fn(c, v); if (val === '' || val == null) continue; md += k === 'Transcripción' ? `- **${k}:**\n\n  > ${String(val).replace(/\n/g, ' ')}\n` : `- **${k}:** ${val}\n`; }
  });
  vlDownload(base + '.csv', csv, 'text/csv;charset=utf-8');
  await sleep(400);
  vlDownload(base + '.md', md, 'text/markdown;charset=utf-8');
  // copia en la carpeta del grabador (informes)
  try { const d = await getLiveDir(false); if (d) { const id = await d.getDirectoryHandle('informes', { create: true }); await wfile(id, base + '.csv', csv); await wfile(id, base + '.md', md); } } catch (e) { console.warn(e); }
  toast(`Informe descargado: ${clips.length} vídeos (${nFree} con transcripción y título)`);
}

// ---------- pantalla ----------
async function renderViral(cl, light) {
  const box = $('vlBox'); if (!box || !cl) return;
  const v = await vlGet(cl);
  if (!light) {
    if (!v.accs) { const all = []; for (const c of clients) { try { for (const a of String((await getLive(c)).clippers || '').split(/[\s,;]+/)) if (a.trim() && !all.includes(a.trim())) all.push(a.trim()); } catch {} } v.accs = all.join('\n'); }   // las mismas cuentas que ya pusiste en tus canales
    $('vlAccs').value = v.accs; $('vlMax').value = String(v.max || 100);
    $('vlGo').onclick = () => vlCollect(cl);
    $('vlStopCol').onclick = () => { vlStopReq = true; $('vlStopCol').disabled = true; $('vlStatus').textContent = 'Parando y guardando lo recogido…'; setTimeout(() => $('vlStopCol').disabled = false, 3000); };
    $('vlImp').onclick = () => vlImport(cl);
    $('vlAn20').onclick = () => vlAnalyze(cl, 20);
    $('vlAnAll').onclick = () => vlAnalyze(cl, 9999);
    $('vlStop').onclick = () => { if (vlJob) vlJob.cancel = true; };
    $('vlPat').onclick = () => vlMakeManual(cl);
    $('vlExtAll').onclick = () => vlAnalyze(cl, 9999, true);
    $('vlExport').onclick = () => vlExport(cl);
    $('vlFree').onclick = () => vlFreeAll(cl);
    $('vlStop2').onclick = () => { if (vlJob) vlJob.cancel = true; };
    $('vlAccs').oninput = async () => { const x = await vlGet(cl); x.accs = $('vlAccs').value; await vlSave(cl, x); };
  }
  vlScore(v);
  const el = v.clips.filter(c => c.score != null), top = v.clips.filter(c => c.group === 'top'), bot = v.clips.filter(c => c.group === 'bottom');
  const an = v.clips.filter(c => c.ficha), pend = [...top, ...bot].filter(c => !c.ficha && !c.fichaErr).length;
  $('vlStep2').hidden = !el.length; $('vlStep3').hidden = an.length < 1;
  $('vlAnAll').textContent = `Analizar todos los elegidos (${pend} pendientes)`;
  const pendAll = v.clips.filter(c => !c.ficha && !c.fichaErr && c.url).length;
  $('vlExtAll').textContent = `🎞️ Extraer datos de TODOS los vídeos con la IA (${pendAll} pendientes · ≈${(pendAll * 0.015).toFixed(2).replace('.', ',')} € de pago)`;
  $('vlExtAll').disabled = !!vlJob || !pendAll; $('vlExport').disabled = !v.clips.length; $('vlStep4').hidden = !v.clips.length;
  const pendFree = v.clips.filter(c => vlNeedsFree(c)).length, okFree = v.clips.filter(c => c.free && !c.free.err).length;
  $('vlFree').textContent = pendFree ? `🆓 Extraer transcripción y título gratis (${pendFree} pendientes)` : '✓ Transcripción y título extraídos';
  $('vlFree').disabled = !!vlJob || !pendFree; $('vlStop2').hidden = !vlJob;
  $('vlExportInfo').textContent = v.clips.length ? `${v.clips.length} vídeos · ${okFree} con transcripción y título${an.length ? ` · ${an.length} con ficha completa de la IA` : ''}. Los demás llevan solo los números de TikTok.` : '';
  $('vlAn20').disabled = $('vlAnAll').disabled = !!vlJob || !pend; $('vlStop').hidden = !vlJob; $('vlGo').disabled = !!vlJob;
  $('vlCost').textContent = pend ? `Coste aprox. con clave de pago: ${(pend * 0.012).toFixed(2).replace('.', ',')} € (≈1 céntimo por clip). Con la clave gratis: 0 €, pero avanza poco a poco por el límite diario.` : '';
  // resumen y ranking
  const sum = $('vlSum'); sum.innerHTML = '';
  if (v.clips.length) {
    const accs = Object.entries(v.med || {}).map(([a, m]) => `@${a}: ${v.clips.filter(c => c.acc === a).length} vídeos, normal ${vlNum(m)} visitas`).join(' · ');
    sum.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: `${v.clips.length} vídeos leídos · ${el.length} con edad suficiente para comparar · ${an.length} analizados por la IA. ${accs}` }));
    const tbl = document.createElement('div'); tbl.className = 'vl-rank';
    for (const c of el.sort((a, b) => b.score - a.score).slice(0, 12)) {
      const r = document.createElement('a'); r.className = 'vl-row'; r.href = c.url; r.target = '_blank'; r.rel = 'noopener';
      r.innerHTML = '<b></b><span class="vl-d"></span><span class="hint"></span>';
      r.querySelector('b').textContent = vlX(c.score); r.querySelector('.vl-d').textContent = (c.ficha && c.ficha.titulo && c.ficha.titulo.texto) || c.desc || c.id;
      r.querySelector('.hint').textContent = `@${c.acc} · ${vlNum(c.views)} visitas · ${vlNum(c.likes)} likes · ${vlNum(c.shares)} compartidos`;
      tbl.append(r);
    }
    sum.append(Object.assign(document.createElement('strong'), { textContent: 'Los que más petaron (frente a la media de su cuenta)' }), tbl);
  }
  // fichas
  const fl = $('vlFichas'); fl.innerHTML = '';
  for (const c of an.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 80)) {
    const f = c.ficha, t = f.titulo || {}, g = f.gancho || {};
    const d = document.createElement('details'); d.className = 'vl-f' + (c.wrong ? ' wrong' : '');
    const s = document.createElement('summary'); s.textContent = `${c.group === 'top' ? '🟢' : c.group === 'bottom' ? '🔴' : '⚪'} ${c.score ? vlX(c.score) : ''} · ${t.texto || f.resumen || '(sin título)'}`;
    const body = document.createElement('div'); body.className = 'vl-fb';
    const L = [
      ['Estructura del título', t.estructura], ['Tipo de frase', t.tipo_frase], ['Nombre del streamer', t.nombre_streamer], ['Curiosidad', t.curiosidad], ['Palabras en color', (t.palabras_color || []).join(', ')], ['Emoji', (t.emojis || []).join(' ')],
      ['Primera frase', g.primera_frase], ['Se oye / se ve primero', [g.audio, g.visual].filter(Boolean).join(' / ')], ['Momento fuerte', g.segundo_fuerte != null ? 'segundo ' + g.segundo_fuerte : ''],
      ['Tema', (f.tema || []).join(', ')], ['Emoción', f.emocion], ['Formato', f.formato], ['Duración', f.duracion ? f.duracion + ' s' : ''], ['Qué pasa', f.resumen],
    ];
    for (const [k, val] of L) if (val) { const p = document.createElement('p'); p.innerHTML = '<b></b> '; p.querySelector('b').textContent = k + ':'; p.append(String(val)); body.append(p); }
    const row = document.createElement('div'); row.className = 'vl-fa';
    const a = document.createElement('a'); a.href = c.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '▶ Ver en TikTok';
    const w = document.createElement('button'); w.textContent = c.wrong ? '↩ La ficha está bien' : '✗ La ficha está mal (no usarla)';
    w.onclick = async () => { const x = await vlGet(cl), cc = x.clips.find(y => y.id === c.id); if (cc) { cc.wrong = !cc.wrong; await vlSave(cl, x); renderViral(cl, true); } };
    row.append(a, w); body.append(row); d.append(s, body); fl.append(d);
  }
  // patrones y manual
  const pb = $('vlPatterns'); pb.innerHTML = '';
  const S = v.stats;
  if (S) {
    const tableOf = (title, rows) => {
      if (!rows.length) return;
      pb.append(Object.assign(document.createElement('strong'), { textContent: title }));
      const t = document.createElement('table'); t.className = 'vl-t';
      t.innerHTML = '<tr><th>Rasgo</th><th>Clips</th><th>Rinde</th><th>En los top</th><th>En los peores</th></tr>';
      for (const r of rows) { const tr = document.createElement('tr'); [r.f, r.n, vlX(r.lift), Math.round(r.pTop * 100) + ' %', Math.round(r.pBot * 100) + ' %'].forEach((x, i) => { const td = document.createElement('td'); td.textContent = x; if (i === 2) td.className = r.lift >= 1 ? 'up' : 'down'; tr.append(td); }); t.append(tr); }
      pb.append(t);
    };
    tableOf(`✅ Lo que más funciona (de ${S.nAn} clips analizados)`, S.deep.filter(x => x.lift >= 1.25).sort((a, b) => b.lift - a.lift).slice(0, 25));
    tableOf('⛔ Lo que peor funciona', S.deep.filter(x => x.lift <= 0.8).sort((a, b) => a.lift - b.lift).slice(0, 20));
    if (S.titleGroups.length) {
      pb.append(Object.assign(document.createElement('strong'), { textContent: '🏷️ Estructuras de título (tipo de frase · nombre del streamer · curiosidad)' }));
      const t = document.createElement('table'); t.className = 'vl-t'; t.innerHTML = '<tr><th>Estructura</th><th>Clips</th><th>Rinde</th><th>Ejemplos reales</th></tr>';
      for (const g of S.titleGroups.slice(0, 15)) { const tr = document.createElement('tr'); [g.k, g.n, vlX(g.lift), g.ej.map(e => '«' + e.t + '»').join('  ')].forEach((x, i) => { const td = document.createElement('td'); td.textContent = x; if (i === 2) td.className = g.lift >= 1 ? 'up' : 'down'; tr.append(td); }); t.append(tr); }
      pb.append(t);
    }
    tableOf(`📅 Datos sin IA (de ${S.nMeta} clips: hora, día, duración, hashtags, música)`, S.meta.slice().sort((a, b) => b.lift - a.lift));
    pb.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: '«Rinde ×2» = los clips con ese rasgo tienen de media el doble de visitas que lo normal en su cuenta. Con pocos clips, tómalo como una pista, no como una regla.' }));
  }
  const mb = $('vlManual'); mb.innerHTML = '';
  const M = v.manual;
  if (M) {
    const h = document.createElement('div'); h.className = 'vl-man';
    h.append(Object.assign(document.createElement('strong'), { textContent: '📘 Manual de ' + cl.name + ' (basado en datos)' }));
    if (M.resumen) h.append(Object.assign(document.createElement('p'), { textContent: M.resumen }));
    const ul = (title, items) => { if (!items || !items.length) return; h.append(Object.assign(document.createElement('b'), { textContent: title })); const u = document.createElement('ul'); items.forEach(x => u.append(Object.assign(document.createElement('li'), { textContent: x }))); h.append(u); };
    ul('Reglas', (M.reglas || []).map(x => `${x.regla}${x.dato ? ' — ' + x.dato : ''}`));
    ul('Estructuras de título que mejor funcionan', (M.estructuras_titulo || []).map(x => `${x.plantilla}${x.ejemplo ? ' · «' + x.ejemplo + '»' : ''}${x.rinde ? ' (' + x.rinde + ')' : ''}`));
    ul('Evitar', M.evitar); ul('Dudas (comprobar con más clips)', M.dudas);
    const A0 = await getAgent(cl), on = !!(A0.manual && A0.manual === vlManualText(M));
    const b = document.createElement('button'); b.className = on ? '' : 'primary'; b.textContent = on ? '✓ Aplicado al agente · Quitar' : '✔ Aplicar al agente';
    b.onclick = async () => { const A = await getAgent(cl); if (on) { A.manual = ''; A.titleGuide = ''; } else { A.manual = vlManualText(M); A.titleGuide = vlTitleGuide(M); } await saveAgent(cl, A); toast(on ? 'Manual quitado del agente' : 'Manual aplicado: el agente y los títulos lo usarán'); renderViral(cl, true); };
    h.append(b); mb.append(h);
  }
}


/* ---------- 3) la IA lo edita sola ---------- */
// cómo queda cada formato con la plantilla de este streamer (para las vistas previas)
function fmtStyle(id) { const f = AG_FORMATS[id], p = f && PRESETS.find(x => x.name === f.preset); const st = p ? effectivePreset(p) : JSON.parse(JSON.stringify(BASE_STYLE)); if (id === 'duo' || id === 'llamada' || id === 'varias') st.layoutMode = 'react'; return st; }
const EZ_FMTS = [['podcast', '🎙️', 'Primer plano'], ['reaccion', '📺', 'Reacción'], ['dividida', '🖼️', 'Pantalla dividida'], ['horizontal', '▭', 'Horizontal'], ['horizontal_cam', '🎥', 'Horizontal · solo cámara'], ['duo', '👥', 'Dos personas'], ['llamada', '📞', 'Llamada'], ['varias', '🎥', 'Varias cámaras']];
let ezSteps = [];
function busy(title, steps) {
  if (title === false) { $('ezBusy').hidden = true; return; }
  $('ezBusyT').textContent = title; $('ezBusyS').textContent = '';
  ezSteps = (steps || []).map(([id, t]) => ({ id, t, st: 'wait', note: '' }));
  $('ezBusy').hidden = false; busyDraw();
}
function busyStep(id, st, note) {
  const s = ezSteps.find(x => x.id === id), now = performance.now();
  if (s) {
    if (st === 'work' && s.st !== 'work') s.m0 = { t: now, g: tmGem, w: tmWait, x: tmWhisper };
    else if (s.st === 'work' && st !== 'work' && s.m0) { const m = s.m0; s.tm = { all: now - m.t, gem: tmGem - m.g, wait: tmWait - m.w, wh: tmWhisper - m.x }; }
    s.st = st; if (note != null) s.note = note;
  }
  busyDraw();
}
const fmtMs = ms => ms >= 60000 ? Math.floor(ms / 60000) + ' min ' + Math.round(ms % 60000 / 1000) + ' s' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
// desglose de en qué se fue el tiempo al editar el clip
function showTiming(total) {
  const st = ezSteps.filter(s => s.tm && s.tm.all > 50);
  if (!st.length || total < 1000) return;
  let box = $('tmBox'); if (!box) { box = document.createElement('div'); box.id = 'tmBox'; document.body.append(box); }
  const pc = ms => Math.round(ms / total * 100) + ' %';
  const sum = { gem: 0, wait: 0, wh: 0 }; st.forEach(s => { sum.gem += s.tm.gem; sum.wait += s.tm.wait; sum.wh += s.tm.wh; });
  const local = Math.max(0, total - sum.gem - sum.wait - sum.wh);
  box.innerHTML = `<div class="tm-h"><strong>⏱ Este clip ha tardado ${fmtMs(total)}</strong><button aria-label="Cerrar">✕</button></div><table></table><div class="tm-k"></div>`;
  const tb = box.querySelector('table');
  for (const s of st) {
    const tr = document.createElement('tr'), g = Math.max(0, s.tm.gem), parts = [];
    if (s.tm.wh > 300) parts.push('Whisper ' + fmtMs(s.tm.wh));
    if (g > 300) parts.push('Gemini ' + fmtMs(g));
    if (s.tm.wait > 300) parts.push('esperando límite ' + fmtMs(s.tm.wait));
    const rest = s.tm.all - s.tm.wh - g - s.tm.wait; if (rest > 300) parts.push('tu PC ' + fmtMs(rest));
    tr.innerHTML = `<td></td><td class="n"></td><td class="n"></td><td class="d"></td>`;
    tr.children[0].textContent = s.t; tr.children[1].textContent = fmtMs(s.tm.all); tr.children[2].textContent = pc(s.tm.all); tr.children[3].textContent = parts.join(' · ');
    const bar = document.createElement('i'); bar.style.width = Math.round(s.tm.all / total * 100) + '%'; tr.children[0].append(bar);
    tb.append(tr);
  }
  box.querySelector('.tm-k').textContent = `En total: Gemini pensando ${pc(sum.gem)} · esperando el límite de Gemini ${pc(sum.wait)} · Whisper en tu PC ${pc(sum.wh)} · resto (vídeo, caras, preparar) ${pc(local)}`;
  box.querySelector('button').onclick = () => box.remove();
  console.table(st.map(s => ({ paso: s.t, segundos: +(s.tm.all / 1000).toFixed(1), gemini: +((s.tm.gem) / 1000).toFixed(1), espera_limite: +(s.tm.wait / 1000).toFixed(1), whisper: +(s.tm.wh / 1000).toFixed(1) })));
}
function busyMsg(m) { $('ezBusyS').textContent = m || ''; }
function busyDraw() {
  const ICON = { wait: '○', work: '◌', ok: '✓', skip: '–', fail: '✕' };
  $('ezSteps').innerHTML = '';
  for (const s of ezSteps) { const li = document.createElement('li'); li.className = s.st; li.innerHTML = `<i>${ICON[s.st]}</i><span></span><em></em>`; li.querySelector('span').textContent = s.t; li.querySelector('em').textContent = s.note || ''; $('ezSteps').append(li); }
}
async function ezAgentCfg() { const cl = clientOf(curClient); return cl ? await getAgent(cl) : AG_DEFAULT(); }
function ezDefaultFmt() {
  const map = { 'Podcast': 'podcast', 'Reacción': 'reaccion', 'Pantalla dividida': 'dividida', 'Título y subtítulos': 'horizontal' };
  return map[presetDefault] || 'horizontal';
}
// elegir el formato mirando 3 fotogramas del clip con las pautas del cliente
async function ezPickFormat(A) {
  const fr = await sampleFrames(3), ps = [];
  for (const c of fr) { const t = document.createElement('canvas'); t.width = 512; t.height = Math.round(512 * c.height / c.width); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); ps.push({ inline_data: { mime_type: 'image/jpeg', data: t.toDataURL('image/jpeg', 0.7).split(',')[1] } }); }
  ps.push({ text: `Son 3 fotogramas (al principio, a la mitad y al final) de un clip horizontal de un streamer que vamos a pasar a vertical para TikTok.
${A.rules ? 'PAUTAS DEL CLIENTE:\n' + A.rules + '\n' : ''}Elige el formato correcto para ESTE clip según lo que se ve en pantalla${A.rules ? ' y las pautas' : ''}:
"podcast" = habla a cámara o en su PC sin reaccionar a nada concreto de la pantalla;
"reaccion" = reacciona a algo que se ve en pantalla (vídeo, tweet, TikTok, web, partido…) o está jugando, y su cámara se ve en una esquina;
"dividida" = está hablando y una imagen de apoyo ayudaría a entender lo que cuenta;
"horizontal_cam" = hay casino, tragaperras o apuestas en pantalla: solo se enseña su cámara;
"duo" = hay DOS o más personas en el set (sentadas juntas, en el mismo plano) hablando o discutiendo entre ellas, sin reaccionar a una pantalla: se pone una persona arriba y otra abajo;
"llamada" = es una llamada de Discord (o parecida) con varias cámaras en cuadrícula, cada persona en su recuadro: se ponen de 2 a 5 personas una debajo de otra;
"horizontal" = el vídeo tal cual, centrado (por ejemplo, si es una grabación normal sin cámara aparte).
Si eliges "dividida", di en "image" qué imagen pondrías (en español, corto).
Responde solo JSON: {"format":"...","why":"...","image":"..."}` });
  return gemRetry(() => geminiJSON(ps, 0), m => busyMsg(m));
}
async function ezApplyFormat(fmt, extra = {}) {
  fmt = fixFmt(fmt);
  try { return await ezApplyFormat0(fmt, extra); } finally { if (!$('subsGen').checked) { trk.caps.hide = true; clipMeta.noSubs = true; syncTrackUI(); } }
}
// lo que ya se encontró en este clip para cada formato (cámaras, encuadres…): al volver a un formato sale al instante, con tus ajustes
const fmtMemo = new Map(), FMT_DET = new Set(['reaccion', 'duo', 'llamada', 'varias', 'horizontal_cam']);
const fmtSig = f => (file ? file.name + '|' + file.size : '') + '|' + (loaded ? srcRange().map(x => x.toFixed(2)).join('-') : '') + '|' + f;
function fmtKeep() { const f = clipMeta.fmt; if (!loaded || !f || !FMT_DET.has(f) || !fmtMemo.has(fmtSig(f))) return; fmtMemo.set(fmtSig(f), JSON.stringify({ crops, zones, cam: clipMeta.cam || null, lay: $('mcLay').value })); }
function fmtBack(f) { const m = loaded && fmtMemo.get(fmtSig(f)); if (!m || m === 1) return false; try { const o = JSON.parse(m); for (const k of Object.keys(crops)) delete crops[k]; Object.assign(crops, o.crops); zones = o.zones || []; if (o.cam) clipMeta.cam = o.cam; $('mcLay').value = o.lay || 'A'; tlSig = ''; return true; } catch { return false; } }
async function ezApplyFormat0(fmt, extra = {}) {
  try { fmtKeep(); } catch {}
  const F = AG_FORMATS[fmt] || AG_FORMATS.horizontal, pr = PRESETS.find(x => x.name === F.preset);
  const A = await ezAgentCfg(), titleTop = /t[ií]tulo\s+(va\s+)?arriba/i.test(A.rules || '');
  const st = cleanForPreset(effectivePreset(pr)); st.c = st.c || {};
  if (fmt === 'podcast' && titleTop) st.c.titleY = '13';
  if (fmt === 'horizontal_cam' && !String(st.c.bg || '').startsWith('blur')) st.c.bg = 'blur2';
  zones = []; delete clipMeta.cam;
  await applyStyle(st);
  if (pr.fill && layoutMode === 'single' && !presetOverrides[pr.name]) setRange('zoom', fillZoom());
  if (!autoHLOn()) { titleHL.clear(); renderChips(); }
  if (titleTop && (fmt === 'podcast' || fmt === 'horizontal_cam')) { logoAuto.manual = true; logoAuto.dy = 0; logoPos.x = W / 2; logoPos.y = H - 230; }
  clipMeta.fmt = fmt;
  clipMeta.imgPrompt = fmt === 'dividida' ? (extra.image || clipMeta.imgPrompt || 'algo que represente lo que dice') : '';
  activePreset = pr.name; renderPresets();
  if (allWords.length) buildCaptions();
  const back = !extra.again && FMT_DET.has(fmt) && fmtBack(fmt);
  if (!back) {
    if (fmt === 'reaccion') { camDetectedFor = null; await autoDetectCam(true); }
    if (fmt === 'duo' || fmt === 'llamada' || fmt === 'varias') await duoDetect();
    if (fmt === 'horizontal_cam') await detectCamOnly();
    if (FMT_DET.has(fmt)) { fmtMemo.set(fmtSig(fmt), 1); fmtKeep(); }
  }
  // podcast: si ya se siguió la cara en este mismo trozo, no se vuelve a mirar el clip entero
  if (fmt === 'podcast') { const tr = clipMeta.track, r = srcRange(); if (tr && tr.p && tr.r && Math.abs(tr.r[0] - r[0]) < 0.05 && Math.abs(tr.r[1] - r[1]) < 0.05) tr.on = true; else await faceTrack(true); } else if (clipMeta.track) clipMeta.track.on = false;
  pushHistory();
}
const ezSkip = { title: false, subs: false, scenes: false, speech: false };   // desde la pantalla del directo se puede pedir que no haga el título o los subtítulos
async function ezRunAI() {
  const A = await ezAgentCfg(), key = !!getGemKey();
  vid.pause();
  const tmT0 = performance.now();
  busy('La IA está editando tu clip', [['fmt', 'Elegir el formato'], ['subs', 'Subtítulos'], ['title', 'Escribir el título']]);
  try {
    // formato
    busyStep('fmt', 'work');
    let fmt = null, image = '';
    const fmtMine = !$('ezFmtAuto').checked && ezFmtSel, titleMine = !$('ezTitleAuto').checked && $('ezTitleIn').value.trim();
    if (fmtMine) fmt = ezFmtSel;
    else if (key) {
      try { const v = await ezPickFormat(A); if (v && AG_FORMATS[v.format]) { fmt = v.format; image = v.image || ''; } }
      catch (e) { console.warn(e); if (e.message === 'BADKEY') toast('La clave de Gemini no es válida'); }
    }
    const auto = !fmt;
    $('ezBusy').hidden = true;     // que se vea la detección de la cámara
    if (auto) { if (layoutMode === 'react') { camDetectedFor = null; await autoDetectCam(true); } fmt = curFmtOf(); clipMeta.fmt = fmt; if (fmt === 'podcast') await faceTrack(true); }
    else await ezApplyFormat(fmt, { image });
    await ttApplyDef();   // el diseño de título fijo de este creador
    // si el clip cambia de plano, cada escena con su formato (en este ordenador, sin coste)
    if (ezPref('scenes') !== '0' && !ezSkip.scenes) { try { await scenesAuto(true); } catch (e) { console.warn('escenas', e); } }
    if ($('aiov').dataset.state !== 'fail') aiov('hide');
    $('ezBusy').hidden = false;
    busyStep('fmt', auto ? 'skip' : 'ok', (EZ_FMTS.find(x => x[0] === fmt) || [])[2] + (auto ? ' (tu plantilla)' : fmtMine ? ' (elegido por ti)' : '')); busyMsg('');
    // subtítulos
    const subsOn = A.subs && $('subsGen').checked && !ezSkip.subs;
    clipMeta.noSubs = !subsOn; if (!subsOn) { trk.caps.hide = true; syncTrackUI(); }
    if (subsOn) {
      busyStep('subs', 'work');
      const ok = await doTranscribe(m => busyMsg(m));
      if (ok) clipMeta.subR = srcRange();
      busyStep('subs', ok ? 'ok' : 'fail', ok ? captions.length + ' frases' : 'no se pudo'); busyMsg('');
    } else busyStep('subs', 'skip', A.subs ? 'esta plantilla va sin' : 'este cliente va sin');
    // palabrotas
    // el gancho ya no se busca solo: se hace desde el clic derecho si quieres
    // título
    if (titleMine) {
      titleHL.clear(); $('title').value = titleMine; $('title').dispatchEvent(new Event('input', { bubbles: true })); renderChips();
      busyStep('title', 'ok', 'el tuyo');
    } else if (key && !ezSkip.title) {
      busyStep('title', 'work'); busyMsg('Viendo y escuchando el clip…');
      $('title').value = DEFAULT_TITLE; titleHL.clear(); renderChips();
      await aiTitle(true);
      busyStep('title', titleIsDefault() ? 'fail' : 'ok'); busyMsg('');
    } else busyStep('title', 'skip', 'falta la clave');
    pushHistory(); await sleep(700);
  } catch (e) { console.error(e); toast('La IA no pudo terminar: ' + e.message); }
  finally { try { showTiming(performance.now() - tmT0 - 700); } catch {} busy(false); seekOut(0); }
  if (fmtNeedsImage()) toast('Falta la imagen: pégala con Ctrl+V o haz clic en el hueco');
  else toast('¡Listo! Haz clic derecho sobre cualquier cosa para cambiarla');
}
const fmtNeedsImage = () => layoutMode === 'split' && !img;
async function ezResubs() {
  clipMeta.noSubs = false; trk.caps.hide = false; syncTrackUI();
  busy('Escribiendo los subtítulos', [['subs', 'Subtítulos']]); busyStep('subs', 'work');
  const ok = await doTranscribe(m => busyMsg(m));
  if (ok) clipMeta.subR = srcRange();
  busy(false); toast(ok ? 'Subtítulos listos' : 'No se pudieron hacer los subtítulos');
}
const TIKTOK_RISK = `- palabrotas y groserías, aunque sean suaves o de broma (mierda, joder, puta, hostia, coño, verga, gonorrea, hijueputa, malparido, marica, cabrón, pendejo, carajo…)
- insultos a personas (idiota, imbécil, subnormal, retrasado…)
- palabras discriminatorias u ofensivas por raza, origen, orientación sexual, discapacidad o religión
- MUERTE y todo lo relacionado: muerte, morir, muerto, me muero, matar, asesinar, asesinato, cadáver, sangre, disparar, tiro, balazo, apuñalar, degollar, ahorcar, funeral…
- violencia, armas y amenazas: pistola, arma, rifle, cuchillo, bomba, explosión, pelea, golpear, tortura, secuestro, masacre, guerra, terrorista, atentado
- suicidio y autolesiones: suicidio, suicidarse, matarme, cortarme, ahorcarme, «no quiero vivir»…
- abusos y delitos graves: violación, violar, abuso, acoso, pedófilo, trata, robo a mano armada
- sexo y contenido adulto: sexo, follar, coger (en sentido sexual), porno, desnudo, tetas, culo, pene, OnlyFans, prostituta, «hacer cositas»…
- drogas y alcohol en exceso: droga, cocaína, perico, coca, marihuana, porro, hierba, éxtasis, pastillas, borracho, fumado…
- extremismo y odio: nazi, Hitler, KKK, «heil»…
- apuestas, casino y dinero fácil: apostar, apuesta, casino, ruleta, tragaperras, slots, «hazte rico», estafa, hackear cuentas
- cualquier otra palabra o tema sensible que el algoritmo de TikTok suela limitar (los creadores la cambian por otras palabras, como «unalive» en vez de «matar»)`;
// palabras sensibles para TikTok (se silencian aunque no haya clave de Gemini)
const RISK_RE = /^(muert[eoa]s?|mor[ií]r(se|me)?|muero|murio|murieron|matar(te|lo|la|los|me|nos)?|mat[eéoó]|mata(ron|ste|mos|n)?|asesin\w*|cadaver\w*|sangre\w*|dispar\w*|balaz\w*|balacera|tiroteo|apu[nñ]al\w*|degoll\w*|ahorc\w*|pistola\w*|arma(s|do|dos)?|rifle\w*|cuchill\w*|bomba\w*|explosivo\w*|tortur\w*|secuestr\w*|masacre\w*|terroris\w*|atentado\w*|suicid\w*|violaci[oó]n|violad\w*|violar\w*|abus(o|os|ar|ador)|pedofil\w*|sexo|sexual\w*|follar\w*|porno\w*|desnud\w*|tetas?|pene|onlyfans|prostitut\w*|droga\w*|cocaina|perico|marihuana|porros?|extasis|nazis?|hitler|casinos?|apuest\w*|apostar|ruleta|tragaperras|slots?)$/;
const isRisk = w => RISK_RE.test(normWord(w));
// la IA lee la transcripción y dice qué palabras silenciar para que TikTok no penalice el vídeo
const RISK_CATS = 'palabrota|insulto|muerte|violencia|suicidio|abuso|sexual|drogas|odio|apuestas|otro';
const RISK_LEVELS = `Pon a cada una su nivel:
- "alta": seguro que TikTok lo penaliza (palabrotas claras, insultos, amenazas, suicidio, sexo explícito, drogas, odio);
- "media": probable que lo limite (muerte, armas, sangre, peleas, apuestas, groserías suaves);
- "baja": dudoso o suave, pero mejor que el clipper lo vea (expresiones como «me muero de risa», «qué asco», «estúpido» de broma…).
Marca LO MÁS MÍNIMO: cualquier palabra malsonante o delicada para TikTok, aunque sea suave o de broma. Mejor marcar de más que de menos.`;
const normLvl = v => ({ alta: 'alta', high: 'alta', media: 'media', medium: 'media', baja: 'baja', low: 'baja' })[String(v || '').toLowerCase()] || 'media';
// la IA lee la transcripción y dice qué palabras pueden hacer que TikTok penalice el vídeo → Map(índice → {cat, lvl})
async function riskyWords(words, A, extra, onWait) {
    const numbered = words.slice(0, 2500).map((w, i) => i + ':' + w.text.trim()).join(' ');
    const o = await gemRetry(() => geminiJSON([{ text: `Esta es la transcripción de un clip de un streamer que se va a subir a TikTok, palabra por palabra con su número (número:palabra).
${numbered}

Marca las palabras que pueden hacer que TikTok penalice o limite el vídeo:
${A.censorLvl === 'bad' ? '- palabrotas, groserías e insultos' : TIKTOK_RISK}${extra.length ? '\n- y siempre estas palabras: ' + extra.join(', ') : ''}
Ten en cuenta el contexto y las expresiones de España y Latinoamérica (Colombia, México, Argentina…). Si una expresión delicada tiene varias palabras, marca todas.
${RISK_LEVELS}
Responde solo JSON: {"words":[{"i":número,"cat":"${RISK_CATS}","lvl":"alta|media|baja"}]}` }], 0), onWait);
    const out = new Map();
    for (const x of ((o && (o.words || o.mute)) || [])) { const i = +(x && x.i != null ? x.i : x); if (Number.isInteger(i) && i >= 0 && i < words.length) out.set(i, { cat: (x && x.cat) || 'otro', lvl: normLvl(x && x.lvl) }); }
    return out;
}
// ensanchar cada silencio hasta las pausas de alrededor, para que no se escuche ni el principio ni el final de la palabra
function widenMutes(list, au, au0) {
  if (!au || !au.length) return list.map(m => ({ ...m, s: Math.max(0, m.s - 0.1), e: m.e + 0.15 }));
  const fr = 160, n = Math.floor(au.length / fr), rms = new Float32Array(n);
  for (let i = 0; i < n; i++) { let q = 0; for (let j = i * fr; j < (i + 1) * fr; j += 2) q += au[j] * au[j]; rms[i] = Math.sqrt(q / (fr / 2)); }
  const idx = t => Math.max(0, Math.min(n - 1, Math.round((t - au0) * 100)));
  const minAt = (t0, t1) => { let bi = idx(t0), bv = Infinity; for (let i = idx(t0); i <= idx(t1); i++) if (rms[i] < bv - 1e-4) { bv = rms[i]; bi = i; } return au0 + bi / 100; };
  return list.map(m => {
    const s0 = Math.min(m.s - 0.03, minAt(m.s - 0.28, m.s + 0.04)), e0 = Math.max(m.e + 0.06, minAt(m.e - 0.04, m.e + 0.32));
    return { ...m, s: Math.max(0, s0), e: Math.min(e0, s0 + 3) };
  });
}
// sin marcas por palabra (o para pillar lo que la transcripción entendió mal): Gemini escucha el audio
async function geminiAudioRisk(au, au0, A, extra, onWait) {
  const o = await gemRetry(() => geminiJSON([{ inline_data: { mime_type: 'audio/wav', data: wavB64(au, 16000) } }, { text: `Escucha este audio de un streamer (español de España o de Latinoamérica).
Haz una lista de TODAS las palabras que pueden hacer que TikTok penalice el vídeo:
${A.censorLvl === 'bad' ? '- palabrotas, groserías e insultos (mierda, puta, hijueputa, malparido, gonorrea, verga, pendejo, coño, joder, marica…)' : TIKTOK_RISK}${extra.length ? '\n- y siempre estas palabras: ' + extra.join(', ') : ''}
${RISK_LEVELS}
Para cada una di el segundo exacto donde EMPIEZA y donde ACABA esa palabra, contando desde el principio del audio (con décimas). Solo la palabra, no la frase.
Si no hay ninguna, devuelve la lista vacía.
Responde solo JSON: {"words":[{"w":"palabra","s":1.2,"e":1.6,"cat":"${RISK_CATS}","lvl":"alta|media|baja"}]}` }], 0), onWait);
  const list = (o && (o.words || o.palabras)) || (Array.isArray(o) ? o : []);
  return list.filter(x => x && isFinite(+x.s)).map(x => { const s0 = au0 + +x.s, e0 = au0 + (isFinite(+x.e) && +x.e > +x.s ? +x.e : +x.s + 0.45); return { s: Math.max(0, s0 - 0.15), e: e0 + 0.15, w: String(x.w || '').trim(), cat: x.cat || 'otro', lvl: normLvl(x.lvl) }; });
}
const listMuted = l => l.slice(0, 6).map(m => '«' + (m.w || '…') + '»').join(', ') + (l.length > 6 ? '…' : '');
const LVL_RANK = { alta: 3, media: 2, baja: 1 };
const localRisk = (w, A, extra) => isBad(w, extra) ? { cat: 'palabrota', lvl: 'alta' } : (A.censorLvl !== 'bad' && isRisk(w)) ? { cat: 'delicada', lvl: 'media' } : null;
const better = (a, b) => !a ? b : !b ? a : (LVL_RANK[b.lvl] > LVL_RANK[a.lvl] ? { ...b, cat: b.cat !== 'otro' ? b.cat : a.cat } : { ...a, cat: a.cat === 'delicada' && b.cat ? b.cat : a.cat });

/* palabras delicadas del clip: se detectan, se enseñan a la derecha y tú eliges cuáles silenciar */
// Cuánto se silencia de cada palabra: «corto» = solo el centro (se oye cómo empieza y cómo acaba), «palabra» = la palabra justa, «amplio» = la palabra y un poco más
const MUTE_MODES = [['corto', 'Corto: se oye el principio y el final'], ['palabra', 'Solo la palabra'], ['amplio', 'Amplio: la palabra y un poco más']];
const muteMode = () => { const m = ezPref('muteMode'); return MUTE_MODES.some(x => x[0] === m) ? m : 'corto'; };
function muteSpan(f, mode) {
  mode = mode || muteMode();
  // sin el momento exacto de la palabra (clips antiguos, o la IA solo dio un tiempo aproximado) no se puede afinar: silencio completo
  if (mode === 'amplio' || f.ws == null || !(f.we - f.ws > 0.05)) return [f.s, f.e];
  if (mode === 'palabra') return [f.ws, f.we];
  const L = f.we - f.ws, head = Math.min(0.14, Math.max(0.06, L * 0.28)), tail = Math.min(0.12, Math.max(0.05, L * 0.24));
  let a = f.ws + head, b = f.we - tail;
  if (b - a < 0.09) { const c = (f.ws + f.we) / 2, h = Math.min(0.045, L * 0.3); a = c - h; b = c + h; }   // palabra muy corta: un toque en el centro
  return [a, b];
}
const flagMute = f => { const [s, e] = muteSpan(f); return { s, e, w: f.w, fid: f.id }; };
// ajusta el principio y el final de la palabra a donde de verdad suena (quita el silencio de los bordes)
function tightWords(list, au, au0) {
  if (!au || !au.length) return list;
  const fr = 80, n = Math.floor(au.length / fr), rms = new Float32Array(n);   // tramos de 5 ms
  for (let i = 0; i < n; i++) { let q = 0; for (let j = i * fr; j < (i + 1) * fr; j++) q += au[j] * au[j]; rms[i] = Math.sqrt(q / fr); }
  return list.map(m => {
    if (m.ws == null) return m;
    const i0 = Math.max(0, Math.round((m.ws - au0) * 200)), i1 = Math.min(n - 1, Math.round((m.we - au0) * 200)); if (i1 - i0 < 12) return m;
    let pk = 0; for (let i = i0; i <= i1; i++) pk = Math.max(pk, rms[i]); if (pk < 0.003) return m;
    const thr = pk * 0.14; let a = i0, b = i1; while (a < b && rms[a] < thr) a++; while (b > a && rms[b] < thr) b--;
    if (b - a < 12) return m;
    return { ...m, ws: au0 + a / 200, we: au0 + (b + 1) / 200 };
  });
}
function flagMuteSync(f) {
  mutes = mutes.filter(m => m.fid !== f.id);
  if (f.on) mutes.push(flagMute(f));
  mutes.sort((x, y) => x.s - y.s); tlSig = '';
}
function setMuteMode(m) {
  ezPref('muteMode', m);
  for (const f of clipMeta.flags || []) if (f.on) flagMuteSync(f);
  pushHistory(); renderFlags(); try { mtDirty(); } catch {}
}
function setFlag(f, on) { f.on = on; flagMuteSync(f); pushHistory(); renderFlags(); }
// busca todo lo delicado. Devuelve cuántas palabras quedan silenciadas, o -1 si no se pudo escuchar el clip
async function ezCensor(quiet, onMsg) {
  const A = await ezAgentCfg(), extra = (A.bad || '').split(/[,\n]/).map(normWord).filter(Boolean), [a, b] = srcRange();
  const say = m => { if (onMsg) onMsg(m); flagsBusy(m); };
  const own = !quiet; if (own) busy('Buscando palabras delicadas', [['mute', 'Escuchar el clip']]), busyStep('mute', 'work');
  try {
    let words = allWords.filter(w => w.start < b + 0.1 && w.end > a - 0.1);
    // ¿hay partes del clip sin transcribir? (p. ej. se alargó la duración)
    const [r0, r1] = clipMeta.subR || [a, b];
    if ((!allWords.length || a < r0 - 0.3 || b > r1 + 0.3) && Date.now() - voiceDown > 120000) {
      const hideAfter = !captions.length || clipMeta.noSubs;   // si el clip va sin subtítulos, se escucha pero no se enseñan
      say('Escuchando lo que se dice…'); if (own) busyMsg('Escuchando lo que se dice…');
      const ok = await doTranscribe(m => { say(m); if (own) busyMsg(m); });
      if (ok) { clipMeta.subR = srcRange(); if (hideAfter && clipMeta.noSubs) { trk.caps.hide = true; syncTrackUI(); } words = allWords.filter(w => w.start < b + 0.1 && w.end > a - 0.1); }
    }
    let cands = [];
    if (words.length) {
      const hit = new Map();
      words.forEach((w, i) => { const r = localRisk(w.text, A, extra); if (r) hit.set(i, r); });
      if (getGemKey()) {
        // la IA lee la transcripción entera
        try {
          say('Leyendo lo que se dice…'); if (own) busyMsg('Leyendo lo que se dice…');
          for (const [k, v] of await riskyWords(words, A, extra, m => { say(m); if (own) busyMsg(m); })) hit.set(k, better(hit.get(k), v));
        } catch (e) { console.warn('Revisión TikTok', e); }
      }
      // y además Gemini escucha el audio: pilla lo que la transcripción entendió mal
      const heard = [];
      if (getGemKey()) {
        try {
          say('Escuchando el audio…'); if (own) busyMsg('Gemini está escuchando el clip…');
          const { a: au, a0 } = await clipAudio16k(240);
          for (const g of await geminiAudioRisk(au, a0, A, extra, m => { say(m); if (own) busyMsg(m); })) {
            const gw = normWord(g.w), mid = (g.s + g.e) / 2;
            let bi = -1, bd = 1.6;
            words.forEach((w, i) => { const nw = normWord(w.text), d = Math.abs((w.start + w.end) / 2 - mid); if (d < bd && nw && gw && (nw === gw || nw.startsWith(gw.slice(0, 4)) || gw.startsWith(nw.slice(0, 4)))) { bd = d; bi = i; } });
            if (bi >= 0) hit.set(bi, better(hit.get(bi), { cat: g.cat, lvl: g.lvl })); else if (g.e > a && g.s < b) heard.push(g);
          }
        } catch (e) { console.warn('Escucha de Gemini', e); }
      }
      const approx = clipMeta.wordMode && clipMeta.wordMode !== 'word', pd = approx ? 0.3 : 0.06;
      cands = [...hit.entries()].sort((x, y) => x[0] - y[0]).map(([i, r]) => ({ s: Math.max(0, words[i].start - pd), e: words[i].end + pd, w: words[i].text.trim().replace(/[.,!?¡¿;:…"«»]/g, ''), cat: r.cat, lvl: r.lvl,
        ...(approx ? {} : { ws: words[i].start, we: words[i].end }) }));   // con el momento exacto de la palabra se puede silenciar solo su centro
      cands = [...cands, ...heard.filter(g => !cands.some(x => x.s <= g.e && x.e >= g.s))];
    } else if (getGemKey()) {
      // sin Whisper: que Gemini escuche el audio y diga dónde están
      say('Escuchando el audio…'); if (own) busyMsg('Gemini está escuchando el clip…');
      const { a: au, a0 } = await clipAudio16k(240);
      cands = (await geminiAudioRisk(au, a0, A, extra, m => { say(m); if (own) busyMsg(m); })).filter(m => m.e > a && m.s < b);
    } else {
      if (!quiet) toast('No he podido escuchar el clip: hace falta internet la primera vez o la clave de Gemini');
      flagsBusy(null); return -1;
    }
    if (cands.length) { try { const { a: au, a0 } = await clipAudio16k(600); cands = tightWords(widenMutes(cands, au, a0), au, a0); } catch (e) { cands = widenMutes(cands); } }
    // a la lista (sin repetir las que ya estaban): no se silencia ninguna sola, las eliges tú (al buscar otra vez se respeta lo que ya habías elegido)
    const flags = clipMeta.flags = clipMeta.flags || [];
    const added = [];
    for (const c of cands.sort((x, y) => x.s - y.s)) {
      if (flags.some(f => f.s <= c.e - 0.05 && f.e >= c.s + 0.05)) continue;
      const f = { id: newId(), s: c.s, e: c.e, w: c.w || '…', cat: c.cat || 'otro', lvl: c.lvl || 'media', on: flagKeep.some(k => k.s <= c.e - 0.05 && k.e >= c.s + 0.05) };
      if (c.ws != null) { f.ws = c.ws; f.we = c.we; }
      if (f.on && mutes.some(m => !m.fid && m.s <= f.s + 0.05 && m.e >= f.e - 0.05)) f.on = false;   // ya estaba silenciada a mano
      flags.push(f); added.push(f); flagMuteSync(f);
    }
    flags.sort((x, y) => x.s - y.s);
    clipMeta.flagsDone = srcRange();
    if (added.length) pushHistory();
    const on = added.filter(f => f.on);
    if (!quiet) toast(added.length ? `🔎 ${added.length} palabra${added.length > 1 ? 's' : ''} encontrada${added.length > 1 ? 's' : ''}: elige cuáles silenciar` : 'No he encontrado nada delicado');
    flagKeep = [];
    lastMuted = on;
    flagsBusy(null);
    return on.length;
  } catch (e) {
    console.warn('Censura', e); flagsBusy(null);
    if (!quiet) toast('No se pudo revisar: ' + (e.message === 'QUOTA' ? 'límite de Gemini' : e.message));
    return -1;
  } finally { if (own) busy(false); }
}
// volver a buscar desde cero (las marcas a mano se quedan)
var stExpFail = false;   // la última exportación del panel no terminó: se enseña «Volver a exportar»
let flagKeep = [];   // lo que tenías silenciado antes de «Buscar otra vez»
async function rescanFlags() {
  flagKeep = (clipMeta.flags || []).filter(f => f.on).map(f => ({ s: f.s, e: f.e }));
  for (const f of clipMeta.flags || []) mutes = mutes.filter(m => m.fid !== f.id);
  clipMeta.flags = []; renderFlags();
  await ezCensor(false);
}
const CAT_ICON = { palabrota: '🤬', insulto: '😠', muerte: '💀', violencia: '🔪', suicidio: '⚠️', abuso: '⛔', sexual: '🔞', drogas: '💊', odio: '🚫', apuestas: '🎰', delicada: '⚠️', copiado: '🧬', otro: '⚠️' };
let flagsMsg = null;
function flagsBusy(m) { flagsMsg = m; renderFlags(); }
function renderFlags() {
  if (typeof renderSide === 'function') renderSide();
  const boxes2 = [$('ezFlags'), $('revFlags'), $('seFlags')].filter(Boolean); if (!boxes2.length) return;
  const flags = (clipMeta.flags || []).filter(f => { const [a, b] = srcRange(); return f.e > a && f.s < b; });
  for (const box of boxes2) {
    box.innerHTML = '';
    const h = document.createElement('div'); h.className = 'fl-h';
    const on = flags.filter(f => f.on).length;
    h.innerHTML = `<strong>🔇 Palabras malas</strong><span class="hint"></span>`;
    h.querySelector('.hint').textContent = flags.length ? `${flags.length} encontradas · ${on} silenciadas` : '';
    box.append(h);
    if (flagsMsg) { const p = document.createElement('p'); p.className = 'hint fl-busy'; p.textContent = '⏳ ' + flagsMsg; box.append(p); }
    else if (!clipMeta.flagsDone) {
      const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Pulsa el botón: busco las palabras que pueden penalizar y tú eliges cuáles silenciar.'; box.append(p);
    } else if (!flags.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = '✓ No hay nada delicado para TikTok.'; box.append(p); }
    if (flags.length) {
      const tools = document.createElement('div'); tools.className = 'fl-tools';
      const all = document.createElement('button'); all.textContent = 'Silenciar todas'; all.onclick = () => { flags.forEach(f => { f.on = true; flagMuteSync(f); }); pushHistory(); renderFlags(); };
      const none = document.createElement('button'); none.textContent = 'Ninguna'; none.onclick = () => { flags.forEach(f => { f.on = false; flagMuteSync(f); }); pushHistory(); renderFlags(); };
      tools.append(all, none); box.append(tools);
      const ms = document.createElement('select'); ms.className = 'fl-mode'; ms.title = 'Cuánto se silencia de cada palabra';
      for (const [v, t] of MUTE_MODES) { const o = document.createElement('option'); o.value = v; o.textContent = t; ms.append(o); }
      ms.value = muteMode(); ms.onchange = () => setMuteMode(ms.value); box.append(ms);
      const lg = document.createElement('p'); lg.className = 'hint'; lg.style.fontSize = '11px'; lg.textContent = '🔊 se oye · 🔇 silenciada: púlsalo para cambiar · pulsa la palabra para escuchar cómo queda'; box.append(lg);
      const list = document.createElement('div'); list.className = 'fl-list';
      for (const f of flags) {
        const row = document.createElement('div'); row.className = 'fl-row lv-' + f.lvl + (f.on ? ' on' : '');
        const tg = document.createElement('button'); tg.className = 'fl-tg'; tg.title = f.on ? 'Silenciada: pulsa para que se oiga' : 'Se oye: pulsa para silenciarla';
        tg.textContent = f.on ? '🔇' : '🔊'; tg.onclick = () => setFlag(f, !f.on);
        const wb = document.createElement('button'); wb.className = 'fl-w'; wb.title = 'Escuchar este momento';
        const T = (srcToOutAll(f.s)[0] ?? f.s - srcRange()[0]);
        wb.innerHTML = '<b></b><span></span>';
        wb.querySelector('b').textContent = (CAT_ICON[f.cat] || '⚠️') + ' ' + f.w;
        wb.querySelector('span').textContent = `${fmtS(Math.max(0, T))} · ${f.cat} · ${f.lvl}`;
        wb.onclick = () => previewFlag(f);
        row.append(tg, wb); list.append(row);
      }
      box.append(list);
    }
    const scan = document.createElement('button'); scan.className = 'fl-scan' + (clipMeta.flagsDone ? '' : ' primary');
    scan.textContent = clipMeta.flagsDone ? '↻ Buscar otra vez' : '🔎 Buscar palabras malas';
    scan.disabled = !!flagsMsg || !loaded; scan.onclick = () => clipMeta.flagsDone ? rescanFlags() : ezCensor(false);
    box.append(scan);
  }
}
let flagPrevT = null;
function previewFlag(f) {
  ensureAudio(); clearTimeout(flagPrevT);
  seekSrc(Math.max(srcRange()[0], f.s - 1)); vid.muted = false; vid.play().catch(() => {});
  flagPrevT = setTimeout(() => { vid.pause(); try { if (!$('stEd').hidden && typeof stEdSound !== 'undefined') vid.muted = !stEdSound; } catch {} }, (f.e - f.s + 2) * 1000);
}
async function ezSetFormat0(fmt) {
  busy('Cambiando el formato', [['fmt', (EZ_FMTS.find(x => x[0] === fmt) || [])[2] || fmt]]); busyStep('fmt', 'work');
  $('ezBusy').hidden = true;
  try { await ezApplyFormat(fmt); } finally { busy(false); }
  if (fmtNeedsImage()) toast('Ahora pega la imagen con Ctrl+V o haz clic en el hueco');
}
async function ezSetFormat(fmt) { await ezSetFormat0(fmt); await ttApplyDef(); pushHistory(); }
function ezRetrimOpen() { const [a, b] = srcRange(); ezA = a; ezB = b; ezRetrim = true; ezShow('trim'); }



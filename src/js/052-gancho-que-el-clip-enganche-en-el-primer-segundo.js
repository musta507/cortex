/* ---------- gancho: que el clip enganche en el primer segundo ---------- */
// palabras con tiempos del clip (si el cliente va sin subtítulos, se escuchan pero no se enseñan)
async function ensureWords(onMsg) {
  const [a, b] = srcRange(), [r0, r1] = clipMeta.subR || [a, b];
  if (allWords.some(w => w.start < b && w.end > a) && a >= r0 - 0.3 && b <= r1 + 0.3) return true;
  if (Date.now() - voiceDown < 120000) return false;
  const hide = !captions.length || clipMeta.noSubs;
  const ok = await doTranscribe(onMsg);
  if (ok) { clipMeta.subR = srcRange(); if (hide && clipMeta.noSubs) { trk.caps.hide = true; syncTrackUI(); } }
  return ok;
}
// momentos de más volumen (gritos, risas) como pista para la IA
async function loudPeaks(a, b) {
  try {
    const { a: au, a0 } = await clipAudio16k(Math.min(240, b - a)), step = 4000, rms = [];
    for (let i = 0; i + step <= au.length; i += step) { let q = 0; for (let j = i; j < i + step; j += 4) q += au[j] * au[j]; rms.push(Math.sqrt(q / (step / 4))); }
    const med = [...rms].sort((x, y) => x - y)[rms.length >> 1] || 0.01, out = [];
    rms.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).forEach(([v, i]) => { const t = a0 + i * 0.25 - a; if (v > med * 2 && out.length < 4 && out.every(o => Math.abs(o - t) > 3)) out.push(+t.toFixed(1)); });
    return out;
  } catch { return []; }
}
async function ezHook(quiet, onMsg) {
  const say = m => { if (onMsg) onMsg(m); };
  if (!getGemKey()) { if (!quiet) ezAskKey(() => ezHook(false)); return null; }
  const own = !quiet; if (own) { busy('Buscando el gancho', [['hook', 'Gancho al principio']]); busyStep('hook', 'work'); }
  try {
    // siempre se parte del clip sin gancho
    if (clipMeta.hook && clipMeta.hook.orig) { segs = clipMeta.hook.orig.map(g => ({ id: newId(), s: g.s, e: g.e })); pseg = 0; }
    const [a, b] = srcRange(), dur = b - a;
    if (dur < 8) return { changed: false, note: 'clip muy corto' };
    say('Escuchando el clip…');
    // también lo que se dice justo antes (hasta 20 s): por si falta contexto para entender el clip
    const look = Math.min(20, a);
    const keepSegs = segs.map(g => ({ ...g }));
    if (look >= 2) { segs = [{ id: newId(), s: a - look, e: b }]; pseg = 0; }
    let heard;
    try { heard = await ensureWords(m => { say(m); if (own) busyMsg(m); }); }
    finally { segs = keepSegs; pseg = 0; }
    if (!heard) return { changed: false, note: 'sin transcripción' };
    const ws = allWords.filter(w => w.start >= a - 0.1 && w.end <= b + 0.1);
    const pre = look >= 2 ? allWords.filter(w => w.start >= a - look - 0.1 && w.end <= a + 0.05) : [];
    const wsAll = [...pre, ...ws];
    if (ws.length < 4) return { changed: false, note: 'casi no se habla' };
    const peaks = await loudPeaks(a, b);
    const txt = ws.map(w => `[${(w.start - a).toFixed(1)}] ${w.text.trim()}`).join(' ').slice(0, 9000);
    const preTxt = pre.map(w => `[${(w.start - a).toFixed(1)}] ${w.text.trim()}`).join(' ').slice(0, 3000);
    const A = await ezAgentCfg();
    say('Pensando cómo empezar…'); if (own) busyMsg('Pensando cómo empezar…');
    const o = await gemRetry(() => geminiJSON([{ text: `Eres un editor profesional de clips virales de TikTok. Este clip de un streamer dura ${dur.toFixed(1)} s.
Transcripción del clip con el segundo en que empieza cada palabra:
${txt}
${preTxt ? `\nLo que se dice JUSTO ANTES del clip (ahora NO está incluido; segundos negativos):\n${preTxt}\n` : ''}
${peaks.length ? 'Momentos con más volumen (gritos, risas): ' + peaks.join(' s, ') + ' s.' : ''}
${A.rules ? 'Pautas del cliente:\n' + A.rules.slice(0, 8000) + '\n' : ''}
Decide CON CRITERIO cómo hacer que enganche desde el primer segundo. No cambies nada si el clip ya empieza bien.
0) "context": si para ENTENDER el clip hace falta de verdad algo de lo que se dice justo antes (la pregunta que está respondiendo, a quién o a qué reacciona, el inicio de la historia o del chiste), di el segundo NEGATIVO desde donde debe empezar. Solo si es realmente necesario y lo más corto posible; si el clip se entiende solo, null.
1) "start": si los primeros segundos son relleno (saludos, «eh», «bueno», silencio, contexto que no hace falta), di el segundo donde debería empezar. NUNCA quites contexto necesario para entender lo que pasa después. Si ya empieza bien, null.
2) "teaser": si poner al principio un adelanto de 1,5 a 3,5 segundos con lo más potente del clip (un grito, una frase muy fuerte, una reacción) haría que la gente se quede, di su inicio y final en segundos. Úsalo SOLO si: ese momento no está ya en los primeros 4 segundos, se entiende solo, y NO destripa el remate (si la gracia del clip es el final sorpresa o el chiste, no lo adelantes). Si no conviene, null.
Si usas "context", "start" debe ser null.
Responde solo JSON: {"context": número negativo o null, "start": número o null, "teaser": {"s": número, "e": número} o null, "why": "explicación muy corta en español"}` }], 0.2), m => { say(m); if (own) busyMsg(m); });
    const snapStart = t => { const w = wsAll.find(w => w.start - a >= t - 0.35); return w ? Math.max(a - look, w.start - 0.12) : a + t; };
    const snapEnd = t => { const w = [...ws].reverse().find(w => w.end - a <= t + 0.35); return w ? Math.min(b, w.end + 0.15) : a + t; };
    let st = a, tz = null;
    const sv = o && o.start != null && isFinite(+o.start) ? +o.start : null;
    const cv = o && o.context != null && isFinite(+o.context) ? +o.context : null;
    if (cv != null && cv <= -0.5 && cv >= -look - 0.5 && pre.length) st = Math.min(a, snapStart(Math.max(-look, cv)));   // añadir el contexto que falta
    else if (sv != null && sv > 0.6 && sv < Math.min(dur * 0.35, 12) && dur - sv >= 6) st = snapStart(sv);
    const T = o && o.teaser;
    if (T && isFinite(+T.s) && isFinite(+T.e)) {
      let s0 = snapStart(+T.s), e0 = snapEnd(+T.e);
      if (e0 - s0 > 4) e0 = s0 + 4;
      if (e0 - s0 >= 1.2 && s0 - st > 4) tz = { s: s0, e: e0 };
    }
    if (st === a && !tz) { clipMeta.hook = null; pushHistory(); return { changed: false, note: 'ya empezaba bien' }; }
    const orig = segs.map(g => ({ s: g.s, e: g.e }));
    const main = st < a ? [{ s: st, e: orig[0].e }, ...orig.slice(1)] : orig.map(g => ({ s: Math.max(g.s, st), e: g.e })).filter(g => g.e - g.s > 0.2);
    segs = [...(tz ? [{ s: tz.s, e: tz.e }] : []), ...main].map(g => ({ id: newId(), s: g.s, e: g.e }));
    pseg = 0; tlSig = '';
    clipMeta.hook = { orig, start: st - a, teaser: tz ? { s: tz.s - a, e: tz.e - a } : null, why: String((o && o.why) || '').slice(0, 200) };
    seekOut(0); pushHistory(); renderFlags();
    const note = [st > a ? `empieza ${(st - a).toFixed(1)} s después` : st < a ? `añade ${(a - st).toFixed(1)} s de contexto` : '', tz ? `adelanto de ${(tz.e - tz.s).toFixed(1)} s` : ''].filter(Boolean).join(' + ');
    if (!quiet) toast('🪝 ' + note + (clipMeta.hook.why ? ' — ' + clipMeta.hook.why : ''));
    return { changed: true, note };
  } catch (e) {
    console.warn('Gancho', e);
    if (!quiet) toast('No se pudo buscar el gancho' + (e.message === 'QUOTA' ? ': límite de Gemini' : ''));
    return null;
  } finally { if (own) busy(false); }
}
function ezUnhook() {
  const h = clipMeta.hook; if (!h || !h.orig) return;
  segs = h.orig.map(g => ({ id: newId(), s: g.s, e: g.e })); pseg = 0; tlSig = '';
  clipMeta.hook = null; seekOut(0); pushHistory(); renderFlags(); toast('Gancho quitado: el clip vuelve a empezar como antes');
}


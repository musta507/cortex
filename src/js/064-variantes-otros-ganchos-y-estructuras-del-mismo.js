/* ---------- variantes: otros ganchos y estructuras del mismo clip ---------- */
function varSaveCur() {
  const V = clipMeta.variants; if (!V) return;
  const v = V[clipMeta.varCur || 0]; if (!v) return;
  v.segs = segs.map(g => ({ s: g.s, e: g.e })); v.title = $('title').value; v.hl = [...titleHL];
  v.dur = v.segs.reduce((x, g) => x + g.e - g.s, 0);
}
function applyVariant(i, quiet) {
  const V = clipMeta.variants; if (!V || !V[i]) return;
  if (i !== (clipMeta.varCur || 0)) varSaveCur();
  const v = V[i];
  segs = v.segs.map(g => ({ id: newId(), s: g.s, e: g.e })); pseg = 0; tlSig = '';
  $('title').value = v.title || ''; titleHL.clear(); (v.hl || []).forEach(k => titleHL.add(k)); renderChips();
  clipMeta.varCur = i; clipMeta.hook = null;
  seekOut(0); pushHistory(); renderSide(); renderFlags();
  if (!quiet && vid.paused) togglePlay();
}
async function ezVariants(n) {
  if (!getGemKey()) { ezAskKey(() => ezVariants(n)); return; }
  if (!loaded) return;
  n = Math.max(2, Math.min(5, +n || +(localStorage.getItem('clipzi-nvar') || 3)));
  vid.pause();
  busy('Probando ganchos y estructuras', [['words', 'Escuchar el clip'], ['ai', `Pensar ${n} variantes`], ['build', 'Montarlas']]);
  try {
    varSaveCur();
    const base = clipMeta.variants ? clipMeta.variants[0] : { name: 'Original', why: 'Tu versión de ahora', segs: segs.map(g => ({ s: g.s, e: g.e })), title: $('title').value, hl: [...titleHL] };
    base.dur = base.segs.reduce((x, g) => x + g.e - g.s, 0);
    const keep = base.segs;
    const a = Math.max(0, Math.min(...keep.map(g => g.s))), b = Math.min(srcDur(), Math.max(...keep.map(g => g.e))), dur = b - a;
    const look = Math.min(20, a), more = Math.min(15, Math.max(0, srcDur() - b));
    busyStep('words', 'work');
    segs = [{ id: newId(), s: a - look, e: b + more }]; pseg = 0;
    let heard;
    try { heard = await ensureWords(m => busyMsg(m)); } finally { segs = keep.map(g => ({ id: newId(), s: g.s, e: g.e })); pseg = 0; }
    const ws = allWords.filter(w => w.start >= a - look - 0.1 && w.end <= b + more + 0.1);
    if (!heard || ws.length < 6) throw new Error('NOWORDS');
    busyStep('words', 'ok', ws.length + ' palabras'); busyMsg('');
    busyStep('ai', 'work');
    const peaks = await loudPeaks(a, b);
    const rel = t => (t - a).toFixed(1);
    const txt = ws.map(w => `[${rel(w.start)}] ${w.text.trim()}`).join(' ').slice(0, 12000);
    const A = await ezAgentCfg();
    const o = await gemRetry(() => geminiJSON([{ text: `Eres un editor profesional de clips virales de TikTok. Quiero probar ${n} versiones distintas de este clip para ver cuál funciona mejor (las subiré en cuentas distintas).
La versión actual va del segundo 0 al ${dur.toFixed(1)} y está montada así (trozos en orden, en segundos): ${keep.map(g => `[${rel(g.s)} → ${rel(g.e)}]`).join(' ')}.
Título actual: «${base.title || ''}».
Transcripción con el segundo en que empieza cada palabra (negativo = lo que se dice ANTES del clip; mayor que ${dur.toFixed(1)} = lo que se dice DESPUÉS):
${txt}
${peaks.length ? 'Momentos con más volumen (gritos, risas): ' + peaks.join(' s, ') + ' s.\n' : ''}${A.rules ? 'Pautas del cliente:\n' + A.rules.slice(0, 8000) + '\n' : ''}
Haz ${n} variantes REALMENTE distintas entre sí y distintas de la actual. Elige las estrategias que mejor encajen con ESTE clip, por ejemplo:
- "gancho": un adelanto de 1,5 a 4 s con lo más potente al principio y luego el clip (sin destripar el remate);
- "al grano": empezar más tarde, quitando la introducción o el relleno;
- "más corto": quitar trozos de relleno del medio y acabar justo en el remate;
- "con contexto": empezar antes (segundos negativos) si falta contexto para entenderlo;
- "intriga": empezar con una pregunta o frase provocadora del propio clip;
- "otro final": acabar antes o un poco después para un final más fuerte.
Cada variante es una lista de "partes" en el orden en que se verán, con inicio y fin en segundos de la transcripción. Partes de al menos 1 s. Duración total entre ${Math.max(6, dur * 0.4).toFixed(0)} y ${(dur + 25).toFixed(0)} s. No cortes a mitad de frase.
Dale a cada una un título distinto para TikTok en español (máximo 10 palabras, que genere curiosidad, del estilo del actual) y di qué palabras del título van en color (posiciones desde 0, máximo 3).
Añade en "emoji" UN emoji que encaje con cada título (o vacío), sin meterlo dentro del título.
Responde solo JSON: {"variantes":[{"nombre":"nombre corto de la estrategia","partes":[{"s":número,"e":número}],"titulo":"...","emoji":"","destacar":[números],"why":"por qué puede funcionar, muy corto"}]}` }], 0.7), m => busyMsg(m));
    const list = (o && Array.isArray(o.variantes) ? o.variantes : []);
    busyStep('ai', list.length ? 'ok' : 'fail', list.length ? list.length + ' ideas' : 'sin respuesta'); busyMsg('');
    busyStep('build', 'work');
    const lo = a - look, hiT = b + more;
    const snapS = t => { const w = ws.find(w => w.start >= t - 0.35); return w ? Math.max(lo, w.start - 0.1) : t; };
    const snapE = t => { const w = [...ws].reverse().find(w => w.end <= t + 0.35); return w ? Math.min(hiT, w.end + 0.15) : t; };
    const made = [];
    for (const v of list.slice(0, n)) {
      const parts = (Array.isArray(v.partes) ? v.partes : []).map(p => {
        const s0 = a + Math.max(-look, Math.min(dur + more, +p.s)), e0 = a + Math.max(-look, Math.min(dur + more, +p.e));
        if (!isFinite(s0) || !isFinite(e0)) return null;
        let s = snapS(s0), e = snapE(e0); if (e - s < 0.8) { s = s0; e = e0; }
        return e - s >= 0.8 ? { s: Math.max(0, s), e: Math.min(srcDur(), e) } : null;
      }).filter(Boolean);
      const tot = parts.reduce((x, g) => x + g.e - g.s, 0);
      if (tot < 5) continue;
      const t0 = String(v.titulo || '').trim(), nw = (t0 || base.title).split(/\s+/).filter(Boolean).length;
      const title = t0 ? withEmoji(t0, v.emoji, $('titleEmoji').checked) : base.title;
      made.push({ name: String(v.nombre || 'Variante').slice(0, 40), why: String(v.why || '').slice(0, 160), segs: parts, title,
        hl: (Array.isArray(v.destacar) ? v.destacar : []).map(Number).filter(k => k >= 0 && k < nw).slice(0, 3), dur: tot });
    }
    if (!made.length) throw new Error('NOVAR');
    clipMeta.variants = [base, ...made]; clipMeta.varCur = 0;
    busyStep('build', 'ok', made.length + ' variantes');
    pushHistory(); renderSide(); await sleep(500);
    toast(`🧪 ${made.length} variantes listas: pulsa en una (a la izquierda) para verla`);
  } catch (e) {
    console.warn('Variantes', e);
    toast(e.message === 'NOWORDS' ? 'No he podido escuchar bien el clip para hacer variantes' : e.message === 'NOVAR' ? 'La IA no ha propuesto variantes que valgan. Prueba otra vez.' : e.message === 'QUOTA' ? 'Límite de Gemini: prueba en unos minutos' : 'No se pudieron hacer las variantes');
  } finally { busy(false); seekOut(0); }
}
async function exportVariants() {
  const V = clipMeta.variants; if (!V || exporting) return;
  const cur = clipMeta.varCur || 0;
  for (let i = 0; i < V.length; i++) {
    applyVariant(i, true);
    toast(`Exportando la versión ${i + 1} de ${V.length}…`);
    const out = await doExport(); if (!out) break;
    const a = document.createElement('a'); a.href = URL.createObjectURL(out.blob);
    a.download = exportName(out).replace(/(\.[^.]+)$/, `-v${i}$1`); document.body.append(a); a.click(); a.remove();
    await sleep(800);
  }
  applyVariant(cur, true);
  toast('Versiones exportadas: están en tu carpeta de descargas');
}


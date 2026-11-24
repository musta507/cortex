/* ---------- chat con el agente de cada creador: le das consejos y propone cambios en sus reglas ---------- */
const agTargetName = k => k === 'general' ? 'Reglas generales' : (AG_FORMATS[k] ? 'Cuándo usar ' + AG_FORMATS[k].name : k);
let agThinking = false;
async function agChatRender(cl) {
  const A = await getAgent(cl), box = $('agMsgs'); box.innerHTML = '';
  if (!A.chat.length) { const m = document.createElement('div'); m.className = 'agm ai'; m.textContent = `¡Hola! Soy el agente de ${cl.name}. Dime qué funciona y qué no con sus clips, o pregúntame cómo lo clipearía, y ajusto mis reglas.`; box.append(m); }
  A.chat.forEach((x, i) => {
    const m = document.createElement('div'); m.className = 'agm ' + (x.r === 'u' ? 'u' : 'ai') + (x.err ? ' err' : ''); m.textContent = x.t;
    (x.changes || []).forEach((c, j) => {
      const d = document.createElement('div'); d.className = 'agchg' + (c.done === 'ok' ? ' ok' : c.done === 'no' ? ' no' : '');
      const b = document.createElement('b'); b.textContent = (c.mode === 'replace' ? '✏️ Cambiar ' : '➕ Añadir a ') + agTargetName(c.target).replace(/^C/, 'c').replace(/^R/, 'r');
      const t = document.createElement('div'); t.className = 't'; t.textContent = c.text;
      d.append(b, t);
      const r = document.createElement('div'); r.className = 'r';
      if (!c.done) {
        const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = '✔ Aplicar'; ok.onclick = () => agApply(cl, i, j, true);
        const no = document.createElement('button'); no.textContent = '✕ No'; no.onclick = () => agApply(cl, i, j, false);
        r.append(ok, no);
      } else r.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: c.done === 'ok' ? '✔ Aplicado' : 'Descartado' }));
      d.append(r); m.append(d);
    });
    box.append(m);
  });
  if (agThinking) { const m = document.createElement('div'); m.className = 'agm ai'; m.id = 'agThink'; m.textContent = 'Pensando…'; box.append(m); }
  box.scrollTop = box.scrollHeight;
}
async function agApply(cl, i, j, yes) {
  const A = await getAgent(cl), c = A.chat[i] && A.chat[i].changes[j]; if (!c || c.done) return;
  c.done = yes ? 'ok' : 'no';
  if (yes) {
    const cur = c.target === 'general' ? (A.general || '') : ((A.when || {})[c.target] || '');
    const nv = c.mode === 'replace' || !cur.trim() ? c.text : cur.trim() + '\n' + c.text;
    if (c.target === 'general') { A.general = nv; $('agRules').value = nv; } else { A.when = A.when || {}; A.when[c.target] = nv; }
  }
  await saveAgent(cl, A); agChatRender(cl);
  if (yes) { toast(agTargetName(c.target) + ': actualizado'); if (c.target !== 'general') tplRender(); }
}
async function agChatSend(cl) {
  const inp = $('agChatIn'), q = inp.value.trim(); if (!q || agThinking) return;
  if (!getGemKey()) { toast('Primero pon tu clave de Gemini'); return; }
  inp.value = ''; let A = await getAgent(cl);
  A.chat.push({ r: 'u', t: q }); await saveAgent(cl, A);
  agThinking = true; await agChatRender(cl);
  const fmts = AG_WHEN_KEYS.filter(k => !presetHidden.includes(AG_FORMATS[k].preset));
  const fb = (A.feedback || []).slice(-20).map(x => `- «${x.title}» (formato ${x.fmt}${x.to ? ' → lo cambió a ' + x.to : ''})${x.t ? ': ' + x.t : ''}`).join('\n');
  const hist = A.chat.slice(-14, -1).map(x => (x.r === 'u' ? 'Clipper: ' : 'Tú: ') + x.t).join('\n');
  const prompt = `Eres el agente de clips de Cortex para el creador ${cl.name}. Sacas clips virales de sus directos para TikTok, Reels y Shorts y eliges el formato de cada clip. Ahora hablas con el clipper que trabaja para este creador: te da consejos, te cuenta qué funciona y qué no, o te pregunta.
TUS REGLAS ACTUALES:
Generales ("general"): ${A.general || '(vacías)'}
${fmts.map(k => `${AG_FORMATS[k].name} ("${k}"): ${(A.when || {})[k] || '(sin indicar)'}`).join('\n')}
${fb ? 'Lo que ha hecho el editor con tus últimos clips:\n' + fb + '\n' : ''}${hist ? 'Conversación hasta ahora:\n' + hist + '\n' : ''}
Mensaje nuevo del clipper: «${q}»
Responde en español de tú, claro, cercano y breve (máximo 4 frases), como un editor de clips con experiencia. Si te pregunta algo, contesta con criterio.
Si su mensaje es un consejo, una preferencia o una corrección que debe cambiar cómo clipeas en adelante, propón en "changes" los cambios concretos en tus reglas: "target" es "general" o uno de: ${fmts.map(k => '"' + k + '"').join(', ')}; "mode" es "add" (añadir una línea) o "replace" (reescribir esa regla entera, solo si la actual contradice el consejo); "text" es la regla nueva, corta y clara, escrita como instrucción. No propongas cambios si solo pregunta o charla, ni repitas reglas que ya tienes.
Responde solo JSON: {"reply":"...","changes":[{"target":"...","mode":"add|replace","text":"..."}]}`;
  let msg;
  try {
    const o = await gemRetry(() => geminiJSON([{ text: prompt }], 0.5), m => { const e = $('agThink'); if (e) e.textContent = m; });
    const ok = new Set(['general', ...fmts]);
    msg = { r: 'ai', t: String((o && o.reply) || 'Entendido.'), changes: (o && Array.isArray(o.changes) ? o.changes : []).filter(c => c && ok.has(c.target) && String(c.text || '').trim()).slice(0, 4).map(c => ({ target: c.target, mode: c.mode === 'replace' ? 'replace' : 'add', text: String(c.text).trim() })) };
  } catch (e) {
    msg = { r: 'ai', err: true, t: e.message === 'BADKEY' ? 'Tu clave de Gemini no funciona. Revísala.' : e.message === 'QUOTA' ? 'Gemini ha llegado a su límite gratuito por hoy. Prueba más tarde.' : e.message === 'NET' ? 'No hay conexión. Prueba otra vez.' : 'No he podido responder: ' + e.message };
  }
  agThinking = false; A = await getAgent(cl); A.chat.push(msg); if (A.chat.length > 80) A.chat = A.chat.slice(-80);
  await saveAgent(cl, A); agChatRender(cl);
}


/* ---------- vista previa de un momento: verlo tal cual antes de decidir si se edita ---------- */
let liveAll = [], pvIdx = -1, pvUrl = null, pvSeq = 0;
const pvOpenNow = () => !$('pvModal').hidden;
function pvClose() {
  $('pvSel').hidden = true;
  const v = $('pvVid'); v.pause(); v.removeAttribute('src'); v.load();
  if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; }
  $('pvModal').hidden = true; pvIdx = -1;
}
async function pvOpen(i) {
  if (i < 0 || i >= liveAll.length) return;
  const [S, g] = liveAll[i], seq = ++pvSeq;
  pvIdx = i; $('pvModal').hidden = false;
  const v = $('pvVid'); v.pause(); if (pvUrl) { URL.revokeObjectURL(pvUrl); pvUrl = null; } v.removeAttribute('src'); v.load();
  $('pvLoad').hidden = false; $('pvLoad').textContent = '⏳ Preparando el clip…';
  $('pvPos').textContent = `${i + 1} de ${liveAll.length}`;
  $('pvPrev').disabled = i === 0; $('pvNext').disabled = i === liveAll.length - 1;
  const main = g.items.find(x => x.src === 'agente') || g.items.find(x => x.src === 'clipper') || g.items.find(x => x.src === 'ia') || g.items.find(x => x.src === 'kick') || g.items[0];
  $('pvTitle').textContent = main.src === 'clipper' ? `${main.who || 'Un clipper'}: «${(main.info || '').slice(0, 70)}»` : (main.info || 'Momento').slice(0, 90);
  const inf = $('pvInfo'); inf.innerHTML = '';
  const bs = document.createElement('div'); bs.className = 'lv-bs';
  bs.innerHTML = [...g.kinds].map(k => `<span class="lv-b lv-${k}">${SRC_BADGE[k][0]} ${SRC_BADGE[k][1]}</span>`).join(''); inf.append(bs);
  const line = t => { const p = document.createElement('span'); p.textContent = t; inf.append(p); };
  line(`⏱ ${agoTxt(g.at)} · minuto ${clockOf(g.t0 - S.status.started)} del directo · ${Math.round(g.t1 - g.t0)} s · ${S.status.slug}`);
  for (const x of g.items) line(`${SRC_BADGE[x.src] ? SRC_BADGE[x.src][0] : '•'} ${x.src === 'clipper' ? (x.who || '') + ': ' : ''}${(x.info || '').slice(0, 140)}${x.views ? ` · 👁 ${x.views}` : ''}`);
  const sample = (g.items.find(x => x.sample) || {}).sample;
  if (sample && sample.length) { const p = document.createElement('span'); p.className = 'lv-chat'; p.textContent = '💬 ' + sample.slice(0, 6).join(' · '); inf.append(p); }
  line(`Puntuación: ${Math.round(g.score * 100)} / 100`);
  try {
    const c = await liveCutFile(S, g);
    if (seq !== pvSeq) return;
    pvUrl = URL.createObjectURL(c.f); v.src = pvUrl;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('vídeo')); });
    if (seq !== pvSeq) return;
    v.currentTime = Math.max(0, c.off || 0); v.dataset.a = c.off || 0; v.dataset.b = (c.off || 0) + (c.dur || v.duration);
    $('pvLoad').hidden = true;
    // marca qué trozo es el clip (lo que cogió el clipper / lo que detectó la IA) dentro del vídeo con margen
    if (!v.duration || !isFinite(v.duration)) await new Promise(r => { v.onloadedmetadata = r; setTimeout(r, 3000); });
    const D = v.duration || 1, a = +v.dataset.a, b = Math.min(D, +v.dataset.b), who = main.src === 'clipper' ? (main.who || 'el clipper') : main.src === 'agente' ? 'la IA (lo que pediste)' : main.src === 'ia' ? 'la IA' : 'Cortex';
    $('pvSel').hidden = false; $('pvSel').dataset.k = main.src;
    $('pvRg').style.left = (a / D * 100) + '%'; $('pvRg').style.width = ((b - a) / D * 100) + '%';
    $('pvSelT').innerHTML = ''; const t1 = document.createElement('b'); t1.textContent = main.src === 'clipper' ? `Lo que cogió ${who} en su clip` : `El clip que ha marcado ${who}`;
    const t2 = document.createElement('span'); t2.textContent = ` · del ${clockOf(a)} al ${clockOf(b)} de este vídeo (${Math.round(b - a)} s)`; $('pvSelT').append(t1, t2);
    v.play().catch(() => {});
  } catch (e) { if (seq === pvSeq) $('pvLoad').textContent = '⚠️ ' + e.message; }
}
$('pvVid').addEventListener('timeupdate', () => { const v = $('pvVid'); if (v.duration) $('pvPh').style.left = (v.currentTime / v.duration * 100) + '%'; });
$('pvTr').addEventListener('click', e => { const v = $('pvVid'), r = $('pvTr').getBoundingClientRect(); if (v.duration) { v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration; v.play().catch(() => {}); } });
$('pvFromA').onclick = () => { const v = $('pvVid'); v.currentTime = +v.dataset.a || 0; v.play().catch(() => {}); };
$('pvVid').addEventListener('timeupdate', () => { const v = $('pvVid'); if (v.dataset.b && v.currentTime > +v.dataset.b) { v.pause(); v.currentTime = +v.dataset.a; } });
$('pvClose').onclick = pvClose;
$('pvModal').addEventListener('click', e => { if (e.target.id === 'pvModal') pvClose(); });
$('pvPrev').onclick = () => pvOpen(pvIdx - 1);
$('pvNext').onclick = () => pvOpen(pvIdx + 1);
$('pvEdit').onclick = () => { if (pvIdx < 0) return; const [S, g] = liveAll[pvIdx]; liveEdit(S, g, $('pvEdit')).finally(() => { $('pvEdit').textContent = '✨ Editar este clip'; }); };
$('pvDrop').onclick = async () => {
  if (pvIdx < 0) return; const [, g] = liveAll[pvIdx], i = pvIdx;
  liveAll.splice(i, 1); await liveDrop(g);
  if (liveAll.length) pvOpen(Math.min(i, liveAll.length - 1)); else pvClose();
};
document.addEventListener('keydown', e => {
  if (!pvOpenNow() || typingIn(document.activeElement)) return;
  const v = $('pvVid');
  if (e.key === 'Escape') { pvClose(); e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.key === 'ArrowRight') { pvOpen(pvIdx + 1); e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.key === 'ArrowLeft') { pvOpen(pvIdx - 1); e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.key === ' ') { if (v.paused) v.play().catch(() => {}); else v.pause(); e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.key === 'Enter') { $('pvEdit').click(); e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
// adelanta el inicio hasta la primera voz (como mucho unos segundos), para que el clip empiece directamente hablando
async function speechStart(f, a, lim) {
  const au = await decodeAudio16k(f), R = 16000, fr = 320, i0 = Math.floor(a * R), i1 = Math.min(au.length, Math.floor((lim + 1) * R));
  if (i1 - i0 < fr * 10) return a;
  const rms = []; for (let i = i0; i + fr <= i1; i += fr) { let q = 0; for (let j = i; j < i + fr; j++) q += au[j] * au[j]; rms.push(Math.sqrt(q / fr)); }
  const sorted = [...rms].sort((x, y) => x - y), floor = sorted[Math.floor(sorted.length * 0.2)] || 0, thr = Math.max(0.02, floor * 4);
  for (let k = 0; k + 5 <= rms.length; k++) if (rms.slice(k, k + 5).every(v => v > thr)) { const t = a + k * fr / R - 0.08; return t <= lim ? Math.max(a, t) : a; }
  return a;
}
async function openLiveClip(S, g, f, off, dur, fmtPick) {
  const cl = clients.find(c => c.name.toLowerCase() === String(S.status.client || '').toLowerCase()) || clientOf(curClient) || clients[0];
  curClient = clients[0].id;
  if (!stDock) $('livePage').hidden = true;
  await newClip();
  const file = new File([f], `${S.status.slug}_min${clockOf(g.t0 - S.status.started).replace(/:/g, '-')}.mp4`, { type: 'video/mp4' });
  ezHold = true; try { await loadFile(file); } finally { ezHold = false; }
  ezA = Math.max(0, off); ezB = Math.min(ezDur(), off + dur);
  if (!ezSkip.speech) { try { ezA = await speechStart(file, ezA, Math.min(ezB - 1, ezA + 3)); } catch (e) { console.warn('inicio', e); } }
  ezApplyTrim(); ezShow('edit');
  // de qué momento exacto del directo sale este clip (para el registro)
  try { clipMeta.liveAt = { started: S.status.started, fileT0: g.t0 - off, t0: g.t0, t1: g.t1, m: momentInfo(S, g) }; clipLogAdd({ tipo: 'abierto', directo: clipMeta.liveAt.m }); } catch (e) { console.warn(e); }
  clipMeta.live = { kinds: [...g.kinds], session: S.name };
  $('liveBack').hidden = !!stDock;
  // formato del panel en directo; el título siempre lo saca de lo que se habla
  ezOptsUI(); const fa = $('ezFmtAuto'), ta = $('ezTitleAuto'), keep = [fa.checked, ezFmtSel, ta.checked];
  const lf = fmtPick || ezPref('liveFmt') || 'auto';
  fa.checked = lf === 'auto'; if (lf !== 'auto') ezFmtSel = lf; ta.checked = true;
  try { await ezRunAI(); } finally { fa.checked = keep[0]; ezFmtSel = keep[1]; ta.checked = keep[2]; ezOptsUI(); }
  // sin Gemini (o si falla) el título sale igualmente de lo que se habla: el texto del clipper, el del momento o las primeras frases
  pos.tx = 0;   // el título, siempre centrado de lado a lado
  try { if (titleIsDefault() && !ezSkip.title) {
    const main = g.items.find(x => x.src === 'agente') || g.items.find(x => x.src === 'clipper') || g.items.find(x => x.src === 'ia') || g.items[0] || {};
    let t = String(main.info || '').replace(new RegExp('^' + String(main.who || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*'), '')
      .replace(/#\S+/g, '').replace(/@\S+/g, '').replace(/^(Clip de|Momento|Pico de chat)\b.*$/i, '').replace(/\s+/g, ' ').trim();
    if (t.length < 6 && captions.length) t = captions.slice(0, 3).map(c => c.text || (c.words || []).map(w => w.text).join(' ')).join(' ').trim();
    if (t) { t = t.split(' ').slice(0, 12).join(' '); titleHL.clear(); $('title').value = t; $('title').dispatchEvent(new Event('input', { bubbles: true })); renderChips(); pushHistory(); }
  } } catch (e) { console.warn('título', e); }
}

// la IA también mira el directo (opcional): cada 2 minutos nuevos de audio
function wavToF32(buf) {
  const dv = new DataView(buf); let p = 12, rate = 8000, ch = 1, bits = 16, data = null;
  while (p + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3)), sz = dv.getUint32(p + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(p + 10, true); rate = dv.getUint32(p + 12, true); bits = dv.getUint16(p + 22, true); }
    if (id === 'data') { data = [p + 8, Math.min(sz, dv.byteLength - p - 8)]; break; }
    p += 8 + sz + (sz & 1);
  }
  if (!data || bits !== 16) return { a: new Float32Array(0), rate };
  const n = Math.floor(data[1] / 2 / ch), a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = dv.getInt16(data[0] + i * 2 * ch, true) / 32768;
  return { a, rate };
}
async function liveAI(S) {
  if (S.aiBusy || !getGemKey()) return;
  const cl = clients.find(c => c.name.toLowerCase() === String(S.status.client || '').toLowerCase()); if (!cl) return;
  const L = await getLive(cl); if (!L.ai) return;
  const recent = S.segs.filter(x => !S.aiDone.has(x.f) && Date.now() / 1000 - x.t1 < 600);
  const take = []; for (const x of recent) { take.push(x); if (x.t1 - take[0].t0 >= 110) break; }
  if (!take.length || take[take.length - 1].t1 - take[0].t0 < 110) return;
  S.aiBusy = true;
  try {
    const parts = [];
    for (const x of take) { const { a } = wavToF32(await (await fileAt(S.h, x.wav)).arrayBuffer()); parts.push(a); }
    const n = parts.reduce((s, a) => s + a.length, 0), au = new Float32Array(n); let o = 0; for (const a of parts) { au.set(a, o); o += a.length; }
    const A = await getAgent(cl);
    const res = await geminiJSON([{ inline_data: { mime_type: 'audio/wav', data: wavB64(au, 8000) } }, { text: `Son ${Math.round(n / 8000)} segundos de audio del directo de ${S.status.slug}${S.status.client ? ' (cliente: ' + S.status.client + ')' : ''}, ahora mismo.
${A.rules ? 'PAUTAS DEL CLIENTE:\n' + A.rules + '\n' : ''}Eres un clipper profesional de TikTok. ¿Hay aquí algún momento que pueda ser un clip viral (algo gracioso, polémico, una reacción fuerte, una frase potente, una historia que engancha)?
Solo los buenos de verdad (nota 7 o más sobre 10). Si no hay ninguno, lista vacía.
Para cada uno: segundo de inicio y final dentro de este audio, un título corto en español latino que describa lo que pasa, la nota y por qué.
CLIPS CORTOS: un clip = un solo tema. Entre 8 y 35 segundos (nunca más de 40). Empieza justo cuando arranca ese tema o la frase clave, sin introducciones ni contexto que no haga falta, y termina en el remate o la reacción.
Responde solo JSON: {"moments":[{"s":12,"e":40,"title":"...","score":8,"why":"..."}]}` }], 0.3, { models: [...GEM_LITE, ...GEM_MODELS] });
    const base = take[0].t0, lines = [];
    for (const m of (res && res.moments) || []) {
      if (!(+m.score >= 7) || !isFinite(+m.s)) continue;
      const e = Math.min(isFinite(+m.e) && +m.e > +m.s ? +m.e : +m.s + 30, +m.s + 40);
      lines.push({ id: 'ia' + Date.now().toString(36) + lines.length, src: 'ia', t0: base + +m.s, t1: base + e, conf: Math.min(1, +m.score / 10), info: (m.title || 'Momento') + (m.why ? ' — ' + m.why : ''), at: Date.now() / 1000 });
    }
    lines.push({ done: take.map(x => x.f) });
    take.forEach(x => S.aiDone.add(x.f));
    const old = (await rtext(S.h, 'moments_ia.jsonl')) || '';
    await wfile(S.h, 'moments_ia.jsonl', old + lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  } catch (e) { console.warn('IA en directo', e); if (e.message === 'QUOTA' || e.message === 'BADKEY') take.forEach(x => S.aiDone.add(x.f)); }
  finally { S.aiBusy = false; }
}



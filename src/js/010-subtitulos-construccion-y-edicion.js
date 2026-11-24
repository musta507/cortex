/* ---------- subtítulos: construcción y edición ---------- */
/* Agrupar las palabras «con cabeza»: el número del ajuste es el MÁXIMO.
   - palabras cortas van juntas (hasta ese máximo); una palabra muy larga va sola
   - se corta en la puntuación y en las pausas al hablar
   - no se deja colgando al final un «el», «de», «que»… (pasa a la frase siguiente con su palabra) */
const capLen = w => w.text.trim().replace(/[^\p{L}\p{N}]/gu, '').length;
const CAP_WEAK = new Set('el la los las un una unos unas de del al a en y e o u que con por para sin su sus mi mis tu tus se me te le lo les nos ni si como pero porque cuando'.split(' '));
function groupWords(words, max) {
  max = Math.max(1, max | 0);
  if (max === 1) return words.map(w => [w]);
  const budget = 4 * max + 2;                          // letras por frase: 2 palabras ≈ 10, 3 ≈ 14, 4 ≈ 18…
  const LONG = 10;                                     // desde aquí, la palabra va sola
  const punct = w => /[.,!?;:…]$/.test(w.text.trim());
  const weak = w => CAP_WEAK.has(w.text.trim().toLowerCase().replace(/[^\p{L}]/gu, ''));
  const out = []; let cur = [], chars = 0;
  const sum = g => g.reduce((a, w) => a + capLen(w), 0);
  // cerrar la frase; si «next» sigue hablando sin pausa y la frase acaba en palabra floja, esa palabra se va con «next»
  const close = next => {
    if (!cur.length) return;
    const carry = [];
    if (next && capLen(next) < LONG) while (cur.length >= 2 && carry.length < 2) {
      const last = cur[cur.length - 1], after = carry[0] || next;
      if (!weak(last) || punct(last) || after.start - last.end > 0.45) break;
      carry.unshift(cur.pop());
    }
    out.push(cur); cur = carry; chars = sum(carry);
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i], L = capLen(w), prev = words[i - 1];
    const pause = prev && w.start - prev.end > 0.45;
    if (cur.length && pause) { out.push(cur); cur = []; chars = 0; }
    else if (cur.length && (L >= LONG || cur.length >= max || chars + L > budget)) close(w);
    cur.push(w); chars += L;
    if (L >= LONG || punct(w)) { out.push(cur); cur = []; chars = 0; }
  }
  if (cur.length) out.push(cur);
  // una palabra corta sola: se junta con la frase de antes si cabe (sin pasar del máximo)
  for (let i = 1; i < out.length; i++) {
    const g = out[i], pv = out[i - 1], pl = pv[pv.length - 1];
    if (g.length !== 1 || capLen(g[0]) > 5 || pv.length >= max) continue;
    if (punct(pl) || g[0].start - pl.end > 0.45 || capLen(pl) >= LONG || sum(pv) + capLen(g[0]) > budget + 3) continue;
    if (weak(g[0]) && !punct(g[0]) && out[i + 1] && out[i + 1][0].start - g[0].end <= 0.45) continue;   // mejor colgada sola que al final de la otra
    pv.push(g[0]); out.splice(i, 1); i--;
  }
  // palabra floja muy corta que se quedó sola («lo», «y», «de»): entra en la frase siguiente si cabe (tres palabras cortas juntas sí valen)
  for (let i = 0; i < out.length - 1; i++) {
    const g = out[i], nx = out[i + 1];
    if (g.length !== 1 || !weak(g[0]) || punct(g[0]) || capLen(g[0]) > 3) continue;
    if (nx[0].start - g[0].end > 0.45 || nx.length > max || capLen(nx[0]) >= LONG || sum(nx) + capLen(g[0]) > budget + 1) continue;
    nx.unshift(g[0]); out.splice(i, 1); i--;
  }
  return out;
}
function buildCaptions() {
  const max = +$('wpc').value;
  captions = groupWords(allWords, max).map(ws => ({ start: ws[0].start, end: ws[ws.length - 1].end, words: ws }));
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i], n = captions[i + 1];
    if (c.end - c.start < 0.25) c.end = c.start + 0.25;
    if (n && n.start - c.end < 0.5) c.end = n.start;
  }
  renderCapList();
}
function renderCapList() {
  const box = $('caps'); box.innerHTML = '';
  captions.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'cap';
    const b = document.createElement('button'); b.className = 'tc'; b.textContent = fmtc(c.start);
    b.title = 'Ir a este momento';
    b.onclick = () => { seekSrc(c.start + 0.01); };
    const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'cap' + i;
    inp.value = c.words.map(w => w.text.trim()).join(' ');
    inp.addEventListener('input', () => editCaption(i, inp.value));
    row.append(b, inp); box.append(row);
  });
  activeCap = -1;
  $('s3').classList.toggle('done', captions.length > 0);
}
function editCaption(i, text) {
  const c = captions[i];
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) { c.words = [{ text: '', start: c.start, end: c.end }]; }
  else {
    const total = parts.reduce((a, p) => a + p.length, 0), span = c.end - c.start;
    let t = c.start;
    c.words = parts.map(p => { const d = span * p.length / total; const w = { text: p, start: t, end: t + d }; t += d; return w; });
  }
  allWords = captions.flatMap(c => c.words.filter(w => w.text));
}
function markActive(i) {
  const rows = $('caps').children;
  if (activeCap >= 0 && rows[activeCap]) rows[activeCap].classList.remove('on');
  if (i >= 0 && rows[i]) { rows[i].classList.add('on'); if (!vid.paused) rows[i].scrollIntoView({ block: 'nearest' }); }
  activeCap = i;
}
$('wpc').addEventListener('input', e => { $('wpcV').textContent = e.target.value; if (allWords.length) buildCaptions(); });


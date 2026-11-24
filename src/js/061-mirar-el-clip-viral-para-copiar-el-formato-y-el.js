/* ---------- mirar el clip viral para copiar el formato y el estilo ---------- */
async function framesOfFile(f, fracs, width) {
  const url = URL.createObjectURL(f), tv = document.createElement('video');
  tv.muted = true; tv.preload = 'auto'; tv.playsInline = true; tv.src = url;
  tv.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(tv);
  try {
    await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = () => rej(new Error('vídeo')); setTimeout(() => rej(new Error('vídeo')), 20000); });
    const d = tv.duration || 1, out = [];
    for (const fr of fracs) {
      await tvSeek(tv, d * fr);
      const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * (tv.videoHeight || 1920) / (tv.videoWidth || 1080));
      c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
    }
    return { imgs: out, dur: d, w: tv.videoWidth, h: tv.videoHeight };
  } finally { tv.remove(); URL.revokeObjectURL(url); }
}
async function repLook(vf, say) {
  const fr = await framesOfFile(vf, [0.12, 0.37, 0.62, 0.87], 540);
  const ps = fr.imgs.map(d => ({ inline_data: { mime_type: 'image/jpeg', data: d } }));
  ps.push({ text: `Son 4 fotogramas (al 12 %, 37 %, 62 % y 87 %) de un clip vertical de TikTok que se hizo viral. Lo hizo un clipper a partir del directo de un streamer. Quiero COPIAR su edición exactamente, así que describe con precisión lo que ves.
Formatos posibles:
"podcast" = la persona llena toda la pantalla vertical (se ve su cara o su cámara en grande), hablando;
"reaccion" = pantalla partida: arriba (o abajo) la cámara del streamer y en la otra parte lo que está viendo o jugando;
"dividida" = arriba el vídeo y abajo una imagen o foto fija (o al revés);
"horizontal" = el vídeo horizontal en el centro, con bandas o fondo difuminado arriba y abajo;
"horizontal_cam" = solo la cámara del streamer en horizontal en el centro (sin el juego), con fondo arriba y abajo;
"duo" = pantalla partida con una persona arriba y otra abajo, recortadas del mismo plano donde salen juntas;
"llamada" = de 2 a 5 personas una debajo de otra, cada una sacada de su cámara de una llamada (Discord).
El TÍTULO es el texto fijo que está igual en todos los fotogramas. Los SUBTÍTULOS son el texto que cambia de un fotograma a otro (lo que se dice).
Responde solo JSON:
{"formato":"podcast|reaccion|dividida|duo|llamada|horizontal|horizontal_cam",
"titulo":{"hay":true/false,"texto":"el texto exacto tal cual","posicion":"arriba|centro|abajo","caja":true/false (si va dentro de un recuadro de color),"mayusculas":true/false,"color_texto":"#rrggbb","color_caja":"#rrggbb","destacadas":["palabras del título en otro color"],"color_destacado":"#rrggbb","letra":"condensada|gruesa|redondeada|normal"},
"subtitulos":{"hay":true/false,"posicion":número de 0 a 100 (altura del centro de los subtítulos, % desde arriba),"mayusculas":true/false,"color":"#rrggbb","resalta_palabra":true/false (si la palabra que se dice va en otro color),"color_resaltado":"#rrggbb","palabras":número de palabras por subtítulo (1 a 6),"letra":"condensada|gruesa|redondeada|normal","borde":true/false},
"imagen":"si es dividida: qué imagen se ve, en pocas palabras",
"no_replicable":["cosas que se ven y no se pueden copiar con plantillas: emojis, stickers, zooms, efectos, textos extra…"]}` });
  return gemRetry(() => geminiJSON(ps, 0), say);
}
const REP_FONT_SUB = { condensada: 'Anton|400', gruesa: 'Montserrat|900', redondeada: 'Poppins|800', normal: 'Inter|800' };
const REP_FONT_TIT = { condensada: 'Coolvetica|400', gruesa: 'Montserrat|800', redondeada: 'Poppins|700', normal: 'Inter|700' };
const repHex = v => /^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : null;
function repSet(id, v) {
  const el = $(id); if (!el || v == null) return;
  if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === v)) return;
  if (el.type === 'checkbox') { el.checked = !!v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  else setRange(id, v);
}
function repApplyLook(L, fmt) {
  const T = L && L.titulo, Sb = L && L.subtitulos;
  if (T && T.hay !== false && String(T.texto || '').trim()) {
    const text = String(T.texto).replace(/\s+/g, ' ').trim();
    $('title').value = text; trk.title.hide = false;
    setTitleStyle(T.caja ? 'box' : 'plain');
    repSet('titleUpper', !!T.mayusculas);
    if (REP_FONT_TIT[T.letra]) repSet('titleFont', REP_FONT_TIT[T.letra]);
    if (T.caja) { if (repHex(T.color_caja)) repSet('boxColor', repHex(T.color_caja)); if (repHex(T.color_texto)) repSet('boxText', repHex(T.color_texto)); }
    else if (repHex(T.color_texto)) repSet('titleColor', repHex(T.color_texto));
    if (repHex(T.color_destacado)) repSet('titleHl', repHex(T.color_destacado));
    const ws = text.split(/\s+/).map(normWord), want = new Set((Array.isArray(T.destacadas) ? T.destacadas : []).flatMap(x => String(x).split(/\s+/)).map(normWord).filter(Boolean));
    titleHL.clear(); ws.forEach((w, i) => { if (w && want.has(w)) titleHL.add(i); }); renderChips();
    const y = { arriba: '13', centro: '45', abajo: '70' }[T.posicion];
    if (y && (fmt === 'podcast' || (T.posicion === 'abajo' && layoutMode === 'single'))) repSet('titleY', y);
  } else if (T && T.hay === false) { trk.title.hide = true; }
  if (Sb && Sb.hay !== false) {
    if (REP_FONT_SUB[Sb.letra]) repSet('subFont', REP_FONT_SUB[Sb.letra]);
    repSet('upper', !!Sb.mayusculas);
    if (repHex(Sb.color)) repSet('subColor', repHex(Sb.color));
    repSet('hl', !!Sb.resalta_palabra);
    if (Sb.resalta_palabra && repHex(Sb.color_resaltado)) repSet('hlColor', repHex(Sb.color_resaltado));
    if (isFinite(+Sb.palabras)) repSet('wpc', String(Math.max(1, Math.min(6, Math.round(+Sb.palabras)))));
    if (isFinite(+Sb.posicion)) repSet('subY', String(Math.max(15, Math.min(88, Math.round(+Sb.posicion)))));
    repSet('strokeOn', !!Sb.borde);
  }
  checkFonts(); syncTiles(); syncTrackUI();
}


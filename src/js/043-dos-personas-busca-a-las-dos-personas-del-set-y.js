/* ---------- «Dos personas»: busca a las dos personas del set y pone una arriba y otra abajo ---------- */
async function duoDetect() {
  if (callOn()) return callDetect();
  if (!loaded) return false;
  const vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080;
  const half = (side) => ({ x: side ? 0.5 : 0, y: 0, w: 0.5, h: 1 });
  let people = [];
  try {
    aiov('work', 'Buscando a las personas', 'Cargando la IA de caras (la primera vez tarda un poco más)…');
    await loadFaceApi();
    const frames = await sampleFrames(6), all = [];
    for (let i = 0; i < frames.length; i++) { aiov('work', 'Buscando a las personas', `Fotograma ${i + 1} de ${frames.length}…`); for (const f of await facesIn(frames[i])) all.push({ ...f, i }); }
    const groups = [];
    for (const f of all) {
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      let g = groups.find(g => Math.hypot(g.cx - cx, (g.cy - cy) * vh / vw) < Math.max(g.w, f.w) * 1.2);
      if (!g) { g = { items: [], cx, cy, w: f.w, h: f.h }; groups.push(g); }
      g.items.push(f); const n = g.items.length;
      g.cx = g.items.reduce((a, x) => a + x.x + x.w / 2, 0) / n; g.cy = g.items.reduce((a, x) => a + x.y + x.h / 2, 0) / n;
      g.w = g.items.reduce((a, x) => a + x.w, 0) / n; g.h = g.items.reduce((a, x) => a + x.h, 0) / n;
    }
    // las personas de verdad salen en varios fotogramas y tienen la cara de buen tamaño (no las de un póster o una pantalla pequeña)
    people = groups.map(g => ({ ...g, seen: new Set(g.items.map(x => x.i)).size }))
      .filter(g => g.seen >= 2 && g.w > 0.03)
      .sort((a, b) => b.seen * b.w - a.seen * a.w).slice(0, 2)
      .sort((a, b) => a.cx - b.cx);
  } catch (e) { console.warn('duo', e); }
  aiov('hide'); aiovT0 = 0;
  // recorte alrededor de cada cara con la forma exacta de su mitad de la pantalla
  const R = +$('ratio').value / 100 || 0.5, aspTop = W / (H * R), aspBot = W / (H * (1 - R));
  const around = (g, asp) => {
    let hp = Math.min(vh, g.h * vh * 6.5), wp = hp * asp;   // plano abierto: el cliente acerca si quiere
    if (wp > vw * 0.62) { wp = vw * 0.62; hp = wp / asp; }
    let x = g.cx * vw - wp / 2, y = g.cy * vh - hp * 0.36;
    x = Math.max(0, Math.min(vw - wp, x)); y = Math.max(0, Math.min(vh - hp, y));
    return { x: x / vw, y: y / vh, w: wp / vw, h: hp / vh };
  };
  zones = [];
  if (people.length >= 2) { crops.cam = around(people[0], aspTop); crops.content = around(people[1], aspBot); }
  else {   // no se ven bien dos caras: mitad izquierda arriba y mitad derecha abajo
    const fit = (side, asp) => { let hp = 1, wp = hp * asp * vh / vw; if (wp > 0.5) { wp = 0.5; hp = wp / asp * vw / vh; } return { x: side ? 1 - wp - (0.5 - wp) / 2 : (0.5 - wp) / 2, y: (1 - hp) / 2, w: wp, h: hp }; };
    crops.cam = fit(0, aspTop); crops.content = fit(1, aspBot);
    toast(people.length ? 'Solo he encontrado una cara clara: ajusta las dos partes con el ratón' : 'No he encontrado las caras: he puesto la izquierda arriba y la derecha abajo');
  }
  if (people.length >= 2) toast('Arrastra cada persona para encuadrarla · la rueda del ratón acerca o aleja');
  crops.camFx = 0.5; crops.fit = 'cover'; delete crops.zk;
  setRange('zoom', 100); setRange('offX', 0); setRange('offY', 0);
  tlSig = '';
  return people.length >= 2;
}
async function autoDetectCam(force) {
  if (!loaded || layoutMode !== 'react' || camDetecting) return;
  if ($('duo').checked) { if (force || camDetectedFor !== file) { camDetectedFor = file; await duoDetect(); } return; }
  if (!force && camDetectedFor === file) return;
  camDetecting = true;
  const st = $('camStatus');
  try {
    setStatus(st, 'Buscando la cámara del streamer…');
    if (getGemKey()) {
      try {
        if (await geminiZones(st)) return;
        aiov('work', 'Analizando el clip con IA', 'Gemini no la ha visto clara; probando la detección local…');
      } catch (e) {
        const why = e.message === 'BADKEY' ? 'tu clave de Gemini no es válida' : e.message === 'QUOTA' ? 'has llegado al límite gratuito de Gemini por hoy' : e.message === 'NET' ? 'no hay conexión con Gemini' : 'Gemini dio un error';
        console.warn('Gemini:', e);
        aiov('work', 'Analizando el clip con IA', `No se pudo usar Gemini (${why}). Probando la detección local…`);
        await sleep(1200);
      }
    }
    aiov('work', 'Analizando el clip con IA', 'Cargando la IA de caras (la primera vez tarda un poco más)…');
    await loadFaceApi();
    aiov('work', 'Analizando el clip con IA', 'Revisando el clip…');
    const frames = await sampleFrames(6);
    const all = [];
    for (let i = 0; i < frames.length; i++) { setStatus(st, `Buscando la cámara… ${i + 1}/${frames.length}`); aiov('work', 'Buscando al streamer', `Analizando fotograma ${i + 1} de ${frames.length}…`); for (const f of await facesIn(frames[i])) all.push({ ...f, i }); }
    aiov('work', 'Buscando el recuadro de la cámara', 'Analizando bordes y movimiento…');
    await sleep(30);
    // agrupar caras que aparecen en el mismo sitio en varios fotogramas
    const groups = [];
    for (const f of all) {
      const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
      let g = groups.find(g => Math.hypot(g.cx - cx, (g.cy - cy) * 9 / 16) < Math.max(g.w, f.w) * 0.9);
      if (!g) { g = { items: [], cx, cy, w: f.w }; groups.push(g); }
      g.items.push(f); const n = g.items.length;
      g.cx = g.items.reduce((a, x) => a + x.x + x.w / 2, 0) / n; g.cy = g.items.reduce((a, x) => a + x.y + x.h / 2, 0) / n; g.w = g.items.reduce((a, x) => a + x.w, 0) / n;
    }
    let best = null;
    for (const g of groups) {
      const framesSeen = new Set(g.items.map(x => x.i)).size;
      const move = g.items.reduce((a, x) => a + Math.hypot(x.x + x.w / 2 - g.cx, x.y + x.h / 2 - g.cy), 0) / g.items.length / Math.max(0.01, g.w);
      const corner = Math.min(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => Math.hypot(g.cx - a, g.cy - b)));
      const score = framesSeen / frames.length * 2 + (1 - Math.min(1, corner / 0.7)) - Math.min(1, move) * 1.5;
      if (framesSeen >= Math.ceil(frames.length / 2) && (!best || score > best.score)) best = { g, score };
    }
    const E = persistentEdges(frames);
    const rects = cornerRects(E).concat(sideRects(E)).map(r => ({ ...r, kind: 'edge' }));
    const vrects = varianceRects(frames);
    let face = null;
    if (best) { const items = best.g.items, n = items.length;
      face = { x: items.reduce((a, x) => a + x.x, 0) / n, y: items.reduce((a, x) => a + x.y, 0) / n, w: items.reduce((a, x) => a + x.w, 0) / n, h: items.reduce((a, x) => a + x.h, 0) / n }; }
    // ¿alguna cara (aunque se mueva un poco) dentro de un recuadro de esquina?
    const inside = (r, f) => { const fx = f.x + f.w / 2, fy = f.y + f.h / 2; return fx > r.x && fx < r.x + r.w && fy > r.y && fy < r.y + r.h; };
    let cam = null;
    // solo cuenta la cara del streamer (fija en casi todos los fotogramas), no caras sueltas del contenido
    const hasFace = r => face ? inside(r, face) : groups.some(g => new Set(g.items.map(x => x.i)).size >= Math.ceil(frames.length * 0.6) && inside(r, { x: g.cx, y: g.cy, w: 0, h: 0 }));
    const edgeFace = rects.filter(hasFace), varFace = vrects.filter(hasFace);
    const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), i = ix * iy; return i / (a.w * a.h + b.w * b.h - i); };
    const vBest = varFace.slice().sort((a, b) => b.cov - a.cov)[0];
    if (edgeFace.length && vBest) {
      // si las dos pistas coinciden, el recuadro de bordes más parecido a la zona de movimiento distinto
      const e = edgeFace.slice().sort((a, b) => iou(b, vBest) - iou(a, vBest))[0];
      cam = iou(e, vBest) > 0.75 ? { ...e, edges: e.real } : { ...vBest, edges: 2 };
    }
    else if (edgeFace.length) { edgeFace.sort((a, b) => b.area - a.area); cam = { ...edgeFace[0], edges: edgeFace[0].real }; }   // el recuadro más grande que contiene la cara es la cámara (los muebles del fondo quedan dentro)
    else if (varFace.length) { varFace.sort((a, b) => b.cov - a.cov); cam = { ...varFace[0], edges: 2 }; }
    else if (face) {
      cam = camRectFromFace(face, E);
      // si la cara no tenía bordes claros, nos fiamos más de la zona que se mueve distinto (si la contiene)
      if (!cam.edges) { const v = vrects.filter(r => inside(r, face)).sort((a, b) => b.cov - a.cov)[0]; if (v) cam = { ...v, edges: 2 }; }
    }
    else if (rects.length) { rects.sort((a, b) => b.area * b.cov - a.area * a.cov); cam = { ...rects[0], edges: rects[0].real }; }
    else if (vrects.length) { vrects.sort((a, b) => b.cov - a.cov); cam = { ...vrects[0], edges: 1 }; }
    if (!cam) { camDetectedFor = file; setStatus(st, 'No he encontrado la cámara. Márcala con doble clic en la parte de arriba.', 'err');
      await aiovDone(false, 'No he encontrado la cámara', 'Puede que no se vea bien la cara o que la cámara se mueva. Márcala a mano.'); return; }
    if (!face) {   // cara para centrar/zoom: la mejor que caiga dentro del recuadro
      const g = groups.filter(g => inside(cam, { x: g.cx, y: g.cy, w: 0, h: 0 })).sort((a, b) => b.items.length - a.items.length)[0];
      if (g) { const it = g.items, n = it.length; face = { x: it.reduce((a, x) => a + x.x, 0) / n, y: it.reduce((a, x) => a + x.y, 0) / n, w: it.reduce((a, x) => a + x.w, 0) / n, h: it.reduce((a, x) => a + x.h, 0) / n }; }
    }
    if (!face) face = { x: cam.x + cam.w * 0.4, y: cam.y + cam.h * 0.3, w: cam.w * 0.2, h: cam.h * 0.3 };
    applyCamResult(cam, face, 'local');
  } catch (e) {
    console.warn('Detección de cámara:', e);
    setStatus(st, 'No se pudo usar la detección automática. Marca la cámara con doble clic arriba.', 'err');
    await aiovDone(false, 'No se pudo usar la IA', 'Revisa tu conexión a internet (la IA se descarga la primera vez) o marca la cámara a mano.');
  } finally { camDetecting = false; }
}
$('camDetect').onclick = () => autoDetectCam(true);

/* ====== AGENTE DE CLIPS: le das un directo y saca los clips como un clipper profesional ====== */
const AG_FORMATS = {
  podcast: { preset: 'Podcast', name: 'Primer plano' },
  reaccion: { preset: 'Reacción', name: 'Reacción' },
  dividida: { preset: 'Pantalla dividida', name: 'Pantalla dividida' },
  horizontal_cam: { preset: 'Título y subtítulos', name: 'Horizontal · solo cámara' },
  duo: { preset: 'Dos personas', name: 'Dos personas' },
  llamada: { preset: 'Llamada', name: 'Llamada' },
  horizontal: { preset: 'Título y subtítulos', name: 'Horizontal' },
};
const WESTCOL_RULES = `No generar subtítulos, solo título.
Formatos y cuándo usarlos:
1) PODCAST (el que más se usa): cuando WestCOL está hablando en su PC sin reaccionar a nada, simplemente hablando. El logo de Kick va abajo y el título arriba, destacando palabras en rojo.
2) REACCIÓN: cuando está reaccionando a algo en pantalla (un vídeo, un tweet, un TikTok, una web…) o jugando.
3) PANTALLA DIVIDIDA: cuando está hablando y una imagen ayuda a representar mejor la idea o acompaña lo que dice. Indica qué imagen poner.
4) HORIZONTAL SOLO CÁMARA: cuando está jugando al casino y dice algo interesante. TikTok no admite casino: se recorta solo su cámara y se pone en horizontal con el título y el logo de Kick abajo. El casino no se enseña.
Objetivo: viralidad.`;
@@solo-web
const GENERAL_MANUAL = `QUÉ ELEGIR (aprendido de miles de clips virales de streamers hispanos; «rinde ×2» = el doble de visitas que un clip normal):
1. Lo que mejor rinde es que PASE algo, no que se hable de algo: acción, sustos o golpes (×2,8), revelaciones y confesiones (×1,5), polémica y tiraderas con nombres (×1,46), invitados famosos y eventos (×1,36).
2. Busca tensión personal: choque, pelea, chisme, pareja real de alguien conocido, dinero.
3. Baja la prioridad (rinden ×0,7–0,9) de: partidas y juego, fútbol, el día a día con los amigos de siempre, planes, momentos tiernos y mensajes de apoyo o solidaridad. Solo sácalos si pasa algo fuera de lo normal.
4. El humor solo funciona si lo protagoniza el streamer o alguien muy conocido; el humor de relleno rinde poco.

CÓMO CORTAR:
5. Empieza en la frase fuerte o en la reacción, sin presentación ni contexto previo. Nunca empieces con una pregunta (rinde ×0,84).
6. Termina cuando acaba el momento, sin dejar que se apague. Mejor corto que largo: lo normal es de 8 a 35 segundos.
7. Un clip = un solo tema: exactamente lo que dice el título.

CÓMO TITULAR:
8. Nombra a 2 o 3 personas por su nombre.
9. Pon al streamer como quien recibe la acción: «X le hace Y a [streamer]».
10. Di la causa o la consecuencia: «porque…», «cuando…», «para que…».
11. Evita «todos», «nadie», «muestra», las preguntas y los títulos de 5 palabras o menos.`;
const GENERAL_TG = `- [Invitado] [acción] a [streamer] porque/cuando [lo que pasó]
- [Persona] le [hace algo] a [streamer] para que [consecuencia]
- [Streamer] y [persona] [acción] porque [causa] (con 2–3 nombres propios)
- Nombra siempre a las personas por su nombre; nada de preguntas, «todos», «nadie» ni «muestra»; más de 5 palabras.`;
@@fin
const WESTCOL_MANUAL = `QUIÉN ES: WestCOL (Luis Fernando Villa, Medellín, 2001) es el streamer con más seguidores de Kick. Hace directos largos con su círculo (Luisa Castro, El Chanty, Samulx, La Sapa, La Piquiña, Willito…), juega Minecraft y DEDsafío, ve fútbol, tiene invitados famosos y eventos (Stream Fighters, La Velada). Sello W Sound con Ovy on the Drums; Blessd es amigo cercano. Stream Fighters 5 (14 nov 2026, Bogotá) incluye una pelea de robots contra el robot de Blessd. A la gente le importa: sus peleas y tensiones, su relación con Luisa, el dinero que gasta, sus invitados y los eventos.

QUÉ ELEGIR (datos de 3.714 clips virales de @colclips___; «rinde ×2» = el doble de visitas que un clip normal de esa semana):
1. Prioriza invitados y eventos: el robot ×3,7, Karina García ×3,1, MrStiven ×2,6, Blessd ×2,4, Camilo ×2,4, Shifu ×2,3, Luisa Castro ×1,7, Stream Fighters ×1,7, La Velada ×1,5, Ibai ×1,6.
2. Busca tensión personal: choque o pelea (×1,8), chisme o pareja (×1,5), dinero (×1,4). Lo que mejor rinde es que PASE algo, no que se hable de algo.
3. Baja la prioridad (rinden ×0,6–0,9) de: Minecraft, DEDsafío, fútbol, Lonche, el día a día con el círculo (Chanty, La Sapa, Samulx, La Piquiña, Willito, La Cobra), planes, partidas y momentos tiernos. Solo sácalos si pasa algo fuera de lo normal (una pelea, una revelación, una reacción extrema).
4. Los días con invitado o evento, saca muchos clips: el 10 % de los días trae un tercio de las visitas.
5. Revisa el directo hasta el final: los momentos fuertes suelen llegar tarde.
6. En lo que se dice rinden más: peleas/boxeo, familia/bebé, insultos fuertes, religión, dinero, hablar directamente con alguien. El fútbol rinde menos (×0,82).

CÓMO CORTAR:
7. Empieza en la frase fuerte o en la reacción, sin presentación ni contexto previo. Nunca empieces con una pregunta (rinde ×0,84). Ejemplo: MrStiven cortado justo en la revelación hizo ×10,7; la versión con presentación, ×1,4.
8. Termina cuando acaba el momento, sin dejar que se apague. Mejor corto que largo: con el mismo momento, la versión más corta ganó 4 de cada 6 veces (12 s ×2,65 frente a 44 s ×0,23).
9. Añade contexto solo si sin él no se entiende nada.

CÓMO TITULAR:
10. Nombra a 2 o 3 personas por su nombre (Blessd, Luisa, MrStiven…).
11. Pon a WestCOL como quien recibe la acción: «X le hace Y a WestCOL».
12. Di la causa o la consecuencia: «porque…», «cuando…», «para que…».
13. Evita «todos», «nadie», «muestra», las preguntas y los títulos de 5 palabras o menos.

CONSEJOS POR TEMA:
- Robot / Stream Fighters: cualquier momento vale; saca varios cortes.
- Blessd, MrStiven, Camilo, Karina, Shifu: busca la revelación o el reto; título con los dos nombres.
- Luisa Castro: celos, discusión, pareja; di qué pasó entre ellos.
- La Velada / peleas: amenazas, cara a cara, golpes.
- Chanty, Samulx, La Sapa, La Piquiña: solo si hay choque o algo fuera de lo normal.
- DEDsafío / Minecraft: solo la frase o la jugada, muy corto.
- Fútbol: solo reacciones extremas; si no, sáltalo.`;
const WESTCOL_TITLE_GUIDE = `- [Invitado] [acción] a WestCOL porque/cuando [lo que pasó]
- [Persona] le [hace algo] a WestCOL para que [consecuencia]
- WestCOL y [persona] [acción] porque [causa] (con 2–3 nombres propios)
- Nombra siempre a las personas por su nombre; nada de preguntas, «todos», «nadie» ni «muestra»; más de 5 palabras.`;
const AG_DEFAULT = () => ({ rules: '', subs: true, silence: true, censor: true, censorLvl: 'tiktok', bad: '', feedback: [] });
// reglas del agente: unas generales + «cuándo usarla» de cada formato (se escribe debajo de cada plantilla)
const AG_WHEN_KEYS = ['podcast', 'reaccion', 'dividida', 'duo', 'llamada', 'horizontal', 'horizontal_cam'];
const AG_WHEN_LBL = { podcast: 'PODCAST', reaccion: 'REACCIÓN', dividida: 'PANTALLA DIVIDIDA', duo: 'DOS PERSONAS', llamada: 'LLAMADA', horizontal: 'HORIZONTAL (el vídeo tal cual)', horizontal_cam: 'HORIZONTAL SOLO CÁMARA' };
function agSplitRules(txt) {
  const when = {}, gen = [];
  for (const raw of String(txt || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (/^formatos y cu[aá]ndo usarlos:?$/i.test(l)) continue;
    const m = l.replace(/^\s*(\d+[).]|[-•*])\s*/, '').match(/^([^:]{2,60}):\s*(.+)$/);
    let k = null;
    if (m) { const lab = m[1]; k = /solo\s*c[aá]mara|horizontal_cam/i.test(lab) ? 'horizontal_cam' : /podcast/i.test(lab) ? 'podcast' : /reacci/i.test(lab) ? 'reaccion' : /dividida/i.test(lab) ? 'dividida' : /dos personas/i.test(lab) ? 'duo' : /llamada|discord/i.test(lab) ? 'llamada' : /horizontal/i.test(lab) ? 'horizontal' : null; }
    if (k) { const par = (m[1].match(/\(([^)]*)\)/) || [])[1]; const t = (par ? '(' + par + ') ' : '') + m[2].trim(); when[k] = when[k] ? when[k] + '\n' + t : t; }
    else gen.push(l);
  }
  return { when, general: gen.join('\n') };
}
function agCompose(a) {
  const w = a.when || {}, fl = AG_WHEN_KEYS.filter(k => (w[k] || '').trim()).map(k => `- ${AG_WHEN_LBL[k]} ("${k}"): ${w[k].trim().replace(/\n+/g, ' ')}`);
  return [(a.general || '').trim(), a.manual ? 'CRITERIO BASADO EN DATOS DE CLIPS VIRALES DE ESTE CREADOR (síguelo para elegir, cortar y titular):\n' + a.manual : '', fl.length ? 'Formatos y cuándo usarlos:\n' + fl.join('\n') : ''].filter(Boolean).join('\n');
}
async function getClientStore(id) { try { return (await kv.get('client:' + id)) || {}; } catch { return {}; } }
async function getAgent(cl) {
  const st = await getClientStore(cl.id);
  const a = Object.assign(AG_DEFAULT(), st.agent || {});
  if (!st.agent && /westcol/i.test(cl.name)) { a.rules = WESTCOL_RULES; a.subs = false; }
  if (!a.when) { const s = agSplitRules(a.rules); a.when = s.when; a.general = s.general; }   // pautas antiguas: se reparten solas
  if (!Array.isArray(a.chat)) a.chat = [];
  // criterio del informe de clips virales: se pone solo una vez (luego se puede editar o quitar)
@@solo-pc
  if (/westcol/i.test(cl.name) && !a.manualV) { a.manual = WESTCOL_MANUAL; a.titleGuide = WESTCOL_TITLE_GUIDE; a.manualV = 1; a.rules = agCompose(a); st.agent = a; try { await kv.set('client:' + cl.id, st); } catch {} }
@@fin
@@solo-web
  if (a.manualV !== 'pub1') { a.manual = GENERAL_MANUAL; a.titleGuide = GENERAL_TG; a.manualV = 'pub1'; a.rules = agCompose(a); st.agent = a; try { await kv.set('client:' + cl.id, st); } catch {} }
@@fin
  a.rules = agCompose(a);
  return a;
}
async function saveAgent(cl, a) { a.rules = agCompose(a); const st = await getClientStore(cl.id); st.agent = a; try { await kv.set('client:' + cl.id, st); } catch {} }
let batches = [];
const batchFiles = new Map();   // archivos de los directos ya abiertos en esta sesión
async function loadBatches() { try { batches = (await kv.get('batches')) || []; } catch { batches = []; } }
async function saveBatches() { try { await kv.set('batches', batches); } catch (e) { console.warn(e); try { await kv.set('batches', batches.map(b => ({ ...b, handle: undefined }))); } catch {} } }

/* palabras que se silencian (español de España y Latinoamérica) */
const BAD_RE = /^(hijue?p(uta|ta)s?|hijo?de?puta|hdp|hp|malparid[oa]s?|gonorrea|gonorreas|put[ao]s?|putit[ao]|putada|mierda|mierdas|verga|vergas|vergazo|careverga|caremonda|monda|pendej[oa]s?|maric[oa]n?e?s?|maricón|maricones|coño|joder|jodid[oa]s?|carajo|culo|culer[oa]|cabr[oó]n(es)?|cabrona|perra|zorra|pinche|ching(ada|ar|ado|a)|mamaguevo|mamahuevo|mamon|mamón|huevón|huevon|güevón|guevon|follar|polla|pollas|gilipollas|subnormal|cojones|cojon|cojón|tetas|chupame|chúpame|mamada)$/;
const normWord = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ]/g, '');
function isBad(w, extra) {
  const n = normWord(w); if (!n) return false;
  if (BAD_RE.test(n) || BAD_RE.test(w.toLowerCase().replace(/[^a-zñáéíóúü]/g, ''))) return true;
  if (/^hijue?p/.test(n) || /^malparid/.test(n) || /^gonorre/.test(n)) return true;
  return extra.some(x => x && (n === x || n.startsWith(x)));
}
function captionsFromWords(words, max) {
  const out = groupWords(words, max);
  const caps = out.map(ws => ({ start: ws[0].start, end: ws[ws.length - 1].end, words: ws }));
  caps.forEach((c, i) => { const n = caps[i + 1]; if (c.end - c.start < 0.25) c.end = c.start + 0.25; if (n && n.start - c.end < 0.5) c.end = n.start; });
  return caps;
}
const mmssA = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

/* Gemini con paciencia: si salta el límite gratuito, espera y lo vuelve a intentar */
async function gemRetry(fn, onWait) {
  let wait = 30;
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (e.message === 'QUOTA' && e.daily) throw e;   // límite del día: esperar no sirve
      if (e.message === 'QUOTA' && i < 10) {
        const w = Math.ceil(Math.max(e.delay || 0, wait)) + 2;
        for (let s = w; s > 0; s--) { onWait(`Límite por minuto de Gemini: sigo en ${s} s… (intento ${i + 1})`); await sleep(1000); tmWait += 1000; if (agentJob && agentJob.cancel) throw new Error('CANCEL'); }
        wait = Math.min(120, Math.round(wait * 1.4)); continue;
      }
      if ((e.message === 'NET' || /no válida|vacía|JSON/i.test(e.message)) && i < 3) { onWait('Reintentando…'); await sleep(3000); continue; }
      if ((e.status >= 500 || /overload|unavailable|internal|deadline|try again|high demand/i.test(e.message)) && i < 6) { const w = 15 * (i + 1); for (let s = w; s > 0; s--) { onWait(`Gemini está saturado: reintento en ${s} s… (intento ${i + 1})`); await sleep(1000); if (agentJob && agentJob.cancel) throw new Error('CANCEL'); } continue; }
      throw e;
    }
  }
}

/* el análisis completo de un directo */
let agentJob = null;
function agProg(step, p, log) { $('agProg').hidden = false; if (step != null) $('agStep').textContent = step; if (p != null) $('agBar').style.width = Math.round(p * 100) + '%'; if (log != null) $('agLog').textContent = log; }
// «90» = minuto 90 · «1:30:00» o «90:00» = h:m:s / m:s → segundos (null si está vacío)
function agMinToSec(v) {
  v = String(v || '').trim().replace(',', '.'); if (!v) return null;
  if (v.includes(':')) { const p = v.split(':').map(Number); if (p.some(x => !isFinite(x))) return NaN; return p.reduce((t, x) => t * 60 + x, 0); }
  const m = Number(v); return isFinite(m) ? m * 60 : NaN;
}
function agRange() {
  const a = agMinToSec($('agFrom').value), b = agMinToSec($('agTo').value);
  if (Number.isNaN(a) || Number.isNaN(b)) { toast('Revisa «desde/hasta el minuto»: escribe un número de minutos (por ejemplo 90) o 1:30:00'); return false; }
  if (a != null && b != null && b - a < 60) { toast('«Hasta» tiene que ser al menos 1 minuto después de «desde»'); return false; }
  return a == null && b == null ? null : { from: a || 0, to: b };
}
async function runAgent(cl, f, handle, title, range) {
  if (!getGemKey()) { toast('Primero pega tu clave de Gemini (en Título del editor)'); return; }
  const A = await getAgent(cl);
  agentJob = { cancel: false };
  const chk = () => { if (agentJob.cancel) throw new Error('CANCEL'); };
  $('agRun').disabled = true;
  try {
    agProg('Leyendo el directo…', 0.01, `${f.name} · ${(f.size / 1073741824).toFixed(2)} GB`);
    const M = await movieIndex(f);
    if (!M.acfg) throw new Error('El directo no tiene audio');
    const D = M.dur;
    const R0 = Math.max(0, Math.min(D, (range && range.from) || 0)), R1 = Math.min(D, (range && range.to) || D);
    if (R1 - R0 < 30) throw new Error(`El trozo elegido está fuera del directo (dura ${mmssA(D)})`);
    const url = URL.createObjectURL(f), tv = document.createElement('video');
    tv.muted = true; tv.preload = 'auto'; tv.src = url; tv.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'; document.body.append(tv);
    await new Promise((res, rej) => { tv.onloadeddata = res; tv.onerror = () => rej(new Error('Chrome no puede abrir este vídeo')); });
    // 1) Gemini escucha y mira el directo por trozos de 6 minutos
    const CH = 360, nCh = Math.ceil(D / CH);
    // lo ya analizado de este directo se guarda: si se corta (límite de Gemini), al volver sigue donde iba
    const ck = 'agcache:' + f.name + ':' + f.size;
    let cache = null; try { cache = await kv.get(ck); } catch {}
    // si el mismo directo se volvió a descargar (otro nombre de archivo, mismo tamaño), se recupera lo ya escuchado
    if (!cache) { try { const ks = await db.tx('kv', 'readonly', st => st.getAllKeys()); const old = (ks || []).filter(k => typeof k === 'string' && k.startsWith('agcache:') && k.endsWith(':' + f.size));
      for (const k of old) { const c0 = await kv.get(k); if (c0 && c0.CH === CH && (!cache || c0.done.length > cache.done.length)) cache = c0; } } catch (e) { console.warn(e); } }
    if (!cache || cache.CH !== CH) cache = { CH, done: [], lines: [], scenes: [], profan: [] };
    const lines = cache.lines, scenes = cache.scenes, profan = cache.profan;
    let whisperOk = true;
    for (let i = 0; i < nCh; i++) {
      chk();
      if ((i + 1) * CH <= R0 || i * CH >= R1) continue;   // fuera del trozo elegido
      if (cache.done.includes(i)) {   // ya analizado: solo falta el volumen si es de una versión anterior
        if (!(cache.energy && cache.energy[i])) { try { const au0 = (await decodeAudioRange(f, i * CH, Math.min(D, i * CH + CH), 8000, 1)).getChannelData(0), out = [];
          for (let k = 0; k + 8000 <= au0.length; k += 8000) { let q = 0; for (let j = k; j < k + 8000; j += 4) q += au0[j] * au0[j]; out.push(Math.sqrt(q / 2000)); }
          cache.energy = cache.energy || {}; cache.energy[i] = out; } catch {} }
        continue;
      }
      const a = i * CH, b = Math.min(D, a + CH), base = i / nCh * 0.6;
      agProg(`Escuchando el directo · parte ${i + 1} de ${nCh}`, 0.03 + base, `${mmssA(a)} – ${mmssA(b)}`);
      const au = await decodeAudioRange(f, a, b, 8000, 1);
      { const d = au.getChannelData(0), out = [];   // volumen de cada segundo (gritos, risas, golpes)
        for (let k = 0; k + 8000 <= d.length; k += 8000) { let q = 0; for (let j = k; j < k + 8000; j += 4) q += d[j] * d[j]; out.push(Math.sqrt(q / 2000)); }
        cache.energy = cache.energy || {}; cache.energy[i] = out; }
      const parts = [{ inline_data: { mime_type: 'audio/wav', data: wavB64(au.getChannelData(0), 8000) } }];
      for (let t = a + 5; t < b; t += 30) {   // un fotograma cada 30 s para saber qué se ve
        chk(); await tvSeek(tv, t);
        const c = document.createElement('canvas'); c.width = 384; c.height = Math.round(384 * tv.videoHeight / tv.videoWidth);
        c.getContext('2d').drawImage(tv, 0, 0, c.width, c.height);
        parts.push({ text: `Fotograma en t=${Math.round(t - a)} s:` }, { inline_data: { mime_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.6).split(',')[1] } });
      }
      parts.push({ text: `Esto es un trozo de ${Math.round(b - a)} segundos de un directo de un streamer (del minuto ${mmssA(a)} al ${mmssA(b)} del directo completo). Tienes el audio y fotogramas con su segundo dentro de este trozo.
Devuelve:
1) "segments": la transcripción literal en el idioma original, frase a frase (de 2 a 10 s cada una), con "start" y "end" en segundos DENTRO DE ESTE TROZO (0 = inicio del trozo). Que los tiempos sean precisos.
3) "profanity": cada palabrota o insulto que se oiga, con su segundo exacto dentro de este trozo ("time") y la palabra ("word").
2) "scenes": tramos con lo que está haciendo el streamer: "activity" = "hablando" (hablando a cámara o al chat sin reaccionar a nada), "reaccionando" (reacciona a un vídeo, tweet, TikTok, web… en pantalla), "jugando" (videojuego), "casino" (casino, tragaperras, apuestas en pantalla) u "otro"; y "detail": breve descripción en español de lo que se ve y pasa.
Responde solo JSON: {"segments":[{"start":0,"end":0,"text":""}],"scenes":[{"start":0,"end":0,"activity":"","detail":""}],"profanity":[{"time":0,"word":""}]}` });
      const o = await gemRetry(() => geminiJSON(parts, 0.1), msg => agProg(null, null, msg + (cache.done.length ? ` · ${cache.done.length} partes ya guardadas` : '')));
      for (const s of (o.segments || [])) if (s && s.text) lines.push({ s: a + (+s.start || 0), e: a + (+s.end || +s.start || 0), t: String(s.text).trim() });
      for (const s of (o.scenes || [])) if (s) scenes.push({ s: a + (+s.start || 0), e: a + (+s.end || 0), act: s.activity || 'otro', d: s.detail || '' });
      for (const s of (o.profanity || [])) if (s && s.time != null) profan.push({ t: a + (+s.time || 0), w: String(s.word || '') });
      cache.done.push(i); try { await kv.set(ck, cache); } catch {}
    }
    lines.sort((x, y) => x.s - y.s); scenes.sort((x, y) => x.s - y.s);
    // 2) el clipper decide qué clips sacar
    chk();
    agProg('Eligiendo los clips como un clipper profesional…', 0.65, `${lines.length} frases analizadas`);
    // momentos con el volumen disparado: suelen ser los más virales
    const en = []; Object.keys(cache.energy || {}).sort((x, y) => x - y).forEach(k => cache.energy[k].forEach((v, j) => { const t = +k * CH + j; if (t >= R0 && t <= R1) en.push({ t, v }); }));
    const medE = en.map(x => x.v).sort((x, y) => x - y)[Math.floor(en.length / 2)] || 0;
    const peaks = en.filter(x => x.v > medE * 2.2 && x.v > 0.02).sort((x, y) => y.v - x.v).slice(0, 60).sort((x, y) => x.t - y.t);
    const fb = (A.feedback || []).slice(-30).map(x => `- ${x.t}: «${x.title}» (formato ${x.fmt}${x.to ? ' → lo cambié a ' + x.to : ''})${x.reason ? ' · motivo del agente: ' + x.reason : ''}`).join('\n');
    const header = `Eres un clipper profesional de primer nivel. Tu único objetivo es la VIRALIDAD en TikTok, Instagram Reels y YouTube Shorts.
Cliente: ${cl.name}.
PAUTAS DEL CLIENTE (obligatorias):
${A.rules || '(sin pautas: usa tu criterio profesional)'}
${fb ? 'DECISIONES ANTERIORES DEL EDITOR (aprende de ellas: lo descartado no gusta, y si cambió el formato, ese era el bueno):\n' + fb + '\n' : ''}
FORMATOS DISPONIBLES (usa exactamente estos nombres):
- "podcast": habla a cámara / en su PC sin reaccionar a nada.
- "reaccion": reacciona a algo en pantalla o está jugando.
- "dividida": está hablando y una imagen de apoyo representa mejor la idea (indica la imagen en "image").
- "horizontal_cam": solo su cámara en horizontal (por ejemplo cuando juega al casino: el casino NO puede aparecer).
- "duo": hay DOS o más personas en el set hablando entre ellas (sin una pantalla a la que reaccionen): una sale arriba y otra abajo.
- "llamada": es una llamada (Discord u otra) con varias cámaras en cuadrícula, cada persona en su recuadro: se ponen de 2 a 5 personas una debajo de otra.
- "horizontal": el vídeo horizontal tal cual.
REGLAS DE CLIPPER PROFESIONAL:
- SACA TODOS LOS CLIPS POSIBLES, también los regulares o dudosos (con nota baja): el editor los revisará uno a uno y decidirá cuáles valen. Es mucho mejor que sobren a que falte uno bueno. Solo deja fuera lo que no tiene nada: silencios, saludos, publicidad o leer el chat sin más.
- Qué buscar: polémicas, opiniones fuertes, tiradas o peleas con otros creadores, momentos con otros famosos, confesiones (dinero, compras, vida personal, historias), reacciones explosivas, humor, frases memorables o de meme, consejos, noticias y anuncios, momentos inesperados.
- Si el streamer es famoso, no hace falta presentarlo: el clip empieza en la frase fuerte y el título lleva su nombre cuando encaje («${cl.name} responde a…», «${cl.name} revela…»).
- Cada clip tiene que entenderse solo, sin haber visto el directo.
- UN CLIP = UN SOLO TEMA: exactamente lo que dice su título y nada más. Si en un tramo se habla de varias cosas, cada cosa es un clip distinto (con su propio título); nunca juntes temas distintos en el mismo clip.
- Ve DIRECTO a lo que dice el título: empieza en la frase fuerte (sin el contexto previo salvo que sin él no se entienda) y termina justo en el remate. DURACIÓN: lo más corto posible; lo normal es de 8 a 35 segundos, y solo una historia que lo necesite de verdad puede llegar a 60. Nunca alargues un clip, y nunca devuelvas algo de menos de 5 segundos.
- FORMATO: elígelo según lo que se VE durante ese tramo en "QUÉ SE VE EN PANTALLA" y según las pautas del cliente (si está hablando a cámara sin reaccionar = el formato de hablar; si reacciona a algo en pantalla o juega = reacción; si hay casino en pantalla = solo cámara). Comprueba la actividad de TODO el tramo, no solo del principio.
- Los MOMENTOS CON VOLUMEN ALTO (gritos, risas, golpes) son pistas muy fuertes: revísalos todos.
- No devuelvas dos veces el mismo momento.
- "title": describe de forma directa lo que pasa en el clip, en español latino neutro, de 4 a 12 palabras, sin intriga ni clickbait.
- "highlight": de 1 a 3 posiciones (desde 0) de las palabras clave del título, contando palabras separadas por espacios.
- "emoji": UN emoji que encaje con el clip (😂 😱 🔥 💀 😳 🤯 ⚽ 🎮 💰 😭…), o vacío si no encaja ninguno. No lo metas dentro del título.
- "score": potencial viral del 1 al 10 (sé honesto: los regulares, nota baja). "reason": por qué lo eliges, en 1 o 2 frases.
- "image": solo en "dividida": descripción concreta en español de la imagen que acompaña lo que dice.`;
    // se revisa el directo por tramos de 15 minutos (con un poco de solape) para no dejarse nada
    const WIN = 900, OV = 60, wins = [];
    for (let a = R0; a < R1; a += WIN) wins.push([Math.max(R0, a - OV), Math.min(R1, a + WIN + OV)]);
    let raw = [];
    for (let wi = 0; wi < wins.length; wi++) {
      chk();
      const [wa, wb] = wins[wi];
      agProg(`Buscando todos los clips posibles · tramo ${wi + 1} de ${wins.length}`, 0.62 + 0.08 * wi / wins.length, `${mmssA(wa)} – ${mmssA(wb)} · ${raw.length} clips encontrados`);
      const L = lines.filter(l => l.e >= wa && l.s <= wb), S = scenes.filter(x => x.e >= wa && x.s <= wb), P = peaks.filter(x => x.t >= wa && x.t <= wb);
      if (!L.length && !S.length) continue;
      const prompt = header + `
Analiza SOLO este tramo del directo: del segundo ${Math.round(wa)} al ${Math.round(wb)} (los tiempos son segundos del directo completo).
TRANSCRIPCIÓN:
${L.map(l => `[${l.s.toFixed(1)}-${l.e.toFixed(1)}] ${l.t}`).join('\n')}
QUÉ SE VE EN PANTALLA:
${S.map(x => `[${x.s.toFixed(0)}-${x.e.toFixed(0)}] ${x.act}: ${x.d}`).join('\n')}
MOMENTOS CON VOLUMEN ALTO (segundo del directo):
${P.map(x => Math.round(x.t)).join(', ') || '(ninguno)'}
Responde solo JSON: {"clips":[{"start":0,"end":0,"format":"podcast","title":"","highlight":[0],"emoji":"","score":8,"reason":"","image":""}]}`;
      const plan = await gemRetry(() => geminiJSON([{ text: prompt }], 0.4, { models: GEM_SMART }), msg => agProg(null, null, msg));
      raw.push(...(Array.isArray(plan) ? plan : plan.clips || []));
    }
    let clips = raw.filter(c => c && isFinite(+c.start) && isFinite(+c.end) && +c.end > +c.start).map(c => {
      let a = Math.max(0, +c.start), b = Math.min(D, +c.end);
      if (b - a < 5) { const mid = (a + b) / 2; a = Math.max(0, mid - 4); b = Math.min(D, a + 8); }   // cortes cortos sí, pero no de 2 segundos
      if (b - a > 65) b = a + 60;
      return { ...c, start: a, end: b, score: +c.score || 0 };
    });
    // quitar repetidos (por el solape entre tramos): se queda el de más nota
    clips.sort((x, y) => y.score - x.score);
    const keepC = [];
    for (const c of clips) { if (!keepC.some(k => Math.max(0, Math.min(k.end, c.end) - Math.max(k.start, c.start)) > 0.5 * Math.min(k.end - k.start, c.end - c.start))) keepC.push(c); }
    clips = keepC.sort((x, y) => x.start - y.start);
    if (!clips.length) throw new Error('El agente no ha encontrado clips en este directo');
    // 3) cada clip: cortes exactos, silencios fuera y palabras censuradas (con la IA de voz del navegador)
    await loadClientStore(cl.id);
    const extra = (A.bad || '').split(/[,\n]/).map(normWord).filter(Boolean);
    const bid = 'b' + Date.now().toString(36), made = [];
    const cfg = (await getClientStore(cl.id)).logo, logoCfg = (cfg && cfg.cfg) || { size: '18', op: '85' };
    for (let ci = 0; ci < clips.length; ci++) {
      chk();
      const c = clips[ci];
      agProg(`Montando el clip ${ci + 1} de ${clips.length}`, 0.7 + 0.28 * ci / clips.length, c.title || '');
      let words = [], clipAu = null, clipAu0 = 0;
      if (whisperOk) try {
        // se transcribe con margen: los tiempos de la primera escucha pueden ir desplazados unos segundos
        const a0 = Math.max(0, c.start - 20), a1 = Math.min(D, c.end + 15);
        const au = (await decodeAudioRange(f, a0, a1, 16000, 1)).getChannelData(0);
        clipAu = au; clipAu0 = a0;
        const res = await runAI(au, [{ id: 'onnx-community/whisper-base_timestamped', word: true }, { id: 'Xenova/whisper-base', word: false }], 'es', () => {}, m => agProg(null, null, m));
        words = chunksToWords(res.chunks, res.mode).map(w => ({ ...w, start: w.start + a0, end: w.end + a0 })).filter(w => w.end > w.start);
        words = cleanRepeats(words);
        try { words = await geminiFixWords(words, au, a0, m => agProg(null, null, m)); } catch (err) { console.warn('Revisión de subtítulos', err); }
      } catch (e) { console.warn('Clip sin marcas de palabras', e); whisperOk = false; }   // si la IA de voz no carga, se sigue sin ella
      // corte fino: con las palabras y sus tiempos exactos, la IA decide dónde empieza y acaba de verdad el momento
      if (words.length > 8) try {
        agProg(null, null, 'Ajustando el inicio y el final del clip…');
        const wa0 = words[0].start, rel = t => (t - c.start).toFixed(1);
        const wtxt = words.map(w => `[${rel(w.start)}] ${w.text.trim()}`).join(' ').slice(0, 9000);
        const fx = await gemRetry(() => geminiJSON([{ text: `Eres un editor de clips virales de TikTok. Un clipper ha elegido este momento de un directo de ${cl.name}:
Título: «${c.title || ''}». Por qué: ${c.reason || ''}
Su corte aproximado va del segundo 0 al ${(c.end - c.start).toFixed(1)}, pero esos tiempos pueden estar desplazados varios segundos.
Transcripción EXACTA con el segundo en que empieza cada palabra (negativo = antes de su corte; mayor que ${(c.end - c.start).toFixed(1)} = después):
${wtxt}
${A.rules ? 'CRITERIO DEL CLIENTE (sobre todo «CÓMO CORTAR»):\n' + A.rules.slice(0, 6000) + '\n' : ''}Busca en la transcripción dónde está DE VERDAD ese momento y decide el corte exacto:
- "topic_start": el segundo de la primera palabra en que se empieza a hablar de LO QUE DICE EL TÍTULO.
- "start": normalmente igual que "topic_start". Solo puede ser antes si la frase de justo antes es IMPRESCINDIBLE para entenderlo (por ejemplo, la pregunta exacta que está respondiendo), y como mucho 6 segundos antes. Nada de intros, saludos, relleno ni cosas sin relación con el título.
- "end": el segundo en que TERMINA la última palabra del remate. Acaba cuando acaba el momento (el remate, la reacción o la risa), sin dejar que se apague; nunca a mitad de frase.
- UN SOLO TEMA: el clip tiene que ser SOLO lo que dice el título. Si antes o después se habla de otra cosa (aunque sea dentro del corte del clipper), déjalo fuera.
- "remove": trozos de en MEDIO que sobran porque no tienen que ver con el título (leer el chat, saludar a alguien, otra conversación, interrupciones, relleno largo). Cada uno con "s" y "e" (segundos). Solo trozos enteros de al menos 1,5 s y sin romper frases que sí importan. Si no sobra nada, lista vacía.
- Lo más corto posible: lo normal es de 8 a 35 s; máximo 60 s y solo si es una historia que lo necesita. Mínimo 5 s.
- "found": true si lo que dice el título está de verdad en esta transcripción; false si aquí se habla de otra cosa (los tiempos del clipper estaban mal). Si es false, elige el momento más fuerte que SÍ haya en la transcripción.
- "title": el título del clip final. Tiene que describir EXACTAMENTE lo que se dice entre "start" y "end" (si el del clipper ya encaja, déjalo igual; si no, escribe uno nuevo con las mismas reglas de título del criterio). Nunca un título de otro momento.
- "highlight": de 1 a 3 posiciones (desde 0) de las palabras clave de ese título.
Responde solo JSON: {"found": true, "topic_start": número, "start": número, "end": número, "remove": [{"s": número, "e": número}], "title": "...", "highlight": [0], "why": "muy corto"}` }], 0.2), m => agProg(null, null, m));
        let fs = fx && isFinite(+fx.start) ? c.start + +fx.start : null; const fe = fx && isFinite(+fx.end) ? c.start + +fx.end : null;
        const ts = fx && isFinite(+fx.topic_start) ? c.start + +fx.topic_start : null;
        if (fs != null && ts != null && ts > fs + 6) fs = ts;   // nunca más de 6 s de «contexto» antes del tema
        if (fs != null && ts != null && ts >= fs && ts < (fe || Infinity) - 5) fs = Math.max(fs, ts - 6);
        if (fx && String(fx.title || '').trim().length > 8 && fs != null && fe != null) {   // el título siempre describe lo que queda en el clip
          const nt = String(fx.title).trim().replace(/^["«]|["»]$/g, '');
          if (nt !== String(c.title || '').trim()) { console.info('Título corregido', c.title, '→', nt, fx.found === false ? '(el momento no estaba ahí)' : ''); c.title = nt; c.highlight = Array.isArray(fx.highlight) ? fx.highlight : []; }
        }
        c.cutOut = (fx && Array.isArray(fx.remove) ? fx.remove : []).map(r => ({ s: c.start + +r.s, e: c.start + +r.e })).filter(r => isFinite(r.s) && isFinite(r.e) && r.e - r.s >= 1.5);
        if (fs != null && fe != null && fs >= wa0 - 0.5 && fe <= words[words.length - 1].end + 1 && fe - fs >= 5 && fe - fs <= 65) { console.info('Corte ajustado', c.title, (fs - c.start).toFixed(1), (fe - c.end).toFixed(1), fx.why); c.start = Math.max(0, fs); c.end = Math.min(D, fe); }
      } catch (err) { console.warn('Corte fino', err); }
      // si tras ajustar el corte cae en un momento que ya es otro clip, no se repite
      if (made.some(m => m._s != null && Math.max(0, Math.min(m._e, c.end) - Math.max(m._s, c.start)) > 0.5 * Math.min(m._e - m._s, c.end - c.start))) { console.info('Clip repetido tras ajustar el corte', c.title); continue; }
      // inicio y final justo en una palabra
      let s = c.start, e = c.end;
      if (words.length) {   // solo se ajusta a una palabra si está cerca del corte que dijo el agente
        const ws = words.filter(w => Math.abs(w.start - s) < 1.5).sort((x, y) => Math.abs(x.start - s) - Math.abs(y.start - s))[0];
        const we = words.filter(w => Math.abs(w.end - e) < 1.5).sort((x, y) => Math.abs(x.end - e) - Math.abs(y.end - e))[0];
        if (ws) s = Math.max(0, ws.start - 0.08);
        if (we && we.end > s + 3) e = Math.min(D, we.end + 0.3);
      }
      // trozos de en medio que sobran (otro tema, leer el chat…): se quitan ajustados a las palabras
      const cutOut = (c.cutOut || []).map(r => { const w0 = words.find(w => w.start >= r.s - 0.4), w1 = [...words].reverse().find(w => w.end <= r.e + 0.4); return w0 && w1 && w1.end > w0.start ? { s: w0.start - 0.05, e: w1.end + 0.05 } : r; }).filter(r => r.s > s + 1 && r.e < e - 1 && r.e - r.s >= 1.5);
      const inW = words.filter(w => w.start >= s - 0.05 && w.end <= e + 0.05 && !cutOut.some(r => w.start >= r.s && w.end <= r.e));
      // quitar solo silencios de verdad (pausas cortas sin sonido), nunca reacciones sin palabras
      let segsC = [{ s, e }];
      if (A.silence && inW.length > 3 && clipAu) {
        const rms = (t0, t1) => { const a = Math.max(0, Math.round((t0 - clipAu0) * 16000)), b = Math.min(clipAu.length, Math.round((t1 - clipAu0) * 16000)); let q = 0, n = 0; for (let j = a; j < b; j += 8) { q += clipAu[j] * clipAu[j]; n++; } return n ? Math.sqrt(q / n) : 1; };
        const speech = inW.slice(0, 40).map(w => rms(w.start, w.end)).sort((x, y) => x - y)[Math.floor(Math.min(40, inW.length) / 2)] || 0.05;
        const cut = []; let cur = s;
        for (let i = 0; i < inW.length - 1; i++) {
          const g0 = inW[i].end, g1 = inW[i + 1].start, gap = g1 - g0;
          if (gap > 0.7 && gap < 3.5 && rms(g0 + 0.1, g1 - 0.1) < speech * 0.25) { cut.push({ s: cur, e: g0 + 0.15 }); cur = g1 - 0.15; }
        }
        cut.push({ s: cur, e });
        const keep = cut.filter(g => g.e - g.s > 0.25), tot = keep.reduce((x, g) => x + g.e - g.s, 0);
        if (tot >= Math.max(4, (e - s) * 0.7)) segsC = keep;   // si quitaría demasiado, mejor no tocar
      }
      if (cutOut.length) {
        let out = segsC;
        for (const r of cutOut) out = out.flatMap(g => r.e <= g.s || r.s >= g.e ? [g] : [{ s: g.s, e: r.s }, { s: r.e, e: g.e }]).filter(g => g.e - g.s > 0.25);
        if (out.reduce((x, g) => x + g.e - g.s, 0) >= 5) segsC = out;
      }
      if (A.censor && inW.length) try { const rk = await riskyWords(inW, A, extra, msg => agProg(null, null, msg)); for (const [k, v] of rk) inW[k].risk = v; } catch (err) { console.warn('Revisión TikTok', err); }
      let mutesC = A.censor ? inW.map(w => ({ w, r: better(localRisk(w.text, A, extra), w.risk || null) })).filter(x => x.r).map(({ w, r }) => ({ s: Math.max(s, w.start - 0.06), e: Math.min(e, w.end + 0.06), ws: Math.max(s, w.start), we: Math.min(e, w.end), w: w.text.trim().replace(/[.,!?¡¿;:…"«»]/g, ''), cat: r.cat, lvl: r.lvl })) : [];
      // sin marcas por palabra: los tiempos que dio Gemini (un poco más anchos)
      if (A.censor && !words.length) {
        mutesC = profan.filter(x => x.t >= s && x.t <= e).map(x => ({ s: Math.max(s, x.t - 0.2), e: Math.min(e, x.t + 0.55), w: x.w }));
        try {
          if (!clipAu) { clipAu0 = Math.max(0, s - 0.5); clipAu = (await decodeAudioRange(f, clipAu0, Math.min(D, e + 0.5), 16000, 1)).getChannelData(0); }
          const g = await geminiAudioRisk(clipAu.subarray(Math.round((Math.max(clipAu0, s) - clipAu0) * 16000), Math.round((Math.min(e, clipAu0 + clipAu.length / 16000) - clipAu0) * 16000)), Math.max(clipAu0, s), A, extra, msg => agProg(null, null, msg));
          mutesC = [...mutesC, ...g.filter(m => m.e > s && m.s < e && !mutesC.some(x => x.s <= m.s + 0.2 && x.e >= m.e - 0.2))];
        } catch (err) { console.warn('Censura con audio', err); }
      }
      if (mutesC.length && clipAu) mutesC = widenMutes(mutesC, clipAu, clipAu0).map(m => ({ ...m, s: Math.max(s, m.s), e: Math.min(e, m.e) }));
      // comprobar el formato mirando el propio clip (3 fotogramas) con las pautas del cliente
      try {
        const ps = [];
        for (const fr of [0.2, 0.5, 0.8]) {
          await tvSeek(tv, s + (e - s) * fr);
          const cc = document.createElement('canvas'); cc.width = 512; cc.height = Math.round(512 * tv.videoHeight / tv.videoWidth);
          cc.getContext('2d').drawImage(tv, 0, 0, cc.width, cc.height);
          ps.push({ inline_data: { mime_type: 'image/jpeg', data: cc.toDataURL('image/jpeg', 0.7).split(',')[1] } });
        }
        const said = inW.map(w => w.text).join(' ').slice(0, 1500);
        ps.push({ text: `Son 3 fotogramas (al 20 %, 50 % y 80 %) de un clip de un directo.${said ? ' Lo que se dice: «' + said + '».' : ''}
PAUTAS DEL CLIENTE:
${A.rules || ''}
Elige el formato correcto para ESTE clip según lo que se ve en pantalla y las pautas: "podcast" (habla a cámara/en su PC sin reaccionar a nada), "reaccion" (reacciona a algo que se ve en pantalla o está jugando), "dividida" (habla y una imagen de apoyo ayudaría), "horizontal_cam" (hay casino, tragaperras o apuestas en pantalla: solo se enseña su cámara), "duo" (dos o más personas en el set hablando entre ellas: una arriba y otra abajo), "llamada" (llamada de Discord con varias cámaras en cuadrícula: de 2 a 5 personas una debajo de otra), "horizontal" (el vídeo tal cual).
Responde solo JSON: {"format":"...","why":"..."}` });
        const v = await gemRetry(() => geminiJSON(ps, 0), msg => agProg(null, null, msg));
        if (v && AG_FORMATS[v.format]) { if (v.format !== c.format) console.info('Formato corregido', c.format, '→', v.format, v.why); c.format = v.format; }
      } catch (err) { console.warn('No se pudo comprobar el formato', err); }
      // estilo: la plantilla del cliente para ese formato
      const fmt = fixFmt(AG_FORMATS[c.format] ? c.format : 'podcast'), F = AG_FORMATS[fmt];
      const pr = PRESETS.find(x => x.name === F.preset);
      const style = cleanForPreset(effectivePreset(pr));
      style.c = style.c || {};
      if (fmt === 'podcast') style.c.titleY = '13';   // título arriba, logo abajo
      const title0 = String(c.title || '').trim() || 'Clip ' + (ci + 1);
      const title = withEmoji(title0, c.emoji, style.c.titleEmoji !== false);
      const nw = title.split(/\s+/).filter(Boolean).length;
      const hl = style.c.titleAutoHL === false ? [] : (Array.isArray(c.highlight) ? c.highlight : []).map(Number).filter(i => i >= 0 && i < nw).slice(0, 3);
      const subsOn = A.subs && style.c.subsGen !== false;
      const caps = subsOn ? captionsFromWords(inW, +(style.c.wpc || 3)) : [];
      const id = 'p' + Date.now().toString(36) + ci;
      const p = { v: 2, style, title, titleHL: hl, captions: caps, allWords: subsOn ? inW : [], crop: null, clipName: f.name,
        segs: segsC.map((g, k) => ({ id: k + 1, s: g.s, e: g.e })), texts: [], zones: [], trk: TRK0(), pseg: 0, streamer: '',
        mutes: [], clipMeta: { flagsDone: A.censor ? [segsC[0].s, segsC[segsC.length - 1].e] : null, flags: mutesC.map((m, k) => ({ id: 9000 + k, s: m.s, e: m.e, ...(m.ws != null ? { ws: m.ws, we: m.we } : {}), w: m.w || '…', cat: m.cat || 'otro', lvl: m.lvl || 'media', on: m.lvl !== 'baja' })), batch: bid, fmt, reason: c.reason || '', score: +c.score || 0, imgPrompt: fmt === 'dividida' ? (c.image || 'algo que represente lo que dice') : '', noSubs: !subsOn, needDetect: fmt === 'reaccion', needDuo: fmt === 'duo' || fmt === 'llamada', needCam: fmt === 'horizontal_cam', needTrack: fmt === 'podcast', words: inW },
        logo: { x: W / 2, y: H - 230, size: logoCfg.size, op: logoCfg.op } };
      p.mutes = p.clipMeta.flags.filter(f => f.on).map(flagMute);
      if (fmt === 'horizontal_cam') p.style.c.bg = p.style.c.bg && p.style.c.bg.startsWith('blur') ? p.style.c.bg : 'blur2';
      await kv.set('proj:' + id, { snap: JSON.stringify(p), time: Date.now() });
      made.push({ _s: s, _e: e, id, client: cl.id, batch: bid, name: title, time: Date.now(), status: 'pending', score: +c.score || 0, fmt, reason: c.reason || '', needImg: fmt === 'dividida', dur: segsC.reduce((x, g) => x + g.e - g.s, 0) });
    }
    made.forEach(m => { delete m._s; delete m._e; });
    projIndex = [...made, ...projIndex]; await saveIndex();
    batches.unshift({ id: bid, client: cl.id, name: title || f.name, size: f.size, time: Date.now(), n: made.length, handle: handle || null });
    batchFiles.set(bid, f); await saveBatches();
    tv.remove(); URL.revokeObjectURL(url);
    agProg('¡Listo!', 1, `${made.length} clips preparados. Pulsa «Revisar» para verlos uno a uno.`);
    toast(`${made.length} clips listos para revisar`);
    renderHome();
  } catch (e) {
    console.error(e);
    const why = e.message === 'CANCEL' ? 'Cancelado.' : e.message === 'BADKEY' ? 'La clave de Gemini no es válida.'
      : e.message === 'QUOTA' ? (e.daily ? 'Has gastado el límite GRATIS DEL DÍA de Gemini. Vuelve a intentarlo mañana o activa la facturación en Google AI Studio (cuesta poco).' : 'Gemini sigue sin dejar más peticiones por ahora. Espera unos minutos y vuelve a intentarlo.') + (e.detail ? ' Mensaje de Google: «' + String(e.detail).slice(0, 220) + '»' : '')
      : e.message === 'NET' ? 'No hay conexión con Gemini.' : 'Error: ' + e.message;
    agProg('No se pudo terminar', null, why);
  } finally { $('agRun').disabled = false; agentJob = null; }
}

/* elegir el archivo del directo (si se puede, Cortex recuerda dónde está para abrirlo luego) */
async function pickStream() {
  if (window.showOpenFilePicker) {
    try {
      const [h] = await showOpenFilePicker({ types: [{ description: 'Vídeo', accept: { 'video/*': ['.mp4', '.mov', '.m4v'] } }] });
      return { file: await h.getFile(), handle: h };
    } catch (e) { if (e.name === 'AbortError') return null; }
  }
  return new Promise(res => { const inp = $('agFile'); inp.value = ''; inp.onchange = () => res(inp.files[0] ? { file: inp.files[0], handle: null } : null); inp.click(); });
}
async function batchFile(bid) {
  if (batchFiles.has(bid)) return batchFiles.get(bid);
  const b = batches.find(x => x.id === bid); if (!b) return null;
  if (b.handle) {
    try {
      let perm = await b.handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted') perm = await b.handle.requestPermission({ mode: 'read' });
      if (perm === 'granted') { const f = await b.handle.getFile(); batchFiles.set(bid, f); return f; }
    } catch (e) { console.warn(e); }
  }
  toast(`Vuelve a elegir el directo «${b.name}»`);
  const r = await pickStream(); if (!r) return null;
  if (r.file.name !== b.name || r.file.size !== b.size) toast('Ojo: no parece el mismo archivo del directo');
  batchFiles.set(bid, r.file); if (r.handle) { b.handle = r.handle; saveBatches(); }
  return r.file;
}


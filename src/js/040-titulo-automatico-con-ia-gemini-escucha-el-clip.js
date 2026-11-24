/* ---------- título automático con IA (Gemini escucha el clip y escribe el gancho) ---------- */
const DEFAULT_TITLE = 'Texto predeterminado';
let titleBusy = false, titleSeen = [], titleAudio = { file: null, b64: null };
function wavB64(f32, rate) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 32767, true);
  return toB64(buf);
}
// audio (16 kHz) del trozo del original que se usa en el clip
async function clipAudio16k(maxSec) {
  const [a0, a1] = srcRange(), b = Math.min(a1, a0 + maxSec);
  const whole = a0 < 0.5 && b > (vid.duration || 0) - 0.5 && file.size < 4e8;
  const a = whole ? await decodeAudio16k(file) : await rangeAudio16k(a0, b);
  return { a: a.subarray(0, Math.round(16000 * (b - a0))), a0 };
}
async function titleAudioB64() {
  const key = file && (file.name + file.size + srcRange().map(x => x.toFixed(2)).join('-'));
  if (titleAudio.file === key) return titleAudio.b64;
  let b64 = null;
  try { const { a } = await clipAudio16k(60); b64 = wavB64(a, 16000); } catch (e) { console.warn('Título: sin audio', e); }
  titleAudio = { file: key, b64 }; return b64;
}
// streamers que ya has clipeado (para elegirlos con un clic)
const getStreamers = () => { try { return JSON.parse(localStorage.getItem('clipzi-streamers:' + curClient) || '[]'); } catch { return []; } };
function rememberStreamer(n) {
  n = (n || '').trim(); if (!n) return;
  const l = [n, ...getStreamers().filter(x => x.toLowerCase() !== n.toLowerCase())].slice(0, 20);
  try { localStorage.setItem('clipzi-streamers:' + curClient, JSON.stringify(l)); } catch {}
  renderStreamers();
}
function renderStreamers() { $('streamerList').innerHTML = ''; for (const n of getStreamers()) { const o = document.createElement('option'); o.value = n; $('streamerList').append(o); } }
renderStreamers();
$('streamer').addEventListener('change', () => { rememberStreamer($('streamer').value); pushHistory(); });
try { $('ctxSearch').checked = localStorage.getItem('clipzi-ctx') === '1'; } catch {}
$('ctxSearch').addEventListener('change', () => { try { localStorage.setItem('clipzi-ctx', $('ctxSearch').checked ? '1' : '0'); } catch {} });
const titleIsDefault = () => { const t = $('title').value.trim(); return !t || t === DEFAULT_TITLE; };
async function aiTitle(auto) {
  if (titleBusy) return;
  const st = $('aiTitleStatus');
  if (!loaded) { if (!auto) setStatus(st, 'Primero sube un clip.', 'err'); return; }
  if (!getGemKey()) { $('titleKeyWrap').hidden = false; if (!auto) setStatus(st, 'Pega tu clave de Gemini aquí debajo para que la IA escriba el título.', 'err'); return; }
  titleBusy = true; $('aiTitle').disabled = true;
  setStatus(st, '✨ La IA está viendo y escuchando el clip para describirlo…');
  try {
    const parts = [];
    const au = await titleAudioB64();
    if (au) parts.push({ inline_data: { mime_type: 'audio/wav', data: au } });
    const fr = await sampleFrames(3);
    for (const c of fr) { const t = document.createElement('canvas'); t.width = 640; t.height = Math.round(640 * c.height / c.width); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); parts.push({ inline_data: { mime_type: 'image/jpeg', data: t.toDataURL('image/jpeg', 0.75).split(',')[1] } }); }
    const said = allWords.map(w => w.text).join(' ').trim(), who = $('streamer').value.trim(), search = $('ctxSearch').checked;
    const ctxTxt = (who ? `\nEl streamer del clip es «${who}». Usa su nombre en el título si encaja de forma natural.` : `\nNombre del archivo del clip: «${file ? file.name : ''}».\nSi el nombre del streamer o del canal aparece escrito (marca de agua de Kick o Twitch, overlay, chat, nombre del archivo) o se oye en el audio, úsalo y devuélvelo en "streamer". No lo deduzcas por su cara; si no lo sabes, deja "streamer" vacío.`)
      + (search ? `\nPuedes buscar en Google para entender el contexto (quién es el streamer, qué evento, torneo, polémica o partido es) y describirlo con más precisión, pero describe solo lo que pasa en este clip.` : '');
    const prev = [...titleSeen, $('title').value.trim()].filter(t => t && t !== DEFAULT_TITLE);
    const guide = await (async () => { try { const cl = clientOf(curClient); return cl ? ((await getAgent(cl)).titleGuide || '') : ''; } catch { return ''; } })();
    parts.push({ text: `Te paso ${au ? 'el audio de un clip de un streamer' : 'un clip de un streamer'} y algunos fotogramas.${said ? `\nTranscripción: «${said.slice(0, 3000)}»` : ''}
Escribe UN título que DESCRIBA de forma sencilla y directa lo que pasa en el clip, para ponerlo encima del vídeo:
- en español latino neutro (de Latinoamérica: nada de «vosotros», «tío», «mola», «guay» ni expresiones de España), natural, de 4 a 12 palabras;
- solo describe lo que ocurre o lo que se dice (quién hace qué), como si se lo contaras a un amigo en una frase;
- NO intentes enganchar ni crear intriga: nada de «no te vas a creer», «escucha esto», «lo que pasó después», preguntas retóricas ni frases de marketing;
- no inventes nada que no se vea o no se oiga en el clip;
- sin hashtags, sin emojis, sin comillas.
Ejemplos del estilo: «Reacciona al gol en el último minuto del partido», «El streamer pierde la partida por un fallo de conexión», «Explica cómo organiza su día de trabajo».
${guide ? `Con este creador, según datos reales de clips virales, estas ESTRUCTURAS de título son las que mejor funcionan. Si encaja con lo que pasa de verdad en el clip, usa una de ellas como molde (sin inventar nada):\n${guide}\n` : ''}Elige además de 1 a 3 palabras clave para destacar en rojo: dime su posición (empezando en 0) contando las palabras del título separadas por espacios.${ctxTxt}${prev.length ? `\nDame una descripción distinta a estas: ${prev.map(t => '«' + t + '»').join(', ')}.` : ''}
Además, en "emoji", UN emoji que encaje con lo que pasa en el clip (por ejemplo 😂 😱 🔥 💀 😳 🤯 ⚽ 🎮 💰 😭), o vacío si no encaja ninguno. No lo pongas dentro del título.
Responde solo JSON: {"title": "...", "highlight": [n, ...], "emoji": "...", "streamer": "..."}` });
    let o;
    try {
      try { o = await geminiJSON(parts, 0.5, { search }); }
      catch (e) { if (!search || ['BADKEY', 'QUOTA', 'NET'].includes(e.message)) throw e; console.warn('Contexto de Google no disponible:', e); o = await geminiJSON(parts, 0.5); }
    }
    catch (e) {   // si falla con el audio, se intenta solo con imágenes y transcripción
      if (['BADKEY', 'QUOTA', 'NET'].includes(e.message) || !parts.some(p => p.inline_data && p.inline_data.mime_type === 'audio/wav')) throw e;
      console.warn('Título con audio falló, pruebo sin audio:', e);
      setStatus(st, '✨ Probando otra vez sin el audio…');
      o = await geminiJSON(parts.filter(p => !(p.inline_data && p.inline_data.mime_type === 'audio/wav')), 0.5);
    }
    if (Array.isArray(o)) o = o[0] || {};
    if (typeof o === 'string') o = { title: o };
    let t = String(o.title || o.titulo || o.título || (Array.isArray(o.titles) ? o.titles[0] : '') || '').replace(/^["«“]+|["»”]+$/g, '').trim();
    if (!t) throw new Error('sin título en la respuesta');
    if (auto && !titleIsDefault()) return;   // mientras pensaba, escribiste tú uno: no se pisa
    titleSeen.push(t); if (titleSeen.length > 8) titleSeen.shift();
    const found = String(o.streamer || '').trim();
    if (!who && found && found.length < 40) { $('streamer').value = found; rememberStreamer(found); }
    const n = t.split(/\s+/).filter(Boolean).length;
    t = withEmoji(t, o.emoji, $('titleEmoji').checked);
    $('title').value = t; $('title').dispatchEvent(new Event('input', { bubbles: true })); clipMeta.aiTitle = t;
    const noHL = !autoHLOn();
    titleHL.clear(); (noHL ? [] : Array.isArray(o.highlight) ? o.highlight : []).map(Number).filter(i => i >= 0 && i < n).slice(0, 3).forEach(i => titleHL.add(i));
    renderChips(); pushHistory(); tlSig = '';
    setStatus(st, '✨ Título escrito por la IA. Pulsa «Otro título» si quieres otra opción.', 'ok');
  } catch (e) {
    console.warn('Título IA:', e);
    const why = e.message === 'BADKEY' ? 'la clave de Gemini no es válida' : e.message === 'QUOTA' ? 'has llegado al límite gratuito de Gemini por hoy' : e.message === 'NET' ? 'no hay conexión con Gemini' : 'Gemini no respondió bien, prueba otra vez';
    setStatus(st, 'No se pudo escribir el título: ' + why + '.' + (/^(BADKEY|QUOTA|NET)$/.test(e.message) ? '' : ` (Detalle: ${String(e.message).slice(0, 140)})`), 'err');
  } finally { titleBusy = false; $('aiTitle').disabled = false; }
}
$('aiTitle').onclick = () => aiTitle(false);
$('gemKey2').addEventListener('input', () => { const v = $('gemKey2').value.trim(); try { localStorage.setItem('clipzi-gemini', v); } catch {} $('gemKey').value = v; });
$('gemKey').addEventListener('input', () => { $('gemKey2').value = $('gemKey').value.trim(); });
$('gemKey2').value = getGemKey();
$('titleKeyWrap').hidden = !!getGemKey();

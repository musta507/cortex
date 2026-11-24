/* ---------- registro de clips: qué se abrió, qué se exportó (con su momento exacto) y qué se descartó ----------
   Se va acumulando solo y se descarga en un archivo para analizarlo. */
async function clipLogAdd(ev) { try { const L = (await kv.get('cliplog')) || []; L.push({ cuando: new Date().toISOString(), ...ev }); await kv.set('cliplog', L.slice(-5000)); } catch (e) { console.warn('registro', e); } }
const hms = t => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
function momentInfo(S, g) {
  const it = g.items || [], x = groupX(g);
  return { canal: S.status.slug, directo_empezo: new Date(S.status.started * 1000).toISOString(), minuto_inicio: hms(g.t0 - S.status.started), minuto_fin: hms(g.t1 - S.status.started), duracion_s: +(g.t1 - g.t0).toFixed(1),
    hora_inicio: new Date(g.t0 * 1000).toISOString(), senales: [...(g.kinds || [])], chat_x: x ? +x.toFixed(1) : null,
    detalle: it.map(m => ({ senal: m.src, de: m.who || null, texto: String(m.info || '').slice(0, 300), pedido: m.req || null, enlace: m.url || null })) };
}
function clipLogSnap() {
  const [a, b] = loaded ? srcRange() : [0, 0], lv = clipMeta.liveAt, cl = clientOf(curClient), o = {};
  o.cliente = cl ? cl.name : null; o.archivo = file ? file.name : null;
  o.duracion_s = +segs.reduce((q, x) => q + (x.e - x.s), 0).toFixed(1); o.trozos = segs.length;
  o.formato = curFmtOf(); o.escenas = (clipMeta.scenes || []).map(x => ({ de_s: +Math.max(a, x.s).toFixed(1), a_s: +Math.min(b, x.e).toFixed(1), formato: x.f })).filter(x => x.a_s > x.de_s);
  o.titulo = $('title').value; o.titulo_ia = clipMeta.aiTitle || null; o.titulo_cambiado_a_mano = !!clipMeta.aiTitle && clipMeta.aiTitle !== $('title').value;
  o.plantilla_titulo = titleDef || null; o.subtitulos = captions.map(c => c.text || (c.words || []).map(w => w.text).join(' ')).join(' ').slice(0, 4000);
  if (lv) {   // clip sacado del directo: su momento exacto y cuánto lo has movido respecto a lo propuesto
    const t0 = lv.fileT0 + a, t1 = lv.fileT0 + b;
    o.directo = { ...lv.m, clip_minuto_inicio: hms(t0 - lv.started), clip_minuto_fin: hms(t1 - lv.started), clip_hora_inicio: new Date(t0 * 1000).toISOString(), clip_hora_fin: new Date(t1 * 1000).toISOString(),
      inicio_movido_s: +(t0 - lv.t0).toFixed(1), final_movido_s: +(t1 - lv.t1).toFixed(1) };
  }
  return o;
}
async function clipLogDownload() {
  const L = (await kv.get('cliplog')) || [];
  if (!L.length) { toast('Todavía no hay datos: se guardan al abrir, exportar o descartar clips'); return; }
  const n = t => L.filter(x => x.tipo === t).length;
  const data = { app: 'Cortex', generado: new Date().toISOString(), resumen: { exportados: n('exportado'), abiertos_del_directo: n('abierto'), descartados: n('descartado') }, clips: L };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `cortex-datos-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`Descargado: ${n('exportado')} exportados · ${n('abierto')} abiertos · ${n('descartado')} descartados`);
}
setTimeout(() => {
  const b1 = $('lvData'); if (b1) b1.onclick = clipLogDownload;
  const st = $('eStatus'); if (st && !$('logDl')) { const b = document.createElement('button'); b.id = 'logDl'; b.type = 'button'; b.textContent = 'Descargar datos de mis clips'; b.title = 'Un archivo con todo lo que has exportado, abierto y descartado, para analizarlo'; b.style.cssText = 'width:auto;margin-top:8px;font-size:12.5px;padding:6px 12px'; b.onclick = clipLogDownload; st.after(b); }
}, 0);
async function liveDrop(g) {
  try { const S = Object.values(liveSessions).find(s => (s.moments || []).some(m => g.items.some(i => i.id === m.id))); if (S) clipLogAdd({ tipo: 'descartado', directo: momentInfo(S, g) }); } catch (e) { console.warn(e); }
  liveHidden.add(g.id); try { await kv.set('live-hidden', [...liveHidden].slice(-500)); } catch {} liveRender(); }


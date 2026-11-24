/* ---------- almacén general (proyecto, plantillas, archivos) ---------- */
// si el almacén del navegador se queda colgado (pasa cuando el disco se llena), no se bloquea la app: se avisa y se sigue
let kvWarned = false;
function kvSlow(p, ms, what) {
  return Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('KV_TIMEOUT')), ms))]).catch(e => {
    if (e && e.message === 'KV_TIMEOUT' && !kvWarned) { kvWarned = true; console.warn('almacén colgado', what); try { toast('⚠ El navegador no responde al guardar tus datos. Cierra TODAS las ventanas de Edge y vuelve a abrir Cortex.'); } catch {} }
    throw e;
  });
}
const kv = {
  get(k) { return kvSlow(db.tx('kv', 'readonly', st => st.get(k)), 6000, 'leer ' + k).catch(e => { if (e && e.message === 'KV_TIMEOUT') return undefined; throw e; }); },
  set(k, v) { return kvSlow(db.tx('kv', 'readwrite', st => st.put(v, k)), (v instanceof Blob) ? 120000 : 8000, 'guardar ' + k); },
  del(k) { return kvSlow(db.tx('kv', 'readwrite', st => st.delete(k)), 8000, 'borrar ' + k); },
};


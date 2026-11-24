/* ---------- subir un vídeo (que no es del directo) y editarlo en el mismo panel ---------- */
async function stUpload(f) {
  if (!f || !/^video\//.test(f.type || '') && !/\.(mp4|mov|webm|mkv|m4v)$/i.test(f.name)) { toast('Eso no parece un vídeo'); return; }
  if (auBusy) { toast('El modo automático está terminando un clip: prueba en unos segundos'); return; }
  if (!$('stEd').hidden && stPend !== 'prep') { toast('Termina o cierra (✕) el clip que tienes abierto'); return; }
  const dur = await new Promise(ok => { const v = document.createElement('video'), u = URL.createObjectURL(f); v.preload = 'metadata'; v.onloadedmetadata = () => { ok(v.duration || 30); URL.revokeObjectURL(u); }; v.onerror = () => { ok(30); URL.revokeObjectURL(u); }; v.src = u; });
  const S0 = lvTrSess(), cl = clientOf(curClient);
  const S = { name: 'subido', status: { client: (S0 && S0.status && S0.status.client) || (cl && cl.name) || '', slug: f.name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40) || 'video', started: 0 } };
  const g = { id: 'up' + Date.now().toString(36), t0: 0, t1: dur, kinds: new Set(['subido']), items: [{ src: 'subido', info: '' }] };
  try { pvClose(); } catch {}
  stEdPend(g); $('seS').textContent = '⏳ Abriendo tu vídeo… Mientras, ve poniendo el título y el formato.';
  try { await stEdOpen(S, g, { f, off: 0, dur }); } catch (e) { console.warn(e); $('seS').textContent = '⚠ No se pudo abrir el vídeo: ' + (e.message || e); stPend = null; }
}
setTimeout(() => {
  const b = $('lvUpB'), i = $('lvUpF'); if (!b || !i) return;
  b.onclick = () => i.click(); i.onchange = () => { const f = i.files[0]; i.value = ''; if (f) stUpload(f); };
  const lp = $('livePage');
  lp.addEventListener('dragover', e => { if ([...(e.dataTransfer.items || [])].some(x => x.kind === 'file')) { e.preventDefault(); lp.classList.add('drop'); } });
  lp.addEventListener('dragleave', e => { if (e.target === lp) lp.classList.remove('drop'); });
  const ed = $('stEd');   // también se puede soltar el vídeo encima del editor vacío
  ed.addEventListener('dragover', e => { if (stPend === 'prep' && [...(e.dataTransfer.items || [])].some(x => x.kind === 'file')) e.preventDefault(); });
  ed.addEventListener('drop', e => { if (stPend !== 'prep') return; const f = [...(e.dataTransfer.files || [])].find(x => /^video\//.test(x.type) || /\.(mp4|mov|webm|mkv|m4v)$/i.test(x.name)); if (!f) return; e.preventDefault(); stUpload(f); });
  lp.addEventListener('drop', e => { lp.classList.remove('drop'); const f = [...(e.dataTransfer.files || [])].find(x => /^video\//.test(x.type) || /\.(mp4|mov|webm|mkv|m4v)$/i.test(x.name)); if (!f) return; e.preventDefault(); stUpload(f); });
}, 0);
@@solo-pc


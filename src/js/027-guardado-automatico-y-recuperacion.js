/* ---------- guardado automático y recuperación ---------- */
let saveTimer = null;
function autosave(snap) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { if (!curProj) return; try { await kv.set('proj:' + curProj, { snap, time: Date.now() }); } catch {} upsertProject(); }, 400);
}
let restoredClipName = null;

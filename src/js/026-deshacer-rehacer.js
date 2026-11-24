/* ---------- deshacer / rehacer ---------- */
let hist = [], hi = -1, histTimer = null;
function updUndo() { $('undo').disabled = hi <= 0; $('redo').disabled = hi >= hist.length - 1; }
function commitHistory() {
  histTimer = null;
  if (restoring) return;
  if (window.mtHoldHist) { histTimer = setTimeout(commitHistory, 300); return; }
  const snap = JSON.stringify(getProject());
  if (hist[hi] === snap) return;
  hist = hist.slice(0, hi + 1); hist.push(snap);
  if (hist.length > 150) hist.shift();
  hi = hist.length - 1; updUndo(); autosave(snap);
}
function pushHistory() {
  scheduleLogoAvoid();
  if (restoring) return;
  clearTimeout(histTimer);
  histTimer = setTimeout(commitHistory, 300);
}
async function goHistory(d) {
  if (histTimer) { clearTimeout(histTimer); commitHistory(); }   // lo último que hiciste también cuenta
  const n = hi + d; if (n < 0 || n >= hist.length) return;
  clearTimeout(histTimer);
  hi = n; await applyProject(JSON.parse(hist[hi])); updUndo(); autosave(hist[hi]);
}
$('undo').onclick = () => goHistory(-1);
$('redo').onclick = () => goHistory(1);
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || cropMode) return;
  const a = document.activeElement;
  if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search)$/.test(a.type)))) return;  // ahí manda el deshacer del propio texto
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); goHistory(-1); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); goHistory(1); }
});
['input', 'change'].forEach(ev => document.querySelector('.wrap').addEventListener(ev, e => {
  const t = e.target;
  if (t.type === 'file' || t.type === 'search' || t.id === 'tplName' || t.id === 'tplSel' || t.id === 'gemKey' || t.id === 'gemKey2') return;
  pushHistory();
}));


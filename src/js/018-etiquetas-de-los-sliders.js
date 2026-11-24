/* ---------- etiquetas de los sliders ---------- */
const labels = {
  titleSize: v => v, subSize: v => v, subY: v => v + '%', zoom: v => v + '%', offY: v => v, offX: v => v,
  titleLH: v => (v / 100).toFixed(2), subLH: v => (v / 100).toFixed(2), boxR: v => v, boxPX: v => v, boxPY: v => v,
  logoSize: v => v + '%', logoOp: v => v + '%', logoRot: v => v + '°',
  shOp: v => v + '%', shBlur: v => v, strokeW: v => v, ratio: v => v + '%', imgZoom: v => v + '%',
  mVol: v => v + '%', vVol: v => v + '%', mStart: v => mmss(+v), mFadeIn: v => v + ' s', mFadeOut: v => v + ' s',
};
$('subsGen').addEventListener('change', () => {
  if (restoring) return;
  const on = $('subsGen').checked;
  trk.caps.hide = !on; clipMeta.noSubs = !on; syncTrackUI(); pushHistory();
  if (on && loaded && !captions.length && typeof ezResubs === 'function') ezResubs();
});
labels.titleW = v => +v > 0 ? v + ' px' : 'auto';
labels.boxOp = v => v + '%'; labels.tLS = v => v; labels.tStrokeW = v => v; labels.tShadow = v => v + '%';
for (const k in labels) $(k).addEventListener('input', e => $(k + 'V').textContent = labels[k](e.target.value));
$('mStart').addEventListener('input', () => syncMusic(!vid.paused));


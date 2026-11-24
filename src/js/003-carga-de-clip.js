/* ---------- carga de clip ---------- */
const drop = $('drop');
['dragover','dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(e => drop.addEventListener(e, () => drop.classList.remove('over')));
drop.addEventListener('drop', ev => { ev.preventDefault(); if (ev.dataTransfer.files[0]) loadFile(ev.dataTransfer.files[0]); });
$('file').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

async function loadFile(f, fromRestore) {
  file = f;
  vid.src = URL.createObjectURL(f);
  await new Promise((res, rej) => { vid.onloadedmetadata = res; vid.onerror = () => rej(new Error('No se pudo leer el vídeo')); })
    .catch(err => { setStatus($('tStatus'), err.message + '. Prueba con un MP4.', 'err'); throw err; });
  vid.currentTime = 0.05;
  loaded = true; fpsEst = 0; demuxFps = 0; playEnd = false;
  logoAuto.manual = false; logoAuto.dy = 0; lastSubBox = null;
  if (!fromRestore) { resetSegs(); texts = []; zones = []; mutes = []; clipMeta = {}; const lk = trk.logo.lock; trk = TRK0(); trk.logo.lock = lk; tsel.clear(); syncTrackUI(); }
  else if (!segs.length) resetSegs();
  if (!fromRestore && !(restoredClipName && f.name === restoredClipName)) { captions = []; allWords = []; }
  restoredClipName = null;
  renderCapList();
  if (!fromRestore) { const k = 'clip:' + curProj; kv.set(k, f).catch(() => kv.del(k).catch(() => {})); pushHistory(); openSec('s2'); }
  if (!fromRestore && !ezHold && layoutMode === 'react') autoDetectCam(false);
  if (!fromRestore && !ezHold && titleIsDefault() && getGemKey()) aiTitle(true);
  zoomMax();
  $('dropTitle').textContent = f.name;
  $('dropInfo').textContent = `${vid.videoWidth}×${vid.videoHeight} · ${fmt(vid.duration)} · ${(f.size/1048576).toFixed(1)} MB`;
  $('s1').classList.add('done');
  ['transcribe','play','seek','export'].forEach(id => $(id).disabled = false);
  setStatus($('tStatus'), 'Clip listo. Pulsa «Generar subtítulos».');
}


/* ---------- audio: voz + música (para oír y para la exportación en tiempo real) ---------- */
const musicEl = new Audio(); musicEl.preload = 'auto';
let actx = null, speaker = null, recDest = null, voiceGain = null, musicGain = null;
function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  actx = new AudioContext();
  speaker = actx.createGain(); speaker.connect(actx.destination);
  recDest = actx.createMediaStreamDestination();
  voiceGain = actx.createGain(); musicGain = actx.createGain(); musicGain.gain.value = 0;
  actx.createMediaElementSource(vid).connect(voiceGain);
  actx.createMediaElementSource(musicEl).connect(musicGain);
  for (const g of [voiceGain, musicGain]) { g.connect(speaker); g.connect(recDest); }
}


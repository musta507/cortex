/* ---------- reproducción ---------- */
function togglePlay() {
  if (!loaded || exporting) return;
  ensureAudio(); stopRewind();
  if (vid.paused) { if (playEnd || curT() >= totalDur() - 0.04) seekOut(0); playEnd = false; vid.playbackRate = 1; vid.play().catch(() => {}); }
  else vid.pause();
}
$('play').onclick = togglePlay;
vid.addEventListener('play', () => { $('play').textContent = '❚❚'; syncMusic(true); });
vid.addEventListener('pause', () => { $('play').textContent = '▶'; musicEl.pause(); });
vid.addEventListener('seeked', () => syncMusic(!vid.paused));
$('seek').addEventListener('input', e => { if (vid.duration) { playEnd = false; seekOut(e.target.value / 1000 * totalDur()); } });


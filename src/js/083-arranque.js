/* ---------- arranque ---------- */
$('s2').classList.add('done');
renderChips();
BASE_STYLE = getStyle();
renderPresets();
renderFontTiles();
showLeft('media'); showInsp('video');
loadLogoCfg();
(async () => {
  await restoreLib();
  // el logo se carga con cada cliente
  await initProjects();
})();
$('fmt').textContent = 'MP4 1080×1920';
Promise.all(['500 40px "TikTok Sans"', '900 40px "TikTok Sans"', '800 40px "TikTok Sans"', '400 40px "TikTok Sans"', '900 40px Montserrat', '400 40px Anton', '800 40px Poppins', '400 40px "Bebas Neue"', '600 40px "TikTok Sans"', '600 40px "Cortex Sans"', '700 40px Inter', '800 40px Inter']
  .map(f => document.fonts.load(f).catch(() => {})).concat(restoreFonts())).finally(() => requestAnimationFrame(loop));
window.__clipzi = { setWords(w) { allWords = w; buildCaptions(); } };

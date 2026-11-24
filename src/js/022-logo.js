/* ---------- logo ---------- */
let logo = null;                              // { img, src }
const logoPos = { x: W - 170, y: 240 };       // centro del logo en el vídeo final
function setLogo(src, record = true) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      logo = { img: im, src };
      $('logoTitle').textContent = 'Cambiar logo';
      $('logoOpts').hidden = false; $('sL').classList.add('done');
      if (record) { pushHistory(); persistClient(); lgAdd(src).catch(() => {}); }   // el logo es de cada cliente (y queda en la biblioteca de logos)
      res();
    };
    im.onerror = () => { $('logoTitle').textContent = 'Ese archivo no es una imagen válida'; res(); };
    im.src = src;
  });
}
function clearLogo(record = true) {
  logo = null; $('logoOpts').hidden = true; $('sL').classList.remove('done');
  $('logoTitle').textContent = 'Subir logo';
  if (record) { pushHistory(); persistClient(); }
}
$('logoFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const fr = new FileReader(); fr.onload = () => setLogo(fr.result); fr.readAsDataURL(f);
  e.target.value = '';
});
$('logoRemove').onclick = () => { clearLogo(); toast('Logo quitado de este cliente'); };
$('logoCenter').onclick = () => { if (trk.logo.lock) return; logoPos.x = W / 2; pushHistory(); saveLogoCfg(); };
$('logoCorner').onclick = () => { if (trk.logo.lock) return; logoPos.x = W - 170; logoPos.y = 240; pushHistory(); saveLogoCfg(); };
$('logoLock').addEventListener('change', () => { trk.logo.lock = $('logoLock').checked; saveLogoCfg(); syncTrackUI(); toast(trk.logo.lock ? 'Logo bloqueado' : 'Logo desbloqueado'); });
$('logoShow').addEventListener('change', () => { trk.logo.hide = !$('logoShow').checked; syncTrackUI(); pushHistory(); });


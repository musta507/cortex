/* ---------- título: palabras en rojo y estilos ---------- */
function renderChips() {
  const box = $('chips'); box.innerHTML = '';
  const words = $('title').value.split(/\s+/).filter(Boolean);
  for (const i of [...titleHL]) if (i >= words.length) titleHL.delete(i);
  words.forEach((w, i) => {
    const b = document.createElement('button'); b.className = 'chip' + (titleHL.has(i) ? ' on' : '');
    b.textContent = w; b.type = 'button'; b.setAttribute('aria-pressed', titleHL.has(i));
    b.onclick = () => { titleHL.has(i) ? titleHL.delete(i) : titleHL.add(i); renderChips(); pushHistory(); };
    box.append(b);
  });
  if (!words.length) box.innerHTML = '<span class="hint">Escribe un título para poder destacar palabras.</span>';
}
$('title').addEventListener('input', () => { renderChips(); $('s2').classList.toggle('done', !!$('title').value.trim()); });
function setSeg(btns, on) { btns.forEach(b => b.classList.toggle('on', b === on)); }
function setTitleStyle(v) {
  titleStyle = v; setSeg([$('stPlain'), $('stBox')], v === 'box' ? $('stBox') : $('stPlain'));
  $('boxOpts').hidden = v !== 'box'; $('plainOpts').hidden = v === 'box';
}
function setBoxMode(v) { boxMode = v; setSeg([$('bmSingle'), $('bmLines')], v === 'lines' ? $('bmLines') : $('bmSingle')); }
[$('stPlain'), $('stBox')].forEach(b => b.onclick = () => { setTitleStyle(b.dataset.style); pushHistory(); });
[$('bmSingle'), $('bmLines')].forEach(b => b.onclick = () => { setBoxMode(b.dataset.mode); pushHistory(); });


/* ---------- sugerir una plantilla (web): le llega al panel del administrador ---------- */
function sugOpen() {
  let ov = $('sugOv'); if (ov) ov.remove(); ov = document.createElement('div'); ov.id = 'sugOv'; ov.className = 'ttc-ov';
  const fmts = PRESETS.filter(p => !presetHidden.includes(p.name)).map(p => p.name);
  ov.innerHTML = `<div class="ttc sug" role="dialog" aria-label="Sugerir una plantilla"><div class="ttc-h"><b>💡 Sugerir una plantilla</b><button class="ttc-x" title="Cerrar (Esc)">✕</button></div>
    <div class="sug-b"><label class="ttc-f">¿Qué plantilla te gustaría?<textarea id="sugT" rows="5" maxlength="2000" placeholder="Ej.: como Primer plano pero con la cara más grande y el título en caja amarilla, para los clips de WestCOL hablando"></textarea></label>
      <label class="ttc-f">Basada en<select id="sugF"><option value="">Una nueva</option>${fmts.map(n => `<option>${n.replace(/[<>&]/g, '')}</option>`).join('')}</select></label>
      <div class="ttc-f">Imagen de ejemplo <em>(opcional: pega una captura con Ctrl+V, súbela, o usa cómo se ve tu clip)</em>
        <div class="sug-img"><div class="sug-pv" id="sugPv"><span>Sin imagen</span></div><div class="sug-ib"><button type="button" id="sugUp">📁 Subir imagen</button><button type="button" id="sugClip"${loaded ? '' : ' disabled title="Abre un clip para usarlo"'}>🎬 Cómo se ve mi clip</button><button type="button" id="sugNo" hidden>Quitar</button></div></div>
        <input type="file" id="sugFile" accept="image/*" hidden></div></div>
    <div class="ttc-a"><span class="ttc-msg" id="sugMsg"></span><button id="sugCancel">Cancelar</button><button class="primary" id="sugSend">Enviar sugerencia</button></div></div>`;
  document.body.append(ov); const q = x => ov.querySelector(x); let imgData = null;
  const setImg = d => { imgData = d; const pv = q('#sugPv'); pv.innerHTML = d ? `<img src="${d}" alt="">` : '<span>Sin imagen</span>'; q('#sugNo').hidden = !d; };
  const fromBlob = b => new Promise((res, rej) => { const u = URL.createObjectURL(b), im = new Image(); im.onload = () => { const k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.85)); }; im.onerror = rej; im.src = u; });
  q('#sugUp').onclick = () => q('#sugFile').click(); q('#sugFile').onchange = async () => { const f = q('#sugFile').files[0]; if (f) setImg(await fromBlob(f)); };
  q('#sugNo').onclick = () => setImg(null);
  q('#sugClip').onclick = () => { try { const c = document.createElement('canvas'); c.width = 540; c.height = 960; c.getContext('2d').drawImage($('cv'), 0, 0, 540, 960); setImg(c.toDataURL('image/jpeg', 0.85)); } catch { q('#sugMsg').textContent = 'No se pudo copiar el clip'; } };
  ov.addEventListener('paste', async e => { const it = [...(e.clipboardData || {}).items || []].find(x => x.type.startsWith('image/')); if (it) { e.preventDefault(); setImg(await fromBlob(it.getAsFile())); } });
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 180); document.removeEventListener('keydown', esc, true); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }; document.addEventListener('keydown', esc, true);
  q('.ttc-x').onclick = close; q('#sugCancel').onclick = close; ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });
  ov.addEventListener('keydown', e => e.stopPropagation());
  q('#sugSend').onclick = async () => {
    const t = q('#sugT').value.trim(), m = q('#sugMsg'); if (!t && !imgData) { m.textContent = 'Escribe qué plantilla quieres'; q('#sugT').focus(); return; }
    const b = q('#sugSend'); b.disabled = true; m.textContent = '';
    try { const r = await fetch('/api/sugerencia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: t, formato: q('#sugF').value, imagen: imgData }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'no se pudo enviar');
      close(); toast('💡 ¡Gracias! Tu sugerencia ha llegado'); } catch (e) { m.textContent = '⚠ ' + e.message; b.disabled = false; }
  };
  setTimeout(() => q('#sugT').focus(), 50);
}
setTimeout(() => { const b = $('tplSugBtn'); if (b) b.onclick = sugOpen; }, 0);
// nombre corto a partir de cómo se ve: «Caja roja», «Texto amarillo», «Caja negra Anton»…
function ttShortName(tp, used) {
  const c = (tp && tp.c) || {}, box = tp && tp.titleStyle === 'box', P = [['blanc', 255, 255, 255], ['negr', 15, 15, 15], ['amarill', 255, 225, 0], ['roj', 230, 30, 40], ['azul', 40, 110, 245], ['verde', 40, 200, 90], ['ros', 245, 90, 170], ['morad', 140, 70, 230], ['naranja', 255, 140, 0], ['gris', 140, 140, 140]];
  const col = (h, fem) => { const x = String(h || '#ffffff').replace('#', ''), r = parseInt(x.slice(0, 2), 16) || 0, g = parseInt(x.slice(2, 4), 16) || 0, b = parseInt(x.slice(4, 6), 16) || 0; let best = P[0], bd = 1e9; for (const q of P) { const d = (q[1] - r) ** 2 + (q[2] - g) ** 2 + (q[3] - b) ** 2; if (d < bd) { bd = d; best = q; } } const w = best[0]; return /^(azul|verde|naranja|gris)$/.test(w) ? w : w + (fem ? 'a' : 'o'); };
  const font = String(c.titleFont || '').split('|')[0].replace(/ (Sans|Display|Neue)$/, '');
  const base = box ? 'Caja ' + col(c.boxColor, true) : 'Texto ' + col(c.titleColor, false), tries = [base, base + (c.titleUpper ? ' mayúsculas' : ''), base + ' ' + font, base + ' ' + font + (c.titleUpper ? ' mayúsculas' : '')];
  for (const n of tries) if (!used.has(n) && !ttGet(n)) return n;
  for (let i = 2; ; i++) if (!used.has(base + ' ' + i) && !ttGet(base + ' ' + i)) return base + ' ' + i;
}

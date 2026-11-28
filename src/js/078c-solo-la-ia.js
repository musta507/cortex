/* ---------- «Con IA» solo enseña lo que encuentra la IA con tu criterio. Lo demás (otros clippers, chat, clips de Kick,
   pedir un clip, modo automático, formato) sigue ahí, pero escondido, sin avisos, salvo que lo actives en Ajustes del directo. ---------- */
const lvExtra = () => ezPref('lvExtra') === '1';
async function lvClientOf(slug) { slug = String(slug || '').toLowerCase(); for (const c of clients) if (lvSlug((await getLive(c)).kick) === slug) return c; return null; }
function lvSoloSync() { const p = $('livePage'); if (p) p.classList.toggle('lv-solo', !lvExtra()); }
// la franja de arriba: si la IA está escuchando a este canal, con qué criterio, y encenderla o pararla
let lvIaBusy = false;
async function lvIaBar() {
  const bar = $('lvIa'); if (!bar || lvIaBusy) return;
  const S = lvTrSess(), slug = S ? String(S.status.slug || '') : (lvFocus || liveWant[0] || '');
  const cl = slug ? await lvClientOf(slug) : null, L = cl ? await getLive(cl) : null;
  const key = !!getGemKey(), off = critOff().has('ia'), on = !!(L && L.ai) && !off;
  const live = !!(S && S.on);
  const n = S ? (S.moments || []).filter(m => m.src === 'ia').length : 0;
  let st, cls, btns = [];
  if (!slug) { st = 'Elige un canal arriba para que la IA lo escuche.'; cls = 'off'; }
  else if (!key) { st = `Falta la clave de Gemini para que la IA escuche a ${slug}.`; cls = 'warn'; btns.push(['Ponerla', () => { $('lvBackHome').click(); setHomeSec('ajustes'); setTimeout(() => $('setGem') && $('setGem').focus(), 80); }]); }
  else if (!on) { st = `La IA no está escuchando a ${slug}.`; cls = 'off'; btns.push(['✨ Que escuche', async () => { lvIaBusy = true; try { if (cl) { await saveLive(cl, { ...L, ai: true }); } if (off) { const s = critOff(); s.delete('ia'); ezPref('critOff', JSON.stringify([...s])); } await writeLiveConfig(); toast(`La IA escucha a ${slug}: cada 2 minutos mira si hay un clip`); } finally { lvIaBusy = false; } lvIaBar(); liveRender(); }, true]); }
  else { st = live ? `La IA está escuchando a ${slug}: cada 2 minutos mira si hay un clip con tu criterio.` : `La IA escuchará a ${slug} en cuanto entre en directo.`; cls = live ? 'on' : 'wait'; btns.push(['Parar', async () => { lvIaBusy = true; try { await saveLive(cl, { ...L, ai: false }); await writeLiveConfig(); toast('La IA ha dejado de escuchar'); } finally { lvIaBusy = false; } lvIaBar(); }]); }
  const sig = [st, cls, n, btns.map(b => b[0]).join()].join('|'); if (bar.dataset.sig === sig) return; bar.dataset.sig = sig;
  bar.className = 'lv-iabar ' + cls; bar.innerHTML = '<i class="lv-iabar-dot"></i><div class="lv-iabar-t"><strong></strong><span></span></div><div class="lv-iabar-b"></div>';
  bar.querySelector('strong').textContent = st;
  bar.querySelector('span').textContent = (n ? `${n} momento${n > 1 ? 's' : ''} encontrado${n > 1 ? 's' : ''} hoy · ` : '') + 'Criterio: el de «Agente de clips»';
  const bb = bar.querySelector('.lv-iabar-b');
  for (const [t, fn, prim] of btns) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; if (prim) b.className = 'primary'; b.onclick = fn; bb.append(b); }
  const ed = document.createElement('button'); ed.type = 'button'; ed.textContent = 'Editar el criterio'; ed.onclick = () => { $('lvBackHome').click(); setHomeSec('agente'); setTimeout(() => { if ($('agCfg')) { $('agCfg').open = true; $('agRules').focus(); } }, 80); }; bb.append(ed);
}
setTimeout(() => {
  if (!$('lvStatus')) return;
  const bar = document.createElement('div'); bar.id = 'lvIa'; bar.className = 'lv-iabar'; $('lvStatus').after(bar);
  const x = $('lvExtra'); if (x) { x.checked = lvExtra(); x.addEventListener('change', () => { ezPref('lvExtra', x.checked ? '1' : '0'); lvSoloSync(); try { liveRender(); } catch {} }); }
  lvSoloSync();
  setInterval(() => { if (!$('livePage').hidden) lvIaBar(); }, 3000);
}, 0);

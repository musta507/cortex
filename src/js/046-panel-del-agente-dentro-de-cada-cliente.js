/* ---------- panel del agente dentro de cada cliente ---------- */
async function renderAgentBox(cl) {
  const A = await getAgent(cl);
  $('agRules').value = A.general || ''; agChatRender(cl);
  const manInfo = () => { $('agManInfo').textContent = $('agManual').value.trim() ? '· activo' : '· sin criterio'; };
  $('agManual').value = A.manual || ''; $('agTitleGuide').value = A.titleGuide || ''; manInfo();
  const saveMan = async () => { const a = await getAgent(cl); a.manual = $('agManual').value.trim(); a.titleGuide = $('agTitleGuide').value.trim(); await saveAgent(cl, a); manInfo(); };
  ['agManual', 'agTitleGuide'].forEach(id => $(id).oninput = () => { clearTimeout(saveMan.t); saveMan.t = setTimeout(saveMan, 400); });
  $('agManReset').onclick = async () => { $('agManual').value = WESTCOL_MANUAL; $('agTitleGuide').value = WESTCOL_TITLE_GUIDE; await saveMan(); toast('Criterio del informe puesto'); };
  $('agManOff').onclick = async () => { $('agManual').value = ''; $('agTitleGuide').value = ''; await saveMan(); toast('Criterio quitado'); }; $('agChatGo').onclick = () => agChatSend(cl);
  $('agChatIn').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agChatSend(cl); } };
  $('agChatClear').onclick = async () => { const a = await getAgent(cl); a.chat = []; await saveAgent(cl, a); agChatRender(cl); };
  $('agSubs').checked = A.subs; $('agSilence').checked = A.silence; $('agCensor').checked = A.censor; $('agCensorLvl').value = A.censorLvl || 'tiktok'; $('agBad').value = A.bad;
  const save = async () => { const a = await getAgent(cl); Object.assign(a, { general: $('agRules').value, subs: $('agSubs').checked, silence: $('agSilence').checked, censor: $('agCensor').checked, censorLvl: $('agCensorLvl').value, bad: $('agBad').value }); await saveAgent(cl, a); };
  ['agRules', 'agBad'].forEach(id => $(id).oninput = () => { clearTimeout(save.t); save.t = setTimeout(save, 400); });
  ['agSubs', 'agSilence', 'agCensor', 'agCensorLvl'].forEach(id => $(id).onchange = save);
  $('agRun').onclick = async () => { await save(); const rg = agRange(); if (rg === false) return; const r = await pickStream(); if (r) runAgent(cl, r.file, r.handle, null, rg); };
  $('agLinkGo').onclick = async () => { await save(); agFromLink(cl); };
  $('agCancel').onclick = () => { if (agentJob) agentJob.cancel = true; };
  if (!agentJob) $('agProg').hidden = true;
  await loadBatches();
  const B = $('agBatches'); B.innerHTML = '';
  for (const b of batches.filter(x => x.client === cl.id)) {
    const cs = projIndex.filter(x => x.batch === b.id), pend = cs.filter(x => x.status === 'pending').length, ok = cs.filter(x => x.status === 'approved').length;
    const row = document.createElement('div'); row.className = 'bcard';
    row.innerHTML = `<div><strong></strong><span class="hint"></span></div><button class="primary">Revisar</button>`;
    row.querySelector('strong').textContent = '🎬 ' + b.name;
    row.querySelector('.hint').textContent = `${new Date(b.time).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · ${cs.length} clips · ${pend} por revisar · ${ok} aprobados`;
    row.querySelector('button').onclick = () => enterReview(b.id);
    B.append(row);
  }
}

/* ==================== MODO FÁCIL ====================
   Insertar clip → recortar la duración → la IA lo edita → solo el clip vertical,
   y todo se cambia con el ratón (clic derecho = opciones de lo que tocas). */
var ezHold = false, lastMuted = [];            // mientras se inserta el clip: nada de IA automática
let ezMode = false, ezStep = 'edit', ezRetrim = false;
let ezA = 0, ezB = 0, ezDrag = null, ezThumbsFor = null;
const ezVid = $('ezVid');
const ezDur = () => vid.duration || 0;
const fmtS = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(1).padStart(4, '0'); };

function setEasy(on) {
  ezMode = on;
  $('app').classList.toggle('easy', on); document.body.classList.toggle('easy', on);
  $('modeBtn').hidden = false; $('modeBtn').classList.toggle('to-adv', on);
  $('modeBtn').innerHTML = on ? '<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>Editor avanzado' : '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>Modo fácil';
  $('modeBtn').title = on ? 'Abre el editor completo con todas las herramientas' : 'Vuelve a la vista sencilla: solo el clip y clic derecho';
  if (!on) { ezShow('edit'); showLeft('media'); showInsp('video'); tlSig = ''; }
  ctxClose(); ezPopClose();
  setTimeout(fitCanvas, 0);
}
function ezLeave() { ezMode = false; $('app').classList.remove('easy'); document.body.classList.remove('easy'); $('modeBtn').hidden = true; ezShow('edit'); ctxClose(); ezPopClose(); }
$('modeBtn').onclick = () => {
  if (ezMode) { setEasy(false); toast('Editor avanzado: aquí tienes todas las herramientas'); }
  else { setEasy(true); if (!loaded) ezShow('insert'); }
};
function ezShow(step) {
  ezStep = step;
  $('ezStage').hidden = step === 'edit';
  $('ezInsert').hidden = step !== 'insert';
  $('ezRep').hidden = step !== 'rep';
  $('ezTrim').hidden = step !== 'trim';
  if (step !== 'trim') { ezVid.pause(); }
  if (step === 'trim') ezTrimOpen();
  if (step !== 'edit') vid.pause();
  const fb = $('fmtBtn'); if (fb) fb.hidden = step !== 'edit';
  const tb = $('tplBtn'); if (tb) tb.hidden = step !== 'edit';
  const tt = $('ttBtn'); if (tt) tt.hidden = step !== 'edit';
}


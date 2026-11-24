/* ---------- estado: estilo (plantilla) y proyecto completo ---------- */
const STYLE_SKIP = new Set(['title', 'tplName', 'tplSel', 'musicSearch', 'model', 'lang', 'gemKey', 'gemKey2', 'streamer', 'ctxSearch', 'logoSize', 'logoOp', 'logoRot', 'logoLock', 'logoShow',
  'txtLH', 'txtText', 'txtFont', 'txtSize', 'txtRot', 'txtColor', 'txtStrokeC', 'txtBgC', 'txtStroke', 'txtShadow', 'txtBg']);
function styleControls() {
  return [...document.querySelectorAll('.sec input, .sec select, #quality, #fps')]
    .filter(el => el.id && el.type !== 'file' && el.type !== 'search' && !STYLE_SKIP.has(el.id) && !/^cap\d/.test(el.id));
}
function getStyle() {
  const c = {};
  for (const el of styleControls()) c[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  return { c, titleStyle, boxMode, layoutMode, imgPos, pos: { ...pos }, imgOff: { ...imgOff },
           crops: JSON.parse(JSON.stringify(crops)), music: music.cur ? music.cur.id : null };
}
let restoring = false;
const SUB_EXTRA_DEF = { duo: false, call: false, edgeT: '0', edgeB: '0', titleEmoji: true, subsGen: true, titleAutoHL: false, titleW: '0', subBold: true, subItalic: false, subUnder: false, subCase: 'none', subLS: '0', subAlign: 'center', subBg: false, subBgMode: 'line', subBgC: '#000000', subBgOp: '70',
  subBgR: '30', subBgH: '18', subBgW: '30', subBgX: '0', subBgY: '0', subShOn: true, subShC: '#000000', subShD: '0', subShA: '-45',
  boxOp: '100', tLS: '0', tStrokeW: '0', tStrokeC: '#000000', tShadow: '60' };
async function applyStyle(st) {
  restoring = true;
  try {
    if ('music' in st) {
      const it = st.music && music.lib.find(m => m.id === st.music);
      if (it) { if (!music.cur || music.cur.id !== it.id) await selectMusic(it, true); }
      else if (!st.music && music.cur) removeMusic();
    }
    for (const [id, v] of Object.entries(st.c ? { ...SUB_EXTRA_DEF, ...st.c } : {})) {
      const el = $(id); if (!el) continue;
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setTitleStyle(st.titleStyle || 'plain'); setBoxMode(st.boxMode || 'single');
    setLayout(st.layoutMode || 'single', false); setImgPos(st.imgPos || 'bottom');
    Object.assign(pos, st.pos || {}); Object.assign(imgOff, st.imgOff || {});   // el logo no lo mueven las plantillas
    if (st.crops) { crops.cam = { ...st.crops.cam }; crops.content = { ...st.crops.content }; crops.camFx = st.crops.camFx == null ? 0.5 : st.crops.camFx; if (st.crops.fit) crops.fit = st.crops.fit; else delete crops.fit; if (st.crops.zk) crops.zk = st.crops.zk; else delete crops.zk;
      if (st.crops.n) { crops.n = st.crops.n; crops.more = JSON.parse(JSON.stringify(st.crops.more || [])); if (st.crops.callT) crops.callT = JSON.parse(JSON.stringify(st.crops.callT)); else delete crops.callT; } else { delete crops.n; delete crops.more; delete crops.callT; } }
    checkFonts(); syncTiles();
  } finally { setTimeout(() => { restoring = false; }, 0); if (typeof stInlineRender === 'function') setTimeout(stInlineRender, 0); }
}
function getProject() {
  return { v: 2, style: getStyle(), title: $('title').value, titleHL: [...titleHL], captions, allWords, crop,
           clipName: file ? file.name : null, segs, texts, zones, trk, pseg, streamer: $('streamer').value.trim(), mutes, clipMeta,
           logo: { x: logoPos.x, y: logoPos.y, size: $('logoSize').value, op: $('logoOp').value, rot: $('logoRot').value } };
}
async function applyProject(p) {
  restoring = true;
  $('title').value = p.title || '';
  titleHL.clear(); (p.titleHL || []).forEach(i => titleHL.add(i));
  renderChips();
  await applyStyle(p.style || {});
  restoring = true;
  captions = p.captions || []; allWords = p.allWords || []; renderCapList();
  crop = p.crop || null;
  $('streamer').value = p.streamer || '';
  mutes = JSON.parse(JSON.stringify(p.mutes || [])); clipMeta = JSON.parse(JSON.stringify(p.clipMeta || {}));
  segs = JSON.parse(JSON.stringify(p.segs || [])); texts = JSON.parse(JSON.stringify(p.texts || [])); zones = JSON.parse(JSON.stringify(p.zones || []));
  if (!segs.length && loaded) resetSegs();
  const lk = trk.logo.lock; trk = Object.assign(TRK0(), JSON.parse(JSON.stringify(p.trk || {}))); trk.logo.lock = lk;
  nid = Math.max(nid, 1 + Math.max(0, ...segs.map(g => g.id), ...texts.map(t => t.id)));
  if (p.logo) { logoPos.x = p.logo.x; logoPos.y = p.logo.y; $('logoSize').value = p.logo.size; $('logoOp').value = p.logo.op; $('logoRot').value = p.logo.rot || 0; ['logoSize', 'logoOp'].forEach(id => $(id + 'V').textContent = $(id).value + '%'); $('logoRotV').textContent = $('logoRot').value + '°'; }
  // conservar la posición en el vídeo final
  if (segs.length) { const T = Math.min(totalDur(), curT()); pseg = Math.min(p.pseg || 0, segs.length - 1); if (vid.paused && !exporting) { const g = segs[pseg]; if (!(vid.currentTime >= g.s && vid.currentTime <= g.e)) seekOut(Math.min(T, totalDur())); } }
  if (selTextId() != null && !txtById(selTextId())) selected = null;
  tsel.clear(); fillTextPanel(); syncTrackUI(); tlSig = '';
  setTimeout(() => { restoring = false; }, 0);
  if (typeof renderFlags === 'function') renderFlags();
  if (typeof isoRestore === 'function') { isoStop(); isoRestore(); }
  if (typeof stRefresh === 'function') stRefresh();
}


/* ---------- pasar el clip a CapCut: se traduce la edición de Cortex a una línea de tiempo de CapCut ----------
   Cortex prepara el proyecto (pistas, trozos, escala, posición, textos…) y el grabador lo crea en la carpeta de proyectos de CapCut. */
const CC_PX = 4.6;   // píxeles (en un vídeo de 1080 de ancho) por cada punto de «tamaño» de texto de CapCut
const ccId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })).toUpperCase();
const ccUs = s => Math.max(0, Math.round(s * 1e6));
const ccClone = o => JSON.parse(JSON.stringify(o));
const ccRgb = h => { h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => +((parseInt(h.slice(i, i + 2), 16) || 0) / 255).toFixed(4)); };
let ccTplCache = null;
const ccTpl = () => ccTplCache || (ccTplCache = JSON.parse($('ccTpl').textContent));
// encuadre en un instante (con la plantilla de esa parte del clip, si tiene)
function ccGeomAt(t, vw, vh) {
  const sc = layoutMode !== 'split' ? sceneAt(t) : null, ov = sc && sc.ov, k = [layoutMode, clipMeta.cam, clipMeta.track];
  if (ov) { layoutMode = ov.mode; if (ov.cam) clipMeta.cam = ov.cam; else delete clipMeta.cam; if (ov.track) clipMeta.track = ov.track; else delete clipMeta.track; sceneOv = ov; }
  try { const s = S(); return { s, L: layout(s, vw, vh, t), mode: layoutMode }; }
  finally { if (ov) { layoutMode = k[0]; sceneOv = null; if (k[1]) clipMeta.cam = k[1]; else delete clipMeta.cam; if (k[2]) clipMeta.track = k[2]; else delete clipMeta.track; } }
}
// lo que se ve de una capa dentro de su hueco (en CapCut se recorta el vídeo para que no se salga)
function ccClipTo(src, dst, R) {
  if (!R) return { src, dst };
  const x0 = Math.max(dst.x, R.x), y0 = Math.max(dst.y, R.y), x1 = Math.min(dst.x + dst.w, R.x + R.w), y1 = Math.min(dst.y + dst.h, R.y + R.h);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null; const kx = src.w / dst.w, ky = src.h / dst.h;
  return { src: { x: src.x + (x0 - dst.x) * kx, y: src.y + (y0 - dst.y) * ky, w: (x1 - x0) * kx, h: (y1 - y0) * ky }, dst: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}
function ccLayers(g, vw, vh) {
  const { L, s } = g, full = { x: 0, y: 0, w: vw, h: vh }, out = [];
  if (L.react) {
    const c = ccClipTo(L.src || full, L.video, L.vr); if (c) out.push({ kind: 'video', ...c });
    const cr = L.cr || crops, R = L.ir, k = cr.cam;
    if (k && R) { const sw = vw * k.w, sh = vh * k.h, sc = Math.max(R.w / sw, R.h / sh), dw = sw * sc, dh = sh * sc, fx = cr.camFx == null ? 0.5 : cr.camFx, dx = Math.min(R.x, Math.max(R.x + R.w - dw, R.x + R.w / 2 - fx * dw));
      const c2 = ccClipTo({ x: vw * k.x, y: vh * k.y, w: sw, h: sh }, { x: dx, y: R.y + R.h - dh, w: dw, h: dh }, R); if (c2) out.push({ kind: 'video', ...c2 }); }
    for (const m of L.more || []) { const k2 = m.k, R2 = m.R, sw = vw * k2.w, sh = vh * k2.h, sc = Math.max(R2.w / sw, R2.h / sh), dw = sw * sc, dh = sh * sc, dx = Math.min(R2.x, Math.max(R2.x + R2.w - dw, R2.x + R2.w / 2 - 0.5 * dw));
      const c3 = ccClipTo({ x: vw * k2.x, y: vh * k2.y, w: sw, h: sh }, { x: dx, y: R2.y + R2.h - dh, w: dw, h: dh }, R2); if (c3) out.push({ kind: 'video', ...c3 }); }
  } else if (L.split) {
    const c = ccClipTo(full, L.video, L.vr); if (c) out.push({ kind: 'video', ...c });
    if (img) { const R = L.ir, iw = img.naturalWidth, ih = img.naturalHeight, cc = crop || { x: 0, y: 0, w: iw, h: ih }, sc = Math.max(R.w / cc.w, R.h / cc.h) * s.imgZoom, dw = cc.w * sc, dh = cc.h * sc;
      const c2 = ccClipTo(cc, { x: R.x + R.w / 2 + imgOff.x - dw / 2, y: R.y + R.h / 2 + imgOff.y - dh / 2, w: dw, h: dh }, R); if (c2) out.push({ kind: 'image', ...c2, mw: iw, mh: ih }); }
  } else out.push({ kind: 'video', src: L.src || full, dst: L.video });
  return out;
}
// de un rectángulo de Cortex (1080×1920) a la escala y posición de CapCut
function ccClipOf(src, dst, alpha) {
  const f = Math.min(W / src.w, H / src.h), sc = dst.w / (src.w * f);
  return { scale: { x: sc, y: sc }, rotation: 0.0, rotation3d: [], transform: { x: (dst.x + dst.w / 2 - W / 2) / (W / 2), y: -(dst.y + dst.h / 2 - H / 2) / (H / 2) }, flip: { vertical: false, horizontal: false }, alpha: alpha == null ? 1.0 : alpha };
}
const ccCrop = (src, mw, mh) => { const a = src.x / mw, b = src.y / mh, c = (src.x + src.w) / mw, d = (src.y + src.h) / mh, q = v => Math.max(0, Math.min(1, +v.toFixed(6)));
  return { upper_left_x: q(a), upper_left_y: q(b), upper_right_x: q(c), upper_right_y: q(b), lower_left_x: q(a), lower_left_y: q(d), lower_right_x: q(c), lower_right_y: q(d) }; };
const ccFont = v => '__CXFONT__' + String(v || 'Inter|700') + '__';

async function ccBuild() {
  if (!loaded || !file) throw new Error('Abre primero un clip');
  const T = ccTpl(), vw = vid.videoWidth || 1920, vh = vid.videoHeight || 1080, dur = totalDur(), D = ccUs(dur);
  const draft = ccClone(T.base), M = draft.materials, tracks = [], files = {}, fonts = new Set(), metaFiles = [];
  draft.id = ccId(); draft.duration = D; draft.fps = 30.0; draft.canvas_config = { ratio: '9:16', width: W, height: H, background: null };
  const ext = ((file.name || '').match(/\.(\w{2,5})$/) || [, 'mp4'])[1].toLowerCase(), clipName = 'clip.' + ext;
  files[clipName] = file; metaFiles.push({ name: clipName, kind: 'video', w: vw, h: vh, dur: ccUs(vid.duration || dur) });
  const add = (list, o) => { (M[list] = M[list] || []).push(o); return o.id; };
  const vrefs = (canvas, vol) => { const r = []; for (const [k, x] of Object.entries(T.vrefs)) { const o = ccClone(x); o.id = ccId(); if (k === 'canvases' && canvas) Object.assign(o, canvas); r.push(add(k, o)); } return r; };
  const trackOf = (type, flag) => { const t = ccClone(T.track); t.id = ccId(); t.type = type; t.flag = flag || 0; t.attribute = 0; t.segments = []; tracks.push(t); return t; };
  const vMat = (kind, path, mw, mh, crop, durUs) => { const o = ccClone(kind === 'image' ? T.photo : T.vmat); Object.assign(o, { id: ccId(), local_material_id: ccId().toLowerCase(), path, material_name: path.split('/').pop(), width: mw, height: mh, duration: kind === 'image' ? 10800000000 : durUs, crop, type: kind === 'image' ? 'photo' : 'video', has_audio: kind !== 'image' }); return add('videos', o); };
  const vSeg = (track, mat, srcA, durUs, tgt, clip, canvas, vol, ri) => { const g = ccClone(track.segments.length || track !== tracks[0] ? T.oseg : T.vseg); Object.assign(g, ccClone(T.vseg), { id: ccId(), material_id: mat, source_timerange: { start: srcA, duration: durUs }, target_timerange: { start: tgt, duration: durUs }, clip, extra_material_refs: vrefs(canvas), volume: vol, last_nonzero_volume: vol || 1, render_index: ri, track_render_index: tracks.indexOf(track) }); track.segments.push(g); return g; };
  // 1) trozos del vídeo, partidos también donde cambia la plantilla
  const pieces = []; let acc = 0;
  for (const g of segs) { const cuts = new Set([g.s, g.e]); for (const x of clipMeta.scenes || []) { if (x.s > g.s + 0.01 && x.s < g.e - 0.01) cuts.add(x.s); if (x.e > g.s + 0.01 && x.e < g.e - 0.01) cuts.add(x.e); }
    const cs = [...cuts].sort((a, b) => a - b); for (let i = 0; i < cs.length - 1; i++) pieces.push({ a: cs[i], b: cs[i + 1], T0: acc + cs[i] - g.s }); acc += g.e - g.s; }
  const vol = Math.max(0, +$('vVol').value / 100), main = trackOf('video'), over = [];
  let blurAny = false, imgName = null;
  for (const p of pieces) {
    const geo = ccGeomAt((p.a + p.b) / 2, vw, vh); p.geo = geo; const ls = ccLayers(geo, vw, vh), du = ccUs(p.b - p.a), t0 = ccUs(p.T0);
    const bg = geo.s.bg || 'black', canvas = !geo.L.split && bg.startsWith('blur') ? { type: 'canvas_blur', blur: [0.0625, 0.0625, 0.375, 0.75, 1.0][+bg.slice(4)] || 0.375, color: '' } : { type: 'canvas_color', color: '', blur: 0.0 };
    if (canvas.type === 'canvas_blur') blurAny = true;
    ls.forEach((l, i) => {
      const tr = i === 0 ? main : (over[i - 1] = over[i - 1] || trackOf('video', 2));
      if (l.kind === 'image') { if (!imgName) { imgName = 'imagen.png'; } const m = vMat('image', '__CXDIR__/cortex/' + imgName, l.mw, l.mh, ccCrop(l.src, l.mw, l.mh), 0); vSeg(tr, m, 0, du, t0, ccClipOf(l.src, l.dst), null, 1.0, i); }
      else { const m = vMat('video', '__CXDIR__/cortex/' + clipName, vw, vh, ccCrop(l.src, vw, vh), ccUs(vid.duration || dur)); vSeg(tr, m, ccUs(p.a), du, t0, ccClipOf(l.src, l.dst), i === 0 ? canvas : null, i === 0 ? vol : 0.0, i); }
    });
  }
  if (imgName && img) { try { files[imgName] = await (await fetch(img.src)).blob(); metaFiles.push({ name: imgName, kind: 'photo', w: img.naturalWidth, h: img.naturalHeight }); } catch {} }
  // 2) textos (título y subtítulos): con la misma letra, tamaño, colores y sitio que en Cortex
  let ri = 14000; const textTrack = () => trackOf('text');
  const tSeg = (track, mat, start, du, x, y) => { const g = ccClone(T.tseg), an = ccClone(T.tani); an.id = ccId(); add('material_animations', an);
    Object.assign(g, { id: ccId(), material_id: mat, target_timerange: { start, duration: du }, extra_material_refs: [an.id], render_index: ri++, track_render_index: tracks.indexOf(track),
      clip: { scale: { x: 1.0, y: 1.0 }, rotation: 0.0, rotation3d: [], transform: { x: (x - W / 2) / (W / 2), y: -(y - H / 2) / (H / 2) }, flip: { vertical: false, horizontal: false }, alpha: 1.0 } }); track.segments.push(g); };
  const tMat = (o) => {   // o: {text, font, px, color, hl:[[a,b,color]], stroke:{px,color}, shadow:{alpha,blur,dist,angle,color}, box:{color,alpha,padX,padY,r}, ls, lh, type}
    const m = ccClone(T.tmat), size = +(o.px / CC_PX).toFixed(2), fp = ccFont(o.font); fonts.add(o.font);
    const st = (a, b, col) => { const x = { fill: { content: { render_type: 'solid', solid: { color: ccRgb(col) } } }, font: { path: fp, id: '' }, size, useLetterColor: true, range: [a, b] };
      if (o.stroke) x.strokes = [{ content: { render_type: 'solid', solid: { color: ccRgb(o.stroke.color) } }, width: +Math.min(0.2, o.stroke.px / o.px).toFixed(4) }];
      if (o.shadow) x.shadows = [{ thickness_projection_angle: -45, thickness_projection_enable: false, diffuse: o.shadow.blur, alpha: o.shadow.alpha, distance: o.shadow.dist, content: { render_type: 'solid', solid: { color: ccRgb(o.shadow.color) } }, angle: o.shadow.angle, thickness_projection_distance: 0 }];
      return x; };
    const N = o.text.length, cuts = [0, N]; for (const [a, b] of o.hl || []) cuts.push(a, b); const cs = [...new Set(cuts)].filter(v => v >= 0 && v <= N).sort((a, b) => a - b), styles = [];
    for (let i = 0; i < cs.length - 1; i++) { const a = cs[i], b = cs[i + 1]; if (b <= a) continue; const h = (o.hl || []).find(([x, y]) => a >= x && b <= y); styles.push(st(a, b, h ? h[2] : o.color)); }
    Object.assign(m, { id: ccId(), type: 'text', content: JSON.stringify({ text: o.text, styles }), font_path: fp, font_size: size, text_color: o.color, is_rich_text: (o.hl || []).length > 0, alignment: 1,
      letter_spacing: +((o.ls || 0) / o.px).toFixed(4), line_spacing: +Math.max(-0.5, (o.lh || 1.18) - 1.18).toFixed(3), line_max_width: 0.96,
      has_shadow: !!o.shadow, shadow_color: o.shadow ? o.shadow.color : '', shadow_alpha: o.shadow ? o.shadow.alpha : 0.9, shadow_smoothing: o.shadow ? o.shadow.blur : 0.45, shadow_distance: o.shadow ? o.shadow.dist : 5.0, shadow_angle: o.shadow ? o.shadow.angle : -45.0,
      border_color: o.stroke ? o.stroke.color : '', border_width: o.stroke ? +Math.min(0.2, o.stroke.px / o.px).toFixed(4) : 0.08,
      background_style: o.box ? 1 : 0, background_color: o.box ? o.box.color : '', background_alpha: o.box ? o.box.alpha : 1.0,
      background_round_radius: o.box ? +Math.min(1, o.box.r / Math.max(1, (o.px + 2 * o.box.padY) / 2)).toFixed(4) : 0.0,
      background_width: o.box ? +Math.max(0, o.box.padX / o.px * 0.5).toFixed(4) : 0.14, background_height: o.box ? +Math.max(0, o.box.padY / o.px * 0.5).toFixed(4) : 0.14 });
    m.words = { start_time: [], end_time: [], text: [] }; return add('texts', m);
  };
  const lineText = (lines, upper) => lines.map(l => l.words.map(w => w.t).join(' ')).join('\n');
  // título (un trozo por cada parte en la que cambie de sitio)
  const S0v = S0(), title = $('title').value.trim();
  if (title && !trk.title.hide && !titleIsDefault()) {
    const tt = textTrack(); let last = null;
    for (const p of pieces) {
      const s = p.geo.s, L = p.geo.L, isBox = titleStyle === 'box', size = s.titleSize, lh = size * s.titleLH, padX = isBox ? s.boxPX : 0, padY = isBox ? s.boxPY : 0;
      const real = ctx.font, rls = ctx.letterSpacing; ctx.font = `${s.titleWeight} ${size}px "${s.titleFont}", Inter, sans-serif`; ctx.letterSpacing = (s.tLS || 0) + 'px';
      const maxW = s.titleW > 0 ? Math.max(120, s.titleW) : Math.max(320, W - 140 - padX * 2), lines = []; let gi = 0;
      for (const para of $('title').value.split('\n')) { const ws = para.split(/\s+/).filter(Boolean).map(t => ({ t: s.titleUpper ? t.toLocaleUpperCase('es') : t, red: titleHL.has(gi++) })); if (ws.length) lines.push(...wrapBalanced(ws, maxW).lines); }
      ctx.font = real; ctx.letterSpacing = rls;
      const blockH = (lines.length - 1) * lh + size; let top;
      if (L.split) top = L.seam - blockH / 2; else if (s.titleY >= 0) top = H * s.titleY / 100 - blockH / 2; else { top = Math.max(0, L.video.y) - 34 - blockH - padY; if (top < 150 + padY) top = 150 + padY; }
      top += pos.ty; const cx = W / 2 + pos.tx, cy = top + blockH / 2, sig = [cx, cy, s.titleFont, size, isBox].join();
      const T0 = ccUs(p.T0), du = ccUs(p.b - p.a);
      if (last && last.sig === sig) { last.seg.target_timerange.duration = T0 + du - last.seg.target_timerange.start; continue; }
      const text = lineText(lines), hl = []; let pos2 = 0; for (const l of lines) { for (const w of l.words) { if (w.red) hl.push([pos2, pos2 + w.t.length, s.titleHl]); pos2 += w.t.length + 1; } }
      const k = s.tShadow == null ? 0.6 : s.tShadow;
      const mat = tMat({ text, font: $('titleFont').value, px: size, color: isBox ? s.boxText : s.titleColor, hl, ls: s.tLS, lh: s.titleLH,
        stroke: s.tStrokeW > 0 ? { px: s.tStrokeW, color: s.tStrokeC } : null, shadow: !isBox && k > 0 ? { alpha: +Math.min(1, k * 1.1).toFixed(2), blur: 0.45, dist: 0, angle: -45, color: '#000000' } : null,
        box: isBox ? { color: s.boxColor, alpha: s.boxOp == null ? 1 : s.boxOp, padX, padY, r: s.boxR } : null });
      tSeg(tt, mat, T0, du, cx, cy); last = { sig, seg: tt.segments[tt.segments.length - 1] };
    }
  }
  // subtítulos: uno por frase, en su segundo exacto
  if (captions.length && !trk.caps.hide && !clipMeta.noSubs) {
    const st = textTrack(); let accT = 0;
    for (const g of segs) {
      for (const c of captions) {
        const a = Math.max(c.start, g.s), b = Math.min(c.end, g.e); if (b - a < 0.05) continue;
        const geo = ccGeomAt((a + b) / 2, vw, vh), s = geo.s, L = geo.L, real = ctx.font, rls = ctx.letterSpacing;
        ctx.font = `${s.subItalic ? 'italic ' : ''}${s.subBold ? s.subWeight : 400} ${s.subSize}px "${s.subFont}", Impact, sans-serif`; ctx.letterSpacing = (s.subLS || 0) + 'px';
        const ws = []; for (const w of c.words || []) for (const part of String(w.text || '').split(/\s+/).filter(Boolean)) { const t2 = caseText(cleanWord(part, false), s.subCase); if (t2) ws.push({ t: t2 }); }
        const { lines } = wrapWords(ws, W - 140); ctx.font = real; ctx.letterSpacing = rls; if (!lines.length) continue;
        const A = L.subArea, cy = A.y + A.h * s.subY, cx = W / 2 + pos.sx;
        const mat = tMat({ text: lineText(lines), font: $('subFont').value, px: s.subSize, color: s.subColor, ls: s.subLS, lh: s.subLH,
          stroke: s.strokeOn ? { px: s.subSize * s.strokeW / 100 / 2, color: s.strokeC } : null,
          shadow: s.subShOn && s.shOp > 0 ? { alpha: +Math.min(1, s.shOp).toFixed(2), blur: +Math.min(1, s.shBlur * 2).toFixed(3), dist: +(s.subShD || 0), angle: +(s.subShA || -45), color: s.subShC || '#000000' } : null,
          box: s.subBg && s.subBgOp > 0 ? { color: s.subBgC, alpha: s.subBgOp, padX: s.subSize * s.subBgW / 100, padY: s.subSize * s.subBgH / 100, r: s.subSize * s.subBgR / 100 } : null });
        tSeg(st, mat, ccUs(accT + a - g.s), ccUs(b - a), cx, cy);
      }
      accT += g.e - g.s;
    }
  }
  // 3) logo encima de todo
  if (logo && !trk.logo.hide) {
    try { const bl = await (await fetch(logo.src)).blob(), nm = 'logo.' + ((bl.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')); files[nm] = bl;
      const iw = logo.img.naturalWidth, ih = logo.img.naturalHeight, lw = W * S0v.logoSize, lh = lw * ih / iw, lt = trackOf('video', 2);
      const m = vMat('image', '__CXDIR__/cortex/' + nm, iw, ih, ccCrop({ x: 0, y: 0, w: iw, h: ih }, iw, ih), 0); metaFiles.push({ name: nm, kind: 'photo', w: iw, h: ih });
      vSeg(lt, m, 0, D, 0, Object.assign(ccClipOf({ x: 0, y: 0, w: iw, h: ih }, { x: logoPos.x - lw / 2, y: logoPos.y + logoAuto.dy - lh / 2, w: lw, h: lh }, S0v.logoOp), { rotation: +S0v.logoRot || 0 }), null, 1.0, 50); } catch (e) { console.warn('logo a CapCut', e); }
  }
  // 4) música
  if (music.cur && music.cur.blob) {
    try { const nm = 'musica.' + (((music.cur.name || '').match(/\.(\w{2,4})$/) || [, 'mp3'])[1]); files[nm] = music.cur.blob; metaFiles.push({ name: nm, kind: 'music', dur: ccUs(music.cur.dur || dur) });
      const at = trackOf('audio'), m = ccClone(T.amat); Object.assign(m, { id: ccId(), path: '__CXDIR__/cortex/' + nm, name: nm, duration: ccUs(music.cur.dur || dur), local_material_id: ccId().toLowerCase(), music_id: ccId().toLowerCase() }); add('audios', m);
      const st0 = +$('mStart').value || 0, du = Math.min(D, ccUs(Math.max(0.5, (music.cur.dur || dur) - st0))), refs = [];
      for (const [k, x] of Object.entries(T.arefs)) { const o = ccClone(x); o.id = ccId(); if (k === 'audio_fades') Object.assign(o, { fade_in_duration: ccUs(+$('mFadeIn').value || 0), fade_out_duration: ccUs(+$('mFadeOut').value || 0) }); refs.push(add(k, o)); }
      const g = ccClone(T.aseg); Object.assign(g, { id: ccId(), material_id: m.id, source_timerange: { start: ccUs(st0), duration: du }, target_timerange: { start: 0, duration: du }, volume: +$('mVol').value / 100, extra_material_refs: refs, track_render_index: tracks.indexOf(at) }); at.segments.push(g); } catch (e) { console.warn('música a CapCut', e); }
  }
  draft.tracks = tracks;
  const name = (title || (file.name || 'Clip').replace(/\.[^.]+$/, '')).replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Clip de Cortex';
  return { draft, files, fonts: [...fonts], name, dur: D, metaFiles, blur: blurAny };
}
// se lo manda al grabador, que crea el proyecto en la carpeta de CapCut
async function ccSend(say) {
  say = say || (t => toast(t));
  const dir = await getLiveDir(true); if (!dir) { say('⚠ Para pasar a CapCut, elige antes la carpeta del grabador (En directo → carpeta) y ten abierto «Grabador Clipzi».'); return false; }
  const v = JSON.parse(await rtext(dir, 'descargas/vivo.json') || 'null');
  if (!v || Date.now() / 1000 - v.t > 20) { say('⚠ Abre «Grabador Clipzi.bat» (el grabador) y vuelve a pulsar: es el que crea el proyecto en CapCut.'); return false; }
  if ((v.v || 0) < 26) { say('⚠ El grabador está desactualizado: cierra su ventana y vuelve a abrir «Grabador Clipzi.bat».'); try { await writeGrabadorFiles(); } catch {} return false; }
  say('🎬 Preparando el proyecto de CapCut…');
  const b = await ccBuild(), id = 'c' + Date.now().toString(36), cc = await dir.getDirectoryHandle('capcut', { create: true }), job = await cc.getDirectoryHandle(id, { create: true });
  let n = 0; const names = Object.keys(b.files);
  for (const nm of names) { say(`🎬 Copiando ${nm === names[0] ? 'el vídeo' : nm}… (${++n}/${names.length})`); await wfile(job, nm, b.files[nm]); }
  await wfile(job, 'draft.json', JSON.stringify(b.draft));
  const rq = await cc.getDirectoryHandle('req', { create: true });
  await wfile(rq, id + '.json', JSON.stringify({ name: b.name, fonts: b.fonts, dur: b.dur, files: b.metaFiles }));
  say('🎬 El grabador está creando el proyecto en CapCut…'); const t0 = Date.now(); let o;
  for (;;) { await sleep(800); o = JSON.parse(await rtext(dir, 'capcut/out/' + id + '.json') || 'null'); if (o && o.status !== 'working') break; if (o && o.msg) say('🎬 ' + o.msg); if (Date.now() - t0 > 120000) { say('⚠ El grabador no responde: ¿está abierto?'); return false; } }
  if (o.status === 'error') { say('⚠ ' + (o.error || 'No se pudo crear el proyecto de CapCut')); return false; }
  say(`✅ Listo: abre CapCut y verás «${o.name}» en tus proyectos` + (o.running ? ' (si ya lo tenías abierto, ciérralo y vuelve a abrirlo).' : '.'));
  return true;
}
setTimeout(() => {
  const web = typeof CORTEX_PROXY !== 'undefined' && CORTEX_PROXY;   // en la web no hay grabador
  for (const id of ['seCC', 'ccBtn']) { const b = $(id); if (!b) continue; if (web) { b.hidden = true; continue; }
    b.onclick = async () => { if (b.disabled) return; if (typeof stPend !== 'undefined' && stPend) { toast('Espera a que el clip esté listo'); return; }
      b.disabled = true; const say = t => { if (id === 'seCC' && $('seS')) $('seS').textContent = t; else toast(t); };
      try { await ccSend(say); } catch (e) { console.warn('CapCut', e); say('⚠ No se pudo pasar a CapCut: ' + (e.message || e)); } b.disabled = false; }; }
}, 0);

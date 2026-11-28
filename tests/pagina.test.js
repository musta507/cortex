// Cortex del PC (app-files/Clipzi.html), sin internet: lo que más se ha roto o lo que más importa.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { TMP, PC, tone, reac, check, result, openWithClip } = require('./comun');

const exportBlob = p => p.evaluate(async () => {
  const o = await doExport(); if (!o) return { err: $('eStatus').textContent };
  const u = new Uint8Array(await o.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
  return { b64: btoa(s), mode: o.mode, size: o.blob.size };
});

(async () => {
  console.log('Página (versión del PC)');
  const b = await chromium.launch();
  try {
    // carga
    {
      const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await ctx.route(/^https?:/, r => r.abort());
      await p.goto(PC); await p.waitForTimeout(1500);
      check('carga sin errores y sin internet', !errs.length, errs[0]);
      const fonts = await p.evaluate(async () => { const o = []; for (const f of ['Figtree', 'Inter', 'Montserrat', 'Anton', 'Poppins', 'Bebas Neue', 'Archivo', 'TikTok Sans', 'Cortex Sans']) { const l = await document.fonts.load('700 20px "' + f + '"'); if (!l.length) o.push(f); } return o; });
      check('todas las letras van dentro (sin Google Fonts)', !fonts.length, fonts.join(', '));
      check('lleva su número de versión', await p.evaluate(() => +document.querySelector('meta[name=cortex-build]').content > 0));
      await ctx.close();
    }
    // vista previa: no trabaja en reposo y se pinta cuando algo cambia
    {
      const p = await openWithClip(b); await p.evaluate(() => vid.pause()); await p.waitForTimeout(800);
      const n = await p.evaluate(async () => { let n = 0; const d0 = draw; draw = function (...a) { n++; return d0.apply(this, a); }; await new Promise(r => setTimeout(r, 2000)); draw = d0; return n; });
      check('en pausa casi no repinta (antes 60 veces por segundo)', n <= 8, n + ' veces en 2 s');
      const px = () => p.evaluate(() => { const d = ctx.getImageData(0, 0, W, H).data; let h = 0; for (let i = 0; i < d.length; i += 4099) h = (h * 31 + d[i]) | 0; return h; });
      const a = await px(); await p.evaluate(() => { $('title').value = 'CAMBIO DESDE EL PROGRAMA'; }); await p.waitForTimeout(700);
      check('un cambio hecho por el programa se ve', a !== await px());
      await p.evaluate(() => { vid.currentTime = 4; }); await p.waitForTimeout(700);
      check('un salto en el vídeo se ve', await p.evaluate(() => $('time').textContent.startsWith('00:04')));
      check('sin errores en el editor', !p.errs.length, p.errs[0]);
      await p.context().close();
    }
    // exportar: normal y con el compresor atascado
    {
      const p = await openWithClip(b);
      const r = await exportBlob(p);
      check('exporta un clip', !!r.b64 && r.size > 100000, r.mode || r.err);
      fs.writeFileSync(path.join(TMP, 'export.mp4'), Buffer.from(r.b64 || '', 'base64'));
      await p.context().close();
      const p2 = await openWithClip(b, { init: () => { let n = 0; const of = VideoEncoder.prototype.flush; VideoEncoder.prototype.flush = function () { return ++n === 1 ? new Promise(() => {}) : of.call(this); }; } });
      const t = Date.now(); const r2 = await exportBlob(p2);
      check('si el compresor se atasca, termina con otro intento', !!r2.b64, ((Date.now() - t) / 1000).toFixed(0) + ' s, ' + (r2.mode || r2.err));
      await p2.context().close();
    }
    // palabras malas: silencio corto en el centro de la palabra
    {
      const p = await openWithClip(b);
      await p.evaluate(async () => { setAutoOff(true); await stQuickOpen(true); });
      await p.evaluate(() => { allWords = [{ text: 'hola', start: 1, end: 1.3 }, { text: 'mierda', start: 2.0, end: 2.4 }]; clipMeta.wordMode = 'word'; $('seAdv').open = true; renderFlags(); });
      await p.click('#seFlags .fl-scan'); await p.waitForFunction(() => clipMeta.flagsDone && !flagsMsg, null, { timeout: 30000 });
      await p.evaluate(() => { for (const f of clipMeta.flags) { f.on = true; flagMuteSync(f); } });
      const m = await p.evaluate(() => mutes.map(x => [x.s, x.e]));
      check('encuentra la palabra y la silencia solo por el centro', m.length === 1 && m[0][0] > 2.0 && m[0][1] < 2.4 && m[0][1] - m[0][0] < 0.3, m);
      await p.context().close();
    }
    // plantilla guardada con todo colocado
    {
      const p = await openWithClip(b);
      await p.evaluate(async () => { setAutoOff(true); await stQuickOpen(true); await applyPreset(PRESETS.find(x => x.name === 'Título y subtítulos')); });
      await p.evaluate(() => { setRange('zoom', +$('zoom').value + 25); logoPos.x = 200; logoPos.y = 1500; });
      const snap = () => p.evaluate(() => JSON.stringify([$('zoom').value, Math.round(logoPos.x), Math.round(logoPos.y)]));
      const mine = await snap(); await p.click('#seFmtSave'); await p.waitForTimeout(400);
      await p.evaluate(async () => { await applyPreset(PRESETS.find(x => x.name === 'Podcast')); logoPos.x = 900; await applyPreset(PRESETS.find(x => x.name === 'Título y subtítulos')); });
      check('la plantilla guardada vuelve igual (zoom y logo)', mine === await snap());
      await p.context().close();
    }
    // girar el vídeo: el recorte tapa las esquinas en los dos sentidos
    {
      const p = await openWithClip(b);
      const ok = await p.evaluate(() => { ezPref('antiRot', '1'); const res = []; for (const g of ['1', '3', '-3']) { ezPref('antiRotDeg', g); draw(2, false); const L = lastLayout, v = L.video, pl = rotPlan(v.x, v.y, v.w, v.h, { x: 0, y: 0, w: W, h: H }); const c = Math.cos(pl.th), sn = Math.sin(pl.th); let ok = true; for (const [x, y] of [[pl.C.x, pl.C.y], [pl.C.x + pl.C.w, pl.C.y], [pl.C.x, pl.C.y + pl.C.h], [pl.C.x + pl.C.w, pl.C.y + pl.C.h]]) { const X = x - pl.cx, Y = y - pl.cy; if (Math.abs(X * c + Y * sn) > pl.s * v.w / 2 + 0.01 || Math.abs(-X * sn + Y * c) > pl.s * v.h / 2 + 0.01) ok = false; } res.push(ok); } ezPref('antiRot', '0'); return res; });
      check('girar 1°, 3° y −3° no deja ver esquinas', ok.every(Boolean), ok);
      await p.context().close();
    }
    // varias cámaras: lo que ven en grande y 2–5 cámaras abajo, en tira o arriba
    {
      const p = await openWithClip(b);
      await p.evaluate(async () => { setAutoOff(true); await stQuickOpen(true); await applyPreset(PRESETS.find(x => x.name === 'Varias cámaras')); });
      await p.waitForFunction(() => !$('aiov') || $('aiov').hidden !== false, null, { timeout: 30000 }).catch(() => {}); await p.waitForTimeout(3000);
      const g = await p.evaluate(() => { crops.mcT = [0, 1, 2].map(i => ({ t: { x: 0.2 + 0.22 * i, y: 0.82, w: 0.16, h: 0.16 }, fx: 0.28 + 0.22 * i, fy: 0.9 })); crops.mcC = { x: 0, y: 0, w: 1, h: 0.8 }; mcSet(3, true);
        const o = {}; for (const l of ['A', 'B', 'C']) { mcSetLay(l); draw(1, false); const L = lastLayout; o[l] = { n: 1 + L.more.length, camY: L.ir.y, seam: L.seam }; } return { o, fmt: curFmtOf() }; });
      check('varias cámaras: 3 cámaras abajo, en tira y arriba', g.fmt === 'varias' && ['A', 'B', 'C'].every(l => g.o[l].n === 3) && g.o.A.camY > 800 && g.o.B.camY > g.o.A.camY && g.o.C.camY === 0, g);
      await p.evaluate(() => { mcSetLay('A'); mcSet(5, true); });
      check('con 5 cámaras salen 5', await p.evaluate(() => { draw(1, false); return 1 + lastLayout.more.length; }) === 5);
      const r = await exportBlob(p);
      check('exporta con varias cámaras', !!r.b64, r.mode || r.err);
      check('sin errores con varias cámaras', !p.errs.length, p.errs[0]);
      await p.context().close();
    }
    // un solo espacio: los antiguos clientes se juntan sin perder clips ni plantillas
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await ctx.route(/^https?:/, r => r.abort()); await p.goto(PC); await p.waitForTimeout(1200);
      await p.evaluate(async () => {
        await kv.set('clients', [{ id: 'ca', name: 'Pablo' }, { id: 'cb', name: 'Arz', tg: 'ca' }, { id: 'cw', name: 'WestCOL' }]);
        await kv.set('projects', [{ id: 'p1', client: 'cw', name: 'w1', time: 3 }, { id: 'p2', client: 'cw', name: 'w2', time: 2 }, { id: 'p3', client: 'ca', name: 'pablo1', time: 1 }]);
        await kv.set('tplg:cw', { overrides: { Podcast: { c: { zoom: '120' } } }, templates: { 'Mía': { c: { zoom: '111' } } } });
        await kv.set('tplg:ca', { overrides: { Podcast: { c: { zoom: '150' } } }, templates: { 'Mía': { c: { zoom: '199' } }, Otra: { c: { zoom: '101' } } } });
        await kv.set('client:ca', { live: { kick: 'pablo', clippers: '', ai: false } });
        await kv.del('mig-un-espacio'); await kv.set('mig-link-pablo-arz', 1);
      });
      await p.reload(); await p.waitForTimeout(2200);
      const o = await p.evaluate(() => ({ main: clients[0].name, cur: curClient, clips: $('recents').querySelectorAll('.rcard').length - 1, tpl: Object.keys(templates).sort(), ov: presetOverrides.Podcast.c.zoom, lista: !$('homeClients').hidden, grupos: new Set(clients.map(c => groupOf(c.id))).size }));
      check('sin clientes: todos los clips juntos y un solo juego de plantillas', o.main === 'WestCOL' && o.cur === 'cw' && o.clips === 3 && !o.lista && o.grupos === 1 && o.ov === '120' && ['Mía', 'Mía · Pablo', 'Otra', 'Podcast · Pablo'].every(n => o.tpl.includes(n)), o);
      await p.click('#hnav .hi[data-sec=ajustes]'); await p.waitForTimeout(700);
      check('los canales de Kick están en Ajustes', await p.evaluate(() => [...$('lvChans').querySelectorAll('.lv-chip')].map(x => x.textContent).join('|')).then(t => t.includes('westcol') && t.includes('pablo')));
      await p.click('#hnav .hi[data-sec=reacciones]'); await p.waitForTimeout(400);
      check('Marca tiene las fuentes y los logos; el agente enseña primero la acción', await p.evaluate(() => { setHomeSec('marca'); const m = !$('fnBox').closest('.hsec').hidden && $('lgBox').closest('.hsec').dataset.sec === 'marca'; setHomeSec('agente'); return m && !$('agCfg').open && $('agRun').offsetParent !== null; }));
      await p.click('#hnav .hi[data-sec=reacciones]'); await p.waitForTimeout(300);
      check('Reacciones es una sección del menú', await p.evaluate(() => !$('rxHome').closest('.hsec').hidden && !!$('rxHome').querySelector('#rxAdd')));
      await p.evaluate(() => setHomeSec('inicio')); await p.keyboard.press('Control+k'); await p.keyboard.type('pablo1'); await p.waitForTimeout(300);
      const found = await p.evaluate(() => [...document.querySelectorAll('.cmdk-i')].map(x => x.textContent).join('|'));
      await p.keyboard.press('Escape'); await p.keyboard.press('Control+k'); await p.keyboard.type('reaccion'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      check('el buscador (Ctrl+K) encuentra clips y lleva a las secciones', found.includes('pablo1') && await p.evaluate(() => homeSec === 'reacciones' && $('cmdk').hidden), found);
      await p.click('#hnav .hi[data-sec=ajustes]'); await p.fill('#setGem', 'CLAVE-DE-PRUEBA');
      check('Ajustes: la clave puesta ahí vale para toda la app', await p.evaluate(() => getGemKey() === 'CLAVE-DE-PRUEBA' && $('gemKey').value === 'CLAVE-DE-PRUEBA' && /puesta/.test($('setGemSt').textContent)));
      await p.evaluate(() => localStorage.removeItem('clipzi-gemini'));
      await p.click('#hnav .hmin'); check('el menú se encoge y se recuerda', await p.evaluate(() => $('home').classList.contains('navmin') && localStorage.getItem('cortex-navmin') === '1'));
      check('sin errores al juntar', !errs.length, errs[0]);
      await ctx.close();
    }
    // «¿A quién clipeas hoy?»: buscar un streamer, ver quién está en directo y entrar en su panel
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await ctx.route(/^https?:/, r => r.abort()); await p.goto(PC); await p.waitForTimeout(1200);
      await p.evaluate(() => { const mk = (slug, v, cat) => ({ slug, name: slug, live: true, viewers: v, title: 't', cat, started: new Date(Date.now() - 6e5).toISOString() });
        const L = [mk('westcol', 48200, 'Just Chatting'), mk('spreen', 18400, 'Minecraft'), mk('roshtein', 12200, 'Slots')];
        ksAsk = async q => q.kind === 'live' ? { items: L } : q.kind === 'canales' ? { items: q.slugs.map(s => L.find(x => x.slug === s) || { slug: s, name: s, live: false, viewers: 0 }) } : { items: L.filter(x => x.slug.includes(lvSlug(q.q))) };
        openLive = async () => { window.__opened = 1; }; });
      await p.click('#hnav .hi[data-sec=directo]'); await p.waitForTimeout(500);
      const v = await p.evaluate(() => ({ live: $('lsLive').children.length, cats: $('lsCats').children.length, home: !$('home').hidden }));
      await p.click('#lsQ'); await p.keyboard.type('spr'); await p.waitForTimeout(500); const dd = await p.evaluate(() => $('lsDd').hidden ? '' : $('lsDd').textContent);
      await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      const r = await p.evaluate(async () => [window.__opened, lvFocus, (await lsMineSlugs()).includes('spreen')]);
      check('«¿A quién clipeas hoy?»: lista de directos, buscador y entrar en el panel', v.live === 3 && v.cats === 4 && v.home && /spreen/.test(dd) && r[0] === 1 && r[1] === 'spreen' && r[2], { v, dd: dd.slice(0, 60), r });
      check('sin errores en «¿A quién clipeas hoy?»', !errs.length, errs[0]);
      await ctx.close();
    }
    // iconos en vez de emojis (sin tocar lo que escribe la gente)
    {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await ctx.route(/^https?:/, r => r.abort()); await p.goto(PC); await p.waitForTimeout(1200);
      const r = await p.evaluate(async () => {
        const seen = []; for (const s of ['inicio', 'plantillas', 'marca', 'agente', 'viral', 'ajustes']) { setHomeSec(s); await new Promise(r => setTimeout(r, 150));
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const e = n.parentElement; if (e && IC_RE.test(n.data) && e.getClientRects().length && !e.closest(IC_SKIP)) seen.push(n.data.trim().slice(0, 30)); } }
        const d = document.createElement('div'); d.innerHTML = '<button>🗑️ Borrar</button><span class="rinfo"><strong>🔥 MI TÍTULO</strong></span><select><option>⚡ Rápida</option></select>'; document.body.append(d); await new Promise(r => setTimeout(r, 30));
        const out = { seen, btn: d.querySelector('button').innerHTML.startsWith('<svg'), user: d.querySelector('strong').textContent === '🔥 MI TÍTULO', opt: d.querySelector('option').textContent === 'Rápida' }; d.remove(); return out; });
      check('sin emojis en la interfaz (iconos), pero los títulos de la gente intactos', !r.seen.length && r.btn && r.user && r.opt, r);
      check('sin errores con los iconos', !errs.length, errs[0]);
      await ctx.close();
    }
    // cambiar de formato: al volver a uno ya visto no se busca otra vez
    {
      const p = await openWithClip(b);
      await p.evaluate(async () => { setAutoOff(true); await stQuickOpen(true); });
      const r = await p.evaluate(async () => { await ezSetFormat('varias'); crops.cam.x = 0.123; let n = 0; const d0 = mcDetect; mcDetect = async () => { n++; return d0(); }; await ezSetFormat('horizontal'); const t = performance.now(); await ezSetFormat('varias'); return { n, ms: Math.round(performance.now() - t), x: crops.cam.x, fmt: curFmtOf() }; });
      check('volver a un formato es inmediato y conserva tus ajustes', r.n === 0 && r.ms < 1500 && r.x === 0.123 && r.fmt === 'varias', r);
      await p.context().close();
    }
    // vídeo de abajo (biblioteca de reacciones)
    {
      const p = await openWithClip(b);
      await p.evaluate(async () => { setAutoOff(true); await stQuickOpen(true); });
      const ok = await p.evaluate(async (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return rxUse(new File([u], 'reaccion.mp4', { type: 'video/mp4' }), 'reaccion'); }, fs.readFileSync(reac()).toString('base64')).catch(e => 'ERROR ' + e.message);
      check('pone un vídeo abajo en Pantalla dividida', ok === true && await p.evaluate(() => layoutMode === 'split' && img === rxVid), ok);
      const r = await exportBlob(p);
      check('exporta con el vídeo de abajo', !!r.b64, r.mode || r.err);
      await p.context().close();
    }
    // directo: columna del chat con dos canales
    {
      const ctx = await b.newContext({ viewport: { width: 1500, height: 860 } }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await ctx.route(/^https?:/, r => r.abort()); await p.goto(PC); await p.waitForTimeout(1200);
      await p.evaluate(() => { $('home').hidden = true; $('livePage').hidden = false; ezPref('critOff', '[]'); ezPref('chatHide', '[]');
        window.__f = { a: '', b: '' }; const mk = k => ({ getFileHandle: async n => { if (n !== 'chat.jsonl') throw new Error('no'); return { getFile: async () => new File([window.__f[k]], 'chat.jsonl') }; }, getDirectoryHandle: async () => { throw new Error('no'); } });
        const now = Date.now() / 1000; liveSessions = { w: { name: 'w', h: mk('a'), on: true, segs: [], status: { slug: 'westcol', started: now - 600, updated: now } }, x: { name: 'x', h: mk('b'), on: true, segs: [], status: { slug: 'otro', started: now - 500, updated: now } } };
        for (let i = 0; i < 260; i++) window.__f[i % 3 ? 'a' : 'b'] += JSON.stringify({ t: now - 260 + i, u: 'u' + (i % 9), m: i === 259 ? 'hola [emote:1:KEKW]' : 'mensaje ' + i }) + '\n'; });
      await p.click('#lvChatB'); await p.waitForTimeout(2200);
      const c = await p.evaluate(() => ({ filas: $('lcList').children.length, chips: $('lcCh').children.length, emote: !!$('lcList').lastChild.querySelector('img,.lc-e') || /KEKW/.test($('lcList').lastChild.textContent) }));
      check('el chat de dos canales sale en una columna (máximo 100)', c.filas === 100 && c.chips === 2 && c.emote, c);
      const cb = await p.evaluate(() => { liveWant = ['westcol', 'otro']; liveRender(); const chips = [...document.querySelectorAll('.lv-cbar .lv-chip')]; const o = chips.find(b => b.classList.contains('live') && !b.classList.contains('on')); const want = o.querySelector('span').textContent; o.click(); return [chips.filter(b => b.classList.contains('live')).length, lvTrSess().status.slug === want, !!document.querySelector('.lv-cbar .add')]; });
      check('barra de canales: se ve quién está en directo y se elige cuál seguir', cb[0] === 2 && cb[1] && cb[2], cb);
      const md = await p.evaluate(() => { $('lvModeSt').click(); const a = stOn() && $('livePage').classList.contains('stage'); $('lvModeTr').click(); return [a, !stOn(), $('lvModeSt').textContent.includes('Manual'), $('lvModeTr').textContent.includes('Con IA'), getComputedStyle($('lvTrBox')).display === 'none', lvTrOn() === false]; });
      check('directo: Manual (la pantalla) y Con IA (los momentos), sin transcripción', md.every(Boolean), md);
      const ia = await p.evaluate(async () => { localStorage.setItem('clipzi-gemini', 'x'); lvFocusSet('westcol'); $('lvModeTr').click(); await lvIaBar(); const hid = getComputedStyle($('lvCrit')).display === 'none' && getComputedStyle($('lvAuto')).display === 'none';
        const b = [...$('lvIa').querySelectorAll('button')].find(x => /escuche/.test(x.textContent)); b.click(); await new Promise(r => setTimeout(r, 400)); const on = (await getLive(await lvClientOf('westcol'))).ai;
        ezPref('lvExtra', '1'); lvSoloSync(); const back = getComputedStyle($('lvCrit')).display !== 'none'; ezPref('lvExtra', '0'); lvSoloSync(); localStorage.removeItem('clipzi-gemini'); return [hid, on, back]; });
      check('Con IA: solo lo de la IA (lo demás escondido) y se enciende desde ahí', ia.every(Boolean), ia);
      check('sin errores en el directo', !errs.length, errs[0]);
      await ctx.close();
    }
  } finally { await b.close(); }
  const r = result(); console.log(`  ${r.oks} bien, ${r.fails} mal`); process.exit(r.fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

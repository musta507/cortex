// La versión web (public/index.html) servida por el servidor: entra un clipper, carga sin errores y la vista previa descansa.
const { chromium } = require('playwright'), { spawn } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const { ROOT, check, result } = require('./comun');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-datos-')); process.env.DATA_DIR = DATA;
const PORT = 4060 + Math.floor(Math.random() * 50), U = 'http://localhost:' + PORT;
(async () => {
  console.log('Web');
  require(path.join(ROOT, 'cuentas')).addUser('prueba', 'clave1234'); await new Promise(r => setTimeout(r, 700));
  const srv = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT, YTDLP: 'true' }, stdio: 'ignore' });
  const b = await chromium.launch();
  try {
    await new Promise(r => setTimeout(r, 1500));
    for (const [nm, vp] of [['PC', { width: 1440, height: 900 }], ['móvil', { width: 390, height: 844 }]]) {
      const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
      await p.goto(U + '/'); await p.fill('#p', 'clave1234'); await Promise.all([p.waitForNavigation(), p.click('button')]); await p.waitForTimeout(2500);
      const m = await p.evaluate(() => ({ dom: document.getElementsByTagName('*').length, ancho: document.documentElement.scrollWidth, vw: innerWidth }));
      check(`${nm}: entra y carga sin errores`, !errs.length && m.dom > 1000, errs[0]);
      check(`${nm}: sin desplazamiento de lado`, m.ancho <= m.vw, m);
      await ctx.close();
    }
  } finally { await b.close(); srv.kill(); }
  const r = result(); console.log(`  ${r.oks} bien, ${r.fails} mal`); process.exit(r.fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

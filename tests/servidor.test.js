// El servidor de la web: contraseñas, límites de la IA, caché de la página, panel y actualizaciones de la app.
const { spawn } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const { ROOT, check, result } = require('./comun');
const PORT = 3990 + Math.floor(Math.random() * 50), U = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-datos-'));
process.env.DATA_DIR = DATA;   // las cuentas de prueba van a una carpeta aparte (nunca a las de verdad)
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Servidor');
  const K = require(path.join(ROOT, 'cuentas'));   // (usa DATA_DIR)
  check('no deja crear contraseñas de menos de 8', /8 caracteres/.test(K.addUser('corto', '1234')));
  check('crea un clipper con contraseña larga', K.addUser('prueba', 'clave1234') === '');
  await wait(700);
  const env = { ...process.env, DATA_DIR: DATA, PORT, YTDLP: 'true', GEMINI_KEY: 'x', ELEVENLABS_KEY: 'y', MIN_VOZ_POR_PERSONA: '2', ADMIN_PASSWORD: 'panel-prueba-123' };
  const srv = spawn('node', [path.join(ROOT, 'server.js')], { env, stdio: 'ignore' });
  try {
    await wait(1500);
    const post = (p, body, h = {}) => fetch(U + p, { method: 'POST', body, redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...h } });
    let last = 0;
    for (let i = 0; i < 22; i++) last = (await post('/entrar', 'pass=mala' + i, { 'X-Forwarded-For': '1.2.3.' + i, 'X-Real-IP': '5.5.5.' + i })).status;
    check('bloquea tras 20 intentos aunque se inventen direcciones', last === 429, last);
    srv.kill(); await wait(300);
    const srv2 = spawn('node', [path.join(ROOT, 'server.js')], { env, stdio: 'ignore' }); await wait(1500);
    try {
      const r = await post('/entrar', 'pass=clave1234'); const ck = (r.headers.get('set-cookie') || '').split(';')[0];
      check('entra con su contraseña', r.status === 303 && ck.startsWith('cx='));
      const p1 = await fetch(U + '/', { headers: { Cookie: ck } });
      const tag = p1.headers.get('etag');
      check('la página lleva protección contra meterla en otra web', p1.headers.get('x-frame-options') === 'DENY');
      const p2 = await fetch(U + '/', { headers: { Cookie: ck, 'If-None-Match': tag } });
      check('la segunda visita no vuelve a bajar la página', p2.status === 304, p2.status);
      const h = { Cookie: ck, Origin: U, 'Content-Type': 'application/json' };
      const g = await fetch(U + '/api/gemini/gemini-3.1-pro-preview', { method: 'POST', headers: h, body: '{"contents":[]}' });
      check('un modelo caro de la IA se contesta como «no existe»', g.status === 404, g.status);
      const n = 16000 * 2 * 180, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
      const v = await fetch(U + '/api/voz', { method: 'POST', headers: { ...h, 'Content-Type': 'audio/wav' }, body: b });
      check('los subtítulos tienen tope de minutos por persona', v.status === 429, v.status);
      check('/healthz no enseña datos internos', JSON.stringify(await (await fetch(U + '/healthz')).json()) === '{"ok":true}');
      check('las actualizaciones de la app piden su clave', (await fetch(U + '/app/version.json')).status === 404);
      const vj = await fetch(U + '/app/version.json', { headers: { 'x-cortex-app': 'cortex-app-7f3c91d2a8' } });
      const vv = vj.ok ? await vj.json() : {};
      check('la app ve la versión nueva de Cortex y del grabador', vv.html && vv.html.build > 0 && vv.grabador && vv.grabador.version > 0, vv.html && { cortex: vv.html.build, grabador: vv.grabador.version });
      const a = await post('/panel/entrar', 'pass=panel-prueba-123'); const ack = (a.headers.get('set-cookie') || '').split(';')[0];
      check('el panel entra con su contraseña', a.status === 303 && (await fetch(U + '/api/admin/resumen', { headers: { Cookie: ack } })).status === 200);
    } finally { srv2.kill(); }
    const srv3 = spawn('node', [path.join(ROOT, 'server.js')], { env: { ...env, ADMIN_PASSWORD: 'otra-clave-456' }, stdio: 'ignore' }); await wait(1500);
    try {
      // sesión hecha con la contraseña vieja del panel → no vale con la nueva
      const K2 = require(path.join(ROOT, 'cuentas')); const old = K2.makeCookie('a', 'admin', 14, K2.adminVer('panel-prueba-123'));
      check('cambiar la contraseña del panel cierra las sesiones viejas', (await fetch(U + '/api/admin/resumen', { headers: { Cookie: 'cxa=' + old } })).status === 401);
    } finally { srv3.kill(); }
  } finally { try { srv.kill(); } catch {} }
  const r = result(); console.log(`  ${r.oks} bien, ${r.fails} mal`); process.exit(r.fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

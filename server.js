// Cortex · versión de prueba en la web.
// Sirve la página (solo a quien tiene contraseña), hace de puente con Gemini (la clave vive solo aquí, variable GEMINI_KEY),
// descarga vídeos por enlace y guarda los clips que exporta cada clipper para verlos en /panel.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os'), { spawn } = require('child_process');

const K = require('./cuentas');
const KEY = (process.env.GEMINI_KEY || '').trim();
const ADMIN = (process.env.ADMIN_PASSWORD || '').trim();
const PORT = process.env.PORT || 3000;
const PER_IP = +process.env.LIMITE_POR_PERSONA || 150;   // peticiones a la IA por persona y día
const TOTAL = +process.env.LIMITE_TOTAL || 5000;          // peticiones a la IA de todos, por día
const MAX_BODY = 32 * 1024 * 1024;
const DL_PER_IP = +process.env.DESCARGAS_POR_PERSONA || 40;   // enlaces por persona y día
const DL_AT_ONCE = +process.env.DESCARGAS_A_LA_VEZ || 3;      // descargas a la vez en el servidor
const DL_MAX_MIN = +process.env.MINUTOS_MAX || 15;            // duración máxima del vídeo del enlace
const YTDLP = (process.env.YTDLP || 'python3 -m yt_dlp').split(' ');
const TMP = path.join(os.tmpdir(), 'cortex-dl'); fs.mkdirSync(TMP, { recursive: true });

const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const pageGz = zlib.gzipSync(page, { level: 9 });
const panelPage = fs.readFileSync(path.join(__dirname, 'public', 'panel.html'));
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function loginPage(o) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap">
<style>:root{color-scheme:dark}*{box-sizing:border-box}html{-webkit-font-smoothing:antialiased}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(900px 520px at 50% -10%,rgba(59,110,246,.2),transparent 70%),radial-gradient(600px 400px at 100% 100%,rgba(110,151,255,.08),transparent 70%),#08080A;font:15px/1.5 Figtree,system-ui,-apple-system,"Segoe UI",sans-serif;color:#F5F5F7;padding:16px;overflow:hidden}
body::before{content:"";position:fixed;width:520px;height:520px;border-radius:50%;background:radial-gradient(closest-side,rgba(110,151,255,.14),transparent);top:-160px;left:50%;margin-left:-260px;animation:f 10s ease-in-out infinite;pointer-events:none}
@keyframes f{0%,100%{transform:translate(0,0)}50%{transform:translate(-60px,40px)}}
@keyframes up{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes sh{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
.c{position:relative;width:min(410px,100%);background:rgba(20,20,24,.72);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:32px 28px;box-shadow:0 40px 100px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);animation:up .5s cubic-bezier(.2,.8,.2,1) backwards}
.b{display:flex;align-items:center;gap:11px;font-weight:800;font-size:21px;letter-spacing:-.3px;margin-bottom:22px}.b i{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#fff 30%,#8FB1FF);color:#08080A;font-style:normal;font-size:14px;box-shadow:0 8px 22px rgba(110,151,255,.35)}
h1{font-size:24px;letter-spacing:-.5px;margin:0 0 6px}p{color:#A1A1AA;margin:0 0 20px;font-size:14px}label{display:block;font-size:13px;font-weight:700;color:#D4D4D8;margin-bottom:7px}
input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.4);color:#fff;font-size:16px;outline:none;transition:border-color .15s,box-shadow .2s}input:focus{border-color:rgba(110,151,255,.75);box-shadow:0 0 0 3px rgba(110,151,255,.25)}
button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:12px;background:#fff;color:#08080A;font:800 15px Figtree,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(255,255,255,.08);transition:transform .1s,box-shadow .2s}button:hover{box-shadow:0 10px 30px rgba(157,187,255,.3)}button:active{transform:scale(.98)}
.e{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.4);color:#FCA5A5;padding:10px 12px;border-radius:12px;font-size:13px;margin-bottom:16px;animation:sh .45s}.n{margin-top:18px;font-size:12px;color:#71717A}
@media (prefers-reduced-motion:reduce){*,*::before{animation:none!important}}</style></head>
<body><form class="c" method="post" action="${o.action}"><div class="b"><i>▶</i>Cortex</div><h1>${esc(o.h)}</h1><p>${esc(o.sub)}</p>${o.msg ? `<div class="e">${esc(o.msg)}</div>` : ''}
<label for="p">Contraseña</label><input id="p" name="pass" type="password" autocomplete="current-password" autofocus required><button>Entrar</button>${o.note ? `<div class="n">${esc(o.note)}</div>` : ''}</form></body></html>`;
}
const USER_LOGIN = msg => loginPage({ title: 'Entrar · Cortex', action: '/entrar', h: 'Versión de prueba', sub: 'Escribe la contraseña que te hemos dado para entrar.', msg, note: 'Los clips que exportes se guardan en tu cuenta para que podamos revisarlos y mejorar Cortex.' });
const ADMIN_LOGIN = msg => K.adminSet(ADMIN) ? loginPage({ title: 'Panel · Cortex', action: '/panel/entrar', h: 'Panel', sub: 'Contraseña de administrador.', msg })
  : loginPage({ title: 'Panel · Cortex', action: '/panel/crear', h: 'Crea la contraseña del panel', sub: 'Es la primera vez que entras: elige tu contraseña de administrador (mínimo 6 caracteres). Solo tú podrás entrar al panel con ella.', msg,
      note: K.DATA.startsWith('/app') ? '⚠ Aún no hay volumen en Railway: si la web se actualiza, esta contraseña y los clippers se borrarán. Añade un volumen en /data.' : '' });
const tries = new Map();
function tooMany(ip) { const now = Date.now(), t = (tries.get(ip) || []).filter(x => now - x < 15 * 60000); tries.set(ip, t); return t.length >= 20; }
const html = (res, code, body, extra) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) }); res.end(body); };
const go = (res, to, extra) => { res.writeHead(303, { Location: to, ...(extra || {}) }); res.end(); };
async function readBody(req, max) { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > max) throw new Error('grande'); ch.push(c); } return Buffer.concat(ch).toString('utf8'); }
const formPass = b => new URLSearchParams(b).get('pass') || '';

const iaErrs = []; const iaErr = (m, txt) => { iaErrs.push({ at: Date.now(), modelo: m, error: String(txt).replace(/AIza[\w-]{20,}/g, '…').slice(0, 300) }); if (iaErrs.length > 20) iaErrs.shift(); };
let day = '', total = 0, perIp = new Map(), dlIp = new Map();
function rollDay() { const d = new Date().toISOString().slice(0, 10); if (d !== day) { day = d; total = 0; perIp = new Map(); dlIp = new Map(); } }
function quota(ip) {
  rollDay();
  const n = perIp.get(ip) || 0;
  if (total >= TOTAL) return 'Cortex ha llegado al límite de uso de hoy. Vuelve mañana.';
  if (n >= PER_IP) return 'Has llegado al límite gratis de hoy. Vuelve mañana.';
  perIp.set(ip, n + 1); total++;
  return '';
}
function dlQuota(ip) {
  rollDay();
  const n = dlIp.get(ip) || 0; if (n >= DL_PER_IP) return 'Has llegado al límite de enlaces de hoy. Vuelve mañana o sube el vídeo desde tu ordenador.';
  dlIp.set(ip, n + 1); return '';
}
// ---------- descargar un clip por enlace (Kick, Twitch, YouTube, TikTok…) con yt-dlp ----------
const jobs = new Map(); let running = 0; const queue = [];
function badHost(u) {
  let h; try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return true; h = x.hostname.toLowerCase(); } catch { return true; }
  return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(':') || /^\d+$/.test(h) || h.endsWith('railway.app');
}
function runJob(job) {
  running++; job.status = 'downloading';
  const out = path.join(TMP, job.id + '.%(ext)s');
  const args = [...YTDLP.slice(1), '--no-playlist', '--newline', '--no-part', '--no-mtime', '--restrict-filenames',
    '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format', 'mp4', '--max-filesize', '700M',
    '--print', 'before_dl:TITLE:%(title)s', '--print', 'after_move:FILE:%(filepath)s', '--no-simulate', '-o', out];
  if (job.from != null && job.to != null) args.push('--download-sections', `*${job.from}-${job.to}`, '--force-keyframes-at-cuts');
  if (job.imp) args.unshift('--impersonate', 'chrome');
  args.push('--', job.url);
  const p = spawn(YTDLP[0], args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '', stop = setTimeout(() => { job.why = 'tardó demasiado'; p.kill('SIGKILL'); }, 6 * 60000);
  p.stdout.on('data', d => { for (const l of String(d).split('\n')) {
    let m; if ((m = l.match(/^TITLE:(.*)$/))) job.title = m[1].trim();
    else if ((m = l.match(/^FILE:(.*)$/))) job.file = m[1].trim();
    else if ((m = l.match(/\[download\]\s+([\d.]+)%/))) job.p = Math.min(0.99, +m[1] / 100);
  } });
  p.stderr.on('data', d => { err = (err + d).slice(-4000); });
  p.on('close', code => {
    clearTimeout(stop); running--;
    if (code !== 0 && !job.imp && /impersonat|cloudflare|403|forbidden/i.test(err) && !job.retried) { job.retried = true; job.imp = true; job.p = 0; queue.unshift(job); return next(); }
    if (code === 0 && job.file && fs.existsSync(job.file)) { job.status = 'done'; job.p = 1; job.size = fs.statSync(job.file).size; }
    else {
      job.status = 'error'; const e = (err.match(/ERROR:.*$/m) || [''])[0];
      job.error = job.why ? 'La descarga ' + job.why + ' (¿es un directo entero? Pega el enlace de un clip).' : /File is larger|max-filesize/i.test(err) ? 'El vídeo es demasiado grande.' : /Unsupported URL|is not a valid URL/i.test(err) ? 'Ese enlace no es de un vídeo que pueda abrir.' : /private|login|sign in|cookies/i.test(err) ? 'Ese vídeo es privado o pide iniciar sesión.' : /404|not found|does not exist/i.test(err) ? 'No encuentro ese vídeo: ¿el enlace está bien?' : 'No se pudo descargar' + (e ? ': ' + e.replace(/^ERROR:\s*/, '').slice(0, 160) : '.');
      console.warn('descarga fallida', job.url, err.slice(-500));
    }
    next();
  });
}
function next() { while (running < DL_AT_ONCE && queue.length) runJob(queue.shift()); }
// limpieza: los vídeos descargados se borran a los 20 min (o al entregarlos)
setInterval(() => { const now = Date.now(); for (const [id, j] of jobs) if (now - j.at > 20 * 60000) { if (j.file) fs.rm(j.file, () => {}); jobs.delete(id); } }, 60000);
// yt-dlp al día (las webs cambian a menudo)
if (!process.env.YTDLP) { const u = spawn('python3', ['-m', 'pip', 'install', '-q', '-U', '--break-system-packages', 'yt-dlp'], { stdio: 'ignore' }); u.on('error', () => {}); }

const json = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(b); };
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
// solo se atienden peticiones hechas desde la propia página (no desde otras webs)
function sameSite(req) {
  const host = req.headers.host || '', from = req.headers.origin || req.headers.referer || '';
  try { return !!from && new URL(from).host === host; } catch { return false; }
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    // ---------- entrar / salir ----------
    if (req.method === 'POST' && url.pathname === '/entrar') {
      const ip = ipOf(req); if (tooMany(ip)) return html(res, 429, USER_LOGIN('Demasiados intentos. Espera unos minutos.'));
      const u = K.findByPass(formPass(await readBody(req, 2000)));
      if (!u) { tries.get(ip).push(Date.now()); return html(res, 401, USER_LOGIN('Esa contraseña no es correcta.')); }
      return go(res, '/', { 'Set-Cookie': K.cookieHeader(req, 'cx', K.makeCookie('u', u.name, 60, u.ver), 60) });
    }
    if (url.pathname === '/salir') return go(res, '/', { 'Set-Cookie': K.cookieHeader(req, 'cx', '', 0) });
    if (req.method === 'GET' && url.pathname === '/api/yo') { const u = K.sessionUser(req); return json(res, u ? 200 : 401, { name: u ? u.name : '' }); }
    // ---------- panel ----------
    if (req.method === 'POST' && url.pathname === '/panel/entrar') {
      const ip = ipOf(req); if (tooMany(ip)) return html(res, 429, ADMIN_LOGIN('Demasiados intentos. Espera unos minutos.'));
      const p = formPass(await readBody(req, 2000));
      if (!K.adminOk(p, ADMIN)) { tries.get(ip).push(Date.now()); return html(res, 401, ADMIN_LOGIN('Contraseña incorrecta.')); }
      return go(res, '/panel', { 'Set-Cookie': K.cookieHeader(req, 'cxa', K.makeCookie('a', 'admin', 14), 14) });
    }
    if (req.method === 'POST' && url.pathname === '/panel/crear') {
      if (K.adminSet(ADMIN)) return go(res, '/panel');
      const p = formPass(await readBody(req, 2000)).trim();
      if (p.length < 6) return html(res, 400, ADMIN_LOGIN('Pon al menos 6 caracteres.'));
      K.adminCreate(p);
      return go(res, '/panel', { 'Set-Cookie': K.cookieHeader(req, 'cxa', K.makeCookie('a', 'admin', 14), 14) });
    }
    if (url.pathname === '/panel/salir') return go(res, '/panel', { 'Set-Cookie': K.cookieHeader(req, 'cxa', '', 0) });
    if (req.method === 'GET' && url.pathname === '/panel') return K.isAdmin(req) ? html(res, 200, panelPage) : html(res, 200, ADMIN_LOGIN());
    if (url.pathname.startsWith('/api/admin/')) {
      if (!K.isAdmin(req)) return json(res, 401, { error: 'Entra en el panel.' });
      if (req.method !== 'GET' && !sameSite(req)) return json(res, 403, { error: 'origen no permitido' });
      const p = url.pathname.slice(11);
      if (req.method === 'GET' && p === 'resumen') return json(res, 200, { users: K.stats(), hoy: total });
      // probar la IA desde el panel: dice si la clave funciona y, si no, por qué
      if (req.method === 'GET' && p === 'ia') {
        if (!KEY) return json(res, 200, { ok: false, msg: 'Falta la variable GEMINI_KEY en Railway.' });
        const out = [];
        for (const mod of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']) {
          try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mod}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Responde solo: ok' }] }] }), signal: AbortSignal.timeout(20000) });
            const t = await r.text(); let msg = ''; try { msg = (JSON.parse(t).error || {}).message || ''; } catch {}
            out.push({ modelo: mod, estado: r.status, ok: r.ok, error: msg.replace(/AIza[\w-]{20,}/g, '…').slice(0, 300) });
            if (r.ok) break;
          } catch (e) { out.push({ modelo: mod, ok: false, error: String(e.message || e) }); }
        }
        const good = out.some(x => x.ok);
        return json(res, 200, { ok: good, pruebas: out, errores_recientes: iaErrs.slice(-8).reverse(), clave: KEY.slice(0, 4) + '…' + KEY.slice(-4) + ` (${KEY.length} caracteres)` });
      }
      if (req.method === 'GET' && p === 'sugerencias') return json(res, 200, { sugerencias: K.suggestions() });
      if (req.method === 'POST' && p === 'sugerencia') { let b; try { b = JSON.parse(await readBody(req, 4000)); } catch { return json(res, 400, { error: 'petición no válida' }); } return json(res, K.suggestionSet(b.id, b) ? 200 : 404, { ok: true }); }
      let sm = p.match(/^sugerencia\/([\w-]{6,30})\.jpg$/);
      if (req.method === 'GET' && sm) { const f = K.suggestionImg(sm[1]); if (!fs.existsSync(f)) return json(res, 404, { error: 'no está' }); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }); return fs.createReadStream(f).pipe(res); }
      if (req.method === 'GET' && p === 'proyectos') return json(res, 200, { proyectos: K.projects(url.searchParams.get('user') || '') });
      if (req.method === 'POST' && p === 'clippers') { let b; try { b = JSON.parse(await readBody(req, 4000)); } catch { return json(res, 400, { error: 'petición no válida' }); } const e = K.addUser(b.name, b.pass); return json(res, e ? 400 : 200, e ? { error: e } : { ok: true }); }
      if (req.method === 'POST' && p === 'contrasena') { let b; try { b = JSON.parse(await readBody(req, 4000)); } catch { return json(res, 400, { error: 'petición no válida' }); } const e = K.setPass(b.name, b.pass); return json(res, e ? 400 : 200, e ? { error: e } : { ok: true }); }
      if (req.method === 'POST' && p === 'quitar') { let b; try { b = JSON.parse(await readBody(req, 4000)); } catch { return json(res, 400, { error: 'petición no válida' }); } K.removeUser(b.name); return json(res, 200, { ok: true }); }
      let fm = p.match(/^archivo\/([\w-]{6,30})\.(mp4|jpg)$/);
      if (req.method === 'GET' && fm) {
        const c = K.clipOf(fm[1]); const f = fm[2] === 'mp4' ? K.videoPath(fm[1]) : path.join(K.FILES, fm[1] + '.jpg');
        if (!c || !fs.existsSync(f)) return json(res, 404, { error: 'no está' });
        const size = fs.statSync(f).size, type = fm[2] === 'mp4' ? 'video/mp4' : 'image/jpeg', range = req.headers.range;
        const dl = url.searchParams.has('descargar') ? { 'Content-Disposition': `attachment; filename="${(c.user + '_' + (c.meta.titulo || 'clip')).replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]+/g, '').slice(0, 80) || 'clip'}.mp4"` } : {};
        if (range && fm[2] === 'mp4') {   // para poder saltar dentro del vídeo
          const m2 = range.match(/bytes=(\d*)-(\d*)/); let a = m2[1] ? +m2[1] : 0, z = m2[2] ? +m2[2] : size - 1; z = Math.min(z, size - 1);
          if (a > z) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
          res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${z}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': z - a + 1, ...dl });
          return fs.createReadStream(f, { start: a, end: z }).pipe(res);
        }
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', ...dl });
        return fs.createReadStream(f).pipe(res);
      }
      return json(res, 404, { error: 'no existe' });
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, ia: !!KEY, panel: K.adminSet(ADMIN), panel_variable: !!ADMIN, datos: K.DATA, hoy: total });
    // ---------- a partir de aquí, solo con sesión de clipper ----------
    const me = K.sessionUser(req);
    if (!me) { if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return html(res, 200, USER_LOGIN()); if (url.pathname.startsWith('/api/')) return json(res, 401, { error: { message: 'Tu sesión ha caducado: vuelve a entrar.' } }); }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
      return res.end(gz ? pageGz : page);
    }
    const m = url.pathname.match(/^\/api\/gemini\/([\w.-]{3,60})$/);
    if (req.method === 'POST' && m) {
      if (!KEY) return json(res, 503, { error: { message: 'La IA no está configurada en el servidor (falta GEMINI_KEY).' } });
      if (!/^gemini-/.test(m[1])) return json(res, 400, { error: { message: 'modelo no permitido' } });
      if (!sameSite(req)) return json(res, 403, { error: { message: 'origen no permitido' } });
      const why = quota(me.name); if (why) return json(res, 429, { error: { message: why } });
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX_BODY) { iaErr(m[1], 'petición demasiado grande (' + Math.round(size / 1048576) + ' MB)'); return json(res, 413, { error: { message: 'El clip es demasiado grande para la IA.' } }); } chunks.push(c); }
      const body = Buffer.concat(chunks);
      try { const j = JSON.parse(body.toString('utf8')); if (!j || !Array.isArray(j.contents)) throw 0; } catch { return json(res, 400, { error: { message: 'petición no válida' } }); }
      let r;
      try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m[1]}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body, signal: AbortSignal.timeout(180000) }); }
      catch (e) { iaErr(m[1], 'sin respuesta: ' + (e.message || e)); return json(res, 502, { error: { message: 'No se pudo hablar con la IA. Inténtalo otra vez.' } }); }
      let txt = await r.text();
      if (!r.ok) iaErr(m[1], r.status + ' ' + txt);
      // un fallo de la clave del servidor no es cosa de quien usa la web: no se le enseña como «clave incorrecta»
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /api key/i.test(txt))) { console.error('GEMINI_KEY rechazada:', txt.slice(0, 200)); return json(res, 503, { error: { message: 'La IA no está disponible ahora mismo.' } }); }
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(txt);
    }
    if (req.method === 'POST' && url.pathname === '/api/clip') {
      if (!sameSite(req)) return json(res, 403, { error: 'origen no permitido' });
      let b = ''; for await (const c of req) { b += c; if (b.length > 4000) return json(res, 413, { error: 'petición demasiado grande' }); }
      let q; try { q = JSON.parse(b); } catch { return json(res, 400, { error: 'petición no válida' }); }
      const link = String(q.url || '').trim(); if (badHost(link)) return json(res, 400, { error: 'Ese enlace no vale. Pega el enlace de un clip de Kick, Twitch, YouTube o TikTok.' });
      const why = dlQuota(me.name); if (why) return json(res, 429, { error: why });
      const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      const num = v => (v == null || v === '' || !isFinite(+v)) ? null : Math.max(0, +v);
      const job = { id, url: link, from: num(q.from), to: num(q.to), status: 'queued', p: 0, at: Date.now(), ip: me.name };
      jobs.set(id, job); queue.push(job); next();
      return json(res, 200, { id });
    }
    // ---------- registro de lo que hace cada clipper ----------
    if (req.method === 'POST' && url.pathname === '/api/registro') {
      if (!sameSite(req)) return json(res, 403, { error: 'origen no permitido' });
      let b; try { b = JSON.parse(await readBody(req, 600000)); } catch { return json(res, 400, { error: 'petición no válida' }); }
      const c = K.addClip(me, b); return json(res, 200, { id: c.id });
    }
    if (req.method === 'POST' && url.pathname === '/api/sugerencia') {
      if (!sameSite(req)) return json(res, 403, { error: 'origen no permitido' });
      let b; try { b = JSON.parse(await readBody(req, 1600000)); } catch { return json(res, 400, { error: 'petición no válida' }); }
      const o = K.addSuggestion(me, b); return json(res, o ? 200 : 400, o ? { ok: true } : { error: 'Escribe tu sugerencia' });
    }
    let um = url.pathname.match(/^\/api\/subir\/([\w-]{6,30})$/);
    if (req.method === 'PUT' && um) {
      if (!sameSite(req)) return json(res, 403, { error: 'origen no permitido' });
      const c = K.clipOf(um[1]); if (!c || c.user !== me.name || c.video) return json(res, 404, { error: 'no existe' });
      const f = K.videoPath(c.id), tmp = f + '.part', out = fs.createWriteStream(tmp); let n = 0, bad = false;
      for await (const ch of req) { n += ch.length; if (n > 500 * 1024 * 1024) { bad = true; break; } if (!out.write(ch)) await new Promise(r => out.once('drain', r)); }
      await new Promise(r => out.end(r));
      if (bad || n < 1000) { fs.rm(tmp, () => {}); return json(res, 413, { error: 'vídeo no válido' }); }
      fs.renameSync(tmp, f); K.videoDone(c, n); return json(res, 200, { ok: true });
    }
    let jm = url.pathname.match(/^\/api\/clip\/(\w{8,40})(\/file)?$/);
    if (req.method === 'GET' && jm) {
      const job = jobs.get(jm[1]); if (!job || job.ip !== me.name) return json(res, 404, { error: 'No encuentro esa descarga.' });
      if (!jm[2]) return json(res, 200, { status: job.status, p: job.p, title: job.title || '', error: job.error || '', size: job.size || 0, queue: job.status === 'queued' ? queue.indexOf(job) + 1 : 0 });
      if (job.status !== 'done') return json(res, 409, { error: 'Aún no está lista.' });
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': job.size, 'Cache-Control': 'no-store' });
      const st = fs.createReadStream(job.file); st.pipe(res);
      const done = () => { fs.rm(job.file, () => {}); jobs.delete(job.id); };
      res.on('finish', done); res.on('close', done);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado');
  } catch (e) { console.error(e); try { json(res, 500, { error: { message: 'error del servidor' } }); } catch {} }
}).listen(PORT, () => console.log(`Cortex en el puerto ${PORT} · IA ${KEY ? 'configurada' : 'SIN CLAVE (pon GEMINI_KEY)'} · ${PER_IP}/persona/día · ${TOTAL}/día en total · enlaces: ${DL_PER_IP}/persona/día, ${DL_AT_ONCE} a la vez`));

// Cortex · versión de prueba en la web.
// Sirve la página y hace de puente con Gemini: la clave vive solo aquí (variable GEMINI_KEY), nunca llega al navegador.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os'), { spawn } = require('child_process');

const KEY = (process.env.GEMINI_KEY || '').trim();
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
    '--merge-output-format', 'mp4', '--match-filter', `!duration | duration<=${DL_MAX_MIN * 60}`, '--max-filesize', '700M',
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
      job.error = job.why ? 'La descarga ' + job.why + '.' : /does not pass filter|duration/i.test(err) ? `El vídeo es demasiado largo (máximo ${DL_MAX_MIN} min). Pega el enlace de un clip.` : /File is larger|max-filesize/i.test(err) ? 'El vídeo es demasiado grande.' : /Unsupported URL|is not a valid URL/i.test(err) ? 'Ese enlace no es de un vídeo que pueda abrir.' : /private|login|sign in|cookies/i.test(err) ? 'Ese vídeo es privado o pide iniciar sesión.' : /404|not found|does not exist/i.test(err) ? 'No encuentro ese vídeo: ¿el enlace está bien?' : 'No se pudo descargar' + (e ? ': ' + e.replace(/^ERROR:\s*/, '').slice(0, 160) : '.');
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
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
      return res.end(gz ? pageGz : page);
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true, ia: !!KEY, hoy: total });
    const m = url.pathname.match(/^\/api\/gemini\/([\w.-]{3,60})$/);
    if (req.method === 'POST' && m) {
      if (!KEY) return json(res, 503, { error: { message: 'La IA no está configurada en el servidor (falta GEMINI_KEY).' } });
      if (!/^gemini-/.test(m[1])) return json(res, 400, { error: { message: 'modelo no permitido' } });
      if (!sameSite(req)) return json(res, 403, { error: { message: 'origen no permitido' } });
      const why = quota(ipOf(req)); if (why) return json(res, 429, { error: { message: why } });
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX_BODY) return json(res, 413, { error: { message: 'El clip es demasiado grande para la IA.' } }); chunks.push(c); }
      const body = Buffer.concat(chunks);
      try { const j = JSON.parse(body.toString('utf8')); if (!j || !Array.isArray(j.contents)) throw 0; } catch { return json(res, 400, { error: { message: 'petición no válida' } }); }
      let r;
      try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m[1]}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body, signal: AbortSignal.timeout(180000) }); }
      catch (e) { return json(res, 502, { error: { message: 'No se pudo hablar con la IA. Inténtalo otra vez.' } }); }
      let txt = await r.text();
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
      const why = dlQuota(ipOf(req)); if (why) return json(res, 429, { error: why });
      const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      const num = v => (v == null || v === '' || !isFinite(+v)) ? null : Math.max(0, +v);
      const job = { id, url: link, from: num(q.from), to: num(q.to), status: 'queued', p: 0, at: Date.now(), ip: ipOf(req) };
      jobs.set(id, job); queue.push(job); next();
      return json(res, 200, { id });
    }
    let jm = url.pathname.match(/^\/api\/clip\/(\w{8,40})(\/file)?$/);
    if (req.method === 'GET' && jm) {
      const job = jobs.get(jm[1]); if (!job || job.ip !== ipOf(req)) return json(res, 404, { error: 'No encuentro esa descarga.' });
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

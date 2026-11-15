// Cortex · versión de prueba en la web.
// Sirve la página y hace de puente con Gemini: la clave vive solo aquí (variable GEMINI_KEY), nunca llega al navegador.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');

const KEY = (process.env.GEMINI_KEY || '').trim();
const PORT = process.env.PORT || 3000;
const PER_IP = +process.env.LIMITE_POR_PERSONA || 150;   // peticiones a la IA por persona y día
const TOTAL = +process.env.LIMITE_TOTAL || 5000;          // peticiones a la IA de todos, por día
const MAX_BODY = 32 * 1024 * 1024;

const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const pageGz = zlib.gzipSync(page, { level: 9 });

let day = '', total = 0, perIp = new Map();
function quota(ip) {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== day) { day = d; total = 0; perIp = new Map(); }
  const n = perIp.get(ip) || 0;
  if (total >= TOTAL) return 'Cortex ha llegado al límite de uso de hoy. Vuelve mañana.';
  if (n >= PER_IP) return 'Has llegado al límite gratis de hoy. Vuelve mañana.';
  perIp.set(ip, n + 1); total++;
  return '';
}
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
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado');
  } catch (e) { console.error(e); try { json(res, 500, { error: { message: 'error del servidor' } }); } catch {} }
}).listen(PORT, () => console.log(`Cortex en el puerto ${PORT} · IA ${KEY ? 'configurada' : 'SIN CLAVE (pon GEMINI_KEY)'} · ${PER_IP}/persona/día · ${TOTAL}/día en total`));

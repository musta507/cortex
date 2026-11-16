// Cuentas de los clippers, sesiones y registro de sus clips.
// Todo se guarda en DATA (en Railway: un volumen, para que no se borre al actualizar).
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const DATA = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || path.join(__dirname, 'data');
const FILES = path.join(DATA, 'clips');
fs.mkdirSync(FILES, { recursive: true });
const MAX_GB = +process.env.MAX_GB || 5;   // espacio máximo para los vídeos exportados (se borran los más viejos)

// ---------- secreto para firmar las sesiones ----------
const secretFile = path.join(DATA, 'secreto');
let SECRET = process.env.SESSION_SECRET || '';
if (!SECRET) { try { SECRET = fs.readFileSync(secretFile, 'utf8').trim(); } catch {} }
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, SECRET); }

// ---------- base de datos: un JSON pequeño, guardado con retardo ----------
const dbFile = path.join(DATA, 'cortex.json');
let db = { users: [], clips: [], sugerencias: [] };
try { db = { users: [], clips: [], sugerencias: [], ...JSON.parse(fs.readFileSync(dbFile, 'utf8')) }; } catch {}
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { const tmp = dbFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, dbFile); }, 400);
}
process.on('SIGTERM', () => { try { fs.writeFileSync(dbFile, JSON.stringify(db)); } catch {} process.exit(0); });

// ---------- contraseñas ----------
const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');
function findByPass(pass) {
  pass = String(pass || '').trim(); if (!pass) return null;
  for (const u of db.users) if (u.active !== false && crypto.timingSafeEqual(Buffer.from(hash(pass, u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return u;
  return null;
}
function addUser(name, pass) {
  name = String(name || '').trim().slice(0, 40); pass = String(pass || '').trim();
  if (name.length < 2) return 'Pon un nombre.';
  if (pass.length < 4) return 'La contraseña tiene que tener al menos 4 caracteres.';
  if (db.users.some(u => u.active !== false && u.name.toLowerCase() === name.toLowerCase())) return 'Ya hay un clipper con ese nombre.';
  if (findByPass(pass)) return 'Esa contraseña ya la tiene otro clipper: cada uno necesita la suya.';
  const old = db.users.find(u => u.name.toLowerCase() === name.toLowerCase());
  const salt = crypto.randomBytes(12).toString('hex');
  if (old) Object.assign(old, { salt, hash: hash(pass, salt), active: true, created: Date.now() });
  else db.users.push({ name, salt, hash: hash(pass, salt), active: true, created: Date.now() });
  save(); return '';
}
function setPass(name, pass) {
  const u = userOf(name); if (!u) return 'No existe.';
  pass = String(pass || '').trim(); if (pass.length < 4) return 'La contraseña tiene que tener al menos 4 caracteres.';
  const other = findByPass(pass); if (other && other !== u) return 'Esa contraseña ya la tiene otro clipper.';
  u.salt = crypto.randomBytes(12).toString('hex'); u.hash = hash(pass, u.salt); u.ver = (u.ver || 0) + 1; save(); return '';
}
function removeUser(name) { const u = userOf(name); if (!u) return; u.active = false; u.ver = (u.ver || 0) + 1; save(); }
const userOf = name => db.users.find(u => u.active !== false && u.name === name) || null;

// ---------- sesiones (cookie firmada) ----------
const b64 = s => Buffer.from(s).toString('base64url'), unb64 = s => Buffer.from(s, 'base64url').toString();
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeCookie(kind, name, days, ver) {
  const body = [kind, b64(name || ''), Date.now() + days * 864e5, ver || 0].join('.');
  return body + '.' + sign(body);
}
function readCookie(req, cname) {
  const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + cname + '=([^;]+)')); if (!m) return null;
  const parts = m[1].split('.'); if (parts.length !== 5) return null;
  const body = parts.slice(0, 4).join('.'), sig = parts[4], good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (+parts[2] < Date.now()) return null;
  return { kind: parts[0], name: unb64(parts[1]), ver: +parts[3] };
}
function sessionUser(req) {
  const c = readCookie(req, 'cx'); if (!c || c.kind !== 'u') return null;
  const u = userOf(c.name); return u && (u.ver || 0) === c.ver ? u : null;
}
const isAdmin = req => { const c = readCookie(req, 'cxa'); return !!(c && c.kind === 'a'); };
function cookieHeader(req, cname, value, days) {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `${cname}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(days * 86400)}${secure}`;
}

// ---------- clips ----------
function addClip(user, data) {
  // «estado»: cómo va el proyecto mientras se edita (título, formato…); se guarda en la ficha del clip abierto, no como uno nuevo
  if (data.tipo === 'estado') {
    const o = [...db.clips].reverse().find(c => c.user === user.name && c.proyecto === String(data.proyecto || '') && c.tipo === 'abierto');
    if (o) {
      let m = data.meta && typeof data.meta === 'object' ? data.meta : {}; if (JSON.stringify(m).length > 20000) m = { titulo: String(m.titulo || '').slice(0, 300), formato: m.formato, duracion_s: m.duracion_s };
      o.estado = m; o.estadoAt = Date.now();
      if (typeof data.thumb === 'string' && data.thumb.startsWith('data:image/jpeg;base64,') && data.thumb.length < 400000) { fs.writeFileSync(path.join(FILES, o.id + '.jpg'), Buffer.from(data.thumb.split(',')[1], 'base64')); o.thumb = 1; }
      save(); return o;
    }
    data = { ...data, tipo: 'abierto' };
  }
  const id = crypto.randomBytes(9).toString('base64url');
  const c = { id, user: user.name, at: Date.now(), tipo: String(data.tipo || '').slice(0, 20), proyecto: String(data.proyecto || '').slice(0, 40), meta: data.meta && typeof data.meta === 'object' ? data.meta : {}, video: 0, thumb: 0 };
  if (JSON.stringify(c.meta).length > 20000) c.meta = { titulo: String(c.meta.titulo || '').slice(0, 300), formato: c.meta.formato, duracion_s: c.meta.duracion_s };
  if (typeof data.thumb === 'string' && data.thumb.startsWith('data:image/jpeg;base64,') && data.thumb.length < 400000) {
    fs.writeFileSync(path.join(FILES, id + '.jpg'), Buffer.from(data.thumb.split(',')[1], 'base64')); c.thumb = 1;
  }
  db.clips.push(c); save(); return c;
}
const clipOf = id => db.clips.find(c => c.id === id) || null;
function videoPath(id) { return path.join(FILES, id + '.mp4'); }
function videoDone(c, size) { c.video = size; save(); prune(); }
// se borran los vídeos más viejos si se pasa del espacio máximo (la ficha del clip se queda)
function prune() {
  let total = db.clips.reduce((n, c) => n + (c.video || 0), 0); const max = MAX_GB * 1024 ** 3;
  for (const c of db.clips) { if (total <= max) break; if (!c.video) continue; try { fs.rmSync(videoPath(c.id)); } catch {} total -= c.video; c.video = 0; c.borrado = 1; }
  save();
}
function stats() {
  const by = new Map();
  for (const u of db.users) if (u.active !== false) by.set(u.name, { name: u.name, created: u.created, proyectos: new Set(), exportados: 0, ultimo: 0 });
  for (const c of db.clips) { const s = by.get(c.user); if (!s) continue; if (c.proyecto) s.proyectos.add(c.proyecto); if (c.tipo === 'exportado') s.exportados++; s.ultimo = Math.max(s.ultimo, c.at); }
  return [...by.values()].map(s => ({ ...s, proyectos: s.proyectos.size })).sort((a, b) => b.ultimo - a.ultimo || a.name.localeCompare(b.name));
}
// proyectos de un clipper (o de todos): cada clip que ha abierto, con sus exportaciones
function projects(user) {
  const map = new Map();
  for (const c of db.clips) {
    if (user && c.user !== user) continue;
    const k = c.user + '|' + (c.proyecto || c.id);
    let p = map.get(k); if (!p) map.set(k, p = { user: c.user, proyecto: c.proyecto, abierto: c.at, ultimo: c.at, origen: null, fuente: null, estado: null, exports: [] });
    p.ultimo = Math.max(p.ultimo, c.at);
    if (c.tipo === 'abierto') { p.abierto = Math.min(p.abierto, c.at); p.origen = c.meta.enlace || c.meta.archivo || p.origen; p.fuente = { id: c.id, video: !!c.video, borrado: !!c.borrado, thumb: !!c.thumb }; if (c.estado) { p.estado = { titulo: c.estado.titulo || '', formato: c.estado.formato || '', duracion_s: c.estado.duracion_s || 0, titulo_ia: c.estado.titulo_ia || '', at: c.estadoAt }; p.ultimo = Math.max(p.ultimo, c.estadoAt || 0); } }
    if (c.tipo === 'exportado') p.exports.push({ id: c.id, at: c.at, titulo: c.meta.titulo || '', formato: c.meta.formato || '', duracion_s: c.meta.duracion_s || 0, video: !!c.video, borrado: !!c.borrado, thumb: !!c.thumb, plantilla: c.meta.plantilla_titulo || '', titulo_ia: c.meta.titulo_ia || '', subtitulos: !!c.meta.subtitulos });
  }
  return [...map.values()].sort((a, b) => b.ultimo - a.ultimo);
}

// ---------- sugerencias de plantillas que mandan los clippers (las ves en el panel) ----------
function addSuggestion(user, b) {
  const id = crypto.randomBytes(8).toString('base64url');
  const o = { id, user: user.name, at: Date.now(), texto: String(b.texto || '').slice(0, 2000), formato: String(b.formato || '').slice(0, 60), visto: false, img: 0 };
  if (!o.texto.trim() && !b.imagen) return null;
  if (typeof b.imagen === 'string' && b.imagen.startsWith('data:image/jpeg;base64,') && b.imagen.length < 1500000) { fs.writeFileSync(path.join(FILES, 'sug_' + id + '.jpg'), Buffer.from(b.imagen.split(',')[1], 'base64')); o.img = 1; }
  db.sugerencias.unshift(o); if (db.sugerencias.length > 500) db.sugerencias.length = 500; save(); return o;
}
const suggestions = () => db.sugerencias;
function suggestionSet(id, ch) { const o = db.sugerencias.find(x => x.id === id); if (!o) return false; if (ch.borrar) { db.sugerencias = db.sugerencias.filter(x => x !== o); try { fs.rmSync(path.join(FILES, 'sug_' + id + '.jpg')); } catch {} } else o.visto = !!ch.visto; save(); return true; }
const suggestionImg = id => path.join(FILES, 'sug_' + String(id).replace(/[^\w-]/g, '') + '.jpg');

// ---------- contraseña del panel: la variable ADMIN_PASSWORD o, si no llega, la que se crea al entrar la primera vez ----------
const adminFile = path.join(DATA, 'admin.json');
// contraseña del panel fijada en el código (solo se guarda su huella cifrada, no la contraseña)
const ADMIN_FIJA = { salt: '49936ae745c94330b3587a4d', hash: 'ab9741f3c92a3c029370b2b6b13d46ad6c0da2da1ac8e066127b2ef20c68cca5' };
let adminStored = ADMIN_FIJA; try { if (!ADMIN_FIJA) adminStored = JSON.parse(fs.readFileSync(adminFile, 'utf8')); } catch {}
const adminSet = env => !!env || !!adminStored;
function adminOk(pass, env) {
  pass = String(pass || '').trim(); if (!pass) return false;
  if (env && pass.length === env.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(env))) return true;
  if (adminStored) return crypto.timingSafeEqual(Buffer.from(hash(pass, adminStored.salt), 'hex'), Buffer.from(adminStored.hash, 'hex'));
  return false;
}
function adminCreate(pass) { const salt = crypto.randomBytes(12).toString('hex'); adminStored = { salt, hash: hash(pass, salt), at: Date.now() }; fs.writeFileSync(adminFile, JSON.stringify(adminStored)); }

module.exports = { addSuggestion, suggestions, suggestionSet, suggestionImg, adminSet, adminOk, adminCreate, DATA, FILES, findByPass, addUser, setPass, removeUser, userOf, makeCookie, readCookie, sessionUser, isAdmin, cookieHeader, addClip, clipOf, videoPath, videoDone, stats, projects };

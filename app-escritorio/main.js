// Cortex como aplicación de Windows.
// - Abre el Cortex de la carpeta del grabador (C:\Clipzi Grabador\Clipzi.html): así se actualiza solo, igual que ahora.
//   Si no está, usa la copia que viene dentro de la app.
// - Arranca el grabador escondido (sin ventana negra) y lo cierra al salir.
// - Quita los límites del navegador: sin pestañas dormidas, tarjeta gráfica para vídeo (también HEVC), carpetas sin pedir permiso cada vez.
const { app, BrowserWindow, session, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { spawn, spawnSync, execFile } = require('child_process');

const GRAB = process.env.CORTEX_GRABADOR || 'C:\\Clipzi Grabador';
const LOG = path.join(app.getPath('userData'), 'cortex-app.log');
const log = (...a) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch {} };
// registros que no crecen sin fin: al pasar de 2 MB se guardan como «.old» y se empieza otro
function rotate(p) { try { if (fs.statSync(p).size > 2 * 1024 * 1024) fs.renameSync(p, p.replace(/\.log$/, '.old.log')); } catch {} }
rotate(LOG);

// tarjeta gráfica para todo lo de vídeo (también HEVC, como CapCut) y sin frenar lo que está en segundo plano
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCEncoderSupport,PlatformHEVCDecoderSupport,MediaFoundationD3D11VideoCapture,FileSystemAccessPersistentPermissions');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, grab = null, quitting = false;

function pageToOpen() {
  const local = path.join(GRAB, 'Clipzi.html');
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, 'app', 'Clipzi.html');
}

function findPython() {
  for (const [cmd, args] of [['py', ['-3']], ['python', []]]) {
    try { const r = spawnSync(cmd, [...args, '--version'], { windowsHide: true, timeout: 8000 }); if (r.status === 0) return [cmd, args]; } catch {}
  }
  return null;
}

// el grabador, escondido; la primera vez (sin instalar) se abre el .bat de siempre para que instale lo necesario
function startGrabador() {
  if (process.platform !== 'win32') return;
  const py = findPython(), script = path.join(GRAB, 'clipzi_grabador.py');
  if (!fs.existsSync(script)) { log('sin grabador en', GRAB); return; }
  if (!py || !fs.existsSync(path.join(GRAB, '.instalado'))) {
    log('primera vez: abro el .bat'); shell.openPath(path.join(GRAB, 'Grabador Clipzi.bat')); return;
  }
  const [cmd, pre] = py;
  // al día lo que lee Kick y TikTok (cambian a menudo), sin esperar
  try { spawn(cmd, [...pre, '-m', 'pip', 'install', '--upgrade', '--quiet', 'streamlink', 'curl_cffi'], { windowsHide: true, cwd: GRAB, stdio: 'ignore' }).unref(); } catch {}
  // yt-dlp: siempre la versión estable (las de prueba se rompen más)
  try { spawn(cmd, [...pre, '-m', 'pip', 'install', '--upgrade', '--quiet', 'yt-dlp[default,curl-cffi]'], { windowsHide: true, cwd: GRAB, stdio: 'ignore' }).unref(); } catch {}
  rotate(path.join(GRAB, 'grabador-app.log'));
  const out = fs.openSync(path.join(GRAB, 'grabador-app.log'), 'a');
  grab = spawn(cmd, [...pre, '-u', script], { cwd: GRAB, windowsHide: true, stdio: ['ignore', out, out], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  log('grabador arrancado, pid', grab.pid);
  grab.on('exit', code => { log('grabador terminó', code); grab = null; if (!quitting && code !== 0) setTimeout(() => { if (!quitting && !grab) startGrabador(); }, 5000); });
}
function stopGrabador() {
  if (!grab) return;
  try { execFile('taskkill', ['/pid', String(grab.pid), '/T', '/F'], { windowsHide: true }); } catch {}
  grab = null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1100, minHeight: 700, show: false, backgroundColor: '#0A0A0D', title: 'Cortex',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, contextIsolation: true, sandbox: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(pageToOpen());
  // enlaces externos: en el navegador normal
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  // F5 / Ctrl+F5 recargan; F12 abre las herramientas por si hay que mirar un fallo
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F5') { e.preventDefault(); i.control ? win.webContents.reloadIgnoringCache() : win.webContents.reload(); }
    if (i.key === 'F12') { e.preventDefault(); win.webContents.toggleDevTools(); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  // permisos: cámara/micro, carpetas, portapapeles… todo permitido (es tu propia app)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);
  // lo que Cortex descarga (clips exportados…) va directo a Descargas, sin ventana de «Guardar como»
  session.defaultSession.on('will-download', (e, item) => {
    const dir = app.getPath('downloads'), name = item.getFilename() || 'clip.mp4', ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    let p = path.join(dir, name), n = 1;
    while (fs.existsSync(p)) p = path.join(dir, `${base} (${n++})${ext}`);
    item.setSavePath(p);
  });
  ipcMain.handle('cx:readDatos', () => { try { return fs.readFileSync(path.join(GRAB, 'cortex-datos.json'), 'utf8'); } catch { return null; } });
  ipcMain.handle('cx:info', () => ({ version: app.getVersion(), grabador: !!grab, carpeta: GRAB }));
  // solo abre Descargas o la carpeta del grabador (antes abría cualquier ruta, también un programa)
  ipcMain.handle('cx:openFolder', (e, p) => shell.openPath(p === 'descargas' ? app.getPath('downloads') : GRAB));
  createWindow();
  startGrabador();
  setTimeout(checkUpdates, 20000); setInterval(checkUpdates, 30 * 60000);
});

/* ---------- actualizaciones automáticas ----------
   Cada 30 min mira en la web si hay un Cortex o un grabador más nuevos y los deja en la carpeta del grabador.
   Solo cambia a una versión MÁS NUEVA (nunca a una más vieja), comprueba que el archivo llega entero y guarda el anterior como «.anterior».
   Cortex nuevo: se usa al recargar (F5) o al volver a abrir la app. Grabador nuevo: se reinicia solo cuando no está grabando un directo. */
const UPD = process.env.CORTEX_UPDATES || 'https://cortex-production-6b29971d.up.railway.app/app/';
const UPD_TOKEN = process.env.CORTEX_APP_TOKEN || 'cortex-app-7f3c91d2a8';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const buildOf = t => +((/<meta name="cortex-build" content="(\d+)"/.exec(t) || [])[1] || 0);
const grabVerOf = t => +((/GRABADOR_VERSION = (\d+)/.exec(t) || [])[1] || 0);
let pendingGrab = false;
function recordingNow() {
  try {
    const d = path.join(GRAB, 'directos');
    for (const x of fs.readdirSync(d)) {
      try { const st = JSON.parse(fs.readFileSync(path.join(d, x, 'status.json'), 'utf8')); if (st.live && Date.now() / 1000 - st.updated < 90) return true; } catch {}
    }
  } catch {}
  return false;
}
async function getUpd(name) {
  const r = await fetch(UPD + name, { headers: { 'x-cortex-app': UPD_TOKEN }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(name + ' ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
function replaceFile(p, buf) {
  const tmp = p + '.nuevo'; fs.writeFileSync(tmp, buf);
  try { if (fs.existsSync(p)) fs.copyFileSync(p, p + '.anterior'); } catch {}
  fs.renameSync(tmp, p);
}
async function checkUpdates() {
  if (process.platform !== 'win32' && !process.env.CORTEX_UPDATES) return;
  try {
    if (pendingGrab && grab && !recordingNow()) { pendingGrab = false; log('reinicio el grabador para usar la versión nueva'); stopGrabador(); setTimeout(startGrabador, 3000); }
    const v = JSON.parse((await getUpd('version.json')).toString('utf8'));
    // Cortex
    const hp = path.join(GRAB, 'Clipzi.html'); let cur = ''; try { cur = fs.readFileSync(hp, 'utf8'); } catch {}
    if (v.html && v.html.build > buildOf(cur)) {
      const b = await getUpd('Clipzi.html'), t = b.toString('utf8');
      if (sha(b) !== v.html.sha256 || buildOf(t) !== v.html.build || !t.includes('</html>')) throw new Error('Cortex nuevo llegó incompleto');
      replaceFile(hp, b); log('Cortex actualizado a', v.html.build);
      if (win) win.webContents.send('cx:update', { que: 'cortex', build: v.html.build });
    }
    // grabador
    const gp = path.join(GRAB, 'clipzi_grabador.py'); let gcur = ''; try { gcur = fs.readFileSync(gp, 'utf8'); } catch {}
    if (v.grabador && v.grabador.version > grabVerOf(gcur)) {
      const b = await getUpd('clipzi_grabador.py'), t = b.toString('utf8');
      if (sha(b) !== v.grabador.sha256 || grabVerOf(t) !== v.grabador.version) throw new Error('grabador nuevo llegó incompleto');
      replaceFile(gp, b); log('grabador actualizado a la versión', v.grabador.version);
      if (grab) { if (recordingNow()) pendingGrab = true; else { stopGrabador(); setTimeout(startGrabador, 3000); } }
    }
  } catch (e) { log('actualización: ' + (e.message || e)); }
}

app.on('before-quit', () => { quitting = true; stopGrabador(); });
app.on('window-all-closed', () => app.quit());

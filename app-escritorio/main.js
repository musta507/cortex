// Cortex como aplicación de Windows.
// - Abre el Cortex de la carpeta del grabador (C:\Clipzi Grabador\Clipzi.html): así se actualiza solo, igual que ahora.
//   Si no está, usa la copia que viene dentro de la app.
// - Arranca el grabador escondido (sin ventana negra) y lo cierra al salir.
// - Quita los límites del navegador: sin pestañas dormidas, tarjeta gráfica para vídeo (también HEVC), carpetas sin pedir permiso cada vez.
const { app, BrowserWindow, session, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path'), fs = require('fs'), { spawn, spawnSync, execFile } = require('child_process');

const GRAB = process.env.CORTEX_GRABADOR || 'C:\\Clipzi Grabador';
const LOG = path.join(app.getPath('userData'), 'cortex-app.log');
const log = (...a) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch {} };

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
  try { spawn(cmd, [...pre, '-m', 'pip', 'install', '--upgrade', '--pre', '--quiet', 'yt-dlp[default,curl-cffi]'], { windowsHide: true, cwd: GRAB, stdio: 'ignore' }).unref(); } catch {}
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
  ipcMain.handle('cx:readDatos', () => { try { return fs.readFileSync(path.join(GRAB, 'cortex-datos.json'), 'utf8'); } catch { return null; } });
  ipcMain.handle('cx:info', () => ({ version: app.getVersion(), grabador: !!grab, carpeta: GRAB }));
  ipcMain.handle('cx:openFolder', (e, p) => shell.openPath(p || GRAB));
  createWindow();
  startGrabador();
});

app.on('before-quit', () => { quitting = true; stopGrabador(); });
app.on('window-all-closed', () => app.quit());

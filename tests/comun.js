// Cosas que comparten las pruebas: vídeos de prueba (se fabrican con ffmpeg), abrir Cortex y comprobar.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'cortex-pruebas'); fs.mkdirSync(TMP, { recursive: true });
const PC = 'file://' + path.join(ROOT, 'app-files', 'Clipzi.html');
function video(name, args) {
  const p = path.join(TMP, name);
  if (!fs.existsSync(p)) execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, p]);
  return p;
}
const tone = () => video('tono.mp4', ['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=330:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k']);
const reac = () => video('reaccion.mp4', ['-f', 'lavfi', '-i', "color=c=0x224488:s=640x360:r=30:d=3", '-f', 'lavfi', '-i', 'sine=f=880:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac']);
let fails = 0, oks = 0;
function check(name, ok, extra) { if (ok) oks++; else fails++; console.log((ok ? '  ✔ ' : '  ✘ ') + name + (extra != null ? '  (' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) + ')' : '')); }
function result() { return { oks, fails }; }
// abre Cortex del PC con un clip ya cargado (sin internet: todo lo necesario va dentro)
async function openWithClip(browser, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...opt });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await ctx.route(/^https?:/, r => r.abort());
  if (opt.init) await p.addInitScript(opt.init);
  await p.goto(PC); await p.waitForTimeout(1200);
  await p.evaluate(() => { $('home').hidden = true; ezPref('antiRot', '0'); });
  await p.setInputFiles('#file', tone()); await p.waitForTimeout(2500);
  return p;
}
module.exports = { ROOT, TMP, PC, tone, reac, check, result, openWithClip };

// Monta Cortex a partir de sus piezas (src/) y saca las dos versiones:
//   - public/index.html       la web (la que sirve server.js en Railway)
//   - app-files/Clipzi.html   la del PC y la app (la que baja la app al actualizarse)
//   - app-files/clipzi_grabador.py
// Uso:  node build.js                 → monta con la hora de ahora como versión
//       BUILD=0 node build.js --comprobar   → monta en memoria con versión 0 y dice si coincide con lo que hay
// Las piezas son texto normal. Las líneas que solo van en una versión van entre «@@solo-web» / «@@solo-pc» y «@@fin».
const fs = require('fs'), path = require('path');
const ROOT = __dirname, SRC = path.join(ROOT, 'src');

function pieces() {
  const { orden } = JSON.parse(fs.readFileSync(path.join(SRC, 'orden.json'), 'utf8'));
  let full = orden.map(n => fs.readFileSync(path.join(SRC, n), 'utf8')).join('');
  if (full.endsWith('\n')) full = full.slice(0, -1);
  const grab = fs.readFileSync(path.join(SRC, 'grabador', 'clipzi_grabador.py'), 'utf8');
  if (grab.includes('</script')) throw new Error('el grabador no puede llevar «</script»');
  const hole = '<script type="text/plain" id="grabPy">@@grabador';
  if (full.split(hole).length !== 2) throw new Error('falta el hueco del grabador');
  return { full: full.replace(hole, () => '<script type="text/plain" id="grabPy">' + grab.replace(/\n+$/, '')), grab };
}

function variant(full, which) {
  const out = []; let mode = null;
  for (const l of full.split('\n')) {
    if (l === '@@solo-web' || l === '@@solo-pc') { if (mode) throw new Error('marca dentro de otra marca'); mode = l; continue; }
    if (l === '@@fin') { if (!mode) throw new Error('@@fin sin marca'); mode = null; continue; }
    if (!mode || mode === '@@solo-' + which) out.push(l);
  }
  if (mode) throw new Error('marca sin @@fin');
  return out.join('\n');
}

function stamp(t, build) {
  const tag = '<meta name="cortex-build" content="0">';
  if (t.split(tag).length !== 2) throw new Error('falta la marca de versión');
  return t.replace(tag, `<meta name="cortex-build" content="${build}">`);
}

const build = process.env.BUILD != null ? process.env.BUILD : new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const { full, grab } = pieces();
const web = stamp(variant(full, 'web'), build), pc = stamp(variant(full, 'pc'), build);

if (process.argv.includes('--comprobar')) {
  const same = (a, p) => { let b = ''; try { b = fs.readFileSync(p, 'utf8'); } catch {} b = b.replace(/<meta name="cortex-build" content="\d+">/, `<meta name="cortex-build" content="${build}">`); return a === b; };
  const okW = same(web, path.join(ROOT, 'public', 'index.html')), okP = same(pc, path.join(ROOT, 'app-files', 'Clipzi.html'));
  console.log('web', okW ? 'igual' : 'DISTINTA', '· pc', okP ? 'igual' : 'DISTINTA');
  process.exit(okW && okP ? 0 : 1);
}
fs.mkdirSync(path.join(ROOT, 'app-files'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public', 'index.html'), web);
fs.writeFileSync(path.join(ROOT, 'app-files', 'Clipzi.html'), pc);
fs.writeFileSync(path.join(ROOT, 'app-files', 'clipzi_grabador.py'), grab);
// copias extra (p. ej. la del PC para probar): node build.js --copia-pc ruta/Clipzi.html
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--copia-pc' && process.argv[i + 1]) fs.writeFileSync(process.argv[i + 1], pc);
console.log('Cortex montado · versión', build, '· web', (web.length / 1048576).toFixed(2), 'MB · pc', (pc.length / 1048576).toFixed(2), 'MB');

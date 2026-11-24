// Corre todas las pruebas:  node tests/correr.js
// Necesita: Node 18+, Playwright con Chromium (npm i -D playwright && npx playwright install chromium), ffmpeg y Python 3.
const { spawnSync } = require('child_process'), path = require('path');
const T = __dirname, ROOT = path.join(T, '..');
const build = spawnSync('node', [path.join(ROOT, 'build.js'), '--comprobar'], { stdio: 'inherit', env: { ...process.env, BUILD: '0' } });
if (build.status !== 0) { console.log('\n✘ Las piezas de src/ no coinciden con lo montado: ejecuta «node build.js» antes de probar.'); process.exit(1); }
const runs = [['node', 'servidor.test.js'], ['node', 'web.test.js'], ['node', 'pagina.test.js'], ['python3', 'grabador.test.py']];
let bad = 0;
for (const [cmd, f] of runs) {
  const r = spawnSync(cmd, [path.join(T, f)], { stdio: ['ignore', 'inherit', 'ignore'], cwd: ROOT, env: { ...process.env, DATA_DIR: '' } });
  if (r.status !== 0) { bad++; console.log('  ✘ ' + f + ' ha fallado\n'); }
}
console.log(bad ? `\n✘ ${bad} grupo(s) de pruebas con fallos` : '\n✔ Todas las pruebas pasan');
process.exit(bad ? 1 : 0);

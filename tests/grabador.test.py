# El grabador: seguir en la misma carpeta, borrar trozos viejos, trabajos que se levantan solos, registro limitado y pausa por disco lleno.
# Trabaja con una copia en una carpeta temporal (nunca toca grabaciones de verdad).
import sys, os, time, json, importlib.util, threading, tempfile, shutil
G = tempfile.mkdtemp(prefix='cortex-grabador-')
shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'grabador', 'clipzi_grabador.py'), G)
spec = importlib.util.spec_from_file_location('gr', os.path.join(G, 'clipzi_grabador.py')); gr = importlib.util.module_from_spec(spec); spec.loader.exec_module(gr)
D = gr.DIRS; os.makedirs(D, exist_ok=True)
def mk(name, upd, seg=True, segs=()):
    d = os.path.join(D, name); os.makedirs(os.path.join(d, 'seg'), exist_ok=True); os.makedirs(os.path.join(d, 'aud'), exist_ok=True)
    open(os.path.join(d, 'seg', 'r3_00001.mp4'), 'wb').write(b'x' * 100000)
    open(os.path.join(d, 'aud', 'live_4_1.pcm'), 'wb').write(b'x' * 1000)
    json.dump({'slug': name.split('_')[0], 'started': upd - 3000, 'updated': upd, 'chat': 55}, open(os.path.join(d, 'status.json'), 'w'))
    with open(os.path.join(d, 'segments.jsonl'), 'w') as f:
        for s in segs: f.write(json.dumps(s) + '\n')
    for p in [d, os.path.join(d, 'status.json')]: os.utime(p, (upd, upd))
    return d
now = time.time()
viejo = mk('westcol_20261120_2200', now - 5 * 86400)
reciente = mk('westcol_20261124_1700', now - 300, segs=[{'f': 'seg/r2_00007.mp4', 'wav': 'seg/r2_00007.wav', 't0': 1, 't1': 2}])
otro = mk('zelika_20261123_1000', now - 30 * 3600)
# 1) seguir en la misma carpeta
class Fake(gr.Session):
    def __init__(self, slug): self.slug = slug
r = Fake('westcol').recent_dir()
ok = []
ok.append(bool(r) and os.path.basename(r[0]) == 'westcol_20261124_1700' and r[4] == 4)
print('1 misma carpeta:', os.path.basename(r[0]) if r else None, '| inicio conservado:', r and round(now - r[1]) == 3300, '| chat:', r and r[2], '| trozos:', r and len(r[3]), '| tanda siguiente empieza tras la', r and r[4])
print('  canal sin directo reciente:', Fake('zelika').recent_dir())
# 2) borrar trozos de directos viejos (3 días)
gr.clean_old_lives()
ok.append(not os.path.exists(os.path.join(viejo, 'seg')) and os.path.exists(os.path.join(reciente, 'seg')) and os.path.exists(os.path.join(otro, 'seg')))
print('2 viejo (5 días) sin trozos:', not os.path.exists(os.path.join(viejo, 'seg')) and not os.path.exists(os.path.join(viejo, 'aud')), '| conserva su chat/momentos:', os.path.exists(os.path.join(viejo, 'status.json')))
print('  reciente intacto:', os.path.exists(os.path.join(reciente, 'seg')), '| de ayer intacto (sin poco disco):', os.path.exists(os.path.join(otro, 'seg')))
gr.disk_free_gb = lambda: 8.0
gr.clean_old_lives(force=True)
ok.append(not os.path.exists(os.path.join(otro, 'seg')) and os.path.exists(os.path.join(reciente, 'seg')))
print('  con poco disco (8 GB) también el de hace 30 h:', not os.path.exists(os.path.join(otro, 'seg')), '| el de hace 5 min se queda:', os.path.exists(os.path.join(reciente, 'seg')))
# 3) trabajos que se levantan solos
n = [0]
def falla_dos():
    n[0] += 1
    if n[0] < 3: raise RuntimeError('fallo de prueba %d' % n[0])
_real_sleep = gr.time.sleep; gr.time.sleep = lambda s: None
gr.forever(falla_dos)()
ok.append(n[0] == 3)
print('3 se vuelve a poner en marcha: intentos =', n[0])
# 4) registro limitado
open(gr.LOGF, 'w').write('x' * (3 * 1024 * 1024)); gr._log_n[0] = 0; gr.log('prueba')
ok.append(os.path.getsize(gr.LOGF) < 1000)
print('4 registro:', os.path.getsize(gr.LOGF), 'bytes; antiguo guardado:', os.path.exists(os.path.join(gr.BASE, 'grabador.old.log')))
# 5) pausa por disco lleno
vals = iter([1.0, 1.0, 1.0, 9.0, 9.0, 9.0, 9.0, 9.0, 9.0])
gr.disk_free_gb = lambda: next(vals, 9.0)
class S2(gr.Session):
    def __init__(self): self.slug = 'westcol'; self.alive = True; self.dir = reciente; self.t0 = now; self.segs = []; self.nchat = 0; self.err = ''; self.test = None; self.client = ''
s2 = S2(); s2.wait_disk()
ok.append(not s2.disk_paused)
print('5 pausa y sigue:', not s2.disk_paused, '| estado guardado:', json.load(open(os.path.join(reciente, 'status.json'))).get('disco_gb'))

shutil.rmtree(G, ignore_errors=True)
print('  %d bien, %d mal' % (sum(ok), len(ok) - sum(ok)))
sys.exit(0 if all(ok) else 1)

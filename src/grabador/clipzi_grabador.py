# -*- coding: utf-8 -*-
"""
Grabador de Clipzi
------------------
Graba los directos de Kick de tus clientes en trozos de 1 minuto, lee el chat,
mira los clips que crean los espectadores y vigila las cuentas de TikTok de otros
clippers. Todo lo que encuentra lo deja en la carpeta «directos» para que Clipzi
te proponga los momentos.

No hace falta tocar nada aquí: Clipzi escribe config.json y tú solo abres
«Grabador Clipzi.bat» con doble clic.
"""
import os, sys, json, time, threading, subprocess, shutil, re, glob, wave, traceback, datetime, uuid

GRABADOR_VERSION = 33   # Clipzi solo lo sobrescribe con una versión más nueva
BASE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(BASE, 'config.json')
DIRS = os.path.join(BASE, 'directos')
LOGF = os.path.join(BASE, 'grabador.log')
PY = sys.executable
SEGLEN = os.environ.get('CLIPZI_SEG', '20')   # duración de cada trozo (segundos): cortos para transcribir casi en vivo
_lock = threading.Lock()
WIN = os.name == 'nt'
NOWIN = 0x08000000 if WIN else 0   # que no se abran ventanas negras en Windows


LOG_MAX = 2 * 1024 * 1024   # el registro no pasa de 2 MB: al llegar, se guarda como grabador.old.log y se empieza otro
_log_n = [0]


def log_rotate():
    try:
        if os.path.getsize(LOGF) > LOG_MAX:
            os.replace(LOGF, os.path.join(BASE, 'grabador.old.log'))
    except Exception:
        pass


def log(*a):
    msg = time.strftime('%H:%M:%S') + '  ' + ' '.join(str(x) for x in a)
    with _lock:
        try:
            print(msg, flush=True)
        except Exception:
            pass
        _log_n[0] += 1
        if _log_n[0] % 200 == 1:
            log_rotate()
        try:
            with open(LOGF, 'a', encoding='utf-8') as f:
                f.write(msg + '\n')
        except Exception:
            pass


def forever(fn, name=None, alive=lambda: True):
    """Hace que un trabajo de fondo se vuelva a poner en marcha solo si falla (antes, un fallo lo paraba hasta reiniciar el grabador).
    Si termina sin fallo, se queda terminado."""
    name = name or getattr(fn, '__name__', 'trabajo')

    def w():
        wait = 5
        while alive():
            try:
                fn()
                return
            except Exception as e:
                log('⚠️ Fallo en %s: %s. Lo vuelvo a poner en marcha en %d s.' % (name, e, wait))
                traceback.print_exc()
                time.sleep(wait)
                wait = min(120, wait * 2)
    return w


# ---------------------------------------------------------------- espacio en disco
# Por debajo de GB_MINIMO se para la grabación (para no llenar el disco); por debajo de GB_LIMPIAR se borran trozos de directos viejos.
# Los trozos de vídeo y audio de los directos de hace más de «dias_directos» días (3 si no se dice) se borran solos.
# Solo se borran las carpetas «seg» y «aud» (la grabación en bruto); los momentos, el chat y los clips que sacaste se quedan.
GB_MINIMO, GB_LIMPIAR, GB_AVISO = 3.0, 15.0, 10.0
SESSIONS = {}


def disk_free_gb():
    try:
        return shutil.disk_usage(BASE).free / 1e9
    except Exception:
        return None


def _dir_size(p):
    n = 0
    for root, _, files in os.walk(p):
        for x in files:
            try:
                n += os.path.getsize(os.path.join(root, x))
            except Exception:
                pass
    return n


def clean_old_lives(force=False):
    try:
        days = float(load_cfg().get('dias_directos') or 3)
    except Exception:
        days = 3.0
    now = time.time()
    active = set(os.path.normcase(os.path.abspath(s.dir)) for s in SESSIONS.values() if s.alive)
    cands = []
    for d in glob.glob(os.path.join(DIRS, '*')):
        if not os.path.isdir(d) or os.path.normcase(os.path.abspath(d)) in active:
            continue
        parts = [os.path.join(d, x) for x in ('seg', 'aud') if os.path.isdir(os.path.join(d, x))]
        if not parts:
            continue
        try:
            last = max(os.path.getmtime(x) for x in [d] + [os.path.join(d, 'status.json')] if os.path.exists(x))
        except Exception:
            last = now
        cands.append((last, d, parts))
    freed, n = 0, 0
    cands.sort()
    for last, d, parts in cands:
        old = now - last > days * 86400
        free = disk_free_gb()
        low = force and free is not None and free < GB_LIMPIAR and now - last > 12 * 3600
        if not (old or low):
            continue
        for p in parts:
            sz = _dir_size(p)
            shutil.rmtree(p, ignore_errors=True)
            if not os.path.exists(p):
                freed += sz
        n += 1
    if n:
        log('🧹 Borrados los trozos de vídeo de %d directo%s antiguo%s: %.1f GB liberados (los momentos, el chat y tus clips se quedan)' % (n, '' if n == 1 else 's', '' if n == 1 else 's', freed / 1e9))
    return freed


def disk_loop():
    while True:
        free = disk_free_gb()
        clean_old_lives(force=free is not None and free < GB_LIMPIAR)
        time.sleep(600)


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which('ffmpeg') or 'ffmpeg'


FF = ffmpeg_exe()


# En Windows, que los ffmpeg que graban se cierren solos cuando se cierra esta ventana
_JOB = None


def _job_setup():
    global _JOB
    if not WIN or _JOB:
        return
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL('kernel32', use_last_error=True)

        class IO(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in ('r', 'w', 'o', 'rb', 'wb', 'ob')]

        class BASIC(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_int64), ('PerJobUserTimeLimit', ctypes.c_int64), ('LimitFlags', wintypes.DWORD),
                        ('MinimumWorkingSetSize', ctypes.c_size_t), ('MaximumWorkingSetSize', ctypes.c_size_t), ('ActiveProcessLimit', wintypes.DWORD),
                        ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD), ('SchedulingClass', wintypes.DWORD)]

        class EXT(ctypes.Structure):
            _fields_ = [('Basic', BASIC), ('Io', IO), ('ProcessMemoryLimit', ctypes.c_size_t), ('JobMemoryLimit', ctypes.c_size_t),
                        ('PeakProcessMemoryUsed', ctypes.c_size_t), ('PeakJobMemoryUsed', ctypes.c_size_t)]

        k32.CreateJobObjectW.restype = wintypes.HANDLE
        job = k32.CreateJobObjectW(None, None)
        info = EXT()
        info.Basic.LimitFlags = 0x2000   # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))
        _JOB = (k32, job)
    except Exception as e:
        log('Aviso: no pude atar ffmpeg a esta ventana (%s)' % e)


def job_add(proc):
    if not WIN:
        return
    _job_setup()
    if _JOB:
        try:
            k32, job = _JOB
            k32.AssignProcessToJobObject(job, int(proc._handle))
        except Exception:
            pass


def kill_old_ffmpeg():
    """Si quedó grabando algún ffmpeg de una vez anterior (se cerró la ventana a lo bruto), se para."""
    if not WIN:
        return
    name = os.path.basename(FF)
    if 'ffmpeg' in name.lower():
        r = subprocess.run(['taskkill', '/F', '/IM', name], capture_output=True, creationflags=NOWIN)
        if r.returncode == 0:
            log('He parado grabaciones que se habían quedado abiertas de antes.')


def run(cmd, timeout=120):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=NOWIN)
        return r.returncode, r.stdout.decode('utf-8', 'ignore'), r.stderr.decode('utf-8', 'ignore')
    except subprocess.TimeoutExpired:
        return -1, '', 'timeout'
    except Exception as e:
        return -1, '', str(e)


def http_json(url, timeout=20):
    """Kick está detrás de Cloudflare: curl_cffi se hace pasar por Chrome."""
    try:
        from curl_cffi import requests as cr
        r = cr.get(url, impersonate='chrome', timeout=timeout, headers={'Accept': 'application/json'})
        if r.status_code == 200:
            return r.json()
        return None
    except ImportError:
        pass
    except Exception:
        return None
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8', 'ignore'))
    except Exception:
        return None


def iso_ts(s):
    try:
        s = str(s).replace('Z', '+00:00')
        if ' ' in s and 'T' not in s:
            s = s.replace(' ', 'T')
        d = datetime.datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=datetime.timezone.utc)
        return d.timestamp()
    except Exception:
        return None


def append_jsonl(path, obj):
    with _lock:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(obj, ensure_ascii=False) + '\n')


def write_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)
    for i in range(6):      # en Windows falla si Clipzi lo está leyendo justo en ese instante: se reintenta
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.15)
    try:
        os.remove(tmp)
    except Exception:
        pass


def load_cfg():
    try:
        with open(CFG, encoding='utf-8') as f:
            c = json.load(f)
        return c
    except Exception:
        return {}


_OFF = {'at': 0, 'set': set()}


def is_off(src):
    """¿Está apagado en Clipzi este criterio («chat», «clipper»…)? Se vuelve a mirar config.json cada 5 s."""
    now = time.time()
    if now - _OFF['at'] > 5:
        _OFF['at'] = now
        try:
            _OFF['set'] = set(load_cfg().get('apagados') or [])
        except Exception:
            pass
    return src in _OFF['set']


# ---------------------------------------------------------------- audio: huella para encontrar momentos
def to_wav(src, dst, rate=8000):
    code, _, err = run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-ar', str(rate), '-f', 'wav', dst], timeout=120)
    return code == 0 and os.path.exists(dst)


def read_wav(path):
    import numpy as np
    with wave.open(path, 'rb') as w:
        n = w.getnframes()
        raw = w.readframes(n)
        rate = w.getframerate()
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return a, rate


HOP = 0.02   # 50 huellas por segundo


def features(a, rate=8000):
    """Huella del audio (tipo Shazam/Philips): 32 bits por instante según cómo cambia la energía entre bandas.
    Aguanta compresión, cambios de volumen y algo de música encima."""
    import numpy as np
    hop, win = int(rate * HOP), 2048
    n = max(0, (len(a) - win) // hop)
    if n < 4:
        return np.zeros((0, 32), dtype=np.float32)
    out = []
    w = np.hanning(win).astype(np.float32)
    fr = np.fft.rfftfreq(win, 1 / rate)
    ed = np.geomspace(300, 2000, 34)
    masks = [(fr >= ed[i]) & (fr < ed[i + 1]) for i in range(33)]
    for c0 in range(0, n, 4000):               # por bloques para no gastar mucha memoria
        m = min(n, c0 + 4000) - c0
        idx = np.arange(win)[None, :] + hop * (c0 + np.arange(m))[:, None]
        sp = np.abs(np.fft.rfft(a[idx] * w[None, :], axis=1)) ** 2
        out.append(np.stack([sp[:, mk].sum(1) for mk in masks], 1))
    E = np.concatenate(out)
    D = E[:, :-1] - E[:, 1:]
    B = (D[1:] - D[:-1]) > 0
    B = np.concatenate([B[:1], B])
    return np.where(B, 1.0, -1.0).astype(np.float32)


def find_in(C, R, ref_times):
    """Busca un clip (con música, cortes o subtítulos encima) dentro de la grabación.
    Varias ventanas de 5 s del clip tienen que señalar el mismo sitio. Devuelve (t0, t1, confianza) o None."""
    import numpy as np
    W = int(5 / HOP)
    if len(C) < W + 10 or len(R) < W * 2:
        return None
    N = len(R)
    L = 1 << int(np.ceil(np.log2(N + W)))
    RF = [np.fft.rfft(R[:, b], L) for b in range(R.shape[1])]
    res = []
    for st in range(int(0.5 / HOP), len(C) - W, int(2 / HOP)):
        w = C[st:st + W]
        sc = np.zeros(N - W + 1)
        for b in range(R.shape[1]):
            sc += np.fft.irfft(RF[b] * np.conj(np.fft.rfft(w[:, b], L)), L)[:N - W + 1]
        sc /= W * R.shape[1]
        k = int(sc.argmax())
        z = (sc[k] - np.median(sc)) / (sc.std() + 1e-9)
        res.append((float(ref_times[k]) - st * HOP, st, float(z)))
    # agrupar ventanas que apuntan al mismo sitio
    groups = []
    for o, st, z in sorted(res):
        if groups and o - groups[-1][-1][0] < 0.6:
            groups[-1].append((o, st, z))
        else:
            groups.append([(o, st, z)])
    good = [g for g in groups if (len(g) >= 2 and max(x[2] for x in g) >= 4.8) or len(g) >= 3]
    if not good:
        return None
    best = max(good, key=lambda g: (len(g), max(x[2] for x in g)))
    # otros trozos del mismo clip (si el clipper cortó) cerca del principal
    near = [g for g in good if abs(g[0][0] - best[0][0]) < 120]
    t0 = min(g[0][0] for g in near)
    t1 = max(g[0][0] for g in near) + len(C) * HOP
    hits = sum(len(g) for g in near)
    conf = round(min(1.0, 0.45 + 0.1 * hits + 0.03 * max(x[2] for x in best)), 2)
    return t0, t1, conf


# ---------------------------------------------------------------- TikTok (cuentas de otros clippers)
def tt_list(acc):
    """Últimos vídeos de una cuenta de TikTok: [{id, url, ts, title, play}]. Prueba yt-dlp y, si TikTok lo bloquea, tikwm."""
    errs = []
    code, out, err = run([PY, '-m', 'yt_dlp', '--impersonate', 'chrome', '--flat-playlist', '--playlist-end', '8', '-J', 'https://www.tiktok.com/@%s' % acc], timeout=120)
    if code != 0 and 'impersonat' in (err or '').lower():
        code, out, err = run([PY, '-m', 'yt_dlp', '--flat-playlist', '--playlist-end', '8', '-J', 'https://www.tiktok.com/@%s' % acc], timeout=120)
    if code == 0:
        try:
            ents = json.loads(out).get('entries') or []
            return [{'id': str(e.get('id') or ''), 'url': e.get('url') or 'https://www.tiktok.com/@%s/video/%s' % (acc, e.get('id')),
                     'ts': e.get('timestamp'), 'title': e.get('title') or e.get('description') or '', 'play': None} for e in ents if e.get('id')], None
        except Exception as e:
            errs.append('yt-dlp: %s' % e)
    else:
        errs.append('yt-dlp: ' + ((err or '').strip().splitlines() or ['?'])[-1][:120])
    # plan B: tikwm (servicio público que lee TikTok)
    j = http_json('https://www.tikwm.com/api/user/posts?unique_id=%s&count=10&cursor=0' % acc)
    vids = (((j or {}).get('data') or {}).get('videos')) if isinstance(j, dict) else None
    if vids:
        return [{'id': str(v.get('video_id') or v.get('aweme_id') or ''), 'url': 'https://www.tiktok.com/@%s/video/%s' % (acc, v.get('video_id') or v.get('aweme_id')),
                 'ts': v.get('create_time'), 'title': v.get('title') or '', 'play': v.get('play') or v.get('wmplay')} for v in vids if (v.get('video_id') or v.get('aweme_id'))], None
    errs.append('tikwm: ' + (str((j or {}).get('msg') or 'sin respuesta') if isinstance(j, dict) else 'sin respuesta'))
    return None, ' | '.join(errs)


def http_download(url, dst, timeout=120):
    try:
        from curl_cffi import requests as cr
        r = cr.get(url, impersonate='chrome', timeout=timeout, headers={'Referer': 'https://www.tiktok.com/'})
        if r.status_code == 200 and len(r.content) > 10000:
            with open(dst, 'wb') as f:
                f.write(r.content)
            return True
    except Exception:
        pass
    return False


def tt_download(item, base):
    """Descarga un vídeo de TikTok a base.mp4. Devuelve (ruta, info)."""
    info = {'title': item.get('title'), 'timestamp': item.get('ts')}
    # si ya se tiene la dirección directa del vídeo, se baja tal cual (más rápido que arrancar yt-dlp)
    if item.get('play') and http_download(item['play'], base + '.mp4', timeout=60):
        return base + '.mp4', info
    code, out, err = run([PY, '-m', 'yt_dlp', '--impersonate', 'chrome', '-f', 'mp4/best', '--no-playlist', '--write-info-json', '-o', base + '.%(ext)s', item['url']], timeout=300)
    mp4 = next((p for p in glob.glob(base + '.*') if not p.endswith('.json') and not p.endswith('.wav')), None)
    try:
        with open(base + '.info.json', encoding='utf-8') as f:
            info.update({k: v for k, v in json.load(f).items() if v is not None})
    except Exception:
        pass
    if mp4:
        return mp4, info
    play = item.get('play')
    if not play:
        j = http_json('https://www.tikwm.com/api/?url=%s' % item['url'])
        d = (j or {}).get('data') or {} if isinstance(j, dict) else {}
        play = d.get('play') or d.get('wmplay')
        info.setdefault('title', d.get('title'))
        if d.get('create_time'):
            info['timestamp'] = d.get('create_time')
    if play and http_download(play, base + '.mp4'):
        return base + '.mp4', info
    return None, info


# ---------------------------------------------------------------- Kick
PUSHER_DEFAULTS = [('34bf7a0ff419a2a775b9', 'us2'), ('32cbd69e4b950bf97679', 'us2')]


def http_post_json(url, body, timeout=20):
    try:
        from curl_cffi import requests as cr
        r = cr.post(url, json=body, impersonate='chrome', timeout=timeout, headers={'Accept': 'application/json', 'Origin': 'https://kick.com', 'Referer': 'https://kick.com/'})
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text[:500]
    except Exception as e:
        return 0, str(e)


def walk(o):
    """Todos los pares (clave, valor) de un JSON, a cualquier profundidad."""
    if isinstance(o, dict):
        for k, v in o.items():
            yield k, v
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def pusher_keys():
    """La clave de Pusher que usa Kick ahora (la pregunta a Kick) y las conocidas por si acaso."""
    out = []
    code, j = http_post_json('https://web.kick.com/api/v1/realtime/connection',
                             {'client': {'id': str(uuid.uuid4()), 'type': 'web'}, 'capabilities': {'accepted_providers': [{'provider': 'pusher'}]}})
    key = cl = None
    for k, v in walk(j):
        if k in ('app_key', 'key', 'appKey') and isinstance(v, str) and re.fullmatch(r'[0-9a-f]{16,32}', v):
            key = v
        if k == 'cluster' and isinstance(v, str):
            cl = v
    if key:
        out.append((key, cl or 'us2'))
    for d in PUSHER_DEFAULTS:
        if d not in out:
            out.append(d)
    return out


def kick_centrifugo(channel_id, chatroom_id):
    """Pregunta a Kick por su chat nuevo (Centrifugo): dirección del websocket y permiso (token)."""
    body = {'client': {'id': str(uuid.uuid4()), 'type': 'web'}, 'capabilities': {'accepted_providers': [{'provider': 'centrifugo'}, {'provider': 'pusher'}]}}
    url = token = None
    tried = []
    for u in ('https://web.kick.com/api/v1/realtime/channels/%s/chat/connection' % channel_id,
              'https://web.kick.com/api/v1/realtime/connection'):
        code, j = http_post_json(u, body)
        tried.append('%s→%s %s' % (u.split('kick.com')[1], code, json.dumps(j)[:300] if not isinstance(j, str) else j[:300]))
        for k, v in walk(j):
            if isinstance(v, str) and v.startswith('wss://') and not url:
                url = v
            if k in ('token', 'connection_token', 'connectionToken') and isinstance(v, str) and not token:
                token = v
        if url:
            break
    if url and not token:
        code, j = http_post_json('https://web.kick.com/api/v1/realtime/auth/connection', body)
        tried.append('/auth/connection→%s %s' % (code, json.dumps(j)[:300] if not isinstance(j, str) else j[:300]))
        for k, v in walk(j):
            if k in ('token', 'connection_token', 'connectionToken') and isinstance(v, str):
                token = v
                break
    if not url:
        url = 'wss://realtime.us-east-1.platform.kick.com/connection/websocket'
    with open(os.path.join(BASE, 'chat_debug.log'), 'a', encoding='utf-8') as f:
        f.write(time.strftime('%H:%M:%S ') + ' | '.join(tried) + '\n')
    return url, token


def find_chat_msg(d):
    """Saca (usuario, texto) de un mensaje del chat de Kick, venga en el formato que venga."""
    if not isinstance(d, (dict, list)):
        return None
    for o in [d] + [v for k, v in walk(d) if isinstance(v, dict)]:
        if isinstance(o, dict) and 'content' in o and isinstance(o.get('content'), str):
            snd = o.get('sender') or o.get('user') or {}
            user = snd.get('username') or snd.get('slug') or '' if isinstance(snd, dict) else str(snd)
            return str(user), o['content'][:200]
    return None
HYPE = re.compile(r'(ja){2,}|j{2,}a|(xd)+|kek|lul|lmao|🤣|😂|💀|omg|clip|clipea|no mames|nooo+|qu[eé]+ (pas|fu)|wtf|aja{2,}', re.I)


def kick_info(slug):
    return http_json('https://kick.com/api/v2/channels/%s' % slug)


def kick_stream_url(slug, test_file=None):
    if test_file:
        return test_file if os.path.exists(test_file) else None
    url = 'https://kick.com/%s' % slug
    code, out, err = run([PY, '-m', 'streamlink', '--stream-url', url, 'best'], timeout=60)
    if code == 0 and out.strip().startswith('http'):
        return out.strip().splitlines()[-1]
    code, out, err = run([PY, '-m', 'yt_dlp', '-g', '-f', 'best', url], timeout=90)
    if code == 0:
        for line in out.splitlines():
            if line.startswith('http'):
                return line.strip()
    return None


# ---------------------------------------------------------------- una sesión = un directo que se está grabando
class Session:
    def __init__(self, ch, test_file=None):
        self.slug = ch['kick'].strip().lower().lstrip('@')
        self.client = ch.get('client', '')
        self.cfg = ch
        self.test = test_file
        stamp = datetime.datetime.now().strftime('%Y%m%d_%H%M')
        self.dir = os.path.join(DIRS, '%s_%s' % (self.slug, stamp))
        self.t0 = time.time()
        self.alive = True
        self.segs = []          # [{f, wav, t0, t1}]
        self.bins = {}          # mensajes del chat por cada 5 s
        self.nchat = 0
        self.run_base = 0
        # si el grabador se ha reiniciado en mitad del directo, se sigue en la misma carpeta (antes salía el directo partido en trozos)
        prev = self.recent_dir() if not test_file else None
        if prev:
            self.dir, self.t0, self.nchat, self.segs, self.run_base = prev
        for d in ('seg', 'req', 'out', 'clippers', 'aud'):
            os.makedirs(os.path.join(self.dir, d), exist_ok=True)
        self.last_spike = 0
        self.kick_seen = set()
        self.tt_seen = {}
        self.chatroom = None
        self.channel_id = None
        self.chat_start = 0
        self.proc = None
        self.err = ''
        self.feat_cache = {}
        self.status()
        if prev:
            log('🔴 %s sigue en directo: continúo en la misma carpeta %s' % (self.slug, self.dir))
        else:
            log('🔴 %s está en directo: grabando en %s' % (self.slug, self.dir))
        for fn in (self.rec_loop, self.chat_loop, self.spike_loop, self.kick_clips_loop, self.clippers_loop, self.req_loop, self.wav_loop):
            threading.Thread(target=self.safe(fn), daemon=True).start()

    def recent_dir(self, minutes=20):
        """La carpeta de este canal que se estaba grabando hace menos de 20 minutos (si la hay): (carpeta, inicio, chat, trozos, última tanda)."""
        best = None
        for d in glob.glob(os.path.join(DIRS, '%s_*' % self.slug)):
            try:
                with open(os.path.join(d, 'status.json'), encoding='utf-8') as f:
                    st = json.load(f)
            except Exception:
                continue
            if st.get('test') or st.get('slug') != self.slug or time.time() - float(st.get('updated') or 0) > minutes * 60:
                continue
            if not best or st.get('updated', 0) > best[1].get('updated', 0):
                best = (d, st)
        if not best:
            return None
        d, st = best
        segs = []
        try:
            with open(os.path.join(d, 'segments.jsonl'), encoding='utf-8') as f:
                for l in f:
                    try:
                        segs.append(json.loads(l))
                    except Exception:
                        pass
        except Exception:
            pass
        runs = [0]
        for p in glob.glob(os.path.join(d, 'seg', 'r*_*.mp4')) + glob.glob(os.path.join(d, 'seg', 'list_*.csv')) + glob.glob(os.path.join(d, 'aud', 'live_*_*.pcm')):
            m = re.search(r'(?:r|list_|live_)(\d+)', os.path.basename(p))
            if m:
                runs.append(int(m.group(1)))
        for s in segs:
            m = re.search(r'/r(\d+)_', '/' + s.get('f', ''))
            if m:
                runs.append(int(m.group(1)))
        return d, float(st.get('started') or time.time()), int(st.get('chat') or 0), segs, max(runs)

    def safe(self, fn):
        # si un trabajo de la grabación falla, se vuelve a poner en marcha mientras siga el directo
        return forever(fn, fn.__name__, lambda: self.alive)

    def status(self, **kw):
        free = disk_free_gb()
        st = {'slug': self.slug, 'client': self.client, 'started': self.t0, 'updated': time.time(), 'live': self.alive,
              'segments': len(self.segs), 'chat': self.nchat, 'chat_off': is_off('chat'), 'error': self.err, 'test': bool(self.test),
              'disco_gb': round(free, 1) if free is not None else None,
              'disco': '' if free is None or free >= GB_AVISO else ('lleno' if getattr(self, 'disk_paused', False) else 'bajo')}
        st.update(kw)
        try:
            write_json(os.path.join(self.dir, 'status.json'), st)
        except Exception:
            pass

    def moment(self, src, t0, t1, conf, info='', **extra):
        m = {'id': uuid.uuid4().hex[:10], 'src': src, 't0': round(t0, 2), 't1': round(t1, 2), 'conf': conf, 'info': info, 'at': time.time()}
        m.update(extra)
        append_jsonl(os.path.join(self.dir, 'moments.jsonl'), m)
        log('✨ Momento (%s): %s' % (src, info))

    # ---------- grabar en trozos de 1 minuto
    def wait_disk(self):
        """Si queda muy poco disco, la grabación se para hasta que haya sitio (se intenta liberar borrando trozos de directos viejos)."""
        free = disk_free_gb()
        if free is None or free >= GB_MINIMO:
            return
        self.disk_paused = True
        log('💾 Solo quedan %.1f GB libres: paro la grabación de %s para no llenar el disco. Sigo en cuanto haya sitio.' % (free, self.slug))
        while self.alive:
            self.status()
            clean_old_lives(force=True)
            free = disk_free_gb()
            if free is None or free >= GB_MINIMO + 2:
                break
            time.sleep(60)
        self.disk_paused = False
        log('💾 Ya hay sitio (%.1f GB): sigo grabando %s.' % (free or 0, self.slug))
        self.status()

    def rec_loop(self):
        run_n = self.run_base
        missing_since = None
        while self.alive:
            self.wait_disk()
            if not self.alive:
                break
            url = kick_stream_url(self.slug, self.test)
            if not url:
                missing_since = missing_since or time.time()
                if time.time() - missing_since > 240:       # 4 minutos sin directo: se acabó
                    log('⚫ %s ya no está en directo. Fin de la grabación.' % self.slug)
                    self.alive = False
                    break
                time.sleep(15)
                continue
            missing_since = None
            run_n += 1
            # la dirección del vídeo en directo, para la ventanita de Cortex (se ve y se silencia sin recargar)
            try:
                with open(os.path.join(self.dir, 'aud', 'hls.json'), 'w', encoding='utf-8') as f:
                    json.dump({'url': url, 't': time.time()}, f)
            except Exception:
                pass
            listf = os.path.join(self.dir, 'seg', 'list_%d.csv' % run_n)
            pattern = os.path.join(self.dir, 'seg', 'r%d_%%05d.mp4' % run_n)
            cmd = [FF, '-hide_banner', '-loglevel', 'error', '-y']
            if self.test:
                cmd += ['-re']
            cmd += ['-i', url, '-map', '0:v:0?', '-map', '0:a:0?', '-c', 'copy', '-f', 'segment', '-segment_time', SEGLEN,
                    '-reset_timestamps', '1', '-segment_list', listf, '-segment_list_type', 'csv', pattern]
            # además, el audio en vivo (16 kHz, mono, sin cabecera) para los subtítulos en directo de Cortex
            # (sale por una tubería: solo se guarda en disco mientras la transcripción está encendida en Clipzi)
            cmd += ['-map', '0:a:0?', '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-flush_packets', '1', 'pipe:1']
            errf = open(os.path.join(self.dir, 'ffmpeg.log'), 'a')
            self.proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=errf, creationflags=NOWIN)
            job_add(self.proc)
            threading.Thread(target=self.pcm_pump, args=(self.proc, run_n), daemon=True).start()
            done, chk = 0, 0
            while self.proc.poll() is None and self.alive:
                time.sleep(2)
                done = self.read_list(listf, done)
                chk += 1
                if chk % 15 == 0:            # cada 30 s se mira el disco: si se está llenando, se para esta tanda
                    free = disk_free_gb()
                    if free is not None and free < GB_MINIMO:
                        break
            if self.proc.poll() is None:
                self.proc.terminate()
            time.sleep(1)
            done = self.read_list(listf, done)
            # el trozo que se estaba grabando cuando se cortó
            last = sorted(glob.glob(os.path.join(self.dir, 'seg', 'r%d_*.mp4' % run_n)))
            if last and not any(s['f'].endswith(os.path.basename(last[-1])) for s in self.segs):
                self.add_seg(last[-1], None)
            errf.close()
            if self.test:          # en modo prueba el vídeo se acaba una vez
                log('Fin del vídeo de prueba.')
                time.sleep(60)
                self.alive = False
        self.status()

    def pcm_pump(self, proc, run_n):
        """Recoge el audio en vivo de ffmpeg. Con la transcripción apagada en Clipzi se tira; encendida, se guarda para los subtítulos en directo."""
        part, f, rel, t0, nbytes, told = 0, None, '', 0, 0, False
        while True:
            try:
                b = proc.stdout.read(6400)       # 0,2 s de audio
            except Exception:
                b = b''
            if not b:
                break
            try:
                if is_off('voz'):
                    if f:
                        f.close()
                        f = None
                    continue
                if f is None:                    # se enciende (o empieza): archivo nuevo con su hora real de inicio
                    part += 1
                    rel = 'aud/live_%d_%d.pcm' % (run_n, part)
                    f = open(os.path.join(self.dir, rel), 'wb')
                    t0, nbytes, told = time.time() - len(b) / 32000.0, 0, False
                f.write(b)
                f.flush()
                nbytes += len(b)
                if not told and nbytes >= 64000:  # hora real del primer segundo de audio (para saber en qué momento del directo cae cada palabra)
                    told = True
                    with open(os.path.join(self.dir, 'aud', 'live.json'), 'w', encoding='utf-8') as j:
                        json.dump({'file': rel, 't0': round(t0, 3), 'rate': 16000, 'run': run_n}, j)
            except Exception:
                pass                             # pase lo que pase se sigue leyendo: si no, ffmpeg se atasca y deja de grabar
        try:
            if f:
                f.close()
        except Exception:
            pass

    def need_wav(self):
        # el audio de cada trozo solo hace falta para: otros clippers, la IA que escucha o la transcripción
        return not (is_off('clipper') and is_off('ia') and is_off('voz'))

    def ensure_wav(self, s):
        wav = os.path.join(self.dir, s['wav'])
        if os.path.exists(wav):
            return True
        return to_wav(os.path.join(self.dir, s['f']), wav)

    def wav_loop(self):
        """Si enciendes una función que usa el audio de los trozos, se preparan los que faltan (primero los más recientes)."""
        while self.alive:
            time.sleep(3)
            if not self.need_wav():
                continue
            for s in reversed(self.segs[-90:]):
                if not self.alive or not self.need_wav():
                    break
                if not os.path.exists(os.path.join(self.dir, s['wav'])):
                    self.ensure_wav(s)
                    time.sleep(0.5)

    def read_list(self, listf, done):
        try:
            with open(listf, encoding='utf-8') as f:
                lines = [l.strip() for l in f if l.strip()]
        except Exception:
            return done
        for line in lines[done:]:
            parts = line.split(',')
            if len(parts) < 3:
                continue
            path = os.path.join(self.dir, 'seg', os.path.basename(parts[0]))
            try:
                dur = float(parts[2]) - float(parts[1])
            except Exception:
                dur = None
            self.add_seg(path, dur)
        return len(lines)

    def add_seg(self, path, dur):
        if not os.path.exists(path):
            return
        t1 = os.path.getmtime(path)
        wav = path[:-4] + '.wav'
        if self.need_wav() or dur is None:
            to_wav(path, wav)
        if dur is None:
            try:
                with wave.open(wav, 'rb') as w:
                    dur = w.getnframes() / w.getframerate()
            except Exception:
                dur = float(SEGLEN)
        s = {'f': os.path.relpath(path, self.dir).replace('\\', '/'), 'wav': os.path.relpath(wav, self.dir).replace('\\', '/'),
             't0': round(t1 - dur, 3), 't1': round(t1, 3)}
        self.segs.append(s)
        append_jsonl(os.path.join(self.dir, 'segments.jsonl'), s)
        self.status()

    # ---------- chat de Kick (en tiempo real)
    def chat_loop(self):
        if self.test:
            return
        try:
            import asyncio
            import websockets
        except ImportError:
            log('Falta «websockets»: no se lee el chat')
            return
        chatf = os.path.join(self.dir, 'chat.jsonl')
        self.chat_ok = False

        def got(d):
            if is_off('chat'):      # chat apagado en Clipzi: no se cuenta ni se guarda nada
                return
            msg = find_chat_msg(d)
            if not msg:
                return
            user, txt = msg
            now = time.time()
            self.on_chat(now, user, txt)
            append_jsonl(chatf, {'t': round(now, 2), 'u': user, 'm': txt})
            if not self.chat_start:
                self.chat_start = now
            if not self.chat_ok:
                self.chat_ok = True
                self.err = ''
                log('💬 Leyendo el chat de %s' % self.slug)

        async def pusher(key, cluster):
            url = 'wss://ws-%s.pusher.com/app/%s?protocol=7&client=js&version=8.4.0&flash=false' % (cluster, key)
            async with websockets.connect(url, open_timeout=20, ping_interval=None, max_size=2 ** 22) as ws:
                for ch in ('chatrooms.%s.v2' % self.chatroom, 'chatroom_%s' % self.chatroom):
                    await ws.send(json.dumps({'event': 'pusher:subscribe', 'data': {'auth': '', 'channel': ch}}))
                idle = 0
                while self.alive and not is_off('chat'):
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=10)
                        idle = 0
                    except asyncio.TimeoutError:
                        idle += 10
                        if idle >= 90:
                            idle = 0
                            await ws.send(json.dumps({'event': 'pusher:ping', 'data': {}}))
                        continue
                    m = json.loads(raw)
                    ev = m.get('event', '')
                    if ev == 'pusher:ping':
                        await ws.send(json.dumps({'event': 'pusher:pong', 'data': {}}))
                    elif ev == 'pusher:error':
                        code = ((m.get('data') if isinstance(m.get('data'), dict) else json.loads(m.get('data') or '{}')) or {}).get('code')
                        if code in (4001, 4003, 4004):
                            return 'badkey'
                    elif 'ChatMessage' in ev:
                        d = m.get('data')
                        got(json.loads(d) if isinstance(d, str) else d)
            return 'closed'

        async def centrifugo():
            url, token = kick_centrifugo(self.channel_id, self.chatroom)
            if not url:
                return 'nourl'
            try:
                conn = websockets.connect(url, open_timeout=20, ping_interval=None, max_size=2 ** 22, additional_headers={'Origin': 'https://kick.com'})
            except TypeError:
                conn = websockets.connect(url, open_timeout=20, ping_interval=None, max_size=2 ** 22, extra_headers={'Origin': 'https://kick.com'})
            async with conn as ws:
                await ws.send(json.dumps({'connect': {'token': token or '', 'name': 'js'}, 'id': 1}))
                n = 2
                for ch in ('chatrooms.%s.v2' % self.chatroom, 'chatroom_%s' % self.chatroom, 'channel.%s' % self.channel_id):
                    await ws.send(json.dumps({'subscribe': {'channel': ch, 'flag': 1}, 'id': n}))
                    n += 1
                quiet = 0
                while self.alive and not is_off('chat'):
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=10)
                        quiet = 0
                    except asyncio.TimeoutError:
                        quiet += 10
                        if quiet >= 120:
                            raise
                        continue
                    for line in str(raw).splitlines():
                        if not line.strip():
                            continue
                        m = json.loads(line)
                        if m == {}:                      # ping de Centrifugo: hay que contestar
                            await ws.send('{}')
                            continue
                        if m.get('error'):
                            log('Chat (nuevo sistema de Kick) dice: %s' % json.dumps(m['error'])[:200])
                            if m.get('id') == 1:
                                return 'autherr'
                        pub = (m.get('push') or {}).get('pub') or m.get('pub')
                        if pub:
                            d = pub.get('data')
                            if isinstance(d, str):
                                try:
                                    d = json.loads(d)
                                except Exception:
                                    pass
                            if isinstance(d, dict) and isinstance(d.get('data'), str):
                                try:
                                    d['data'] = json.loads(d['data'])
                                except Exception:
                                    pass
                            got(d)
            return 'closed'

        async def main():
            fails = 0
            was_off = False
            while self.alive:
                if is_off('chat'):      # apagado en Clipzi: se desconecta del chat y espera a que lo vuelvas a encender
                    if not was_off:
                        log('💬 Chat apagado en Clipzi: dejo de leer el chat de %s' % self.slug)
                        was_off = True
                        self.chat_ok = False
                        self.chat_start = 0
                        self.bins.clear()
                        if self.err == 'chat':
                            self.err = ''
                        self.status()
                    await asyncio.sleep(3)
                    continue
                if was_off:
                    log('💬 Chat encendido otra vez: vuelvo a leer el chat de %s' % self.slug)
                    was_off = False
                    fails = 0
                if not self.chatroom:
                    info = kick_info(self.slug) or {}
                    self.chatroom = (info.get('chatroom') or {}).get('id')
                    self.channel_id = info.get('id')
                    if not self.chatroom:
                        log('No puedo leer el chat de %s (Kick no responde). Lo vuelvo a intentar…' % self.slug)
                        self.err = 'chat'
                        await asyncio.sleep(60)
                        continue
                res = None
                # 1) el sistema de siempre (Pusher) con la clave actual de Kick
                for key, cluster in pusher_keys():
                    try:
                        res = await pusher(key, cluster)
                    except Exception as e:
                        res = 'err:%s' % e
                    if res != 'badkey':
                        if res == 'closed':
                            break
                    if self.chat_ok or not self.alive:
                        break
                # 2) el sistema nuevo de Kick (Centrifugo)
                if not self.chat_ok and self.alive:
                    try:
                        res = await centrifugo()
                    except Exception as e:
                        res = 'err:%s' % e
                if not self.alive:
                    break
                if is_off('chat'):
                    continue
                fails += 1
                if not self.chat_ok:
                    self.err = 'chat'
                    if fails in (1, 3, 10):
                        log('Todavía no puedo leer el chat de %s (%s). Sigo grabando el vídeo igual.' % (self.slug, str(res)[:150]))
                self.chat_ok = False
                await asyncio.sleep(min(120, 8 * fails))

        asyncio.run(main())

    def on_chat(self, t, user, txt):
        b = int(t // 5)
        x = self.bins.setdefault(b, {'n': 0, 'u': set(), 'h': 0, 's': []})
        x['n'] += 1
        x['u'].add(user)
        if HYPE.search(txt or ''):
            x['h'] += 1
        if len(x['s']) < 6 and txt:
            x['s'].append(txt[:60])
        self.nchat += 1

    # ---------- picos del chat = algo ha pasado
    def spike_loop(self):
        while self.alive:
            time.sleep(5)
            now = time.time()
            b = int(now // 5) - 1
            if is_off('chat'):
                continue
            # hace falta 2 minutos de chat para saber qué es «normal» (al conectar llega de golpe lo anterior)
            if not self.chat_start or now - self.chat_start < 120:
                continue
            first = int(self.chat_start // 5) + 2
            prev = [self.bins.get(i, {'n': 0})['n'] for i in range(max(first, b - 60), b - 1)]
            nz = sorted(prev)
            base = nz[len(nz) // 2] if nz else 0
            cur = self.bins.get(b)
            # olvidar lo muy viejo
            for k in [k for k in self.bins if k < b - 200]:
                del self.bins[k]
            n, users = (cur['n'], len(cur['u'])) if cur else (0, 0)
            hot = cur and n >= max(8, base * 2) and users >= 4
            pend = getattr(self, 'spike_pend', None)
            # un pico del chat (2 veces lo normal o más): se espera a que baje para guardar su máximo (×2, ×3, ×8…)
            if hot:
                x = n / max(1.0, base)
                if not pend:
                    pend = self.spike_pend = {'b0': b, 'x': 0}
                if x > pend['x']:
                    pend.update(x=x, n=n, base=base, b=b, s=cur['s'], h=cur['h'])
            if pend and (not hot or b - pend['b0'] >= 6):
                self.spike_pend = None
                if now - self.last_spike >= 20:
                    self.last_spike = now
                    x = round(pend['x'], 1)
                    conf = round(min(1.0, 0.35 + x * 0.08 + pend['h'] * 0.02), 2)
                    self.moment('chat', pend['b0'] * 5 - 32, pend['b'] * 5 + 8, conf,
                                'Chat ×%s · %d mensajes en 5 s (normal: %d)' % (('%g' % x), pend['n'], pend['base']), sample=pend['s'], x=x)

    # ---------- clips que crean los espectadores en Kick
    def kick_clips_loop(self):
        if self.test or True:      # desactivado: los clips de espectadores ya no son criterio
            return
        first = True
        while self.alive:
            j = http_json('https://kick.com/api/v2/channels/%s/clips?sort=date&time=day' % self.slug) or {}
            clips = j.get('clips') or j.get('data') or []
            if isinstance(clips, dict):
                clips = clips.get('data') or []
            for c in clips if isinstance(clips, list) else []:
                cid = str(c.get('id') or c.get('clip_id') or '')
                if not cid or cid in self.kick_seen:
                    continue
                self.kick_seen.add(cid)
                created = iso_ts(c.get('created_at') or c.get('createdAt'))
                if first or not created or created < self.t0 - 30:
                    continue
                dur = float(c.get('duration') or 30)
                self.moment('kick', created - dur - 4, created + 2, 0.8, str(c.get('title') or 'Clip de un espectador'),
                            views=c.get('view_count') or c.get('views') or 0, url='https://kick.com/%s/clips/%s' % (self.slug, cid))
            first = False
            time.sleep(60)

    # ---------- catálogo de clippers: cuando suben algo, se busca ese momento en tu grabación
    def clippers_loop(self):
        if self.test:   # modo prueba: los vídeos que metas en la carpeta «prueba_clips» hacen de clips de otros clippers
            seen = set()
            while self.alive:
                for f in sorted(glob.glob(os.path.join(BASE, 'prueba_clips', '*.mp4'))):
                    if f in seen:
                        continue
                    seen.add(f)
                    dst = os.path.join(self.dir, 'clippers', 'prueba_' + os.path.basename(f))
                    shutil.copy(f, dst)
                    self.check_local(dst, 'prueba')
                time.sleep(3)
            return
        warned = set()
        while self.alive or time.time() - self.t0 < 3600 * 12 and time.time() - self.end_time() < 1800:
            if is_off('clipper'):   # «Otros clippers» apagado en Clipzi: no se miran sus cuentas
                time.sleep(15)
                continue
            # la lista se vuelve a leer cada vez: puedes añadir cuentas en Clipzi sin reiniciar nada
            accounts = [a.strip().lstrip('@') for a in (self.cfg.get('clippers') or []) if a.strip()]
            blocked = False
            for acc in accounts:
                ents, why = tt_list(acc)
                if ents is None and re.search(r'429|too many|rate|block|captcha|forbidden|403', str(why or ''), re.I):
                    blocked = True
                if ents is None:
                    if acc not in warned:
                        warned.add(acc)
                        log('No puedo ver la cuenta @%s ahora mismo (%s). Lo sigo intentando.' % (acc, why))
                    continue
                if acc in warned:
                    warned.discard(acc)
                first = acc not in self.tt_seen
                seen = self.tt_seen.setdefault(acc, set())
                if first:
                    log('👀 Vigilando a @%s (%d vídeos suyos ya subidos: esos no cuentan)' % (acc, len(ents)))
                for e in ents:
                    if e['id'] in seen:
                        continue
                    seen.add(e['id'])
                    if first or (e.get('ts') and e['ts'] < self.t0 - 300):
                        continue            # lo que ya estaba subido antes de empezar no cuenta
                    threading.Thread(target=self.safe(lambda a=acc, it=e: self.check_clip(a, it)), daemon=True).start()
                time.sleep(0.2)
            # se revisan sin parar (cada 5 s); si TikTok empieza a bloquear, se espera más y luego vuelve a ir rápido
            if blocked:
                self.tt_backoff = min(300, max(60, getattr(self, 'tt_backoff', 0) * 2))
                log('TikTok va lento con tantas consultas: espero %d s antes de volver a mirar' % self.tt_backoff)
                time.sleep(self.tt_backoff)
            else:
                self.tt_backoff = 0
                time.sleep(2 if accounts else 30)

    def check_local(self, mp4, acc):
        rec = {'acc': acc, 'id': os.path.basename(mp4), 'url': '', 'title': os.path.basename(mp4), 'at': time.time(), 'found': False}
        wav = mp4[:-4] + '.wav'
        r = self.locate(wav) if to_wav(mp4, wav) else None
        if r:
            rec.update({'found': True, 't0': r[0], 't1': r[1], 'conf': r[2]})
            self.moment('clipper', r[0], r[1], r[2], 'Clip de prueba: ' + os.path.basename(mp4), who='@' + acc)
        append_jsonl(os.path.join(self.dir, 'clippers.jsonl'), rec)

    def end_time(self):
        return self.segs[-1]['t1'] if self.segs else self.t0

    def check_clip(self, acc, item):
        vid, url = item['id'], item['url']
        base = os.path.join(self.dir, 'clippers', '%s_%s' % (acc, vid))
        log('📱 @%s ha subido un clip. Buscando ese momento…' % acc)
        mp4, info = tt_download(item, base)
        title = (info.get('title') or info.get('description') or '')[:160]
        rec = {'acc': acc, 'id': vid, 'url': url, 'title': title, 'views': info.get('view_count'), 'at': time.time(), 'found': False}
        ts = info.get('timestamp')
        if ts and ts < self.t0 - 300:          # es un vídeo de antes de empezar a grabar: no puede estar en lo grabado
            log('El vídeo de @%s es antiguo (de antes de grabar): no cuenta' % acc)
            return
        if not mp4 or not to_wav(mp4, base + '.wav'):
            rec['why'] = 'no se pudo descargar'
            append_jsonl(os.path.join(self.dir, 'clippers.jsonl'), rec)
            log('No pude descargar el clip de @%s' % acc)
            return
        r = self.locate(base + '.wav')
        if r:
            t0, t1, conf = r
            rec.update({'found': True, 't0': t0, 't1': t1, 'conf': conf})
            self.moment('clipper', t0, t1, conf, title or 'Clip de @%s' % acc, who='@' + acc, url=url, views=info.get('view_count'))
        else:
            rec['why'] = 'no está en lo grabado'
            log('El clip de @%s no está en lo que has grabado' % acc)
        append_jsonl(os.path.join(self.dir, 'clippers.jsonl'), rec)

    def locate(self, wav_path, window_min=60):
        import numpy as np
        a, rate = read_wav(wav_path)
        C = features(a, rate)
        segs = [s for s in self.segs if s['t1'] > time.time() - window_min * 60] or self.segs[-window_min * 3:]
        F, T = [], []
        for s in segs:
            k = s['wav']
            if k not in self.feat_cache:
                try:
                    self.ensure_wav(s)
                    aa, rr = read_wav(os.path.join(self.dir, k))
                    self.feat_cache[k] = features(aa, rr)
                except Exception:
                    continue
            f = self.feat_cache[k]
            F.append(f)
            T.append(s['t0'] + np.arange(len(f)) * HOP)
        if not F:
            return None
        return find_in(C, np.concatenate(F), np.concatenate(T))

    # ---------- Clipzi pide un clip: se juntan los trozos (sin volver a comprimir: es instantáneo)
    def req_loop(self):
        last_clean = 0
        while self.alive or time.time() - self.end_time() < 3600 * 6:
            # los clips que se preparan para Cortex son copias: se borran a los 15 min para no llenar el disco
            if time.time() - last_clean > 60:
                last_clean = time.time()
                clean_out(self.dir, 900)
            for rq in glob.glob(os.path.join(self.dir, 'req', '*.json')):
                rid = os.path.basename(rq)[:-5]
                outj = os.path.join(self.dir, 'out', rid + '.json')
                if os.path.exists(outj):
                    continue
                try:
                    with open(rq, encoding='utf-8') as f:
                        q = json.load(f)
                    self.cut(rid, float(q['t0']), float(q['t1']), outj)
                except Exception as e:
                    write_json(outj, {'error': str(e)})
            time.sleep(0.25)

    def cut(self, rid, t0, t1, outj):
        segs = [s for s in self.segs if s['t1'] > t0 - 2 and s['t0'] < t1 + 2]
        if not segs:
            write_json(outj, {'error': 'Ese momento todavía no está grabado'})
            return
        lst = os.path.join(self.dir, 'out', rid + '.txt')
        with open(lst, 'w', encoding='utf-8') as f:
            for s in segs:
                p = os.path.join(self.dir, s['f']).replace('\\', '/').replace("'", "'\\''")
                f.write("file '%s'\n" % p)
        mp4 = os.path.join(self.dir, 'out', rid + '.mp4')
        code, _, err = run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', mp4], timeout=300)
        if code != 0 or not os.path.exists(mp4):
            write_json(outj, {'error': 'ffmpeg: ' + err[-300:]})
            return
        write_json(outj, {'file': 'out/%s.mp4' % rid, 'offset': round(t0 - segs[0]['t0'], 3), 'dur': round(t1 - t0, 3)})
        log('✂️ Clip listo para Clipzi (%d s)' % round(t1 - t0))


def clean_out(sess_dir, older):
    """Borra las copias de clips ya usadas (carpetas out y req). La grabación original (seg) no se toca."""
    n = 0
    now = time.time()
    for sub in ('out', 'req'):
        for f in glob.glob(os.path.join(sess_dir, sub, '*')):
            try:
                if os.path.isfile(f) and now - os.path.getmtime(f) > older:
                    os.remove(f)
                    n += 1
            except Exception:
                pass
    return n


def clean_all_out():
    try:
        for d in glob.glob(os.path.join(BASE, 'directos', '*')):
            if os.path.isdir(d):
                clean_out(d, 900)
    except Exception:
        pass


# ---------------------------------------------------------------- descargar vídeos por enlace (YouTube, Kick, Twitch, TikTok…)
DL = os.path.join(BASE, 'descargas')
_deno = None


def deno_path():
    """YouTube necesita Deno (un programa pequeño) para que yt-dlp pueda descargar. Si no está, se descarga solo."""
    global _deno
    if _deno is not None:
        return _deno or None
    cand = [shutil.which('deno'), os.path.join(BASE, 'deno.exe' if WIN else 'deno')]
    try:
        import sysconfig
        cand.append(os.path.join(sysconfig.get_path('scripts'), 'deno.exe' if WIN else 'deno'))
    except Exception:
        pass
    for c in cand:
        if c and os.path.exists(c):
            _deno = c
            return c
    if WIN:
        try:
            log('Descargando Deno (lo necesita YouTube, solo la primera vez)…')
            import zipfile, io, urllib.request
            url = 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip'
            data = None
            try:
                from curl_cffi import requests as cr
                r = cr.get(url, impersonate='chrome', timeout=180)
                data = r.content if r.status_code == 200 else None
            except Exception:
                pass
            if not data:
                with urllib.request.urlopen(url, timeout=180) as r:
                    data = r.read()
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                z.extract('deno.exe', BASE)
            _deno = os.path.join(BASE, 'deno.exe')
            return _deno
        except Exception as e:
            log('No pude descargar Deno (%s). YouTube puede fallar.' % e)
    _deno = ''
    return None


def hms(v):
    """'1:23:45', '83:10', '125' o 125 → segundos."""
    if v in (None, ''):
        return None
    try:
        parts = [float(x) for x in str(v).strip().split(':')]
    except Exception:
        return None
    t = 0
    for x in parts:
        t = t * 60 + x
    return t


def perfil_one(rid, q):
    """Lista de vídeos de cuentas de TikTok (o canales de YouTube) con sus visitas, likes, etc. No descarga vídeos."""
    outj = os.path.join(DL, 'out', rid + '.json')
    accs = [a.strip() for a in (q.get('accounts') or []) if a and a.strip()]
    maxn = int(q.get('max') or 100)
    pdir = os.path.join(DL, 'perfiles'); os.makedirs(pdir, exist_ok=True)
    outf = os.path.join(pdir, rid + '.jsonl')
    total, errs = 0, {}
    ck = os.path.join(BASE, 'cookies.txt')
    stopf = os.path.join(DL, 'req', rid + '.stop')

    def url_of(a):
        if a.startswith('http'):
            return a
        return 'https://www.tiktok.com/@' + a.lstrip('@')

    def run(cmd, acc, done):
        n = 0
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, creationflags=NOWIN)
        job_add(p)
        with open(outf, 'a', encoding='utf-8') as f:
            for raw in iter(p.stdout.readline, b''):
                if os.path.exists(stopf):   # Clipzi pide parar: se queda con lo recogido
                    try: p.terminate()
                    except Exception: pass
                    break
                try:
                    j = json.loads(raw.decode('utf-8', 'ignore'))
                except Exception:
                    continue
                vid = str(j.get('id') or '')
                if not vid or vid in done:
                    continue
                done.add(vid)
                rec = {'acc': acc or str(j.get('uploader') or j.get('channel') or '?').lstrip('@'), 'id': vid, 'url': j.get('webpage_url') or j.get('original_url') or '',
                       'views': j.get('view_count'), 'likes': j.get('like_count'), 'comments': j.get('comment_count'),
                       'shares': j.get('repost_count'), 'saves': j.get('save_count'), 'dur': j.get('duration'),
                       'desc': (j.get('description') or j.get('title') or '')[:600], 'ts': j.get('timestamp'),
                       'track': j.get('track') or '', 'followers': j.get('channel_follower_count')}
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                n += 1
                if n % 5 == 0:
                    write_json(outj, {'status': 'downloading', 'p': 0, 'msg': '%s: %d vídeos leídos' % (acc or 'enlaces', len(done))})
        err = (p.stderr.read() or b'').decode('utf-8', 'ignore')
        p.wait()
        return n, err

    # enlaces de vídeos sueltos: todos de una vez (la cuenta sale de cada vídeo)
    vids = [a for a in accs if re.search(r'/(video|photo)/\d+', a)]
    accs = [a for a in accs if a not in vids]
    if vids:
        bf = os.path.join(pdir, rid + '.links.txt')
        with open(bf, 'w', encoding='utf-8') as f:
            f.write('\n'.join(vids))
        log('📊 Leyendo %d enlaces de vídeos…' % len(vids))
        write_json(outj, {'status': 'downloading', 'p': 0, 'msg': 'Leyendo %d enlaces de vídeos…' % len(vids)})
        done = set()
        base = [PY, '-m', 'yt_dlp', '-j', '--skip-download', '--ignore-errors', '--no-warnings', '--sleep-requests', '0.7']
        k, err = run(base + ['--impersonate', 'chrome', '-a', bf], None, done)
        if k < len(vids) * 0.5:
            k2, err = run(base + ['-a', bf], None, done); k += k2
        total += k
        if len(done) < len(vids):
            errs['enlaces'] = '%d de %d enlaces no se pudieron leer (borrados, privados o TikTok los bloqueó)' % (len(vids) - len(done), len(vids))
        log('   %d de %d enlaces leídos' % (len(done), len(vids)))
    for i, a in enumerate(accs):
        if os.path.exists(stopf):
            break
        acc = a.lstrip('@').split('/')[-1] if not a.startswith('http') else a
        write_json(outj, {'status': 'downloading', 'p': i / max(1, len(accs)), 'msg': 'Leyendo %s (%d de %d)…' % (a, i + 1, len(accs))})
        log('📊 Leyendo los vídeos de %s…' % a)
        base = [PY, '-m', 'yt_dlp', '-j', '--skip-download', '--ignore-errors', '--no-warnings', '--playlist-end', str(maxn), '--sleep-requests', '0.7']
        done = set()
        n, err = 0, ''
        for extra in ([['--impersonate', 'chrome'], []] + ([['--cookies', ck]] if os.path.exists(ck) else []) +
                      [['--cookies-from-browser', b] for b in ('firefox', 'edge', 'chrome')]):
            k, err = run(base + extra + [url_of(a)], acc, done)
            n += k
            if n >= maxn * 0.9 or k >= 60 or os.path.exists(stopf):   # pasa de 50: TikTok ya da la lista entera, no hace falta probar más
                break
            if n:   # TikTok sin sesión suele cortar en ~50: pruebo con la sesión de tu navegador para sacar más
                log('   %s: %d vídeos, pruebo a sacar más con tu sesión del navegador…' % (a, n))
        total += n
        if not n:
            errs[a] = (err.strip().splitlines() or ['no devuelve vídeos'])[-1][-300:]
            log('   No pude leer %s: %s' % (a, errs[a]))
        else:
            log('   %s: %d vídeos' % (a, n))
    write_json(outj, {'status': 'done', 'p': 1, 'file': 'descargas/perfiles/' + rid + '.jsonl', 'n': total, 'errors': errs})


def kick_clip_download(url, base, outj, st):
    """Clips de Kick: se piden directamente a la API de Kick (más fiable que yt-dlp, que se rompe a menudo con Kick)."""
    m = re.search(r'(clip_[A-Za-z0-9]+)', url)
    if not m:
        return None
    cid = m.group(1)
    j = http_json('https://kick.com/api/v2/clips/' + cid) or http_json('https://kick.com/api/v1/clips/' + cid) or {}
    c = j.get('clip') if isinstance(j.get('clip'), dict) else j
    if not isinstance(c, dict):
        log('   Kick no me da los datos del clip %s' % cid)
        return None
    srcs = [c.get(k) for k in ('video_url', 'clip_url', 'source', 'url') if isinstance(c.get(k), str) and c.get(k).startswith('http')]
    if not srcs:
        log('   El clip %s no trae enlace de vídeo (claves: %s)' % (cid, ', '.join(list(c.keys())[:15])))
        return None
    out = base + '.mp4'
    for src in srcs:
        st.update({'status': 'downloading', 'p': 0.1}); write_json(outj, st)
        cc = [FF, '-y', '-v', 'error', '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
              '-headers', 'Referer: https://kick.com/\r\nOrigin: https://kick.com\r\n', '-i', src, '-c', 'copy']
        if '.m3u8' in src:
            cc += ['-bsf:a', 'aac_adtstoasc']
        cc += ['-movflags', '+faststart', out]
        r = subprocess.run(cc, capture_output=True, creationflags=NOWIN)
        if os.path.exists(out) and os.path.getsize(out) > 10000:
            return {'file': out, 'title': c.get('title') or '', 'dur': c.get('duration'),
                    'uploader': ((c.get('channel') or {}).get('username') if isinstance(c.get('channel'), dict) else '') or ''}
        log('   No pude bajar %s: %s' % (src[:80], (r.stderr or b'').decode('utf-8', 'ignore')[-200:]))
        try: os.remove(out)
        except Exception: pass
    return None


def download_one(rid, q):
    outj = os.path.join(DL, 'out', rid + '.json')
    url = str(q.get('url') or '').strip()
    st = {'status': 'start', 'p': 0, 'url': url}
    write_json(outj, st)
    log('🔗 Descargando %s' % url)
    base = os.path.join(DL, rid)
    cmd = [PY, '-m', 'yt_dlp', '--newline', '--no-playlist', '--no-part', '--ffmpeg-location', FF, '--impersonate', 'chrome',
           '-f', ('b[height<=576][ext=mp4]/bv*[height<=576]+ba/b[height<=720]/worst' if q.get('low') else 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b'),
           '--merge-output-format', 'mp4', '--write-info-json', '-o', base + '.%(ext)s']
    if q.get('subs'):   # subtítulos automáticos de TikTok/YouTube (transcripción gratis)
        cmd += ['--write-subs', '--write-auto-subs', '--sub-langs', 'all,-live_chat', '--sub-format', 'vtt/srt/best']
    d = deno_path() if re.search(r'youtu\.?be', url) else None
    if d:
        cmd += ['--js-runtimes', 'deno:' + d]
    a, b = hms(q.get('from')), hms(q.get('to'))
    if a is not None or b is not None:
        cmd += ['--download-sections', '*%s-%s' % (a or 0, b if b is not None else 'inf')]
    cmd.append(url)
    if re.search(r'kick\.com', url, re.I) and 'clip_' in url and a is None and b is None:
        try:
            k = kick_clip_download(url, base, outj, st)
        except Exception as e:
            k = None; log('   Fallo con el clip de Kick: %s' % e)
        if k:
            write_json(outj, {'status': 'done', 'p': 1, 'file': 'descargas/' + os.path.basename(k['file']), 'title': k['title'],
                              'uploader': k['uploader'], 'dur': k['dur'], 'url': url})
            log('✅ Clip de Kick descargado: %s' % (k['title'] or os.path.basename(k['file'])))
            return
        log('   Pruebo con yt-dlp…')

    def go(c):
        p = subprocess.Popen(c, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, creationflags=NOWIN)
        job_add(p)
        tail, last = [], 0
        for raw in iter(p.stdout.readline, b''):
            line = raw.decode('utf-8', 'ignore').strip()
            if not line:
                continue
            tail = (tail + [line])[-6:]
            m = re.search(r'\[download\]\s+([\d.]+)%', line)
            if m and time.time() - last > 1:
                last = time.time()
                st.update({'status': 'downloading', 'p': round(float(m.group(1)) / 100, 3)})
                write_json(outj, st)
        p.wait()
        return p.returncode, tail
    code, tail = go(cmd)
    if code != 0 and '--impersonate' in cmd and any('impersonat' in t.lower() for t in tail):
        i = cmd.index('--impersonate')
        code, tail = go(cmd[:i] + cmd[i + 2:])
    vids = lambda: [x for x in glob.glob(base + '.*') if x.endswith(('.mp4', '.mkv', '.webm', '.mov'))]

    def clean():
        for x in glob.glob(base + '.*'):
            try: os.remove(x)
            except Exception: pass
    need_auth = lambda t: any(k in ' '.join(t).lower() for k in ('cookies', 'sign in', 'not a bot', 'login', 'confirm your age'))
    extra = []
    if code != 0 and need_auth(tail):
        # YouTube pide "demostrar que no eres un bot": pruebo otras formas de entrar
        ck = os.path.join(BASE, 'cookies.txt')
        tries = ([['--cookies', ck]] if os.path.exists(ck) else []) + \
                [['--extractor-args', 'youtube:player_client=tv_simply,mweb,web_safari']] + \
                [['--cookies-from-browser', b] for b in ('firefox', 'edge', 'chrome', 'brave', 'opera')]
        for x in tries:
            clean()
            log('   YouTube pide verificación: pruebo de otra forma (%s)…' % (os.path.basename(x[1]) if x[0] == '--cookies' else x[1].split('=')[-1]))
            c, t = go(cmd[:-1] + x + [cmd[-1]])
            if c == 0 and vids():
                code, tail, extra = c, t, x
                break
        else:
            clean()
            msg = ('YouTube pide iniciar sesión para este vídeo. Guarda tus cookies de YouTube como «cookies.txt» '
                   'dentro de la carpeta del grabador y vuelve a intentarlo (Claude te explica cómo).')
            write_json(outj, {'status': 'error', 'error': msg, 'auth': True, 'url': url})
            log('🔒 ' + msg)
            return
    mp4 = next(iter(vids()), None)
    if '--download-sections' in cmd and (code != 0 or not mp4 or os.path.getsize(mp4) < 200000):
        # el trozo salio vacio: bajo el video entero y lo corto yo con ffmpeg
        for x in vids():
            try: os.remove(x)
            except Exception: pass
        i = cmd.index('--download-sections')
        c2 = cmd[:i] + cmd[i + 2:]
        c2 = c2[:-1] + extra + [c2[-1]]
        code, tail = go(c2)
        if code != 0 and '--impersonate' in c2:
            j = c2.index('--impersonate')
            code, tail = go(c2[:j] + c2[j + 2:])
        full = next(iter(vids()), None)
        if code == 0 and full:
            cut_to = base + '_t.mp4'
            cc = [FF, '-y', '-v', 'error', '-ss', str(a or 0), '-i', full]
            if b is not None:
                cc += ['-t', str(b - (a or 0))]
            cc += ['-c', 'copy', '-avoid_negative_ts', 'make_zero', cut_to]
            subprocess.run(cc, creationflags=NOWIN)
            if os.path.exists(cut_to) and os.path.getsize(cut_to) > 10000:
                os.remove(full)
                os.replace(cut_to, base + '.mp4')
        mp4 = next(iter(vids()), None)
    info = {}
    try:
        with open(base + '.info.json', encoding='utf-8') as f:
            info = json.load(f)
    except Exception:
        pass
    if code != 0 or not mp4:
        err = ' '.join(t for t in tail if 'ERROR' in t) or (tail[-1] if tail else 'error')
        write_json(outj, {'status': 'error', 'error': err[-400:], 'url': url})
        log('No pude descargar el enlace: %s' % err[-200:])
        return
    subs = ['descargas/' + os.path.basename(x) for x in glob.glob(base + '.*') if x.endswith(('.vtt', '.srt'))]
    write_json(outj, {'status': 'done', 'p': 1, 'file': 'descargas/' + os.path.basename(mp4), 'subs': subs, 'title': info.get('title') or '',
                      'uploader': info.get('uploader') or info.get('channel') or '', 'dur': info.get('duration'), 'url': url})
    log('✅ Descargado: %s' % (info.get('title') or os.path.basename(mp4)))


def downloads_loop():
    for d in ('req', 'out'):
        os.makedirs(os.path.join(DL, d), exist_ok=True)
    busy = set()
    while True:
        write_json(os.path.join(DL, 'vivo.json'), {'t': time.time(), 'v': GRABADOR_VERSION})
        for rq in glob.glob(os.path.join(DL, 'req', '*.json')):
            rid = os.path.basename(rq)[:-5]
            if rid in busy or os.path.exists(os.path.join(DL, 'out', rid + '.json')):
                continue
            busy.add(rid)
            try:
                with open(rq, encoding='utf-8') as f:
                    q = json.load(f)
            except Exception:
                continue

            def run_dl(r=rid, qq=q):
                try:
                    (perfil_one if qq.get('kind') == 'perfil' else download_one)(r, qq)
                except Exception as e:
                    write_json(os.path.join(DL, 'out', r + '.json'), {'status': 'error', 'error': str(e)})
            threading.Thread(target=run_dl, daemon=True).start()
        time.sleep(1)


# ---------------------------------------------------------------- directos de Kick para la pantalla «¿A quién clipeas hoy?»
# Clipzi deja una petición en kick/req/<id>.json y aquí se contesta en kick/out/<id>.json:
#   {"kind": "live"}                     los directos en español con más espectadores
#   {"kind": "canales", "slugs": [...]}  si tus canales están en directo
#   {"kind": "buscar", "q": "west"}      canales que se llaman así (en directo o no)
KJ = os.path.join(BASE, 'kick')
_kcache = {}


def _kget(url, ttl):
    now = time.time(); c = _kcache.get(url)
    if c and now - c[0] < ttl:
        return c[1]
    j = http_json(url, timeout=15)
    if j is not None:
        _kcache[url] = (now, j)
    elif c:
        return c[1]
    return j


def _kpic(x):
    if isinstance(x, dict):
        return x.get('src') or x.get('url') or x.get('responsive') or ''
    return x or ''


def _knorm(it):
    """Un directo o un canal de Kick, venga del listado, de la búsqueda o de la ficha del canal."""
    if not isinstance(it, dict):
        return None
    ch = it.get('channel') if isinstance(it.get('channel'), dict) else {}
    ls = it.get('livestream') if isinstance(it.get('livestream'), dict) else None
    user = ch.get('user') or it.get('user') or {}
    slug = (ch.get('slug') or it.get('slug') or user.get('username') or '').lower()
    if not slug:
        return None
    src = ls or it
    live = bool(ls and (ls.get('is_live', True))) if ls is not None else bool(it.get('is_live', it.get('viewer_count') is not None))
    if ls is None and 'is_live' in it:
        live = bool(it.get('is_live'))
    cats = src.get('categories') or ([src.get('category')] if src.get('category') else [])
    cat = (cats[0] or {}).get('name', '') if cats and isinstance(cats[0], dict) else ''
    return {
        'slug': slug,
        'name': user.get('username') or ch.get('username') or it.get('username') or slug,
        'avatar': _kpic(user.get('profile_pic') or user.get('profilepic') or it.get('profile_pic') or ch.get('profile_pic')),
        'live': live,
        'title': (src.get('session_title') or src.get('title') or '')[:160] if live else '',
        'viewers': int(src.get('viewer_count') or src.get('viewers') or 0) if live else 0,
        'started': src.get('start_time') or src.get('created_at') or '' if live else '',
        'thumb': _kpic(src.get('thumbnail')) if live else '',
        'cat': cat if live else '',
        'lang': src.get('language') or '',
    }


def kick_live_list():
    out, seen = [], set()
    for url in ('https://kick.com/stream/livestreams/es?page=1&limit=48&subcategory=&sort=desc',
                'https://kick.com/stream/featured-livestreams/es'):
        j = _kget(url, 45)
        data = j.get('data') if isinstance(j, dict) else (j if isinstance(j, list) else None)
        for it in data or []:
            n = _knorm(it)
            if n and n['slug'] not in seen:
                n['live'] = True; seen.add(n['slug']); out.append(n)
        if len(out) >= 12:
            break
    out.sort(key=lambda x: -x['viewers'])
    return out


def kick_channel(slug):
    j = _kget('https://kick.com/api/v2/channels/%s' % slug, 25)
    if not isinstance(j, dict) or not j.get('slug'):
        return None
    n = _knorm(j)
    if n:
        n['live'] = bool(j.get('livestream') and j['livestream'].get('is_live', True))
        if not n['live']:
            for k in ('title', 'thumb', 'cat', 'started'):
                n[k] = ''
            n['viewers'] = 0
    return n


def kick_search(q):
    q = (q or '').strip().lower()
    slug = re.sub(r'^https?://(www\.)?kick\.com/', '', q).split('/')[0].split('?')[0].lstrip('@')
    res, seen = [], set()

    def add(n):
        if n and n['slug'] not in seen:
            seen.add(n['slug']); res.append(n)
    if re.match(r'^[a-z0-9_\-]{2,30}$', slug):
        add(kick_channel(slug))
    for url in ('https://kick.com/api/search?searched_word=%s' % slug,):
        j = _kget(url, 60)
        for it in ((j or {}).get('channels') or []) if isinstance(j, dict) else []:
            add(_knorm(it))
    for n in kick_live_list():
        if slug and (slug in n['slug'] or slug in n['name'].lower()):
            add(n)
    res.sort(key=lambda x: (not x['live'], x['slug'] != slug, -x['viewers']))
    return res[:12]


def kick_loop():
    for d in ('req', 'out'):
        os.makedirs(os.path.join(KJ, d), exist_ok=True)
    busy = set()
    while True:
        write_json(os.path.join(KJ, 'vivo.json'), {'t': time.time(), 'v': GRABADOR_VERSION})
        now = time.time()
        for o in glob.glob(os.path.join(KJ, 'out', '*.json')):   # respuestas que nadie recogió
            try:
                if now - os.path.getmtime(o) > 120:
                    os.remove(o)
            except Exception:
                pass
        for rq in glob.glob(os.path.join(KJ, 'req', '*.json')):
            rid = os.path.basename(rq)[:-5]
            if rid in busy:
                continue
            busy.add(rid)
            try:
                with open(rq, encoding='utf-8') as f:
                    q = json.load(f)
            except Exception:
                busy.discard(rid); continue

            def answer(r=rid, qq=q, path=rq):
                try:
                    k = qq.get('kind')
                    if k == 'live':
                        res = {'status': 'done', 'items': kick_live_list()}
                    elif k == 'canales':
                        res = {'status': 'done', 'items': [x for x in (kick_channel(str(s).lower()) for s in (qq.get('slugs') or [])[:20]) if x]}
                    elif k == 'buscar':
                        res = {'status': 'done', 'items': kick_search(qq.get('q'))}
                    else:
                        res = {'status': 'error', 'error': 'no sé hacer «%s»' % k}
                except Exception as e:
                    res = {'status': 'error', 'error': str(e)}
                write_json(os.path.join(KJ, 'out', r + '.json'), res)
                try:
                    os.remove(path)
                except Exception:
                    pass
                busy.discard(r)
            threading.Thread(target=answer, daemon=True).start()
        time.sleep(0.25)


# ---------------------------------------------------------------- aislar la voz (lo pide Clipzi cuando el navegador no tiene tarjeta gráfica)
VOZ = os.path.join(BASE, 'voz')
VOZ_MODEL = os.path.join(BASE, 'modelos', 'UVR-MDX-NET-Voc_FT.onnx')
VOZ_URL = 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR-MDX-NET-Voc_FT.onnx'
_voz = {}


def voz_session():
    if 'sess' in _voz:
        return _voz['sess']
    import onnxruntime as ort
    if not os.path.exists(VOZ_MODEL) or os.path.getsize(VOZ_MODEL) < 1e7:
        os.makedirs(os.path.dirname(VOZ_MODEL), exist_ok=True)
        log('🎙️ Descargando la IA de voz (66 MB, solo la primera vez)…')
        import urllib.request
        tmp = VOZ_MODEL + '.part'
        urllib.request.urlretrieve(VOZ_URL, tmp)
        os.replace(tmp, VOZ_MODEL)
    av = ort.get_available_providers()
    sess = None
    for provs in (['DmlExecutionProvider', 'CPUExecutionProvider'], ['CUDAExecutionProvider', 'CPUExecutionProvider'], ['CPUExecutionProvider']):
        if provs[0] not in av:
            continue
        try:
            sess = ort.InferenceSession(VOZ_MODEL, providers=provs)
            _voz['how'] = 'tarjeta gráfica' if provs[0] != 'CPUExecutionProvider' else 'procesador'
            break
        except Exception as e:
            log('   (la IA de voz no arrancó con %s: %s)' % (provs[0], str(e)[:120]))
    if sess is None:
        raise RuntimeError('no se pudo arrancar la IA de voz')
    _voz['sess'] = sess
    return sess


def voz_separate(mix, sess, prog=None):
    """mix: array (2, n) a 44,1 kHz → voz (2, n). Mismo método que Clipzi en el navegador (MDX-Net)."""
    import numpy as np
    N, HOP, F, T, COMP = 7680, 1024, 3072, 256, 1.021
    CH = HOP * (T - 1); TRIM = N // 2; GEN = CH - 2 * TRIM
    win = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N) / N)
    idx = np.arange(T)[:, None] * HOP + np.arange(N)[None, :]
    env = np.zeros(CH + N)
    for t in range(T):
        env[t * HOP:t * HOP + N] += win ** 2
    env = np.maximum(env[N // 2:N // 2 + CH], 1e-8)
    n = mix.shape[1]; pad = GEN - n % GEN
    mp = np.concatenate([np.zeros((2, TRIM)), mix, np.zeros((2, pad)), np.zeros((2, TRIM))], 1)
    out = np.zeros((2, n + pad), dtype=np.float32)
    steps = (n + pad) // GEN
    for s, i in enumerate(range(0, n + pad, GEN)):
        w = mp[:, i:i + CH]
        spec = []
        for c in range(2):
            x = np.pad(w[c], (N // 2, N // 2), mode='reflect')
            spec.append(np.fft.rfft(x[idx] * win, axis=1).T[:F])
        inp = np.stack([spec[0].real, spec[0].imag, spec[1].real, spec[1].imag]).astype(np.float32)[None]
        o = sess.run(None, {sess.get_inputs()[0].name: inp})[0][0]
        for c in range(2):
            X = np.zeros((N // 2 + 1, T), dtype=complex); X[:F] = o[2 * c] + 1j * o[2 * c + 1]
            fr = np.fft.irfft(X.T, n=N, axis=1) * win
            acc = np.zeros(CH + N)
            np.add.at(acc, idx, fr)
            y = acc[N // 2:N // 2 + CH] / env
            out[c, i:i + GEN] = y[TRIM:CH - TRIM] * COMP
        if prog:
            prog((s + 1) / steps)
    return out[:, :n]


def wav_read16(path):
    import wave, numpy as np
    with wave.open(path, 'rb') as w:
        ch, rate, n = w.getnchannels(), w.getframerate(), w.getnframes()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    a = a.reshape(-1, ch).T
    if ch == 1:
        a = np.vstack([a, a])
    return a[:2], rate


def wav_write16(path, a, rate):
    import wave, numpy as np
    x = (np.clip(a.T, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(rate); w.writeframes(x.tobytes())


def voz_one(rid, q):
    outj = os.path.join(VOZ, 'out', rid + '.json')
    write_json(outj, {'status': 'working', 'p': 0})
    try:
        sess = voz_session()
        mix, rate = wav_read16(os.path.join(VOZ, 'req', q.get('wav') or rid + '.wav'))
        log('🎙️ Aislando la voz (%.0f s de audio, con %s)…' % (mix.shape[1] / rate, _voz.get('how', '')))
        last = [0]

        def prog(p):
            if time.time() - last[0] > 1:
                last[0] = time.time()
                write_json(outj, {'status': 'working', 'p': round(p, 3), 'how': _voz.get('how', '')})
        voc = voz_separate(mix.astype('float64'), sess, prog)
        wav_write16(os.path.join(VOZ, 'out', rid + '.wav'), voc, rate)
        write_json(outj, {'status': 'done', 'p': 1, 'file': 'voz/out/' + rid + '.wav', 'how': _voz.get('how', '')})
        log('✅ Voz aislada')
    except ImportError:
        write_json(outj, {'status': 'error', 'error': 'Falta la IA de voz en el grabador: cierra su ventana y vuelve a abrir «Grabador Clipzi.bat» para que se instale.'})
    except Exception as e:
        write_json(outj, {'status': 'error', 'error': str(e)[:300]})
        log('No pude aislar la voz: %s' % str(e)[:200])
    for f in (os.path.join(VOZ, 'req', rid + '.json'), os.path.join(VOZ, 'req', q.get('wav') or rid + '.wav')):
        try:
            os.remove(f)
        except Exception:
            pass


def voz_loop():
    for d in ('req', 'out'):
        os.makedirs(os.path.join(VOZ, d), exist_ok=True)
    while True:
        for rq in sorted(glob.glob(os.path.join(VOZ, 'req', '*.json'))):
            rid = os.path.basename(rq)[:-5]
            if os.path.exists(os.path.join(VOZ, 'out', rid + '.json')):
                continue
            try:
                with open(rq, encoding='utf-8') as f:
                    q = json.load(f)
            except Exception:
                continue
            voz_one(rid, q)   # de uno en uno: la IA usa mucha memoria
        time.sleep(1)


# ---------------------------------------------------------------- pasar un clip de Cortex a CapCut
CCJ = os.path.join(BASE, 'capcut')
FUENTES = os.path.join(BASE, 'fuentes')
CC_WEIGHT = {'100': ['thin'], '200': ['extralight', 'ultralight'], '300': ['light'], '400': ['regular', 'book', 'normal', ''], '500': ['medium'],
             '600': ['semibold', 'demibold'], '700': ['bold'], '800': ['extrabold', 'ultrabold', 'heavy'], '900': ['black', 'heavy']}


def cc_root():
    la = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), 'AppData', 'Local')
    return os.path.join(la, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft')


def cc_font(spec):
    """Devuelve un archivo de letra (.ttf/.otf) para «Familia|peso»: primero las del ordenador, si no, se descarga gratis."""
    fam, _, wt = (spec or 'Inter|700').partition('|')
    wt = wt or '400'
    key = re.sub(r'[^a-z0-9]', '', fam.lower())
    words = CC_WEIGHT.get(wt, [''])
    dirs = [os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts'), os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts'), FUENTES]
    best = None
    for d in dirs:
        try:
            names = os.listdir(d)
        except Exception:
            continue
        for n in names:
            if not n.lower().endswith(('.ttf', '.otf')):
                continue
            k = re.sub(r'[^a-z0-9]', '', n.lower().rsplit('.', 1)[0])
            if not k.startswith(key):
                continue
            rest = k[len(key):].replace('display', '').replace('text', '').replace('regular', '' if wt != '400' else 'regular')
            score = 3 if any(w and rest.startswith(w) for w in words) else (2 if wt == '400' and rest in ('', 'regular') else (1 if not rest else 0))
            if 'italic' in rest:
                score -= 2
            if score > 0 and (not best or score > best[0]):
                best = (score, os.path.join(d, n))
    if best and best[0] >= 2:
        return best[1].replace('\\', '/')
    os.makedirs(FUENTES, exist_ok=True)
    slug = re.sub(r'[^a-z0-9]+', '-', fam.lower()).strip('-')
    dst = os.path.join(FUENTES, '%s-%s.ttf' % (slug, wt))
    if os.path.exists(dst) and os.path.getsize(dst) > 1000:
        return dst.replace('\\', '/')
    import urllib.request
    for w in (wt, '400'):
        url = 'https://cdn.jsdelivr.net/fontsource/fonts/%s@latest/latin-%s-normal.ttf' % (slug, w)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            if len(data) > 1000:
                with open(dst, 'wb') as f:
                    f.write(data)
                log('🔤 Letra descargada para CapCut: %s %s' % (fam, w))
                return dst.replace('\\', '/')
        except Exception:
            pass
    return best[1].replace('\\', '/') if best else ''


def cc_running():
    if not WIN:
        return False
    try:
        out = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq CapCut.exe'], capture_output=True, text=True, timeout=10, creationflags=NOWIN).stdout
        return 'capcut.exe' in out.lower()
    except Exception:
        return False


def cc_one(rid, q):
    outj = os.path.join(CCJ, 'out', rid + '.json')
    job = os.path.join(CCJ, rid)
    write_json(outj, {'status': 'working', 'msg': 'Creando el proyecto en CapCut…'})
    try:
        root = cc_root()
        if not os.path.isdir(root):
            raise Exception('No encuentro CapCut en este ordenador (falta la carpeta de proyectos). Ábrelo una vez y vuelve a probar.')
        with open(os.path.join(job, 'draft.json'), encoding='utf-8') as f:
            raw = f.read()
        base = re.sub(r'[\\/:*?"<>|]+', ' ', q.get('name') or 'Clip de Cortex').strip()[:60] or 'Clip de Cortex'
        name, i = base, 2
        while os.path.exists(os.path.join(root, name)):
            name = '%s (%d)' % (base, i)
            i += 1
        ddir = os.path.join(root, name)
        dpath = ddir.replace('\\', '/')
        os.makedirs(os.path.join(ddir, 'cortex'), exist_ok=True)
        # el vídeo, la imagen, el logo y la música, dentro del proyecto
        for fm in q.get('files') or []:
            src = os.path.join(job, fm['name'])
            if os.path.exists(src):
                shutil.move(src, os.path.join(ddir, 'cortex', fm['name']))
        # letras
        for spec in q.get('fonts') or []:
            write_json(outj, {'status': 'working', 'msg': 'Buscando la letra %s…' % spec.split('|')[0]})
            path = cc_font(spec)
            raw = raw.replace('__CXFONT__%s__' % spec, path)
        raw = re.sub(r'__CXFONT__[^_]*?__', '', raw)
        raw = raw.replace('__CXDIR__', dpath)
        d = json.loads(raw)
        tid = d['id']
        now = int(time.time() * 1e6)
        d['create_time'] = int(time.time()); d['update_time'] = int(time.time())
        txt = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
        for pth in (os.path.join(ddir, 'draft_content.json'), os.path.join(ddir, 'Timelines', tid, 'draft_content.json')):
            os.makedirs(os.path.dirname(pth), exist_ok=True)
            with open(pth, 'w', encoding='utf-8') as f:
                f.write(txt)
        write_json(os.path.join(ddir, 'Timelines', 'project.json'), {'config': {'color_space': -1, 'hdr_vivid': False, 'mixed_track_mode_on': False, 'render_index_track_mode_on': False, 'use_float_render': False},
                   'create_time': now, 'id': str(uuid.uuid4()).upper(), 'main_timeline_id': tid,
                   'timelines': [{'create_time': now, 'id': tid, 'is_marked_delete': False, 'name': 'Línea de tiempo 01', 'update_time': now}], 'update_time': now, 'version': 0})
        write_json(os.path.join(ddir, 'timeline_layout.json'), {'dockItems': [{'dockIndex': 0, 'ratio': 1, 'timelineIds': [tid], 'timelineNames': ['Línea de tiempo 01']}], 'layoutOrientation': 1})
        write_json(os.path.join(ddir, 'draft_agency_config.json'), {'is_auto_agency_enabled': False, 'is_auto_agency_popup': False, 'is_single_agency_mode': False, 'marterials': None, 'use_converter': False, 'video_resolution': 720})
        # portada: un fotograma del clip
        clip = next((fm for fm in (q.get('files') or []) if fm.get('kind') == 'video'), None)
        if clip:
            try:
                run([ffmpeg_exe(), '-y', '-ss', '0.5', '-i', os.path.join(ddir, 'cortex', clip['name']), '-frames:v', '1', '-vf', 'scale=360:-2', os.path.join(ddir, 'draft_cover.jpg')], timeout=30)
            except Exception:
                pass
        mats = []
        for fm in q.get('files') or []:
            mats.append({'ai_group_type': '', 'create_time': int(time.time()), 'duration': int(fm.get('dur') or 5000000), 'enter_from': 0, 'extra_info': fm['name'],
                         'file_Path': dpath + '/cortex/' + fm['name'], 'height': int(fm.get('h') or 0), 'id': str(uuid.uuid4()), 'import_time': int(time.time()), 'import_time_ms': now,
                         'item_source': 1, 'material_color_tag': '', 'md5': '', 'metetype': fm.get('kind') or 'video',
                         'roughcut_time_range': {'duration': int(fm.get('dur') or -1), 'start': 0 if fm.get('dur') else -1}, 'sub_time_range': {'duration': -1, 'start': -1}, 'type': 0, 'width': int(fm.get('w') or 0)})
        did = str(uuid.uuid4()).upper()
        meta = {'cloud_draft_cover': False, 'cloud_draft_sync': False, 'cloud_package_completed_time': '', 'draft_cloud_capcut_purchase_info': '', 'draft_cloud_last_action_download': False,
                'draft_cloud_package_type': '', 'draft_cloud_purchase_info': '', 'draft_cloud_template_id': '', 'draft_cloud_tutorial_info': '', 'draft_cloud_videocut_purchase_info': '',
                'draft_cover': 'draft_cover.jpg', 'draft_deeplink_url': '', 'draft_enterprise_info': {'draft_enterprise_extra': '', 'draft_enterprise_id': '', 'draft_enterprise_name': '', 'enterprise_material': []},
                'draft_fold_path': dpath, 'draft_has_unfinished_aigc_video_effect': False, 'draft_id': did, 'draft_is_ae_produce': False, 'draft_is_ai_packaging_used': False, 'draft_is_ai_shorts': False,
                'draft_is_ai_translate': False, 'draft_is_article_video_draft': False, 'draft_is_cloud_temp_draft': False, 'draft_is_from_deeplink': 'false', 'draft_is_infinite_canvas_draft': False,
                'draft_is_invisible': False, 'draft_is_pippit_draft': False, 'draft_is_web_article_video': False,
                'draft_materials': [{'type': 0, 'value': mats}] + [{'type': t, 'value': []} for t in (1, 2, 3, 6, 7, 8)],
                'draft_materials_copied_info': [], 'draft_name': name, 'draft_need_rename_folder': False, 'draft_new_version': '', 'draft_removable_storage_device': '',
                'draft_root_path': root.replace('\\', '/'), 'draft_segment_extra_info': [], 'draft_timeline_materials_size_': 0, 'draft_type': '', 'draft_web_article_video_enter_from': '',
                'pippit_avatar_url': '', 'pippit_extra_info': '', 'pippit_id': '', 'pippit_user_name': '', 'tm_draft_cloud_completed': '', 'tm_draft_cloud_entry_id': -1, 'tm_draft_cloud_modified': 0,
                'tm_draft_cloud_parent_entry_id': -1, 'tm_draft_cloud_space_id': -1, 'tm_draft_cloud_user_id': -1, 'tm_draft_create': now, 'tm_draft_modified': now, 'tm_draft_removed': 0,
                'tm_duration': int(q.get('dur') or d.get('duration') or 0)}
        write_json(os.path.join(ddir, 'draft_meta_info.json'), meta)
        with open(os.path.join(ddir, 'draft_settings'), 'w', encoding='utf-8') as f:
            f.write('[General]\ndraft_create_time=%d\ndraft_last_edit_time=%d\nreal_edit_seconds=0\nreal_edit_keys=0\ncloud_last_modify_platform=windows\n' % (int(time.time()), int(time.time())))
        # que salga en la pantalla de inicio de CapCut
        rm = os.path.join(root, 'root_meta_info.json')
        try:
            with open(rm, encoding='utf-8') as f:
                R = json.load(f)
        except Exception:
            R = {'all_draft_store': [], 'draft_ids': 0, 'root_path': root.replace('\\', '/')}
        try:
            shutil.copy(rm, rm + '.cortex.bak')
        except Exception:
            pass
        entry = {k: meta[k] for k in ('cloud_draft_cover', 'cloud_draft_sync', 'draft_cloud_last_action_download', 'draft_cloud_purchase_info', 'draft_cloud_template_id', 'draft_cloud_tutorial_info',
                                      'draft_cloud_videocut_purchase_info', 'draft_fold_path', 'draft_id', 'draft_is_ai_shorts', 'draft_is_cloud_temp_draft', 'draft_is_infinite_canvas_draft',
                                      'draft_is_invisible', 'draft_is_pippit_draft', 'draft_is_web_article_video', 'draft_name', 'draft_new_version', 'draft_root_path', 'draft_type',
                                      'draft_web_article_video_enter_from', 'pippit_avatar_url', 'pippit_extra_info', 'pippit_id', 'pippit_user_name', 'tm_draft_cloud_completed',
                                      'tm_draft_cloud_entry_id', 'tm_draft_cloud_modified', 'tm_draft_cloud_parent_entry_id', 'tm_draft_cloud_space_id', 'tm_draft_cloud_user_id',
                                      'tm_draft_create', 'tm_draft_modified', 'tm_draft_removed', 'tm_duration')}
        entry.update({'draft_cover': dpath + '\\draft_cover.jpg', 'draft_json_file': dpath + '\\draft_content.json', 'draft_timeline_materials_size': 0, 'streaming_edit_draft_ready': True})
        R.setdefault('all_draft_store', []).insert(0, entry)
        if isinstance(R.get('draft_ids'), int):
            R['draft_ids'] += 1
        write_json(rm, R)
        write_json(outj, {'status': 'done', 'name': name, 'path': dpath, 'running': cc_running()})
        log('🎬 Proyecto de CapCut creado: %s' % name)
    except Exception as e:
        write_json(outj, {'status': 'error', 'error': str(e)[:300]})
        log('No pude crear el proyecto de CapCut: %s' % str(e)[:200])
        traceback.print_exc()
    for f in (os.path.join(CCJ, 'req', rid + '.json'),):
        try:
            os.remove(f)
        except Exception:
            pass
    shutil.rmtree(job, ignore_errors=True)


# ---------------------------------------------------------------- limpiar lo que CapCut va dejando en el disco
# Archivos temporales de edición: CapCut los vuelve a crear solo cuando los necesita.
CC_TMP_SKIP = {'effect', 'artisteffect', 'onlinematerial', 'music', 'template', 'aetemplate', 'heycan', 'resourcepanel', 'fontimage',
               'aitexttemplate', 'aimusic', 'clouddraft'}
CC_LOGS = ('Log', 'VELog', 'Crash', 'Feedback', 'Tracking', 'ByteBench')


def cc_base():
    la = os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'), 'AppData', 'Local')
    return os.path.join(la, 'CapCut')


def _is_link(p):
    try:
        if os.path.islink(p):
            return True
        return bool(getattr(os.path, 'isjunction', lambda x: False)(p))
    except Exception:
        return True


def _tree_size(p):
    n = b = 0
    try:
        if os.path.isfile(p):
            return 1, os.path.getsize(p)
        for root, dirs, files in os.walk(p, followlinks=False):
            dirs[:] = [d for d in dirs if not _is_link(os.path.join(root, d))]
            for f in files:
                try:
                    b += os.path.getsize(os.path.join(root, f))
                    n += 1
                except Exception:
                    pass
    except Exception:
        pass
    return n, b


def _inside_capcut(p):
    try:
        base = os.path.normcase(os.path.realpath(cc_base()))
        q = os.path.normcase(os.path.realpath(p))
        return q != base and q.startswith(base + os.sep)
    except Exception:
        return False


def _wipe(p):
    """Borra un archivo o una carpeta entera (sin seguir accesos directos). Devuelve (bytes liberados, archivos que no se dejaron borrar)."""
    freed = locked = 0
    if not _inside_capcut(p) or _is_link(p):
        return 0, 0
    if os.path.isfile(p):
        try:
            sz = os.path.getsize(p)
            os.remove(p)
            return sz, 0
        except Exception:
            return 0, 1
    for root, dirs, files in os.walk(p, topdown=False, followlinks=False):
        for f in files:
            fp = os.path.join(root, f)
            try:
                sz = os.path.getsize(fp)
                try:
                    os.chmod(fp, 0o666)
                except Exception:
                    pass
                os.remove(fp)
                freed += sz
            except Exception:
                locked += 1
        for d in dirs:
            dp = os.path.join(root, d)
            try:
                if _is_link(dp):
                    os.unlink(dp)
                else:
                    os.rmdir(dp)
            except Exception:
                pass
    try:
        os.rmdir(p)
    except Exception:
        pass
    return freed, locked


def _to_recycle(p):
    """Manda una carpeta a la Papelera de reciclaje de Windows (se puede recuperar)."""
    if not WIN or not _inside_capcut(p):
        return False
    try:
        import ctypes
        from ctypes import wintypes

        class SHFILEOPSTRUCTW(ctypes.Structure):
            _fields_ = [('hwnd', wintypes.HWND), ('wFunc', wintypes.UINT), ('pFrom', wintypes.LPCWSTR), ('pTo', wintypes.LPCWSTR),
                        ('fFlags', ctypes.c_uint16), ('fAnyOperationsAborted', wintypes.BOOL), ('hNameMappings', ctypes.c_void_p), ('lpszProgressTitle', wintypes.LPCWSTR)]
        op = SHFILEOPSTRUCTW(None, 3, os.path.abspath(p) + '\0\0', None, 0x0040 | 0x0010 | 0x0004 | 0x0400, False, None, None)   # borrar · a la papelera · sin preguntar · sin ventanas
        return ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op)) == 0 and not os.path.exists(p)
    except Exception:
        return False


def _ver_key(name):
    return tuple(int(x) if x.isdigit() else 0 for x in name.split('.'))


def cc_groups(days=30):
    """Qué se puede borrar, por grupos: [{id, label, note, items:[(ruta, modo)], on}]. modo: 'wipe' (borrar) o 'bin' (a la papelera de Windows)."""
    base = cc_base()
    ud = os.path.join(base, 'User Data')
    cache = os.path.join(ud, 'Cache')
    drafts = os.path.join(ud, 'Projects', 'com.lveditor.draft')
    G = []

    def sub(d):
        try:
            return [os.path.join(d, n) for n in sorted(os.listdir(d))]
        except Exception:
            return []
    tmp = [p for p in sub(cache) if os.path.basename(p).strip().lower() not in CC_TMP_SKIP]
    dl = [p for p in sub(cache) if os.path.basename(p).strip().lower() in CC_TMP_SKIP]
    G.append({'id': 'tmp', 'label': 'Archivos temporales de edición', 'note': 'Vistas previas, miniaturas, ondas de audio y cálculos de la IA. CapCut los vuelve a crear solo.', 'on': True, 'items': [(p, 'wipe') for p in tmp]})
    G.append({'id': 'dl', 'label': 'Efectos, plantillas, música y letras descargados', 'note': 'Se vuelven a descargar de internet cuando abras un proyecto que los use.', 'on': True, 'items': [(p, 'wipe') for p in dl]})
    G.append({'id': 'log', 'label': 'Registros e informes de errores', 'note': 'Solo sirven a CapCut para diagnosticar fallos.', 'on': True,
              'items': [(os.path.join(ud, n), 'wipe') for n in CC_LOGS if os.path.isdir(os.path.join(ud, n))]})
    vers = [p for p in sub(os.path.join(base, 'Apps')) if os.path.isdir(p) and re.match(r'^\d+(\.\d+)+$', os.path.basename(p))]
    vers.sort(key=lambda p: _ver_key(os.path.basename(p)))
    # se conserva la más nueva que tiene el programa dentro (y cualquiera aún más nueva, por si es una actualización a medio bajar)
    full = [i for i, p in enumerate(vers) if os.path.exists(os.path.join(p, 'CapCut.exe'))]
    keep = full[-1] if full else len(vers)
    G.append({'id': 'old', 'label': 'Versiones antiguas del programa', 'note': 'Copias de CapCut de antes de actualizar. Se conserva la que usas ahora%s.' % (' (%s)' % os.path.basename(vers[keep]) if full else ''),
              'on': True, 'items': [(p, 'wipe') for p in vers[:keep]] if full else []})
    G.append({'id': 'bin', 'label': 'Papelera de CapCut', 'note': 'Proyectos que ya borraste dentro de CapCut y siguen ocupando sitio.', 'on': True, 'items': [(p, 'wipe') for p in sub(os.path.join(drafts, '.recycle_bin'))]})
    old = []
    lim = time.time() - max(1, int(days)) * 86400
    for p in sub(drafts):
        n = os.path.basename(p)
        if not os.path.isdir(p) or n.startswith('.') or _is_link(p):
            continue
        try:
            newest = max([os.path.getmtime(p)] + [os.path.getmtime(os.path.join(p, f)) for f in os.listdir(p) if f.lower().startswith('draft_')])
        except Exception:
            continue
        if newest < lim:
            old.append((p, 'bin'))
    G.append({'id': 'proj', 'label': 'Proyectos que no tocas desde hace más de %d días' % int(days), 'note': 'Van a la Papelera de reciclaje de Windows: si te equivocas, los puedes recuperar desde ahí.', 'on': False, 'items': old})
    return G


def cc_clean_one(rid, q):
    outj = os.path.join(CCJ, 'out', rid + '.json')
    op = q.get('op')
    try:
        if not os.path.isdir(cc_base()):
            raise Exception('No encuentro CapCut en este ordenador.')
        days = int(q.get('days') or 30)
        G = cc_groups(days)
        if op == 'cc_scan':
            write_json(outj, {'status': 'working', 'msg': 'Midiendo cuánto ocupa cada cosa…'})
            res = []
            for g in G:
                n = b = 0
                for p, _ in g['items']:
                    a, c = _tree_size(p)
                    n += a
                    b += c
                res.append({'id': g['id'], 'label': g['label'], 'note': g['note'], 'on': g['on'], 'files': n, 'bytes': b, 'count': len(g['items']),
                            'names': [os.path.basename(p) for p, _ in g['items']][:60] if g['id'] in ('proj', 'old') else []})
            write_json(outj, {'status': 'done', 'v': GRABADOR_VERSION, 'groups': res, 'running': cc_running(), 'days': days})
            return
        # borrar
        if cc_running():
            raise Exception('CapCut está abierto. Ciérralo del todo y vuelve a pulsar: con CapCut abierto no se pueden borrar sus archivos.')
        want = set(q.get('groups') or [])
        freed = locked = 0
        binned = []
        for g in G:
            if g['id'] not in want:
                continue
            write_json(outj, {'status': 'working', 'msg': 'Borrando: %s…' % g['label']})
            for p, mode in g['items']:
                if mode == 'bin':
                    _, b = _tree_size(p)
                    if _to_recycle(p):
                        freed += b
                        binned.append(os.path.basename(p))
                    else:
                        locked += 1
                else:
                    f, l = _wipe(p)
                    freed += f
                    locked += l
        if binned:      # que no queden en la pantalla de inicio de CapCut como proyectos rotos
            drafts = cc_root()
            rm = os.path.join(drafts, 'root_meta_info.json')
            try:
                with open(rm, encoding='utf-8') as f:
                    R = json.load(f)
                shutil.copy(rm, rm + '.cortex.bak')
                gone = set(x.lower() for x in binned)
                R['all_draft_store'] = [e for e in R.get('all_draft_store', []) if os.path.basename(str(e.get('draft_fold_path', '')).replace('/', '\\').rstrip('\\')).lower() not in gone]
                write_json(rm, R)
            except Exception:
                pass
        log('🧹 CapCut limpiado: %.1f GB liberados' % (freed / 1e9))
        write_json(outj, {'status': 'done', 'v': GRABADOR_VERSION, 'freed': freed, 'locked': locked, 'binned': len(binned)})
    except Exception as e:
        write_json(outj, {'status': 'error', 'error': str(e)[:300]})


def capcut_loop():
    for d in ('req', 'out'):
        os.makedirs(os.path.join(CCJ, d), exist_ok=True)
    while True:
        for rq in sorted(glob.glob(os.path.join(CCJ, 'req', '*.json'))):
            rid = os.path.basename(rq)[:-5]
            if os.path.exists(os.path.join(CCJ, 'out', rid + '.json')):
                continue
            try:
                with open(rq, encoding='utf-8') as f:
                    q = json.load(f)
            except Exception:
                continue
            if q.get('op') in ('cc_scan', 'cc_clean'):
                cc_clean_one(rid, q)
            else:
                cc_one(rid, q)
        # resultados viejos: fuera
        for o in glob.glob(os.path.join(CCJ, 'out', '*.json')):
            try:
                if time.time() - os.path.getmtime(o) > 3600:
                    os.remove(o)
            except Exception:
                pass
        time.sleep(1)


# ---------------------------------------------------------------- vigilar los canales
# ---------------------------------------------------------------- un solo grabador a la vez
# (si hay dos abiertos graban los mismos trozos a la vez y los clips salen rotos o en negro)
_SOLO_PORT = 47831
_SOLO_FLAG = os.path.join(BASE, 'cerrar_grabador.flag')

def _solo_bind():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', _SOLO_PORT)); s.listen(1); return s
    except OSError:
        s.close(); return None

def single_instance():
    s = _solo_bind()
    if s:
        return s
    log('Ya había otro grabador abierto: le pido que se cierre para quedarme solo yo (versión %d).' % GRABADOR_VERSION)
    try:
        with open(_SOLO_FLAG, 'w') as f:
            f.write(str(time.time()))
    except Exception:
        pass
    for _ in range(60):
        time.sleep(0.5)
        s = _solo_bind()
        if s:
            try: os.remove(_SOLO_FLAG)
            except Exception: pass
            log('El otro grabador se ha cerrado: sigo yo.')
            return s
    print()
    print('  Hay otro grabador abierto y no se cierra. Cierra todas las ventanas negras del grabador')
    print('  y vuelve a abrir «Grabador Clipzi.bat» (solo una vez).')
    try: input('  Pulsa Enter para salir...')
    except Exception: pass
    sys.exit(1)

def solo_watch(t0):
    """Si se abre otro grabador (por ejemplo, uno más nuevo), este se cierra solo."""
    while True:
        time.sleep(1)
        try:
            if os.path.exists(_SOLO_FLAG) and os.path.getmtime(_SOLO_FLAG) > t0:
                log('Se ha abierto otro grabador: cierro este para que no graben los dos a la vez.')
                time.sleep(0.3)
                os._exit(0)
        except Exception:
            pass


def main():
    os.makedirs(DIRS, exist_ok=True)
    test_mode = len(sys.argv) >= 3 and sys.argv[1] == '--prueba'
    if not test_mode:
        globals()['_SOLO_SOCK'] = single_instance()
        threading.Thread(target=solo_watch, args=(time.time(),), daemon=True).start()
    kill_old_ffmpeg()
    log_rotate()
    clean_all_out()   # copias de clips de sesiones anteriores: fuera, para liberar disco
    for fn in (downloads_loop, voz_loop, capcut_loop, disk_loop, kick_loop):   # si alguno falla, se vuelve a poner en marcha solo
        threading.Thread(target=forever(fn), daemon=True).start()
    print('=' * 60)
    print('  GRABADOR DE CLIPZI  (versión %d)' % GRABADOR_VERSION)
    print('  Deja esta ventana abierta mientras haya directos o descargues enlaces.')
    print('  Para pararlo: cierra la ventana.')
    print('=' * 60)
    test = None
    if len(sys.argv) >= 3 and sys.argv[1] == '--prueba':
        test = os.path.abspath(sys.argv[2])
        log('MODO PRUEBA con el vídeo', test)
    sessions = SESSIONS
    warned = False
    offline_said = {}
    while True:
        cfg = load_cfg()
        chans = [c for c in (cfg.get('canales') or []) if (c.get('kick') or '').strip()]
        if not chans and not warned:
            log('Aún no hay canales. En Clipzi, en cada cliente, pon su canal de Kick.')
            warned = True
        # los canales que ya no están en Clipzi se dejan de grabar
        want = set(c['kick'].strip().lower().lstrip('@') for c in chans)
        for slug, s in list(sessions.items()):
            if s.alive and slug not in want and not test:
                log('⏹ %s ya no está en tus clientes: dejo de grabarlo.' % slug)
                s.alive = False
                try:
                    if s.proc and s.proc.poll() is None:
                        s.proc.terminate()
                except Exception:
                    pass
                s.status()
        for ch in chans:
            slug = ch['kick'].strip().lower().lstrip('@')
            s = sessions.get(slug)
            if s and s.alive:
                s.cfg = ch
                offline_said[slug] = False
                continue
            if test:
                if s:
                    continue
                sessions[slug] = Session(ch, test)
                continue
            info = kick_info(slug)
            live = bool(info and info.get('livestream')) if info else None
            if live is None:               # Kick no responde: probar a sacar el vídeo directamente
                live = bool(kick_stream_url(slug))
            if live:
                sessions[slug] = Session(ch)
            elif offline_said.get(slug) is not True:
                offline_said[slug] = True
                log('⚫ %s no está en directo ahora. Espero (miro cada 30 s)…' % slug)
        if test and all(not s.alive for s in sessions.values()) and sessions:
            time.sleep(5)
        time.sleep(30)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass

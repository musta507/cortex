/* ---------- música: biblioteca guardada en el navegador ---------- */
const music = { lib: [], cur: null };   // cur: {id,name,blob,url,dur}
const db = {
  h: null,
  async open() {
    if (this.h) return this.h;
    this.h = await new Promise((res, rej) => {
@@solo-pc
      const r = indexedDB.open('clipzi', 2);
@@fin
@@solo-web
      const r = indexedDB.open('cortex-publico', 2);
@@fin
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('music')) d.createObjectStore('music', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.h;
  },
  async tx(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => { const t = d.transaction(store, mode); const st = t.objectStore(store); const out = fn(st); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  },
  all() { return this.tx('music', 'readonly', st => st.getAll()); },
  put(item) { return this.tx('music', 'readwrite', st => st.put(item)); },
  del(id) { return this.tx('music', 'readwrite', st => st.delete(id)); },
};
const isAudio = f => /^audio\//.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(f.name);
async function addMusicFiles(list) {
  const files = [...list].filter(isAudio);
  if (!files.length) { setStatus($('mStatus'), 'No he encontrado archivos de audio ahí.', 'err'); return; }
  let saved = 0, sessionOnly = 0;
  for (const f of files) {
    const item = { id: f.name + '|' + f.size, name: f.name.replace(/\.[^.]+$/, ''), blob: f };
    if (music.lib.some(x => x.id === item.id)) continue;
    try { await db.put(item); saved++; } catch { sessionOnly++; }
    music.lib.push(item);
  }
  music.lib.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  renderLib();
  setStatus($('mStatus'), sessionOnly
    ? `${files.length} canciones añadidas (este navegador no deja guardarlas: habrá que añadirlas otra vez la próxima vez).`
    : `${files.length} canciones en tu biblioteca.`, 'ok');
}
$('musicFolder').addEventListener('change', e => { addMusicFiles(e.target.files); e.target.value = ''; });
$('musicFiles').addEventListener('change', e => { addMusicFiles(e.target.files); e.target.value = ''; });
$('musicSearch').addEventListener('input', renderLib);

const prevAudio = new Audio(); let prevId = null;
prevAudio.addEventListener('ended', () => { prevId = null; renderLib(); });
function renderLib() {
  const box = $('lib'); box.innerHTML = '';
  const q = $('musicSearch').value.trim().toLowerCase();
  const items = music.lib.filter(x => !q || x.name.toLowerCase().includes(q));
  if (!music.lib.length) { box.innerHTML = '<p class="empty">Tu biblioteca está vacía. Añade tu carpeta de música.</p>'; return; }
  if (!items.length) { box.innerHTML = '<p class="empty">Ninguna canción coincide con la búsqueda.</p>'; return; }
  for (const it of items) {
    const row = document.createElement('div'); row.className = 'track' + (music.cur && music.cur.id === it.id ? ' sel' : '');
    const pb = document.createElement('button'); pb.textContent = prevId === it.id ? '❚❚' : '▶'; pb.title = 'Escuchar';
    pb.onclick = () => {
      if (prevId === it.id) { prevAudio.pause(); prevId = null; }
      else { prevAudio.src = URL.createObjectURL(it.blob); prevAudio.play(); prevId = it.id; }
      renderLib();
    };
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name; nm.title = it.name;
    const use = document.createElement('button'); use.textContent = music.cur && music.cur.id === it.id ? 'En uso' : 'Usar';
    use.onclick = () => selectMusic(it);
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = 'Quitar de la biblioteca';
    x.onclick = async () => {
      music.lib = music.lib.filter(m => m.id !== it.id); try { await db.del(it.id); } catch {}
      if (music.cur && music.cur.id === it.id) removeMusic();
      renderLib();
    };
    row.append(pb, nm, use, x); box.append(row);
  }
}
async function selectMusic(it, keep) {
  prevAudio.pause(); prevId = null;
  ensureAudio();
  const url = URL.createObjectURL(it.blob);
  musicEl.src = url;
  await new Promise(r => { musicEl.onloadedmetadata = r; musicEl.onerror = r; });
  music.cur = { ...it, url, dur: musicEl.duration || 0 };
  $('mStart').max = Math.max(0, Math.floor((music.cur.dur || 0) - 1));
  if (!keep) setRange('mStart', 0);
  $('musicOpts').hidden = false;
  $('s6').classList.add('done');
  setStatus($('mStatus'), `Usando «${it.name}» (${mmss(music.cur.dur)}).`, 'ok');
  syncMusic(!vid.paused);
  renderLib();
}
function removeMusic() {
  musicEl.pause(); music.cur = null; $('musicOpts').hidden = true; $('s6').classList.remove('done');
  setStatus($('mStatus'), ''); renderLib();
}
$('mRemove').onclick = removeMusic;
function musicLevel(t, dur) {
  const vol = +$('mVol').value / 100, fi = +$('mFadeIn').value, fo = +$('mFadeOut').value;
  let g = vol;
  if (fi > 0 && t < fi) g *= t / fi;
  if (fo > 0 && dur && t > dur - fo) g *= Math.max(0, (dur - t) / fo);
  return g;
}
function syncMusic(playing) {
  if (!music.cur) return;
  const start = +$('mStart').value, d = music.cur.dur || 1;
  let target = start + curT();
  musicEl.loop = $('mLoop').checked;
  if (target >= d) { if (musicEl.loop) target = target % d; else { musicEl.pause(); return; } }
  if (!(playing && !musicEl.paused && Math.abs(musicEl.currentTime - target) < 0.15)) musicEl.currentTime = target;   // en los cortes no se resincroniza si ya va bien
  if (playing) musicEl.play().catch(() => {}); else musicEl.pause();
}
['mStart', 'mLoop'].forEach(id => $(id).addEventListener('change', () => syncMusic(!vid.paused)));
async function restoreLib() {
  try { music.lib = (await db.all()) || []; music.lib.sort((a, b) => a.name.localeCompare(b.name, 'es')); } catch { music.lib = []; }
  renderLib();
}

